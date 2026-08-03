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

/* severity — 카탈로그 본문 "- 긴급도: …" 라인을 파싱해 4단계로 표현.
   worst-case 우선(매우 높음→높음→중간→낮음). 조건부(워크로드 의존)는 중간으로 본다. */
type SevLevel = 'critical' | 'high' | 'medium' | 'low'
const SEV_META: Record<SevLevel, { label: string; color: string }> = {
  critical: { label: '매우 높음', color: 'var(--wrong)' },
  high: { label: '높음', color: 'var(--partial)' },
  medium: { label: '중간', color: 'var(--pixel)' },
  low: { label: '낮음', color: 'var(--text-faint)' },
}
function parseSeverity(md: string): { level: SevLevel; raw: string } | null {
  const line = md.match(/^-\s*긴급도\s*[::]\s*(.+)$/m)?.[1]?.trim()
  if (!line) return null
  const head = line.split(/[|(—-]/)[0].trim() || line   // 첫 토큰(괄호·부연 설명 앞)으로 분류
  let level: SevLevel
  if (/매우\s*높음/.test(head)) level = 'critical'
  else if (/높음/.test(head)) level = 'high'          // "중간~높음" 포함 → 상한 채택
  else if (/중간|의존|조건부/.test(head)) level = 'medium'
  else if (/낮음/.test(head)) level = 'low'
  else return null
  return { level, raw: head }
}
function parseType(md: string): string | null {
  const line = md.match(/^-\s*타입\s*[::]\s*(.+)$/m)?.[1]?.trim()
  return line?.match(/[A-Z_]{3,}/)?.[0] ?? null
}

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
      <h1 className="sheet-h1">Announcement</h1>
      <div style={{ height: 20 }} /><PatNotice />
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">ANNOUNCEMENTS</span></div>
      <h1 className="sheet-h1">Announcement</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '6px 0 18px' }}>
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
            <h2 style={{ fontSize: 14.5, margin: '0 0 4px' }} className="px">{s.title}</h2>
            <p style={{ color: 'var(--text-faint)', fontSize: 12.5, margin: '0 0 10px' }}>{s.desc}</p>
            {items.map(d => {
              const key = `${d.folder}/${d.name}`
              const sev = d.folder === 'catalog' ? parseSeverity(d.content) : null
              const typ = d.folder === 'catalog' ? parseType(d.content) : null
              return (
                <div key={key} className="scen" style={{ padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}
                  onClick={() => setOpen(open === key ? null : key)}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span className="sid px">{d.folder === 'snapshots' ? d.name.slice(0, 6) : 'CARD'}</span>
                    {sev && (
                      <span className="sev" style={{ color: SEV_META[sev.level].color, borderColor: SEV_META[sev.level].color }}
                        title={`긴급도: ${sev.raw}`}>
                        <i style={{ background: SEV_META[sev.level].color }} />{SEV_META[sev.level].label}
                      </span>
                    )}
                    {typ && <span className="ann-type px">{typ}</span>}
                    <b style={{ fontSize: 15.5 }}>{(d.content.match(/^#\s+(.+)$/m)?.[1]) ?? d.name}</b>
                    <span className="px" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
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
