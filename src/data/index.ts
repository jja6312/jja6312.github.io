// 커리큘럼 레지스트리 — 새 커리큘럼 추가 시 여기에 등록
import type { Curriculum, Sheet } from '../types'
import { linuxBasics, sheets as linuxSheets } from './linuxBasics'
import { ociSecurity, cloudGuard } from './ociSecurity'

export const curricula: Curriculum[] = [linuxBasics, ociSecurity]

export const sheets: Record<string, Sheet> = {
  ...linuxSheets,
  'cloud-guard': cloudGuard,
}

export const findCurriculum = (id?: string) => curricula.find(c => c.id === id)
