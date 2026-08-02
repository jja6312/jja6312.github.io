export interface CurriculumDay {
  day: number
  sheet: string
  title: string
  goal: string
  estimated_minutes: number
}

export interface Curriculum {
  id: string
  title: string
  description: string
  difficulty: number
  public: boolean
  tags: string[]
  created: string
  days: CurriculumDay[]
}

export interface Concept {
  id: string          // c1, c2 …
  title: string
  diagram: string     // inline SVG (v3: 개념마다 필수)
  body: string        // 부가 설명 HTML
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
  day: number
  sheet: string
  title: string
  tags: string[]
  difficulty: number
  estimated_minutes: number
  goal: string
  concepts: Concept[]
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
