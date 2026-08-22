import type { ValueSource, CliBlueprint, BlueprintNode, InputValues, NamingResult } from './blueprintTypes.d.mts'

export interface CompareCtx {
  blueprint: CliBlueprint; node: BlueprintNode; inputs: InputValues; naming: NamingResult
  nodeOcid: (nodeId: string, pointer: string) => string | undefined
  discovery: (key: string, pointer: string) => string | undefined
  runId?: string
}
export type RenderValue =
  | { t: 'scalar'; v: string }
  | { t: 'var'; name: string }
  | { t: 'json'; tree: unknown }

export function varNameForNode(nodeId: string, pointer: string): string
export function varNameForDiscovery(key: string, pointer: string): string
export function resolveCompare(vs: ValueSource, ctx: CompareCtx): unknown
export function resolveRender(vs: ValueSource, ctx: { blueprint: CliBlueprint; node: BlueprintNode; inputs: InputValues; naming: NamingResult }): RenderValue
export function buildJqExpr(tree: unknown): { expr: string; args: { jq: string; bash: string }[] }
export function emitOption(optionName: string, rv: RenderValue, varPrefix: string): { pre: string[]; arg: string }
