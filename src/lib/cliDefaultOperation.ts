export type CliCrudVerb = 'get' | 'list' | 'create' | 'update' | 'delete'

export interface CliOperationSupport {
  preferredOperation?: CliCrudVerb
  maintenanceReboot?: boolean
  operations?: Partial<Record<CliCrudVerb, unknown>>
}

const SAFE_DEFAULT_ORDER: CliCrudVerb[] = ['list', 'get']
const MUTATING_FALLBACK_ORDER: CliCrudVerb[] = ['create', 'update', 'delete']

/**
 * Choose the safest useful first screen for a resource.
 * A stale or manually curated mutating preference must never beat an available
 * LIST/GET operation. Maintenance reboot is a dedicated GET/UPDATE workflow.
 */
export const defaultCliOperation = (command: CliOperationSupport): CliCrudVerb => {
  if (command.maintenanceReboot) return 'get'

  const safeOperation = SAFE_DEFAULT_ORDER.find(operation => command.operations?.[operation])
  if (safeOperation) return safeOperation

  if (command.preferredOperation && command.operations?.[command.preferredOperation]) {
    return command.preferredOperation
  }

  return MUTATING_FALLBACK_ORDER.find(operation => command.operations?.[operation]) ?? 'create'
}
