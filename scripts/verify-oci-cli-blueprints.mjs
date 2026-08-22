#!/usr/bin/env node
// blueprint 검증 코어의 게이트: (1) 정본 정의가 통과하는지 (2) 각 오류 클래스를 실제로 거부하는지
// (negative fixture) (3) digest 가 결정적인지 확인한다. 실패 시 exit 1 로 gen:protected 를 멈춘다.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBlueprints } from './lib/blueprint-validate.mjs'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB = resolve(SITE, '..', 'blog-db')
const CATALOG = join(SITE, '.protected-cache', 'cliCatalog.json')
const REGISTRY = join(SITE, 'scripts', 'oci-cli-blueprint-response-registry.json')
const BP_DIR = join(DB, 'knowledge', 'oci-cli', 'blueprints')
const NP_DIR = join(DB, 'knowledge', 'oci-cli', 'naming-policies')

const readJson = p => JSON.parse(readFileSync(p, 'utf8'))
const readOrNull = p => (existsSync(p) ? readJson(p) : null)
const clone = v => structuredClone(v)

const catalog = readJson(CATALOG)
const registry = readJson(REGISTRY)
const bpCatalog = readJson(join(BP_DIR, 'catalog.json'))
const baseBlueprints = (bpCatalog.blueprints || []).map(entry => ({ entry, def: readOrNull(join(BP_DIR, entry.file)) }))
const baseNaming = (bpCatalog.namingPolicies || []).map(entry => ({ entry, def: readOrNull(join(NP_DIR, entry.file)) }))

const baseCtx = () => ({ catalog, registry, blueprints: clone(baseBlueprints), namingPolicies: clone(baseNaming) })

const failures = []
const pass = m => console.log(`  ok  ${m}`)
const fail = m => { failures.push(m); console.error(`  FAIL ${m}`) }

// (1) 정본은 통과
{
  const { errors } = validateBlueprints(baseCtx())
  if (errors.length) fail(`정본 정의가 통과해야 하는데 오류 ${errors.length}건: ${errors[0]}`)
  else pass('정본 정의 통과')
}

// (2) digest 결정성
{
  const a = validateBlueprints(baseCtx()).results.blueprints.map(b => b.digest)
  const b = validateBlueprints(baseCtx()).results.blueprints.map(b => b.digest)
  if (JSON.stringify(a) !== JSON.stringify(b)) fail('digest 가 결정적이지 않음')
  else if (!a.every(d => /^[0-9a-f]{64}$/.test(d))) fail('digest 형식(64 hex) 오류')
  else pass(`digest 결정적 · 64hex (${a.length}건)`)
}

// helper: network blueprint 의 첫 노드(vcn) 찾기
const netEntry = baseBlueprints.find(b => b.def?.id === 'network-baseline-2tier')
if (!netEntry) fail('network-baseline-2tier 정의를 찾을 수 없음')
const vcnResource = netEntry?.def?.nodes?.[0]?.commandRef?.resource

// negative fixtures: 각 mutator 는 오류를 주입해야 하고, 주입 후 errors.length>0 이어야 한다
const createOptionNames = res => {
  const op = catalog.commands?.[res]?.operations?.create
  const names = []
  for (const s of op?.sections || []) for (const o of s.options || []) names.push(o.name)
  for (const o of op?.advanced || []) names.push(o.name)
  return names
}

const fixtures = [
  {
    name: '알 수 없는 옵션 binding 거부',
    mutate: ctx => { ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes[0].bindings['--this-option-does-not-exist'] = { source: 'literal', value: 'x' } },
  },
  {
    name: '알 수 없는 derived key 거부',
    mutate: ctx => {
      const n = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes[0]
      const k = Object.keys(n.bindings)[0]
      n.bindings[k] = { source: 'derived', key: 'totallyBogusDerivedKey' }
    },
  },
  {
    name: '알 수 없는 input 거부',
    mutate: ctx => {
      const n = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes[0]
      const k = Object.keys(n.bindings)[0]
      n.bindings[k] = { source: 'input', input: 'nonexistent-input-id' }
    },
  },
  {
    name: '의존성 cycle 거부',
    mutate: ctx => {
      const nodes = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes
      const last = nodes[nodes.length - 1]
      nodes[0].dependsOn = [...(nodes[0].dependsOn || []), last.id] // vcn -> last -> ... -> vcn
    },
  },
  {
    name: '레지스트리에 없는 output pointer 거부',
    mutate: ctx => {
      const n = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes[0]
      const k = Object.keys(n.outputs)[0]
      n.outputs[k] = { ...n.outputs[k], pointer: '/data/this-pointer-is-not-registered' }
    },
  },
  {
    name: '선언되지 않은 nodeOutput path 거부',
    mutate: ctx => {
      const bp = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def
      const ref = bp.nodes.find(n => Object.values(n.bindings).some(v => v.source === 'nodeOutput'))
      if (!ref) throw new Error('nodeOutput binding 을 쓰는 노드가 없어 fixture 불가')
      const key = Object.keys(ref.bindings).find(k => ref.bindings[k].source === 'nodeOutput')
      ref.bindings[key] = { ...ref.bindings[key], path: '/data/undeclared-output-pointer' }
    },
  },
  {
    name: 'deprecated 옵션 binding 거부',
    mutate: ctx => {
      const n = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes[0]
      const bound = Object.keys(n.bindings)[0]
      const op = ctx.catalog.commands[vcnResource].operations.create
      for (const s of op.sections || []) for (const o of s.options || []) if (o.name === bound) o.deprecated = true
      for (const o of op.advanced || []) if (o.name === bound) o.deprecated = true
    },
    needsCatalogClone: true,
  },
  {
    name: '필수 옵션 미바인딩 거부',
    mutate: ctx => {
      const n = ctx.blueprints.find(b => b.def.id === 'network-baseline-2tier').def.nodes[0]
      const unbound = createOptionNames(vcnResource).find(name => !(name in n.bindings))
      if (!unbound) throw new Error('vcn create 의 모든 옵션이 바인딩되어 required fixture 불가')
      const op = ctx.catalog.commands[vcnResource].operations.create
      for (const s of op.sections || []) for (const o of s.options || []) if (o.name === unbound) o.required = true
      for (const o of op.advanced || []) if (o.name === unbound) o.required = true
    },
    needsCatalogClone: true,
  },
]

for (const fx of fixtures) {
  try {
    const ctx = baseCtx()
    if (fx.needsCatalogClone) ctx.catalog = clone(catalog)
    fx.mutate(ctx)
    const { errors } = validateBlueprints(ctx)
    if (errors.length > 0) pass(`negative: ${fx.name} (오류 ${errors.length}건)`)
    else fail(`negative fixture 가 통과해버림: ${fx.name}`)
  } catch (e) {
    fail(`fixture 실행 오류(${fx.name}): ${e.message}`)
  }
}

if (failures.length) {
  console.error(`\nblueprint verify 실패: ${failures.length}건`)
  process.exit(1)
}
console.log(`\nblueprint verify 통과 — 정본 + negative fixture ${fixtures.length}종 + digest 결정성`)
