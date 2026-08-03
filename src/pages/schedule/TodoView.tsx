import { useRef, useState } from 'react'
import {
  useSyncedJson, SYNC_LABEL, EMPTY_BOARD, EMPTY_JOURNAL, EMPTY_GOALS,
  type Board, type Card, type Journal, type GoalsFile,
} from '../../lib/scheduleDb'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ── 칸반 ─────────────────────────────────────────────── */
function Kanban({ goals }: { goals: GoalsFile['goals'] }) {
  const { data: board, update, sync } = useSyncedJson<Board>('todo/board.json', EMPTY_BOARD, 'todo: 보드 갱신')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [activeGoal, setActiveGoal] = useState('')
  const dragRef = useRef<{ colId: string; cardId: string } | null>(null)
  const goalOf = (id?: string) => goals.find(g => g.id === id)

  const addCard = (colId: string) => {
    const text = (inputs[colId] || '').trim()
    if (!text) return
    const card: Card = { id: `card-${Date.now()}`, text, created: new Date().toISOString(), ...(activeGoal ? { goalId: activeGoal } : {}) }
    update({ columns: board.columns.map(c => c.id === colId ? { ...c, cards: [...c.cards, card] } : c) })
    setInputs({ ...inputs, [colId]: '' })
  }
  const removeCard = (colId: string, cardId: string) =>
    update({ columns: board.columns.map(c => c.id === colId ? { ...c, cards: c.cards.filter(x => x.id !== cardId) } : c) })

  const moveCard = (toCol: string, beforeCardId?: string) => {
    const src = dragRef.current
    if (!src) return
    dragRef.current = null
    const card = board.columns.find(c => c.id === src.colId)?.cards.find(x => x.id === src.cardId)
    if (!card || (src.colId === toCol && src.cardId === beforeCardId)) return
    const cols = board.columns.map(c => ({ ...c, cards: c.cards.filter(x => x.id !== src.cardId) }))
    const target = cols.find(c => c.id === toCol)!
    const idx = beforeCardId ? target.cards.findIndex(x => x.id === beforeCardId) : -1
    if (idx >= 0) target.cards.splice(idx, 0, card); else target.cards.push(card)
    update({ columns: cols })
  }

  return (
    <>
      <div className="todo-toolbar">
        <span className="px sched-sync">{SYNC_LABEL[sync]}</span>
        {goals.length > 0 && (
          <label className="todo-goalpick">
            <span className="px">카드 태그</span>
            <select className="cli-input goal-select" value={activeGoal} onChange={e => setActiveGoal(e.target.value)}>
              <option value="">목표 없음</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="kanban">
        {board.columns.map(col => (
          <div key={col.id} className="kcol"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); moveCard(col.id) }}>
            <div className="kcol-hd">
              <b>{col.title}</b>
              <span className="px" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{col.cards.length}</span>
            </div>
            {col.cards.map(card => {
              const g = goalOf(card.goalId)
              return (
                <div key={card.id} className="kcard" draggable
                  style={g ? { borderLeft: `3px solid ${g.color}` } : undefined}
                  onDragStart={() => { dragRef.current = { colId: col.id, cardId: card.id } }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); moveCard(col.id, card.id) }}>
                  <div style={{ flex: 1 }}>
                    <span>{card.text}</span>
                    {g && <span className="goal-tag px" style={{ borderColor: g.color, color: g.color, marginLeft: 6 }}>{g.title}</span>}
                  </div>
                  <button className="kdel" onClick={() => removeCard(col.id, card.id)} title="삭제">✕</button>
                </div>
              )
            })}
            <div className="kadd">
              <input className="cmdinput" style={{ fontFamily: 'Pretendard', fontSize: 14, padding: '8px 12px' }}
                placeholder="+ 카드 추가"
                value={inputs[col.id] || ''}
                onChange={e => setInputs({ ...inputs, [col.id]: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addCard(col.id) }} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ── 날짜별 일지 (그날의 목표 + 배운 점) ───────────────── */
function JournalLog({ goals }: { goals: GoalsFile['goals'] }) {
  const { data, update, sync } = useSyncedJson<Journal>('schedule/journal.json', EMPTY_JOURNAL, 'journal: 일지 갱신')
  const [date, setDate] = useState(todayIso())
  const cur = data[date] ?? { goal: '', learned: '', goalIds: [] }
  const [goal, setGoal] = useState(cur.goal)
  const [learned, setLearned] = useState(cur.learned)
  const [goalIds, setGoalIds] = useState<string[]>(cur.goalIds ?? [])

  // 날짜 바꾸면 폼을 그 날짜 내용으로
  const pickDate = (d: string) => {
    setDate(d)
    const e = data[d] ?? { goal: '', learned: '', goalIds: [] }
    setGoal(e.goal); setLearned(e.learned); setGoalIds(e.goalIds ?? [])
  }
  const toggleGoal = (id: string) =>
    setGoalIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const saveEntry = () => {
    if (!goal.trim() && !learned.trim()) return
    update({ ...data, [date]: { goal: goal.trim(), learned: learned.trim(), goalIds } })
  }
  const removeEntry = (d: string) => {
    if (!confirm(`${d} 일지를 삭제할까요?`)) return
    const next = { ...data }; delete next[d]; update(next)
    if (d === date) { setGoal(''); setLearned(''); setGoalIds([]) }
  }

  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a))
  const goalOf = (id: string) => goals.find(g => g.id === id)

  return (
    <>
      <div className="todo-toolbar">
        <label className="todo-goalpick">
          <span className="px">날짜</span>
          <input className="cli-input" type="date" value={date} onChange={e => pickDate(e.target.value)} style={{ width: 160 }} />
        </label>
        <span className="px sched-sync">{SYNC_LABEL[sync]}</span>
      </div>

      <div className="jr-editor">
        <label className="jr-label px">오늘의 목표</label>
        <textarea className="cli-input" rows={2} value={goal} onChange={e => setGoal(e.target.value)}
          placeholder="오늘 이루려는 것" />
        <label className="jr-label px">배운 점</label>
        <textarea className="cli-input" rows={4} value={learned} onChange={e => setLearned(e.target.value)}
          placeholder="오늘 배운 것·깨달은 것" />
        {goals.length > 0 && (
          <div className="jr-goals">
            <span className="px" style={{ fontSize: 11, color: 'var(--text-dim)' }}>목표 태그</span>
            {goals.map(g => (
              <button key={g.id} className={`goal-tag px${goalIds.includes(g.id) ? ' on' : ''}`}
                style={{ borderColor: g.color, color: goalIds.includes(g.id) ? '#fff' : g.color, background: goalIds.includes(g.id) ? g.color : 'transparent' }}
                onClick={() => toggleGoal(g.id)}>{g.title}</button>
            ))}
          </div>
        )}
        <button className="submitbtn" style={{ marginTop: 10 }} onClick={saveEntry}>저장</button>
      </div>

      <h3 className="prof-h3">지난 기록</h3>
      {dates.length === 0 && <div className="cmt-empty" style={{ padding: '16px 0' }}>기록 없음</div>}
      <div className="jr-list">
        {dates.map(d => {
          const e = data[d]
          return (
            <div key={d} className="jr-item">
              <div className="jr-item-hd">
                <b className="px">{d.replace(/-/g, '.')}</b>
                <div className="goal-actions">
                  <button className="iconbtn" title="열기" onClick={() => pickDate(d)}>✎</button>
                  <button className="iconbtn" title="삭제" onClick={() => removeEntry(d)}>🗑</button>
                </div>
              </div>
              {e.goal && <div className="jr-row"><span className="jr-tag px">목표</span>{e.goal}</div>}
              {e.learned && <div className="jr-row"><span className="jr-tag px">배운 점</span>{e.learned}</div>}
              {!!e.goalIds?.length && (
                <div className="jr-taglist">
                  {e.goalIds.map(id => { const g = goalOf(id); return g && <span key={id} className="goal-tag px" style={{ borderColor: g.color, color: g.color }}>{g.title}</span> })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function TodoView() {
  const goals = useSyncedJson<GoalsFile>('schedule/goals.json', EMPTY_GOALS, '').data.goals
  const [tab, setTab] = useState<'kanban' | 'journal'>('kanban')
  return (
    <div>
      <div className="sched-head">
        <h1 className="sheet-h1">TODO LIST</h1>
      </div>
      <div className="todo-tabs">
        <button className={`todo-tab${tab === 'kanban' ? ' on' : ''}`} onClick={() => setTab('kanban')}>칸반 보드</button>
        <button className={`todo-tab${tab === 'journal' ? ' on' : ''}`} onClick={() => setTab('journal')}>날짜별 일지</button>
      </div>
      {tab === 'kanban' ? <Kanban goals={goals} /> : <JournalLog goals={goals} />}
    </div>
  )
}
