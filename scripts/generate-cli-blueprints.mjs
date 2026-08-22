#!/usr/bin/env node
// blog-db blueprint 정의 + naming policy 를 고정 cliCatalog(v3.90.2) 와 응답 레지스트리로 대조 검증하고
// .protected-cache/cliBlueprintCatalog.json 을 만든다. commandRef/option/deprecated/required/derived-key/
// pointer/DAG/cycle/중복 중 하나라도 어긋나면 생성하지 않고 실패한다(설계 10.11 · 18).
// 검증 코어는 scripts/lib/blueprint-validate.mjs 가 정본이며 verify 게이트와 공유한다.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBlueprints } from './lib/blueprint-validate.mjs'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB = resolve(SITE, '..', 'blog-db')
const CATALOG = join(SITE, '.protected-cache', 'cliCatalog.json')
const REGISTRY = join(SITE, 'scripts', 'oci-cli-blueprint-response-registry.json')
const BP_DIR = join(DB, 'knowledge', 'oci-cli', 'blueprints')
const NP_DIR = join(DB, 'knowledge', 'oci-cli', 'naming-policies')
const OUT = join(SITE, '.protected-cache', 'cliBlueprintCatalog.json')

const readJson = p => JSON.parse(readFileSync(p, 'utf8'))
const readOrNull = p => (existsSync(p) ? readJson(p) : null)

if (!existsSync(CATALOG)) {
  console.error(`blueprint 생성 실패:\n - cliCatalog 없음: ${CATALOG} — generate-cli-catalog.py 를 먼저 실행하세요`)
  process.exit(1)
}
const catalog = readJson(CATALOG)
const registry = readJson(REGISTRY)
const bpCatalog = readJson(join(BP_DIR, 'catalog.json'))

const blueprints = (bpCatalog.blueprints || []).map(entry => ({ entry, def: readOrNull(join(BP_DIR, entry.file)) }))
const namingPolicies = (bpCatalog.namingPolicies || []).map(entry => ({ entry, def: readOrNull(join(NP_DIR, entry.file)) }))

const { errors, results } = validateBlueprints({ catalog, registry, blueprints, namingPolicies })
if (errors.length) {
  console.error(`blueprint 생성 실패:\n - ${errors.join('\n - ')}`)
  process.exit(1)
}

const out = {
  schemaVersion: 1,
  cliSource: {
    repository: catalog.source?.repository,
    tag: catalog.source?.tag,
    version: catalog.source?.version,
    commit: catalog.source?.commit,
  },
  blueprints: results.blueprints,
  namingPolicies: results.namingPolicies,
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
console.log(`cliBlueprintCatalog.json — blueprint ${results.blueprints.length} · naming policy ${results.namingPolicies.length} · cliSource ${out.cliSource.version}`)
