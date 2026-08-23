// Blueprint → Bash 렌더러. 블로그는 OCI 를 직접 실행하지 않는다: 여기서 만든 텍스트를
// 사용자가 검토 후 붙여넣어 실행하고, 스크립트가 stdout 에 출력하는 JSON 을 다시 Import 한다.
// (진행 로그는 전부 stderr 로 보내 stdout 은 순수 JSON 만 남긴다.)
//  - Discover : read-only. list 실패는 DISCOVERY_ERROR 로 구분(빈 결과로 위장 금지) → discovery-result
//  - Apply    : plan.executable 일 때만. 실패해도 EXIT trap 이 부분 run-result 를 flush → resume 가능
//  - Verify   : manifest 기준 get + 단언(원시값 덤프, 판정은 브라우저) → verification-result
//  - Rollback : reverseDag, CREATED 만, run-id 태그 AND compartment 일치 시 삭제. 이중 확인 + 멱등
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
const hasOption = (catalog, resource, op, name) => opOptions(catalog, resource, op).some(o => o.name === name)
const idOptionOf = (catalog, resource, op) => {
  const opts = opOptions(catalog, resource, op)
  return (opts.find(o => o.required && /-id$/.test(o.name)) || opts.find(o => /-id$/.test(o.name)) || opts[0])?.name
}
const COMMON = '--profile "$OCI_PROFILE" --region "$OCI_REGION" --output json'
// 붙여넣은 JSON 에서 온 OCID 는 명령에는 shq 로 안전하지만, 방어적으로 형식을 검증한다.
const isOcid = s => typeof s === 'string' && /^ocid1\.[a-z0-9._-]+$/i.test(s)
const safeId = s => isOcid(s) ? s : '' // 형식 위반은 빈 문자열 → 다운스트림 가드가 걸러냄

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
  const profile = inputs['execution.profile'] || 'DEFAULT'
  const mode = String(inputs['execution.compartmentMode'] || 'OCID').toUpperCase()
  return [
    `OCI_PROFILE=${shq(profile)}`,
    `OCI_REGION=${shq(inputs['execution.region'] || '')}`,
    `COMPARTMENT_MODE=${shq(mode)}`,
    `COMPARTMENT_INPUT=${shq(inputs['execution.compartment'] || '')}`,
    ': "${OCI_REGION:?execution.region 필요}"',
    ': "${COMPARTMENT_INPUT:?execution.compartment 필요}"',
    'if [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* || "$COMPARTMENT_INPUT" == ocid1.tenancy.* ]]; then',
    '  COMPARTMENT_ID="$COMPARTMENT_INPUT"',
    'elif [[ "$COMPARTMENT_MODE" == "NAME" ]]; then',
    `  TENANCY_ID=$(oci iam availability-domain list --query 'data[0]."compartment-id"' --raw-output --profile "$OCI_PROFILE" --region "$OCI_REGION")`,
    '  [[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "프로필에서 tenancy OCID를 확인하지 못했습니다" >&2; exit 2; }',
    '  if [[ "${COMPARTMENT_INPUT^^}" == "ROOT" ]]; then',
    '    COMPARTMENT_ID="$TENANCY_ID"',
    '  else',
    '    COMPARTMENT_JSON=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --profile "$OCI_PROFILE" --region "$OCI_REGION" --output json)',
    `    COMPARTMENT_COUNT=$(echo "$COMPARTMENT_JSON" | jq -r --arg name "$COMPARTMENT_INPUT" '[.data[]? | select(.name == $name)] | length')`,
    '    [ "$COMPARTMENT_COUNT" = "1" ] || { echo "ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2; exit 2; }',
    `    COMPARTMENT_ID=$(echo "$COMPARTMENT_JSON" | jq -r --arg name "$COMPARTMENT_INPUT" '[.data[]? | select(.name == $name)][0].id // empty')`,
    '  fi',
    'else',
    '  echo "Compartment 입력 방식이 OCID입니다. 이름이 아닌 compartment OCID를 입력하세요: $COMPARTMENT_INPUT" >&2',
    '  exit 2',
    'fi',
    '[[ "$COMPARTMENT_ID" == ocid1.compartment.* || "$COMPARTMENT_ID" == ocid1.tenancy.* ]] || { echo "compartment OCID 변환 실패" >&2; exit 2; }',
  ]
}

// service gateway 지원 명령. strict 면 "All …Services" 미발견 시 즉시 실패(Apply). 변수명은 varNameForDiscovery 규칙과 일치.
function serviceListBlock(strict) {
  const sel = '[.data[] | select(.name | test("All .*Services In Oracle Services Network"; "i"))][0]'
  const out = [
    '# OCI 서비스 목록(Service Gateway 용)',
    `SGW_SERVICE_JSON=$(oci network service list --all ${COMMON})`,
    `SGW_SERVICE_ID=$(echo "$SGW_SERVICE_JSON" | jq -r '${sel}.id // empty')`,
    `SGW_SERVICE_CIDR_BLOCK=$(echo "$SGW_SERVICE_JSON" | jq -r '${sel}."cidr-block" // empty')`,
  ]
  if (strict) out.push('[ -n "$SGW_SERVICE_ID" ] || { echo "SGW: All-Services 항목 조회 실패" >&2; exit 1; }')
  return out
}
const needsService = blueprint => blueprint.nodes.some(n =>
  JSON.stringify(n.bindings).includes('oracleServicesNetworkAll') || JSON.stringify(n.comparison || {}).includes('oracleServicesNetworkAll'))

// id 변수는 항상(outputs 선언 여부와 무관하게) data.id 에서 확보. 나머지 선언 output 도 확보.
function captureOutputs(node, jsonVar, out) {
  const idVar = varNameForNode(node.id, '/data/id')
  out.push(`${idVar}=$(echo "$${jsonVar}" | jq -r 'getpath(["data","id"]) // ""')`)
  for (const [, def] of Object.entries(node.outputs || {})) {
    if (String(def.pointer) === '/data/id') continue
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
  if (hasOption(catalog, node.commandRef.resource, 'create', '--wait-for-state')) args.push('--wait-for-state AVAILABLE', '--max-wait-seconds 600')
  const cmd = cmdOf(catalog, node.commandRef.resource, 'create')
  // 실패 시 stderr 를 캡처해 run-result 에 FAILED 노드로 남기고 중단(trap 이 부분결과 flush).
  out.push(`if ${V}_JSON=$(${cmd} ${COMMON} \\`)
  out.push(args.map(a => `  ${a}`).join(' \\\n') + ` 2>"$BP_TMP/${V}.err"); then`)
  captureOutputs(node, `${V}_JSON`, out)
  out.push(`  echo "  → ${node.id} 생성: $${varNameForNode(node.id, '/data/id')}" >&2`)
  out.push('else')
  out.push(`  ${V}_ERR=$(tr -d '\\r' < "$BP_TMP/${V}.err")`)
  out.push(`  echo "  ✗ ${node.id} 실패: $${V}_ERR" >&2`)
  out.push(`  RESULT_NODES+=("$(jq -nc --arg e "$${V}_ERR" '{node:"${node.id}",action:"FAILED",error:$e}')")`)
  out.push('  exit 1')
  out.push('fi')
}

function renderReuseNode(node, catalog, existingId, out, header) {
  const V = nodeVar(node.id)
  const getCmd = cmdOf(catalog, node.commandRef.resource, 'get')
  const idOpt = idOptionOf(catalog, node.commandRef.resource, 'get')
  out.push(header ?? `# [REUSE] ${node.label} (${node.id}) — 기존 자원 get 으로 출력 확보(삭제 대상 아님)`)
  out.push(`${V}_JSON=$(${getCmd} ${idOpt} ${shq(safeId(existingId))} ${COMMON})`)
  captureOutputs(node, `${V}_JSON`, out)
}

function renderApplyLike({ blueprint, catalog, inputs, naming, plan, planDigest, priorRunResult }) {
  const title = priorRunResult ? `Resume: ${blueprint.label}` : `Apply: ${blueprint.label}`
  const done = new Set()
  if (priorRunResult) for (const n of priorRunResult.nodes || []) if (n.action === 'CREATED' || n.action === 'REUSED') done.add(n.node)
  const out = preamble(title, baseVars(inputs))
  out.push('# 주의: 이 스크립트를 직접 재실행하면 중복 자원이 생길 수 있습니다. 실패 시 DISCOVER→PLAN 으로 복구하세요.')
  out.push(`RUN_ID="\${RUN_ID:-run-$(date -u +%Y%m%d%H%M%S)-$$}"`)
  out.push(`PLAN_DIGEST=${shq(planDigest || '')}`)
  out.push('RESULT_NODES=()')
  // JSON 배열 인자를 임시파일 file:// 로 전달(Windows Click 의 glob 확장 회피). 상대경로 = CWD 기준.
  out.push('BP_TMP=".bp-tmp-$RUN_ID"; mkdir -p "$BP_TMP"')
  // 실패해도 EXIT trap 이 지금까지의 부분 run-result 를 stdout 으로 flush → resume/rollback 가능
  out.push('emit_result() {')
  out.push('  local body="[]"')
  out.push('  if [ ${#RESULT_NODES[@]} -gt 0 ]; then body=$(printf "%s\\n" "${RESULT_NODES[@]}" | jq -s "."); fi')
  // stdout 으로 출력하면서 실패(에러) 포함 결과를 별도 파일로도 남긴다(붙여넣기·보관용).
  out.push(`  echo "$body" | jq --arg rid "$RUN_ID" --arg pd "$PLAN_DIGEST" '{artifactType:"run-result",runId:$rid,planDigest:$pd,nodes:.}' | tee "run-result-$RUN_ID.json"`)
  out.push('  echo "→ 결과 파일: run-result-$RUN_ID.json" >&2')
  out.push('}')
  out.push("trap 'rc=$?; [ $rc -ne 0 ] && echo \"── 중단: 부분 run-result 를 출력합니다 ──\" >&2; emit_result; rm -rf \"$BP_TMP\"; exit $rc' EXIT")
  out.push('echo "run-id: $RUN_ID" >&2')
  if (needsService(blueprint)) out.push('', ...serviceListBlock(true))
  const ctx = { blueprint, inputs, naming }
  const planByNode = new Map(plan.nodes.map(n => [n.nodeId, n]))
  for (const nodeId of topoOrder(blueprint.nodes)) {
    const node = blueprint.nodes.find(n => n.id === nodeId)
    const pnode = planByNode.get(nodeId)
    const idVar = varNameForNode(nodeId, '/data/id')
    out.push('')
    if (done.has(nodeId)) {
      const prev = priorRunResult.nodes.find(n => n.node === nodeId)
      const label = prev.action === 'REUSED'
        ? `# [REUSE] ${node.label} (${nodeId}) — 기존 자원 get 으로 출력 확보`
        : `# [SKIP-DONE] ${node.label} (${nodeId}) — 이전 run 에서 생성됨, get 으로 출력 확보`
      renderReuseNode(node, catalog, prev.id || '', out, label)
      out.push(`RESULT_NODES+=("$(jq -nc --arg id "$${idVar}" '{node:"${nodeId}",action:"${prev.action}",id:$id}')")`)
      continue
    }
    if (pnode?.state === 'REUSE') {
      renderReuseNode(node, catalog, pnode.existingId || '', out)
      out.push(`RESULT_NODES+=("$(jq -nc --arg id "$${idVar}" '{node:"${nodeId}",action:"REUSED",id:$id}')")`)
      continue
    }
    renderCreateNode(node, ctx, catalog, out)
    out.push(`RESULT_NODES+=("$(jq -nc --arg id "$${idVar}" '{node:"${nodeId}",action:"CREATED",id:$id}')")`)
  }
  out.push('', '# ── run-result 는 EXIT trap(emit_result)이 stdout 으로 출력합니다. 그 JSON 을 블로그에 Import ──')
  return { name: priorRunResult ? 'resume.sh' : 'apply.sh', title, content: out.join('\n') + '\n' }
}

export const renderApply = args => renderApplyLike(args)
export const renderResume = args => renderApplyLike(args)

// ── Discover (read-only) ──
export function renderDiscover({ blueprint, catalog, inputs, naming }) {
  const out = preamble(`Discover: ${blueprint.label}`, baseVars(inputs))
  if (needsService(blueprint)) out.push('', ...serviceListBlock(false))
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
    const ind = parentGuard ? '  ' : ''
    if (parentGuard) out.push(`if [ -z "\${${parentGuard}:-}" ]; then`, `  DISC_NODES+=("$(jq -nc '{node:"${nodeId}",status:"OK",found:null}')")`, 'else')
    // list 실패(권한/토큰/스로틀)를 빈 결과로 위장하지 않고 DISCOVERY_ERROR 로 구분 → computePlan 이 BLOCKED 처리
    out.push(`${ind}${V}_ERR_FILE=$(mktemp)`)
    out.push(`${ind}if ${V}_LIST=$(${listLine} 2>"$${V}_ERR_FILE"); then`)
    out.push(`${ind}  ${V}_MATCH=$(echo "$${V}_LIST" | jq -c --arg n ${shq(String(expected))} '[.data[] | select(.["${nameKey}"]==$n)]')`)
    out.push(`${ind}  ${V}_CNT=$(echo "$${V}_MATCH" | jq 'length')`)
    out.push(`${ind}  if [ "$${V}_CNT" = "1" ]; then`)
    out.push(`${ind}    DISC_${V}_ID=$(echo "$${V}_MATCH" | jq -r '.[0].id')`)
    if (disc.get) {
      const getCmd = cmdOf(catalog, disc.get.commandRef.resource, disc.get.commandRef.operation)
      const collectPairs = Object.values(disc.get.collect).map(c => c.pointer)
      out.push(`${ind}    ${V}_GET=$(${getCmd} ${disc.get.idOption} "$DISC_${V}_ID" ${COMMON})`)
      out.push(`${ind}    ${V}_COL=$(echo "$${V}_GET" | jq -c '{${collectPairs.map(p => `${JSON.stringify(p)}: getpath(${jqPath(p)})`).join(', ')}}')`)
      out.push(`${ind}    DISC_NODES+=("$(jq -nc --arg id "$DISC_${V}_ID" --arg n ${shq(String(expected))} --argjson col "$${V}_COL" '{node:"${nodeId}",status:"OK",found:{id:$id,name:$n,collected:$col}}')")`)
    } else {
      out.push(`${ind}    DISC_NODES+=("$(jq -nc --arg id "$DISC_${V}_ID" --arg n ${shq(String(expected))} '{node:"${nodeId}",status:"OK",found:{id:$id,name:$n}}')")`)
    }
    out.push(`${ind}  elif [ "$${V}_CNT" = "0" ]; then`)
    out.push(`${ind}    DISC_NODES+=("$(jq -nc '{node:"${nodeId}",status:"OK",found:null}')")`)
    out.push(`${ind}  else`)
    out.push(`${ind}    DISC_NODES+=("$(echo "$${V}_MATCH" | jq -c '{node:"${nodeId}",status:"OK",candidates:[.[]|{id:.id,name:.["${nameKey}"]}]}')")`)
    out.push(`${ind}  fi`)
    out.push(`${ind}else`)
    out.push(`${ind}  ${V}_ERR=$(<"$${V}_ERR_FILE")`)
    out.push(`${ind}  DISC_NODES+=("$(jq -nc --arg error "list 실패: \${${V}_ERR:-알 수 없는 OCI CLI 오류}" '{node:"${nodeId}",status:"DISCOVERY_ERROR",error:$error}')")`)
    out.push(`${ind}fi`)
    out.push(`${ind}rm -f "$${V}_ERR_FILE"`)
    if (parentGuard) out.push('fi')
  }
  out.push('', '# ── discovery-result (stdout JSON 을 블로그에 Import) ──')
  const svc = needsService(blueprint)
    ? `--argjson services "$(jq -nc --arg id "$SGW_SERVICE_ID" --arg cidr "$SGW_SERVICE_CIDR_BLOCK" '[{key:"oracleServicesNetworkAll",items:[{id:$id,name:"all-services","cidr-block":$cidr}]}]')"`
    : '--argjson services "[]"'
  out.push(`printf '%s\\n' "\${DISC_NODES[@]}" | jq -s ${svc} --arg profile "$OCI_PROFILE" --arg region "$OCI_REGION" --arg compartment "$COMPARTMENT_ID" '{artifactType:"discovery-result",context:{profile:$profile,region:$region,compartmentId:$compartment},services:$services,nodes:.}' | tee "discovery-result.json"`)
  out.push('echo "→ 결과 파일: discovery-result.json" >&2')
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
    const id = safeId(idByNode.get(nodeId))
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
        out.push(`VERIFY_CHECKS+=("$(jq -nc --argjson actual "$${av}" --argjson exp ${shq(JSON.stringify(expected))} '{node:"${nodeId}",id:"${a.id}",comparator:"${a.comparator}",severity:"${a.severity}",actual:$actual,expected:$exp}')")`)
      }
    }
  }
  out.push('', '# ── verification-result (stdout JSON 을 블로그에 Import) ──')
  out.push(`printf '%s\\n' "\${VERIFY_CHECKS[@]}" | jq -s --arg rid ${shq(manifest?.runId || '')} '{artifactType:"verification-result",runId:$rid,checks:.}' | tee "verification-result.json"`)
  out.push('echo "→ 결과 파일: verification-result.json" >&2')
  return { name: 'verify.sh', title: `Verify: ${blueprint.label}`, content: out.join('\n') + '\n' }
}

// ── Rollback ──
export function renderRollback({ blueprint, catalog, inputs, naming, manifest }) {
  void naming
  const runId = manifest?.runId || ''
  const out = preamble(`Rollback: ${blueprint.label}`, [
    ...baseVars(inputs),
    '# 이중 확인: 실수 방지를 위해 두 값을 환경변수로 명시해야 실행됩니다.',
    ': "${CONFIRM_RUN_ID:?롤백하려면 CONFIRM_RUN_ID 를 설정하세요}"',
    ': "${CONFIRM_COMPARTMENT_ID:?롤백하려면 CONFIRM_COMPARTMENT_ID 를 설정하세요}"',
    `[ "$CONFIRM_RUN_ID" = ${shq(runId)} ] || { echo "run-id 불일치 — 중단" >&2; exit 1; }`,
    '[ "$CONFIRM_COMPARTMENT_ID" = "$COMPARTMENT_ID" ] || { echo "compartment 불일치 — 중단" >&2; exit 1; }',
  ])
  out.push(`RUN_ID=${shq(runId)}`)
  out.push('[ -n "$RUN_ID" ] || { echo "manifest run-id 없음 — 롤백 불가" >&2; exit 1; }')
  const actionByNode = new Map((manifest?.nodes || []).map(n => [n.nodeId, n]))
  for (const nodeId of reverseOrder(blueprint.nodes)) {
    const node = blueprint.nodes.find(n => n.id === nodeId)
    const mnode = actionByNode.get(nodeId)
    const okId = mnode && mnode.action === 'CREATED' && isOcid(mnode.id)
    if (!okId) {
      out.push('', `# [SKIP] ${node.label} — ${mnode?.action ?? '기록 없음'} (재사용/미생성 자원은 삭제하지 않음)`)
      continue
    }
    const rb = node.rollback
    const V = nodeVar(nodeId)
    const getCmd = cmdOf(catalog, rb.commandRef.resource, 'get')
    const getIdOpt = idOptionOf(catalog, rb.commandRef.resource, 'get')
    const delCmd = cmdOf(catalog, rb.commandRef.resource, 'delete')
    out.push('', `# [DELETE] ${node.label} (${nodeId}) — run-id 태그 AND compartment 일치 시에만`)
    // get 을 멱등하게(이미 삭제되어 404 여도 스크립트 중단 없이 건너뜀)
    out.push(`${V}_GET=$(${getCmd} ${getIdOpt} ${shq(mnode.id)} ${COMMON} 2>/dev/null || echo '{}')`)
    out.push(`${V}_TAG=$(echo "$${V}_GET" | jq -r 'getpath(["data","freeform-tags","${rb.ownership.runIdTagKey}"]) // ""')`)
    out.push(`${V}_COMP=$(echo "$${V}_GET" | jq -r 'getpath(["data","compartment-id"]) // ""')`)
    out.push(`if [ -n "$RUN_ID" ] && [ "$${V}_TAG" = "$RUN_ID" ] && [ "$${V}_COMP" = "$CONFIRM_COMPARTMENT_ID" ]; then`)
    out.push(`  ${delCmd} ${rb.idOption} ${shq(mnode.id)} --force ${rb.waitForState ? `--wait-for-state ${rb.waitForState} ` : ''}${COMMON}`)
    out.push(`  echo "  삭제됨: ${nodeId} ${shq(mnode.id)}" >&2`)
    out.push('else')
    out.push(`  echo "  건너뜀(소유권/컴파트먼트 불일치 또는 이미 삭제됨): ${nodeId} ${shq(mnode.id)}" >&2`)
    out.push('fi')
  }
  out.push('', 'echo "rollback 완료" >&2')
  return { name: 'rollback.sh', title: `Rollback: ${blueprint.label}`, content: out.join('\n') + '\n' }
}
