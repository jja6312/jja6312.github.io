/* eslint-disable react/only-export-components -- the model and renderer intentionally share one menu contract. */
import type { ReactNode } from 'react'
import { guessCategory, parsePolicyStatement } from '../lib/oci-cli/policyParse.mjs'

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

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

function categoryForPolicy(category: string, categories: OciNavCategory[]) {
  const needle = normalize(category)
  return categories.find(item => {
    const haystack = normalize(`${item.id} ${item.label}`)
    if (needle === normalize('Networking') && /network/.test(haystack)) return true
    if (needle === normalize('Security') && /identitysecurity|security/.test(haystack)) return true
    return haystack.includes(needle) || needle.includes(haystack)
  })
}

function categoryForPolicyResource(resource: string) {
  const key = normalize(resource)
  if (key === 'announcement' || key === 'announcements' || key === 'announcementsubscriptions' || key === 'allresources') return 'Governance & Administration'
  if (key === 'onstopics') return 'Developer Services'
  if (key === 'usagereport') return 'Billing & Cost Management'
  return guessCategory(resource)
}

function policyRecords(statements: OciPolicyNavStatement[]) {
  const seen = new Set<string>()
  const records: Array<{ resource: string; label: string; category: string }> = []
  for (const item of statements) {
    const parsed = parsePolicyStatement(item.statement ?? '')
    if (!parsed.valid) continue
    const resource = parsed.kind === 'allow' && parsed.resourceType
      ? parsed.resourceType
      : parsed.kind === 'advanced' && parsed.keyword
        ? `policy-${parsed.keyword}`
        : ''
    if (!resource) continue
    const key = resource.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    records.push({
      resource,
      label: parsed.kind === 'advanced' ? `${parsed.keyword?.toUpperCase()} policy` : resource,
      category: parsed.kind === 'advanced' ? 'Security' : categoryForPolicyResource(parsed.resourceType ?? ''),
    })
  }
  return records
}

/** CLI 카탈로그와 Policy 등록 resource type을 같은 좌측 트리로 합친다. */
export function buildOciResourceNav(catalog: OciNavCatalog | undefined, statements: OciPolicyNavStatement[] = []): OciNavCategory[] {
  const categories: OciNavCategory[] = (catalog?.categories ?? []).map(category => ({
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

  const additions = new Map<string, { category: OciNavCategory; record: { resource: string; label: string; category: string } }>()
  for (const record of policyRecords(statements)) {
    const matched = allCli.get(record.resource)
    if (matched) {
      matched.policyResource = record.resource
      matched.policyLabel = record.label
      continue
    }
    let category = categoryForPolicy(record.category, categories)
    if (!category) {
      const id = `policy-${normalize(record.category) || 'other'}`
      category = categories.find(item => item.id === id)
      if (!category) {
        category = { id, label: record.category || '기타', groups: [] }
        categories.push(category)
      }
    }
    let target = additions.get(`${category.id}:${record.resource}`)
    if (!target) {
      target = { category, record }
      additions.set(`${category.id}:${record.resource}`, target)
    }
  }
  for (const { category, record } of additions.values()) {
    const group = category.groups.find(item => item.label === 'Policy 등록')
      ?? (() => { const next = { label: 'Policy 등록', entries: [] as OciNavEntry[] }; category.groups.push(next); return next })()
    group.entries.push({
      key: `policy:${record.resource}`,
      label: record.label,
      categoryId: category.id,
      groupLabel: group.label,
      policyResource: record.resource,
    })
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
  return (
    <div className="oci-resource-nav" aria-label={`${surface === 'cli' ? 'OCI CLI' : 'OCI Policy'} 리소스 메뉴`}>
      {categories.map(category => {
        const entries = category.groups.flatMap(group => group.entries)
        const available = entries.some(entry => surface === 'cli' ? !!entry.cliResource : !!entry.policyResource)
        const partial = available && entries.some(entry => surface === 'cli' ? !entry.cliResource : !entry.policyResource)
        return (
          <div key={category.id} className={`cli-cat${available ? '' : ' oci-nav-unavailable'}${partial ? ' oci-nav-partial' : ''}`}>
            <button type="button" className="cli-cat-toggle" onClick={() => onToggleCategory(category.id)} aria-expanded={!!openCategories[category.id]}>
              <span className={`caret${openCategories[category.id] ? ' open' : ''}`}>▸</span> {category.label}
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
