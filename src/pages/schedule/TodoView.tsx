import { useRef, useState } from 'react'
import {
  useSyncedJson, SYNC_LABEL, EMPTY_BOARD, EMPTY_JOURNAL, EMPTY_GOALS,
  CARD_KINDS, kindColor, cardDoneDate,
  type Board, type Card, type CardKind, type Journal, type GoalsFile,
} from '../../lib/scheduleDb'
import { useHub } from '../../store'

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => isoOf(new Date())

export default function TodoView() {
  const rewardActivity = useHub(state => state.rewardActivity)
  const goals = useSyncedJson<GoalsFile>('schedule/goals.json', EMPTY_GOALS, '').data.goals
  const board = useSyncedJson<Board>('todo/board.json', EMPTY_BOARD, 'todo: 보드 갱신')
  const journal = useSyncedJson<Journal>('schedule/journal.json', EMPTY_JOURNAL, 'journal: 일지 갱신')
  const writable = board.writable && journal.writable

  const [date, setDate] = useState(todayIso())
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [kind, setKind] = useState<CardKind>('task')
  const [activeGoal, setActiveGoal] = useState('')
  const [editId, setEditId] = useState<string | null>(null)   // 수정 중인 카드
  const [editText, setEditText] = useState('')
  const dragRef = useRef<{ colId: string; cardId: string } | null>(null)

  const goalOf = (id?: string) => goals.find(g => g.id === id)
  const entry = journal.data[date] ?? { goal: '', learned: '', goalIds: [] }
  const setEntry = (patch: Partial<typeof entry>) =>
    journal.update({ ...journal.data, [date]: { goal: entry.goal, learned: entry.learned, goalIds: entry.goalIds, ...patch } })

  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + delta); setDate(isoOf(d))
  }

  // ── 칸반 ──
  const addCard = (colId: string) => {
    const text = (inputs[colId] || '').trim()
    if (!text) return
    const card: Card = {
      id: `card-${Date.now()}`, text, created: new Date().toISOString(), kind,
      ...(activeGoal ? { goalId: activeGoal } : {}),
      ...(colId === 'done' ? { doneAt: date } : {}),
    }
    board.update({ columns: board.data.columns.map(c => c.id === colId ? { ...c, cards: [...c.cards, card] } : c) })
    setInputs({ ...inputs, [colId]: '' })
  }
  const removeCard = (colId: string, cardId: string) =>
    board.update({ columns: board.data.columns.map(c => c.id === colId ? { ...c, cards: c.cards.filter(x => x.id !== cardId) } : c) })
  const patchCard = (cardId: string, patch: Partial<Card>) =>
    board.update({ columns: board.data.columns.map(c => ({ ...c, cards: c.cards.map(x => x.id === cardId ? { ...x, ...patch } : x) })) })
  const saveEdit = () => {
    const t = editText.trim()
    if (editId && t) patchCard(editId, { text: t })
    setEditId(null); setEditText('')
  }
  const moveCard = (toCol: string, beforeCardId?: string) => {
    const src = dragRef.current
    if (!src) return
    dragRef.current = null
    const found = board.data.columns.find(c => c.id === src.colId)?.cards.find(x => x.id === src.cardId)
    if (!found || (src.colId === toCol && src.cardId === beforeCardId)) return
    // 완료로 들어오면 그날짜 스탬프, 완료에서 나가면 해제
    const moved: Card = { ...found }
    if (toCol === 'done') moved.doneAt = date
    else delete moved.doneAt
    const cols = board.data.columns.map(c => ({ ...c, cards: c.cards.filter(x => x.id !== src.cardId) }))
    const target = cols.find(c => c.id === toCol)!
    const idx = beforeCardId ? target.cards.findIndex(x => x.id === beforeCardId) : -1
    if (idx >= 0) target.cards.splice(idx, 0, moved); else target.cards.push(moved)
    board.update({ columns: cols })
    if (src.colId !== 'done' && toCol === 'done') {
      rewardActivity(`todo-complete:${moved.id}`, 8, 'TODO 완료', 'once')
    }
  }

  return (
    <div>
      <div className="sched-head">
        <h1 className="sheet-h1">TODO LIST</h1>
        <div className="todo-datenav" style={{ marginLeft: 'auto' }}>
          <button className="iconbtn" onClick={() => shiftDate(-1)} title="이전 날">‹</button>
          <input className="cli-input todo-dateinput" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="iconbtn" onClick={() => shiftDate(1)} title="다음 날">›</button>
          <button className="cal-today" onClick={() => setDate(todayIso())}>오늘</button>
        </div>
        <span className="px sched-sync">{SYNC_LABEL[journal.sync]}</span>
      </div>

      {/* ── 오늘의 목표 (상단, 길게) ── */}
      <section className="todo-band">
        <label className="todo-band-label px">오늘의 목표</label>
        <textarea className="cli-input todo-band-area" rows={3} value={entry.goal} readOnly={!writable}
          placeholder="오늘 이루려는 것 — 하루의 방향" onChange={e => setEntry({ goal: e.target.value })} />
      </section>

      {/* ── 칸반 (중간) ── */}
      <div className="todo-toolbar">
        <div className="todo-kindpick">
          {CARD_KINDS.map(k => (
            <button key={k.id} disabled={!writable} className={`kind-btn${kind === k.id ? ' on' : ''}`}
              style={kind === k.id ? { background: k.color, borderColor: k.color, color: '#111' } : { borderColor: k.color, color: k.color }}
              onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>
        {goals.length > 0 && (
          <label className="todo-goalpick">
            <span className="px">목표 태그</span>
            <select className="cli-input goal-select" disabled={!writable} value={activeGoal} onChange={e => setActiveGoal(e.target.value)}>
              <option value="">없음</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
        )}
        <span className="px sched-sync">{SYNC_LABEL[board.sync]}</span>
      </div>

      <div className="kanban">
        {board.data.columns.map(col => {
          // 완료 칼럼은 선택 날짜의 완료분만 — 할일/진행중은 항상 유지
          const cards = col.id === 'done' ? col.cards.filter(c => cardDoneDate(c) === date) : col.cards
          return (
            <div key={col.id} className="kcol"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); moveCard(col.id) }}>
              <div className="kcol-hd">
                <b>{col.title}</b>
                <span className="px" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{cards.length}</span>
              </div>
              {cards.map(card => {
                const g = goalOf(card.goalId)
                const kc = kindColor(card.kind)
                const editing = editId === card.id
                return (
                  <div key={card.id} className="kcard" draggable={!editing && writable}
                    style={kc ? { borderLeft: `3px solid ${kc}` } : undefined}
                    onDragStart={() => { dragRef.current = { colId: col.id, cardId: card.id } }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); moveCard(col.id, card.id) }}>
                    {editing ? (
                      <input className="cli-input kcard-edit" autoFocus value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditId(null); setEditText('') } }}
                        onBlur={saveEdit} />
                    ) : (
                      <div style={{ flex: 1 }} onDoubleClick={() => { setEditId(card.id); setEditText(card.text) }} title="더블클릭하여 수정">
                        {card.kind && <span className="kind-chip" style={{ background: kc }}>{CARD_KINDS.find(k => k.id === card.kind)?.label}</span>}
                        <span>{card.text}</span>
                        {g && <span className="goal-tag px" style={{ borderColor: g.color, color: g.color, marginLeft: 6 }}>{g.title}</span>}
                      </div>
                    )}
                    {!editing && writable && (
                      <div className="kcard-btns">
                        <button className="kedit" onClick={() => { setEditId(card.id); setEditText(card.text) }} title="수정">✎</button>
                        <button className="kdel" onClick={() => removeCard(col.id, card.id)} title="삭제">✕</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {writable && <div className="kadd">
                <input className="cmdinput" style={{ fontFamily: 'Pretendard', fontSize: 14, padding: '8px 12px' }}
                  placeholder={col.id === 'done' ? `+ 완료 (${date.slice(5).replace('-', '.')})` : `+ ${CARD_KINDS.find(k => k.id === kind)?.label} 추가`}
                  value={inputs[col.id] || ''}
                  onChange={e => setInputs({ ...inputs, [col.id]: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') addCard(col.id) }} />
              </div>}
            </div>
          )
        })}
      </div>

      {/* ── 배운 점 (하단, 길게) ── */}
      <section className="todo-band">
        <label className="todo-band-label px">배운 점</label>
        <textarea className="cli-input todo-band-area" rows={4} value={entry.learned} readOnly={!writable}
          placeholder="오늘 배운 것·깨달은 것" onChange={e => setEntry({ learned: e.target.value })} />
        {goals.length > 0 && (
          <div className="jr-goals">
            <span className="px" style={{ fontSize: 11, color: 'var(--text-dim)' }}>목표 태그</span>
            {goals.map(g => {
              const on = entry.goalIds?.includes(g.id)
              return (
                <button key={g.id} disabled={!writable} className={`goal-tag px${on ? ' on' : ''}`}
                  style={{ borderColor: g.color, color: on ? '#fff' : g.color, background: on ? g.color : 'transparent' }}
                  onClick={() => setEntry({ goalIds: on ? (entry.goalIds ?? []).filter(x => x !== g.id) : [...(entry.goalIds ?? []), g.id] })}>
                  {g.title}
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
