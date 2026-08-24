import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { activityDay, useHub, xpNeeded } from '../store'
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
      { to: '/learning/request', label: '학습자료 생성 요청' },
    ],
  },
  {
    to: '/knowledge', label: '지식모음', children: [
      { to: '/knowledge/oci-cli', label: 'OCI CLI' },
      { to: '/knowledge/cli-wizard', label: 'CLI UI Wizard' },
      { to: '/knowledge/oci-policy', label: 'OCI Policy' },
      { to: '/knowledge/terraform', label: 'Terraform' },
      { to: '/knowledge/troubleshooting', label: '트러블슈팅' },
      { to: '/knowledge/support-history', label: '지원이력' },
      { to: '/knowledge/quote', label: '견적' },
      { to: '/knowledge/provisioning', label: '프로비저닝 관리' },
      { to: '/knowledge/meetings', label: '회의록' },
      { to: '/knowledge/announcements', label: 'Announcement' },
    ],
  },
  {
    to: '/schedule', label: '일정관리', children: [
      { to: '/schedule/calendar', label: '월간일정' },
      { to: '/schedule/tasks', label: '업무관리' },
      { to: '/schedule/todo', label: 'TODO LIST' },
      { to: '/schedule/goals', label: '목표' },
      { to: '/schedule/automation-inbox', label: '업무 자동 수집함' },
    ],
  },
  { to: '/profile', label: '프로필' },
]

export default function Header() {
  const { xp, level, streak, activityAwards, toggleTheme, setHelpOpen, authLevel, openAuth, adjustUiScale } = useHub()
  const req = xpNeeded(level)
  const todaySystems = Object.entries(activityAwards).filter(([id, day]) => id.startsWith('system:') && day === activityDay()).length
  const [menuOpen, setMenuOpen] = useState(false)

  // 네비 + 게이트 + (모바일)드로어 닫기 를 한 번에
  const gate = (e: React.MouseEvent, lv: number) => { if (lv > authLevel) { e.preventDefault(); openAuth(lv) } }
  const gateMobile = (e: React.MouseEvent, lv: number) => { gate(e, lv); setMenuOpen(false) }

  return (
    <header className="hub-header">
      <Link to="/" className="logo" onClick={() => setMenuOpen(false)}><span className="dot" /><span className="px">정지안의 업무허브</span></Link>

      {/* 데스크탑 네비 (hover 서브메뉴) */}
      <nav className="hub-nav">
        {tabs.map(t => {
          const tlv = requiredLevel(t.to)
          return (
            <div key={t.to} className="hub-navitem">
              <NavLink to={t.to} className={({ isActive }) => (isActive ? 'on' : '')} onClick={e => gate(e, tlv)}>
                {t.label}<Locks level={tlv} authLevel={authLevel} />
              </NavLink>
              {t.children && (
                <div className="hub-submenu">
                  {t.children.map(c => {
                    const lv = requiredLevel(c.to)
                    return (
                      <NavLink key={c.to} to={c.to} className={({ isActive }) => `hub-subitem${isActive ? ' on' : ''}`} onClick={e => gate(e, lv)}>
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
        <span className="streak px hide-mobile" title="오늘 처음 사용한 시스템마다 +3 XP">
          {streak}일차 · 오늘 {todaySystems}곳
        </span>
        <div className="flex items-center gap-[10px] hide-mobile">
          <span className="lvbadge px">Lv.{level}</span>
          <div className="xpbar"><div className="fill" style={{ width: `${Math.min(100, (xp / req) * 100)}%` }} /></div>
          <span className="xptext px">{xp} / {req} XP</span>
        </div>
        <button className="authbtn px" onClick={() => openAuth()} title="로그인 / 권한">
          <LockIcon open={authLevel > 0} size={13} />
          {authLevel > 0 ? `Lv${authLevel}` : '로그인'}
        </button>
        <button className="iconbtn hide-mobile" onClick={() => adjustUiScale(-1)} title="화면 축소">A−</button>
        <button className="iconbtn hide-mobile" onClick={() => adjustUiScale(1)} title="화면 확대">A+</button>
        <button className="iconbtn hide-mobile" onClick={toggleTheme} title="다크모드 토글 (d)">◐</button>
        <button className="iconbtn px hide-mobile" onClick={() => setHelpOpen(true)} title="단축키 (?)">?</button>
        {/* 모바일 햄버거 */}
        <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="메뉴" aria-expanded={menuOpen}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* 모바일 드로어 — 전체 메뉴(탭+서브+자물쇠) */}
      {menuOpen && (
        <div className="mdrawer-scrim" onClick={() => setMenuOpen(false)}>
          <nav className="mdrawer" onClick={e => e.stopPropagation()}>
            {tabs.map(t => {
              const tlv = requiredLevel(t.to)
              return (
                <div key={t.to} className="mdrawer-group">
                  <NavLink to={t.to} className={({ isActive }) => `mdrawer-tab${isActive ? ' on' : ''}`} onClick={e => gateMobile(e, tlv)}>
                    {t.label}<Locks level={tlv} authLevel={authLevel} />
                  </NavLink>
                  {t.children?.map(c => {
                    const lv = requiredLevel(c.to)
                    return (
                      <NavLink key={c.to} to={c.to} className={({ isActive }) => `mdrawer-sub${isActive ? ' on' : ''}`} onClick={e => gateMobile(e, lv)}>
                        <span>{c.label}</span><Locks level={lv} authLevel={authLevel} />
                      </NavLink>
                    )
                  })}
                </div>
              )
            })}
            <div className="mdrawer-actions">
              <button className="authbtn px" onClick={() => { setMenuOpen(false); openAuth() }}>
                <LockIcon open={authLevel > 0} size={13} />{authLevel > 0 ? `Lv${authLevel}` : '로그인'}
              </button>
              <button className="iconbtn" onClick={toggleTheme} title="다크모드">◐</button>
              <button className="iconbtn" onClick={() => adjustUiScale(-1)} title="축소">A−</button>
              <button className="iconbtn" onClick={() => adjustUiScale(1)} title="확대">A+</button>
              <button className="iconbtn px" onClick={() => { setMenuOpen(false); setHelpOpen(true) }} title="단축키">?</button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
