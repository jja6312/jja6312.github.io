import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useHub } from '../store'
import { getPat, listDir, getFileByUrl, explainGhError } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'

interface AnnDoc { name: string; folder: 'catalog' | 'snapshots'; content: string }

const SECTIONS: { folder: AnnDoc['folder']; title: string; desc: string }[] = [
  { folder: 'snapshots', title: '수집 스냅샷', desc: '시점별 고객사 안내 판단 (YYMMDD)' },
  { folder: 'catalog', title: '지식 카탈로그', desc: '안내 종류별 지식 카드 — 원문 제목으로 검색' },
]

export default function AnnouncementsPage() {
  const pat = getPat()
  const { showToast } = useHub()
  const [docs, setDocs] = useState<AnnDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!pat) return
    setLoading(true)
    try {
      const loaded = await Promise.all(SECTIONS.map(async s => {
        const entries = (await listDir(pat, `announcements/${s.folder}`)).filter(e => e.name.endsWith('.md'))
        const files = await Promise.all(entries.map(async e => {
          const content = await getFileByUrl(pat, e.url)
          return content ? { name: e.name, folder: s.folder, content } : null
        }))
        return files.filter((x): x is AnnDoc => !!x)
      }))
      setDocs(loaded.flat().sort((a, b) => b.name.localeCompare(a.name)))
    } catch (e) { showToast(`공지 DB 조회 실패: ${explainGhError(e)}`) }
    finally { setLoading(false) }
  }, [pat, showToast])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter(d => (d.name + '\n' + d.content).toLowerCase().includes(needle))
  }, [docs, q])

  if (!pat) return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
      <div className="crumb"><span className="px">ANNOUNCEMENTS</span></div>
      <h1 className="sheet-h1">OCI 공지</h1>
      <div style={{ height: 20 }} /><PatNotice />
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">ANNOUNCEMENTS</span></div>
      <h1 className="sheet-h1">OCI 공지</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 12.5, margin: '6px 0 18px' }}>
        OCI announcement 지식 DB — blog-db <code className="mono">announcements/</code>.
        같은 공지를 다시 만나면 영문 제목으로 카탈로그 검색. 수집·갱신은 Claude Code 세션.
      </p>

      <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 16 }}
        placeholder="검색 (영문 제목·본문 전체 — 예: Reboot Scheduled)"
        value={q} onChange={e => setQ(e.target.value)} />

      {loading && <div className="cmt-empty">불러오는 중…</div>}
      {!loading && docs.length === 0 && (
        <div className="cmt-empty" style={{ padding: '30px 0' }}>
          아직 데이터가 없습니다. Claude Code 에서 "announcement 수집" 으로 시작.
        </div>
      )}

      {SECTIONS.map(s => {
        const items = filtered.filter(d => d.folder === s.folder)
        if (!loading && items.length === 0) return null
        return (
          <section key={s.folder} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 13, margin: '0 0 4px' }} className="px">{s.title}</h2>
            <p style={{ color: 'var(--text-faint)', fontSize: 11.5, margin: '0 0 10px' }}>{s.desc}</p>
            {items.map(d => {
              const key = `${d.folder}/${d.name}`
              return (
                <div key={key} className="scen" style={{ padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}
                  onClick={() => setOpen(open === key ? null : key)}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span className="sid px">{d.folder === 'snapshots' ? d.name.slice(0, 6) : 'CARD'}</span>
                    <b style={{ fontSize: 14 }}>{(d.content.match(/^#\s+(.+)$/m)?.[1]) ?? d.name}</b>
                    <span className="px" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>
                      {open === key ? '▲ 접기' : '▼ 열기'}
                    </span>
                  </div>
                  {open === key && (
                    <div className="md-body" onClick={e => e.stopPropagation()}
                      dangerouslySetInnerHTML={{ __html: marked.parse(d.content) as string }} />
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
