#!/usr/bin/env node
// 업무관리 → TODO 보드 reconcile 순수 로직 테스트 (러너 없이 node:assert)
import assert from 'node:assert/strict'
import { reconcileTasksToBoard, periodKey, RECURRING_PREFIX } from '../src/lib/taskReconcile.mjs'

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }
const emptyBoard = () => ({ columns: [{ id: 'todo', title: '할 일', cards: [] }, { id: 'doing', title: '진행 중', cards: [] }, { id: 'done', title: '완료', cards: [] }] })
const emptyTasks = () => ({ recurring: [], oneoff: [], projects: [] })
const todoTexts = b => b.columns.find(c => c.id === 'todo').cards.map(c => c.text)
const todoCards = b => b.columns.find(c => c.id === 'todo').cards
const NOW = new Date('2026-08-23T09:00:00')

t('수동 카드(source 없음)는 업무 조정에서도 보존', () => {
  const board = { columns: [{ id: 'todo', title: '할 일', cards: [{ id: 'manual', text: '수동 등록', created: '2026-08-23T00:00:00Z' }] }, { id: 'doing', title: '진행 중', cards: [] }, { id: 'done', title: '완료', cards: [] }] }
  const tasks = { ...emptyTasks(), recurring: [{ id: 'r1', title: '주간보고', cadence: 'weekly', active: true, createdAt: '' }] }
  const next = reconcileTasksToBoard(board, tasks, NOW)
  assert.ok(todoTexts(next).includes('수동 등록'))
})

t('변경 없으면 null', () => {
  assert.equal(reconcileTasksToBoard(emptyBoard(), emptyTasks(), NOW), null)
})
t('단발성(스레드 없음) → 제목 그대로 카드', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: '서버 점검', threads: [], createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.deepEqual(todoTexts(b), ['서버 점검'])
  assert.equal(todoCards(b)[0].source, 'task:o1')
})
t('단발성(스레드 있음) → [제목]스레드, done 스레드 제외', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: '이전작업', threads: [{ id: 't1', content: 'DB 백업' }, { id: 't2', content: '검증', done: true }], createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.deepEqual(todoTexts(b), ['[이전작업]DB 백업'])
  assert.equal(todoCards(b)[0].source, 'thread:o1:t1')
})
t('프로젝트도 동일 처리', () => {
  const tasks = { ...emptyTasks(), projects: [{ id: 'p1', title: '마이그레이션', threads: [{ id: 'a', content: '설계' }], createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.deepEqual(todoTexts(b), ['[마이그레이션]설계'])
})
t('주기성 → [주기성업무]제목 · 현재 주기 1건', () => {
  const tasks = { ...emptyTasks(), recurring: [{ id: 'r1', title: '주간보고', cadence: 'weekly', active: true, createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.deepEqual(todoTexts(b), [`${RECURRING_PREFIX}주간보고`])
  assert.equal(todoCards(b)[0].source, `rec:r1:${periodKey(NOW, 'weekly')}`)
})
t('멱등: 이미 있으면 재추가 안 함 → null', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: 'A', threads: [], createdAt: '' }] }
  const b1 = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.equal(reconcileTasksToBoard(b1, tasks, NOW), null)
})
t('완료 처리 → 할 일 칼럼의 source 카드 제거', () => {
  const board = { columns: [{ id: 'todo', title: '할 일', cards: [{ id: 'c', text: 'A', created: '', source: 'task:o1' }] }, { id: 'doing', title: 'x', cards: [] }, { id: 'done', title: 'y', cards: [] }] }
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: 'A', threads: [], done: true, createdAt: '' }] }
  const b = reconcileTasksToBoard(board, tasks, NOW)
  assert.deepEqual(todoTexts(b), [])
})
t('삭제된 업무 → 할 일 카드 제거', () => {
  const board = { columns: [{ id: 'todo', title: '할 일', cards: [{ id: 'c', text: 'A', created: '', source: 'task:gone' }] }, { id: 'doing', title: 'x', cards: [] }, { id: 'done', title: 'y', cards: [] }] }
  const b = reconcileTasksToBoard(board, emptyTasks(), NOW)
  assert.deepEqual(todoTexts(b), [])
})
t('진행중/완료 칼럼의 source 카드는 건드리지 않음(사용자 소유)', () => {
  const board = { columns: [
    { id: 'todo', title: '할 일', cards: [] },
    { id: 'doing', title: 'x', cards: [{ id: 'c', text: 'A', created: '', source: 'task:o1' }] },
    { id: 'done', title: 'y', cards: [] },
  ] }
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: 'A', threads: [], done: true, createdAt: '' }] }
  const b = reconcileTasksToBoard(board, tasks, NOW)
  assert.equal(b, null) // 완료된 업무지만 doing 카드는 유지 → 변경 없음
})
t('주기성 과거 주기 카드 유지 + 현재 주기 추가', () => {
  const board = { columns: [{ id: 'todo', title: '할 일', cards: [{ id: 'old', text: `${RECURRING_PREFIX}주간보고`, created: '', source: 'rec:r1:2026-W01' }] }, { id: 'doing', title: 'x', cards: [] }, { id: 'done', title: 'y', cards: [] }] }
  const tasks = { ...emptyTasks(), recurring: [{ id: 'r1', title: '주간보고', cadence: 'weekly', active: true, createdAt: '' }] }
  const b = reconcileTasksToBoard(board, tasks, NOW)
  const sources = todoCards(b).map(c => c.source)
  assert.ok(sources.includes('rec:r1:2026-W01'), '과거 주기 유지')
  assert.ok(sources.includes(`rec:r1:${periodKey(NOW, 'weekly')}`), '현재 주기 추가')
})
t('주기성 카드를 다른 칼럼으로 옮기면 자동 조정이 되돌리지 않음', () => {
  const board = { columns: [
    { id: 'todo', title: '할 일', cards: [] },
    { id: 'doing', title: '진행 중', cards: [{ id: 'moved', text: `${RECURRING_PREFIX}주간보고`, created: '', source: `rec:r1:${periodKey(NOW, 'weekly')}` }] },
    { id: 'done', title: '완료', cards: [] },
  ] }
  const tasks = { ...emptyTasks(), recurring: [{ id: 'r1', title: '주간보고', cadence: 'weekly', active: true, createdAt: '' }] }
  assert.equal(reconcileTasksToBoard(board, tasks, NOW), null)
})
t('비활성 주기성 → 할 일 카드 제거 + 신규 생성 안 함', () => {
  const board = { columns: [{ id: 'todo', title: '할 일', cards: [{ id: 'old', text: 'x', created: '', source: 'rec:r1:2026-W01' }] }, { id: 'doing', title: 'x', cards: [] }, { id: 'done', title: 'y', cards: [] }] }
  const tasks = { ...emptyTasks(), recurring: [{ id: 'r1', title: '주간보고', cadence: 'weekly', active: false, createdAt: '' }] }
  const b = reconcileTasksToBoard(board, tasks, NOW)
  assert.deepEqual(todoTexts(b), [])
})
t('시작일 미래 → 아직 추가 안 함', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: '미래', threads: [], startDate: '2099-01-01', createdAt: '' }] }
  assert.equal(reconcileTasksToBoard(emptyBoard(), tasks, NOW), null)
})
t('마감 지난 미완료 단발성 → 계속 표시', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: '지연', threads: [], dueDate: '2020-01-01', createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.deepEqual(todoTexts(b), ['지연'])
})
t('periodKey 형식', () => {
  assert.equal(periodKey(new Date('2026-08-23T00:00:00'), 'monthly'), '2026-08')
  assert.equal(periodKey(new Date('2026-08-23T00:00:00'), 'quarterly'), '2026-Q3')
  assert.match(periodKey(NOW, 'weekly'), /^2026-W\d{2}$/)
  assert.equal(periodKey(new Date('2026-08-23T00:00:00'), 'daily'), '2026-08-23')
})
t('dueDate 있으면 카드 dueAt 설정', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'o1', title: 'A', threads: [], dueDate: '2026-09-01', createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.equal(todoCards(b)[0].dueAt, '2026-09-01')
})
t('자동 후보 진행 중 → 진행 중 칼럼', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'auto-1', title: '고객 확인', status: 'doing', automationCandidateId: 'cand-1', threads: [], createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  assert.deepEqual(b.columns.find(c => c.id === 'doing').cards.map(c => c.text), ['고객 확인'])
})
t('자동 후보 완료 → 완료 칼럼과 완료일', () => {
  const tasks = { ...emptyTasks(), oneoff: [{ id: 'auto-2', title: 'SR 완료', status: 'done', done: true, completedAt: '2026-08-22', automationCandidateId: 'cand-2', threads: [], createdAt: '' }] }
  const b = reconcileTasksToBoard(emptyBoard(), tasks, NOW)
  const card = b.columns.find(c => c.id === 'done').cards[0]
  assert.equal(card.text, 'SR 완료')
  assert.equal(card.doneAt, '2026-08-22')
})

console.log(`\ntask reconcile 테스트 통과 — ${passed}건`)
