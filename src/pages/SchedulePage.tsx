import { useNavigate, useParams } from 'react-router-dom'
import { getPat } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'
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
  const pat = getPat()
  const active = VIEWS.find(v => v.id === view)?.id ?? 'calendar'

  return (
    <div className="sched-layout">
      <aside className="sched-nav">
        <div className="sched-nav-title px">일정관리</div>
        {VIEWS.map(v => (
          <button key={v.id} className={`sched-navitem${active === v.id ? ' on' : ''}`} onClick={() => nav(`/schedule/${v.id}`)}>
            <span className="sched-navitem-label">{v.label}</span>
            <span className="sched-navitem-desc px">{v.desc}</span>
          </button>
        ))}
      </aside>
      <main className="sched-main">
        {!pat ? (
          <div style={{ maxWidth: 760 }}>
            <div className="crumb"><span className="px">일정관리</span></div>
            <h1 className="sheet-h1">일정관리</h1>
            <p className="prof-desc">월간일정·TODO·목표는 blog-db 에 동기화되어 기기 간 공유된다. 열람·수정·삭제에는 PAT 등록이 필요하다.</p>
            <div style={{ height: 20 }} /><PatNotice />
          </div>
        ) : active === 'calendar' ? <CalendarView />
          : active === 'todo' ? <TodoView />
            : <GoalsView />}
      </main>
    </div>
  )
}
