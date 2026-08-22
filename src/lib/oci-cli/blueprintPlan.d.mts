import type { CliBlueprint, InputValues, NamingResult, DiscoveryResult, Plan, Comparator } from './blueprintTypes.d.mts'
export function compareField(comparator: Comparator, desired: unknown, actual: unknown): boolean
export function computePlan(args: { blueprint: CliBlueprint; inputs: InputValues; naming: NamingResult; discovery: DiscoveryResult; runId?: string }): Plan
export function planDigestInput(plan: Plan): unknown
