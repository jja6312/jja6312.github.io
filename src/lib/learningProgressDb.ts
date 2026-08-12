import type { LearningProgressSnapshot } from '../store'

const OWNER = 'jja6312'
const REPO = 'jja6312.github.io'
const BRANCH = 'progress-data'
const PATH = 'public/learning-progress.json'
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${PATH}`

const authHeaders = (pat: string) => ({
  Authorization: `Bearer ${pat}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

const encode = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)))

function normalize(value: Partial<LearningProgressSnapshot>): LearningProgressSnapshot {
  return {
    version: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    steps: value.steps && typeof value.steps === 'object' ? value.steps : {},
    completedSheets: Array.isArray(value.completedSheets) ? value.completedSheets.filter(x => typeof x === 'string') : [],
    lastActivity: value.lastActivity && typeof value.lastActivity === 'object' ? value.lastActivity : {},
    xp: Number.isFinite(value.xp) ? Number(value.xp) : 0,
    level: Number.isFinite(value.level) ? Math.max(1, Number(value.level)) : 1,
    totalXp: Number.isFinite(value.totalXp) ? Number(value.totalXp) : 0,
    streak: Number.isFinite(value.streak) ? Math.max(1, Number(value.streak)) : 1,
  }
}

export async function loadPublicLearningProgress(): Promise<LearningProgressSnapshot> {
  const urls = [
    `${RAW}?v=${Date.now()}`,
    `${import.meta.env.BASE_URL}learning-progress.json?v=${Date.now()}`,
  ]
  let lastError: unknown
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return normalize(await response.json() as Partial<LearningProgressSnapshot>)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('공개 진도를 불러오지 못했습니다')
}

export function makeLearningProgressSnapshot(state: {
  steps: Record<string, boolean>
  completedSheets: string[]
  lastActivity: Record<string, number>
  xp: number
  level: number
  totalXp: number
  streak: number
}): LearningProgressSnapshot {
  return normalize({
    version: 1,
    updatedAt: new Date().toISOString(),
    steps: Object.fromEntries(Object.entries(state.steps).filter(([, done]) => done)),
    completedSheets: [...new Set(state.completedSheets)].sort(),
    lastActivity: state.lastActivity,
    xp: state.xp,
    level: state.level,
    totalXp: state.totalXp,
    streak: state.streak,
  })
}

async function currentSha(pat: string): Promise<string | undefined> {
  const response = await fetch(`${API}?ref=${encodeURIComponent(BRANCH)}&v=${Date.now()}`, {
    headers: authHeaders(pat),
    cache: 'no-store',
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`공개 진도 조회 실패 (${response.status})`)
  return (await response.json() as { sha: string }).sha
}

export async function publishLearningProgress(pat: string, snapshot: LearningProgressSnapshot): Promise<void> {
  const body = JSON.stringify(snapshot, null, 2) + '\n'
  for (let attempt = 0; attempt < 2; attempt++) {
    const sha = await currentSha(pat)
    const response = await fetch(API, {
      method: 'PUT',
      headers: authHeaders(pat),
      body: JSON.stringify({
        message: 'progress: sync public learning status',
        content: encode(body),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    })
    if (response.ok) return
    if (response.status !== 409 || attempt === 1) {
      throw new Error(`공개 진도 저장 실패 (${response.status})`)
    }
  }
}

