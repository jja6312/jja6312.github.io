import { useEffect, useState } from 'react'
import { decryptJSON, decryptRawJSON, type Cipher, type RawCipher } from './crypto'
import { getStoredPw, type Level } from './auth'
import { useHub } from '../store'

export interface ProtectedDoc { name: string; content: string }
export interface SupportHistoryCase {
  id: string
  date: string
  time?: string
  customer: string
  contact?: string
  engineer: string
  channel: string
  status: string
  title: string
  summary: string
  services: string[]
  tags: string[]
  request: string
  conclusion: string[]
  validation: {
    environment: string
    method: string
    workload: string
    samples: number
    successes: number
    failures: number
    durationSeconds: number
    latencyMs: { min: number; average: number; p50: number; p95: number; p99: number; max: number }
    kernelObservation: string
    result: string
  }
  cautions: string[]
  evidence: { name: string; type: string; finding: string }[]
  reusableChecklist: string[]
  references: { label: string; url: string }[]
  source: { mailbox: string; subject: string; sentAt: string; attachmentCount: number; privacy: string }
}
export interface ProtectedBundle {
  cliCatalog?: unknown
  cliVerified?: string[]
  cliBlueprints?: unknown
  terraformDocs?: ProtectedDoc[]
  quoteHtml?: string
  schedule?: {
    calendar: unknown
    board: unknown
    journal: unknown
    goals: unknown
    tasks: unknown
  }
  meetings?: ProtectedDoc[]
  announcements?: {
    catalog: ProtectedDoc[]
    snapshots: ProtectedDoc[]
  }
  provisioning?: unknown
  supportHistory?: SupportHistoryCase[]
}

interface ProtectedFile {
  version: number
  generatedAt: string
  payloads: Record<string, RawCipher>
  keyrings: Record<string, Cipher>
}

let cached: { password: string; level: Level; bundle: ProtectedBundle } | null = null
let pending: Promise<ProtectedBundle> | null = null
let filePromise: Promise<ProtectedFile> | null = null

const loadFile = () => {
  if (!filePromise) {
    filePromise = fetch(`${import.meta.env.BASE_URL}protected-data.json`, { cache: 'no-cache' }).then(async res => {
      if (!res.ok) throw new Error(`보호 데이터 조회 실패 (${res.status})`)
      return await res.json() as ProtectedFile
    })
  }
  return filePromise
}

async function decryptBundle(password: string, level: Level): Promise<ProtectedBundle> {
  if (cached?.password === password && cached.level === level) return cached.bundle
  if (!pending) pending = (async () => {
    const file = await loadFile()
    const keyring = file.keyrings[String(level)]
    if (!keyring) throw new Error(`자물쇠 ${level} 암호화 키가 없습니다`)
    const keys = await decryptJSON<Record<string, string>>(password, keyring)
    const parts = await Promise.all(Object.entries(keys).map(async ([partLevel, key]) => {
      const cipher = file.payloads[partLevel]
      if (!cipher) throw new Error(`자물쇠 ${partLevel} 데이터가 없습니다`)
      return await decryptRawJSON<ProtectedBundle>(key, cipher)
    }))
    return Object.assign({}, ...parts) as ProtectedBundle
  })()
  try {
    const bundle = await pending
    cached = { password, level, bundle }
    return bundle
  } finally {
    pending = null
  }
}

export function useProtectedData() {
  const level = useHub(s => s.authLevel) as Level
  const [data, setData] = useState<ProtectedBundle | null>(() => cached?.level === level ? cached.bundle : null)
  const [loading, setLoading] = useState(level > 0 && !data)
  const [error, setError] = useState('')

  useEffect(() => {
    const password = getStoredPw()
    if (!password || level === 0) { setData(null); setLoading(false); return }
    let alive = true
    setLoading(true); setError('')
    decryptBundle(password, level)
      .then(bundle => { if (alive) setData(bundle) })
      .catch(() => { if (alive) { setData(null); setError('보호 데이터를 복호화하지 못했습니다. 다시 로그인해 주세요.') } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [level])

  return { data, loading, error }
}

export function protectedJson(bundle: ProtectedBundle | null, path: string): unknown {
  if (!bundle) return undefined
  const map: Record<string, unknown> = {
    'profile/calendar.json': bundle.schedule?.calendar,
    'todo/board.json': bundle.schedule?.board,
    'schedule/journal.json': bundle.schedule?.journal,
    'schedule/goals.json': bundle.schedule?.goals,
    'schedule/tasks.json': bundle.schedule?.tasks,
    'provisioning/contracts.json': bundle.provisioning,
  }
  return map[path]
}
