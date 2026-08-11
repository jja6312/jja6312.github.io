import { useMemo, useState } from 'react'
import { useProtectedData, type SupportHistoryCase } from '../lib/protectedData'
import { useHub } from '../store'

const EMPTY_CASES: SupportHistoryCase[] = []
const dateLabel = (value: string) => value.replaceAll('-', '.')
const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`

function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="support-metric">
      <span className="px">{label}</span>
      <b>{value}{unit && <small>{unit}</small>}</b>
    </div>
  )
}

function CaseDetail({ item }: { item: SupportHistoryCase }) {
  const v = item.validation
  return (
    <div className="support-detail" onClick={event => event.stopPropagation()}>
      <section>
        <h3>고객 요청</h3>
        <p>{item.request}</p>
      </section>

      <section>
        <h3>답변 결론</h3>
        <ul>{item.conclusion.map(line => <li key={line}>{line}</li>)}</ul>
      </section>

      <section>
        <div className="support-section-head">
          <h3>첨부자료 기반 검증</h3>
          <span className="support-result ok">882 / 882 성공</span>
        </div>
        <p className="support-muted">{v.environment}</p>
        <p>{v.method}</p>
        <div className="support-metrics">
          <Metric label="성공률" value="100" unit="%" />
          <Metric label="평균" value={v.latencyMs.average} unit="ms" />
          <Metric label="p95" value={v.latencyMs.p95} unit="ms" />
          <Metric label="최대" value={v.latencyMs.max} unit="ms" />
        </div>
        <dl className="support-facts">
          <div><dt>시험 시간</dt><dd>{durationLabel(v.durationSeconds)}</dd></div>
          <div><dt>쓰기 조건</dt><dd>{v.workload}</dd></div>
          <div><dt>커널 관측</dt><dd>{v.kernelObservation}</dd></div>
          <div><dt>판정</dt><dd>{v.result}</dd></div>
        </dl>
      </section>

      <section>
        <h3>운영 적용 전 주의사항</h3>
        <ul className="support-cautions">{item.cautions.map(line => <li key={line}>{line}</li>)}</ul>
      </section>

      <section>
        <h3>첨부 근거</h3>
        <div className="support-evidence">
          {item.evidence.map(evidence => (
            <article key={evidence.name}>
              <div><span className="px">{evidence.type}</span><b>{evidence.name}</b></div>
              <p>{evidence.finding}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3>다음 지원에 재사용할 체크리스트</h3>
        <ol className="support-checklist">{item.reusableChecklist.map(line => <li key={line}>{line}</li>)}</ol>
      </section>

      <section className="support-source">
        <h3>원본 기록</h3>
        <dl className="support-facts">
          <div><dt>메일</dt><dd>{item.source.subject}</dd></div>
          <div><dt>발송</dt><dd>{dateLabel(item.date)} {item.time} · {item.source.mailbox}</dd></div>
          <div><dt>첨부</dt><dd>{item.source.attachmentCount}개</dd></div>
        </dl>
        <p>{item.source.privacy}</p>
        {item.references.map(reference => (
          <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.label} ↗</a>
        ))}
      </section>
    </div>
  )
}

export default function SupportHistoryPage() {
  const protectedState = useProtectedData()
  const rewardActivity = useHub(state => state.rewardActivity)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const cases = protectedState.data?.supportHistory ?? EMPTY_CASES

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return cases
    return cases.filter(item => JSON.stringify(item).toLowerCase().includes(needle))
  }, [cases, query])

  const stats = useMemo(() => ({
    total: cases.length,
    completed: cases.filter(item => item.status === '완료').length,
    customers: new Set(cases.map(item => item.customer)).size,
    services: new Set(cases.flatMap(item => item.services)).size,
  }), [cases])

  if (!protectedState.data) return (
    <div className="support-page support-loading">
      <div className="crumb"><span className="px">SUPPORT HISTORY</span></div>
      <h1 className="sheet-h1">지원이력</h1>
      <div className="cmt-empty">{protectedState.loading ? '보호된 지원이력을 복호화하는 중…' : protectedState.error}</div>
    </div>
  )

  return (
    <div className="support-page">
      <div className="crumb"><span className="px">SUPPORT HISTORY</span></div>
      <h1 className="sheet-h1">지원이력</h1>
      <p className="support-intro">굵직한 고객 지원을 요청·판단·검증·결과로 축적한다. 메일과 첨부자료에서 재사용할 수 있는 근거만 추려 자물쇠3으로 보호한다.</p>

      <div className="support-summary" aria-label="지원이력 요약">
        <Metric label="전체" value={stats.total} unit="건" />
        <Metric label="완료" value={stats.completed} unit="건" />
        <Metric label="고객사" value={stats.customers} unit="곳" />
        <Metric label="서비스" value={stats.services} unit="개" />
      </div>

      <input className="cmdinput support-search" placeholder="고객사·서비스·증상·조치·첨부내용 검색"
        value={query} onChange={event => setQuery(event.target.value)} />

      {filtered.length === 0 && <div className="cmt-empty">{query ? '검색 결과가 없습니다.' : '아직 지원이력이 없습니다.'}</div>}

      <div className="support-list">
        {filtered.map(item => {
          const isOpen = openId === item.id
          return (
            <article key={item.id} className={`support-card${isOpen ? ' open' : ''}`}
              onClick={() => {
                const next = isOpen ? null : item.id
                setOpenId(next)
                if (next) rewardActivity(`support-history-read:${item.id}`, 3, '지원이력 확인', 'once')
              }}>
              <header>
                <div className="support-date">
                  <span className="px">{dateLabel(item.date)}</span>
                  <small>{item.time}</small>
                </div>
                <div className="support-title">
                  <div>
                    <span className="support-status">{item.status}</span>
                    <span className="support-customer">{item.customer}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                </div>
                <button type="button" aria-expanded={isOpen} aria-label={`${item.title} ${isOpen ? '접기' : '열기'}`}>
                  {isOpen ? '−' : '+'}
                </button>
              </header>
              <div className="support-tags">{[...item.services, ...item.tags].map(tag => <span key={tag}>{tag}</span>)}</div>
              {isOpen && <CaseDetail item={item} />}
            </article>
          )
        })}
      </div>
    </div>
  )
}
