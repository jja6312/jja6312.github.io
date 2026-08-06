import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useHub } from '../store'
import { getPat, listDir, getFileByUrl, explainGhError } from '../lib/githubDb'
import { useProtectedData } from '../lib/protectedData'

interface Doc { name: string; content: string }

// 지식모음 범용 md 뷰어 — blog-db의 한 디렉토리를 목록·검색·열람 (OCI CLI / Terraform 등)
export default function KnowledgeDocsPage({ crumb, title, desc, path, badge }: {
  crumb: string; title: string; desc: string; path: string; badge: string
}) {
  const pat = getPat()
  const protectedState = useProtectedData()
  const { showToast } = useHub()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!pat) {
      if (protectedState.data) setDocs(protectedState.data.terraformDocs ?? [])
      return
    }
    setLoading(true)
    try {
      const entries = (await listDir(pat, path)).filter(e => e.name.endsWith('.md'))
      const loaded = await Promise.all(entries.map(async e => {
        const content = await getFileByUrl(pat, e.url)
        return content ? { name: e.name, content } : null
      }))
      setDocs(loaded.filter((x): x is Doc => !!x).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) { showToast(`문서 조회 실패: ${explainGhError(e)}`) }
    finally { setLoading(false) }
  }, [pat, path, showToast, protectedState.data])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter(d => (d.name + '\n' + d.content).toLowerCase().includes(needle))
  }, [docs, q])

  const docTitle = (d: Doc) =>
    (d.content.match(/^#\s+(.+)$/m)?.[1]) ?? d.name.replace(/^_|\.md$/g, '').replace(/^ocicli_/, '')

  if (!pat && !protectedState.data) return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
      <div className="crumb"><span className="px">{crumb}</span></div>
      <h1 className="sheet-h1">{title}</h1>
      <div className="cmt-empty">{protectedState.loading ? '보호 문서를 복호화하는 중…' : protectedState.error}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">{crumb}</span></div>
      <h1 className="sheet-h1">{title}</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '6px 0 18px' }}>{desc}</p>

      <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 16 }}
        placeholder={`검색 (${docs.length}건 · 제목·본문 전체)`}
        value={q} onChange={e => setQ(e.target.value)} />

      {loading && <div className="cmt-empty">불러오는 중…</div>}
      {!loading && filtered.length === 0 && (
        <div className="cmt-empty" style={{ padding: '30px 0' }}>{q ? '검색 결과 없음' : '아직 문서가 없습니다.'}</div>
      )}

      {filtered.map(d => (
        <div key={d.name} className="scen" style={{ padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}
          onClick={() => setOpen(open === d.name ? null : d.name)}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span className="sid px">{badge}</span>
            <b style={{ fontSize: 15.5 }}>{docTitle(d)}</b>
            <span className="px" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
              {open === d.name ? '▲ 접기' : '▼ 열기'}
            </span>
          </div>
          {open === d.name && (
            <div className="md-body" onClick={e => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: marked.parse(d.content) as string }} />
          )}
        </div>
      ))}
    </div>
  )
}
