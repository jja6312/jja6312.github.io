import { NavLink, Link } from 'react-router-dom'
import { useHub, xpNeeded } from '../store'
import { getPat } from '../lib/githubDb'
import LockIcon from './LockIcon'

const tabs = [
  { to: '/learning', label: '학습' },
  { to: '/review', label: '복습' },
  { to: '/knowledge', label: '지식모음' },
  { to: '/todo', label: 'TODO', locked: true },
  { to: '/profile', label: '프로필' },
]

export default function Header() {
  const { xp, level, streak, toggleTheme, setHelpOpen } = useHub()
  const req = xpNeeded(level)
  const hasPat = !!getPat()
  return (
    <header className="hub-header">
      <Link to="/" className="logo"><span className="dot" /><span className="px">정지안의 업무허브</span></Link>
      <nav className="hub-nav">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'on' : '')}>
            {t.label}
            {t.locked && !hasPat && <span className="lockmark" title="PAT 등록 시 열람"><LockIcon /></span>}
          </NavLink>
        ))}
      </nav>
      <div className="hdr-right">
        <span className="streak px">{streak}일차</span>
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
