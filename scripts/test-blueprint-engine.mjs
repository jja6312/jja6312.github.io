#!/usr/bin/env node
// Blueprint 엔진 순수 모듈(.mjs)의 Node 픽스처 테스트. 테스트 러너 없이 node:assert 로 검증한다.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { canonicalize } from '../src/lib/oci-cli/jsonCanonical.mjs'
import { topoOrder, reverseOrder, ancestorMap } from '../src/lib/oci-cli/blueprintGraph.mjs'
import { shq, shref } from '../src/lib/oci-cli/shellQuote.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { computeNaming } from '../src/lib/oci-cli/blueprintNaming.mjs'
import { deriveValue, materialize, DERIVED_KEYS } from '../src/lib/oci-cli/blueprintDerive.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DB = resolve(HERE, '..', '..', 'blog-db', 'knowledge', 'oci-cli')
const BP = JSON.parse(readFileSync(resolve(DB, 'blueprints', 'network-baseline-2tier.v1.json'), 'utf8'))
const POL = JSON.parse(readFileSync(resolve(DB, 'naming-policies', 'msp-standard.v1.json'), 'utf8'))
const INPUTS = {
  'naming.customer': 'ACME Corp', 'naming.workload': 'Web', 'naming.environment': 'prd',
  'execution.region': 'ap-seoul-1', 'naming.sequence': '01',
  'topology.enableSshIngress': 'true', 'address.sshSourceCidr': '203.0.113.0/24',
}

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

// ── canonicalize (RFC 8785) ──
t('canonicalize: 객체 key 는 정렬', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}')
})
t('canonicalize: 배열 순서 보존', () => {
  assert.equal(canonicalize([3, 1, 2]), '[3,1,2]')
})
t('canonicalize: undefined key 제외', () => {
  assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}')
})
t('canonicalize: 중첩 결정성', () => {
  const a = canonicalize({ z: { y: 1, x: 2 }, a: [1, { d: 4, c: 3 }] })
  const b = canonicalize({ a: [1, { c: 3, d: 4 }], z: { x: 2, y: 1 } })
  assert.equal(a, b)
})
t('canonicalize: non-finite 거부', () => {
  assert.throws(() => canonicalize({ x: Infinity }))
})
t('digest: 동일 입력 → 동일 sha256(64hex)', () => {
  const h1 = createHash('sha256').update(canonicalize({ a: 1, b: 2 })).digest('hex')
  const h2 = createHash('sha256').update(canonicalize({ b: 2, a: 1 })).digest('hex')
  assert.equal(h1, h2)
  assert.match(h1, /^[0-9a-f]{64}$/)
})

// ── graph ──
const NODES = [
  { id: 'vcn', dependsOn: [] },
  { id: 'igw', dependsOn: ['vcn'] },
  { id: 'rt', dependsOn: ['vcn', 'igw'] },
  { id: 'subnet', dependsOn: ['vcn', 'rt'] },
]
t('topoOrder: 의존성 선행', () => {
  const order = topoOrder(NODES)
  const pos = id => order.indexOf(id)
  assert.ok(pos('vcn') < pos('igw'))
  assert.ok(pos('igw') < pos('rt'))
  assert.ok(pos('rt') < pos('subnet'))
  assert.equal(order.length, 4)
})
t('reverseOrder: 생성 역순', () => {
  assert.deepEqual(reverseOrder(NODES), topoOrder(NODES).slice().reverse())
})
t('ancestorMap: 전이적 조상', () => {
  const am = ancestorMap(NODES)
  assert.deepEqual([...am.get('subnet')].sort(), ['igw', 'rt', 'vcn'])
  assert.deepEqual([...am.get('vcn')], [])
})
t('topoOrder: cycle 예외', () => {
  assert.throws(() => topoOrder([{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }]), /cycle/)
})

// ── shellQuote ──
t('shq: 안전 문자열 passthrough', () => {
  assert.equal(shq('ocid1.vcn.oc1..aaaa'), 'ocid1.vcn.oc1..aaaa')
  assert.equal(shq('10.0.0.0/16'), '10.0.0.0/16')
})
t('shq: 공백·특수문자 single-quote', () => {
  assert.equal(shq('a b'), "'a b'")
  assert.equal(shq('{"k":1}'), `'{"k":1}'`)
})
t('shq: single-quote 이스케이프', () => {
  assert.equal(shq("it's"), "'it'\\''s'")
})
t('shq: 빈 문자열은 인용', () => {
  assert.equal(shq(''), "''")
})
t('shref: 항상 큰따옴표 변수참조', () => {
  assert.equal(shref('VCN_ID'), '"$VCN_ID"')
})

// ── naming ──
t('naming: 한글/공백/대문자 정규화', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  assert.equal(nm.normalized.customer, 'acme-corp')
  assert.equal(nm.normalized.workload, 'web')
  assert.equal(nm.regionAlias, 'icn')
})
t('naming: display name = pattern', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  assert.equal(nm.names['vcn'].displayName, 'acme-corp-web-prd-icn-vcn-main-01')
  assert.equal(nm.names['public-subnet'].displayName, 'acme-corp-web-prd-icn-subnet-public-01')
})
t('naming: DNS label 유효·중복 없음', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const labels = ['vcn', 'public-subnet', 'private-subnet'].map(id => nm.names[id].dnsLabel)
  for (const l of labels) assert.match(l, /^[a-z][a-z0-9]{0,14}$/)
  assert.equal(new Set(labels).size, 3)
  assert.deepEqual(nm.issues, [])
})
t('naming: 빈 정규화 → issue', () => {
  const nm = computeNaming(BP, POL, { ...INPUTS, 'naming.customer': '고객사' })
  assert.ok(nm.issues.some(i => i.includes('naming.customer')))
})

// ── derive ──
t('derive: 10키 모두 값 반환', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const ctx = { blueprint: BP, inputs: INPUTS, naming: nm }
  for (const k of DERIVED_KEYS) assert.doesNotThrow(() => deriveValue(k, ctx))
})
t('derive: publicRouteRules → IGW ref', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const rules = deriveValue('publicRouteRules', { blueprint: BP, inputs: INPUTS, naming: nm })
  assert.equal(rules[0].networkEntityId.__ref, 'node')
  assert.equal(rules[0].networkEntityId.node, 'internet-gateway')
})
t('derive: privateRouteRules → NAT + SGW(service cidr)', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const rules = deriveValue('privateRouteRules', { blueprint: BP, inputs: INPUTS, naming: nm })
  assert.equal(rules[0].networkEntityId.node, 'nat-gateway')
  assert.equal(rules[1].networkEntityId.node, 'service-gateway')
  assert.equal(rules[1].destination.__ref, 'discovery')
  assert.equal(rules[1].destinationType, 'SERVICE_CIDR_BLOCK')
})
t('derive: ingress deny-by-default, SSH만 조건부', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const on = deriveValue('publicIngressRules', { blueprint: BP, inputs: INPUTS, naming: nm })
  assert.equal(on.length, 1)
  assert.equal(on[0].tcpOptions.destinationPortRange.min, 22)
  const off = deriveValue('publicIngressRules', { blueprint: BP, inputs: { ...INPUTS, 'topology.enableSshIngress': 'false' }, naming: nm })
  assert.deepEqual(off, [])
})
t('derive: egress allow-all', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const eg = deriveValue('publicEgressRules', { blueprint: BP, inputs: INPUTS, naming: nm })
  assert.equal(eg[0].protocol, 'all')
  assert.equal(eg[0].destination, '0.0.0.0/0')
})
t('derive: managedFreeformTags render → $RUN_ID', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const tags = materialize(deriveValue('managedFreeformTags', { blueprint: BP, inputs: INPUTS, naming: nm }), tok => tok.__ref === 'runId' ? '$RUN_ID' : '?')
  assert.equal(tags['blueprint-run-id'], '$RUN_ID')
  assert.equal(tags['blueprint-id'], 'network-baseline-2tier')
})

console.log(`\nblueprint 엔진 테스트 통과 — ${passed}건`)
