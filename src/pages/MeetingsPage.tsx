import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useHub } from '../store'
import { getPat, listDir, getFileByUrl } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'

interface Minute { name: string; content: string }

export default function MeetingsPage() {
  const pat = getPat()
  const { showToast } = useHub()
  const [minutes, setMinutes] = useState<Minute[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!pat) return
    setLoading(true)
    try {
      const entries = (await listDir(pat, 'meetings/minutes')).filter(e => e.name.endsWith('.md'))
      const docs = await Promise.all(entries.map(async e => {
        const content = await getFileByUrl(pat, e.url)
        return content ? { name: e.name, content } : null
      }))
      setMinutes(docs.filter((x): x is Minute => !!x).sort((a, b) => b.name.localeCompare(a.name)))
    } catch { showToast('회의록 조회 실패') }
    finally { setLoading(false) }
  }, [pat, showToast])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return minutes
    return minutes.filter(m => (m.name + '\n' + m.content).toLowerCase().includes(needle))
  }, [minutes, q])

  if (!pat) return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
      <div className="crumb"><span className="px">MEETINGS</span></div>
      <h1 className="sheet-h1">회의록</h1>
      <div style={{ height: 20 }} /><PatNotice />
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">MEETINGS</span></div>
      <h1 className="sheet-h1">회의록</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 12.5, margin: '6px 0 18px' }}>
        녹음·스크립트를 로컬 Claude Code 세션에 전달하면 정리된 회의록이
        blog-db <code className="mono">meetings/minutes/</code> 에 쌓이고, 여기서 열람·검색.
      </p>

      <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 16 }} placeholder="🔍 검색 (파일명·본문)"
        value={q} onChange={e => setQ(e.target.value)} />

      {loading && <div className="cmt-empty">불러오는 중…</div>}
      {!loading && filtered.length === 0 && (
        <div className="cmt-empty" style={{ padding: '30px 0' }}>
          {q ? '검색 결과 없음' : '아직 회의록이 없습니다. 회의 녹음/스크립트를 Claude Code에 "회의록 만들어줘"로 전달하세요.'}
        </div>
      )}

      {filtered.map(m => (
        <div key={m.name} className="scen" style={{ padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}
          onClick={() => setOpen(open === m.name ? null : m.name)}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span className="sid px">🎙</span>
            <b style={{ fontSize: 14 }}>{(m.content.match(/^#\s+(.+)$/m)?.[1]) ?? m.name.replace(/\.md$/, '')}</b>
            <span className="px" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>
              {open === m.name ? '▲ 접기' : '▼ 열기'}
            </span>
          </div>
          {open === m.name && (
            <div className="md-body" onClick={e => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }} />
          )}
        </div>
      ))}
    </div>
  )
}
