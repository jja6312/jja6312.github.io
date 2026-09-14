import type { BlueprintNode } from './blueprintTypes.d.mts'
type NodeLike = Pick<BlueprintNode, 'id' | 'dependsOn'>
export function topoOrder(nodes: NodeLike[]): string[]
export function reverseOrder(nodes: NodeLike[]): string[]
export function ancestorMap(nodes: NodeLike[]): Map<string, Set<string>>
