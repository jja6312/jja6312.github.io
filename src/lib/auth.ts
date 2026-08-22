// 단계별 권한(자물쇠 레벨) — 정적 사이트에서 비번(클라이언트 암호화)으로 레벨을 판정.
// 레벨: 0(공개) < 1 < 2 < 3. 각 단계는 별도 비밀번호로 암호화 데이터를 연다.
import verifiersData from '../data/authVerifiers.json'
import { checkVerifier, type Cipher } from './crypto'

export type Level = 0 | 1 | 2 | 3

// 경로 prefix → 필요 자물쇠 레벨. 목록에 없으면 0(공개: 학습·복습·프로필·트러블슈팅·목표)
export const LOCKS: { prefix: string; level: Level }[] = [
  { prefix: '/knowledge/meetings', level: 3 },
  { prefix: '/knowledge/announcements', level: 3 },
  { prefix: '/knowledge/provisioning', level: 3 },
  { prefix: '/knowledge/support-history', level: 3 },
  { prefix: '/schedule/calendar', level: 2 },
  { prefix: '/schedule/tasks', level: 2 },
  { prefix: '/schedule/todo', level: 2 },
  { prefix: '/schedule/ai-goals', level: 2 },
  { prefix: '/schedule/goals', level: 2 },
  { prefix: '/knowledge/oci-cli', level: 1 },
  { prefix: '/knowledge/terraform', level: 1 },
  { prefix: '/knowledge/quote', level: 1 },
]
export const requiredLevel = (path: string): Level =>
  LOCKS.find(l => path.startsWith(l.prefix))?.level ?? 0

const verifiers = verifiersData as Record<string, Cipher>   // { "1": {...}, "2": {...}, "3": {...} }
const LS = 'hub-auth-pw'
export const getStoredPw = () => localStorage.getItem(LS) || ''
export const storePw = (pw: string) => { if (pw) localStorage.setItem(LS, pw); else localStorage.removeItem(LS) }

// 비번으로 열리는 레벨(1~3). 안 맞으면 0.
export async function levelForPw(pw: string): Promise<Level> {
  if (!pw) return 0
  for (const lv of [3, 2, 1] as Level[]) {
    const v = verifiers[String(lv)]
    if (v && await checkVerifier(pw, v)) return lv
  }
  return 0
}

// 현재 사용자 레벨 — PAT는 데이터 쓰기 자격으로만 사용하고 잠금 해제와 분리한다.
export async function currentLevel(): Promise<Level> {
  return levelForPw(getStoredPw())
}
