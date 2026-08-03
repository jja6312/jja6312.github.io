export interface CurriculumDay {
  day: number
  sheet: string
  title: string
  goal: string
  estimated_minutes: number
}

export interface CurriculumTopic {
  topic: string
  sheet: string
  title: string
  goal: string
  estimated_minutes: number
  level?: 1 | 2 | 3            // category 과목 수준 (기본 1)
  status?: 'planned' | 'ready'
}

export interface Curriculum {
  id: string
  title: string
  description: string
  mode?: 'sprint' | 'category'   // 생략 시 sprint
  difficulty: number
  public: boolean
  tags: string[]
  created: string
  days?: CurriculumDay[]         // sprint
  topics?: CurriculumTopic[]     // category
}

export interface Concept {
  id: string          // c1, c2 …
  title: string
  diagram: string     // inline SVG (v3: 개념마다 필수)
  body: string        // 부가 설명 HTML
}

// 실습 = 실전 구축 챕터 — 문제풀이가 아니라 고객 요청을 실제로 구현하는 단계별 진행
export interface LabStep {
  id: string          // l1, l2 …
  title: string
  body: string        // HTML (콘솔 경로 · CLI · 확인 방법)
}

export interface Lab {
  situation: string   // 고객 상황 (HTML)
  request: string     // 구축 요청 원문 (HTML)
  steps: LabStep[]
}

export type ScenarioType = 'ox' | 'choice' | 'command' | 'essay'

export interface Scenario {
  id: string          // s1, s2 …
  type: ScenarioType
  situation: string
  question: string
  choices?: string[]
  answers: string[]
  match?: 'exact-trim' | 'normalize-flags'
  rubric?: string
  explanation: string
  concept_anchor: string
  xp: number
}

export interface Sheet {
  curriculum: string
  day?: number                   // sprint
  topic?: string                 // category
  sheet: string
  title: string
  tags: string[]
  difficulty: number
  estimated_minutes: number
  level?: 1 | 2 | 3
  goal: string
  concepts: Concept[]
  lab?: Lab
  sources: { label: string; url: string }[]
  scenarios: Scenario[]
}

export type Verdict = 'O' | '△' | 'X'

export interface Comment {
  id: string
  anchor: string      // cN | sN | 전체
  text: string
  created: string
}

export type FeedbackSeverity = 'bug' | 'friction' | 'idea'
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'wontfix'

export interface FeedbackItem {
  id: string          // YYMMDD-HHMMSS
  created: string
  status: FeedbackStatus
  title: string
  body: string
  tags?: string[]
  severity: FeedbackSeverity
  resolution?: string
  resolved_at?: string
  _pending?: boolean  // 로컬 전용 — PAT 미등록 시 커밋 대기
}
