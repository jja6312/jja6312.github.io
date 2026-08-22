// 업무관리 → TODO 보드 조정(reconcile)의 순수 로직. React 의존 없음 → Node 로 직접 테스트 가능.
// scheduleDb.ts 가 이 모듈을 import 해 타입과 함께 재노출한다.

export const RECURRING_PREFIX = '[주기성업무]'

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ISO 8601 주차(월요일 시작, 목요일 기준 연도)
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

/** 같은 주기 안에서 카드 1건만 생성되게 하는 식별자 */
export function periodKey(now, cadence) {
  const y = now.getFullYear()
  if (cadence === 'daily') return iso(now)
  if (cadence === 'weekly') { const { year, week } = isoWeek(now); return `${year}-W${String(week).padStart(2, '0')}` }
  if (cadence === 'monthly') return `${y}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return `${y}-Q${Math.floor(now.getMonth() / 3) + 1}` // quarterly
}

/**
 * 업무관리 항목을 TODO 보드에 반영. 순수 함수. 변경 없으면 null.
 * - 미완료 항목이 '할 일'에 없으면 source 로 중복 확인 후 추가. 주기성은 현재 주기 1건.
 * - '할 일'의 source 카드 중 원본이 완료/삭제/비활성이면 제거. 진행중·완료 칼럼은 사용자 소유 → 불변.
 */
export function reconcileTasksToBoard(board, tasks, now = new Date()) {
  const today = iso(now)
  const started = s => !s || s <= today
  const withinWindow = (s, e) => started(s) && (!e || today <= e)

  const desired = []
  for (const r of tasks.recurring || []) {
    if (!r.active || !withinWindow(r.startDate, r.dueDate)) continue
    desired.push({ source: `rec:${r.id}:${periodKey(now, r.cadence)}`, text: `${RECURRING_PREFIX}${r.title}` })
  }
  const addWork = list => {
    for (const w of list || []) {
      if (w.done || !started(w.startDate)) continue
      const threads = w.threads ?? []
      if (threads.length === 0) desired.push({ source: `task:${w.id}`, text: w.title, dueAt: w.dueDate || undefined })
      else for (const th of threads) if (!th.done && String(th.content ?? '').trim()) desired.push({ source: `thread:${w.id}:${th.id}`, text: `[${w.title}]${th.content}`, dueAt: w.dueDate || undefined })
    }
  }
  addWork(tasks.oneoff); addWork(tasks.projects)

  const existing = new Set()
  for (const col of board.columns) for (const c of col.cards) if (c.source) existing.add(c.source)

  const additions = []
  let seq = 0
  for (const d of desired) {
    if (existing.has(d.source)) continue
    additions.push({ id: `task-${now.getTime()}-${seq++}`, text: d.text, created: now.toISOString(), kind: 'task', source: d.source, ...(d.dueAt ? { dueAt: d.dueAt } : {}) })
  }

  const recById = new Map((tasks.recurring || []).map(r => [r.id, r]))
  const workById = new Map()
  for (const w of [...(tasks.oneoff || []), ...(tasks.projects || [])]) workById.set(w.id, w)
  const staleInTodo = c => {
    if (!c.source) return false
    const [kind, id, extra] = c.source.split(':')
    if (kind === 'rec') { const r = recById.get(id); return !r || !r.active }
    if (kind === 'task') { const w = workById.get(id); return !w || !!w.done }
    if (kind === 'thread') { const w = workById.get(id); if (!w || w.done) return true; const th = (w.threads ?? []).find(t => t.id === extra); return !th || !!th.done }
    return false
  }

  let removed = 0
  const columns = board.columns.map(col => {
    if (col.id !== 'todo') return col
    const kept = col.cards.filter(c => { const drop = staleInTodo(c); if (drop) removed++; return !drop })
    return { ...col, cards: [...kept, ...additions] }
  })
  if (additions.length === 0 && removed === 0) return null
  return { columns }
}
