export function ociCategoryCode(label: string, order: readonly string[]): number | null
export function computeResourceCodes(
  categories: { label: string; groups: { label: string; resources: string[] }[] }[] | undefined,
  order: readonly string[],
): Map<string, number>
export function groupCodeRanges(
  category: { label: string; groups: { label: string; resources: string[] }[] },
  order: readonly string[],
): Map<string, { start: number; end: number }>
export function formatNavCode(code: number | null | undefined): string
