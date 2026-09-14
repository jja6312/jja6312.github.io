// OCI Resource Search 쿼리 "조립" + 테넌시별 resource-type 추출 스크립트. 순수 함수.
// 사용자 워크플로우: 추출 스크립트로 테넌시의 검색가능 타입 목록을 뽑아 → 붙여넣고
//   조건(where)·정렬(sorted by)을 조합해 하나의 쿼리를 만든다.

/** 붙여넣은 타입 목록(콤마/개행/공백 혼재, 'resources' 키워드 포함 가능)을 배열로 정규화. */
export function parseTypeList(text) {
  return String(text ?? '')
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(t => t && t.toLowerCase() !== 'resources' && t.toLowerCase() !== 'query')
    .filter((t, i, a) => a.indexOf(t) === i)
}

/** 단일따옴표 bash 이스케이프. */
function q(s) { return `'${String(s ?? '').replace(/'/g, `'\\''`)}'` }

/**
 * where 조건 배열 + 정렬 → structured query 문자열 조립.
 * @param {{ types?: string[], where?: Array<{field:string,op:string,value:string,join?:string}>, sortField?: string, sortDir?: string }} spec
 * @returns {string}
 */
export function buildResourceSearchQuery({ types = [], where = [], sortField = '', sortDir = 'DESC' } = {}) {
  const typeList = (types || []).map(t => String(t).trim()).filter(Boolean)
  const typesPart = typeList.length ? typeList.join(', ') : 'all'
  const lines = [`query ${typesPart} resources`]

  // field·op·value 가 모두 있어야 유효 절(빈 value 는 'where x =' 같은 malformed 방지).
  const conds = (where || []).filter(c => c && String(c.field).trim() && String(c.op).trim() && String(c.value ?? '').trim())
  conds.forEach((c, i) => {
    const clause = `${String(c.field).trim()} ${String(c.op).trim()} ${String(c.value).trim()}`
    if (i === 0) lines.push(`where ${clause}`)
    else lines.push(`${c.join === '||' ? '||' : '&&'} ${clause}`)
  })

  if (String(sortField).trim()) lines.push(`sorted by ${String(sortField).trim()} ${String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`)
  return lines.join('\n')
}

/** where 조건에 && 와 || 가 섞였는지(괄호 필요). true 면 문서상 괄호로 우선순위를 명시해야 함. */
export function whereMixesConnectors(where = []) {
  const joins = (where || []).slice(1).filter(c => c && String(c.field).trim() && String(c.op).trim() && String(c.value ?? '').trim()).map(c => c.join === '||' ? '||' : '&&')
  return joins.includes('&&') && joins.includes('||')
}

/**
 * 테넌시에서 검색 가능한 resource-type 이름 목록을 뽑는 bash.
 * (1) 전체 이름 표, (2) query <...> resources 에 바로 붙일 콤마 목록(소문자).
 * @param {{ profile?: string, region?: string }} args
 * @returns {{ title:string, filename:string, body:string }}
 */
export function renderResourceTypeExtract({ profile, region } = {}) {
  const ctx = ['--profile "$PROFILE"']
  const head = [`PROFILE=${q(profile || 'DEFAULT')}`]
  if (region) { head.push(`REGION=${q(region)}`); ctx.push('--region "$REGION"') }
  head.push(`CTX=(${ctx.join(' ')})`)

  const body = [
    '#!/usr/bin/env bash',
    '# 테넌시에서 검색 가능한 resource-type 목록 추출 (Resource Search)',
    '# 생성: 지식모음 > OCI Grammar (jja6312.github.io)',
    'set -euo pipefail',
    '',
    ...head,
    '',
    '# (1) 전체 타입 이름 — 정렬된 표',
    `oci search resource-type list --all --query 'sort(data[].name)' --output table "\${CTX[@]}"`,
    '',
    '# (2) query <...> resources 에 바로 붙일 콤마 목록 (소문자로 정규화)',
    `oci search resource-type list --all --query 'join(\`, \`, sort(data[].name))' --raw-output "\${CTX[@]}" | tr -d '\\r' | tr 'A-Z' 'a-z'`,
  ].join('\n')

  return { title: '검색가능 resource-type 추출', filename: 'oci-search-resource-types.sh', body }
}

/**
 * 조립/저장한 structured query 를 실제로 실행하는 bash.
 * 쿼리는 개행·따옴표·&& 를 포함하므로 heredoc 파일 + file:// 로 전달(안전).
 * @param {{ query: string, profile?: string, region?: string }} args
 * @returns {{ title:string, filename:string, body:string }}
 */
export function renderResourceSearchRun({ query, profile, region } = {}) {
  const text = String(query ?? '').trim()
  if (!text) throw new Error('query 가 비어 있습니다')
  const ctx = ['--profile "$PROFILE"']
  const head = [`PROFILE=${q(profile || 'DEFAULT')}`]
  if (region) { head.push(`REGION=${q(region)}`); ctx.push('--region "$REGION"') }
  head.push(`CTX=(${ctx.join(' ')})`)

  const body = [
    '#!/usr/bin/env bash',
    '# Resource Search 실행 — 조립한 structured query 로 자원 조회',
    '# 생성: 지식모음 > OCI Grammar (jja6312.github.io)',
    'set -euo pipefail',
    '',
    ...head,
    '',
    '# --query-text 는 file:// 를 확장하지 않으므로 쿼리 문자열을 그대로 전달한다.',
    '# 단일따옴표 변수라 개행·내부따옴표(예: \'GSIS\')가 안전하게 리터럴로 담긴다.',
    `QUERY=${q(text)}`,
    '',
    'oci search resource structured-search \\',
    '  --query-text "$QUERY" \\',
    '  --output table "${CTX[@]}"',
  ].join('\n')

  return { title: 'Resource Search 실행', filename: 'oci-search-run.sh', body }
}
