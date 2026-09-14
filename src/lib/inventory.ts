export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface InventoryRule { id: string; enabled?: boolean; types: string[]; field: string; operator: 'equal' | 'not_equal' | 'public_ingress'; expected?: Json; category: string; title: string; basis: string; source_url?: string }
export interface InventoryFinding { resource_key: string; resource_name: string; type: string; compartment: string; region: string; rule_id: string; title: string; category: string; field: string; actual: Json; expected?: Json; basis: string; source_url?: string }
export interface InventoryResource { key: string; ocid: string; name: string; type: string; group: number; service: string; tenancy_id: string; region: string; compartment_id: string; compartment: string; parent_id: string; state: string; scope: string; observed_at: string; detail_observed_at: string | null; detail_complete: boolean; freshness: string; source: string; raw: Record<string, Json>; properties: { field: string; label: string; value: Json }[]; relations: { target: string; field: string; target_key?: string }[]; previous_detail?: { observed_at: string; raw: Record<string, Json>; properties: { field:string; label:string; value:Json }[] }; findings: InventoryFinding[] }
export interface InventoryChange { kind: string; key: string; name: string; type: string; compartment: string; region: string; fields: { path: string; before: Json; after: Json; operation: string }[]; evidence?: string }
export interface InventoryCoverage { scope: string; operation: string; status: string; region?: string; count?: number; error?: string; reason?: string }
export interface InventorySnapshot { schema: 'oci-inventory/v3'; run_id: string; profile: string; started_at: string; completed_at: string; status: string; tenancy: { id: string; name: string }; regions: string[]; resources: InventoryResource[]; coverage: InventoryCoverage[]; changes: InventoryChange[]; findings: InventoryFinding[]; rules: InventoryRule[]; comparison_run_id: string | null; coverage_note?: string; summary: { resources: number; current: number; stale: number; detailed: number; changes: number; findings: number; by_service: Record<string, number>; by_compartment: Record<string, number> } }
export interface SnapshotIndex { id: string; tenancyId: string; tenancy: string; profile: string; runId: string; at: string; count: number; status: string }

const DB = 'hub-oci-inventory-v3'
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string'
export function validateSnapshot(input: unknown): InventorySnapshot {
  if (!obj(input) || input.schema !== 'oci-inventory/v3' || !str(input.run_id) || !obj(input.tenancy) || !str(input.tenancy.id) || !input.tenancy.id.startsWith('ocid1.tenancy.') || !str(input.tenancy.name)) throw Error('지원하는 파일은 oci-inventory/v3 수집 JSON입니다.')
  if (!str(input.started_at) || !Number.isFinite(Date.parse(input.started_at)) || !str(input.completed_at) || !Number.isFinite(Date.parse(input.completed_at)) || !str(input.profile) || !str(input.status)) throw Error('수집 일시 또는 프로필 정보가 올바르지 않습니다.')
  for (const key of ['resources','coverage','changes','findings','rules','regions']) if (!Array.isArray(input[key])) throw Error(`${key} 목록이 없습니다.`)
  if (!obj(input.summary)) throw Error('수집 요약이 없습니다.')
  if (!(input.regions as unknown[]).every(str) || !obj(input.summary.by_service) || !obj(input.summary.by_compartment) || !['resources','current','stale','detailed','changes','findings'].every(k=>typeof (input.summary as Record<string,unknown>)[k]==='number')) throw Error('리전 또는 집계 형식이 올바르지 않습니다.')
  const keys = new Set<string>()
  for (const r of input.resources as unknown[]) {
    if (!obj(r) || !str(r.key) || keys.has(r.key) || r.tenancy_id !== input.tenancy.id || !str(r.name) || !str(r.type) || !str(r.service) || !str(r.region) || !str(r.compartment) || !str(r.ocid) || !str(r.freshness) || !obj(r.raw) || !Array.isArray(r.properties) || !Array.isArray(r.relations) || !Array.isArray(r.findings)) throw Error('중복 자원, 다른 테넌시 자원 또는 잘못된 자원 형식입니다.')
    for (const p of r.properties) if (!obj(p) || !str(p.field) || !str(p.label) || !('value' in p)) throw Error('자원 속성 형식이 올바르지 않습니다.')
    for (const p of r.relations) if (!obj(p) || !str(p.target) || !str(p.field)) throw Error('자원 관계 형식이 올바르지 않습니다.')
    keys.add(r.key)
    if (!['state','scope','observed_at','source','parent_id'].every(k=>str(r[k])) || typeof r.group!=='number' || typeof r.detail_complete!=='boolean') throw Error('자원 상태/수집 속성이 올바르지 않습니다.')
  }
  for (const c of input.coverage as unknown[]) if (!obj(c) || !str(c.scope) || !str(c.operation) || !str(c.status)) throw Error('수집 범위 정보가 올바르지 않습니다.')
  for (const c of input.changes as unknown[]) {
    if (!obj(c) || !str(c.key) || !str(c.kind) || !str(c.name) || !str(c.type) || !Array.isArray(c.fields)) throw Error('변경 이력 형식이 올바르지 않습니다.')
    for (const f of c.fields) if (!obj(f) || !str(f.path) || !str(f.operation)) throw Error('변경 필드 형식이 올바르지 않습니다.')
  }
  validateRules(input.rules)
  if (input.summary.resources !== keys.size) throw Error('요약 자원 수와 실제 자원 수가 일치하지 않습니다.')
  return input as unknown as InventorySnapshot
}
export function validateRules(input: unknown): InventoryRule[] {
  if (!Array.isArray(input) || input.length > 2000) throw Error('기준 규칙은 최대 2,000개의 배열이어야 합니다.')
  const ids = new Set<string>()
  for (const r of input) {
    if (!obj(r) || !str(r.id) || ids.has(r.id) || !Array.isArray(r.types) || !r.types.every(str) || !str(r.field) || !str(r.title) || !str(r.basis) || !str(r.category) || !['equal','not_equal','public_ingress'].includes(String(r.operator))) throw Error('기준 규칙의 id / 유형 / 필드 / 비교 연산 / 설명을 확인하세요.')
    if (r.field.split('.').some((p: string) => ['__proto__','prototype','constructor'].includes(p))) throw Error('허용하지 않는 기준 필드입니다.')
    ids.add(r.id)
  }
  return input as InventoryRule[]
}
export const snapshotId = (s: InventorySnapshot) => `${s.tenancy.id}::${s.run_id}`
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('snapshots'); request.result.createObjectStore('index', { keyPath: 'id' }); request.result.createObjectStore('rules') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Error('다른 탭에서 사용 중인 데이터 저장소를 닫고 다시 시도하세요.'))
  })
}
async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode); let value: T
    tx.oncomplete = () => { db.close(); resolve(value) }
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? Error('저장 실패. 기존 데이터는 유지됩니다. 브라우저 저장 공간을 확인하세요.')) }
    try { work(tx, v => { value = v }) } catch (e) { tx.abort(); db.close(); reject(e) }
  })
}
export async function storeSnapshot(input: unknown) {
  const s = validateSnapshot(input); const id = snapshotId(s)
  const prior=await loadSnapshot(id)
  if(prior && stable(prior)!==stable(s))throw Error('같은 수집 ID에 다른 내용이 저장되어 있습니다. 원본 이력을 보존하므로 새로운 run_id로 가져오세요.')
  await transaction<void>(['snapshots','index'], 'readwrite', (tx, done) => {
    const existing=tx.objectStore('snapshots').get(id)
    existing.onsuccess=()=>{
      if(existing.result && stable(existing.result)!==stable(s)){tx.abort();return}
      tx.objectStore('snapshots').put(s, id)
      tx.objectStore('index').put({ id, tenancyId: s.tenancy.id, tenancy: s.tenancy.name, profile: s.profile, runId: s.run_id, at: s.started_at, count: s.summary.resources, status: s.status } satisfies SnapshotIndex)
      done()
    }
  })
  return id
}
export const listSnapshots = () => transaction<SnapshotIndex[]>(['index'], 'readonly', (tx, done) => { const r = tx.objectStore('index').getAll(); r.onsuccess = () => done(r.result.sort((a: SnapshotIndex,b: SnapshotIndex) => b.at.localeCompare(a.at))) })
export const loadSnapshot = (id: string) => transaction<InventorySnapshot | undefined>(['snapshots'], 'readonly', (tx, done) => { const r = tx.objectStore('snapshots').get(id); r.onsuccess = () => done(r.result) })
export const removeSnapshot = (id: string) => transaction<void>(['snapshots','index'], 'readwrite', (tx, done) => { tx.objectStore('snapshots').delete(id); tx.objectStore('index').delete(id); done() })
export const loadRules = () => transaction<InventoryRule[] | undefined>(['rules'], 'readonly', (tx, done) => { const r = tx.objectStore('rules').get('active'); r.onsuccess = () => done(r.result) })
export const saveRules = (rules: InventoryRule[]) => transaction<void>(['rules'], 'readwrite', (tx, done) => { tx.objectStore('rules').put(validateRules(rules),'active'); done() })
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}))
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
}
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value,null,2)
  return String(value)
}
export function compactValue(value: Json | undefined): string {
  if(obj(value)&&typeof value.name==='string'&&typeof value.ocid==='string')return value.name
  if(Array.isArray(value)&&value.every(v=>typeof v!=='object'))return value.join(', ')
  if(obj(value))return Object.entries(value).filter(([,v])=>v!==null).map(([k,v])=>`${k}: ${typeof v==='object'?'…':String(v)}`).join(' · ')
  return formatValue(value)
}
const stable = (value: unknown): string => JSON.stringify(value, (_k,v) => obj(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v)
export function evaluateRules(resources: InventoryResource[], rules: InventoryRule[]): InventoryFinding[] {
  const findings: InventoryFinding[] = []
  for (const r of resources) for (const rule of rules) {
    if (rule.enabled === false || !rule.types.includes(r.type) || !r.detail_complete || r.freshness === 'stale') continue
    let actual: unknown = r.raw
    for (const field of rule.field.split('.')) actual = obj(actual) && Object.hasOwn(actual,field) ? actual[field] : undefined
    if (actual === undefined || actual === null) continue
    const match = rule.operator === 'equal' ? stable(actual) === stable(rule.expected) : rule.operator === 'not_equal' ? stable(actual) !== stable(rule.expected) : Array.isArray(actual) && actual.some(x => obj(x) && ['0.0.0.0/0','::/0'].includes(String(x.source)))
    if (match) findings.push({ resource_key:r.key, resource_name:r.name, type:r.type, compartment:r.compartment, region:r.region, rule_id:rule.id, title:rule.title, category:rule.category, field:rule.field, actual:actual as Json, expected:rule.expected, basis:rule.basis, source_url:rule.source_url })
  }
  return findings
}
export const changeLabel: Record<string,string> = { ADDED:'새로 발견', CONFIG_CHANGED:'설정 변경', RENAMED:'이름 변경', MOVED:'컴파트먼트 이동', STATE_CHANGED:'상태 변경', MISSING:'삭제·이동 확인 필요' }
