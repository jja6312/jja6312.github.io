import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFile, putFile, listDir, getFileByUrl, explainGhError } from '../lib/githubDb'
import { useHub } from '../store'

// blog-db announcements/register.json — 공지×고객 인스턴스(진실원천). 사이트는 여기서 검토·발송 상태를 갱신한다.
type Decision = 'pending' | 'notify' | 'no_notify' | 'superseded'
type Dispatch = 'none' | 'drafted' | 'in_review' | 'approved' | 'sent'
interface RegItem {
  key: string; ticket: string | null; profile: string; customer: string
  catalog: string; title: string; type: string; service?: string
  severity: string; resource: string | null; deadline: string | null
  decision: Decision; dispatch: Dispatch; assignee: string; sentAt: string | null
  firstSeen: string; lastSeen: string; note?: string
  history: { at: string; who: string; change: string }[]
}
interface Register { schemaVersion: number; updatedAt: string; _note?: string; items: RegItem[] }

const DECISIONS: Decision[] = ['pending', 'notify', 'no_notify', 'superseded']
const DISPATCHES: Dispatch[] = ['none', 'drafted', 'in_review', 'approved', 'sent']
const DECISION_LABEL: Record<Decision, string> = { pending: '판단 전', notify: '안내 대상', no_notify: '안내 불요', superseded: '종료됨' }
const DISPATCH_LABEL: Record<Dispatch, string> = { none: '준비 전', drafted: '초안', in_review: '검토중', approved: '승인', sent: '발송완료' }

type SevLevel = 'critical' | 'high' | 'medium' | 'low'
const SEV_COLOR: Record<SevLevel, string> = { critical: 'var(--wrong)', high: 'var(--partial)', medium: 'var(--pixel)', low: 'var(--text-faint)' }
function sevLevel(s: string): SevLevel {
  if (/매우\s*높음/.test(s)) return 'critical'
  if (/높음/.test(s)) return 'high'
  if (/중간|의존|조건부/.test(s)) return 'medium'
  return 'low'
}
function fmtDeadline(d: string | null): string {
  if (!d) return '기한 미정'
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(d)
  if (!m) return d
  if (m[4] && !(m[4] === '00' && m[5] === '00')) return `${m[2]}-${m[3]} ${m[4]}:${m[5]} KST`
  return `${m[1]}-${m[2]}-${m[3]}`
}
const today = () => new Date().toISOString().slice(0, 10)

type FilterKey = 'send' | 'review' | 'done' | 'off' | 'all'
const FILTERS: { key: FilterKey; label: string; match: (i: RegItem) => boolean }[] = [
  { key: 'send', label: '발송 대상', match: i => i.decision === 'notify' && i.dispatch !== 'sent' },
  { key: 'review', label: '검토중', match: i => ['drafted', 'in_review', 'approved'].includes(i.dispatch) },
  { key: 'done', label: '발송완료', match: i => i.dispatch === 'sent' },
  { key: 'off', label: '보류·제외', match: i => i.decision === 'pending' || i.decision === 'no_notify' || i.decision === 'superseded' },
  { key: 'all', label: '전체', match: () => true },
]

// 검토/발송 상태의 스키마 교차 규칙을 클라이언트에서도 지켜 blog-db CI(validate)가 깨지지 않게 한다.
function applyChange(item: RegItem, field: 'decision' | 'dispatch', value: string): RegItem {
  const next: RegItem = { ...item }
  if (field === 'decision') {
    next.decision = value as Decision
    if (next.decision !== 'notify' && next.dispatch !== 'none') { next.dispatch = 'none'; next.sentAt = null }
  } else {
    next.dispatch = value as Dispatch
    if (['drafted', 'in_review', 'approved', 'sent'].includes(next.dispatch)) next.decision = 'notify'
    next.sentAt = next.dispatch === 'sent' ? new Date().toISOString() : null
  }
  next.history = [...(item.history ?? []), { at: today(), who: '사이트', change: `${field}=${next[field]}` }]
  return next
}

export default function AnnouncementDispatch({ pat }: { pat: string }) {
  const { showToast } = useHub()
  const [reg, setReg] = useState<Register | null>(null)
  const [sha, setSha] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('send')
  const [outbox, setOutbox] = useState<Record<string, string>>({}) // profile → outbox 파일 API url (최신 사이클)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const file = await getFile(pat, 'announcements/register.json')
      if (!file) { setReg(null); setSha(''); return }
      setReg(JSON.parse(file.content) as Register)
      setSha(file.sha)
      const entries = await listDir(pat, 'announcements/outbox')
      const map: Record<string, string> = {}
      for (const e of entries.filter(x => x.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
        const profile = e.name.replace(/-\d{6}\.md$/, '')
        map[profile] = e.url // 정렬이 오름차순이라 마지막(최신 사이클)이 남는다
      }
      setOutbox(map)
    } catch (e) { showToast(`register 조회 실패: ${explainGhError(e)}`) }
    finally { setLoading(false) }
  }, [pat, showToast])
  useEffect(() => { void load() }, [load])

  const save = useCallback(async (item: RegItem) => {
    if (!reg) return
    const nextItems = reg.items.map(x => x.key === item.key ? item : x)
    const next: Register = { ...reg, updatedAt: new Date().toISOString(), items: nextItems }
    setBusy(true)
    setReg(next) // 낙관적 반영
    try {
      const body = JSON.stringify(next, null, 2) + '\n'
      const newSha = await putFile(pat, 'announcements/register.json', body, `chore(announcements): ${item.key} 상태 갱신`, sha)
      setSha(newSha)
    } catch (e) {
      showToast(`저장 실패: ${explainGhError(e)} — 새로고침 후 다시`)
      void load() // 충돌/실패 시 서버 상태로 되돌림
    } finally { setBusy(false) }
  }, [reg, sha, pat, showToast, load])

  const copyMail = useCallback(async (profile: string) => {
    const url = outbox[profile]
    if (!url) { showToast('이 고객사의 발송 다이제스트(outbox)가 아직 없습니다'); return }
    try {
      const md = await getFileByUrl(pat, url)
      if (!md) throw new Error('빈 파일')
      const body = md.match(/---- 복사 시작 ----\r?\n([\s\S]*?)\r?\n---- 복사 끝 ----/)?.[1]?.trim() ?? md
      await navigator.clipboard.writeText(body)
      showToast(`${profile} 안내 메일 본문 복사됨`)
    } catch (e) { showToast(`메일 복사 실패: ${explainGhError(e)}`) }
  }, [outbox, pat, showToast])

  const counts = useMemo(() => {
    const c = { notify: 0, pending: 0, no_notify: 0, superseded: 0, sent: 0 }
    for (const i of reg?.items ?? []) {
      c[i.decision] += 1
      if (i.dispatch === 'sent') c.sent += 1
    }
    return c
  }, [reg])

  const groups = useMemo(() => {
    const match = FILTERS.find(f => f.key === filter)!.match
    const byProfile = new Map<string, RegItem[]>()
    for (const i of (reg?.items ?? []).filter(match)) {
      if (!byProfile.has(i.profile)) byProfile.set(i.profile, [])
      byProfile.get(i.profile)!.push(i)
    }
    const sevRank = (s: string) => ({ critical: 0, high: 1, medium: 2, low: 3 })[sevLevel(s)]
    return [...byProfile.entries()]
      .map(([profile, items]) => ({
        profile, customer: items[0].customer,
        items: items.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')),
      }))
      .sort((a, b) => a.customer.localeCompare(b.customer))
  }, [reg, filter])

  if (loading) return <div className="cmt-empty" style={{ padding: '20px 0' }}>발송 대시보드 불러오는 중…</div>
  if (!reg) return (
    <div className="ann-dispatch-empty">
      아직 <code className="mono">announcements/register.json</code> 이 없습니다.
      blog-db 의 발송 파이프라인(PR #2)이 <b>main 에 머지</b>되면 여기에 고객사별 발송 현황이 표시됩니다.
    </div>
  )

  return (
    <section className="ann-dispatch">
      <div className="ann-dispatch-head">
        <h2 className="px">발송 준비 대시보드</h2>
        <div className="ann-dispatch-stat">
          안내 {counts.notify} · 판단전 {counts.pending} · 불요 {counts.no_notify} · 종료 {counts.superseded} · 발송완료 {counts.sent}
        </div>
        <button type="button" className="ann-refresh" onClick={() => void load()} disabled={busy}>새로고침</button>
      </div>

      <div className="ann-filters">
        {FILTERS.map(f => {
          const n = (reg.items).filter(f.match).length
          return (
            <button type="button" key={f.key} className={`ann-filter${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="ann-filter-n">{n}</span>
            </button>
          )
        })}
      </div>

      {groups.length === 0 && <div className="cmt-empty" style={{ padding: '20px 0' }}>이 필터에 해당하는 항목이 없습니다.</div>}

      {groups.map(g => (
        <div key={g.profile} className="ann-cust">
          <div className="ann-cust-head">
            <b>{g.customer}</b><span className="px ann-cust-profile">{g.profile}</span>
            <span className="ann-cust-count">{g.items.length}건</span>
            <button type="button" className="ann-copy" disabled={!outbox[g.profile]} onClick={() => void copyMail(g.profile)}
              title={outbox[g.profile] ? '발송 다이제스트 본문 복사' : 'outbox 없음'}>✉ 메일 복사</button>
          </div>
          <div className="ann-items">
            {g.items.map(i => {
              const lv = sevLevel(i.severity)
              return (
                <div key={i.key} className="ann-item">
                  <span className="sev" style={{ color: SEV_COLOR[lv], borderColor: SEV_COLOR[lv] }}>
                    <i style={{ background: SEV_COLOR[lv] }} />{i.severity}
                  </span>
                  <div className="ann-item-body">
                    <div className="ann-item-title">
                      <b>{i.title}</b>{i.resource ? <span className="ann-res">— {i.resource}</span> : null}
                    </div>
                    <div className="ann-item-meta">
                      <span className="ann-type px">{i.type}</span>
                      <span className="ann-deadline">{fmtDeadline(i.deadline)}</span>
                      {i.assignee && <span className="ann-assignee">담당 {i.assignee}</span>}
                    </div>
                  </div>
                  <div className="ann-controls">
                    <label>판단
                      <select value={i.decision} disabled={busy} onChange={e => void save(applyChange(i, 'decision', e.target.value))}>
                        {DECISIONS.map(d => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}
                      </select>
                    </label>
                    <label>발송
                      <select value={i.dispatch} disabled={busy || i.decision !== 'notify'} onChange={e => void save(applyChange(i, 'dispatch', e.target.value))}>
                        {DISPATCHES.map(d => <option key={d} value={d}>{DISPATCH_LABEL[d]}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
