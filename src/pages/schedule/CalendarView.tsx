import { useMemo, useState } from 'react'
import {
  useSyncedJson, SYNC_LABEL, CATS, EMPTY_GOALS,
  type CalData, type CalEvent, type Cat, type GoalsFile,
} from '../../lib/scheduleDb'

const catColor = (c: Cat) => CATS.find(x => x.id === c)?.color ?? 'var(--text-dim)'
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export default function CalendarView() {
  const { data, update, sync } = useSyncedJson<CalData>('profile/calendar.json', {} as CalData, 'profile: 달력 갱신')
  const goals = useSyncedJson<GoalsFile>('schedule/goals.json', EMPTY_GOALS, '').data.goals
  const goalOf = (id?: string) => goals.find(g => g.id === id)
  const evColor = (e: CalEvent) => goalOf(e.goalId)?.color ?? catColor(e.cat)

  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [cat, setCat] = useState<Cat>('study')
  const [goalId, setGoalId] = useState('')

  const addEvent = () => {
    if (!sel || !draft.trim()) return
    const ev: CalEvent = { id: `ev-${Date.now()}`, text: draft.trim(), cat, ...(goalId ? { goalId } : {}) }
    update({ ...data, [sel]: [...(data[sel] ?? []), ev] })
    setDraft('')
  }
  const editEvent = (date: string, id: string) => {
    const ev = (data[date] ?? []).find(e => e.id === id)
    if (!ev) return
    const t = prompt('일정 수정', ev.text)
    if (t == null) return
    update({ ...data, [date]: (data[date] ?? []).map(e => e.id === id ? { ...e, text: t.trim() } : e) })
  }
  const removeEvent = (date: string, id: string) => {
    const rest = (data[date] ?? []).filter(e => e.id !== id)
    const next = { ...data }
    if (rest.length) next[date] = rest; else delete next[date]
    update(next)
  }

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay()
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const arr: (number | null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) arr.push(d)
    return arr
  }, [cursor])

  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate())
  const move = (delta: number) => {
    const m = cursor.m + delta
    setCursor({ y: cursor.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 })
    setSel(null)
  }
  const selEvents = sel ? (data[sel] ?? []) : []

  return (
    <div>
      <div className="sched-head">
        <h1 className="sheet-h1">월간일정</h1>
        <span className="px sched-sync">{SYNC_LABEL[sync]}</span>
      </div>
      <p className="prof-desc">
        날짜를 눌러 학습·자격증·일정을 붙인다. 목표를 태그하면 목표색으로 표시되고 해당 목표 진척에 집계된다.
      </p>

      <div className="cal-top">
        <div className="cal-nav">
          <button className="iconbtn" onClick={() => move(-1)} title="이전 달">‹</button>
          <b className="px">{cursor.y}년 {cursor.m + 1}월</b>
          <button className="iconbtn" onClick={() => move(1)} title="다음 달">›</button>
          <button className="cal-today" onClick={() => { setCursor({ y: today.getFullYear(), m: today.getMonth() }); setSel(todayIso) }}>오늘</button>
        </div>
        <div className="cal-legend">
          {CATS.map(c => (<span key={c.id} className="cal-lg"><i style={{ background: c.color }} />{c.label}</span>))}
        </div>
      </div>

      <div className="cal-grid">
        {WEEK.map((w, i) => (<div key={w} className={`cal-wk${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{w}</div>))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="cal-cell empty" />
          const date = iso(cursor.y, cursor.m, d)
          const evs = data[date] ?? []
          return (
            <div key={date}
              className={`cal-cell${date === todayIso ? ' today' : ''}${date === sel ? ' sel' : ''}`}
              onClick={() => setSel(date === sel ? null : date)}>
              <span className="cal-d">{d}</span>
              <div className="cal-dots">
                {evs.slice(0, 4).map(e => <i key={e.id} style={{ background: evColor(e) }} />)}
              </div>
            </div>
          )
        })}
      </div>

      {sel && (
        <div className="cal-editor">
          <div className="cal-ed-hd">
            <b className="px">{sel.replace(/-/g, '.')}</b>
            <button className="iconbtn" onClick={() => setSel(null)} title="닫기">✕</button>
          </div>
          {selEvents.length === 0 && <div className="cmt-empty" style={{ padding: '10px 0', fontSize: 13 }}>등록된 일정 없음</div>}
          {selEvents.map(e => {
            const g = goalOf(e.goalId)
            return (
              <div key={e.id} className="cal-ev">
                <i style={{ background: evColor(e) }} />
                <span style={{ flex: 1 }}>{e.text}</span>
                {g && <span className="goal-tag px" style={{ borderColor: g.color, color: g.color }}>{g.title}</span>}
                <span className="px" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{CATS.find(c => c.id === e.cat)?.label}</span>
                <button className="iconbtn" onClick={() => editEvent(sel, e.id)} title="수정">✎</button>
                <button className="kdel" onClick={() => removeEvent(sel, e.id)} title="삭제">✕</button>
              </div>
            )
          })}
          <div className="cal-add">
            <div className="cal-cats">
              {CATS.map(c => (
                <button key={c.id} className={`cal-cat${cat === c.id ? ' on' : ''}`}
                  style={cat === c.id ? { borderColor: c.color, color: c.color } : undefined}
                  onClick={() => setCat(c.id)}>{c.label}</button>
              ))}
              {goals.length > 0 && (
                <select className="cli-input goal-select" value={goalId} onChange={e => setGoalId(e.target.value)}>
                  <option value="">목표 없음</option>
                  {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              )}
            </div>
            <input className="cmdinput" style={{ fontFamily: 'Pretendard', fontSize: 14, padding: '8px 12px' }}
              placeholder="+ 일정·학습 내용" value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addEvent() }} />
          </div>
        </div>
      )}
    </div>
  )
}
