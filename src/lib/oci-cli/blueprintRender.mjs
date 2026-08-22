// Blueprint → Bash 렌더러. 블로그는 OCI 를 직접 실행하지 않는다: 여기서 만든 텍스트를
// 사용자가 검토 후 붙여넣어 실행하고, 스크립트가 마지막에 출력하는 JSON 을 다시 Import 한다.
//  - Discover : read-only. 기존 자원 조회 → discovery-result JSON
//  - Apply    : plan.executable 일 때만. CREATE 생성 / REUSE 는 get 으로 출력 확보 → run-result JSON
//  - Verify   : manifest 기준 get + 단언(원시값 덤프, 판정은 브라우저) → verification-result JSON
//  - Rollback : reverseDag, CREATED 만, 소유권 태그 일치 시 삭제. 이중 확인 필수
//  - Resume   : 이전 run-result 의 성공 노드를 건너뛴 Apply
import { topoOrder, reverseOrder } from './blueprintGraph.mjs'
import { resolveRender, emitOption, resolveCompare, varNameForNode } from './blueprintResolve.mjs'
import { shq } from './shellQuote.mjs'

const jqPath = pointer => `[${String(pointer).split('/').filter(Boolean).map(p => JSON.stringify(p)).join(',')}]`
const nodeVar = nodeId => nodeId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
const cmdOf = (catalog, resource, op) => catalog.commands?.[resource]?.operations?.[op]?.cmd
const opOptions = (catalog, resource, op) => {
  const o = catalog.commands?.[resource]?.operations?.[op]
  if (!o) return []
  return [...(o.sections || []).flatMap(s => s.options || []), ...(o.advanced || [])]
}
const idOptionOf = (catalog, resource, op) => {
  const opts = opOptions(catalog, resource, op)
  return (opts.find(o => o.required && /-id$/.test(o.name)) || opts.find(o => /-id$/.test(o.name)) || opts[0])?.name
}
const COMMON = '--profile "$OCI_PROFILE" --region "$OCI_REGION" --output json'

function preamble(title, lines = []) {
  return [
    '#!/usr/bin/env bash',
    `# ${title}`,
    '# 위즈베이스 OCI CLI Blueprint Engine 생성 — 실행 전 반드시 검토하세요.',
    'set -euo pipefail',
    'command -v oci >/dev/null 2>&1 || { echo "oci CLI 가 필요합니다" >&2; exit 1; }',
    'command -v jq  >/dev/null 2>&1 || { echo "jq 가 필요합니다" >&2; exit 1; }',
    'OCI_PROFILE="${OCI_PROFILE:-DEFAULT}"',
    ...lines,
  ]
}
function baseVars(inputs) {
  return [
    `OCI_REGION=${shq(inputs['execution.region'] || '')}`,
    `COMPARTMENT_ID=${shq(inputs['execution.compartment'] || '')}`,
    ': "${OCI_REGION:?execution.region 필요}"',
    ': "${COMPARTMENT_ID:?execution.compartment 필요}"',
  ]
}

// service gateway 지원 명령 — 서비스 목록에서 "All …Services In Oracle Services Network" 선택
function serviceListBlock() {
  return [
    '# OCI 서비스 목록(Service Gateway 용) — 변수명은 varNameForDiscovery 규칙과 일치',
    `SGW_SERVICE_JSON=$(oci network service list --all ${COMMON})`,
    `SGW_SERVICE_ID=$(echo "$SGW_SERVICE_JSON" | jq -r '[.data[] | select(.name | test("All .*Services In Oracle Services Network"; "i"))][0].id // .data[0].id')`,
    `SGW_SERVICE_CIDR_BLOCK=$(echo "$SGW_SERVICE_JSON" | jq -r '[.data[] | select(.name | test("All .*Services In Oracle Services Network"; "i"))][0]."cidr-block" // .data[0]."cidr-block"')`,
  ]
}
const needsService = blueprint => blueprint.nodes.some(n =>
  JSON.stringify(n.bindings).includes('oracleServicesNetworkAll') || JSON.stringify(n.comparison || {}).includes('oracleServicesNetworkAll'))

// 선언된 각 output 을 표준 변수(varNameForNode)로 담는다. 다운스트림 nodeOutput 참조와 정확히 일치.
function captureOutputs(node, jsonVar, out) {
  for (const [, def] of Object.entries(node.outputs || {})) {
    const std = varNameForNode(node.id, def.pointer)
    out.push(`${std}=$(echo "$${jsonVar}" | jq -r 'getpath(${jqPath(def.pointer)}) // ""')`)
  }
}

function renderCreateNode(node, ctx, catalog, out) {
  const V = nodeVar(node.id)
  out.push(`# [CREATE] ${node.label} (${node.id})`)
  const args = []
  for (const [opt, vs] of Object.entries(node.bindings)) {
    const { pre, arg } = emitOption(opt, resolveRender(vs, { ...ctx, node }), V)
    out.push(...pre)
    if (arg) args.push(arg)
  }
  const cmd = cmdOf(catalog, node.commandRef.resource, 'create')
  out.push(`${V}_JSON=$(${cmd} ${COMMON} \\`)
  out.push(args.map(a => `  ${a}`).join(' \\\n') + ')')
  captureOutputs(node, `${V}_JSON`, out)
  out.push(`echo "  → ${node.id} 생성: $${varNameForNode(node.id, '/data/id')}"`)
}

function renderReuseNode(node, catalog, existingId, out) {
  const V = nodeVar(node.id)
  const getCmd = cmdOf(catalog, node.commandRef.resource, 'get')
  const idOpt = idOptionOf(catalog, node.commandRef.resource, 'get')
  out.push(`# [REUSE] ${node.label} (${node.id}) — 기존 자원 get 으로 출력 확보(삭제 대상 아님)`)
  out.push(`${V}_JSON=$(${getCmd} ${idOpt} ${shq(existingId)} ${COMMON})`)
  captureOutputs(node, `${V}_JSON`, out)
}

function renderApplyLike({ blueprint, catalog, inputs, naming, plan, planDigest, priorRunResult }) {
  const title = priorRunResult ? `Resume: ${blueprint.label}` : `Apply: ${blueprint.label}`
  const done = new Set()
  if (priorRunResult) for (const n of priorRunResult.nodes || []) if (n.action === 'CREATED' || n.action === 'REUSED') done.add(n.node)
  const out = preamble(title, baseVars(inputs))
  out.push(`RUN_ID="\${RUN_ID:-run-$(date -u +%Y%m%d%H%M%S)-$$}"`)
  out.push(`PLAN_DIGEST=${shq(planDigest || '')}`)
  out.push('echo "run-id: $RUN_ID"')
  if (needsService(blueprint)) out.push('', ...serviceListBlock())
  const ctx = { blueprint, inputs, naming }
  const planByNode = new Map(plan.nodes.map(n => [n.nodeId, n]))
  const frags = ['', 'RESULT_NODES=()']
  for (const nodeId of topoOrder(blueprint.nodes)) {
    const node = blueprint.nodes.find(n => n.id === nodeId)
    const pnode = planByNode.get(nodeId)
    out.push('')
    if (done.has(nodeId)) {
      const prev = priorRunResult.nodes.find(n => n.node === nodeId)
      if (prev.action === 'REUSED') renderReuseNode(node, catalog, prev.id || '', out)
      else {
        out.push(`# [SKIP-DONE] ${node.label} — 이전 run 에서 생성됨, get 으로 출력 확보`)
        renderReuseNode(node, catalog, prev.id || '', out)
      }
      frags.push(`RESULT_NODES+=("$(jq -nc --arg id "$${varNameForNode(nodeId, '/data/id')}" '{node:"${nodeId}",action:"${prev.action}",id:$id}')")`)
      continue
    }
    if (pnode?.state === 'REUSE') {
      renderReuseNode(node, catalog, pnode.existingId || '', out)
      frags.push(`RESULT_NODES+=("$(jq -nc --arg id "$${varNameForNode(nodeId, '/data/id')}" '{node:"${nodeId}",action:"REUSED",id:$id}')")`)
      continue
    }
    renderCreateNode(node, ctx, catalog, out)
    frags.push(`RESULT_NODES+=("$(jq -nc --arg id "$${varNameForNode(nodeId, '/data/id')}" '{node:"${nodeId}",action:"CREATED",id:$id}')")`)
  }
  out.push('', '# ── run-result (아래 JSON 을 블로그에 Import) ──', ...frags)
  out.push(`printf '%s\\n' "\${RESULT_NODES[@]}" | jq -s --arg rid "$RUN_ID" --arg pd "$PLAN_DIGEST" '{artifactType:"run-result",runId:$rid,planDigest:$pd,nodes:.}'`)
  return { name: priorRunResult ? 'resume.sh' : 'apply.sh', title, content: out.join('\n') + '\n' }
}

export const renderApply = args => renderApplyLike(args)
export const renderResume = args => renderApplyLike(args)

// ── Discover (read-only) ──
export function renderDiscover({ blueprint, catalog, inputs, naming }) {
  const out = preamble(`Discover: ${blueprint.label}`, baseVars(inputs))
  if (needsService(blueprint)) out.push('', ...serviceListBlock())
  out.push('', 'DISC_NODES=()')
  const ctx = { blueprint, inputs, naming }
  for (const nodeId of topoOrder(blueprint.nodes)) {
    const node = blueprint.nodes.find(n => n.id === nodeId)
    if (!node.discovery) continue
    const V = nodeVar(nodeId)
    const disc = node.discovery
    const listCmd = cmdOf(catalog, disc.list.commandRef.resource, disc.list.commandRef.operation)
    out.push('', `# discover ${node.label} (${nodeId})`)
    const listArgs = []
    let parentGuard = null
    for (const [opt, vs] of Object.entries(disc.list.bindings)) {
      if (vs.source === 'context' && vs.key === 'compartmentId') listArgs.push(`${opt} "$COMPARTMENT_ID"`)
      else if (vs.source === 'nodeOutput') {
        const pv = `DISC_${nodeVar(vs.node)}_ID`
        listArgs.push(`${opt} "$${pv}"`)
        parentGuard = pv
      }
    }
    const expected = resolveCompare(disc.identity.expectedName, { ...ctx, node, nodeOcid: () => undefined, discovery: () => undefined })
    const nameKey = disc.identity.namePointer.split('/').filter(Boolean).pop()
    const listLine = `${listCmd} --all ${COMMON} ${listArgs.join(' ')}`
    if (parentGuard) out.push(`if [ -z "\${${parentGuard}:-}" ]; then`, `  DISC_NODES+=("$(jq -nc '{node:"${nodeId}",status:"OK",found:null}')")`, 'else')
    const ind = parentGuard ? '  ' : ''
    out.push(`${ind}${V}_LIST=$(${listLine} || echo '{"data":[]}')`)
    out.push(`${ind}${V}_MATCH=$(echo "$${V}_LIST" | jq -c --arg n ${shq(String(expected))} '[.data[] | select(.["${nameKey}"]==$n)]')`)
    out.push(`${ind}${V}_CNT=$(echo "$${V}_MATCH" | jq 'length')`)
    out.push(`${ind}if [ "$${V}_CNT" = "1" ]; then`)
    out.push(`${ind}  DISC_${V}_ID=$(echo "$${V}_MATCH" | jq -r '.[0].id')`)
    if (disc.get) {
      const getCmd = cmdOf(catalog, disc.get.commandRef.resource, disc.get.commandRef.operation)
      out.push(`${ind}  ${V}_GET=$(${getCmd} ${disc.get.idOption} "$DISC_${V}_ID" ${COMMON})`)
      const collectPairs = Object.values(disc.get.collect).map(c => c.pointer)
      out.push(`${ind}  ${V}_COL=$(echo "$${V}_GET" | jq -c '{${collectPairs.map(p => `${JSON.stringify(p)}: getpath(${jqPath(p)})`).join(', ')}}')`)
      out.push(`${ind}  DISC_NODES+=("$(jq -nc --arg id "$DISC_${V}_ID" --arg n ${shq(String(expected))} --argjson col "$${V}_COL" '{node:"${nodeId}",status:"OK",found:{id:$id,name:$n,collected:$col}}')")`)
    } else {
      out.push(`${ind}  DISC_NODES+=("$(jq -nc --arg id "$DISC_${V}_ID" --arg n ${shq(String(expected))} '{node:"${nodeId}",status:"OK",found:{id:$id,name:$n}}')")`)
    }
    out.push(`${ind}elif [ "$${V}_CNT" = "0" ]; then`)
    out.push(`${ind}  DISC_NODES+=("$(jq -nc '{node:"${nodeId}",status:"OK",found:null}')")`)
    out.push(`${ind}else`)
    out.push(`${ind}  DISC_NODES+=("$(echo "$${V}_MATCH" | jq -c '{node:"${nodeId}",status:"OK",candidates:[.[]|{id:.id,name:.["${nameKey}"]}]}')")`)
    out.push(`${ind}fi`)
    if (parentGuard) out.push('fi')
  }
  out.push('', '# ── discovery-result (아래 JSON 을 블로그에 Import) ──')
  const svc = needsService(blueprint)
    ? `--argjson services "$(jq -nc --arg id "$SGW_SERVICE_ID" --arg cidr "$SGW_SERVICE_CIDR_BLOCK" '[{key:"oracleServicesNetworkAll",items:[{id:$id,name:"all-services","cidr-block":$cidr}]}]')"`
    : '--argjson services "[]"'
  out.push(`printf '%s\\n' "\${DISC_NODES[@]}" | jq -s ${svc} '{artifactType:"discovery-result",services:$services,nodes:.}'`)
  return { name: 'discover.sh', title: `Discover: ${blueprint.label}`, content: out.join('\n') + '\n' }
}

// ── Verify ── (원시값만 덤프, 판정은 blueprintManifest.evaluateVerification)
export function renderVerify({ blueprint, catalog, inputs, naming, manifest }) {
  const out = preamble(`Verify: ${blueprint.label}`, baseVars(inputs))
  const idByNode = new Map((manifest?.nodes || []).map(n => [n.nodeId, n.id]))
  out.push('', 'VERIFY_CHECKS=()')
  const ctx = { blueprint, inputs, naming, nodeOcid: (n) => idByNode.get(n), discovery: () => undefined }
  for (const nodeId of topoOrder(blueprint.nodes)) {
    const node = blueprint.nodes.find(n => n.id === nodeId)
    if (!node.verify?.length) continue
    const id = idByNode.get(nodeId)
    if (!id) continue
    const V = nodeVar(nodeId)
    out.push('', `# verify ${node.label} (${nodeId})`)
    for (const [vi, vc] of node.verify.entries()) {
      const getCmd = cmdOf(catalog, vc.commandRef.resource, vc.commandRef.operation)
      const idOpt = idOptionOf(catalog, vc.commandRef.resource, vc.commandRef.operation)
      out.push(`${V}_V${vi}=$(${getCmd} ${idOpt} ${shq(id)} ${COMMON} || echo '{}')`)
      for (const a of vc.assertions) {
        const expected = resolveCompare(a.expected, { ...ctx, node })
        const av = `${V}_A_${a.id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`
        out.push(`${av}=$(echo "$${V}_V${vi}" | jq -c 'getpath(${jqPath(a.actualPointer)})')`)
        out.push(`VERIFY_CHECKS+=("$(jq -nc --argjson actual "$${av}" --arg exp ${shq(JSON.stringify(expected))} '{node:"${nodeId}",id:"${a.id}",comparator:"${a.comparator}",severity:"${a.severity}",actual:$actual,expected:($exp|fromjson? // $exp)}')")`)
      }
    }
  }
  out.push('', '# ── verification-result (아래 JSON 을 블로그에 Import) ──')
  out.push(`printf '%s\\n' "\${VERIFY_CHECKS[@]}" | jq -s --arg rid ${shq(manifest?.runId || '')} '{artifactType:"verification-result",runId:$rid,checks:.}'`)
  return { name: 'verify.sh', title: `Verify: ${blueprint.label}`, content: out.join('\n') + '\n' }
}

// ── Rollback ──
export function renderRollback({ blueprint, catalog, inputs, naming, manifest }) {
  void naming
  const runId = manifest?.runId || ''
  const compartment = inputs['execution.compartment'] || ''
  const out = preamble(`Rollback: ${blueprint.label}`, [
    `OCI_REGION=${shq(inputs['execution.region'] || '')}`,
    ': "${OCI_REGION:?execution.region 필요}"',
    '# 이중 확인: 실수 방지를 위해 두 값을 환경변수로 명시해야 실행됩니다.',
    ': "${CONFIRM_RUN_ID:?롤백하려면 CONFIRM_RUN_ID 를 설정하세요}"',
    ': "${CONFIRM_COMPARTMENT_ID:?롤백하려면 CONFIRM_COMPARTMENT_ID 를 설정하세요}"',
    `[ "$CONFIRM_RUN_ID" = ${shq(runId)} ] || { echo "run-id 불일치 — 중단" >&2; exit 1; }`,
    `[ "$CONFIRM_COMPARTMENT_ID" = ${shq(compartment)} ] || { echo "compartment 불일치 — 중단" >&2; exit 1; }`,
  ])
  out.push(`RUN_ID=${shq(runId)}`)
  const actionByNode = new Map((manifest?.nodes || []).map(n => [n.nodeId, n]))
  for (const nodeId of reverseOrder(blueprint.nodes)) {
    const node = blueprint.nodes.find(n => n.id === nodeId)
    const mnode = actionByNode.get(nodeId)
    if (!mnode || mnode.action !== 'CREATED' || !mnode.id) {
      out.push('', `# [SKIP] ${node.label} — ${mnode?.action ?? '기록 없음'} (재사용 자원은 삭제하지 않음)`)
      continue
    }
    const rb = node.rollback
    const V = nodeVar(nodeId)
    const getCmd = cmdOf(catalog, rb.commandRef.resource, 'get')
    const getIdOpt = idOptionOf(catalog, rb.commandRef.resource, 'get')
    const delCmd = cmdOf(catalog, rb.commandRef.resource, 'delete')
    out.push('', `# [DELETE] ${node.label} (${nodeId}) — 소유권 태그 확인 후`)
    out.push(`${V}_TAG=$(${getCmd} ${getIdOpt} ${shq(mnode.id)} ${COMMON} | jq -r 'getpath(["data","freeform-tags","${rb.ownership.runIdTagKey}"]) // ""')`)
    out.push(`if [ "$${V}_TAG" = "$RUN_ID" ]; then`)
    out.push(`  ${delCmd} ${rb.idOption} ${shq(mnode.id)} --force ${rb.waitForState ? `--wait-for-state ${rb.waitForState} ` : ''}${COMMON}`)
    out.push(`  echo "  삭제됨: ${nodeId} ${mnode.id}"`)
    out.push('else')
    out.push(`  echo "  건너뜀(소유권 태그 불일치): ${nodeId} ${mnode.id}" >&2`)
    out.push('fi')
  }
  out.push('', 'echo "rollback 완료"')
  return { name: 'rollback.sh', title: `Rollback: ${blueprint.label}`, content: out.join('\n') + '\n' }
}
