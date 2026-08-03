// 단계별 권한(자물쇠 레벨) — 정적 사이트에서 비번(클라이언트 암호화)으로 레벨을 판정.
// 레벨: 0(공개) < 1 < 2 < 3. 자물쇠 3 = 본인 PAT 만(마스터). 1·2 = 비번.
import verifiersData from '../data/authVerifiers.json'
import { checkVerifier, type Cipher } from './crypto'
import { getPat } from './githubDb'

export type Level = 0 | 1 | 2 | 3
export const MAX_LEVEL: Level = 3

// 경로 prefix → 필요 자물쇠 레벨. 목록에 없으면 0(공개: 학습·복습·프로필·트러블슈팅·목표)
export const LOCKS: { prefix: string; level: Level }[] = [
  { prefix: '/knowledge/meetings', level: 3 },
  { prefix: '/knowledge/announcements', level: 3 },
  { prefix: '/schedule/calendar', level: 2 },
  { prefix: '/schedule/todo', level: 2 },
  { prefix: '/knowledge/oci-cli', level: 1 },
  { prefix: '/knowledge/terraform', level: 1 },
  { prefix: '/knowledge/quote', level: 1 },
]
export const requiredLevel = (path: string): Level =>
  LOCKS.find(l => path.startsWith(l.prefix))?.level ?? 0

const verifiers = verifiersData as Record<string, Cipher>   // { "1": {...}, "2": {...} }
const LS = 'hub-auth-pw'
export const getStoredPw = () => localStorage.getItem(LS) || ''
export const storePw = (pw: string) => { if (pw) localStorage.setItem(LS, pw); else localStorage.removeItem(LS) }

// 비번으로 열리는 최고 레벨(1~2). 안 맞으면 0.
export async function levelForPw(pw: string): Promise<Level> {
  if (!pw) return 0
  for (const lv of [2, 1] as Level[]) {
    const v = verifiers[String(lv)]
    if (v && await checkVerifier(pw, v)) return lv
  }
  return 0
}

// 현재 사용자 레벨 — PAT 있으면 3(마스터), 아니면 저장된 비번의 레벨
export async function currentLevel(): Promise<Level> {
  if (getPat()) return MAX_LEVEL
  return levelForPw(getStoredPw())
}
