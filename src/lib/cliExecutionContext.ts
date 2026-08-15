import { serializeCliOption, type CliValueOption } from './cliOptionModel'

export const REQUEST_CONTEXT_NAMES = ['--profile', '--region', '--auth', '--endpoint'] as const
export const RESPONSE_CONTEXT_NAMES = ['--output', '--query', '--raw-output'] as const
export const EXECUTION_CONTEXT_NAMES = [...REQUEST_CONTEXT_NAMES, ...RESPONSE_CONTEXT_NAMES] as const

export type ExecutionContextName = typeof EXECUTION_CONTEXT_NAMES[number]
export type ExecutionContextScope = 'request' | 'response'

export interface ExecutionContextOption extends CliValueOption {
  required: false
  type: string
  choices: string[] | null
  help: string
  placeholder: string
  defaultValue?: string
  requirement?: 'optional'
  checkbox?: boolean
  checkboxLabel?: string
  multiSelect?: boolean
  suggestions?: string[]
  suggestionLabels?: Record<string, string>
}

export interface ExecutionContextSchema {
  source: {
    kind: 'final-click-root'
    tag: string
    version: string
    commit: string
    runtimeFile: string
  }
  request: ExecutionContextOption[]
  response: ExecutionContextOption[]
}

export type ExecutionContextOverrides = Partial<Record<ExecutionContextName, ExecutionContextOption>>

export function isExecutionContextName(name: string): name is ExecutionContextName {
  return (EXECUTION_CONTEXT_NAMES as readonly string[]).includes(name)
}

export function executionContextOptions(
  schema: ExecutionContextSchema,
  overrides: ExecutionContextOverrides = {},
  scope?: ExecutionContextScope,
): ExecutionContextOption[] {
  const groups = scope ? [scope] : ['request', 'response'] as const
  return groups.flatMap(group => schema[group].map(option => ({
    ...option,
    ...overrides[option.name as ExecutionContextName],
  })))
}

export function executionContextDefaults(
  schema: ExecutionContextSchema,
  overrides: ExecutionContextOverrides = {},
): Record<string, string> {
  return Object.fromEntries(executionContextOptions(schema, overrides)
    .filter(option => option.defaultValue !== undefined)
    .map(option => [option.name, option.defaultValue as string]))
}

export function serializeExecutionContext(
  schema: ExecutionContextSchema,
  overrides: ExecutionContextOverrides,
  values: Record<string, string>,
  scope: ExecutionContextScope,
): string[] {
  return executionContextOptions(schema, overrides, scope)
    .flatMap(option => serializeCliOption(option, values[option.name] ?? ''))
}

export function splitLegacyExecutionContext(values: Record<string, string>): {
  context: Record<string, string>
  resource: Record<string, string>
} {
  const context: Record<string, string> = {}
  const resource: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (isExecutionContextName(name) || name.startsWith('--query::')) context[name] = value
    else resource[name] = value
  }
  return { context, resource }
}
