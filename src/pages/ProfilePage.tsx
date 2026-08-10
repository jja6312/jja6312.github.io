import { PROFILE, CAREER, PROFILE_HIGHLIGHTS, SKILL_SCOPES, EDUCATION, CERT_GROUPS, CONTRIBUTIONS } from '../data/profile'

/* 근속 자동계산 — 입사일 기준 오늘까지. "N년 M개월 (D일)" */
function tenure(hireDate: string): string {
  const start = new Date(hireDate + 'T00:00:00')
  const now = new Date()
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000)
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  if (now.getDate() < start.getDate()) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  const ym = years > 0 ? `${years}년 ${months}개월` : `${months}개월`
  return `${ym} (${days.toLocaleString()}일)`
}

function Certs() {
  const total = CERT_GROUPS.reduce((n, g) => n + g.certs.length, 0)
  return (
    <section className="prof-sec">
      <div className="prof-h2-row">
        <h2 className="prof-h2">보유 자격증</h2>
        <span className="chip goal">{total}개</span>
      </div>
      <p className="prof-desc">영역별 분류 — 클라우드 CSP 전방위 + 국가기술자격 기반.</p>

      {CERT_GROUPS.map(g => (
        <div key={g.domain} className="cert-grp">
          <div className="cert-dom px">{g.domain}</div>
          <div className="cert-list">
            {g.certs.map(c => (
              <div key={c.name} className="cert-card">
                <b>{c.name}</b>
                <div className="cert-meta">
                  <span>{c.issued} 취득{c.expires ? ` · ~${c.expires}` : ''}</span>
                  {c.id && <code className="mono cert-id">{c.id}</code>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function Contributions() {
  return (
    <section className="prof-sec">
      <div className="prof-h2-row">
        <h2 className="prof-h2">기여이력</h2>
        <span className="chip goal">{CONTRIBUTIONS.length}개</span>
      </div>
      <p className="prof-desc">오픈소스 메인 레포에 정식 머지된 기여.</p>
      <div className="contrib-list">
        {CONTRIBUTIONS.map(c => (
          <a key={c.url} className="contrib-card" href={c.url} target="_blank" rel="noreferrer">
            <div className="contrib-top">
              <b className="contrib-project">{c.project}</b>
              <span className="chip">{c.kind}</span>
              <span className="px contrib-ref">{c.ref}</span>
            </div>
            <div className="contrib-title mono">{c.title}</div>
            <p className="contrib-summary">{c.summary}</p>
            <div className="contrib-meta">
              <code className="mono">{c.repo}</code>
              <span className="px">{c.date}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

function Career() {
  return (
    <section className="prof-sec">
      <div className="prof-h2-row">
        <h2 className="prof-h2">경력</h2>
        <span className="chip goal">검증된 사실 기준</span>
      </div>
      <p className="prof-desc">직함보다 실제로 맡은 범위와 결과를 적었습니다.</p>
      <div className="career-list">
        {CAREER.map(item => (
          <article className="career-card" key={`${item.company}-${item.period}`}>
            <div className="career-head">
              <div>
                <h3>{item.company}</h3>
                <div className="career-role">{item.role}</div>
              </div>
              <span className="px career-period">{item.period}</span>
            </div>
            <p>{item.summary}</p>
            <ul>{item.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>
            <div className="prof-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Highlights() {
  return (
    <section className="prof-sec">
      <div className="prof-h2-row">
        <h2 className="prof-h2">주요 경험</h2>
        <span className="chip goal">{PROFILE_HIGHLIGHTS.length}개</span>
      </div>
      <p className="prof-desc">문제를 발견하고, 판단하고, 결과를 만든 흐름으로 정리했습니다.</p>
      <div className="highlight-list">
        {PROFILE_HIGHLIGHTS.map(item => (
          <article className="highlight-card" key={item.title}>
            <h3>{item.title}</h3>
            <dl>
              <div><dt>상황</dt><dd>{item.context}</dd></div>
              <div><dt>행동</dt><dd>{item.action}</dd></div>
              <div><dt>결과</dt><dd>{item.result}</dd></div>
            </dl>
            <div className="prof-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Skills() {
  return (
    <section className="prof-sec">
      <h2 className="prof-h2">기술 범위</h2>
      <p className="prof-desc">실무 경험과 학습 중인 기술을 섞지 않았습니다.</p>
      <div className="skill-scope-grid">
        {SKILL_SCOPES.map(scope => (
          <article className="skill-scope-card" key={scope.label}>
            <h3>{scope.label}</h3>
            <p>{scope.description}</p>
            <ul>{scope.items.map(item => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function Education() {
  return (
    <section className="prof-sec">
      <h2 className="prof-h2">학력·교육</h2>
      <div className="education-list">
        {EDUCATION.map(item => (
          <article key={item.name}>
            <div><b>{item.name}</b><span className="px">{item.period}</span></div>
            <p>{item.note}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function ProfilePage() {
  const since = PROFILE.hireDate.replace(/-/g, '.')
  return (
    <div className="prof-wrap">
      <header className="prof-hero">
        <div className="crumb"><span className="px">PROFILE</span></div>
        <h1 className="sheet-h1">{PROFILE.name}</h1>
        <div className="prof-role">{PROFILE.role}</div>
        <div className="prof-sub">{PROFILE.company} · {since} 입사 · OCI {tenure(PROFILE.hireDate)}</div>
        <p className="prof-tag">{PROFILE.tagline}</p>
        <p className="prof-summary">{PROFILE.summary}</p>
        <a className="prof-gh" href={PROFILE.github} target="_blank" rel="noreferrer">{PROFILE.github.replace('https://', '')}</a>
      </header>

      <Career />
      <Highlights />
      <Skills />
      <Contributions />
      <Education />
      <Certs />
    </div>
  )
}
