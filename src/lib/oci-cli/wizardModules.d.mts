export interface WizardEdgeSlot { slot: string; option: string | null; target: string | string[]; pointer: string; required: boolean; multiple?: boolean; as?: string }
export interface WizardScalarInput { key: string; option: string | null; type: string; required: boolean; label: string; default?: string; comparator?: string; requiredIf?: string }
export interface WizardModule {
  type: string; label: string; group: string; resource: string; defaultRole: string
  roles?: string[]; dnsLabel?: boolean
  scalarInputs: WizardScalarInput[]
  fixed: Record<string, unknown>
  edgeSlots: WizardEdgeSlot[]
  getIdOption: string; deleteIdOption: string
  [k: string]: unknown
}
export const WIZARD_MODULES: Record<string, WizardModule>
export const MODULE_LIST: { type: string; label: string; group: string; roles: string[] }[]
export const ROUTE_TARGET: Record<string, { destination?: string; destinationDiscovery?: [string, string]; destinationType: string; desc: string }>
export function buildSecurityRules(inputs: Record<string, string>): { ingress: unknown[]; egress: unknown[] }
