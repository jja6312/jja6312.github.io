import type { InputValues } from './blueprintTypes.d.mts'
export function parseCidr(s: string): { ip: number; bits: number } | null
export function isValidCidr(s: string): boolean
export function cidrContains(outer: string, inner: string): boolean
export function cidrsOverlap(a: string, b: string): boolean
export function validateAddressing(inputs: InputValues): string[]
