import type { CliBlueprint, NamingPolicy, InputValues } from './blueprintTypes.d.mts'

export interface WizardNode { id: string; moduleType: string; label?: string; role?: string; x?: number; y?: number; inputs?: Record<string, string> }
export interface WizardEdge { id: string; from: string; to: string; slot: string }
export interface WizardGraph {
  schemaVersion?: number
  id?: string
  label?: string
  namingPolicyId?: string
  execution?: { region?: string; compartment?: string; profile?: string; compartmentMode?: string }
  naming?: Record<string, unknown>
  metadata?: { definedTags?: unknown }
  nodes: WizardNode[]
  edges: WizardEdge[]
}

export function composeBlueprint(graph: WizardGraph, policy: NamingPolicy): { blueprint: CliBlueprint; inputs: InputValues; issues: string[] }
