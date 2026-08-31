/* eslint-disable react/only-export-components -- the model and renderer intentionally share one menu contract. */
import type { ReactNode } from 'react'
import { parsePolicyStatement } from '../lib/oci-cli/policyParse.mjs'
import { sortOciConsoleCategories, OCI_CONSOLE_CATEGORY_ORDER } from '../lib/ociConsoleNavigation'
import { ociCategoryCode, computeResourceCodes } from '../lib/oci-cli/ociNavNumbering.mjs'

export type OciNavCatalog = {
  categories?: Array<{
    id: string
    label: string
    groups: Array<{ label: string; resources: string[] }>
  }>
  commands?: Record<string, { label: string }>
}

export type OciPolicyNavStatement = { statement?: string }

export type OciNavEntry = {
  key: string
  label: string
  categoryId: string
  groupLabel: string
  cliResource?: string
  policyResource?: string
  policyLabel?: string
}

export type OciNavCategory = {
  id: string
  label: string
  groups: Array<{ label: string; entries: OciNavEntry[] }>
}

export type OciNavSurface = 'cli' | 'policy'

// 정책 resource-type(family/specific) → 콘솔 좌측 메뉴의 CLI 리소스 키.
// 정책이 걸린 자원을 별도 그룹이 아니라 동일한 콘솔 메뉴 항목에 표시하기 위한 매핑
// (자산 없으면 회색, 있으면 활성). 새 리소스 추가 시 여기에 매핑을 더한다.
const POLICY_RESOURCE_TO_CLI: Record<string, string[]> = {
  'instance-family': ['instance', 'instance-configuration', 'instance-pool', 'dedicated-vm-host', 'capacity-reservation', 'compute-cluster', 'custom-image'],
  'instances': ['instance'],
  'instance-images': ['custom-image'],
  'instance-configurations': ['instance-configuration'],
  'instance-pools': ['instance-pool'],
  'dedicated-vm-hosts': ['dedicated-vm-host'],
  'compute-capacity-reservations': ['capacity-reservation'],
  'compute-clusters': ['compute-cluster'],
  'volume-family': ['block-volume', 'boot-volume', 'volume-group', 'volume-backup-policy'],
  'volumes': ['block-volume'],
  'boot-volumes': ['boot-volume'],
  'volume-groups': ['volume-group'],
  'volume-backups': ['volume-backup-policy'],
  'backup-policies': ['volume-backup-policy'],
  'object-family': ['bucket'],
  'buckets': ['bucket'],
  'objects': ['bucket'],
  'file-family': ['file-system', 'mount-target', 'export'],
  'file-systems': ['file-system'],
  'mount-targets': ['mount-target'],
  'exports': ['export'],
  'virtual-network-family': ['vcn', 'subnet', 'route-table', 'dhcp-options', 'security-list', 'nsg', 'internet-gateway', 'nat-gateway', 'service-gateway', 'local-peering-gateway', 'drg', 'drg-attachment', 'remote-peering-connection', 'public-ip'],
  'vcns': ['vcn'],
  'subnets': ['subnet'],
  'route-tables': ['route-table'],
  'dhcp-options': ['dhcp-options'],
  'security-lists': ['security-list'],
  'network-security-groups': ['nsg'],
  'internet-gateways': ['internet-gateway'],
  'nat-gateways': ['nat-gateway'],
  'service-gateways': ['service-gateway'],
  'local-peering-gateways': ['local-peering-gateway'],
  'drgs': ['drg', 'drg-attachment'],
  'remote-peering-connections': ['remote-peering-connection'],
  'public-ips': ['public-ip'],
  'load-balancers': ['load-balancer'],
  'network-load-balancers': ['network-load-balancer'],
  'autonomous-database-family': ['autonomous-database'],
  'autonomous-databases': ['autonomous-database'],
  'database-family': ['base-db'],
  'db-systems': ['base-db'],
  'mysql-family': ['mysql', 'mysql-backup'],
  'mysql-db-systems': ['mysql'],
  'mysql-backups': ['mysql-backup'],
  'ons-family': ['topic', 'subscription'],
  'ons-topics': ['topic'],
  'ons-subscriptions': ['subscription'],
  'users': ['iam-user'],
  'groups': ['iam-group'],
  'dynamic-groups': ['iam-group'],
  'policies': ['iam-policy'],
  'compartments': ['iam-compartment'],
  'alarms': ['alarm'],
  'metrics': ['alarm'],
  'announcement-family': ['announcement', 'announcement-subscription'],
  'announcements': ['announcement'],
  'announcement-subscriptions': ['announcement-subscription'],
  'incident-family': ['support-incident'],
  'incidents': ['support-incident'],
  'usage-reports': ['subscription-list'],
  'usage-budgets': ['subscription-list'],
}

/** 콘솔 STRUCTURE 를 좌측 트리로 만들고, 저장된 policy 를 같은 메뉴 항목에 표시한다(별도 그룹 없음).
    CLI·Policy 가 동일 메뉴를 공유하며, 각 surface 에서 자산 없는 항목은 회색으로 보인다. */
export function buildOciResourceNav(catalog: OciNavCatalog | undefined, statements: OciPolicyNavStatement[] = []): OciNavCategory[] {
  const categories: OciNavCategory[] = sortOciConsoleCategories(catalog?.categories ?? []).map(category => ({
    id: category.id,
    label: category.label,
    groups: category.groups.map(group => ({
      label: group.label,
      entries: group.resources.map(resource => ({
        key: resource,
        label: catalog?.commands?.[resource]?.label ?? resource,
        categoryId: category.id,
        groupLabel: group.label,
        cliResource: resource,
      })),
    })),
  }))

  const allCli = new Map<string, OciNavEntry>()
  for (const category of categories) for (const group of category.groups) for (const entry of group.entries) {
    allCli.set(entry.cliResource ?? entry.key, entry)
  }

  // 저장된 policy 문장의 resource-type 을 콘솔 메뉴 항목에 매핑해 활성 표시(별도 'Policy 등록' 그룹 없음).
  const seen = new Set<string>()
  for (const item of statements) {
    const parsed = parsePolicyStatement(item.statement ?? '')
    if (!parsed.valid || parsed.kind !== 'allow' || !parsed.resourceType) continue
    const rt = parsed.resourceType.toLowerCase()
    if (seen.has(rt)) continue
    seen.add(rt)
    const targets = POLICY_RESOURCE_TO_CLI[rt] ?? (allCli.has(rt) ? [rt] : [])
    for (const key of targets) {
      const entry = allCli.get(key)
      if (!entry) continue
      // 실제 policy 가 있는 resource-type 을 저장(클릭 시 그 타입으로 라이브러리 필터). 먼저 매칭된 것 유지.
      entry.policyResource = entry.policyResource ?? rt
      entry.policyLabel = entry.label
    }
  }
  return categories
}

export function extractOciPolicyNavStatements(value: unknown): OciPolicyNavStatement[] {
  if (!value || typeof value !== 'object') return []
  const statements = (value as { statements?: unknown }).statements
  if (!Array.isArray(statements)) return []
  return statements.filter((item): item is OciPolicyNavStatement => !!item && typeof item === 'object' && typeof (item as { statement?: unknown }).statement === 'string')
}

export default function OciResourceNav({
  catalog,
  statements = [],
  surface,
  activeKey,
  openCategories,
  onToggleCategory,
  onSelect,
  isEntryVerified,
  footer,
}: {
  catalog?: OciNavCatalog
  statements?: OciPolicyNavStatement[]
  surface: OciNavSurface
  activeKey?: string
  openCategories: Record<string, boolean>
  onToggleCategory: (id: string) => void
  onSelect: (entry: OciNavEntry) => void
  isEntryVerified?: (entry: OciNavEntry) => boolean
  footer?: ReactNode
}) {
  const categories = buildOciResourceNav(catalog, statements)
  const resourceCode = computeResourceCodes(catalog?.categories, OCI_CONSOLE_CATEGORY_ORDER)
  return (
    <div className="oci-resource-nav" aria-label={`${surface === 'cli' ? 'OCI CLI' : 'OCI Policy'} 리소스 메뉴`}>
      {categories.map(category => {
        const catCode = ociCategoryCode(category.label, OCI_CONSOLE_CATEGORY_ORDER)
        const entries = category.groups.flatMap(group => group.entries)
        const available = entries.some(entry => surface === 'cli' ? !!entry.cliResource : !!entry.policyResource)
        const partial = available && entries.some(entry => surface === 'cli' ? !entry.cliResource : !entry.policyResource)
        return (
          <div key={category.id} className={`cli-cat${available ? '' : ' oci-nav-unavailable'}${partial ? ' oci-nav-partial' : ''}`}>
            <button type="button" className="cli-cat-toggle" onClick={() => onToggleCategory(category.id)} aria-expanded={!!openCategories[category.id]}>
              <span className={`caret${openCategories[category.id] ? ' open' : ''}`}>▸</span>
              {catCode != null && <span className="oci-nav-code cat" aria-hidden="true">{catCode}</span>} {category.label}
            </button>
            {openCategories[category.id] && category.groups.map(group => {
              const groupAvailable = group.entries.some(entry => surface === 'cli' ? !!entry.cliResource : !!entry.policyResource)
              return (
                <div key={group.label} className={`cli-group${groupAvailable ? '' : ' oci-nav-unavailable'}`}>
                  <div className="cli-group-label px">{group.label}</div>
                  {group.entries.map(entry => {
                    const implemented = surface === 'cli' ? !!entry.cliResource : !!entry.policyResource
                    const label = surface === 'policy' && !entry.policyResource ? `${entry.label} · CLI` : entry.label
                    const verified = !!isEntryVerified?.(entry)
                    return (
                      <button type="button" key={entry.key} disabled={!implemented}
                        className={`cli-navitem${activeKey === entry.key ? ' on' : ''}${verified ? ' verified' : ''}${!implemented ? ' oci-navitem-unavailable' : ''}`}
                        title={!implemented
                          ? surface === 'cli' ? 'Policy에 등록됨 · OCI CLI 메뉴에는 아직 구현되지 않음' : 'OCI CLI에는 등록됨 · Policy 문장에는 아직 등록되지 않음'
                          : undefined}
                        onClick={() => onSelect(entry)}>
                        {resourceCode.get(entry.key) != null && <span className="oci-nav-code" aria-hidden="true">{resourceCode.get(entry.key)}</span>}
                        {label}
                        {verified && <span className="cli-vmark" title="하나 이상의 명령 검증됨">✓</span>}
                        {!implemented ? <span className="oci-nav-status" aria-label="미구현">·</span> : null}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
      {footer}
    </div>
  )
}
