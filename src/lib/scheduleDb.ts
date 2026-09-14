// 일정관리(월간일정·TODO·목표) 공통 데이터 계층 — blog-db 동기화 훅 + 타입 + 연동 헬퍼
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPat, getFile, putFile } from './githubDb'
import { protectedJson, useProtectedData } from './protectedData'
import { useHub } from '../store'
import { canWriteSchedule } from './scheduleWriteAccess.mjs'

const activityLabel = (path: string) => path.startsWith('todo/') ? 'TODO 저장'
  : path.includes('calendar') ? '일정 저장'
    : path.includes('goals') ? '목표 저장'
      : path.includes('journal') ? '일지 저장'
        : path.includes('provisioning') ? '프로비저닝 저장'
          : '업무 데이터 저장'

/* ── 동기화 상태 ─────────────────────────────────────── */
export type Sync = 'loading' | 'synced' | 'local' | 'readonly' | 'dirty' | 'saving' | 'error'
export const SYNC_LABEL: Record<Sync, string> = {
  loading: '불러오는 중…', synced: '✓ 동기화됨', dirty: '● 변경됨 (곧 commit)',
  local: '◎ 이 브라우저에 임시 저장', readonly: '🔒 읽기 전용 · 수정은 PAT 필요',
  saving: '↑ commit 중…', error: '⚠ 저장 실패',
}

const LOCAL_DRAFT_PREFIX = 'hub-schedule-draft:'
const draftKey = (path: string) => `${LOCAL_DRAFT_PREFIX}${path}`
const readLocalDraft = <T,>(path: string): T | undefined => {
  try {
    const raw = localStorage.getItem(draftKey(path))
    return raw ? JSON.parse(raw) as T : undefined
  } catch { return undefined }
}
const writeLocalDraft = <T,>(path: string, value: T) => {
  try { localStorage.setItem(draftKey(path), JSON.stringify(value)) } catch { /* 저장 공간/브라우저 설정 문제 */ }
}
const clearLocalDraft = (path: string) => {
  try { localStorage.removeItem(draftKey(path)) } catch { /* 저장소 접근 불가 */ }
}

/* blog-db JSON 파일 1개를 로드→편집→3초 debounce commit 하는 범용 훅.
   월간일정/칸반/일지/목표가 전부 이 패턴 — TodoPage·Calendar 의 중복을 하나로. */
export function useSyncedJson<T>(path: string, empty: T, commitMsg: string) {
  const pat = getPat()
  const authLevel = useHub(s => s.authLevel)
  const protectedState = useProtectedData()
  const [data, setData] = useState<T>(empty)
  const [sync, setSync] = useState<Sync>('loading')
  const [patVersion, setPatVersion] = useState(0)
  const shaRef = useRef<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyRef = useRef(empty)
  const ref = useRef(data)
  ref.current = data
  const snapshot = protectedJson(protectedState.data, path)
  const canWriteLocal = canWriteSchedule({ hasPat: !!pat, authLevel, hasSnapshot: snapshot !== undefined })

  useEffect(() => {
    const onPatChanged = () => setPatVersion(version => version + 1)
    window.addEventListener('hub-pat-changed', onPatChanged)
    return () => window.removeEventListener('hub-pat-changed', onPatChanged)
  }, [])

  const save = useCallback(async () => {
    if (!pat) { setSync('readonly'); return }
    setSync('saving')
    const body = JSON.stringify(ref.current, null, 2) + '\n'
    try {
      shaRef.current = await putFile(pat, path, body, commitMsg, shaRef.current)
      clearLocalDraft(path)
      setSync('synced')
      useHub.getState().rewardActivity(`save:${path}`, 5, activityLabel(path))
    } catch {
      // sha 충돌 → 최신 sha 재취득 후 1회 재시도 (마지막 쓰기 우선)
      try {
        const f = await getFile(pat, path)
        shaRef.current = await putFile(pat, path, body, commitMsg, f?.sha)
        clearLocalDraft(path)
        setSync('synced')
        useHub.getState().rewardActivity(`save:${path}`, 5, activityLabel(path))
      } catch { setSync('error') }
    }
  }, [pat, path, commitMsg])

  useEffect(() => {
    if (!pat) {
      if (snapshot !== undefined) {
        const localDraft = authLevel === 3 ? readLocalDraft<T>(path) : undefined
        const next = localDraft ?? snapshot as T
        ref.current = next
        setData(next)
        setSync(authLevel === 3 ? 'local' : 'readonly')
      }
      else if (!protectedState.loading) setSync('error')
      return
    }
    let alive = true
    getFile(pat, path).then(f => {
      if (!alive) return
      let remote = emptyRef.current
      if (f) {
        shaRef.current = f.sha
        try { remote = JSON.parse(f.content) as T } catch { /* keep empty */ }
      }
      const localDraft = readLocalDraft<T>(path)
      const next = localDraft ?? remote
      ref.current = next
      setData(next)
      if (localDraft !== undefined) {
        setSync('dirty')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(save, 0)
      } else setSync('synced')
    }).catch(() => { if (alive) setSync('error') })
    return () => { alive = false }
  }, [pat, patVersion, path, snapshot, protectedState.loading, authLevel, save])

  const update = useCallback((next: T) => {
    if (!pat) {
      if (!canWriteLocal) { setSync('readonly'); return }
      ref.current = next
      setData(next)
      writeLocalDraft(path, next)
      setSync('local')
      return
    }
    ref.current = next
    setData(next)
    setSync('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(save, 3000)
  }, [pat, path, save, canWriteLocal])

  return { data, update, sync, writable: canWriteLocal }
}

/* ── 목표 ────────────────────────────────────────────── */
export interface Goal { id: string; title: string; deadline: string; color: string; createdAt: string }
export interface GoalsFile { goals: Goal[]; longTermGoal?: string }
export const EMPTY_GOALS: GoalsFile = { goals: [], longTermGoal: '' }
// 목표별 색 팔레트 (순환 배정)
export const GOAL_COLORS = ['#5ac8fa', '#c07ce8', '#e0a458', '#6ee7a0', '#ff7a90', '#f4d35e', '#8f8cff', '#4fd1c5']

/* ── 월간일정 (기존 profile/calendar.json 유지) ───────── */
export type Cat = 'study' | 'cert' | 'plan'
export interface CalEvent { id: string; text: string; cat: Cat; goalId?: string }
export type CalData = Record<string, CalEvent[]>   // 'YYYY-MM-DD' → events
export const CATS: { id: Cat; label: string; color: string }[] = [
  { id: 'study', label: '학습', color: 'var(--accent)' },
  { id: 'cert', label: '자격증', color: 'var(--pixel)' },
  { id: 'plan', label: '일정', color: 'var(--text-dim)' },
]

/* ── 칸반 (todo/board.json). card 에 goalId 태그 + kind(Task/Education) ── */
export type CardKind = 'task' | 'edu' | 'drive'
export const CARD_KINDS: { id: CardKind; label: string; color: string }[] = [
  { id: 'task', label: 'Task', color: '#e0a458' },        // 지시·요청 등 해야 할 일
  { id: 'edu', label: 'Education', color: '#5ac8fa' },    // 학습해야 할 사항
  { id: 'drive', label: 'Initiative', color: '#c07ce8' }, // 내가 주체적으로 하는 일
]
export const kindColor = (k?: CardKind) => CARD_KINDS.find(c => c.id === k)?.color
// doneAt: '완료' 칼럼으로 옮긴 날짜(YYYY-MM-DD). 완료는 일자별로 보존 — 어제 완료분은 오늘 TODO 에 안 보임.
// source: 업무관리(TasksView)에서 자동 생성된 카드의 출처 태그. 수동 카드는 없음.
// detail: 자유 텍스트 상세. references: 참조 목록(메일 제목·내용 / URL, 각 옵션 날짜).
export type TodoRefKind = 'mail' | 'url'
export interface TodoRef { id: string; kind: TodoRefKind; date?: string; subject?: string; body?: string; url?: string; label?: string }
export interface Card { id: string; text: string; created: string; dueAt?: string; goalId?: string; kind?: CardKind; doneAt?: string; source?: string; detail?: string; references?: TodoRef[] }
// 완료 날짜 — doneAt 없으면(구 데이터) 생성일로 대체해 사라지지 않게
export const cardDoneDate = (c: Card) => c.doneAt ?? c.created.slice(0, 10)
export interface Column { id: string; title: string; cards: Card[] }
export interface Board { columns: Column[] }
export const EMPTY_BOARD: Board = {
  columns: [
    { id: 'todo', title: '할 일', cards: [] },
    { id: 'doing', title: '진행 중', cards: [] },
    { id: 'done', title: '완료', cards: [] },
  ],
}

/* ── 날짜별 일지 (그날의 목표 + 배운 점) ───────────────── */
export interface JournalEntry { goal: string; learned: string; goalIds?: string[] }
export type Journal = Record<string, JournalEntry>   // 'YYYY-MM-DD' → entry
export const EMPTY_JOURNAL: Journal = {}

/* ── 월간일정 오버레이 마커 ─────────────────────────────
   칸반·목표를 달력에 읽기전용으로 투영. 완료=완료일, 할일/진행중=오늘(진행 중이므로), 목표=마감일. */
export interface DerivedMark {
  date: string; text: string
  source: '완료' | '진행' | '할일' | '목표'
  color: string; goalId?: string
}
export function deriveMarks(board: Board, goals: Goal[], todayIso: string): DerivedMark[] {
  const marks: DerivedMark[] = []
  const gColor = (id?: string) => goals.find(g => g.id === id)?.color
  for (const col of board.columns) {
    for (const c of col.cards) {
      if (col.id === 'done') {
        marks.push({ date: cardDoneDate(c), text: c.text, source: '완료', color: gColor(c.goalId) ?? '#6ee7a0', goalId: c.goalId })
      } else {
        marks.push({
          date: todayIso, text: c.text, source: col.id === 'doing' ? '진행' : '할일',
          color: gColor(c.goalId) ?? kindColor(c.kind) ?? '#8a94a6', goalId: c.goalId,
        })
      }
    }
  }
  for (const g of goals) if (g.deadline) marks.push({ date: g.deadline, text: g.title, source: '목표', color: g.color, goalId: g.id })
  return marks
}

/* ── 연동 집계 ──────────────────────────────────────────
   목표별로 달력·칸반·일지에서 goalId 로 연결된 항목을 모아 진척(칸반 done 기준)과 역추적 리스트를 낸다. */
export interface LinkedItem { kind: '일정' | '할일' | '일지'; date?: string; text: string; done?: boolean }
export interface GoalRollup { total: number; done: number; items: LinkedItem[] }

export function rollupGoal(goalId: string, cal: CalData, board: Board, journal: Journal): GoalRollup {
  const items: LinkedItem[] = []
  let total = 0, done = 0
  // 칸반 — 진척의 분모/분자
  for (const col of board.columns) {
    for (const c of col.cards) {
      if (c.goalId !== goalId) continue
      total += 1
      const isDone = col.id === 'done'
      if (isDone) done += 1
      items.push({ kind: '할일', text: c.text, done: isDone })
    }
  }
  // 월간일정
  for (const [date, evs] of Object.entries(cal)) {
    for (const e of evs) if (e.goalId === goalId) items.push({ kind: '일정', date, text: e.text })
  }
  // 일지
  for (const [date, en] of Object.entries(journal)) {
    if (en.goalIds?.includes(goalId)) items.push({ kind: '일지', date, text: en.goal || en.learned || '(기록)' })
  }
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return { total, done, items }
}

/* D-day 계산 — 마감일까지 남은 일수 (음수=지남) */
export function dday(deadline: string): number {
  const d = new Date(deadline + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

/* ── 업무관리 (schedule/tasks.json) ──────────────────────
   3 종류: 주기성(cadence) · 단발성 · 프로젝트. 단발성/프로젝트는 스레드를 가질 수 있다.
   미완료 항목은 TODO 보드(todo/board.json)에 실제 카드로 자동 생성(materialize)된다. */
export type TaskCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly'
export const CADENCES: { id: TaskCadence; label: string }[] = [
  { id: 'daily', label: '매일' }, { id: 'weekly', label: '매주' },
  { id: 'monthly', label: '매월' }, { id: 'quarterly', label: '분기' },
]
export const cadenceLabel = (c: TaskCadence) => CADENCES.find(x => x.id === c)?.label ?? c

export interface TaskThread { id: string; content: string; done?: boolean }
export interface RecurringTask { id: string; title: string; cadence: TaskCadence; startDate?: string; dueDate?: string; active: boolean; createdAt: string }
export type WorkTaskStatus = 'todo' | 'doing' | 'done' | 'needs_review'
export interface WorkTask {
  id: string
  title: string
  startDate?: string
  dueDate?: string
  done?: boolean
  status?: WorkTaskStatus
  completedAt?: string
  automationCandidateId?: string
  threads: TaskThread[]
  createdAt: string
} // 단발성·프로젝트 공용
export interface TasksFile { recurring: RecurringTask[]; oneoff: WorkTask[]; projects: WorkTask[] }
export const EMPTY_TASKS: TasksFile = { recurring: [], oneoff: [], projects: [] }

// 순수 로직은 taskReconcile.mjs(프레임워크 무관, Node 테스트 가능)에서 재노출한다.
export { RECURRING_PREFIX, periodKey, reconcileTasksToBoard } from './taskReconcile.mjs'
