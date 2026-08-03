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

export async function commitFeedback(pat: string, item: FeedbackItem): Promise<void> {
  const path = `feedback/items/${item.id}.json`
  const { _pending, ...clean } = item
  void _pending
  const res = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers: headers(pat),
    body: JSON.stringify({
      message: `feedback: ${clean.title}`,
      content: b64encode(JSON.stringify(clean, null, 2) + '\n'),
    }),
  })
  if (!res.ok) throw new Error(`commit 실패 HTTP ${res.status}`)
}

export async function fetchFeedbackList(pat: string): Promise<FeedbackItem[]> {
  const res = await fetch(`${API}/feedback/items`, { headers: headers(pat) })
  if (!res.ok) throw new Error(`목록 조회 실패 HTTP ${res.status}`)
  const entries = (await res.json()) as { name: string; url: string }[]
  const jsons = entries.filter(e => e.name.endsWith('.json')).slice(-50)
  const items = await Promise.all(jsons.map(async e => {
    const r = await fetch(e.url, { headers: headers(pat) })
    if (!r.ok) return null
    const data = await r.json()
    try { return JSON.parse(b64decode(data.content)) as FeedbackItem } catch { return null }
  }))
  return items.filter((x): x is FeedbackItem => !!x)
    .sort((a, b) => b.created.localeCompare(a.created))
}
