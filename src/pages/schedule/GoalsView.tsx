import { useRef, useState } from 'react'
import {
  useSyncedJson, SYNC_LABEL, GOAL_COLORS, rollupGoal, dday,
  EMPTY_GOALS, EMPTY_BOARD, EMPTY_JOURNAL, type GoalsFile, type Goal,
  type Board, type CalData, type Journal,
} from '../../lib/scheduleDb'
import { useHub } from '../../store'

const ddayLabel = (n: number) => n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `D+${-n} 지남`

export default function GoalsView() {
  const rewardActivity = useHub(state => state.rewardActivity)
  const { data, update, sync, writable } = useSyncedJson<GoalsFile>('schedule/goals.json', EMPTY_GOALS, 'goals: 목표 갱신')
  // 진척 집계용 — 읽기 전용 로드
  const board = useSyncedJson<Board>('todo/board.json', EMPTY_BOARD, '').data
  const cal = useSyncedJson<CalData>('profile/calendar.json', {} as CalData, '').data
  const journal = useSyncedJson<Journal>('schedule/journal.json', EMPTY_JOURNAL, '').data

  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [undated, setUndated] = useState(false)      // 연월일 미정
  const [editId, setEditId] = useState<string | null>(null)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)

  const goals = data.goals

  const add = () => {
    if (!title.trim() || (!undated && !deadline)) return
    const g: Goal = {
      id: `goal-${Date.now()}`, title: title.trim(), deadline: undated ? '' : deadline,
      color: GOAL_COLORS[goals.length % GOAL_COLORS.length], createdAt: new Date().toISOString(),
    }
    update({ ...data, goals: [...goals, g] })
    rewardActivity(`goal-created:${g.id}`, 5, '새 목표 등록', 'once')
    setTitle(''); setDeadline(''); setUndated(false)
  }
  const saveEdit = (id: string, patch: Partial<Goal>) =>
    update({ ...data, goals: goals.map(g => g.id === id ? { ...g, ...patch } : g) })
  const remove = (id: string) => { if (confirm('이 목표를 삭제할까요?')) update({ ...data, goals: goals.filter(g => g.id !== id) }) }
  const moveGoal = (beforeId?: string) => {
    const id = dragRef.current
    dragRef.current = null; setDragId(null)
    if (!id || id === beforeId) return
    const moved = goals.find(goal => goal.id === id)
    if (!moved) return
    const reordered = goals.filter(goal => goal.id !== id)
    const index = beforeId ? reordered.findIndex(goal => goal.id === beforeId) : -1
    if (index >= 0) reordered.splice(index, 0, moved)
    else reordered.push(moved)
    update({ ...data, goals: reordered })
  }

  return (
    <div>
      <div className="sched-head">
        <h1 className="sheet-h1">목표</h1>
        <span className="px sched-sync">{SYNC_LABEL[sync]}</span>
      </div>
      <p className="prof-desc">
        2026년 목표와 마감기한. 월간일정·TODO 항목을 이 목표에 태그하면 진척이 자동 집계되고, 무슨 작업을 했는지 역추적된다.
      </p>

      <section className="goal-long-term">
        <div className="goal-long-term-head">
          <div>
            <span className="px">LONG-TERM DIRECTION</span>
            <h2>장기 목표</h2>
          </div>
          <span className="goal-long-term-hint">몇 년 뒤 도달할 방향과 기준을 자유롭게 기록</span>
        </div>
        <textarea className="cli-input goal-long-term-area" rows={5} value={data.longTermGoal ?? ''} readOnly={!writable}
          placeholder="예: 클라우드 아키텍트 역량을 완성하고 기술 리더로 성장하기\n핵심 자격증 · 전문 분야 · 커리어 방향을 함께 적어두세요."
          onChange={event => update({ ...data, longTermGoal: event.target.value })} />
      </section>

      {/* 목표 추가 */}
      {writable && <div className="goal-add">
        <input className="cli-input" style={{ flex: 1 }} placeholder="목표 (예: RHCE 취득)"
          value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <input className="cli-input" type="date" style={{ width: 160 }} value={undated ? '' : deadline} disabled={undated}
          onChange={e => setDeadline(e.target.value)} />
        <label className="goal-undated px"><input type="checkbox" checked={undated} onChange={e => setUndated(e.target.checked)} /> 미정</label>
        <button className="submitbtn" onClick={add}>추가</button>
      </div>}

      {goals.length === 0 && <div className="cmt-empty" style={{ padding: '28px 0' }}>등록된 목표 없음 — 위에서 2026년 목표를 추가하세요.</div>}

      <div className="goal-list" onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); moveGoal() }}>
        {goals.map(g => {
          const r = rollupGoal(g.id, cal, board, journal)
          const pct = r.total ? Math.round((r.done / r.total) * 100) : 0
          const d = g.deadline ? dday(g.deadline) : 0
          const editing = editId === g.id
          const open = expandId === g.id
          return (
            <div key={g.id} className={`goal-card${dragId === g.id ? ' dragging' : ''}`}
              style={{ borderLeftColor: g.color }} draggable={!editing && writable}
              onDragStart={event => {
                dragRef.current = g.id; setDragId(g.id)
                event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', g.id)
              }}
              onDragEnd={() => { dragRef.current = null; setDragId(null) }}
              onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); event.stopPropagation(); moveGoal(g.id) }}>
              {editing && writable ? (
                <div className="goal-edit">
                  <input className="cli-input" defaultValue={g.title} id={`gt-${g.id}`} style={{ flex: 1 }} />
                  <input className="cli-input" type="date" defaultValue={g.deadline} id={`gd-${g.id}`} style={{ width: 150 }} title="비우면 미정" />
                  <button className="submitbtn" onClick={() => {
                    const t = (document.getElementById(`gt-${g.id}`) as HTMLInputElement).value.trim()
                    const dl = (document.getElementById(`gd-${g.id}`) as HTMLInputElement).value
                    if (t) saveEdit(g.id, { title: t, deadline: dl })
                    setEditId(null)
                  }}>저장</button>
                  <button className="iconbtn" onClick={() => setEditId(null)}>✕</button>
                </div>
              ) : (
                <>
                  <div className="goal-top">
                    {writable && <span className="goal-drag-handle" title="드래그하여 순서 변경">⠿</span>}
                    <b className="goal-title">{g.title}</b>
                    {g.deadline ? (<>
                      <span className={`goal-dday${d < 0 ? ' over' : d <= 30 ? ' near' : ''}`}>{ddayLabel(d)}</span>
                      <span className="px goal-deadline">{g.deadline.replace(/-/g, '.')}</span>
                    </>) : (
                      <span className="goal-dday undated">미정</span>
                    )}
                    {writable && <div className="goal-actions">
                      <button className="iconbtn" title="수정" onClick={() => setEditId(g.id)}>✎</button>
                      <button className="iconbtn" title="삭제" onClick={() => remove(g.id)}>🗑</button>
                    </div>}
                  </div>
                  <div className="goal-prog">
                    <div className="goal-bar"><div className="goal-fill" style={{ width: `${pct}%`, background: g.color }} /></div>
                    <span className="px goal-pct">{r.done}/{r.total} · {pct}%</span>
                    <button className="goal-expand" onClick={() => setExpandId(open ? null : g.id)}>
                      {open ? '▾ 연결 항목 접기' : `▸ 연결 항목 ${r.items.length}개`}
                    </button>
                  </div>
                  {open && (
                    <div className="goal-links">
                      {r.items.length === 0 && <div className="cmt-empty" style={{ padding: '8px 0', fontSize: 13 }}>연결된 항목 없음 — 일정·TODO에서 이 목표를 태그하세요.</div>}
                      {r.items.map((it, i) => (
                        <div key={i} className={`goal-link${it.done ? ' done' : ''}`}>
                          <span className="goal-link-kind px">{it.kind}</span>
                          {it.date && <span className="px goal-link-date">{it.date.replace(/-/g, '.')}</span>}
                          <span className="goal-link-text">{it.text}</span>
                          {it.done && <span className="goal-link-check">✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
