import { NavLink, Link } from 'react-router-dom'
import { useHub, xpNeeded } from '../store'
import { getPat } from '../lib/githubDb'
import LockIcon from './LockIcon'

interface SubTab { to: string; label: string; locked?: boolean }
interface Tab { to: string; label: string; locked?: boolean; children?: SubTab[] }

const tabs: Tab[] = [
  {
    to: '/learning', label: '학습', children: [
      { to: '/learning/all', label: 'ALL' },
      { to: '/learning/sprint', label: '스프린트' },
      { to: '/learning/category', label: '카테고리' },
    ],
  },
  { to: '/review', label: '복습' },
  {
    to: '/knowledge', label: '지식모음', children: [
      { to: '/knowledge/troubleshooting', label: '트러블슈팅' },
      { to: '/knowledge/announcements', label: 'Announcement', locked: true },
      { to: '/knowledge/oci-cli', label: 'OCI CLI' },
      { to: '/knowledge/terraform', label: 'Terraform' },
      { to: '/knowledge/quote', label: '견적', locked: true },
      { to: '/knowledge/meetings', label: '회의록', locked: true },
    ],
  },
  {
    to: '/schedule', label: '일정관리', locked: true, children: [
      { to: '/schedule/calendar', label: '월간일정' },
      { to: '/schedule/todo', label: 'TODO LIST' },
      { to: '/schedule/goals', label: '목표' },
    ],
  },
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
          <div key={t.to} className="hub-navitem">
            <NavLink to={t.to} className={({ isActive }) => (isActive ? 'on' : '')}>
              {t.label}
              {t.locked && !hasPat && <span className="lockmark" title="PAT 등록 시 열람"><LockIcon /></span>}
            </NavLink>
            {t.children && (
              <div className="hub-submenu">
                {t.children.map(c => (
                  <NavLink key={c.to} to={c.to} className={({ isActive }) => `hub-subitem${isActive ? ' on' : ''}`}>
                    {c.label}
                    {c.locked && !hasPat && <span className="lockmark" title="PAT 등록 시 열람"><LockIcon /></span>}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
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
