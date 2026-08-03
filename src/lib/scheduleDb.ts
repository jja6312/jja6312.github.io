// 일정관리(월간일정·TODO·목표) 공통 데이터 계층 — blog-db 동기화 훅 + 타입 + 연동 헬퍼
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPat, getFile, putFile } from './githubDb'

/* ── 동기화 상태 ─────────────────────────────────────── */
export type Sync = 'loading' | 'synced' | 'dirty' | 'saving' | 'error'
export const SYNC_LABEL: Record<Sync, string> = {
  loading: '불러오는 중…', synced: '✓ 동기화됨', dirty: '● 변경됨 (곧 commit)',
  saving: '↑ commit 중…', error: '⚠ 저장 실패',
}

/* blog-db JSON 파일 1개를 로드→편집→3초 debounce commit 하는 범용 훅.
   월간일정/칸반/일지/목표가 전부 이 패턴 — TodoPage·Calendar 의 중복을 하나로. */
export function useSyncedJson<T>(path: string, empty: T, commitMsg: string) {
  const pat = getPat()
  const [data, setData] = useState<T>(empty)
  const [sync, setSync] = useState<Sync>('loading')
  const shaRef = useRef<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef(data)
  ref.current = data

  useEffect(() => {
    if (!pat) { setSync('error'); return }
    let alive = true
    getFile(pat, path).then(f => {
      if (!alive) return
      if (f) { shaRef.current = f.sha; try { setData(JSON.parse(f.content)) } catch { /* keep empty */ } }
      setSync('synced')
    }).catch(() => { if (alive) setSync('error') })
    return () => { alive = false }
  }, [pat, path])

  const save = useCallback(async () => {
    setSync('saving')
    const body = JSON.stringify(ref.current, null, 2) + '\n'
    try {
      shaRef.current = await putFile(pat, path, body, commitMsg, shaRef.current)
      setSync('synced')
    } catch {
      // sha 충돌 → 최신 sha 재취득 후 1회 재시도 (마지막 쓰기 우선)
      try {
        const f = await getFile(pat, path)
        shaRef.current = await putFile(pat, path, body, commitMsg, f?.sha)
        setSync('synced')
      } catch { setSync('error') }
    }
  }, [pat, path, commitMsg])

  const update = useCallback((next: T) => {
    setData(next)
    setSync('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(save, 3000)
  }, [save])

  return { data, update, sync }
}

/* ── 목표 ────────────────────────────────────────────── */
export interface Goal { id: string; title: string; deadline: string; color: string; createdAt: string }
export interface GoalsFile { goals: Goal[] }
export const EMPTY_GOALS: GoalsFile = { goals: [] }
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

/* ── 칸반 (기존 todo/board.json 유지, card 에 goalId 태그 추가) ── */
export interface Card { id: string; text: string; created: string; goalId?: string }
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
