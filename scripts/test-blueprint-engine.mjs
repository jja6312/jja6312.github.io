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
import { computePlan, planDigestInput, compareField } from '../src/lib/oci-cli/blueprintPlan.mjs'
import { renderDiscover, renderApply, renderVerify, renderRollback, renderResume } from '../src/lib/oci-cli/blueprintRender.mjs'
import { buildProvisionalManifest, mergeVerification, evaluateVerification, evaluateAssertion } from '../src/lib/oci-cli/blueprintManifest.mjs'
import { resolveRender, emitOption, buildJqExpr, VarRef } from '../src/lib/oci-cli/blueprintResolve.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

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

// ── plan ──
const CATALOG = JSON.parse(readFileSync(resolve(HERE, '..', '.protected-cache', 'cliCatalog.json'), 'utf8'))
const emptyDiscovery = { artifactType: 'discovery-result', services: [{ key: 'oracleServicesNetworkAll', items: [{ id: 'ocid1.service.oc1..all', name: 'all-services', 'cidr-block': 'all-icn-services-in-oracle-services-network' }] }], nodes: BP.nodes.map(n => ({ node: n.id, status: 'OK', found: null })) }

t('plan: 전부 미발견 → 전부 CREATE, executable', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const plan = computePlan({ blueprint: BP, inputs: INPUTS, naming: nm, discovery: emptyDiscovery })
  assert.equal(plan.nodes.length, BP.nodes.length)
  assert.ok(plan.nodes.every(n => n.state === 'CREATE'))
  assert.equal(plan.executable, true)
  assert.equal(plan.createCount, BP.nodes.length)
})
t('plan: 동일이름 존재+필드불일치 → CONFLICT, not executable', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const disc = { ...emptyDiscovery, nodes: emptyDiscovery.nodes.map(n => n.node === 'vcn' ? { node: 'vcn', status: 'OK', found: { id: 'ocid1.vcn.oc1..exists', name: nm.names['vcn'].displayName, collected: {} } } : n) }
  const plan = computePlan({ blueprint: BP, inputs: INPUTS, naming: nm, discovery: disc })
  const vcn = plan.nodes.find(n => n.nodeId === 'vcn')
  assert.equal(vcn.state, 'CONFLICT')
  assert.equal(plan.executable, false)
})
t('plan: discovery 오류 → BLOCKED', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const disc = { ...emptyDiscovery, nodes: emptyDiscovery.nodes.map(n => n.node === 'vcn' ? { node: 'vcn', status: 'DISCOVERY_ERROR', error: 'permission' } : n) }
  const plan = computePlan({ blueprint: BP, inputs: INPUTS, naming: nm, discovery: disc })
  assert.equal(plan.nodes.find(n => n.nodeId === 'vcn').state, 'BLOCKED')
  assert.equal(plan.executable, false)
})
t('plan: planDigestInput 결정적', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const p1 = planDigestInput(computePlan({ blueprint: BP, inputs: INPUTS, naming: nm, discovery: emptyDiscovery }))
  const p2 = planDigestInput(computePlan({ blueprint: BP, inputs: INPUTS, naming: nm, discovery: emptyDiscovery }))
  assert.equal(canonicalize(p1), canonicalize(p2))
})
t('compareField: comparator 동작', () => {
  assert.equal(compareField('string', 'a', 'a'), true)
  assert.equal(compareField('jsonSet', [{ a: 1 }, { b: 2 }], [{ b: 2 }, { a: 1 }]), true)
  assert.equal(compareField('jsonSet', [{ networkEntityId: 'x' }], [{ 'network-entity-id': 'x' }]), true) // kebab↔camel 통일
  assert.equal(compareField('tagSubset', { 'blueprint-id': 'x', 'blueprint-run-id': '' }, { 'blueprint-id': 'x', extra: 'y' }), true)
  assert.equal(compareField('tagSubset', { 'blueprint-id': 'x' }, { 'blueprint-id': 'z' }), false)
})

// ── render + bash -n ──
const TMP = mkdtempSync(resolve(tmpdir(), 'bp-engine-'))
const BASH = process.platform === 'win32' && existsSync('C:\\Program Files\\Git\\bin\\bash.exe')
  ? 'C:\\Program Files\\Git\\bin\\bash.exe'
  : 'bash'
const bashN = (script) => {
  const f = resolve(TMP, script.name)
  writeFileSync(f, script.content)
  // Git Bash on Windows receives POSIX paths; passing `C:\...` directly is
  // interpreted as an MSYS-converted argument with the separators stripped.
  const bashPath = process.platform === 'win32'
    ? f.replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`).replaceAll('\\', '/')
    : f
  execFileSync(BASH, ['-n', bashPath]) // 문법 오류면 throw
}
const nm0 = computeNaming(BP, POL, INPUTS)
const plan0 = computePlan({ blueprint: BP, inputs: INPUTS, naming: nm0, discovery: emptyDiscovery })
const runResult0 = { artifactType: 'run-result', runId: 'run-test-1', planDigest: 'deadbeef', nodes: BP.nodes.map((n, i) => ({ node: n.id, action: 'CREATED', id: `ocid1.${n.commandRef.resource}.oc1..n${i}` })) }
const manifest0 = buildProvisionalManifest({ blueprint: BP, plan: plan0, runResult: runResult0, naming: nm0 })

t('render: Discover bash -n 통과', () => bashN(renderDiscover({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0 })))
t('render: Apply bash -n 통과', () => bashN(renderApply({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0, plan: plan0, planDigest: 'deadbeef' })))
t('render: Verify bash -n 통과', () => bashN(renderVerify({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0, manifest: manifest0 })))
t('render: Rollback bash -n 통과', () => bashN(renderRollback({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0, manifest: manifest0 })))
t('render: Resume bash -n 통과', () => bashN(renderResume({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0, plan: plan0, planDigest: 'deadbeef', priorRunResult: { nodes: [{ node: 'vcn', action: 'CREATED', id: 'ocid1.vcn.oc1..x' }] } })))
t('render: Apply 에 run-id 태그·jq·표준변수 포함', () => {
  const s = renderApply({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0, plan: plan0, planDigest: 'deadbeef' }).content
  assert.ok(s.includes('RUN_ID'))
  assert.ok(s.includes('oci network vcn create'))
  assert.ok(s.includes('VCN_ID='))
  assert.ok(s.includes('--freeform-tags'))
  assert.ok(s.includes('artifactType":"run-result') || s.includes('run-result'))
})
t('render: Rollback 이중확인 가드 포함', () => {
  const s = renderRollback({ blueprint: BP, catalog: CATALOG, inputs: INPUTS, naming: nm0, manifest: manifest0 }).content
  assert.ok(s.includes('CONFIRM_RUN_ID'))
  assert.ok(s.includes('CONFIRM_COMPARTMENT_ID'))
  assert.ok(s.includes('blueprint-run-id'))
  assert.ok(s.includes('oci network subnet delete') || s.includes('delete'))
})

// ── manifest ──
t('manifest: provisional 에 rollbackEligible = CREATED', () => {
  assert.equal(manifest0.status, 'PROVISIONAL')
  assert.equal(manifest0.rollbackEligible.length, BP.nodes.length)
})
t('manifest: verification 판정 + merge → FINAL', () => {
  const vr = { artifactType: 'verification-result', runId: 'run-test-1', checks: [
    { node: 'vcn', id: 'vcn-available', comparator: 'lifecycleAvailable', severity: 'fail', actual: 'AVAILABLE', expected: 'AVAILABLE' },
    { node: 'internet-gateway', id: 'igw-available', comparator: 'lifecycleAvailable', severity: 'fail', actual: 'PROVISIONING', expected: 'AVAILABLE' },
  ] }
  const ev = evaluateVerification(vr)
  assert.equal(ev.nodeOutcome.get('vcn'), 'PASS')
  assert.equal(ev.nodeOutcome.get('internet-gateway'), 'FAIL')
  const final = mergeVerification(manifest0, vr)
  assert.equal(final.status, 'FINAL')
  assert.equal(final.nodes.find(n => n.nodeId === 'vcn').verify, 'PASS')
})
t('manifest: evaluateAssertion comparator', () => {
  assert.equal(evaluateAssertion('equals', 'AVAILABLE', 'AVAILABLE'), true)
  assert.equal(evaluateAssertion('containsSet', ['a'], ['a', 'b']), true)
  assert.equal(evaluateAssertion('tagSubset', { k: 'v' }, { k: 'v', x: 1 }), true)
})

// ── 보안: 위조된 __var 로 셸 인젝션 불가 (adversarial regression) ──
t('security: 위조 __var 입력은 리터럴 JSON 으로만 처리(인젝션 차단)', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const evilInputs = { ...INPUTS, 'metadata.definedTags': '{"__var":"x\\"; touch /tmp/PWNED; a=\\""}' }
  const rv = resolveRender({ source: 'input', input: 'metadata.definedTags' }, { blueprint: BP, node: BP.nodes[0], inputs: evilInputs, naming: nm })
  const emitted = emitOption('--defined-tags', rv, 'VCN')
  const blob = [...emitted.pre, emitted.arg].join('\n')
  // 위조 __var 는 VarRef 가 아니므로 bash 변수로 새지 않고, __var 키 자체가 stripReserved 로 제거됨
  assert.ok(!blob.includes('touch /tmp/PWNED'), '페이로드가 bash 로 새면 안 됨')
  assert.ok(!blob.includes('$x'), '위조 변수명이 참조로 변환되면 안 됨')
})
t('security: 실제 VarRef(route rules)만 안전하게 --arg 주입', () => {
  const nm = computeNaming(BP, POL, INPUTS)
  const rv = resolveRender({ source: 'derived', key: 'publicRouteRules' }, { blueprint: BP, node: BP.nodes.find(n => n.id === 'public-route-table'), inputs: INPUTS, naming: nm })
  const emit = emitOption('--route-rules', rv, 'PUBLIC_ROUTE_TABLE')
  assert.ok(emit.pre.join('\n').includes('--arg a0 "$INTERNET_GATEWAY_ID"'))
})
t('security: buildJqExpr 는 비식별자 bash 변수명 거부', () => {
  assert.throws(() => buildJqExpr(new VarRef('x"; rm -rf /; a="')), /잘못된 bash 변수명/)
  assert.doesNotThrow(() => buildJqExpr(new VarRef('VALID_NAME')))
})

console.log(`\nblueprint 엔진 테스트 통과 — ${passed}건`)
