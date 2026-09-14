#!/usr/bin/env node
// CLI UI Wizard 컴파일러 테스트 — 캔버스 그래프를 CliBlueprint 로 컴파일하고 기존 엔진에 통과시킨다.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { composeBlueprint } from '../src/lib/oci-cli/wizardCompose.mjs'
import { computeNaming } from '../src/lib/oci-cli/blueprintNaming.mjs'
import { computePlan } from '../src/lib/oci-cli/blueprintPlan.mjs'
import { renderApply, renderDiscover, renderRollback } from '../src/lib/oci-cli/blueprintRender.mjs'
import { buildProvisionalManifest } from '../src/lib/oci-cli/blueprintManifest.mjs'
import { MODULE_LIST } from '../src/lib/oci-cli/wizardModules.mjs'
import { WIZARD_TEMPLATES } from '../src/lib/oci-cli/wizardTemplates.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CATALOG = JSON.parse(readFileSync(resolve(HERE, '..', '.protected-cache', 'cliCatalog.json'), 'utf8'))
const POLICY = JSON.parse(readFileSync(resolve(HERE, '..', '..', 'blog-db', 'knowledge', 'oci-cli', 'naming-policies', 'msp-standard.v1.json'), 'utf8'))
const REGISTRY = JSON.parse(readFileSync(resolve(HERE, 'oci-cli-blueprint-response-registry.json'), 'utf8'))
// 주: validateBlueprints(빌드 게이트)는 baked blueprint 전용이라, 위저드가 쓰는 런타임 전용
// 구성(generic dnsLabel 파생키·인라인 security-rule JSON)을 거부한다. 따라서 위저드-compose
// 블루프린트 전체를 게이트에 넣지 않고, 신설 자원(instance)의 응답계약만 국소 검증한다.
// 한 노드의 모든 응답 pointer 가 registry.commands[resource] 에 등록됐는지 = 게이트 pointer 규칙의 국소판.
function assertPointersRegistered(node) {
  const single = REGISTRY.commands[node.commandRef.resource]?.single || {}
  const listItem = REGISTRY.commands[node.commandRef.resource]?.listItem || {}
  for (const o of Object.values(node.outputs || {})) assert.ok(single[o.pointer], `output ${o.pointer} ∉ registry.single`)
  for (const f of node.comparison?.fields || []) assert.ok(single[f.actualPointer], `comparison ${f.actualPointer} ∉ single`)
  for (const v of node.verify || []) for (const a of v.assertions || []) assert.ok(single[a.actualPointer], `verify ${a.actualPointer} ∉ single`)
  for (const c of Object.values(node.discovery?.get?.collect || {})) assert.ok(single[c.pointer], `collect ${c.pointer} ∉ single`)
  assert.ok(listItem[node.discovery.identity.idPointer], `idPointer ${node.discovery.identity.idPointer} ∉ listItem`)
  assert.ok(listItem[node.discovery.identity.namePointer], `namePointer ${node.discovery.identity.namePointer} ∉ listItem`)
  assert.equal(node.discovery.list.itemsPointer, REGISTRY.commands[node.commandRef.resource].listItems)
}

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

// network-baseline 를 캔버스 그래프로 표현(사용자가 그린 것과 동형)
const N = (id, moduleType, role, inputs = {}) => ({ id, moduleType, role, label: id, inputs })
const E = (from, to, slot) => ({ id: `${from}->${to}:${slot}`, from, to, slot })
function networkGraph() {
  return {
    id: 'wiz-net', label: '2-Tier 네트워크(위저드)', namingPolicyId: 'msp-standard',
    execution: { region: 'ap-seoul-1', compartment: 'ocid1.compartment.oc1..aaaa', profile: 'DEFAULT', compartmentMode: 'OCID' },
    naming: { customer: 'ACME', workload: 'web', environment: 'prd', regionAlias: 'icn', sequence: '01' },
    nodes: [
      N('vcn', 'vcn', 'main', { vcnCidrs: '["10.0.0.0/16"]' }),
      N('igw', 'internet-gateway', 'main'),
      N('nat', 'nat-gateway', 'main'),
      N('sgw', 'service-gateway', 'main'),
      N('rtpub', 'route-table', 'public'),
      N('rtpriv', 'route-table', 'private'),
      N('slpub', 'security-list', 'public', { enableSshIngress: 'true', sshSourceCidr: '203.0.113.0/24' }),
      N('slpriv', 'security-list', 'private', { enableSshIngress: 'false' }),
      N('subpub', 'subnet', 'public', { cidr: '10.0.10.0/24' }),
      N('subpriv', 'subnet', 'private', { cidr: '10.0.20.0/24' }),
    ],
    edges: [
      E('vcn', 'igw', 'vcn'), E('vcn', 'nat', 'vcn'), E('vcn', 'sgw', 'vcn'),
      E('vcn', 'rtpub', 'vcn'), E('igw', 'rtpub', 'route-target'),
      E('vcn', 'rtpriv', 'vcn'), E('nat', 'rtpriv', 'route-target'), E('sgw', 'rtpriv', 'route-target'),
      E('vcn', 'slpub', 'vcn'), E('vcn', 'slpriv', 'vcn'),
      E('vcn', 'subpub', 'vcn'), E('rtpub', 'subpub', 'route-table'), E('slpub', 'subpub', 'security-list'),
      E('vcn', 'subpriv', 'vcn'), E('rtpriv', 'subpriv', 'route-table'), E('slpriv', 'subpriv', 'security-list'),
    ],
  }
}

const emptyDiscovery = bp => ({ artifactType: 'discovery-result', services: [{ key: 'oracleServicesNetworkAll', items: [{ id: 'ocid1.service.oc1..all', name: 'all', 'cidr-block': 'all-icn' }] }], nodes: bp.nodes.map(n => ({ node: n.id, status: 'OK', found: null })) })

t('모듈 목록 노출', () => { assert.ok(MODULE_LIST.length >= 7); assert.ok(MODULE_LIST.find(m => m.type === 'vcn')) })

t('compose: 유효 그래프 → issue 없음, 10 노드', () => {
  const { blueprint, issues } = composeBlueprint(networkGraph(), POLICY)
  assert.deepEqual(issues, [])
  assert.equal(blueprint.nodes.length, 10)
})

t('compose+엔진: 전부 CREATE, executable', () => {
  const g = networkGraph()
  const { blueprint, inputs } = composeBlueprint(g, POLICY)
  const nm = computeNaming(blueprint, POLICY, inputs)
  assert.deepEqual(nm.issues, [])
  const plan = computePlan({ blueprint, inputs, naming: nm, discovery: emptyDiscovery(blueprint) })
  assert.equal(plan.executable, true)
  assert.equal(plan.createCount, 10)
})

t('compose+render: Apply/Discover/Rollback bash -n 통과', () => {
  const g = networkGraph()
  const { blueprint, inputs } = composeBlueprint(g, POLICY)
  const nm = computeNaming(blueprint, POLICY, inputs)
  const plan = computePlan({ blueprint, inputs, naming: nm, discovery: emptyDiscovery(blueprint) })
  const rr = { artifactType: 'run-result', runId: 'run-x', planDigest: 'd', nodes: blueprint.nodes.map((n, i) => ({ node: n.id, action: 'CREATED', id: `ocid1.${n.commandRef.resource}.oc1..n${i}` })) }
  const manifest = buildProvisionalManifest({ blueprint, plan, runResult: rr, naming: nm })
  const scripts = [renderApply({ blueprint, catalog: CATALOG, inputs, naming: nm, plan, planDigest: 'd' }), renderDiscover({ blueprint, catalog: CATALOG, inputs, naming: nm }), renderRollback({ blueprint, catalog: CATALOG, inputs, naming: nm, manifest })]
  const TMP = mkdtempSync(resolve(tmpdir(), 'wiz-'))
  for (const s of scripts) { const f = resolve(TMP, s.name); writeFileSync(f, s.content); execFileSync('bash', ['-n', f]) }
})

t('route rules: 공용 RT→IGW, 사설 RT→NAT+SGW(서비스 CIDR discovery)', () => {
  const g = networkGraph()
  const { blueprint } = composeBlueprint(g, POLICY)
  const rtpub = blueprint.nodes.find(n => n.id === 'rtpub')
  const rr = rtpub.bindings['--route-rules'].value
  assert.equal(rr.length, 1)
  assert.equal(rr[0].networkEntityId.node, 'igw')
  assert.equal(rr[0].destination, '0.0.0.0/0')
  const rtpriv = blueprint.nodes.find(n => n.id === 'rtpriv')
  const pr = rtpriv.bindings['--route-rules'].value
  assert.equal(pr.length, 2)
  const entities = pr.map(r => r.networkEntityId.node).sort()
  assert.deepEqual(entities, ['nat', 'sgw'])
  const svc = pr.find(r => r.destinationType === 'SERVICE_CIDR_BLOCK')
  assert.equal(svc.destination.source, 'discovery')
})

t('subnet: vcn/rt/sl 엣지 바인딩 + dhcp 자동 + prohibit-public-ip role', () => {
  const g = networkGraph()
  const { blueprint } = composeBlueprint(g, POLICY)
  const subpub = blueprint.nodes.find(n => n.id === 'subpub')
  assert.equal(subpub.bindings['--vcn-id'].node, 'vcn')
  assert.equal(subpub.bindings['--route-table-id'].node, 'rtpub')
  assert.equal(subpub.bindings['--security-list-ids'].source, 'json')
  assert.equal(subpub.bindings['--security-list-ids'].value[0].node, 'slpub')
  assert.equal(subpub.bindings['--dhcp-options-id'].path, '/data/default-dhcp-options-id')
  assert.equal(subpub.bindings['--prohibit-public-ip-on-vnic'].value, false)
  const subpriv = blueprint.nodes.find(n => n.id === 'subpriv')
  assert.equal(subpriv.bindings['--prohibit-public-ip-on-vnic'].value, true)
})

t('security rules: enableSshIngress on→SSH ingress, off→없음', () => {
  const { blueprint } = composeBlueprint(networkGraph(), POLICY)
  const slpub = blueprint.nodes.find(n => n.id === 'slpub')
  assert.equal(slpub.bindings['--ingress-security-rules'].value.length, 1)
  const slpriv = blueprint.nodes.find(n => n.id === 'slpriv')
  assert.equal(slpriv.bindings['--ingress-security-rules'].value.length, 0)
})

t('검증: 필수 연결 누락 → issue', () => {
  const g = networkGraph()
  g.edges = g.edges.filter(e => !(e.to === 'subpub' && e.slot === 'route-table'))
  const { issues } = composeBlueprint(g, POLICY)
  assert.ok(issues.some(i => i.includes('route-table')))
})

t('검증: 타입 불일치 연결 → issue', () => {
  const g = networkGraph()
  g.edges.push(E('subpriv', 'igw', 'vcn')) // igw 의 vcn 슬롯에 subnet 연결
  const { issues } = composeBlueprint(g, POLICY)
  assert.ok(issues.some(i => i.includes('연결 불가')))
})

t('검증: cycle → issue', () => {
  const g = { ...networkGraph(), nodes: [N('a', 'route-table', 'public'), N('b', 'route-table', 'private')], edges: [E('a', 'b', 'route-target'), E('b', 'a', 'route-target')] }
  const { issues } = composeBlueprint(g, POLICY)
  assert.ok(issues.some(i => i.includes('cycle')))
})

// ── 시작 템플릿 레지스트리 — 모든 템플릿이 issue 없이 compose 되어야 한다 ──
t('템플릿 레지스트리 ≥ 4개, id 유일', () => {
  assert.ok(WIZARD_TEMPLATES.length >= 4)
  const ids = WIZARD_TEMPLATES.map(x => x.id)
  assert.equal(ids.length, new Set(ids).size)
})
for (const tpl of WIZARD_TEMPLATES) {
  t(`템플릿 '${tpl.id}' → compose issue 0 · 계약 pointer · 이름 유일`, () => {
    const graph = tpl.build()
    assert.ok(graph.nodes.length > 0, 'nodes 비어있음')
    // 모든 노드의 moduleType 이 실제 모듈이어야 함
    for (const n of graph.nodes) assert.ok(MODULE_LIST.find(m => m.type === n.moduleType), `미지 모듈 ${n.moduleType}`)
    const { blueprint, issues } = composeBlueprint(graph, POLICY)
    assert.deepEqual(issues, [], `issues: ${issues.join(' / ')}`)
    assert.equal(blueprint.nodes.length, graph.nodes.length)
    // 등록된 계약(registry)이 있는 자원 노드는 응답 pointer 가 계약에 모두 존재해야 함
    for (const node of blueprint.nodes) {
      if (REGISTRY.commands[node.commandRef.resource]) assertPointersRegistered(node)
    }
    // displayName 중복 없음(같은 role+resource 충돌 방지)
    const naming = computeNaming(blueprint, POLICY, composeBlueprint(graph, POLICY).inputs)
    const names = Object.values(naming?.names ?? {}).map(v => (typeof v === 'string' ? v : v?.displayName)).filter(Boolean)
    assert.equal(names.length, new Set(names).size, `displayName 중복: ${names.join(', ')}`)
  })
}

// ── compute(instance) 응답계약 — 최소 그래프(vcn→subnet→instance)로 게이트 직접 검증 ──
t('instance 모듈 노출 + compute 그룹', () => {
  const m = MODULE_LIST.find(x => x.type === 'instance')
  assert.ok(m, 'instance 모듈 없음')
  assert.equal(m.group, 'compute')
})
t('instance 최소 그래프 → compose issue 0 + 게이트 통과(계약 증명)', () => {
  const g = {
    id: 'wiz-inst', label: 'instance 계약검증', namingPolicyId: 'msp-standard',
    execution: { region: 'ap-seoul-1', compartment: 'ocid1.compartment.oc1..aaaa', profile: 'DEFAULT', compartmentMode: 'OCID' },
    naming: { customer: 'ACME', workload: 'app', environment: 'prd', regionAlias: 'icn', sequence: '01' },
    nodes: [
      N('vcn', 'vcn', 'main', { vcnCidrs: '["10.0.0.0/16"]' }),
      N('nat', 'nat-gateway', 'main'),
      N('sgw', 'service-gateway', 'main'),
      N('rtpriv', 'route-table', 'private'),
      N('slpriv', 'security-list', 'private', { enableSshIngress: 'false' }),
      N('subpriv', 'subnet', 'private', { cidr: '10.0.20.0/24' }),
      N('inst', 'instance', 'app', { availabilityDomain: 'Uocm:AP-SEOUL-1-AD-1', shape: 'VM.Standard.E5.Flex', shapeConfig: '{"ocpus":1,"memoryInGBs":16}', imageId: 'ocid1.image.oc1..img', metadata: '' }),
    ],
    edges: [
      E('vcn', 'nat', 'vcn'), E('vcn', 'sgw', 'vcn'),
      E('vcn', 'rtpriv', 'vcn'), E('nat', 'rtpriv', 'route-target'), E('sgw', 'rtpriv', 'route-target'),
      E('vcn', 'slpriv', 'vcn'),
      E('vcn', 'subpriv', 'vcn'), E('rtpriv', 'subpriv', 'route-table'), E('slpriv', 'subpriv', 'security-list'),
      E('subpriv', 'inst', 'subnet'),
    ],
  }
  const { blueprint, issues } = composeBlueprint(g, POLICY)
  assert.deepEqual(issues, [], `issues: ${issues.join(' / ')}`)
  const inst = blueprint.nodes.find(n => n.commandRef.resource === 'instance')
  assert.ok(inst, 'instance 노드 없음')
  // ★ 응답계약 증명 — instance 노드의 모든 pointer 가 registry.commands.instance 에 등록됨
  assertPointersRegistered(inst)
  // 정상상태 RUNNING 으로 비교/검증하는지(네트워크 AVAILABLE 와 구분)
  assert.equal(inst.comparison.fields.find(f => f.key === 'lifecycleState').desired.value, 'RUNNING')
  assert.equal(inst.verify[0].assertions.find(a => a.id.endsWith('-available')).expected.value, 'RUNNING')
  // 필수 create 옵션(--availability-domain/--compartment-id/--subnet-id) 전부 바인딩
  for (const opt of ['--availability-domain', '--compartment-id', '--subnet-id']) assert.ok(inst.bindings[opt], `미바인딩 ${opt}`)
  // 엔진 통과 + Apply/Discover/Rollback bash -n (shape-config/metadata json → file:// 렌더 포함)
  const { inputs } = composeBlueprint(g, POLICY)
  const nm = computeNaming(blueprint, POLICY, inputs)
  assert.deepEqual(nm.issues, [])
  const plan = computePlan({ blueprint, inputs, naming: nm, discovery: emptyDiscovery(blueprint) })
  assert.equal(plan.executable, true)
  const rr = { artifactType: 'run-result', runId: 'run-x', planDigest: 'd', nodes: blueprint.nodes.map((n, i) => ({ node: n.id, action: 'CREATED', id: `ocid1.${n.commandRef.resource}.oc1..n${i}` })) }
  const manifest = buildProvisionalManifest({ blueprint, plan, runResult: rr, naming: nm })
  const scripts = [renderApply({ blueprint, catalog: CATALOG, inputs, naming: nm, plan, planDigest: 'd' }), renderDiscover({ blueprint, catalog: CATALOG, inputs, naming: nm }), renderRollback({ blueprint, catalog: CATALOG, inputs, naming: nm, manifest })]
  const TMP = mkdtempSync(resolve(tmpdir(), 'wiz-inst-'))
  for (const s of scripts) { const f = resolve(TMP, s.name); writeFileSync(f, s.content); execFileSync('bash', ['-n', f]) }
  // Apply 스크립트에 instance launch 가 포함되는지
  assert.ok(scripts[0].content.includes('compute instance launch'), 'apply 에 instance launch 없음')
})

console.log(`\nwizard compose 테스트 통과 — ${passed}건`)
