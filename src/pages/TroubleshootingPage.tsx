import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useHub } from '../store'
import { getPat, listDir, getFileByUrl, putFile, explainGhError } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'

interface CaseDoc { name: string; content: string }

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9가-힣\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'case'

export default function TroubleshootingPage() {
  const pat = getPat()
  const { showToast } = useHub()
  const [cases, setCases] = useState<CaseDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<CaseDoc | null>(null)
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!pat) return
    setLoading(true)
    try {
      const entries = (await listDir(pat, 'troubleshooting/cases')).filter(e => e.name.endsWith('.md'))
      const docs = await Promise.all(entries.map(async e => {
        const content = await getFileByUrl(pat, e.url)
        return content ? { name: e.name, content } : null
      }))
      setCases(docs.filter((x): x is CaseDoc => !!x).sort((a, b) => b.name.localeCompare(a.name)))
    } catch (e) { showToast(`목록 조회 실패: ${explainGhError(e)}`) }
    finally { setLoading(false) }
  }, [pat, showToast])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return cases
    return cases.filter(c => (c.name + '\n' + c.content).toLowerCase().includes(needle))
  }, [cases, q])

  const submit = async () => {
    if (!title.trim() || !body.trim()) { showToast('제목·본문을 입력'); return }
    const now = new Date()
    const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const path = `troubleshooting/cases/${ymd}_${slugify(title)}.md`
    const tagLine = tags.trim() ? `\n태그: ${tags.split(',').map(t => `#${t.trim()}`).join(' ')}\n` : '\n'
    const md = `# ${title.trim()}\n\n- 작성: ${now.toISOString().slice(0, 10)} (사이트)${tagLine}\n${body.trim()}\n`
    setBusy(true)
    try {
      await putFile(pat, path, md, `case: ${title.trim()}`)
      showToast('케이스 commit 완료 ✓')
      setWriting(false); setTitle(''); setTags(''); setBody('')
      refresh()
    } catch (e) { showToast(`commit 실패: ${explainGhError(e)}`) }
    finally { setBusy(false) }
  }

  if (!pat) return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
      <div className="crumb"><span className="px">TROUBLESHOOTING</span></div>
      <h1 className="sheet-h1">트러블슈팅</h1>
      <div style={{ height: 20 }} /><PatNotice />
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">TROUBLESHOOTING</span></div>
      <h1 className="sheet-h1">트러블슈팅</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 12.5, margin: '6px 0 18px' }}>
        인시던트 기록 모음 — blog-db <code className="mono">troubleshooting/cases/</code>.
        Claude Code 세션의 자동 postmortem 또는 여기서 수동 작성.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input className="cmdinput" style={{ fontFamily: 'Pretendard' }} placeholder="검색 (제목·본문 전체)"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className="submitbtn" onClick={() => setWriting(w => !w)}>{writing ? '닫기' : '+ 새 기록'}</button>
      </div>

      {writing && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 18 }}>
          <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 8 }} placeholder="제목 — 증상 한 줄"
            value={title} onChange={e => setTitle(e.target.value)} />
          <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 8, fontSize: 12 }} placeholder="태그 (쉼표: 고객사, 서비스 …)"
            value={tags} onChange={e => setTags(e.target.value)} />
          <textarea className="cmdinput" style={{ minHeight: 140 }} placeholder={'마크다운 본문 — 증상 / 원인 / 조치 / 재발 방지'}
            value={body} onChange={e => setBody(e.target.value)} />
          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <button className="submitbtn" disabled={busy} onClick={submit}>commit</button>
          </div>
        </div>
      )}

      {loading && <div className="cmt-empty">불러오는 중…</div>}
      {!loading && filtered.length === 0 && (
        <div className="cmt-empty" style={{ padding: '30px 0' }}>
          {q ? '검색 결과 없음' : '아직 기록이 없습니다. Claude Code postmortem 또는 + 새 기록으로 시작.'}
        </div>
      )}

      {filtered.map(c => (
        <div key={c.name} className="scen" style={{ padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}
          onClick={() => setOpen(open?.name === c.name ? null : c)}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span className="sid px">{c.name.slice(0, 6)}</span>
            <b style={{ fontSize: 14 }}>{(c.content.match(/^#\s+(.+)$/m)?.[1]) ?? c.name}</b>
            <span className="px" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>
              {open?.name === c.name ? '▲ 접기' : '▼ 열기'}
            </span>
          </div>
          {open?.name === c.name && (
            <div className="md-body" onClick={e => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: marked.parse(c.content) as string }} />
          )}
        </div>
      ))}
    </div>
  )
}
