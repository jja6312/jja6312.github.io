import type { CliBlueprint, NamingPolicy, InputValues, NamingResult } from './blueprintTypes.d.mts'
export function normalizeToken(raw: unknown, policy: NamingPolicy): string
export function deriveDnsLabel(parts: string[], policy: NamingPolicy): { label: string; valid: boolean }
export function resolveRegionAlias(inputs: InputValues, policy: NamingPolicy): { alias: string; source: 'override' | 'policy' | 'fallback' }
export function staticManagedTags(blueprint: CliBlueprint): Record<string, string>
export function computeNaming(blueprint: CliBlueprint, policy: NamingPolicy, inputs: InputValues): NamingResult
