// run-result / verification-result → manifest. 순수 함수.
//  - buildProvisionalManifest: Apply 결과를 PROVISIONAL manifest 로
//  - evaluateVerification: verify 원시 덤프를 assertion comparator 로 판정
//  - mergeVerification: 판정을 붙여 FINAL manifest 로
import { canonicalize } from './jsonCanonical.mjs'

const worst = (a, b) => {
  const rank = { PASS: 0, WARN: 1, FAIL: 2, ERROR: 3 }
  return (rank[b] ?? 0) > (rank[a] ?? 0) ? b : a
}

function toSet(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]) }
function normKeys(v) {
  if (Array.isArray(v)) return v.map(normKeys)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, val] of Object.entries(v)) { if (val === null || val === '' || val === undefined) continue; o[k.replace(/-/g, '').toLowerCase()] = normKeys(val) }
    return o
  }
  return v
}
// sub 가 sup 에 부분집합으로 포함되는가(정규화 후). 객체는 키/값 포함, 배열은 각 원소가 매칭, 스칼라는 동일.
// OCI GET 응답이 요청보다 필드가 많은 경우(route-type, cidr-block 등)를 허용하기 위함.
function deepSubset(sub, sup) {
  if (Array.isArray(sub)) return Array.isArray(sup) && sub.every(s => sup.some(u => deepSubset(s, u)))
  if (sub && typeof sub === 'object') {
    if (!sup || typeof sup !== 'object' || Array.isArray(sup)) return false
    return Object.entries(sub).every(([k, val]) => deepSubset(val, sup[k]))
  }
  return canonicalize(sub) === canonicalize(sup)
}

export function evaluateAssertion(comparator, expected, actual) {
  switch (comparator) {
    case 'equals': return canonicalize(normKeys(actual)) === canonicalize(normKeys(expected))
    case 'lifecycleAvailable': return String(actual) === String(expected ?? 'AVAILABLE')
    case 'containsSet': {
      // 각 expected 원소가 어떤 actual 원소에 부분집합으로 포함되면 통과(응답의 추가 필드 허용)
      const acts = toSet(actual).map(normKeys)
      return toSet(expected).map(normKeys).every(ex => acts.some(ac => deepSubset(ex, ac)))
    }
    case 'tagSubset': {
      if (!actual || typeof actual !== 'object') return false
      for (const [k, val] of Object.entries(expected || {})) { if (val === '' || val == null) continue; if (String(actual[k]) !== String(val)) return false }
      return true
    }
    default: return false
  }
}

/** verification-result → { nodeOutcome:Map, checks:[{...,outcome}] } */
export function evaluateVerification(verificationResult) {
  const checks = []
  const nodeOutcome = new Map()
  for (const c of verificationResult?.checks || []) {
    let outcome
    if (c.actual === null || c.actual === undefined) outcome = 'ERROR'
    else outcome = evaluateAssertion(c.comparator, c.expected, c.actual) ? 'PASS' : (c.severity === 'warn' ? 'WARN' : 'FAIL')
    checks.push({ ...c, outcome })
    nodeOutcome.set(c.node, worst(nodeOutcome.get(c.node) ?? 'PASS', outcome))
  }
  return { nodeOutcome, checks }
}

/** @returns {import('./blueprintTypes.d.mts').RunManifest} */
export function buildProvisionalManifest({ blueprint, plan, runResult, naming }) {
  const roleByNode = new Map(blueprint.nodes.map(n => [n.id, n.naming.role]))
  const resByNode = new Map(blueprint.nodes.map(n => [n.id, n.commandRef.resource]))
  const nameByNode = id => naming?.names?.[id]?.displayName ?? id
  const nodes = (runResult?.nodes || []).map(n => ({
    nodeId: n.node,
    role: roleByNode.get(n.node) ?? '',
    resource: resByNode.get(n.node) ?? '',
    displayName: nameByNode(n.node),
    action: n.action,
    id: n.id,
  }))
  return {
    artifactType: 'run-manifest',
    status: 'PROVISIONAL',
    runId: runResult?.runId ?? '',
    blueprintId: blueprint.id,
    blueprintVersion: String(blueprint.version),
    planDigest: runResult?.planDigest ?? plan?.blueprintDigest ?? '',
    nodes,
    rollbackEligible: nodes.filter(n => n.action === 'CREATED' && n.id).map(n => n.nodeId),
  }
}

/** PROVISIONAL manifest + verification-result → FINAL manifest(노드별 verify 결과 부착) */
export function mergeVerification(manifest, verificationResult) {
  const { nodeOutcome } = evaluateVerification(verificationResult)
  const nodes = manifest.nodes.map(n => ({ ...n, verify: nodeOutcome.get(n.nodeId) }))
  return { ...manifest, status: 'FINAL', nodes }
}

export function manifestDigestInput(manifest) {
  return {
    status: manifest.status,
    runId: manifest.runId,
    blueprintId: manifest.blueprintId,
    blueprintVersion: manifest.blueprintVersion,
    planDigest: manifest.planDigest,
    nodes: manifest.nodes.map(n => ({ nodeId: n.nodeId, action: n.action, id: n.id ?? null, verify: n.verify ?? null })),
  }
}
