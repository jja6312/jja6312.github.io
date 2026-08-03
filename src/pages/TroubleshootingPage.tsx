import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useHub } from '../store'
import { getPat, listDir, getFileByUrl, putFile, explainGhError } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'

interface CaseDoc { name: string; content: string }

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9가-힣\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'case'

// 구조화 입력 필드 — 증상/원인/조치/재발방지
const FIELDS = [
  { key: 'symptom', label: '증상', ph: '무엇이 어떻게 안 되었나 — 에러 메시지·현상' },
  { key: 'cause', label: '원인', ph: '근본 원인 (확인된 것)' },
  { key: 'action', label: '조치', ph: '어떻게 해결했나 — 실행한 명령·설정 변경' },
  { key: 'prevention', label: '재발 방지', ph: '다시 안 겪으려면 — 모니터링·점검·문서화' },
] as const
type FieldKey = typeof FIELDS[number]['key']

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
  const [fields, setFields] = useState<Record<FieldKey, string>>({ symptom: '', cause: '', action: '', prevention: '' })
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

  const reset = () => { setTitle(''); setTags(''); setFields({ symptom: '', cause: '', action: '', prevention: '' }) }

  const submit = async () => {
    if (!title.trim() || !fields.symptom.trim()) { showToast('제목·증상은 필수'); return }
    const now = new Date()
    const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const path = `troubleshooting/cases/${ymd}_${slugify(title)}.md`
    const tagLine = tags.trim() ? `\n태그: ${tags.split(',').map(t => `#${t.trim()}`).join(' ')}\n` : '\n'
    const bodyMd = FIELDS.filter(f => fields[f.key].trim())
      .map(f => `## ${f.label}\n\n${fields[f.key].trim()}\n`).join('\n')
    const md = `# ${title.trim()}\n\n- 작성: ${now.toISOString().slice(0, 10)} (사이트)${tagLine}\n${bodyMd}\n`
    setBusy(true)
    try {
      await putFile(pat, path, md, `case: ${title.trim()}`)
      showToast('트러블슈팅 기록 완료 ✓')
      setWriting(false); reset(); refresh()
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
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '6px 0 18px' }}>
        내가 해결한 트러블슈팅 기록 — 증상·원인·조치·재발 방지를 구조화해 남긴다. blog-db <code className="mono">troubleshooting/cases/</code>.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input className="cmdinput" style={{ fontFamily: 'Pretendard' }} placeholder="검색 (제목·본문 전체)"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className="submitbtn" onClick={() => setWriting(w => !w)}>{writing ? '닫기' : '+ 새 기록'}</button>
      </div>

      {writing && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 18 }}>
          <label className="ts-flabel px">제목 <span className="ts-req">*</span></label>
          <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 12 }} placeholder="한 줄 요약 (예: LB 502 — 백엔드 헬스체크 실패)"
            value={title} onChange={e => setTitle(e.target.value)} />
          <label className="ts-flabel px">태그</label>
          <input className="cmdinput" style={{ fontFamily: 'Pretendard', marginBottom: 12, fontSize: 13 }} placeholder="쉼표로 구분 (예: Lockton, LoadBalancer, 헬스체크)"
            value={tags} onChange={e => setTags(e.target.value)} />
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="ts-flabel px">{f.label}{f.key === 'symptom' && <span className="ts-req">*</span>}</label>
              <textarea className="cmdinput" style={{ minHeight: f.key === 'symptom' || f.key === 'action' ? 90 : 64, marginBottom: 12 }}
                placeholder={f.ph} value={fields[f.key]}
                onChange={e => setFields(s => ({ ...s, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ textAlign: 'right' }}>
            <button className="submitbtn" disabled={busy} onClick={submit}>{busy ? 'commit 중…' : 'commit'}</button>
          </div>
        </div>
      )}

      {loading && <div className="cmt-empty">불러오는 중…</div>}
      {!loading && filtered.length === 0 && (
        <div className="cmt-empty" style={{ padding: '30px 0' }}>
          {q ? '검색 결과 없음' : '아직 기록이 없습니다. + 새 기록으로 시작하세요.'}
        </div>
      )}

      {filtered.map(c => (
        <div key={c.name} className="scen" style={{ padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}
          onClick={() => setOpen(open?.name === c.name ? null : c)}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span className="sid px">{c.name.slice(0, 6)}</span>
            <b style={{ fontSize: 15.5 }}>{(c.content.match(/^#\s+(.+)$/m)?.[1]) ?? c.name}</b>
            <span className="px" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
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
