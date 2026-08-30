/**
 * Canonical OCI Console top-level service order.
 *
 * Keep CLI and Policy navigation on this presentation contract instead of
 * trusting catalog serialization order. Oracle documents that services are
 * organized by functional group; the exact sequence below was verified from
 * Oracle Console screenshots on 2026-08-30.
 *
 * @see https://docs.oracle.com/en-us/iaas/Content/GSG/Concepts/navigating-to-services.htm
 */
export const OCI_CONSOLE_CATEGORY_ORDER = [
  'Compute',
  'Storage',
  'Networking',
  'Oracle Database',
  'Databases',
  'Analytics & AI',
  'Developer Services',
  'Identity & Security',
  'Observability & Management',
  'Hybrid',
  'Migration',
  'Billing & Cost Management',
  'Governance & Administration',
] as const

const OCI_CONSOLE_CATEGORY_RANK = new Map<string, number>(
  OCI_CONSOLE_CATEGORY_ORDER.map((label, index) => [label, index]),
)

/** Return a sorted copy while retaining non-Console groups at the end. */
export function sortOciConsoleCategories<T extends { label: string }>(categories: readonly T[]): T[] {
  return [...categories].sort((left, right) => {
    const leftRank = OCI_CONSOLE_CATEGORY_RANK.get(left.label) ?? Number.MAX_SAFE_INTEGER
    const rightRank = OCI_CONSOLE_CATEGORY_RANK.get(right.label) ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank || left.label.localeCompare(right.label)
  })
}
