import type { CliBlueprint, InputValues, NamingResult, Plan, RunManifest, RunResult, RenderedScript } from './blueprintTypes.d.mts'

interface Catalog { commands: Record<string, unknown> }
interface ApplyArgs { blueprint: CliBlueprint; catalog: Catalog; inputs: InputValues; naming: NamingResult; plan: Plan; planDigest?: string; priorRunResult?: Partial<RunResult> }

export function renderApply(args: ApplyArgs): RenderedScript
export function renderResume(args: ApplyArgs): RenderedScript
export function renderDiscover(args: { blueprint: CliBlueprint; catalog: Catalog; inputs: InputValues; naming: NamingResult }): RenderedScript
export function renderVerify(args: { blueprint: CliBlueprint; catalog: Catalog; inputs: InputValues; naming: NamingResult; manifest: RunManifest }): RenderedScript
export function renderRollback(args: { blueprint: CliBlueprint; catalog: Catalog; inputs: InputValues; naming: NamingResult; manifest: RunManifest }): RenderedScript
