#!/usr/bin/env node
// blog-db(private) → 비밀번호별 암호화 읽기 스냅샷.
// 원문과 비밀번호는 public 저장소에 남기지 않고 AES-GCM 암호문만 커밋한다.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB = resolve(SITE, '..', 'blog-db')
const CACHE = join(SITE, '.protected-cache', 'cliCatalog.json')
const BLUEPRINT_CACHE = join(SITE, '.protected-cache', 'cliBlueprintCatalog.json')
const OUT = join(SITE, 'public', 'protected-data.json')
const SITE_VERIFIERS = join(SITE, 'src', 'data', 'authVerifiers.json')
const DB_VERIFIERS = join(DB, 'auth', 'verifiers.json')
const ITERATIONS = 200_000
const VERIFY_MARK = 'jja-hub-auth-ok'
const { subtle } = webcrypto

const passwords = {
  1: process.env.HUB_LOCK_1,
  2: process.env.HUB_LOCK_2,
  3: process.env.HUB_LOCK_3,
}
for (const [level, value] of Object.entries(passwords)) {
  if (!value) throw new Error(`HUB_LOCK_${level} 환경변수가 필요합니다`)
}
if (!existsSync(DB)) throw new Error(`blog-db를 찾을 수 없습니다: ${DB}`)
if (!existsSync(CACHE)) throw new Error(`CLI 카탈로그가 없습니다: ${CACHE} — generate-cli-catalog.py를 먼저 실행하세요`)

const asB64 = value => Buffer.from(value).toString('base64')
async function encryptJSON(password, value) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { salt: asB64(salt), iv: asB64(iv), ct: asB64(ct) }
}

async function encryptRawJSON(rawKey, value) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const key = await subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt'])
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { iv: asB64(iv), ct: asB64(ct) }
}

const readText = rel => readFileSync(join(DB, rel), 'utf8')
const readJson = (rel, fallback) => {
  try { return JSON.parse(readText(rel)) } catch { return fallback }
}
const readDocs = rel => {
  const dir = join(DB, rel)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => name.endsWith('.md'))
    .map(name => ({ name, content: readFileSync(join(dir, name), 'utf8') }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
const readJsonDocs = rel => {
  const dir = join(DB, rel)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => readJson(join(rel, name), null))
    .filter(Boolean)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
}

if (!existsSync(BLUEPRINT_CACHE)) throw new Error('cliBlueprintCatalog.json 없음 — generate-cli-blueprints.mjs 를 먼저 실행하세요')
const level1 = {
  cliCatalog: JSON.parse(readFileSync(CACHE, 'utf8')),
  cliVerified: readJson('knowledge/oci-cli/verified.json', { verified: [] }).verified ?? [],
  cliBlueprints: JSON.parse(readFileSync(BLUEPRINT_CACHE, 'utf8')),
  terraformDocs: readDocs('knowledge/terraform'),
  quoteHtml: readText('tools/quote_form.html'),
}
const level2 = {
  schedule: {
    calendar: readJson('profile/calendar.json', {}),
    board: readJson('todo/board.json', { columns: [] }),
    journal: readJson('schedule/journal.json', {}),
    goals: readJson('schedule/goals.json', { goals: [] }),
    tasks: readJson('schedule/tasks.json', { recurring: [], oneoff: [], projects: [] }),
  },
}
const level3 = {
  provisioning: readJson('provisioning/contracts.json', { customers: [] }),
  supportHistory: readJsonDocs('support-history/cases'),
  meetings: readDocs('meetings/minutes'),
  announcements: {
    catalog: readDocs('announcements/catalog'),
    snapshots: readDocs('announcements/snapshots'),
  },
}

const generatedAt = new Date().toISOString()
const contentKeys = {
  1: webcrypto.getRandomValues(new Uint8Array(32)),
  2: webcrypto.getRandomValues(new Uint8Array(32)),
  3: webcrypto.getRandomValues(new Uint8Array(32)),
}
const payloads = {
  1: await encryptRawJSON(contentKeys[1], level1),
  2: await encryptRawJSON(contentKeys[2], level2),
  3: await encryptRawJSON(contentKeys[3], level3),
}
const keyrings = {
  1: await encryptJSON(passwords[1], { 1: asB64(contentKeys[1]) }),
  2: await encryptJSON(passwords[2], { 1: asB64(contentKeys[1]), 2: asB64(contentKeys[2]) }),
  3: await encryptJSON(passwords[3], { 1: asB64(contentKeys[1]), 2: asB64(contentKeys[2]), 3: asB64(contentKeys[3]) }),
}
const rotateVerifiers = process.env.ROTATE_AUTH_VERIFIERS === '1' || !existsSync(DB_VERIFIERS)
const verifiers = rotateVerifiers ? {
  1: await encryptJSON(passwords[1], VERIFY_MARK),
  2: await encryptJSON(passwords[2], VERIFY_MARK),
  3: await encryptJSON(passwords[3], VERIFY_MARK),
} : JSON.parse(readFileSync(DB_VERIFIERS, 'utf8'))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ version: 2, generatedAt, payloads, keyrings }, null, 1) + '\n')
writeFileSync(SITE_VERIFIERS, JSON.stringify(verifiers, null, 2) + '\n')
if (rotateVerifiers) writeFileSync(DB_VERIFIERS, JSON.stringify(verifiers, null, 2) + '\n')
console.log(`protectedData.json — L1 ${level1.terraformDocs.length} docs · L2 schedule · L3 ${level3.provisioning.customers.length} customers/${level3.supportHistory.length} support cases/${level3.meetings.length} meetings/${level3.announcements.catalog.length + level3.announcements.snapshots.length} announcements`)
