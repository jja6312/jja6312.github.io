export interface WhereCond { field: string; op: string; value: string; join?: '&&' | '||' }
export interface ResourceSearchSpec {
  types?: string[]
  where?: WhereCond[]
  sortField?: string
  sortDir?: 'ASC' | 'DESC'
}
export function parseTypeList(text: string): string[]
export function buildResourceSearchQuery(spec: ResourceSearchSpec): string
export function whereMixesConnectors(where: WhereCond[]): boolean

export interface ExtractScript { title: string; filename: string; body: string }
export function renderResourceTypeExtract(args: { profile?: string; region?: string }): ExtractScript
export function renderResourceSearchRun(args: { query: string; profile?: string; region?: string }): ExtractScript
