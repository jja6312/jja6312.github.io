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

export interface DirEntry { name: string; path: string; sha: string; url: string; type: string }

export async function listDir(pat: string, path: string): Promise<DirEntry[]> {
  const res = await fetch(`${API}/${path}`, { headers: headers(pat) })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`목록 조회 실패 HTTP ${res.status}`)
  return (await res.json()) as DirEntry[]
}

export async function getFile(pat: string, path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`${API}/${path}`, { headers: headers(pat) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`파일 조회 실패 HTTP ${res.status}`)
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
  if (!res.ok) throw new Error(`commit 실패 HTTP ${res.status}`)
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
