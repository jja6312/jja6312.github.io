import { useNavigate, useParams } from 'react-router-dom'
import { useHub } from '../store'
import { requiredLevel } from '../lib/auth'
import Locks from '../components/Locks'
import LockedNotice from '../components/LockedNotice'
import CalendarView from './schedule/CalendarView'
import TodoView from './schedule/TodoView'
import GoalsView from './schedule/GoalsView'

const VIEWS = [
  { id: 'calendar', label: '월간일정', desc: '달력에 학습·자격증·일정' },
  { id: 'todo', label: 'TODO LIST', desc: '칸반 + 날짜별 일지' },
  { id: 'goals', label: '목표', desc: '2026 목표 · 마감기한' },
] as const

export default function SchedulePage() {
  const { view } = useParams()
  const nav = useNavigate()
  const { authLevel, openAuth } = useHub()
  const active = VIEWS.find(v => v.id === view)?.id ?? 'calendar'
  const activeLevel = requiredLevel(`/schedule/${active}`)
  const locked = activeLevel > authLevel

  return (
    <div className="sched-layout">
      <aside className="sched-nav">
        <div className="sched-nav-title px">일정관리</div>
        {VIEWS.map(v => {
          const lv = requiredLevel(`/schedule/${v.id}`)
          return (
            <button key={v.id} className={`sched-navitem${active === v.id ? ' on' : ''}`}
              onClick={() => { if (lv > authLevel) openAuth(lv); else nav(`/schedule/${v.id}`) }}>
              <span className="sched-navitem-label">{v.label}<Locks level={lv} authLevel={authLevel} /></span>
              <span className="sched-navitem-desc px">{v.desc}</span>
            </button>
          )
        })}
      </aside>
      <main className="sched-main">
        {locked
          ? <LockedNotice level={activeLevel} authLevel={authLevel} onLogin={() => openAuth(activeLevel)} />
          : active === 'calendar' ? <CalendarView />
            : active === 'todo' ? <TodoView />
              : <GoalsView />}
      </main>
    </div>
  )
}
