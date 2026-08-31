// CLI UI Wizard 컴파일러 — 캔버스 그래프 → 런타임 CliBlueprint(+inputs). 순수 함수.
// 결과를 기존 블루프린트 엔진(computeNaming/computePlan/render*)에 그대로 흘려보낸다.
//
// 그래프 형태:
//  { id, label, namingPolicyId, execution:{region,compartment,profile,compartmentMode},
//    naming:{customer,workload,environment,regionAlias,sequence,mode?,separator?,includedSegments?,segmentOrder?},
//    metadata:{definedTags?}, nodes:[{id,moduleType,label,role?,inputs:{}}], edges:[{id,from,to,slot}] }
//  엣지 방향: to 노드가 from 노드의 출력을 소비(to 가 from 에 의존). slot = to 노드의 입력 슬롯.
import { WIZARD_MODULES, ROUTE_TARGET, buildSecurityRules } from './wizardModules.mjs'
import { topoOrder } from './blueprintGraph.mjs'

const BASE_ROLLBACK_OWNERSHIP = { requiredActualAction: 'CREATED', runIdTagKey: 'blueprint-run-id', requireCurrentTagMatch: true }

const ctxSource = key => ({ source: 'context', key })
const nodeOut = (node, path = '/data/id') => ({ source: 'nodeOutput', node, path })
const inputSource = id => ({ source: 'input', input: id })
const derivedSource = key => ({ source: 'derived', key })

// 게이트웨이 route-target 엣지 → route rule (networkEntityId 는 대상 노드 출력)
function routeRuleFor(targetModuleType, fromNodeId) {
  const t = ROUTE_TARGET[targetModuleType]
  if (!t) return null
  const rule = { destinationType: t.destinationType, networkEntityId: nodeOut(fromNodeId, '/data/id'), description: `wizard: ${t.desc}` }
  rule.destination = t.destinationDiscovery
    ? { source: 'discovery', key: t.destinationDiscovery[0], path: t.destinationDiscovery[1] }
    : t.destination
  return rule
}

const SERVICES_VALUE = [{ serviceId: { source: 'discovery', key: 'oracleServicesNetworkAll', path: '/id' } }]

export function composeBlueprint(graph, policy) {
  const issues = []
  const nodesById = new Map((graph.nodes || []).map(n => [n.id, n]))
  // 노드별 들어오는 엣지: byTo[toId][slot] = [fromId,...]
  const byTo = new Map()
  for (const e of graph.edges || []) {
    if (!nodesById.has(e.from)) { issues.push(`엣지 ${e.id}: 존재하지 않는 from 노드 '${e.from}'`); continue }
    if (!nodesById.has(e.to)) { issues.push(`엣지 ${e.id}: 존재하지 않는 to 노드 '${e.to}'`); continue }
    if (!byTo.has(e.to)) byTo.set(e.to, {})
    const slots = byTo.get(e.to)
    ;(slots[e.slot] ||= []).push(e.from)
  }

  const inputs = {}
  // 실행 컨텍스트 + 명명 + 메타
  const ex = graph.execution || {}
  inputs['execution.region'] = ex.region ?? ''
  inputs['execution.compartment'] = ex.compartment ?? ''
  inputs['execution.profile'] = ex.profile ?? 'DEFAULT'
  inputs['execution.compartmentMode'] = ex.compartmentMode ?? 'OCID'
  for (const [k, v] of Object.entries(graph.naming || {})) inputs[`naming.${k}`] = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
  inputs['metadata.definedTags'] = graph.metadata?.definedTags ? (typeof graph.metadata.definedTags === 'object' ? JSON.stringify(graph.metadata.definedTags) : String(graph.metadata.definedTags)) : ''

  const blueprintInputs = []
  const seenInputId = new Set()
  const registerInput = (id, def) => { if (seenInputId.has(id)) return; seenInputId.add(id); blueprintInputs.push({ id, ...def }) }
  // 엔진 computeNaming/컨텍스트가 참조하는 표준 input 정의(값은 위 inputs 맵)
  for (const id of ['execution.region', 'execution.compartment', 'execution.profile', 'execution.compartmentMode', 'metadata.definedTags'])
    registerInput(id, { label: id, group: id.startsWith('execution') ? 'execution' : 'metadata', type: id === 'metadata.definedTags' ? 'json' : 'string', requirement: 'optional' })

  const nodes = []
  for (const gnode of graph.nodes || []) {
    const module = WIZARD_MODULES[gnode.moduleType]
    if (!module) { issues.push(`노드 ${gnode.id}: 알 수 없는 모듈 '${gnode.moduleType}'`); continue }
    const role = gnode.role || module.defaultRole
    const slots = byTo.get(gnode.id) || {}
    const nodeInputs = gnode.inputs || {}
    const inputIdOf = key => `node.${gnode.id}.${key}`

    // 슬롯 필수/타입 검증 + 첫 from 헬퍼
    const firstFrom = slot => (slots[slot] || [])[0]
    for (const es of module.edgeSlots) {
      const got = slots[es.slot] || []
      if (es.required && got.length === 0) issues.push(`노드 ${gnode.id}(${module.label}): 필수 연결 '${es.slot}' 누락`)
      for (const from of got) {
        const targets = Array.isArray(es.target) ? es.target : [es.target]
        const fromType = nodesById.get(from)?.moduleType
        if (fromType && !targets.includes(fromType)) issues.push(`노드 ${gnode.id}: '${es.slot}' 에 ${fromType} 연결 불가(허용: ${targets.join('/')})`)
      }
    }

    // ── 공통 바인딩 ──
    const bindings = {
      '--compartment-id': ctxSource('compartmentId'),
      '--display-name': { source: 'name' },
      '--freeform-tags': derivedSource('managedFreeformTags'),
      '--defined-tags': inputSource('metadata.definedTags'),
    }
    for (const [opt, val] of Object.entries(module.fixed || {})) bindings[opt] = { source: 'literal', value: val }

    // ── 스칼라 입력 ──
    for (const si of module.scalarInputs || []) {
      const id = inputIdOf(si.key)
      const val = nodeInputs[si.key] ?? si.default ?? ''
      inputs[id] = typeof val === 'object' ? JSON.stringify(val) : String(val)
      registerInput(id, { label: `${module.label} ${si.label}`, group: 'topology', type: si.type, requirement: si.required ? 'required' : 'optional' })
      if (si.option) bindings[si.option] = inputSource(id)
    }

    // ── 엣지 바인딩(as 없음) ──
    for (const es of module.edgeSlots) {
      if (es.as) continue // routeRules 등은 아래에서
      if (!es.option) continue
      const got = slots[es.slot] || []
      if (got.length === 0) continue
      bindings[es.option] = es.multiple
        ? { source: 'json', value: got.map(f => nodeOut(f, es.pointer)) }
        : nodeOut(got[0], es.pointer)
    }

    // ── route rules (route-table) ──
    let routeRulesValue = null
    const rtSlot = module.edgeSlots.find(es => es.as === 'routeRules')
    if (rtSlot) {
      const targets = slots[rtSlot.slot] || []
      routeRulesValue = targets.map(f => routeRuleFor(nodesById.get(f)?.moduleType, f)).filter(Boolean)
      bindings['--route-rules'] = { source: 'json', value: routeRulesValue }
    }

    // ── security rules (security-list) ──
    let secRules = null
    if (module.securityRules) {
      secRules = buildSecurityRules(nodeInputs)
      bindings['--ingress-security-rules'] = { source: 'json', value: secRules.ingress }
      bindings['--egress-security-rules'] = { source: 'json', value: secRules.egress }
    }

    // ── service gateway --services (discovery) ──
    if (module.servicesFromDiscovery) bindings['--services'] = { source: 'json', value: SERVICES_VALUE }

    // ── dhcp-options-id: 연결된 vcn 의 default-dhcp-options-id 자동 ──
    if (module.dhcpFromVcn) {
      const vcnFrom = firstFrom('vcn')
      if (vcnFrom) bindings['--dhcp-options-id'] = nodeOut(vcnFrom, '/data/default-dhcp-options-id')
    }
    // ── prohibit-public-ip-on-vnic: role 기반 ──
    if (module.prohibitPublicIpByRole) bindings['--prohibit-public-ip-on-vnic'] = { source: 'literal', value: !!module.prohibitPublicIpByRole[role] }
    // ── dns-label: 노드 dnsLabel ──
    if (module.dnsLabel) bindings['--dns-label'] = derivedSource('dnsLabel')

    // ── src 해석기(comparison/verify 용) ──
    const resolveSrc = src => {
      if (src.context) return ctxSource(src.context)
      if (src.scalar) return inputSource(inputIdOf(src.scalar))
      if (src.literal !== undefined) return { source: 'literal', value: src.literal }
      if (src.dnsLabel) return derivedSource('dnsLabel')
      if (src.services) return { source: 'json', value: SERVICES_VALUE }
      if (src.routeRules) return { source: 'json', value: routeRulesValue || [] }
      if (src.ingressRules) return { source: 'json', value: secRules ? secRules.ingress : [] }
      if (src.egressRules) return { source: 'json', value: secRules ? secRules.egress : [] }
      if (src.prohibitByRole) return { source: 'literal', value: !!module.prohibitPublicIpByRole?.[role] }
      if (src.dhcpFromVcn) { const f = firstFrom('vcn'); return f ? nodeOut(f, '/data/default-dhcp-options-id') : { source: 'literal', value: '' } }
      if (src.edge) {
        const got = slots[src.edge] || []
        if (src.array) return { source: 'json', value: got.map(f => nodeOut(f, '/data/id')) }
        return got[0] ? nodeOut(got[0], '/data/id') : { source: 'literal', value: '' }
      }
      return { source: 'literal', value: '' }
    }

    // ── dependsOn = 들어오는 엣지의 from 들 ──
    const dependsOn = [...new Set(Object.values(slots).flat())]

    // ── discovery ──
    const listBindings = { '--compartment-id': ctxSource('compartmentId') }
    if (firstFrom('vcn')) listBindings['--vcn-id'] = nodeOut(firstFrom('vcn'), '/data/id')
    const collectPtrs = new Set(['/data/lifecycle-state', '/data/freeform-tags', ...Object.keys(module.collect || {}), ...(module.extraComparison || []).map(c => c.actualPointer)])
    const collect = {}
    for (const p of collectPtrs) collect[p] = { pointer: p, type: (module.collect || {})[p] || 'string' }

    // ── comparison(base + extra) ──
    // 자원마다 "정상 가동" lifecycle 값이 다르다(네트워크=AVAILABLE, compute=RUNNING).
    // 모듈이 lifecycleReadyState 로 지정하면 base 비교/검증이 그 값을 쓴다(미지정 시 AVAILABLE).
    const readyState = module.lifecycleReadyState || 'AVAILABLE'
    const comparison = { mode: 'exactManagedFields', fields: [
      { key: 'lifecycleState', desired: { source: 'literal', value: readyState }, actualPointer: '/data/lifecycle-state', comparator: 'string', required: true },
      { key: 'managedTags', desired: derivedSource('managedFreeformTags'), actualPointer: '/data/freeform-tags', comparator: 'tagSubset', required: true },
      ...(module.extraComparison || []).map(c => ({ key: c.key, desired: resolveSrc(c.src), actualPointer: c.actualPointer, comparator: c.comparator, required: true })),
    ] }

    // ── verify(base + extra) ──
    const verifyAssertions = [
      { id: `${gnode.id}-available`, actualPointer: '/data/lifecycle-state', comparator: 'lifecycleAvailable', expected: { source: 'literal', value: readyState }, severity: 'fail' },
      { id: `${gnode.id}-managed-tags`, actualPointer: '/data/freeform-tags', comparator: 'tagSubset', expected: derivedSource('managedFreeformTags'), severity: 'fail' },
      ...(module.extraVerify || []).map(v => ({ id: `${gnode.id}-${v.id}`, actualPointer: v.actualPointer, comparator: v.comparator, expected: resolveSrc(v.src), severity: 'fail' })),
    ]

    nodes.push({
      id: gnode.id,
      label: gnode.label || module.label,
      commandRef: { resource: module.resource, operation: 'create' },
      naming: { role, resourceToken: policy.resourceTokens?.[module.resource] || module.resource },
      dependsOn,
      bindings,
      discovery: {
        list: { commandRef: { kind: 'resourceOperation', resource: module.resource, operation: 'list' }, bindings: listBindings, pagination: 'all', itemsPointer: '/data' },
        identity: { idPointer: '/id', namePointer: '/display-name', expectedName: { source: 'name' }, cardinality: 'zero-or-one' },
        get: { commandRef: { kind: 'resourceOperation', resource: module.resource, operation: 'get' }, idOption: module.getIdOption, collect },
        onError: 'block',
      },
      comparison,
      outputs: {
        id: { pointer: '/data/id', type: 'string' },
        lifecycleState: { pointer: '/data/lifecycle-state', type: 'string' },
        ...(module.extraOutputs || {}),
      },
      verify: [{ commandRef: { kind: 'resourceOperation', resource: module.resource, operation: 'get' }, bindings: {}, assertions: verifyAssertions }],
      rollback: { commandRef: { kind: 'resourceOperation', resource: module.resource, operation: 'delete' }, idOption: module.deleteIdOption, waitForState: 'TERMINATED', ownership: BASE_ROLLBACK_OWNERSHIP },
    })
  }

  // cycle 검출(엔진 DAG 재사용) — Apply 전에 차단
  try { topoOrder(nodes) } catch (e) { issues.push(`의존성 cycle: ${(e && e.message) || e}`) }
  if (nodes.length === 0) issues.push('노드가 없습니다 — 리소스를 캔버스에 추가하세요.')

  const blueprint = {
    id: graph.id || 'wizard-composed',
    version: '1',
    label: graph.label || 'CLI UI Wizard 구성',
    description: '드래그앤드롭 캔버스에서 조합된 아키텍처',
    category: 'network',
    status: 'draft',
    namingPolicyId: graph.namingPolicyId || policy.id,
    inputs: blueprintInputs,
    presets: [],
    nodes,
    rollback: { order: 'reverseDag', reusedNodesDeleted: false, requireConfirm: ['CONFIRM_RUN_ID', 'CONFIRM_COMPARTMENT_ID'] },
    evidence: { verifiedAt: '2026-08-24', notes: ['CLI UI Wizard 로 조합됨 — 실행 전 검토 필수'] },
  }

  return { blueprint, inputs, issues }
}
