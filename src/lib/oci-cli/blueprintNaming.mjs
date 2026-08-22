// MSP 네이밍 정책 적용 — 순수 함수. 입력 원문을 정규화하고 pattern 으로 display name 을,
// 별도 규칙으로 DNS label 을 파생한다. 파생 실패(빈 정규화·충돌·길이)는 issues 로 보고한다.

/** 정규화: NFKD → diacritic 제거 → 소문자 → [^a-z0-9]+ → '-' → 양끝 '-' trim */
export function normalizeToken(raw, policy) {
  const n = policy?.normalization || {}
  let s = String(raw ?? '')
  if (n.unicodeForm) s = s.normalize(n.unicodeForm)
  if (n.stripDiacritics) s = s.replace(/[̀-ͯ]/g, '')
  if (n.lowercase !== false) s = s.toLowerCase()
  const run = n.replaceRun ? new RegExp(n.replaceRun, 'g') : /[^a-z0-9]+/g
  s = s.replace(run, n.replaceWith ?? '-')
  const trim = n.trim ?? '-'
  const te = trim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  s = s.replace(new RegExp(`^(?:${te})+|(?:${te})+$`, 'g'), '')
  return s
}

/** DNS label: (norm(a)+norm(b)) 에서 하이픈 제거 → 앞 15자, 첫 글자 숫자면 'v' 접두 */
export function deriveDnsLabel(parts, policy) {
  const max = policy?.dnsLabel?.maxLength ?? 15
  let s = parts.map(p => normalizeToken(p, policy)).join('').replace(/-/g, '')
  if (/^[0-9]/.test(s)) s = 'v' + s
  s = s.slice(0, max)
  const ok = /^[a-z][a-z0-9]{0,14}$/.test(s)
  return { label: s, valid: ok }
}

export function resolveRegionAlias(inputs, policy) {
  const override = (inputs['naming.regionAlias'] || '').trim()
  if (override) return { alias: override, source: 'override' }
  const region = (inputs['execution.region'] || '').trim()
  const map = policy?.regionAliases?.map || {}
  if (map[region]) return { alias: map[region], source: 'policy' }
  const fallback = region.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 6)
  return { alias: fallback, source: 'fallback' }
}

/** run-id 를 제외한 정적 관리 태그. run-id 는 render($RUN_ID)/compare 단계에서 주입 */
export function staticManagedTags(blueprint) {
  return {
    'blueprint-id': blueprint.id,
    'blueprint-version': String(blueprint.version),
    'managed-by': 'jja-hub-blueprint-engine',
  }
}

export function computeNaming(blueprint, policy, inputs) {
  const issues = []
  const normalized = {
    customer: normalizeToken(inputs['naming.customer'], policy),
    workload: normalizeToken(inputs['naming.workload'], policy),
    environment: normalizeToken(inputs['naming.environment'], policy),
  }
  for (const [k, v] of Object.entries(normalized)) {
    if (!v) issues.push(`naming.${k} 정규화 결과가 비었습니다(영문/숫자 포함 값 필요): "${inputs['naming.' + k] ?? ''}"`)
  }
  if (policy.environments && normalized.environment && !policy.environments.includes(normalized.environment)) {
    issues.push(`environment '${normalized.environment}' 는 허용 목록(${policy.environments.join(', ')}) 밖입니다`)
  }
  const { alias: regionAlias, source: regionAliasSource } = resolveRegionAlias(inputs, policy)
  if (regionAliasSource === 'fallback') issues.push(`region '${inputs['execution.region'] ?? ''}' alias 미정의 — fallback '${regionAlias}' 사용`)
  const sequence = (inputs['naming.sequence'] || policy?.sequence?.default || '01').trim()

  const names = {}
  const dnsByLabel = new Map()
  for (const node of blueprint.nodes) {
    const resourceToken = node.naming.resourceToken || policy.resourceTokens[node.commandRef.resource] || node.commandRef.resource
    const role = node.naming.role
    const roleToken = policy.roleTokens?.[role] || role
    const seg = { customer: normalized.customer, workload: normalized.workload, environment: normalized.environment, regionAlias, resource: resourceToken, role: roleToken, sequence }
    let displayName = policy.pattern.replace(/\{(\w+)\}/g, (_, key) => seg[key] ?? '')
    displayName = displayName.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, policy.displayName.maxLength)
    if (policy.displayName.allowedPattern && !new RegExp(policy.displayName.allowedPattern).test(displayName)) {
      issues.push(`node ${node.id} display name '${displayName}' 이 허용 패턴을 위반`)
    }
    const rec = { role, resourceToken, displayName }
    if ((policy.dnsLabel.appliesTo || []).includes(node.commandRef.resource)) {
      const { label, valid } = deriveDnsLabel([normalized.workload, roleToken], policy)
      rec.dnsLabel = label
      if (!valid) issues.push(`node ${node.id} DNS label '${label}' 규칙 위반(영문 시작·영숫자·15자)`)
      if (dnsByLabel.has(label)) issues.push(`DNS label 충돌: ${dnsByLabel.get(label)} 와 ${node.id} 가 '${label}' 로 축약됨`)
      else dnsByLabel.set(label, node.id)
    }
    names[node.id] = rec
  }

  return { normalized, regionAlias, regionAliasSource, sequence, names, staticTags: staticManagedTags(blueprint), issues }
}
