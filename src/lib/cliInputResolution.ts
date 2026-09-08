// Readiness is not an OCID. Never write a sentinel into user values or generated commands.
export interface ResolvableCliOption {
  name: string
  required?: boolean
  flag?: boolean
  dynamicLookup?: {
    kind: 'tenancy' | 'compartment' | 'exactName'
    scope?: 'tenancy' | 'compartment'
    scopeInput?: string | null
    prerequisites?: { input: string; kind: 'availabilityDomain' | 'value' }[]
  }
}
export interface CliInputResolution {
  state: 'provided' | 'automatic' | 'missing' | 'blocked'
  ready: boolean
  label: string
  dependencies: string[]
  // Active prerequisites stay visible after being filled (no disappearing wizard question).
  requiredInputs?: string[]
}
export interface CliResolutionContext {
  rootTenancyLookup?: boolean
  // Computed with the same dynamic-toggle policy as the normal form.
  dynamic: Record<string, boolean>
}

export function resolveCliInputs(
  options: ResolvableCliOption[], values: Record<string, string>, context: CliResolutionContext,
): Record<string, CliInputResolution> {
  const byName = new Map(options.map(option => [option.name, option]))
  const result: Record<string, CliInputResolution> = {}
  const resolve = (name: string, visiting = new Set<string>()): CliInputResolution => {
    if (result[name]) return result[name]
    if (visiting.has(name)) return { state: 'blocked', ready: false, label: '조회 의존관계를 확인하세요.', dependencies: [name] }
    const option = byName.get(name)
    const raw = (values[name] ?? '').trim()
    const active = option?.flag ? raw === 'true' : !!raw
    const dynamic = context.dynamic[name] === true
    const lookup = option?.dynamicLookup
    const next = new Set(visiting).add(name)
    let value: CliInputResolution = { state: active ? 'provided' : 'missing', ready: active, label: active ? '입력됨' : '입력 필요', dependencies: [] }
    if (dynamic && (option?.required || raw) && (lookup?.kind === 'tenancy' || name === '--compartment-id' && context.rootTenancyLookup)) {
      value = { state: 'automatic', ready: true, label: '실행 시 자동 조회 · 테넌시', dependencies: [] }
    } else if (dynamic && option?.required && name === '--availability-domain' && !raw) {
      const scope = byName.has('--compartment-id') ? '--compartment-id' : undefined
      const missing = scope && !resolve(scope, next).ready ? [scope] : []
      value = missing.length
        ? { state: 'blocked', ready: false, label: '컴파트먼트 입력 후 자동 조회', dependencies: missing }
        : { state: 'automatic', ready: true, label: '실행 시 자동 조회 · 첫 번째 AD', dependencies: [] }
    } else if (dynamic && lookup?.kind === 'exactName' && raw && !raw.split(/[\r\n,]+/).filter(item => item.trim()).every(item => /^ocid1\.[a-z0-9-]+\./.test(item.trim()))) {
      const requiredInputs = [
        ...(lookup.scope === 'compartment' && lookup.scopeInput ? [lookup.scopeInput] : []),
        ...(lookup.prerequisites ?? []).filter(item => item.kind !== 'availabilityDomain' || (values[item.input] ?? '').trim()).map(item => item.input),
      ]
      const dependencies = requiredInputs.filter(input => !resolve(input, next).ready)
      if (dependencies.length) value = { state: 'blocked', ready: false, label: `조회 범위 필요: ${dependencies.join(', ')}`, dependencies: [...new Set(dependencies)] }
      value.requiredInputs = [...new Set(requiredInputs)]
    }
    result[name] = value
    return value
  }
  options.forEach(option => resolve(option.name))
  return result
}
