export interface OfficialCliOption {
  name: string
  required: boolean
  type: string
  help: string
  choices?: string[]
  flag?: boolean
  multiple?: boolean
  deprecated?: boolean
  deprecation?: string
  json?: boolean
}

export interface OfficialCliCommand {
  path: string
  segments: string[]
  verb: string
  help: string
  options: OfficialCliOption[]
  docsUrl: string
}

export interface OfficialCliServiceEntry {
  key: string
  label: string
  group: string
  commandCount: number
  file: string
  bytes: number
  sha256: string
}

export interface OfficialCliIndex {
  schemaVersion: number
  source: {
    repository: string
    releaseUrl: string
    tag: string
    version: string
    commit: string
    publishedAt: string
    collector: 'final-click-tree'
    scope: 'all-public-services'
  }
  totals: { groups: number; services: number; commands: number; options: number }
  groups: Array<{ label: string; services: string[] }>
  services: OfficialCliServiceEntry[]
  commandIndex: Array<{ path: string; service: string; help: string }>
}

export interface OfficialCliServiceShard {
  schemaVersion: number
  source: { tag: string; version: string; commit: string; collector: 'final-click-tree' }
  service: { key: string; label: string; group: string }
  commands: OfficialCliCommand[]
}

interface OfficialCliPointer {
  schemaVersion: number
  version: string
  index: string
  indexBytes: number
  indexSha256: string
}

let indexPromise: Promise<OfficialCliIndex> | null = null
const shardPromises = new Map<string, Promise<OfficialCliServiceShard>>()

async function fetchJson<T>(url: string, cache: RequestCache): Promise<T> {
  const response = await fetch(url, { cache })
  if (!response.ok) throw new Error(`OCI CLI 공식 데이터 조회 실패 (${response.status})`)
  return await response.json() as T
}

export function loadOfficialCliIndex(): Promise<OfficialCliIndex> {
  if (!indexPromise) indexPromise = (async () => {
    const root = `${import.meta.env.BASE_URL}oci-cli/`
    const pointer = await fetchJson<OfficialCliPointer>(`${root}current.json`, 'no-cache')
    const index = await fetchJson<OfficialCliIndex>(`${root}${pointer.index}`, 'force-cache')
    if (index.schemaVersion !== 1 || index.source.version !== pointer.version
      || index.source.scope !== 'all-public-services') {
      throw new Error('OCI CLI 공식 데이터 버전 계약이 올바르지 않습니다.')
    }
    return index
  })()
  return indexPromise
}

export async function loadOfficialCliService(service: string): Promise<OfficialCliServiceShard> {
  const existing = shardPromises.get(service)
  if (existing) return existing
  const pending = (async () => {
    const index = await loadOfficialCliIndex()
    const metadata = index.services.find(entry => entry.key === service)
    if (!metadata) throw new Error(`OCI CLI 공식 서비스를 찾지 못했습니다: ${service}`)
    const url = `${import.meta.env.BASE_URL}oci-cli/${index.source.version}/${metadata.file}`
    const shard = await fetchJson<OfficialCliServiceShard>(url, 'force-cache')
    if (shard.service.key !== service || shard.source.commit !== index.source.commit) {
      throw new Error(`OCI CLI 공식 서비스 데이터가 원천 버전과 다릅니다: ${service}`)
    }
    return shard
  })()
  shardPromises.set(service, pending)
  try { return await pending }
  catch (error) { shardPromises.delete(service); throw error }
}

export async function loadOfficialCliCommand(path: string): Promise<OfficialCliCommand> {
  const index = await loadOfficialCliIndex()
  const entry = index.commandIndex.find(command => command.path === path)
  if (!entry) throw new Error(`OCI CLI 공식 명령을 찾지 못했습니다: ${path}`)
  const shard = await loadOfficialCliService(entry.service)
  const command = shard.commands.find(item => item.path === path)
  if (!command) throw new Error(`OCI CLI 공식 명령 shard가 불완전합니다: ${path}`)
  return command
}
