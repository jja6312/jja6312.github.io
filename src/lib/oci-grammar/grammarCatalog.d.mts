export interface GrammarLang {
  id: string
  label: string
  service: string
  purpose: string
  group: string
  skeleton?: string
  clauses?: string[]
  examples?: string[]
  docUrl?: string
  runCli?: string
  verified?: boolean
}
export const GRAMMAR_LANGS: GrammarLang[]
export const GRAMMAR_GROUPS: string[]
export function langById(id: string): GrammarLang | undefined

/* ── 사용자 저장 스니펫 (blog-db) ── */
export interface GrammarSnippet {
  id: string
  lang: string
  label: string
  query: string
  description?: string
  tags: string[]
  createdAt: string
  updatedAt?: string
}
export interface GrammarDb { snippets: GrammarSnippet[] }
export const EMPTY_GRAMMAR_DB: GrammarDb
