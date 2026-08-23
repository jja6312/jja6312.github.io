import { useNavigate, useParams } from 'react-router-dom'
import { useHub } from '../store'
import { requiredLevel } from '../lib/auth'
import Locks from '../components/Locks'
import LockedNotice from '../components/LockedNotice'
import CalendarView from './schedule/CalendarView'
import TasksView from './schedule/TasksView'
import TodoView from './schedule/TodoView'
import GoalsView from './schedule/GoalsView'
import AiGoalsView from './schedule/AiGoalsView'
import AutomationInboxView from './schedule/AutomationInboxView'
import { getPat } from '../lib/githubDb'

const VIEWS = [
  { id: 'calendar', label: '월간일정', desc: '달력에 학습·자격증·일정' },
  { id: 'tasks', label: '업무관리', desc: '주기성·단발성·프로젝트 → TODO 연동' },
  { id: 'todo', label: 'TODO LIST', desc: '칸반 + 날짜별 일지' },
  { id: 'goals', label: '목표', desc: '2026 목표 · 마감기한' },
  { id: 'ai-goals', label: 'AI 추천 목표', desc: '학습수준 진단 → 3년·1년·4개월' },
  { id: 'automation-inbox', label: '업무 자동 수집함', desc: 'Outlook·카카오톡 후보 검토 → TODO' },
] as const

export default function SchedulePage() {
  const { view } = useParams()
  const nav = useNavigate()
  const { authLevel, openAuth } = useHub()
  const active = VIEWS.find(v => v.id === view)?.id ?? 'calendar'
  const activeLevel = requiredLevel(`/schedule/${active}`)
  const locked = activeLevel > authLevel
  const pat = getPat()

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
        {!locked && !pat && (
          <div className="cross-note" style={{ marginBottom: 16 }}>
            자물쇠 비밀번호로 암호화 스냅샷을 열었습니다. 현재는 <b>읽기 전용</b>이며, 수정·GitHub 동기화에만 PAT가 필요합니다.
          </div>
        )}
        {locked
          ? <LockedNotice level={activeLevel} authLevel={authLevel} onLogin={() => openAuth(activeLevel)} />
          : active === 'calendar' ? <CalendarView />
            : active === 'tasks' ? <TasksView />
              : active === 'todo' ? <TodoView />
            : active === 'ai-goals' ? <AiGoalsView />
                  : active === 'automation-inbox' ? <AutomationInboxView />
                  : <GoalsView />}
      </main>
    </div>
  )
}
