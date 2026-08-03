import { NavLink, Link } from 'react-router-dom'
import { useHub, xpNeeded } from '../store'
import { requiredLevel } from '../lib/auth'
import LockIcon from './LockIcon'
import Locks from './Locks'

interface SubTab { to: string; label: string }
interface Tab { to: string; label: string; children?: SubTab[] }

const tabs: Tab[] = [
  {
    to: '/learning', label: '학습', children: [
      { to: '/learning/all', label: 'ALL' },
      { to: '/learning/sprint', label: '스프린트' },
      { to: '/learning/category', label: '주제별' },
      { to: '/learning/review', label: '복습' },
    ],
  },
  {
    to: '/knowledge', label: '지식모음', children: [
      { to: '/knowledge/oci-cli', label: 'OCI CLI' },
      { to: '/knowledge/terraform', label: 'Terraform' },
      { to: '/knowledge/troubleshooting', label: '트러블슈팅' },
      { to: '/knowledge/quote', label: '견적' },
      { to: '/knowledge/meetings', label: '회의록' },
      { to: '/knowledge/announcements', label: 'Announcement' },
    ],
  },
  {
    to: '/schedule', label: '일정관리', children: [
      { to: '/schedule/calendar', label: '월간일정' },
      { to: '/schedule/todo', label: 'TODO LIST' },
      { to: '/schedule/goals', label: '목표' },
    ],
  },
  { to: '/profile', label: '프로필' },
]

export default function Header() {
  const { xp, level, streak, toggleTheme, setHelpOpen, authLevel, openAuth, adjustUiScale } = useHub()
  const req = xpNeeded(level)


  return (
    <header className="hub-header">
      <Link to="/" className="logo"><span className="dot" /><span className="px">정지안의 업무허브</span></Link>
      <nav className="hub-nav">
        {tabs.map(t => {
          const tlv = requiredLevel(t.to)
          return (
            <div key={t.to} className="hub-navitem">
              <NavLink to={t.to} className={({ isActive }) => (isActive ? 'on' : '')}
                onClick={e => { if (tlv > authLevel) { e.preventDefault(); openAuth(tlv) } }}>
                {t.label}<Locks level={tlv} authLevel={authLevel} />
              </NavLink>
              {t.children && (
                <div className="hub-submenu">
                  {t.children.map(c => {
                    const lv = requiredLevel(c.to)
                    return (
                      <NavLink key={c.to} to={c.to} className={({ isActive }) => `hub-subitem${isActive ? ' on' : ''}`}
                        onClick={e => { if (lv > authLevel) { e.preventDefault(); openAuth(lv) } }}>
                        <span>{c.label}</span><Locks level={lv} authLevel={authLevel} />
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="hdr-right">
        <span className="streak px">{streak}일차</span>
        <div className="flex items-center gap-[10px]">
          <span className="lvbadge px">Lv.{level}</span>
          <div className="xpbar"><div className="fill" style={{ width: `${Math.min(100, (xp / req) * 100)}%` }} /></div>
          <span className="xptext px">{xp} / {req} XP</span>
        </div>
        <button className="authbtn px" onClick={() => openAuth()} title="로그인 / 권한">
          <LockIcon open={authLevel > 0} size={13} />
          {authLevel >= 3 ? 'PAT' : authLevel > 0 ? `Lv${authLevel}` : '로그인'}
        </button>
        <button className="iconbtn" onClick={() => adjustUiScale(-1)} title="화면 축소">A−</button>
        <button className="iconbtn" onClick={() => adjustUiScale(1)} title="화면 확대">A+</button>
        <button className="iconbtn" onClick={toggleTheme} title="다크모드 토글 (d)">◐</button>
        <button className="iconbtn px" onClick={() => setHelpOpen(true)} title="단축키 (?)">?</button>
      </div>
    </header>
  )
}
