export interface CliValueOption {
  name: string
  flag?: boolean
  multiple?: boolean
  shellQuote?: boolean
}

export interface CliValidationOption extends CliValueOption {
  required?: boolean
  requirement?: 'required' | 'optional' | 'conditional'
  conflictsWith?: string[]
}

export interface CliValidationRule {
  id: string
  kind: 'oneOf' | 'mutuallyExclusive' | 'requires'
  options?: string[]
  when?: string
  requires?: string[]
  message: string
}

export interface CliValidationIssue {
  code: 'required' | 'oneOfMissing' | 'oneOfConflict' | 'mutuallyExclusive' | 'requires' | 'conflict'
  message: string
  options: string[]
}

export interface CliValidationResult {
  valid: boolean
  issues: CliValidationIssue[]
  missing: string[]
}

export function isCliOptionValueActive(option: Pick<CliValueOption, 'flag'> | undefined, value: string): boolean {
  return option?.flag ? value === 'true' : value.trim() !== ''
}

export function splitRepeatedCliValues(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

export function quoteCliValue(value: string, always = false): string {
  return always || !/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)
    ? `'${value.replaceAll("'", "'\\''")}'`
    : value
}

export function serializeCliOption(option: CliValueOption, value: string): string[] {
  const normalized = value.trim()
  if (option.flag) return normalized === 'true' ? [option.name] : []
  if (!normalized) return []
  const values = option.multiple ? splitRepeatedCliValues(normalized) : [normalized]
  return values.map(item => `${option.name} ${quoteCliValue(item, option.shellQuote)}`)
}

export function validateCliOptions(
  options: CliValidationOption[],
  values: Record<string, string>,
  rules: CliValidationRule[] = [],
): CliValidationResult {
  const optionByName = new Map(options.map(option => [option.name, option]))
  const active = (name: string) => isCliOptionValueActive(optionByName.get(name), values[name] ?? '')
  const issues: CliValidationIssue[] = []
  const coveredConflictPairs = new Set<string>()
  const pairKey = (left: string, right: string) => [left, right].sort().join('\u0000')

  for (const option of options) {
    const requirement = option.requirement ?? (option.required ? 'required' : 'optional')
    if (requirement === 'required' && !active(option.name)) {
      issues.push({
        code: 'required',
        message: `${option.name} 값을 입력해야 합니다.`,
        options: [option.name],
      })
    }
  }

  for (const rule of rules) {
    if (rule.kind === 'oneOf') {
      const names = rule.options ?? []
      const selected = names.filter(active)
      for (let left = 0; left < names.length; left += 1) {
        for (let right = left + 1; right < names.length; right += 1) {
          coveredConflictPairs.add(pairKey(names[left], names[right]))
        }
      }
      if (selected.length === 0) {
        issues.push({ code: 'oneOfMissing', message: rule.message, options: names })
      } else if (selected.length > 1) {
        issues.push({
          code: 'oneOfConflict',
          message: `${rule.message} 동시에 여러 값을 사용할 수 없습니다.`,
          options: selected,
        })
      }
      continue
    }

    if (rule.kind === 'mutuallyExclusive') {
      const names = rule.options ?? []
      const selected = names.filter(active)
      for (let left = 0; left < names.length; left += 1) {
        for (let right = left + 1; right < names.length; right += 1) {
          coveredConflictPairs.add(pairKey(names[left], names[right]))
        }
      }
      if (selected.length > 1) {
        issues.push({ code: 'mutuallyExclusive', message: rule.message, options: selected })
      }
      continue
    }

    if (rule.kind === 'requires' && rule.when && active(rule.when)) {
      const missing = (rule.requires ?? []).filter(name => !active(name))
      if (missing.length > 0) {
        issues.push({ code: 'requires', message: rule.message, options: [rule.when, ...missing] })
      }
    }
  }

  const seenConflictPairs = new Set<string>()
  for (const option of options) {
    if (!active(option.name)) continue
    for (const conflict of option.conflictsWith ?? []) {
      if (!active(conflict)) continue
      const key = pairKey(option.name, conflict)
      if (seenConflictPairs.has(key) || coveredConflictPairs.has(key)) continue
      seenConflictPairs.add(key)
      issues.push({
        code: 'conflict',
        message: `${option.name}와 ${conflict}는 동시에 사용할 수 없습니다.`,
        options: [option.name, conflict],
      })
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    missing: [...new Set(issues
      .filter(issue => issue.code === 'required' || issue.code === 'oneOfMissing' || issue.code === 'requires')
      .flatMap(issue => issue.code === 'requires' ? issue.options.slice(1) : issue.options))],
  }
}
