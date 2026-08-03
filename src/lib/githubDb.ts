// blog-db(private) GitHub Contents API 클라이언트 — fine-grained PAT (blog-db Contents R/W 한정)
import type { FeedbackItem } from '../types'

const REPO = 'jja6312/blog-db'
const API = `https://api.github.com/repos/${REPO}/contents`

export const getPat = () => localStorage.getItem('hub-pat') || ''
export const setPat = (v: string) => v ? localStorage.setItem('hub-pat', v) : localStorage.removeItem('hub-pat')

const headers = (pat: string) => ({
  Authorization: `Bearer ${pat}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

const b64encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const b64decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)))

/** HTTP 상태를 담는 에러 — 페이지에서 원인 문구로 변환해 토스트에 그대로 노출 */
export class GhError extends Error {
  status: number
  constructor(status: number, detail?: string) {
    super(detail ? `HTTP ${status} — ${detail}` : `HTTP ${status}`)
    this.status = status
  }
}

/** 커밋/조회 실패 원인을 사용자 문구로 — "왜"가 토스트에 보여야 스스로 고칠 수 있다 */
export function explainGhError(e: unknown): string {
  if (!(e instanceof GhError)) return '네트워크 오류 — 연결 상태 확인'
  switch (e.status) {
    case 401: return 'PAT 인증 실패 — 토큰 만료/오타. 재발급 후 다시 등록'
    case 403: return 'PAT에 쓰기 권한 없음 — Contents를 "Read and write"로 재발급 필요'
    case 404: return 'blog-db 접근 불가 — PAT의 Repository access에 blog-db가 있는지 확인'
    case 409: return '동시 수정 충돌 — 새로고침 후 다시 시도'
    case 422: return '요청 형식 오류 (sha 불일치 가능) — 새로고침 후 다시 시도'
    default: return `GitHub API 오류 (${e.status})`
  }
}

async function ghThrow(res: Response): Promise<never> {
  let detail = ''
  try { detail = (await res.json()).message ?? '' } catch { /* body 없음 */ }
  throw new GhError(res.status, detail)
}

export interface DirEntry { name: string; path: string; sha: string; url: string; type: string }

export async function listDir(pat: string, path: string): Promise<DirEntry[]> {
  const res = await fetch(`${API}/${path}`, { headers: headers(pat) })
  if (res.status === 404) return []
  if (!res.ok) await ghThrow(res)
  return (await res.json()) as DirEntry[]
}

export async function getFile(pat: string, path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`${API}/${path}`, { headers: headers(pat) })
  if (res.status === 404) return null
  if (!res.ok) await ghThrow(res)
  const data = await res.json()
  return { content: b64decode(data.content), sha: data.sha }
}

export async function getFileByUrl(pat: string, url: string): Promise<string | null> {
  const res = await fetch(url, { headers: headers(pat) })
  if (!res.ok) return null
  const data = await res.json()
  return b64decode(data.content)
}

/** 파일 생성/갱신 — 기존 파일이면 sha 필수. 반환: 새 sha */
export async function putFile(pat: string, path: string, content: string, message: string, sha?: string): Promise<string> {
  const res = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers: headers(pat),
    body: JSON.stringify({ message, content: b64encode(content), ...(sha ? { sha } : {}) }),
  })
  if (!res.ok) await ghThrow(res)
  return (await res.json()).content.sha as string
}

/* ── 피드백 ───────────────────────────────────────────── */
export async function commitFeedback(pat: string, item: FeedbackItem): Promise<void> {
  const { _pending, ...clean } = item
  void _pending
  await putFile(pat, `feedback/items/${item.id}.json`,
    JSON.stringify(clean, null, 2) + '\n', `feedback: ${clean.title}`)
}

export async function fetchFeedbackList(pat: string): Promise<FeedbackItem[]> {
  const entries = await listDir(pat, 'feedback/items')
  const jsons = entries.filter(e => e.name.endsWith('.json')).slice(-50)
  const items = await Promise.all(jsons.map(async e => {
    const raw = await getFileByUrl(pat, e.url)
    if (!raw) return null
    try { return JSON.parse(raw) as FeedbackItem } catch { return null }
  }))
  return items.filter((x): x is FeedbackItem => !!x)
    .sort((a, b) => b.created.localeCompare(a.created))
}
