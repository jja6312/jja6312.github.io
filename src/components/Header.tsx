import { NavLink, Link } from 'react-router-dom'
import { useHub, xpNeeded } from '../store'

const tabs = [
  { to: '/learning', label: '학습', ready: true },
  { to: '/review', label: '복습', ready: true },
  { to: '/feedback', label: '피드백', ready: true },
  { to: '/troubleshooting', label: '트러블슈팅', ready: true },
  { to: '/todo', label: 'TODO', ready: true },
  { to: '/meetings', label: '회의록', ready: true },
]

export default function Header() {
  const { xp, level, streak, toggleTheme, setHelpOpen } = useHub()
  const req = xpNeeded(level)
  return (
    <header className="hub-header">
      <Link to="/" className="logo"><span className="dot" /><span className="px">정지안의 업무허브</span></Link>
      <nav className="hub-nav">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'on' : '')}>
            {t.label}{!t.ready && <span className="soon">준비중</span>}
          </NavLink>
        ))}
      </nav>
      <div className="hdr-right">
        <span className="streak px">🔥 {streak}일</span>
        <div className="flex items-center gap-[10px]">
          <span className="lvbadge px">Lv.{level}</span>
          <div className="xpbar"><div className="fill" style={{ width: `${Math.min(100, (xp / req) * 100)}%` }} /></div>
          <span className="xptext px">{xp} / {req} XP</span>
        </div>
        <button className="iconbtn" onClick={toggleTheme} title="다크모드 토글 (d)">◐</button>
        <button className="iconbtn px" onClick={() => setHelpOpen(true)} title="단축키 (?)">?</button>
      </div>
    </header>
  )
}
