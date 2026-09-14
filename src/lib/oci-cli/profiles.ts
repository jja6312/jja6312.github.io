// OCI CLI 프로필 저장소 — localStorage per-user. 순수 로직은 profilesParse.mjs.
// 저장 대상: 이름 후보(컴파트먼트·리소스)·리전. 크리덴셜은 저장하지 않는다.
import {
  parseCollectedProfiles, mergeProfiles,
  type OciProfile,
} from './profilesParse.mjs'

export type { OciProfile } from './profilesParse.mjs'
export { lookupNamesFor, profileSummary, renderProfileCollectScript } from './profilesParse.mjs'

const PROFILES_KEY = 'ocicli:profiles'
const SELECTED_KEY = 'ocicli:profile:selected'

export function loadProfiles(): OciProfile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]')
    return Array.isArray(raw) ? (raw as OciProfile[]) : []
  } catch {
    return []
  }
}

export function saveProfiles(profiles: OciProfile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    /* per-user 저장소 사용 불가 — 무시 */
  }
}

export function getSelectedProfileName(): string {
  try {
    return localStorage.getItem(SELECTED_KEY) || ''
  } catch {
    return ''
  }
}

export function setSelectedProfileName(name: string): void {
  try {
    if (name) localStorage.setItem(SELECTED_KEY, name)
    else localStorage.removeItem(SELECTED_KEY)
  } catch {
    /* 무시 */
  }
}

/** 붙여넣은 봉투를 파싱해 기존 프로필과 병합·저장(upsert). 신규/갱신 수를 구분해 반환. */
export function registerProfilesFromPaste(
  pasted: string,
  existing: OciProfile[],
): { profiles: OciProfile[]; added: number; updated: number; error?: string } {
  const { profiles: incoming, error } = parseCollectedProfiles(pasted)
  if (error) return { profiles: existing, added: 0, updated: 0, error }
  const today = new Date().toISOString().slice(0, 10)
  const stamped = incoming.map(p => ({ ...p, collectedAt: today }))
  const existingNames = new Set(existing.map(p => p.name))
  const updated = stamped.filter(p => existingNames.has(p.name)).length
  const merged = mergeProfiles(existing, stamped)
  saveProfiles(merged)
  return { profiles: merged, added: stamped.length - updated, updated }
}

/**
 * 붙여넣은 봉투로 **이미 등록된 동일 이름 프로필만** 갱신(신규 이름은 추가하지 않고 건너뜀).
 * "전체 삭제 후 재등록" 없이 기존 프로필 내용(예: 새로 추가된 ns)만 최신화할 때 사용.
 */
export function updateProfilesFromPaste(
  pasted: string,
  existing: OciProfile[],
): { profiles: OciProfile[]; updated: number; skipped: number; error?: string } {
  const { profiles: incoming, error } = parseCollectedProfiles(pasted)
  if (error) return { profiles: existing, updated: 0, skipped: 0, error }
  const today = new Date().toISOString().slice(0, 10)
  const existingNames = new Set(existing.map(p => p.name))
  const toUpdate = incoming.filter(p => existingNames.has(p.name)).map(p => ({ ...p, collectedAt: today }))
  const merged = mergeProfiles(existing, toUpdate)
  saveProfiles(merged)
  return { profiles: merged, updated: toUpdate.length, skipped: incoming.length - toUpdate.length }
}

export function deleteProfile(name: string, existing: OciProfile[]): OciProfile[] {
  const next = existing.filter(p => p.name !== name)
  saveProfiles(next)
  return next
}
