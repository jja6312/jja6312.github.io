import type { Board } from './scheduleDb'
import type { TasksFile, TaskCadence } from './scheduleDb'
export const RECURRING_PREFIX: string
export function recurringTaskIdFromSource(source?: string): string | null
export function taskSourceFromCard(source?: string): { kind: 'recurring' | 'work'; taskId: string } | { kind: 'thread'; taskId: string; threadId: string } | null
export function removeTaskSource(tasks: TasksFile, source?: string): { tasks: TasksFile; label: string; kind: string } | null
export function periodKey(now: Date, cadence: TaskCadence): string
export function reconcileTasksToBoard(board: Board, tasks: TasksFile, now?: Date): Board | null
