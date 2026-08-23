/**
 * 업무 자동 수집함의 공개 데이터 계약.
 * 원문은 이 타입으로 들어오지 않으며, 로컬 수집기에서 민감정보를 제거한
 * 후보와 출처 해시만 blog-db에 기록한다.
 */
export type AutomationStatus = 'todo' | 'doing' | 'done' | 'needs_review'
export type AutomationActor = 'self' | 'customer' | 'mixed' | 'unknown'
export type AutomationDecision = 'pending' | 'approved' | 'rejected'
export type AutomationSource = 'outlook' | 'kakao'

export interface AutomationEvidence {
  source: AutomationSource
  reference: string
  summary: string
  occurredAt?: string
}

export interface AutomationCandidate {
  id: string
  title: string
  customer?: string
  status: AutomationStatus
  actor: AutomationActor
  createdAt: string
  startedAt?: string
  dueAt?: string
  completedAt?: string
  confidence: number
  evidence: AutomationEvidence[]
  decision: AutomationDecision
  reviewedAt?: string
  reviewNote?: string
  taskRef?: string
}

export interface AutomationRunSource {
  status: 'ok' | 'error' | 'skipped'
  count: number
  error?: string
}

export interface AutomationRun {
  id: string
  startedAt: string
  finishedAt?: string
  sources: Record<AutomationSource, AutomationRunSource>
  candidateCount: number
  errors: string[]
}

export interface AutomationInbox {
  schemaVersion: 1
  updatedAt: string
  candidates: AutomationCandidate[]
  runs: AutomationRun[]
}

export const EMPTY_AUTOMATION_INBOX: AutomationInbox = {
  schemaVersion: 1,
  updatedAt: '',
  candidates: [],
  runs: [],
}

export const automationStatusLabel: Record<AutomationStatus, string> = {
  todo: '할 일',
  doing: '진행 중',
  done: '완료',
  needs_review: '판단 보류',
}

export const automationDecisionLabel: Record<AutomationDecision, string> = {
  pending: '검토 대기',
  approved: '반영 완료',
  rejected: '거절됨',
}

export function confidencePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)))
}
