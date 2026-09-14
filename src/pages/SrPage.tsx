import { useMemo, useState } from 'react'
import './OciPolicyPage.css' // pol-* 프리미티브 공유
import './SrPage.css'
import { useSyncedJson, SYNC_LABEL } from '../lib/scheduleDb'

/* ── 데이터 모델 (blog-db sr/incidents.json) ── */
type SrSeverity = '1' | '2' | '3' | '4'
type SrStatus = 'open' | 'in-progress' | 'awaiting' | 'closed'
interface SrRecord {
  id: string
  customer: string
  srNumber: string
  title: string
  service?: string
  severity?: SrSeverity
  status?: SrStatus
  openedAt?: string
  updatedAt?: string
  csi?: string
  link?: string
  notes?: string
}
interface SrDb { incidents: SrRecord[] }
const EMPTY: SrDb = { incidents: [] }
const DB_PATH = 'sr/incidents.json'
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const SEV: Record<SrSeverity, { label: string; cls: string }> = {
  '1': { label: 'S1 · 최우선', cls: 's1' }, '2': { label: 'S2 · 중대', cls: 's2' },
  '3': { label: 'S3 · 경미', cls: 's3' }, '4': { label: 'S4 · 문의', cls: 's4' },
}
const STATUS: Record<SrStatus, { label: string; cls: string }> = {
  'open': { label: '접수', cls: 'open' }, 'in-progress': { label: '진행', cls: 'prog' },
  'awaiting': { label: '고객대기', cls: 'wait' }, 'closed': { label: '종료', cls: 'closed' },
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="bp-copy" onClick={e => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200) }) }}>{ok ? '복사됨 ✓' : '복사'}</button>
}

export default function SrPage() {
  const { data, update, sync, writable } = useSyncedJson<SrDb>(DB_PATH, EMPTY, 'sr: SR 목록 갱신')
  const incidents = useMemo(() => data.incidents ?? [], [data])
  const customers = useMemo(() => [...new Set(incidents.map(s => s.customer).filter(Boolean))].sort(), [incidents])

  const [q, setQ] = useState('')
  const [custFilter, setCustFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | SrStatus>('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return incidents.filter(s => {
      if (custFilter && s.customer !== custFilter) return false
      if (statusFilter === 'active' && s.status === 'closed') return false
      if (statusFilter && statusFilter !== 'active' && s.status !== statusFilter) return false
      if (!needle) return true
      return `${s.customer} ${s.srNumber} ${s.title} ${s.service || ''} ${s.notes || ''}`.toLowerCase().includes(needle)
    })
  }, [incidents, q, custFilter, statusFilter])

  // 고객별 그룹핑 (그룹 내 최신 접수 우선)
  const grouped = useMemo(() => {
    const map = new Map<string, SrRecord[]>()
    for (const s of filtered) { const k = s.customer || '(미지정)'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(s) }
    for (const arr of map.values()) arr.sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  /* 편집 폼 */
  const emptyDraft: SrRecord = { id: '', customer: '', srNumber: '', title: '', service: '', severity: '3', status: 'open', openedAt: '', csi: '', link: '', notes: '' }
  const [draft, setDraft] = useState<SrRecord>(emptyDraft)
  const [showForm, setShowForm] = useState(false)
  const openNew = () => { setDraft({ ...emptyDraft, customer: custFilter || '' }); setShowForm(true) }
  const openEdit = (s: SrRecord) => { setDraft({ ...emptyDraft, ...s }); setShowForm(true) }
  const set = (k: keyof SrRecord, v: string) => setDraft(d => ({ ...d, [k]: v }))
  const save = () => {
    if (!draft.customer.trim() || !draft.srNumber.trim() || !draft.title.trim()) return
    const rec: SrRecord = { ...draft, customer: draft.customer.trim(), srNumber: draft.srNumber.trim(), title: draft.title.trim(), updatedAt: new Date().toISOString().slice(0, 10) }
    if (draft.id) update({ ...data, incidents: incidents.map(s => s.id === draft.id ? rec : s) })
    else update({ ...data, incidents: [{ ...rec, id: uid('sr') }, ...incidents] })
    setShowForm(false); setDraft(emptyDraft)
  }
  const remove = (id: string) => { if (confirm('이 SR 기록을 삭제할까요?')) update({ ...data, incidents: incidents.filter(s => s.id !== id) }) }

  const openCount = incidents.filter(s => s.status !== 'closed').length

  return (
    <div className="sr-wrap">
      <div className="pol-top">
        <div>
          <div className="pol-title">SR 지식모음</div>
          <div className="pol-sub">고객사별 Service Request(SR) 접수 이력 — 무엇을 언제 올렸는지 한눈에</div>
        </div>
        <div className="pol-top-r">
          <span className="sr-stat">{customers.length}개사 · 진행 {openCount} / 총 {incidents.length}</span>
          <span className={`pol-sync s-${sync}`}>{SYNC_LABEL[sync]}</span>
          {writable && <button type="button" className="pol-primary" onClick={openNew}>＋ SR</button>}
        </div>
      </div>
      {!writable && <div className="pol-ro">🔒 읽기 전용입니다. SR 추가·수정은 PAT(쓰기 권한)가 필요합니다.</div>}

      <div className="sr-filter">
        <input className="pol-search" value={q} onChange={e => setQ(e.target.value)} placeholder="검색 (고객·SR번호·제목·서비스)" />
        <select value={custFilter} onChange={e => setCustFilter(e.target.value)}>
          <option value="">전체 고객</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="sr-status-chips">
          <button type="button" className={`sr-chip${statusFilter === '' ? ' on' : ''}`} onClick={() => setStatusFilter('')}>전체</button>
          <button type="button" className={`sr-chip${statusFilter === 'active' ? ' on' : ''}`} onClick={() => setStatusFilter('active')}>진행중</button>
          {(Object.keys(STATUS) as SrStatus[]).map(k => <button type="button" key={k} className={`sr-chip ${STATUS[k].cls}${statusFilter === k ? ' on' : ''}`} onClick={() => setStatusFilter(statusFilter === k ? '' : k)}>{STATUS[k].label}</button>)}
        </div>
      </div>

      {incidents.length === 0 && <div className="pol-empty">아직 등록된 SR 이 없습니다. {writable ? '‹＋ SR›로 추가하세요.' : ''}</div>}
      {incidents.length > 0 && filtered.length === 0 && <div className="pol-empty">검색·필터 결과 없음</div>}

      <div className="sr-groups">
        {grouped.map(([customer, list]) => (
          <section className="sr-group" key={customer}>
            <div className="sr-group-head">
              <span className="sr-cust">{customer}</span>
              <span className="pol-count">{list.length}</span>
              <span className="sr-group-active">진행 {list.filter(s => s.status !== 'closed').length}</span>
            </div>
            <div className="sr-list">
              {list.map(s => (
                <div className={`sr-card${s.status === 'closed' ? ' closed' : ''}`} key={s.id}>
                  <div className="sr-card-top">
                    {s.severity && <span className={`sr-sev ${SEV[s.severity].cls}`}>{SEV[s.severity].label}</span>}
                    {s.status && <span className={`sr-status ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>}
                    <span className="sr-num bp-mono">{s.srNumber}</span>
                    <CopyBtn text={s.srNumber} />
                    <div className="sr-card-actions">
                      {writable && <button type="button" className="pol-icon" title="편집" onClick={() => openEdit(s)}>✎</button>}
                      {writable && <button type="button" className="pol-icon pol-del" title="삭제" onClick={() => remove(s.id)}>✕</button>}
                    </div>
                  </div>
                  <div className="sr-title">{s.title}</div>
                  <div className="sr-meta">
                    {s.service && <span className="sr-svc">{s.service}</span>}
                    {s.openedAt && <span className="sr-date">접수 {s.openedAt}</span>}
                    {s.csi && <span className="sr-csi">CSI {s.csi}</span>}
                    {s.link && <a className="sr-link" href={s.link} target="_blank" rel="noreferrer">포털 ↗</a>}
                  </div>
                  {s.notes && <div className="sr-notes">{s.notes}</div>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {showForm && writable && (
        <div className="pol-modal-bg" onClick={() => setShowForm(false)}>
          <div className="pol-modal" onClick={e => e.stopPropagation()}>
            <div className="pol-modal-head"><span>SR {draft.id ? '수정' : '추가'}</span><button type="button" className="pol-ghost" onClick={() => setShowForm(false)}>닫기 ✕</button></div>
            <div className="pol-modal-body">
              <div className="sr-form-grid">
                <label className="pol-l">고객사<input list="sr-cust-list" value={draft.customer} onChange={e => set('customer', e.target.value)} placeholder="예: locktonkorea" autoFocus /><datalist id="sr-cust-list">{customers.map(c => <option key={c} value={c} />)}</datalist></label>
                <label className="pol-l">SR 번호<input value={draft.srNumber} onChange={e => set('srNumber', e.target.value)} placeholder="3-XXXXXXXXXXX" /></label>
              </div>
              <label className="pol-l">제목<input value={draft.title} onChange={e => set('title', e.target.value)} placeholder="증상·요청 요약" /></label>
              <div className="sr-form-grid">
                <label className="pol-l">서비스<input value={draft.service} onChange={e => set('service', e.target.value)} placeholder="Compute / Network / DB …" /></label>
                <label className="pol-l">심각도<select value={draft.severity} onChange={e => set('severity', e.target.value)}>{(Object.keys(SEV) as SrSeverity[]).map(k => <option key={k} value={k}>{SEV[k].label}</option>)}</select></label>
              </div>
              <div className="sr-form-grid">
                <label className="pol-l">상태<select value={draft.status} onChange={e => set('status', e.target.value)}>{(Object.keys(STATUS) as SrStatus[]).map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}</select></label>
                <label className="pol-l">접수일<input type="date" value={draft.openedAt} onChange={e => set('openedAt', e.target.value)} /></label>
              </div>
              <div className="sr-form-grid">
                <label className="pol-l">CSI(선택)<input value={draft.csi} onChange={e => set('csi', e.target.value)} placeholder="Customer Support Identifier" /></label>
                <label className="pol-l">포털 링크(선택)<input value={draft.link} onChange={e => set('link', e.target.value)} placeholder="https://support.oracle.com/…" /></label>
              </div>
              <label className="pol-l">메모(선택)<textarea rows={3} value={draft.notes} onChange={e => set('notes', e.target.value)} placeholder="진행 경과·해결책 요약" /></label>
              <div className="pol-form-actions">
                <button type="button" className="pol-primary" onClick={save} disabled={!draft.customer.trim() || !draft.srNumber.trim() || !draft.title.trim()}>{draft.id ? '수정 저장' : 'SR 추가'}</button>
                <button type="button" className="pol-ghost" onClick={() => setShowForm(false)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
