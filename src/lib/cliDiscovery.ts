// Relations extend the existing catalog: no duplicated menu or second command schema.
export interface CliDiscoveryRelation {
  command: string
  label: string
  target?: string
  nameField: string
  idKind: 'ocid' | 'subscription'
  inputs: Record<string, string>
}
export interface DiscoverableCliOption {
  name: string
  dynamicLookup?: {
    kind: string; listCommand?: string; target?: string; nameField?: string
    scopeInput?: string | null; scopeArgument?: string
    prerequisites?: { input: string; argument: string }[]
  }
}
export function cliDiscoveryRelation(command: string, option: DiscoverableCliOption): CliDiscoveryRelation | undefined {
  // SPM line-level ID, NOT an organizations subscription OCID.
  if (command === 'oci onesubscription subscribed-service subscribed-service list' && option.name === '--subscription-id') {
    return {
      command: 'oci onesubscription organization-subscription organization-subscription list',
      label: 'Subscriptions 목록에서 ID 선택', target: 'subscription-list', nameField: 'service-name',
      idKind: 'subscription', inputs: { '--compartment-id': '--compartment-id' },
    }
  }
  const lookup = option.dynamicLookup
  if (lookup?.kind !== 'exactName' || !lookup.listCommand) return undefined
  return {
    command: lookup.listCommand, label: `${lookup.target || '리소스'} 목록에서 ID 선택`,
    target: lookup.target, nameField: lookup.nameField || 'display-name', idKind: 'ocid',
    inputs: Object.fromEntries([
      ...(lookup.scopeInput ? [[lookup.scopeArgument || '--compartment-id', lookup.scopeInput]] : []),
      ...(lookup.prerequisites ?? []).map(item => [item.argument, item.input]),
    ]),
  }
}
export interface CliDiscoveryItem { id: string; label: string; detail: string }
export function cliDiscoveryContext(command: string, request: string[], scope: string[], values: Record<string, string>, dynamic: Record<string, boolean>): string {
  return JSON.stringify([command, request, scope.map(name => [name, values[name] || '']), [...new Set([...scope, '--compartment-id'])].map(name => [name, dynamic[name] ?? true])])
}
// Keep set/exit/traps in the copied lookup from changing the user's interactive shell.
export function wrapCliDiscoveryCommand(command: string): string { return `(\n${command}\n)` }
export function parseCliDiscovery(text: string, relation: CliDiscoveryRelation): CliDiscoveryItem[] {
  if (text.length > 5_000_000) throw new Error('결과가 너무 큽니다. 5MB 이하의 JSON을 사용하세요.')
  let document: unknown
  try { document = JSON.parse(text) } catch { throw new Error('조회 명령의 JSON 출력 전체를 붙여넣으세요. 표 출력은 사용할 수 없습니다.') }
  const data = (document as { data?: unknown } | null)?.data
  const rows = relation.target === 'announcement' ? (data as { items?: unknown } | null)?.items : data
  if (!Array.isArray(rows)) throw new Error('예상한 LIST 응답이 아닙니다. 제공된 명령을 변경하지 않고 실행해 주세요.')
  const items = rows.map(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim()) throw new Error('ID가 없는 결과입니다. --query 없이 JSON 전체를 조회해 주세요.')
    const id = row.id.trim()
    if (relation.idKind === 'subscription' ? /^ocid1\./.test(id) : !/^ocid1\.[a-z0-9-]+\./.test(id)) {
      throw new Error(relation.idKind === 'subscription' ? 'Subscription OCID가 아닌 SPM Subscription ID가 필요합니다. 제공된 Subscriptions 명령을 사용하세요.' : '올바른 OCID가 없는 결과입니다.')
    }
    const string = (v: unknown) => typeof v === 'string' ? v : ''
    return { id, label: string(row[relation.nameField]) || id, detail: [string(row.status || row['lifecycle-state']), string(row['time-start']), string(row['time-end'])].filter(Boolean).join(' · ') }
  })
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('중복 ID가 있습니다. 올바른 목록 응답인지 확인하세요.')
  return items
}
