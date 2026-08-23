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

const HERE = dirname(fileURLToPath(import.meta.url))
const CATALOG = JSON.parse(readFileSync(resolve(HERE, '..', '.protected-cache', 'cliCatalog.json'), 'utf8'))
const POLICY = JSON.parse(readFileSync(resolve(HERE, '..', '..', 'blog-db', 'knowledge', 'oci-cli', 'naming-policies', 'msp-standard.v1.json'), 'utf8'))

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

console.log(`\nwizard compose 테스트 통과 — ${passed}건`)
