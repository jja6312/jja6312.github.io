import { useEffect, useState } from 'react'
import {
  useSyncedJson, SYNC_LABEL, EMPTY_TASKS, EMPTY_BOARD, reconcileTasksToBoard,
  CADENCES, cadenceLabel, RECURRING_PREFIX,
  type TasksFile, type RecurringTask, type WorkTask, type TaskThread, type TaskCadence, type Board,
} from '../../lib/scheduleDb'
import { useHub } from '../../store'

type Tab = 'recurring' | 'oneoff' | 'projects'
const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'recurring', label: '주기성 업무', desc: '주기마다 TODO 자동 생성' },
  { id: 'oneoff', label: '단발성 업무', desc: '스레드 · 미완료는 TODO 등록' },
  { id: 'projects', label: '프로젝트', desc: '스레드 · 미완료는 TODO 등록' },
]
const fmtDate = (s?: string) => (s ? s.replace(/-/g, '.') : '미정')
const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

export default function TasksView() {
  const rewardActivity = useHub(s => s.rewardActivity)
  const tasks = useSyncedJson<TasksFile>('schedule/tasks.json', EMPTY_TASKS, 'tasks: 업무 갱신')
  const board = useSyncedJson<Board>('todo/board.json', EMPTY_BOARD, 'todo: 보드 갱신')
  const data = tasks.data
  const writable = tasks.writable

  // 업무 → TODO 보드 조정: 진입/변경 시 미완료 항목을 카드로 생성, 완료·삭제분은 '할 일'에서 제거
  useEffect(() => {
    // board/tasks가 실제 GitHub 데이터를 읽기 전에 EMPTY_BOARD를 저장하지 않는다.
    // 이 경합이 수동 TODO 카드를 지우고 주기성 카드만 남기는 원인이었다.
    if (!board.writable || board.sync === 'loading' || tasks.sync === 'loading') return
    const next = reconcileTasksToBoard(board.data, data)
    if (next) board.update(next)
  }, [data, tasks.sync, board])

  const [tab, setTab] = useState<Tab>('recurring')

  const setRecurring = (next: RecurringTask[]) => tasks.update({ ...data, recurring: next })
  const setList = (key: 'oneoff' | 'projects', next: WorkTask[]) => tasks.update({ ...data, [key]: next })

  return (
    <div>
      <div className="sched-head">
        <h1 className="sheet-h1">업무관리</h1>
        <span className="px sched-sync">{SYNC_LABEL[tasks.sync]}</span>
      </div>
      <p className="prof-desc">
        주기성·단발성·프로젝트 업무를 관리한다. 미완료 항목은 <b>TODO LIST에 자동 등록</b>된다 —
        주기성은 <span className="px">{RECURRING_PREFIX}제목</span>으로 주기마다, 단발성·프로젝트는 스레드가 있으면
        <span className="px"> [제목]스레드</span>, 없으면 제목 그대로. (TODO는 열 때 갱신)
      </p>

      <div className="task-tabs">
        {TABS.map(x => (
          <button key={x.id} className={`task-tab${tab === x.id ? ' on' : ''}`} onClick={() => setTab(x.id)}>
            <span>{x.label}</span><span className="px task-tab-desc">{x.desc}</span>
          </button>
        ))}
      </div>

      {tab === 'recurring'
        ? <RecurringPanel items={data.recurring} writable={writable} onChange={setRecurring} reward={rewardActivity} />
        : <WorkPanel key={tab} kind={tab} items={data[tab]} writable={writable} onChange={next => setList(tab, next)} reward={rewardActivity} />}
    </div>
  )
}

/* ── 시작일·마감일 (빈 값 = 미정) ── */
function DateRange({ start, due, onStart, onDue, disabled }: { start?: string; due?: string; onStart: (v: string) => void; onDue: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="task-dates">
      <label className="task-date"><span className="px">시작</span><input className="cli-input" type="date" value={start ?? ''} disabled={disabled} onChange={e => onStart(e.target.value)} /></label>
      <label className="task-date"><span className="px">마감</span><input className="cli-input" type="date" value={due ?? ''} disabled={disabled} onChange={e => onDue(e.target.value)} /></label>
      <span className="px task-date-hint">비우면 미정</span>
    </div>
  )
}

/* ── 주기성 업무 ── */
function RecurringPanel({ items, writable, onChange, reward }: { items: RecurringTask[]; writable: boolean; onChange: (n: RecurringTask[]) => void; reward: (id: string, xp: number, label: string, mode?: 'once') => void }) {
  const [title, setTitle] = useState('')
  const [cadence, setCadence] = useState<TaskCadence>('weekly')
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  const add = () => {
    if (!title.trim()) return
    const r: RecurringTask = { id: uid('rec'), title: title.trim(), cadence, active: true, createdAt: new Date().toISOString(), ...(start ? { startDate: start } : {}), ...(due ? { dueDate: due } : {}) }
    onChange([...items, r]); reward(`task-created:${r.id}`, 5, '새 업무 등록', 'once')
    setTitle(''); setStart(''); setDue('')
  }
  const patch = (id: string, p: Partial<RecurringTask>) => onChange(items.map(r => r.id === id ? { ...r, ...p } : r))
  const remove = (id: string) => {
    if (!confirm('이 주기성 업무를 삭제할까요? (TODO의 미완료 카드도 정리됩니다)')) return
    if (editId === id) setEditId(null)
    onChange(items.filter(r => r.id !== id))
  }

  return (
    <div className="task-panel">
      {writable && (
        <div className="task-add">
          <input className="cli-input task-add-title" placeholder="주기성 업무 (예: 주간 운영 보고서 작성)" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <select className="cli-input task-cadence" value={cadence} onChange={e => setCadence(e.target.value as TaskCadence)}>
            {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <DateRange start={start} due={due} onStart={setStart} onDue={setDue} />
          <button className="submitbtn" onClick={add}>추가</button>
        </div>
      )}
      {items.length === 0 && <div className="cmt-empty" style={{ padding: '24px 0' }}>주기성 업무 없음 — 반복 업무를 추가하면 주기마다 TODO에 자동 등록됩니다.</div>}
      <div className="task-list">
        {items.map(r => (
          <div key={r.id} className={`task-card task-recurring-card${r.active ? '' : ' task-inactive'}`}>
            <div className="task-card-top">
              <span className="task-badge rec">{cadenceLabel(r.cadence)}</span>
              <b className="task-title">{r.title}</b>
              <span className="px task-range">{fmtDate(r.startDate)} ~ {fmtDate(r.dueDate)}</span>
              {writable && <div className="task-actions">
                <label className="task-toggle px" title="비활성화하면 TODO 자동 생성이 멈춥니다"><input type="checkbox" checked={r.active} onChange={e => patch(r.id, { active: e.target.checked })} /> {r.active ? '활성' : '중지'}</label>
                <button className="iconbtn" title={editId === r.id ? '수정 닫기' : '수정'} aria-expanded={editId === r.id}
                  onClick={() => setEditId(current => current === r.id ? null : r.id)}>✎</button>
                <button className="iconbtn" title="삭제" onClick={() => remove(r.id)}>🗑</button>
              </div>}
            </div>
            {writable && (
              <div className={`task-inline-edit${editId === r.id ? ' open' : ''}`}>
                <input className="cli-input" defaultValue={r.title} onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.title) patch(r.id, { title: v }) }} />
                <select className="cli-input task-cadence" value={r.cadence} onChange={e => patch(r.id, { cadence: e.target.value as TaskCadence })}>{CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                <DateRange start={r.startDate} due={r.dueDate} onStart={v => patch(r.id, { startDate: v || undefined })} onDue={v => patch(r.id, { dueDate: v || undefined })} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 단발성 업무 · 프로젝트 (스레드) ── */
function WorkPanel({ kind, items, writable, onChange, reward }: { kind: 'oneoff' | 'projects'; items: WorkTask[]; writable: boolean; onChange: (n: WorkTask[]) => void; reward: (id: string, xp: number, label: string, mode?: 'once') => void }) {
  const noun = kind === 'oneoff' ? '단발성 업무' : '프로젝트'
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [threadDraft, setThreadDraft] = useState<Record<string, string>>({})

  const add = () => {
    if (!title.trim()) return
    const w: WorkTask = { id: uid(kind), title: title.trim(), threads: [], createdAt: new Date().toISOString(), ...(start ? { startDate: start } : {}), ...(due ? { dueDate: due } : {}) }
    onChange([...items, w]); reward(`task-created:${w.id}`, 5, '새 업무 등록', 'once')
    setTitle(''); setStart(''); setDue('')
  }
  const patch = (id: string, p: Partial<WorkTask>) => onChange(items.map(w => w.id === id ? { ...w, ...p } : w))
  const remove = (id: string) => { if (confirm(`이 ${noun}를 삭제할까요? (TODO의 미완료 카드도 정리됩니다)`)) onChange(items.filter(w => w.id !== id)) }
  const setThreads = (id: string, threads: TaskThread[]) => patch(id, { threads })
  const addThread = (w: WorkTask) => {
    const c = (threadDraft[w.id] || '').trim(); if (!c) return
    setThreads(w.id, [...(w.threads ?? []), { id: uid('th'), content: c }])
    setThreadDraft(d => ({ ...d, [w.id]: '' }))
  }

  return (
    <div className="task-panel">
      {writable && (
        <div className="task-add">
          <input className="cli-input task-add-title" placeholder={`${noun} 제목`} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <DateRange start={start} due={due} onStart={setStart} onDue={setDue} />
          <button className="submitbtn" onClick={add}>추가</button>
        </div>
      )}
      {items.length === 0 && <div className="cmt-empty" style={{ padding: '24px 0' }}>{noun} 없음 — 추가하면 미완료 항목이 TODO에 등록됩니다.</div>}
      <div className="task-list">
        {items.map(w => {
          const threads = w.threads ?? []
          return (
            <div key={w.id} className={`task-card${w.done ? ' task-done' : ''}`}>
              <div className="task-card-top">
                {writable && <label className="task-check" title="완료 처리하면 TODO 미완료 카드가 정리됩니다"><input type="checkbox" checked={!!w.done} onChange={e => patch(w.id, { done: e.target.checked })} /></label>}
                <b className="task-title">{w.title}</b>
                <span className="px task-range">{fmtDate(w.startDate)} ~ {fmtDate(w.dueDate)}</span>
                {threads.length > 0 && <span className="px task-thread-count">스레드 {threads.filter(t => !t.done).length}/{threads.length}</span>}
                {writable && <div className="task-actions">
                  <button className="iconbtn" title="삭제" onClick={() => remove(w.id)}>🗑</button>
                </div>}
              </div>
              {writable && (
                <div className="task-inline-edit">
                  <input className="cli-input" defaultValue={w.title} onBlur={e => { const v = e.target.value.trim(); if (v && v !== w.title) patch(w.id, { title: v }) }} />
                  <DateRange start={w.startDate} due={w.dueDate} onStart={v => patch(w.id, { startDate: v || undefined })} onDue={v => patch(w.id, { dueDate: v || undefined })} />
                </div>
              )}

              {/* 스레드 */}
              <div className="task-threads">
                {threads.map(t => (
                  <div key={t.id} className={`task-thread${t.done ? ' done' : ''}`}>
                    {writable && <input type="checkbox" checked={!!t.done} onChange={e => setThreads(w.id, threads.map(x => x.id === t.id ? { ...x, done: e.target.checked } : x))} />}
                    <span className="task-thread-text">{t.content}</span>
                    <span className="px task-thread-todo" title="TODO 카드 제목">{`[${w.title}]${t.content}`}</span>
                    {writable && <button className="iconbtn task-thread-del" title="스레드 삭제" onClick={() => setThreads(w.id, threads.filter(x => x.id !== t.id))}>✕</button>}
                  </div>
                ))}
                {writable && (
                  <div className="task-thread-add">
                    <input className="cli-input" placeholder="스레드 추가 (세부 작업 · 진행 항목)" value={threadDraft[w.id] || ''}
                      onChange={e => setThreadDraft(d => ({ ...d, [w.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addThread(w) }} />
                    <button className="iconbtn" title="스레드 추가" onClick={() => addThread(w)}>＋</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
