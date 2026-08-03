import { useEffect, useState } from 'react'
import { useHub } from '../store'
import { getPat, getFile, explainGhError } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'

// 견적서 작성 — 사업부 견적 입력기(quote_form.html)를 blog-db(private)에서 로드해 그대로 구동.
// 도구 산출물(YAML)을 복사해 Claude Code에 전달하면 assemble_quote.py 로 견적 xlsx 가 나온다.
export default function QuotePage() {
  const pat = getPat()
  const { showToast } = useHub()
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pat) return
    setLoading(true)
    getFile(pat, 'tools/quote_form.html')
      .then(f => setHtml(f?.content ?? null))
      .catch(e => showToast(`견적 도구 로드 실패: ${explainGhError(e)}`))
      .finally(() => setLoading(false))
  }, [pat, showToast])

  if (!pat) return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
      <div className="crumb"><span className="px">QUOTE</span></div>
      <h1 className="sheet-h1">견적서 작성</h1>
      <div style={{ height: 20 }} /><PatNotice />
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div className="crumb"><span className="px">QUOTE</span></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 className="sheet-h1">견적서 작성</h1>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          검색으로 항목 추가 → 값 조정 → YAML 생성 → 복사해서 Claude Code에 "견적 만들어줘" → xlsx
        </span>
      </div>
      {loading && <div className="cmt-empty">견적 도구 불러오는 중… (모듈 DB 포함 약 300KB)</div>}
      {html && (
        <iframe
          title="OCI 견적 입력기"
          srcDoc={html}
          style={{
            width: '100%', height: 'calc(100vh - 160px)', minHeight: 640,
            border: '1px solid var(--line)', borderRadius: 14, background: '#f4f6fa',
            marginTop: 14, boxShadow: 'var(--shadow)',
          }}
        />
      )}
    </div>
  )
}
