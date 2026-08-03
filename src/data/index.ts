// 커리큘럼 레지스트리 — blog-db(learning/)가 단일 소스.
// 내용 갱신 흐름: blog-db 수정 → `npm run gen` → generated.json 커밋.
// 손으로 이 파일이나 개별 데이터 파일을 수정하지 않는다.
import type { Curriculum, Sheet } from '../types'
import generated from './generated.json'

export const curricula = generated.curricula as unknown as Curriculum[]
export const sheets = generated.sheets as unknown as Record<string, Sheet>

export const findCurriculum = (id?: string) => curricula.find(c => c.id === id)
