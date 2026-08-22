// value source 해석. 같은 정의를 두 단계로 해석한다:
//  - compare: 실제 JS 값(discovery OCID 대입) → plan 비교용
//  - render: bash 토큰(변수참조/스칼라/jq JSON) → Apply/Verify/Rollback bash 생성용
import { deriveValue, materialize } from './blueprintDerive.mjs'
import { shq } from './shellQuote.mjs'

const lastSeg = pointer => String(pointer).split('/').filter(Boolean).pop() || ''

// json value-source 안에 중첩된 value-source({source:...}) 를 찾아 치환한다(__ref 가 아니라 source 기준).
function walkValueSources(value, onSource) {
  if (Array.isArray(value)) return value.map(v => walkValueSources(v, onSource))
  if (value && typeof value === 'object') {
    if (typeof value.source === 'string') return onSource(value)
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = walkValueSources(v, onSource)
    return out
  }
  return value
}

/** nodeOutput/discovery/context/runId → 표준 bash 변수명 */
export function varNameForNode(nodeId, pointer) {
  return `${nodeId}_${lastSeg(pointer)}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
export function varNameForDiscovery(key, pointer) {
  const tail = lastSeg(pointer)
  if (key === 'oracleServicesNetworkAll') return tail === 'id' ? 'SGW_SERVICE_ID' : `SGW_SERVICE_${tail.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
  return `${key}_${tail}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}
const CONTEXT_VAR = { compartmentId: 'COMPARTMENT_ID', tenancyId: 'TENANCY_ID', region: 'OCI_REGION', profile: 'OCI_PROFILE' }

// ── 입력 강제변환 ──
function coerceInput(def, raw) {
  const v = raw ?? ''
  if (!def) return v
  if (def.type === 'boolean') return String(v).toLowerCase() === 'true'
  if (def.type === 'number') return v === '' ? undefined : Number(v)
  if (def.type === 'stringArray') {
    if (Array.isArray(v)) return v
    const s = String(v).trim()
    if (!s) return []
    if (s.startsWith('[')) { try { return JSON.parse(s) } catch { /* fallthrough */ } }
    return s.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean)
  }
  if (def.type === 'json') {
    if (v && typeof v === 'object') return v
    const s = String(v).trim()
    if (!s) return undefined
    try { return JSON.parse(s) } catch { return undefined }
  }
  return String(v)
}
const inputDef = (blueprint, id) => (blueprint.inputs || []).find(i => i.id === id)

// ── compare 단계: 실제 JS 값 ──
/**
 * @param {any} vs
 * @param {{ blueprint:any, node:any, inputs:Record<string,string>, naming:any,
 *   nodeOcid:(nodeId:string,pointer:string)=>(string|undefined),
 *   discovery:(key:string,pointer:string)=>(string|undefined), runId?:string }} ctx
 */
export function resolveCompare(vs, ctx) {
  switch (vs.source) {
    case 'literal': return vs.value
    case 'input': return coerceInput(inputDef(ctx.blueprint, vs.input), ctx.inputs[vs.input])
    case 'context': return vs.key === 'compartmentId' ? (ctx.inputs['execution.compartment'] ?? '') : (ctx.inputs['execution.' + vs.key] ?? '')
    case 'name': return ctx.naming.names[ctx.node.id]?.displayName ?? ''
    case 'derived': {
      const raw = deriveValue(vs.key, ctx)
      return materialize(raw, tok => {
        if (tok.__ref === 'runId') return ctx.runId ?? ''
        if (tok.__ref === 'node') return ctx.nodeOcid(tok.node, tok.path) ?? ''
        if (tok.__ref === 'discovery') return ctx.discovery(tok.key, tok.path) ?? ''
        return ''
      })
    }
    case 'nodeOutput': return ctx.nodeOcid(vs.node, vs.path)
    case 'discovery': return ctx.discovery(vs.key, vs.path)
    case 'json': return walkValueSources(vs.value, tok => resolveCompare(tok, ctx))
    default: throw new Error(`resolveCompare: 알 수 없는 source ${vs.source}`)
  }
}

// ── render 단계: bash 토큰 서술자 ──
// { t:'scalar', v } | { t:'var', name } | { t:'json', tree }  (tree 안의 {__var:name} 은 bash 변수)
export function resolveRender(vs, ctx) {
  switch (vs.source) {
    case 'literal': {
      const v = vs.value
      if (v === null || v === undefined) return { t: 'scalar', v: '' }
      if (typeof v === 'object') return { t: 'json', tree: v }
      return { t: 'scalar', v: String(v) }
    }
    case 'input': {
      const def = inputDef(ctx.blueprint, vs.input)
      const val = coerceInput(def, ctx.inputs[vs.input])
      if (val === undefined) return { t: 'scalar', v: '' }
      if (Array.isArray(val) || (val && typeof val === 'object')) return { t: 'json', tree: val }
      return { t: 'scalar', v: String(val) }
    }
    case 'context': return { t: 'var', name: CONTEXT_VAR[vs.key] || vs.key.toUpperCase() }
    case 'name': return { t: 'scalar', v: ctx.naming.names[ctx.node.id]?.displayName ?? '' }
    case 'derived': {
      const raw = deriveValue(vs.key, ctx)
      const tree = materialize(raw, tok => {
        if (tok.__ref === 'runId') return { __var: 'RUN_ID' }
        if (tok.__ref === 'node') return { __var: varNameForNode(tok.node, tok.path) }
        if (tok.__ref === 'discovery') return { __var: varNameForDiscovery(tok.key, tok.path) }
        return ''
      })
      if (Array.isArray(tree) || (tree && typeof tree === 'object')) return { t: 'json', tree }
      return { t: 'scalar', v: String(tree) }
    }
    case 'nodeOutput': return { t: 'var', name: varNameForNode(vs.node, vs.path) }
    case 'discovery': return { t: 'var', name: varNameForDiscovery(vs.key, vs.path) }
    case 'json': {
      const tree = walkValueSources(vs.value, tok => {
        const r = resolveRender(tok, ctx)
        if (r.t === 'var') return { __var: r.name }
        if (r.t === 'json') return r.tree
        return r.v
      })
      return { t: 'json', tree }
    }
    default: throw new Error(`resolveRender: 알 수 없는 source ${vs.source}`)
  }
}

// ── jq 표현식 빌더: {__var:name} 은 --arg 로, 나머지는 리터럴 ──
export function buildJqExpr(tree) {
  const args = []
  const seen = new Map()
  const argFor = name => {
    if (seen.has(name)) return seen.get(name)
    const jq = `a${args.length}`
    args.push({ jq, bash: name })
    seen.set(name, jq)
    return jq
  }
  const walk = node => {
    if (Array.isArray(node)) return '[' + node.map(walk).join(',') + ']'
    if (node && typeof node === 'object') {
      if (node.__var) return '$' + argFor(node.__var)
      return '{' + Object.entries(node).map(([k, v]) => `${JSON.stringify(k)}:${walk(v)}`).join(',') + '}'
    }
    return JSON.stringify(node)
  }
  const expr = walk(tree)
  return { expr, args }
}

const hasVar = tree => JSON.stringify(tree).includes('"__var"')

/** render 서술자 → `--opt ...` shell 토큰 + (필요시) 사전 대입줄. @returns {{pre:string[], arg:string}} */
export function emitOption(optionName, rv, varPrefix) {
  if (rv.t === 'scalar') {
    if (rv.v === '') return { pre: [], arg: '' }
    return { pre: [], arg: `${optionName} ${shq(rv.v)}` }
  }
  if (rv.t === 'var') return { pre: [], arg: `${optionName} "$${rv.name}"` }
  // json
  if (!hasVar(rv.tree)) return { pre: [], arg: `${optionName} ${shq(JSON.stringify(rv.tree))}` }
  const jsonVar = `${varPrefix}_${optionName.replace(/^--/, '').replace(/[^A-Za-z0-9]+/g, '_')}`.toUpperCase()
  const { expr, args } = buildJqExpr(rv.tree)
  const argStr = args.map(a => `--arg ${a.jq} "$${a.bash}"`).join(' ')
  return { pre: [`${jsonVar}=$(jq -nc ${argStr} ${shq(expr)})`], arg: `${optionName} "$${jsonVar}"` }
}
