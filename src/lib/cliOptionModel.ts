export interface CliValueOption {
  name: string
  flag?: boolean
  multiple?: boolean
  shellQuote?: boolean
}

export function isCliOptionValueActive(option: Pick<CliValueOption, 'flag'> | undefined, value: string): boolean {
  return option?.flag ? value === 'true' : value.trim() !== ''
}

export function splitRepeatedCliValues(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

export function quoteCliValue(value: string, always = false): string {
  return always || /\s|[{}$]/.test(value)
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
