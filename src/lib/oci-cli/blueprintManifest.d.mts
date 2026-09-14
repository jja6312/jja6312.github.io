import type { CliBlueprint, Plan, RunResult, RunManifest, VerificationResult, NamingResult, Comparator, VerifyOutcome } from './blueprintTypes.d.mts'
export function evaluateAssertion(comparator: Comparator | string, expected: unknown, actual: unknown): boolean
export function evaluateVerification(verificationResult: VerificationResult): { nodeOutcome: Map<string, VerifyOutcome>; checks: unknown[] }
export function buildProvisionalManifest(args: { blueprint: CliBlueprint; plan: Plan; runResult: RunResult; naming?: NamingResult }): RunManifest
export function mergeVerification(manifest: RunManifest, verificationResult: VerificationResult): RunManifest
export function manifestDigestInput(manifest: RunManifest): unknown
