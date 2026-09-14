export type PolicyVerb = 'inspect' | 'read' | 'use' | 'manage'

export interface ParsedPolicy {
  valid: boolean
  kind?: 'allow' | 'advanced' | 'unknown'
  raw?: string
  keyword?: string
  subjectType?: string
  subject?: string
  verb?: PolicyVerb
  resourceType?: string
  scope?: 'tenancy' | 'compartment' | 'other'
  locationName?: string
  where?: string
  error?: string
}

export interface VerbInfo { id: PolicyVerb; level: number; label: string; desc: string }
export const POLICY_VERBS: VerbInfo[]
export function verbRank(v: string): number
export const COMMON_RESOURCE_FAMILIES: string[]
export function parsePolicyStatement(text: string): ParsedPolicy
export function guessCategory(resourceType: string): string

/* ── 저장 데이터 타입 (라이브러리·번들) — 페이지·저장소·테스트 공용 ── */
export interface PolicyStatement {
  id: string
  label: string
  statement: string
  description?: string
  tags: string[]
  createdAt: string
  updatedAt?: string
}
export interface PolicyBundle {
  id: string
  name: string
  description?: string
  statementIds: string[]
  createdAt: string
  updatedAt?: string
}
export interface PolicyDb { statements: PolicyStatement[]; bundles: PolicyBundle[] }
export const EMPTY_POLICY_DB: PolicyDb
