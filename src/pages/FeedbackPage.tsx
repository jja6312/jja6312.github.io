import { useCallback, useEffect, useState } from 'react'
import { useHub } from '../store'
import type { FeedbackItem, FeedbackSeverity, FeedbackStatus } from '../types'
import { getPat, setPat, commitFeedback, fetchFeedbackList } from '../lib/githubDb'

const PENDING_KEY = 'hub-feedback-pending'
const loadPending = (): FeedbackItem[] => JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
const savePending = (items: FeedbackItem[]) => localStorage.setItem(PENDING_KEY, JSON.stringify(items))

const sevMeta: Record<FeedbackSeverity, { label: string; color: string }> = {
  bug: { label: '버그', color: 'var(--wrong)' },
  friction: { label: '불편', color: 'var(--partial)' },
  idea: { label: '아이디어', color: 'var(--accent)' },
}
const statusMeta: Record<FeedbackStatus, string> = {
  open: '⏳ open', in_progress: '🔧 진행중', resolved: '✅ 해결', wontfix: '⛔ wontfix',
}

export default function FeedbackPage() {
  const { showToast } = useHub()
  const [pat, setPatState] = useState(getPat())
  const [patInput, setPatInput] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<FeedbackSeverity>('friction')
  const [tags, setTags] = useState('')
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [filter, setFilter] = useState<'all' | FeedbackStatus>('all')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const pending = loadPending()
    if (!pat) { setItems(pending); return }
    setLoading(true)
    try {
      const remote = await fetchFeedbackList(pat)
      setItems([...pending, ...remote])
    } catch {
      showToast('blog-db 조회 실패 — PAT 확인')
      setItems(pending)
    } finally { setLoading(false) }
  }, [pat, showToast])

  useEffect(() => { refresh() }, [refresh])

  const submit = async () => {
    if (!title.trim()) { showToast('제목을 입력'); return }
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const id = `${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
    const item: FeedbackItem = {
      id, created: now.toISOString(), status: 'open',
      title: title.trim(), body: body.trim(), severity,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    }
    setBusy(true)
    try {
      if (pat) {
        await commitFeedback(pat, item)
        showToast('blog-db commit 완료 ✓')
      } else {
        savePending([...loadPending(), { ...item, _pending: true }])
        showToast('로컬 저장 — PAT 등록 시 커밋')
      }
      setTitle(''); setBody(''); setTags('')
      refresh()
    } catch {
      showToast('commit 실패 — PAT 권한 확인')
    } finally { setBusy(false) }
  }

  const flushPending = async () => {
    if (!pat) return
    const pending = loadPending()
    if (pending.length === 0) return
    setBusy(true)
    let ok = 0
    const remain: FeedbackItem[] = []
    for (const it of pending) {
      try { await commitFeedback(pat, it); ok++ } catch { remain.push(it) }
    }
    savePending(remain)
    setBusy(false)
    showToast(`대기 ${ok}건 commit 완료`)
    refresh()
  }

  const pendingCount = items.filter(i => i._pending).length
  const filtered = items.filter(i => filter === 'all' || i.status === filter)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">FEEDBACK</span></div>
      <h1 className="sheet-h1">피드백</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 13.5, margin: '8px 0 20px' }}>
        쓰다가 불편한 것·바꾸고 싶은 것을 그 자리에서 기록.
        blog-db에 commit되고, Claude Code에 "피드백 확인해줘" 한마디면 반영 루프가 돈다.
      </p>

      {/* PAT 설정 */}
      <details className="card" style={{ padding: '12px 18px', marginBottom: 18, fontSize: 13 }} open={!pat}>
        <summary style={{ cursor: 'pointer', color: pat ? 'var(--accent)' : 'var(--partial)' }}>
          {pat ? '🔑 PAT 등록됨 — blog-db 직접 commit' : '🔑 PAT 미등록 — 지금은 이 브라우저에만 저장됨'}
        </summary>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input className="cmdinput" type="password" style={{ flex: 1, minWidth: 200 }}
            placeholder="fine-grained PAT (blog-db Contents R/W 한정)"
            value={patInput} onChange={e => setPatInput(e.target.value)} />
          <button className="submitbtn" onClick={() => {
            setPat(patInput.trim()); setPatState(patInput.trim()); setPatInput('')
            showToast(patInput.trim() ? 'PAT 저장됨' : 'PAT 삭제됨')
          }}>저장</button>
          {pat && <button className="iconbtn" onClick={() => { setPat(''); setPatState(''); showToast('PAT 삭제됨') }}>삭제</button>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
          github.com/settings/personal-access-tokens → Fine-grained → Repository access: blog-db만 → Contents: Read and write
        </div>
        {pat && pendingCount > 0 && (
          <button className="donebtn" style={{ marginTop: 10 }} disabled={busy} onClick={flushPending}>
            로컬 대기 {pendingCount}건 지금 commit
          </button>
        )}
      </details>

      {/* 작성 폼 */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 24 }}>
        <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 10 }}
          placeholder="제목 — 무엇이 불편한가 / 무엇을 원하나"
          value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="cmdinput" style={{ marginBottom: 10 }}
          placeholder="내용 (재현 상황, 기대 동작 등 — 짧아도 됨)"
          value={body} onChange={e => setBody(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="optrow">
            {(Object.keys(sevMeta) as FeedbackSeverity[]).map(s => (
              <button key={s} className="opt" style={{
                padding: '6px 14px', fontSize: 12,
                borderColor: severity === s ? sevMeta[s].color : undefined,
                color: severity === s ? sevMeta[s].color : undefined,
              }} onClick={() => setSeverity(s)}>{sevMeta[s].label}</button>
            ))}
          </div>
          <input className="cmdinput" style={{ fontFamily: 'Pretendard', flex: 1, minWidth: 140, padding: '7px 12px', fontSize: 12 }}
            placeholder="태그 (쉼표 구분: 학습지, 복습 …)"
            value={tags} onChange={e => setTags(e.target.value)} />
          <button className="submitbtn" disabled={busy} onClick={submit}>제출</button>
        </div>
      </div>

      {/* 목록 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
          <button key={f} className="opt" style={{
            padding: '4px 12px', fontSize: 11, borderRadius: 99,
            borderColor: filter === f ? 'var(--accent)' : undefined,
            color: filter === f ? 'var(--accent)' : undefined,
          }} onClick={() => setFilter(f)}>{f === 'all' ? '전체' : statusMeta[f]}</button>
        ))}
        {loading && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>불러오는 중…</span>}
        <button className="iconbtn" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={refresh}>새로고침</button>
      </div>

      {filtered.length === 0 && (
        <div className="cmt-empty" style={{ padding: '30px 0' }}>표시할 피드백이 없습니다.</div>
      )}
      {filtered.map(i => (
        <div key={i.id} className="scen" style={{ padding: '14px 18px', marginBottom: 12 }}>
          <div className="scen-hd" style={{ marginBottom: 6 }}>
            <span className="stype px" style={{ background: sevMeta[i.severity]?.color }}>{sevMeta[i.severity]?.label}</span>
            <span className="sid px">{i.id}{i._pending && ' · 로컬 대기'}</span>
            <span className="sxp px" style={{ color: i.status === 'resolved' ? 'var(--accent)' : 'var(--text-dim)' }}>
              {statusMeta[i.status]}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{i.title}</div>
          {i.body && <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>{i.body}</div>}
          {i.tags && i.tags.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              {i.tags.map(t => <span key={t} className="chip" style={{ fontSize: 10 }}>#{t}</span>)}
            </div>
          )}
          {i.resolution && (
            <div className="result ok show" style={{ marginTop: 10, padding: '8px 12px' }}>
              <div className="exp" style={{ fontSize: 12 }}><b style={{ color: 'var(--accent)' }}>해결:</b> {i.resolution}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
