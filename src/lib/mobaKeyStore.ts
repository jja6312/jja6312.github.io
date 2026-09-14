// MobaXterm 키 경로 프로필 저장소 — localStorage per-user.
// ocicli 프로필(lib/oci-cli/profiles.ts)처럼 한번 등록한 개인키 경로를 이름으로 저장해
// 다음 세션 추가 때 매번 입력하지 않고 골라 쓴다. 키 파일 내용이 아니라 로컬 경로 문자열만 저장.
export type MobaKeyProfile = {
  id: string
  label: string
  keyPath: string
}

const KEYS_KEY = 'moba:keyProfiles'
const LAST_KEY = 'moba:key:last'

export function loadKeyProfiles(): MobaKeyProfile[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEYS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item): item is MobaKeyProfile =>
        !!item && typeof (item as MobaKeyProfile).keyPath === 'string')
      .map(item => ({ id: item.id || crypto.randomUUID(), label: item.label || item.keyPath, keyPath: item.keyPath }))
  } catch {
    return []
  }
}

export function saveKeyProfiles(profiles: MobaKeyProfile[]): void {
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(profiles))
  } catch {
    /* per-user 저장소 사용 불가 — 무시 */
  }
}

/** 라벨(대소문자 무시) 기준 upsert. 라벨 비면 경로 파일명으로 대체. 저장된 전체 목록 반환. */
export function upsertKeyProfile(label: string, keyPath: string, existing: MobaKeyProfile[]): MobaKeyProfile[] {
  const path = keyPath.trim()
  if (!path) return existing
  const name = (label.trim() || path.split(/[\\/]/).pop() || path).trim()
  const idx = existing.findIndex(p => p.label.toLowerCase() === name.toLowerCase())
  const next = [...existing]
  if (idx >= 0) next[idx] = { ...next[idx], keyPath: path }
  else next.push({ id: crypto.randomUUID(), label: name, keyPath: path })
  saveKeyProfiles(next)
  return next
}

export function deleteKeyProfile(id: string, existing: MobaKeyProfile[]): MobaKeyProfile[] {
  const next = existing.filter(p => p.id !== id)
  saveKeyProfiles(next)
  return next
}

export function getLastKeyPath(): string {
  try {
    return localStorage.getItem(LAST_KEY) || ''
  } catch {
    return ''
  }
}

export function setLastKeyPath(keyPath: string): void {
  try {
    if (keyPath) localStorage.setItem(LAST_KEY, keyPath)
    else localStorage.removeItem(LAST_KEY)
  } catch {
    /* 무시 */
  }
}
