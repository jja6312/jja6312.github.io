import type { CliBlueprint, InputValues, NamingResult } from './blueprintTypes.d.mts'
export const DERIVED_KEYS: string[]
export function deriveValue(key: string, ctx: { blueprint: CliBlueprint; inputs: InputValues; naming: NamingResult }): unknown
export function materialize(value: unknown, resolver: (token: { __ref: string; [k: string]: unknown }) => unknown): unknown
