// discovery 결과 + 입력으로 노드별 plan state 를 계산한다. 순수 함수.
// 안전 원칙: 재사용을 확신할 수 없으면 CONFLICT/ BLOCKED 로 떨어뜨려 사용자가 판단하게 한다.
import { topoOrder } from './blueprintGraph.mjs'
import { resolveCompare } from './blueprintResolve.mjs'
import { canonicalize } from './jsonCanonical.mjs'

// OCI 입력 형식(camelCase)과 응답 형식(kebab-case)을 통일: key 에서 하이픈 제거 + 소문자,
// null/''/undefined 값 제거 후 비교한다.
function normForSet(v) {
  if (Array.isArray(v)) {
    const items = v.map(normForSet)
    return items.slice().sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  }
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (val === null || val === undefined || val === '') continue
      out[k.replace(/-/g, '').toLowerCase()] = normForSet(val)
    }
    return out
  }
  return v
}

function setEqual(a, b) {
  const aa = Array.isArray(a) ? a : (a == null ? [] : [a])
  const bb = Array.isArray(b) ? b : (b == null ? [] : [b])
  return canonicalize(normForSet(aa)) === canonicalize(normForSet(bb))
}

export function compareField(comparator, desired, actual) {
  switch (comparator) {
    case 'string': return String(desired ?? '') === String(actual ?? '')
    case 'boolean': return Boolean(desired) === Boolean(actual)
    case 'cidrSet':
    case 'ocidSet':
    case 'jsonSet': return setEqual(desired, actual)
    case 'tagSubset': {
      if (!actual || typeof actual !== 'object') return false
      for (const [k, val] of Object.entries(desired || {})) {
        if (val === '' || val == null) continue // plan 단계 run-id 등 volatile 은 건너뜀
        if (String(actual[k]) !== String(val)) return false
      }
      return true
    }
    default: return false
  }
}

const getPointer = (obj, pointer) => {
  if (obj == null) return undefined
  const parts = String(pointer).split('/').filter(Boolean)
  let cur = obj
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p] }
  return cur
}

/**
 * @param {{ blueprint:any, inputs:Record<string,string>, naming:any, discovery:any, runId?:string }} args
 * @returns {import('./blueprintTypes.d.mts').Plan}
 */
export function computePlan({ blueprint, inputs, naming, discovery, runId }) {
  const order = topoOrder(blueprint.nodes)
  const byId = new Map(blueprint.nodes.map(n => [n.id, n]))
  const discByNode = new Map((discovery?.nodes || []).map(n => [n.node, n]))
  const services = discovery?.services || []
  const effectiveInputs = discovery?.context?.compartmentId
    ? { ...inputs, 'execution.compartment': discovery.context.compartmentId }
    : inputs

  // 확정된 OCID 조회기(재사용/발견된 것만). 생성 예정 노드는 undefined.
  const nodeOcid = (nodeId, pointer) => {
    const d = discByNode.get(nodeId)
    if (!d || d.status !== 'OK' || !d.found) return undefined
    const tail = String(pointer).split('/').filter(Boolean).pop()
    if (tail === 'id') return d.found.id
    return d.found.collected ? d.found.collected[pointer] : undefined
  }
  const discoveryVal = (key, pointer) => {
    const svc = services.find(s => s.key === key)
    const item = svc?.items?.[0]
    if (!item) return undefined
    const tail = String(pointer).split('/').filter(Boolean).pop()
    return tail === 'id' ? item.id : item[tail]
  }

  const nodes = []
  for (const nodeId of order) {
    const node = byId.get(nodeId)
    const role = node.naming.role
    const resource = node.commandRef.resource
    const displayName = naming.names[nodeId]?.displayName ?? nodeId
    const d = discByNode.get(nodeId)
    const base = { nodeId, role, resource, displayName }

    if (d && d.status === 'DISCOVERY_ERROR') { nodes.push({ ...base, state: 'BLOCKED', reasons: [`discovery 오류: ${d.error ?? '알 수 없음'}`] }); continue }
    if (d && Array.isArray(d.candidates) && d.candidates.length > 1) { nodes.push({ ...base, state: 'BLOCKED', reasons: [`동일 이름 후보 ${d.candidates.length}개 — 수동 확인 필요`] }); continue }
    if (!d || !d.found) { nodes.push({ ...base, state: 'CREATE', reasons: ['기존 자원 없음 → 신규 생성'] }); continue }

    // found → comparison
    const ctx = { blueprint, node, inputs: effectiveInputs, naming, nodeOcid, discovery: discoveryVal, runId }
    const diffs = []
    let indeterminate = false
    for (const f of node.comparison.fields) {
      let desired
      try { desired = resolveCompare(f.desired, ctx) } catch { indeterminate = true; diffs.push({ key: f.key, desired: undefined, actual: undefined, equal: false }); continue }
      const actual = getPointer(d.found.collected || {}, f.actualPointer)
      if (desired === undefined || (typeof desired === 'object' && JSON.stringify(desired).includes('""') && f.comparator === 'string')) indeterminate = true
      const equal = compareField(f.comparator, desired, actual)
      diffs.push({ key: f.key, desired, actual, equal })
    }
    const allEqual = diffs.every(x => x.equal)
    if (allEqual && !indeterminate) nodes.push({ ...base, state: 'REUSE', existingId: d.found.id, reasons: ['관리 필드 일치 → 재사용'], diffs })
    else nodes.push({ ...base, state: 'CONFLICT', existingId: d.found.id, reasons: ['동일 이름 자원이 있으나 관리 필드가 다름 — 사용자 확인 필요'], diffs })
  }

  const count = s => nodes.filter(n => n.state === s).length
  const conflictCount = count('CONFLICT'), blockedCount = count('BLOCKED')
  return {
    blueprintId: blueprint.id,
    blueprintVersion: String(blueprint.version),
    blueprintDigest: blueprint.digest,
    order,
    nodes,
    createCount: count('CREATE'),
    reuseCount: count('REUSE'),
    conflictCount,
    blockedCount,
    executable: conflictCount === 0 && blockedCount === 0,
  }
}

/** Plan Digest 입력(민감값 제외, 결정적). run-result 를 이 plan 에 묶는 근거. */
export function planDigestInput(plan) {
  return {
    blueprintId: plan.blueprintId,
    blueprintVersion: plan.blueprintVersion,
    blueprintDigest: plan.blueprintDigest ?? null,
    nodes: plan.nodes.map(n => ({ nodeId: n.nodeId, state: n.state, existingId: n.existingId ?? null, displayName: n.displayName })),
  }
}
