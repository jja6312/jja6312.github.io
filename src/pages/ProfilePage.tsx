import { PROFILE, CERT_GROUPS } from '../data/profile'
import { activityDay, useHub, xpNeeded } from '../store'

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

export default function ProfilePage() {
  const since = PROFILE.hireDate.replace(/-/g, '.')
  const { xp, level, totalXp, streak, activityDays, activityAwards } = useHub()
  const required = xpNeeded(level)
  const todaySystems = Object.entries(activityAwards).filter(([id, day]) => id.startsWith('system:') && day === activityDay()).length
  return (
    <div className="prof-wrap">
      <header className="prof-hero">
        <div className="crumb"><span className="px">PROFILE</span></div>
        <h1 className="sheet-h1">{PROFILE.name}</h1>
        <div className="prof-role">{PROFILE.role}</div>
        <div className="prof-sub">{PROFILE.company} · {since} 입사 · OCI {tenure(PROFILE.hireDate)}</div>
        <p className="prof-tag">{PROFILE.tagline}</p>
        <a className="prof-gh" href={PROFILE.github} target="_blank" rel="noreferrer">{PROFILE.github.replace('https://', '')}</a>
      </header>

      <section className="prof-sec activity-achievement">
        <div className="prof-h2-row">
          <h2 className="prof-h2">활동 성취</h2>
          <span className="chip goal">TOTAL {totalXp.toLocaleString()} XP</span>
        </div>
        <p className="prof-desc">학습뿐 아니라 업무허브의 도구를 꾸준히 사용한 기록입니다.</p>
        <div className="activity-stat-grid">
          <div className="activity-stat"><span className="px">LEVEL</span><b>{level}</b></div>
          <div className="activity-stat"><span className="px">STREAK</span><b>{streak}일</b></div>
          <div className="activity-stat"><span className="px">ACTIVE DAYS</span><b>{activityDays.length}일</b></div>
          <div className="activity-stat"><span className="px">TODAY</span><b>{todaySystems}개 시스템</b></div>
        </div>
        <div className="activity-level-row">
          <span className="px">LV.{level}</span>
          <div className="activity-level-bar"><div style={{ width: `${Math.min(100, (xp / required) * 100)}%` }} /></div>
          <span className="px">{xp} / {required} XP</span>
        </div>
        <p className="activity-xp-guide">시스템 첫 사용 +3 XP · 문서 확인 +2 XP · 저장 +5 XP · TODO 완료 +8 XP</p>
      </section>

      <section className="prof-sec">
        <div className="prof-h2-row">
          <h2 className="prof-h2">프로젝트</h2>
        </div>
        <div className="cmt-empty" style={{ padding: '26px 0' }}>등록된 프로젝트가 없습니다.</div>
      </section>
      <Certs />
    </div>
  )
}
