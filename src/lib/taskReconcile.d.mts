import type { Board } from './scheduleDb'
import type { TasksFile, TaskCadence } from './scheduleDb'
export const RECURRING_PREFIX: string
export function periodKey(now: Date, cadence: TaskCadence): string
export function reconcileTasksToBoard(board: Board, tasks: TasksFile, now?: Date): Board | null
