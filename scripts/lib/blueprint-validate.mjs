// blueprint 정의 검증 코어 — generate-cli-blueprints.mjs(정본 파일) 와
// verify-oci-cli-blueprints.mjs(negative fixture) 가 공유한다. 파일 IO 없음: 이미 파싱된
// catalog/registry/blueprints/namingPolicies 객체를 받아 {errors, results} 를 돌려준다.
import { createHash } from 'node:crypto'
import { canonicalize } from '../../src/lib/oci-cli/jsonCanonical.mjs'

export const DERIVED_KEYS = new Set([
  'normalizedCustomer', 'normalizedWorkload', 'normalizedEnvironment', 'regionAlias',
  'vcnDnsLabel', 'publicSubnetDnsLabel', 'privateSubnetDnsLabel', 'managedFreeformTags',
  'publicRouteRules', 'privateRouteRules',
  'publicIngressRules', 'publicEgressRules', 'privateIngressRules', 'privateEgressRules',
])
export const CONTEXT_KEYS = new Set(['profile', 'region', 'compartmentId', 'tenancyId'])
export const DISCOVERY_KEYS = { oracleServicesNetworkAll: 'network-service-list' }

const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex')

function walkJsonRefs(value, cb) {
  if (Array.isArray(value)) { value.forEach(v => walkJsonRefs(v, cb)); return }
  if (value && typeof value === 'object') {
    if (typeof value.source === 'string') { cb(value); return }
    for (const v of Object.values(value)) walkJsonRefs(v, cb)
  }
}

// { catalog, registry, blueprints:[{entry, def}], namingPolicies:[{entry, def}] } → { errors, results }
export function validateBlueprints({ catalog, registry, blueprints, namingPolicies }) {
  const errors = []
  const err = m => errors.push(m)

  const opOptions = (resource, op) => {
    const o = catalog.commands?.[resource]?.operations?.[op]
    if (!o) return null
    const out = []
    for (const s of o.sections || []) out.push(...(s.options || []))
    out.push(...(o.advanced || []))
    return out
  }
  const optionMap = (resource, op) => {
    const list = opOptions(resource, op)
    return list && new Map(list.map(o => [o.name, o]))
  }
  const validResourceOp = (resource, op) => !!catalog.commands?.[resource]?.operations?.[op]
  const singlePointers = resource => registry.commands?.[resource]?.single || {}
  const listItemPointers = resource => registry.commands?.[resource]?.listItem || {}
  const listItemsPointer = resource => registry.commands?.[resource]?.listItems

  const policyResults = []
  for (const { entry, def } of namingPolicies) {
    if (!def) { err(`naming policy 파일 없음: ${entry.file}`); continue }
    if (def.id !== entry.id || def.version !== entry.version) err(`naming policy id/version 불일치: ${entry.file}`)
    policyResults.push({ ...def, digest: sha256(canonicalize(def)) })
  }
  const policyIds = new Set(policyResults.map(p => p.id))

  const bpResults = []
  for (const { entry, def: bp } of blueprints) {
    if (!bp) { err(`blueprint 파일 없음: ${entry.file}`); continue }
    const ctx = `[${bp.id}/${bp.version}]`
    if (bp.id !== entry.id || bp.version !== entry.version) err(`${ctx} catalog 과 id/version 불일치`)
    if (!policyIds.has(bp.namingPolicyId)) err(`${ctx} 알 수 없는 namingPolicyId: ${bp.namingPolicyId}`)

    const inputIds = new Set((bp.inputs || []).map(i => i.id))
    const nodeIds = (bp.nodes || []).map(n => n.id)
    const nodeSet = new Set()
    for (const id of nodeIds) { if (nodeSet.has(id)) err(`${ctx} 중복 node id: ${id}`); nodeSet.add(id) }
    const outIds = new Set()
    for (const o of bp.outputs || []) { if (outIds.has(o.id)) err(`${ctx} 중복 output id: ${o.id}`); outIds.add(o.id) }
    const inSeen = new Set()
    for (const i of bp.inputs || []) { if (inSeen.has(i.id)) err(`${ctx} 중복 input id: ${i.id}`); inSeen.add(i.id) }

    const deps = new Map((bp.nodes || []).map(n => [n.id, n.dependsOn || []]))
    for (const [id, ds] of deps) for (const d of ds) if (!nodeSet.has(d)) err(`${ctx} node ${id} 의 dependsOn 대상 없음: ${d}`)
    const state = new Map()
    const visit = (id, stack) => {
      if (state.get(id) === 'done') return
      if (state.get(id) === 'active') { err(`${ctx} 의존성 cycle: ${[...stack, id].join(' -> ')}`); return }
      state.set(id, 'active')
      for (const d of deps.get(id) || []) if (nodeSet.has(d)) visit(d, [...stack, id])
      state.set(id, 'done')
    }
    for (const id of nodeIds) visit(id, [])
    const ancestors = id => {
      const seen = new Set(); const stk = [...(deps.get(id) || [])]
      while (stk.length) { const x = stk.pop(); if (seen.has(x)) continue; seen.add(x); for (const d of deps.get(x) || []) stk.push(d) }
      return seen
    }
    const nodeById = new Map((bp.nodes || []).map(n => [n.id, n]))
    const outputPointerSet = n => new Set(Object.values(n.outputs || {}).map(o => o.pointer))

    const checkValueSource = (vs, node, where) => {
      if (!vs || typeof vs !== 'object') { err(`${ctx} ${where}: value source 형식 오류`); return }
      switch (vs.source) {
        case 'literal': return
        case 'input': if (!inputIds.has(vs.input)) err(`${ctx} ${where}: 알 수 없는 input '${vs.input}'`); return
        case 'derived': if (!DERIVED_KEYS.has(vs.key)) err(`${ctx} ${where}: 알 수 없는 derived key '${vs.key}'`); return
        case 'context': if (!CONTEXT_KEYS.has(vs.key)) err(`${ctx} ${where}: 알 수 없는 context key '${vs.key}'`); return
        case 'name': if (!node?.naming) err(`${ctx} ${where}: 'name' source 는 naming 있는 node 에서만`); return
        case 'nodeOutput': {
          if (!nodeSet.has(vs.node)) { err(`${ctx} ${where}: 알 수 없는 nodeOutput node '${vs.node}'`); return }
          if (node && !ancestors(node.id).has(vs.node)) err(`${ctx} ${where}: nodeOutput '${vs.node}' 가 의존성 선행이 아님`)
          const tgt = nodeById.get(vs.node)
          if (tgt && !outputPointerSet(tgt).has(vs.path)) err(`${ctx} ${where}: nodeOutput '${vs.node}' 에 선언되지 않은 output pointer '${vs.path}'`)
          return
        }
        case 'discovery': {
          const cmd = DISCOVERY_KEYS[vs.key]
          if (!cmd) { err(`${ctx} ${where}: 알 수 없는 discovery key '${vs.key}'`); return }
          const item = registry.supportCommands?.[cmd]?.listItem || {}
          if (!(vs.path in item)) err(`${ctx} ${where}: discovery '${vs.key}' 에 없는 pointer '${vs.path}'`)
          return
        }
        case 'json': walkJsonRefs(vs.value, ref => checkValueSource(ref, node, `${where}(json ref)`)); return
        default: err(`${ctx} ${where}: 알 수 없는 source '${vs.source}'`)
      }
    }

    for (const node of bp.nodes || []) {
      const nc = `${ctx} node ${node.id}`
      const resource = node.commandRef?.resource
      if (!validResourceOp(resource, 'create')) { err(`${nc}: create 미지원 resource '${resource}'`); continue }
      const createOpts = optionMap(resource, 'create')
      for (const [opt, vs] of Object.entries(node.bindings || {})) {
        const meta = createOpts.get(opt)
        if (!meta) { err(`${nc}: create 에 없는 옵션 binding '${opt}'`); continue }
        if (meta.deprecated) err(`${nc}: deprecated 옵션 binding '${opt}'`)
        checkValueSource(vs, node, `binding ${opt}`)
      }
      for (const [name, meta] of createOpts) if (meta.required && !(name in (node.bindings || {}))) err(`${nc}: 필수 옵션 미바인딩 '${name}'`)
      const single = singlePointers(resource)
      for (const [k, o] of Object.entries(node.outputs || {})) if (!(o.pointer in single)) err(`${nc}: output '${k}' pointer 레지스트리에 없음 '${o.pointer}'`)
      const d = node.discovery
      if (d) {
        const lr = d.list.commandRef
        if (lr.kind !== 'resourceOperation' || !validResourceOp(lr.resource, lr.operation)) err(`${nc}: discovery.list commandRef 무효`)
        else {
          const lopts = optionMap(lr.resource, lr.operation)
          for (const [opt, vs] of Object.entries(d.list.bindings || {})) { if (!lopts.get(opt)) err(`${nc}: discovery.list 에 없는 옵션 '${opt}'`); else checkValueSource(vs, node, `discovery.list ${opt}`) }
          if (d.list.itemsPointer !== listItemsPointer(lr.resource)) err(`${nc}: discovery.list itemsPointer '${d.list.itemsPointer}' != 레지스트리`)
        }
        const li = listItemPointers(resource)
        if (!(d.identity.idPointer in li)) err(`${nc}: identity.idPointer 레지스트리에 없음 '${d.identity.idPointer}'`)
        if (!(d.identity.namePointer in li)) err(`${nc}: identity.namePointer 레지스트리에 없음 '${d.identity.namePointer}'`)
        checkValueSource(d.identity.expectedName, node, 'identity.expectedName')
        if (d.get) {
          const gr = d.get.commandRef
          if (gr.kind !== 'resourceOperation' || !validResourceOp(gr.resource, gr.operation)) err(`${nc}: discovery.get commandRef 무효`)
          else if (!optionMap(gr.resource, gr.operation).get(d.get.idOption)) err(`${nc}: discovery.get idOption 무효 '${d.get.idOption}'`)
          for (const [k, c] of Object.entries(d.get.collect || {})) if (!(c.pointer in single)) err(`${nc}: discovery.get.collect '${k}' pointer 레지스트리에 없음 '${c.pointer}'`)
        }
      }
      for (const f of node.comparison?.fields || []) {
        if (!(f.actualPointer in single)) err(`${nc}: comparison '${f.key}' actualPointer 레지스트리에 없음 '${f.actualPointer}'`)
        checkValueSource(f.desired, node, `comparison ${f.key}`)
      }
      for (const v of node.verify || []) {
        const vr = v.commandRef
        if (vr.kind !== 'resourceOperation' || !validResourceOp(vr.resource, vr.operation)) err(`${nc}: verify commandRef 무효`)
        for (const [opt, vs] of Object.entries(v.bindings || {})) { if (!optionMap(vr.resource, vr.operation)?.get(opt)) err(`${nc}: verify 에 없는 옵션 '${opt}'`); else checkValueSource(vs, node, `verify ${opt}`) }
        for (const a of v.assertions || []) {
          if (!(a.actualPointer in single)) err(`${nc}: verify assertion '${a.id}' actualPointer 레지스트리에 없음 '${a.actualPointer}'`)
          checkValueSource(a.expected, node, `verify.${a.id}.expected`)
        }
      }
      const rb = node.rollback
      if (rb) {
        if (rb.commandRef.operation !== 'delete' || !validResourceOp(rb.commandRef.resource, 'delete')) err(`${nc}: rollback commandRef 무효`)
        else if (!optionMap(rb.commandRef.resource, 'delete').get(rb.idOption)) err(`${nc}: rollback idOption 무효 '${rb.idOption}'`)
      }
    }

    bpResults.push({ ...bp, digest: sha256(canonicalize(bp)) })
  }

  return { errors, results: { blueprints: bpResults, namingPolicies: policyResults } }
}
