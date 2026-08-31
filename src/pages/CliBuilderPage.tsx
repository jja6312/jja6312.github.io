import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import CliBlueprintWorkspace from '../components/CliBlueprintWorkspace'
import CliInputWizard, { defaultCliWizardControl, useCliInputWizardShortcut, type CliWizardQuestion, type CliWizardRenderContext } from '../components/CliInputWizard'
import OciOfficialCommandNav from '../components/OciOfficialCommandNav'
import type { BlueprintCatalog } from '../lib/oci-cli/blueprintTypes.d.mts'
import { useHub } from '../store'
import { getPat, getFile, putFile, explainGhError } from '../lib/githubDb'
import { useProtectedData } from '../lib/protectedData'
import { isCliOptionValueActive, quoteCliValue, serializeCliOption, validateCliOptions } from '../lib/cliOptionModel'
import { dynamicLookupItemIterator } from '../lib/cliDynamicLookup'
import { defaultCliOperation, type CliCrudVerb } from '../lib/cliDefaultOperation'
import {
  executionContextDefaults,
  executionContextOptions,
  isExecutionContextName,
  serializeExecutionContext,
  splitLegacyExecutionContext,
  type ExecutionContextOverrides,
  type ExecutionContextSchema,
} from '../lib/cliExecutionContext'
import { resolveRegion, REGIONS } from '../lib/oci-cli/regionAliases'
import { loadOfficialCliCommand, type OfficialCliCommand, type OfficialCliOption } from '../lib/oci-cli/officialCatalog'
import { OCI_CONSOLE_CATEGORY_ORDER } from '../lib/ociConsoleNavigation'
import { computeResourceCodes } from '../lib/oci-cli/ociNavNumbering.mjs'
import {
  loadProfiles, getSelectedProfileName, setSelectedProfileName,
  registerProfilesFromPaste, deleteProfile, lookupNamesFor, profileSummary,
  renderProfileCollectScript, type OciProfile,
} from '../lib/oci-cli/profiles'

interface CliOption {
  name: string
  required: boolean
  requirement?: 'required' | 'optional' | 'conditional'
  multi?: boolean            // 여러 값 입력(줄바꿈/콤마) → 전용 빌더에서 for 루프
  type: string
  choices: string[] | null
  help: string
  placeholder: string
  flag?: boolean
  multiple?: boolean        // Click multiple=True: 같은 옵션을 값마다 반복해 전달
  conflictsWith?: string[]  // 같은 명령에서 동시에 사용할 수 없는 옵션
  deprecated?: boolean
  deprecation?: string
  replacement?: string[]
  checkbox?: boolean        // 고정된 옵션 값을 자유 입력 대신 체크박스로 켜고 끔
  checkboxLabel?: string
  defaultValue?: string
  suggestions?: string[]
  multiSelect?: boolean
  suggestionLabels?: Record<string, string>
  shellQuote?: boolean
  lookupOnly?: boolean       // 이름 조회에만 사용하고 최종 OCI 명령에는 전달하지 않음
  displayLabel?: string
  dynamicLookup?: CliDynamicLookup
  dynamicLookupImplementedBy?: 'dedicated-builder'
  directLookupReason?: string
  jsonTemplate?: unknown
  jsonTemplateCommand?: string
  jsonRules?: CliJsonRules
  jsonFieldChoices?: Record<string, CliJsonFieldChoice[]>
  jsonNotice?: string
  imagePicker?: CliImagePicker
  shapePicker?: CliShapePicker
}
interface CliJsonFieldChoice { value: string; label: string }
interface CliJsonVariantRule { required?: string[]; requiredOneOf?: string[][] }
interface CliJsonRules { discriminator?: string; variants?: Record<string, CliJsonVariantRule> }
interface CliImagePicker { listCommand: string; shapeOption: string; docs: string; note: string }
interface CliShapePicker { listCommand: string; docs: string; note: string }
interface CliInstanceLaunchPreflight {
  schema: 'oci-instance-launch-preflight/v2'
  shapeListCommand: string
  imageListCommand: string
  shapeDocs: string
  imageDocs: string
}
interface CliSection { label: string; options: CliOption[] }
interface CliOptionRule {
  id: string
  kind: 'oneOf' | 'mutuallyExclusive' | 'requires'
  options?: string[]
  when?: string
  requires?: string[]
  message: string
}
interface CliOptionNotice {
  kind: 'notPublic'
  option: string
  replacements: string[]
  message: string
}
interface CliLookupPrerequisite {
  input: string
  argument: string
  kind: 'availabilityDomain' | 'value'
}
interface CliDynamicLookup {
  kind: 'exactName' | 'compartment' | 'tenancy'
  target?: string
  listCommand?: string
  nameField?: string
  inputLabel: string
  inputPlaceholder: string
  note: string
  scope?: 'tenancy' | 'compartment'
  scopeInput?: string | null
  scopeArgument?: string
  prerequisites?: CliLookupPrerequisite[]
  multiple?: boolean
  supportsAll?: boolean
}
type CrudVerb = CliCrudVerb
interface CliOperation {
  cmd: string; help: string
  sections: CliSection[]; advanced: CliOption[]
  lookupInputs?: CliOption[]
  rules?: CliOptionRule[]
  optionNotices?: CliOptionNotice[]
  contextOverrides?: ExecutionContextOverrides
  instanceLaunchPreflight?: CliInstanceLaunchPreflight
}
interface CliAction extends CliOperation {
  label: string
  icon?: string
  tone?: 'create' | 'warning' | 'danger'
}
interface CliCommand {
  resource: string; label: string
  cmd: string; help: string
  preferredOperation?: CrudVerb
  disableDynamic?: boolean
  rootTenancyLookup?: boolean
  compartmentSupportsRoot?: boolean
  iamResource?: 'compartment' | 'user' | 'group' | 'policy'
  iamMfaReset?: boolean
  allSubscriptionBalances?: boolean
  crossCopy?: string         // 'boot-volume' | 'volume' — cross-tenancy 복사 전용 조립
  maintenanceReboot?: boolean // 인스턴스 유지보수 재부팅 조회 + 변경 전용 조립
  compartmentCleanup?: boolean // scoped resource cleanup PREVIEW/DELETE script
  monitoringComposition?: boolean // Topic→구독→알람15 일괄등록 조립
  customWorkflow?: 'wizocm-functions-foundation' | 'wizocm-devops-cicd'
  manualBackup?: 'instance-boot-volume' | 'mysql'
  operations?: Partial<Record<CrudVerb, CliOperation>>
  actions?: Record<string, CliAction>
  contextOverrides?: ExecutionContextOverrides
  instanceLaunchPreflight?: CliInstanceLaunchPreflight
  sections: CliSection[]; advanced: CliOption[]
  lookupInputs?: CliOption[]
}
// 조립·검색용 평탄화 — 섹션 순서(콘솔 마법사 순서)를 그대로 유지
const allOptions = (c: Pick<CliCommand, 'sections' | 'advanced' | 'lookupInputs'>): CliOption[] => [
  ...(c.lookupInputs ?? []), ...c.sections.flatMap(s => s.options), ...c.advanced,
]
interface Catalog {
  executionContext: ExecutionContextSchema
  categories: { id: string; label: string; groups: { label: string; resources: string[] }[] }[]
  commands: Record<string, CliCommand>
}
interface CuratedCliTarget { resource: string; operation?: CrudVerb; action?: string }
type OfficialCommandPresentation = 'enhanced' | 'official'
type CliSidebarView = 'all' | 'recent' | 'favorites' | 'verified' | 'automation' | 'profiles'

function officialOptionPlaceholder(option: OfficialCliOption): string {
  if (option.type === 'json') return '구조화 입력기로 JSON 필드를 구성하세요.'
  if (option.type === 'datetime') return '예: 2026-08-30T23:18:00Z'
  if (option.type === 'int' || option.type === 'float') return '숫자 입력'
  if (option.multiple) return '값을 줄바꿈으로 여러 개 입력'
  if (option.name.endsWith('-id')) return 'ocid1...'
  return option.required ? '필수 값 입력' : '선택 값 입력'
}

function officialOptionToBuilder(path: string, option: OfficialCliOption): CliOption {
  return {
    name: option.name,
    required: option.required,
    requirement: option.required ? 'required' : 'optional',
    type: option.type,
    choices: option.choices ?? null,
    help: option.help,
    placeholder: officialOptionPlaceholder(option),
    flag: option.flag,
    multiple: option.multiple,
    deprecated: option.deprecated,
    deprecation: option.deprecation,
    ...(option.type === 'json' ? {
      jsonTemplateCommand: `${path} --generate-param-json-input ${option.name.replace(/^--/, '')}`,
    } : {}),
  }
}

function officialCommandToBuilder(command: OfficialCliCommand): CliCommand {
  const options = command.options.map(option => officialOptionToBuilder(command.path, option))
  const required = options.filter(option => option.required)
  const optional = options.filter(option => !option.required)
  return {
    resource: `official:${command.path}`,
    label: command.segments.join(' › '),
    cmd: command.path,
    help: command.help,
    sections: required.length ? [{ label: '공식 필수 입력', options: required }] : [],
    advanced: optional,
  }
}
const EMPTY_CATALOG: Catalog = {
  executionContext: { source: { kind: 'final-click-root', tag: '', version: '', commit: '', runtimeFile: '' }, request: [], response: [] },
  categories: [], commands: {},
}

const CRUD_OPERATIONS: { verb: CrudVerb; icon: string }[] = [
  { verb: 'get', icon: '↓' },
  { verb: 'list', icon: '≡' },
  { verb: 'create', icon: '+' },
  { verb: 'update', icon: '↻' },
  { verb: 'delete', icon: '×' },
] as const

const supportsOperation = (command: CliCommand | null | undefined, operation: CrudVerb) => command?.maintenanceReboot
  ? operation === 'get' || operation === 'update'
  : !!command?.operations?.[operation]
const operationDefaults = (command: CliCommand, operation: CrudVerb): Record<string, string> => {
  const selected = command.operations?.[operation] ?? command
  return Object.fromEntries(allOptions(selected)
    .filter(option => !isExecutionContextName(option.name))
    .filter(option => option.defaultValue !== undefined)
    .map(option => [option.name, option.defaultValue as string]))
}
const actionDefaults = (command: CliCommand, action: string): Record<string, string> => {
  const selected = command.actions?.[action]
  return selected ? Object.fromEntries(allOptions(selected)
    .filter(option => !isExecutionContextName(option.name))
    .filter(option => option.defaultValue !== undefined)
    .map(option => [option.name, option.defaultValue as string])) : {}
}
const selectedSurface = (command: CliCommand, operation: CrudVerb, action?: string | null): CliOperation =>
  (action ? command.actions?.[action] : command.operations?.[operation]) ?? command
const isAutomationRecipe = (command: CliCommand | null | undefined) => !!command
  && !!(command.crossCopy || command.compartmentCleanup || command.allSubscriptionBalances
    || command.iamMfaReset || command.monitoringComposition || command.customWorkflow)

const supportsResponseContext = (command: CliCommand | null | undefined) => !!command
  && !isAutomationRecipe(command) && !command.maintenanceReboot && !command.manualBackup

/* ── 동적 조회 지원 옵션 — 이름만 넣으면 $()/변수로 OCID를 찾아준다 ──
   기본값 = 동적. 체크 해제 시 OCID 직접 입력. */
const DYNAMIC: Record<string, { input: string; note: string }> = {
  '--compartment-id': { input: 'compartment 이름 (예: prod)', note: '이름으로 OCID 자동 조회' },
  '--availability-domain': { input: 'AD 번호 1~3 (기본 1)', note: '번호로 AD 이름 자동 조회' },
  '--vcn-id': { input: 'VCN 이름', note: '이름으로 OCID 자동 조회 (compartment 기준)' },
  '--subnet-id': { input: 'Subnet 이름', note: '이름으로 OCID 자동 조회 (compartment 기준)' },
  '--lookup-compartment-id': { input: 'compartment 이름 (예: prod)', note: 'DB System 이름 조회에만 사용할 compartment' },
  '--db-system-id': { input: 'MySQL DB System 이름', note: 'compartment 안에서 정확한 이름으로 OCID 조회' },
  '--user-id': { input: 'User 이름', note: '테넌시에서 정확한 이름으로 OCID 조회' },
  '--group-id': { input: 'Group 이름', note: '테넌시에서 정확한 이름으로 OCID 조회' },
  '--policy-id': { input: 'Policy 이름', note: '지정 위치에서 정확한 이름으로 OCID 조회' },
}

/* ── JSON 옵션 서브필드 스키마 — 사용자는 값만 넣고 {} 는 자동 조립 ── */
interface JsonSubField { key: string; label: string; kind: 'text' | 'num' | 'bool' | 'strlist' | 'ssh'; ph?: string }
const JSONSPEC: Record<string, { list?: boolean; ph?: string; fields?: JsonSubField[] }> = {
  '--metadata': { fields: [
    { key: 'ssh_authorized_keys', label: 'SSH 공개키', kind: 'ssh', ph: 'ssh-rsa AAAA… (.pub 파일 업로드 또는 붙여넣기)' },
  ] },
  '--create-vnic-details': { fields: [
    { key: 'assignPublicIp', label: '공인 IP 할당', kind: 'bool' },
    { key: 'hostnameLabel', label: 'Hostname', kind: 'text', ph: 'web01' },
    { key: 'privateIp', label: '사설 IP (고정)', kind: 'text', ph: '10.0.1.10' },
    { key: 'nsgIds', label: 'NSG OCID (콤마 구분)', kind: 'strlist', ph: 'ocid1.networksecuritygroup…' },
  ] },
  '--shape-details': { fields: [
    { key: 'minimumBandwidthInMbps', label: '최소 대역폭(Mbps)', kind: 'num', ph: '10' },
    { key: 'maximumBandwidthInMbps', label: '최대 대역폭(Mbps)', kind: 'num', ph: '100' },
  ] },
  '--subnet-ids': { list: true, ph: 'ocid1.subnet… (콤마로 여러 개)' },
  '--nsg-ids': { list: true, ph: 'ocid1.networksecuritygroup… (콤마 구분)' },
  '--network-security-group-ids': { list: true, ph: 'ocid1.networksecuritygroup… (콤마 구분)' },
  '--security-list-ids': { list: true, ph: 'ocid1.securitylist… (콤마 구분)' },
  '--whitelisted-ips': { list: true, ph: '1.2.3.4, 5.6.7.8/29' },
}
const subKey = (opt: string, key: string) => `${opt}::${key}`
const cliFieldAnchorId = (name: string) => `cli-field-${name.replace(/^--/, '').replace(/[^a-z0-9]+/gi, '-')}`

/* 서브필드 값 → JSON 문자열 (비면 '') */
function buildJsonValue(optName: string, values: Record<string, string>): string {
  const spec = JSONSPEC[optName]
  if (!spec) return ''
  if (spec.list) {
    const raw = (values[optName] ?? '').trim()
    if (!raw) return ''
    return JSON.stringify(raw.split(',').map(s => s.trim()).filter(Boolean))
  }
  const obj: Record<string, unknown> = {}
  for (const f of spec.fields ?? []) {
    const v = (values[subKey(optName, f.key)] ?? '').trim()
    if (!v) continue
    obj[f.key] = f.kind === 'num' ? Number(v)
      : f.kind === 'bool' ? v === 'true'
      : f.kind === 'strlist' ? v.split(',').map(s => s.trim()).filter(Boolean)
      : v
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : ''
}

function legacyShapeConfigValue(values: Record<string, string>): string {
  const current = (values['--shape-config'] ?? '').trim()
  if (current) return current
  const ocpus = (values[subKey('--shape-config', 'ocpus')] ?? '').trim()
  const memory = (values[subKey('--shape-config', 'memoryInGBs')] ?? '').trim()
  if (!ocpus && !memory) return ''
  return JSON.stringify({
    ...(ocpus ? { ocpus: Number(ocpus) } : {}),
    ...(memory ? { memoryInGBs: Number(memory) } : {}),
  })
}

type JsonRecord = Record<string, unknown>
interface JsonTemplateVariant { label: string; value: JsonRecord }
interface ImageCatalogEntry {
  id: string
  name: string
  operatingSystem: string
  operatingSystemVersion: string
  lifecycleState: string
  timeCreated: string
  compatibleShapes: string[]
}
type ShapeVendor = 'AMD' | 'Intel' | 'Ampere' | 'Other'
interface ShapeCatalogEntry {
  shape: string
  vendor: ShapeVendor
  processorDescription: string
  ocpus: number | null
  memoryInGBs: number | null
  isFlexible: boolean
  baselineOcpuUtilizations: string[]
  gpuDescription: string
  billingType: string
  networkingBandwidthInGbps: number | null
}
interface InstanceLaunchPreflightBundle {
  schema: 'oci-instance-launch-preflight/v2'
  generatedAt: string
  context: {
    profile: string
    region: string
    compartmentInput: string
    compartmentId: string
    availabilityDomain: string
  }
  shapes: ShapeCatalogEntry[]
  images: ImageCatalogEntry[]
}

const isJsonRecord = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value)
const parseJsonValue = (raw: string): unknown | undefined => {
  if (!raw.trim()) return undefined
  try { return JSON.parse(raw) as unknown } catch { return undefined }
}
const isTemplateUnion = (value: unknown): value is [string, ...JsonRecord[]] => Array.isArray(value)
  && typeof value[0] === 'string'
  && value[0].includes('pick one of the following object variants')
  && value.slice(1).every(isJsonRecord)
const jsonVariantLabel = (variant: JsonRecord, index: number) => {
  const discriminator = variant.sourceType ?? variant.type
  if (discriminator === 'image') return 'Image'
  if (discriminator === 'bootVolume') return 'Boot Volume'
  return typeof discriminator === 'string' && discriminator !== 'string' ? discriminator : `유형 ${index + 1}`
}
const jsonTemplateVariants = (template: unknown): JsonTemplateVariant[] => isTemplateUnion(template)
  ? (template.slice(1) as JsonRecord[]).map((value, index) => ({ label: jsonVariantLabel(value, index), value }))
  : []
const fixedJsonTemplateValues = (template: unknown): unknown => {
  if (Array.isArray(template)) return []
  if (!isJsonRecord(template)) return undefined
  return Object.fromEntries(Object.entries(template).filter(([key, value]) =>
    /type$/i.test(key) && typeof value === 'string' && value !== 'string'))
}
const jsonPathValue = (value: unknown, path: string) => path.split('.').reduce<unknown>((current, key) =>
  isJsonRecord(current) ? current[key] : undefined, value)
const hasJsonValue = (value: unknown) => typeof value === 'string'
  ? value.trim().length > 0
  : Array.isArray(value)
    ? value.length > 0
    : isJsonRecord(value)
      ? Object.keys(value).length > 0
      : value !== undefined && value !== null

function validateJsonInputs(options: CliOption[], values: Record<string, string>) {
  return options.flatMap(option => {
    if (option.type !== 'json' || !isCliOptionValueActive(option, values[option.name] ?? '')) return []
    const raw = (values[option.name] ?? '').trim()
    let parsed: unknown
    try { parsed = JSON.parse(raw) as unknown } catch {
      return [{ code: 'invalid-json', message: `${option.name} 값이 올바른 JSON이 아닙니다.`, options: [option.name] }]
    }
    if (!isJsonRecord(parsed) && !Array.isArray(parsed)) {
      return [{ code: 'invalid-json-shape', message: `${option.name}에는 JSON object 또는 array가 필요합니다.`, options: [option.name] }]
    }
    const rules = option.jsonRules
    if (!rules?.discriminator || !rules.variants || !isJsonRecord(parsed)) return []
    const variantName = parsed[rules.discriminator]
    const variant = typeof variantName === 'string' ? rules.variants[variantName] : undefined
    if (!variant) {
      return [{
        code: 'json-discriminator',
        message: `${option.name}의 ${rules.discriminator} 유형을 선택하세요.`,
        options: [option.name],
      }]
    }
    const issues: { code: string; message: string; options: string[] }[] = []
    for (const path of variant.required ?? []) {
      if (!hasJsonValue(jsonPathValue(parsed, path))) issues.push({
        code: 'json-required', message: `${option.name} (${String(variantName)})에는 ${path} 값이 필요합니다.`, options: [option.name],
      })
    }
    for (const paths of variant.requiredOneOf ?? []) {
      if (!paths.some(path => hasJsonValue(jsonPathValue(parsed, path)))) issues.push({
        code: 'json-one-of', message: `${option.name} (${String(variantName)})에는 ${paths.join(' 또는 ')} 중 하나가 필요합니다.`, options: [option.name],
      })
    }
    return issues
  })
}

function parseImageCatalog(raw: string): { entries: ImageCatalogEntry[]; error: string } {
  if (!raw.trim()) return { entries: [], error: '' }
  let parsed: unknown
  try { parsed = JSON.parse(raw) as unknown } catch { return { entries: [], error: '붙여넣은 결과가 올바른 JSON이 아닙니다.' } }
  const rows = Array.isArray(parsed) ? parsed : isJsonRecord(parsed) && Array.isArray(parsed.data) ? parsed.data : null
  if (!rows) return { entries: [], error: 'JSON 배열 또는 OCI 응답의 data 배열이 필요합니다.' }
  const entries = rows.flatMap(row => {
    if (!isJsonRecord(row)) return []
    const id = String(row.id ?? '')
    if (!id.startsWith('ocid1.image.')) return []
    const compatibleShapes = row.compatibleShapes ?? row['compatible-shapes']
    return [{
      id,
      name: String(row.name ?? row['display-name'] ?? id),
      operatingSystem: String(row.operatingSystem ?? row.os ?? row['operating-system'] ?? '기타/Custom'),
      operatingSystemVersion: String(row.operatingSystemVersion ?? row.version ?? row['operating-system-version'] ?? '-'),
      lifecycleState: String(row.lifecycleState ?? row.state ?? row['lifecycle-state'] ?? ''),
      timeCreated: String(row.timeCreated ?? row['time-created'] ?? ''),
      compatibleShapes: Array.isArray(compatibleShapes) ? compatibleShapes.map(String) : [],
    }]
  })
  if (!entries.length) return { entries: [], error: 'image OCID가 포함된 항목을 찾지 못했습니다.' }
  return { entries, error: '' }
}

const shapeVendor = (description: string, shape = ''): ShapeVendor => {
  const searchable = `${description} ${shape}`.toLowerCase()
  if (searchable.includes('amd') || searchable.includes('epyc')) return 'AMD'
  if (searchable.includes('intel') || searchable.includes('xeon')) return 'Intel'
  if (searchable.includes('ampere') || searchable.includes('altra') || /\.a\d+\./i.test(shape)) return 'Ampere'
  return 'Other'
}

function normalizeShapeCatalog(rows: unknown[]): ShapeCatalogEntry[] {
  return rows.flatMap(row => {
    if (!isJsonRecord(row)) return []
    const shape = String(row.shape ?? row.name ?? '')
    if (!shape) return []
    const processorDescription = String(row.processorDescription ?? row['processor-description'] ?? '')
    const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
    const baselines = row.baselineOcpuUtilizations ?? row['baseline-ocpu-utilizations']
    return [{
      shape,
      vendor: ['AMD', 'Intel', 'Ampere', 'Other'].includes(String(row.vendor))
        ? String(row.vendor) as ShapeVendor
        : shapeVendor(processorDescription, shape),
      processorDescription,
      ocpus: numberOrNull(row.ocpus),
      memoryInGBs: numberOrNull(row.memoryInGBs ?? row['memory-in-gbs']),
      isFlexible: Boolean(row.isFlexible ?? row['is-flexible']),
      baselineOcpuUtilizations: Array.isArray(baselines) ? baselines.map(String) : [],
      gpuDescription: String(row.gpuDescription ?? row['gpu-description'] ?? ''),
      billingType: String(row.billingType ?? row['billing-type'] ?? ''),
      networkingBandwidthInGbps: numberOrNull(row.networkingBandwidthInGbps ?? row['networking-bandwidth-in-gbps']),
    }]
  })
}

function parseShapeCatalog(raw: string): { entries: ShapeCatalogEntry[]; error: string } {
  if (!raw.trim()) return { entries: [], error: '' }
  let parsed: unknown
  try { parsed = JSON.parse(raw) as unknown } catch { return { entries: [], error: 'Shape 결과가 올바른 JSON이 아닙니다.' } }
  const rows = Array.isArray(parsed) ? parsed : isJsonRecord(parsed) && Array.isArray(parsed.data) ? parsed.data : null
  if (!rows) return { entries: [], error: 'Shape JSON 배열 또는 OCI 응답의 data 배열이 필요합니다.' }
  const entries = normalizeShapeCatalog(rows)
  return entries.length ? { entries, error: '' } : { entries: [], error: '선택 가능한 Shape 항목을 찾지 못했습니다.' }
}

function parseInstanceLaunchPreflight(raw: string): { bundle?: InstanceLaunchPreflightBundle; error: string } {
  if (!raw.trim()) return { error: '' }
  const marked = raw.match(/-----BEGIN OCI INSTANCE PREFLIGHT JSON-----\s*([\s\S]*?)\s*-----END OCI INSTANCE PREFLIGHT JSON-----/)
  const json = marked?.[1] ?? raw.trim()
  let parsed: unknown
  try { parsed = JSON.parse(json) as unknown } catch { return { error: '사전조회 결과에서 올바른 JSON을 찾지 못했습니다.' } }
  if (!isJsonRecord(parsed) || parsed.schema !== 'oci-instance-launch-preflight/v2') {
    return { error: '지원하지 않는 사전조회 형식입니다. 화면의 최신 조회 명령을 다시 실행하세요.' }
  }
  const context = isJsonRecord(parsed.context) ? parsed.context : null
  const shapes = Array.isArray(parsed.shapes) ? normalizeShapeCatalog(parsed.shapes) : []
  const images = Array.isArray(parsed.images) ? parseImageCatalog(JSON.stringify(parsed.images)).entries : []
  if (!context || !String(context.compartmentId ?? '').match(/^ocid1\.(compartment|tenancy)\./)
    || !String(context.availabilityDomain ?? '') || !shapes.length) {
    return { error: '사전조회 결과에 컴파트먼트, Availability Domain 또는 Shape 목록이 빠졌습니다.' }
  }
  if (!images.length || images.every(image => !image.compatibleShapes.length)) {
    return { error: 'Shape별 호환 관계가 포함된 AVAILABLE 이미지 목록을 찾지 못했습니다.' }
  }
  return {
    bundle: {
      schema: 'oci-instance-launch-preflight/v2',
      generatedAt: String(parsed.generatedAt ?? ''),
      context: {
        profile: String(context.profile ?? ''),
        region: String(context.region ?? ''),
        compartmentInput: String(context.compartmentInput ?? ''),
        compartmentId: String(context.compartmentId ?? ''),
        availabilityDomain: String(context.availabilityDomain ?? ''),
      },
      shapes,
      images,
    },
    error: '',
  }
}

function buildMultiSelectQuery(value: string): string {
  const fields = value.split('\n').map(item => item.trim()).filter(Boolean)
  if (fields.length <= 1) return fields[0] ?? ''
  const entries = fields.map(expression => {
    const match = expression.match(/^data\.(?:"([^"]+)"|([A-Za-z0-9_-]+))$/)
    if (!match) return null
    const field = match[1] ?? match[2]
    const alias = field.split('-').filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
    const selector = match[1] ? `"${field}"` : field
    return `${alias}:${selector}`
  })
  return entries.every(Boolean) ? `data.{${entries.join(',')}}` : fields[0]
}

interface Favorite {
  id: string; name: string; resource: string; values: Record<string, string>
  context?: Record<string, string>
  dyn?: Record<string, boolean>; operation?: CrudVerb; action?: string
}
const FAV_KEY = 'hub-cli-favorites'
const loadFavs = (): Favorite[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }
const saveFavs = (f: Favorite[]) => localStorage.setItem(FAV_KEY, JSON.stringify(f))
interface RecentOfficialCommand { path: string; label: string; openedAt: string }
const RECENT_KEY = 'hub-cli-recent-official'
const loadRecentOfficialCommands = (): RecentOfficialCommand[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
const saveRecentOfficialCommands = (commands: RecentOfficialCommand[]) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(commands)) } catch { /* local preference unavailable */ }
}
const curatedTargetKey = (target: CuratedCliTarget) => target.action
  ? `${target.resource}:action:${target.action}`
  : `${target.resource}:${target.operation ?? 'command'}`
type CliSidebarSide = 'left' | 'right'
const CLI_SIDEBAR_WIDTH = {
  left: { key: 'hub-cli-sidebar-left-width', min: 150, max: 360, fallback: 220 },
  right: { key: 'hub-cli-sidebar-right-width', min: 200, max: 440, fallback: 280 },
} as const
const clampCliSidebarWidth = (side: CliSidebarSide, width: number) => {
  const { min, max } = CLI_SIDEBAR_WIDTH[side]
  return Math.min(max, Math.max(min, Math.round(width)))
}
const loadCliSidebarWidth = (side: CliSidebarSide) => {
  try {
    const stored = Number(localStorage.getItem(CLI_SIDEBAR_WIDTH[side].key))
    return Number.isFinite(stored) && stored > 0
      ? clampCliSidebarWidth(side, stored)
      : CLI_SIDEBAR_WIDTH[side].fallback
  } catch { return CLI_SIDEBAR_WIDTH[side].fallback }
}
const saveCliSidebarWidth = (side: CliSidebarSide, width: number) => {
  try { localStorage.setItem(CLI_SIDEBAR_WIDTH[side].key, String(width)) } catch { /* local preference unavailable */ }
}

const isDynamic = (dyn: Record<string, boolean>, name: string, available = name in DYNAMIC) =>
  available ? (dyn[name] ?? true) : false

const formatCliCommand = (command: string, args: string[]) => [command, ...args.map(argument => `  ${argument}`)].join(' \\\n')
const withoutContext = (args: string[], ...names: string[]) => args
  .filter(argument => !names.some(name => argument === name || argument.startsWith(`${name} `)))

/* cross-tenancy 볼륨 복사 — 여러 원본 OCID 를 for 루프로 복사하고 원본 display name 을 유지.
   get(원본 이름) → create(대상 테넌시로 복사) → update(복사본 이름=원본). Admit/Endorse policy 전제. */
function buildCrossCopy(kind: string, values: Record<string, string>, requestContext: string[] = []): string {
  const boot = kind === 'boot-volume'
  const srcOpt = boot ? '--source-boot-volume-id' : '--source-volume-id'
  const idOpt = boot ? '--boot-volume-id' : '--volume-id'
  const resCmd = boot ? 'bv boot-volume' : 'bv volume'
  const v = (k: string, dflt: string) => (values[k] || '').trim() || dflt
  const CONT = ' \\'                                  // 줄 끝 백슬래시(명령 이어짐)

  const profile = v('--profile', 'DEFAULT')
  const region = v('--region', '')
  const comp = v('--compartment-id', '<dest-compartment-ocid>')
  const srcProfile = v('--source-profile', '<source-profile>')
  const srcTenancy = v('--source-tenancy-id', '<source-tenancy-ocid>')
  const targetGroupName = v('--target-group-name', '<target-group-name>')
  const targetGroupId = v('--target-group-id', '<target-group-ocid>')
  const destTenancy = v('--dest-tenancy-id', '<dest-tenancy-ocid>')
  const pname = v('--policy-name', 'cross-tenancy-volume')
  const requestExtras = withoutContext(requestContext, '--profile', '--region')
  const targetContext = [`--profile "$PROFILE"`, ...(region ? [`--region "$REGION"`] : []), ...requestExtras].join(' ')
  const sourceContext = [`--profile "$SRC_PROFILE"`, ...(region ? [`--region "$REGION"`] : []), ...requestExtras].join(' ')

  const srcs = (values[srcOpt] || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
  const list = srcs.length ? srcs : ['<source-ocid-1>', '<source-ocid-2>']

  // 원본 조회(Get) + 대상 생성(Create) 을 볼륨·부트볼륨 양쪽에 허용
  const ops = [
    "request.operation='GetVolume'", "request.operation='CreateVolume'",
    "request.operation='GetBootVolume'", "request.operation='CreateBootVolume'",
  ].join(', ')

  return [
    '#############################################',
    '# 0) 공통 변수',
    '#############################################',
    `SRC_PROFILE=${srcProfile}      # 원본(주는) 테넌시 프로파일`,
    `SRC_TENANCY=${srcTenancy}`,
    `PROFILE=${profile}             # 대상(받는) 테넌시 프로파일`,
    `DEST_TENANCY=${destTenancy}`,
    `TARGET_GROUP_NAME=${targetGroupName}`,
    `TARGET_GROUP_ID=${targetGroupId}`,
    `REGION=${region}`,
    `COMPARTMENT=${comp}            # 대상 compartment`,
    '',
    '#############################################',
    '# 1) 대상 테넌시 — Endorse policy (최초 1회)',
    '#############################################',
    "cat > /tmp/endorse-stmts.json <<'EOF'",
    '[',
    `  "Define tenancy SourceTenancy as ${srcTenancy}",`,
    `  "Endorse group ${targetGroupName} to use volumes in tenancy SourceTenancy where ANY { ${ops} }"`,
    ']',
    'EOF',
    '',
    'oci iam policy create' + CONT,
    '  --compartment-id "$DEST_TENANCY"' + CONT,
    `  --name ${pname}-endorse` + CONT,
    '  --description "cross-tenancy volume copy - endorse"' + CONT,
    '  --statements file:///tmp/endorse-stmts.json' + CONT,
    `  ${targetContext}`,
    '',
    '#############################################',
    '# 2) 원본 테넌시 — Admit policy (최초 1회)',
    '#############################################',
    "cat > /tmp/admit-stmts.json <<'EOF'",
    '[',
    `  "Define tenancy TargetTenancy as ${destTenancy}",`,
    `  "Define group TargetGroup as ${targetGroupId}",`,
    `  "Admit group TargetGroup of tenancy TargetTenancy to use volumes in tenancy where ANY { ${ops} }"`,
    ']',
    'EOF',
    '',
    'oci iam policy create' + CONT,
    '  --compartment-id "$SRC_TENANCY"' + CONT,
    `  --name ${pname}-admit` + CONT,
    '  --description "cross-tenancy volume copy - admit"' + CONT,
    '  --statements file:///tmp/admit-stmts.json' + CONT,
    `  ${sourceContext}`,
    '',
    '# policy 전파에 수 분 걸릴 수 있다 — 3) 에서 NotAuthorized 면 잠시 후 재시도',
    '',
    '#############################################',
    `# 3) ${boot ? 'Boot Volume' : 'Block Volume'} 복사 (원본 이름 유지)`,
    '#############################################',
    'SOURCES=(',
    ...list.map(s => `  ${s}`),
    ')',
    '',
    'for SRC in "${SOURCES[@]}"; do',
    '  # 3-1) 원본 display name 조회 (Endorse/Admit 의 Get 권한 사용)',
    `  NAME=$(oci ${resCmd} get ${idOpt} "$SRC" ${targetContext}` + CONT,
    `    --query 'data."display-name"' --raw-output)`,
    '  # 3-2) 대상 테넌시로 복사',
    `  NEW=$(oci ${resCmd} create ${targetContext}` + CONT,
    `    ${srcOpt} "$SRC" --compartment-id "$COMPARTMENT"` + CONT,
    `    --wait-for-state AVAILABLE --query 'data.id' --raw-output)`,
    '  # 3-3) 복사본 이름을 원본과 동일하게',
    `  oci ${resCmd} update ${idOpt} "$NEW" --display-name "$NAME"` + CONT,
    `    ${targetContext}`,
    '  echo "copied $SRC -> $NEW ($NAME)"',
    'done',
  ].join('\n')
}

/* 인스턴스 유지보수 재부팅 예정 시각 — 선택한 GET 또는 UPDATE 명령 생성 */
function buildMaintenanceReboot(
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  operation: 'get' | 'update',
  requestContext: string[] = [],
): string {
  const v = (key: string, fallback: string) => (values[key] || '').trim() || fallback
  const dynamicInstance = isDynamic(dyn, '--instance-id', true)
  const instanceInput = v('--instance-id', dynamicInstance ? '<instance-name>' : '<instance-ocid>')
  const compartmentInput = v('--lookup-compartment-id', '<compartment-name-or-ocid>')
  const rebootDue = v('--time-maintenance-reboot-due', '<YYYY-MM-DDTHH:mm:ssZ>')
  const prelude = dynamicInstance ? [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'command -v jq >/dev/null 2>&1 || { echo "[ERROR] 동적 조회에는 jq가 필요합니다." >&2; exit 2; }',
    `INSTANCE_NAME=${quoteCliValue(instanceInput, true)}`,
    `COMPARTMENT_INPUT=${quoteCliValue(compartmentInput, true)}`,
    `CTX=(${requestContext.join(' ')})`,
    'TENANCY_ID=$(oci iam availability-domain list --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
    '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 프로필에서 tenancy OCID를 확인하지 못했습니다." >&2; exit 2; }',
    'if [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* || "$COMPARTMENT_INPUT" == ocid1.tenancy.* ]]; then',
    '  COMPARTMENT_ID="$COMPARTMENT_INPUT"',
    'elif [[ "${COMPARTMENT_INPUT^^}" == "ROOT" ]]; then',
    '  COMPARTMENT_ID="$TENANCY_ID"',
    'else',
    '  COMPARTMENT_COUNT=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query \'length(data)\' --raw-output "${CTX[@]}")',
    '  if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
    '    echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2',
    '    oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query \'data[].{name:name,state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
    '    exit 1',
    '  fi',
    '  COMPARTMENT_ID=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query \'data[0].id\' --raw-output "${CTX[@]}")',
    'fi',
    'INSTANCE_JSON=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --all --output json "${CTX[@]}")',
    'INSTANCE_COUNT=$(jq -r --arg NAME "$INSTANCE_NAME" \'[.data[]? | select(."display-name" == $NAME)] | length\' <<<"$INSTANCE_JSON")',
    'if [[ "$INSTANCE_COUNT" != "1" ]]; then',
    '  echo "[ERROR] Instance 이름은 조회 범위에서 정확히 1개여야 합니다: $INSTANCE_NAME (found=$INSTANCE_COUNT)" >&2',
    '  jq -r \'.data[]? | [(."display-name" // "-"), (."lifecycle-state" // "-"), (.id // "-")] | @tsv\' <<<"$INSTANCE_JSON" | column -t -s $\'\\t\' >&2 || true',
    '  exit 1',
    'fi',
    'INSTANCE_ID=$(jq -r --arg NAME "$INSTANCE_NAME" \'[.data[]? | select(."display-name" == $NAME)][0].id // empty\' <<<"$INSTANCE_JSON")',
    '[[ "$INSTANCE_ID" == ocid1.instance.* ]] || { echo "[ERROR] Instance OCID 변환에 실패했습니다." >&2; exit 2; }',
  ] : []
  const instanceId = dynamicInstance ? '"$INSTANCE_ID"' : quoteCliValue(instanceInput, true)

  if (operation === 'get') {
    return [
      ...prelude,
      ...(prelude.length ? [''] : []),
      '# 유지보수 재부팅을 연장할 수 있는 최대 시각 조회',
      formatCliCommand('oci compute instance-maintenance-reboot get', [
        `--instance-id ${instanceId}`,
        ...(dynamicInstance ? ['"${CTX[@]}"'] : requestContext),
        `--query 'data."time-maintenance-reboot-due-max"'`,
        '--raw-output',
      ]),
    ].join('\n')
  }

  return [
    ...prelude,
    ...(prelude.length ? [''] : []),
    '# 인스턴스 유지보수 재부팅 달력 업데이트',
    formatCliCommand('oci compute instance update', [
      `--instance-id ${instanceId}`,
      `--time-maintenance-reboot-due "${rebootDue}"`,
      ...(dynamicInstance ? ['"${CTX[@]}"'] : requestContext),
      '--force',
    ]),
  ].join('\n')
}

/* 최종 명령 조립 — 동적 옵션은 변수 선언(prelude) + 참조로 */
/* Resolve exact resource names safely, then create and verify one manual backup. */
function buildManualBackup(kind: 'instance-boot-volume' | 'mysql', values: Record<string, string>, requestContext: string[] = []): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  const common = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `COMPARTMENT_NAME=${q(v('--compartment-name', '<compartment-name>'))}`,
    `CTX=(${requestContext.join(' ')})`,
    '',
    '# 이름이 중복되면 임의의 첫 번째 OCID를 사용하지 않고 안전하게 중단합니다.',
    'COMPARTMENT_COUNT=$(oci iam compartment list \\',
    '  --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE \\',
    '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
    '  --query \'length(data)\' --raw-output "${CTX[@]}")',
    'if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
    '  echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_NAME (found=$COMPARTMENT_COUNT)" >&2',
    '  oci iam compartment list --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
    '    --query \'data[].{name:name,id:id,parent:"compartment-id"}\' --output table "${CTX[@]}" >&2',
    '  exit 1',
    'fi',
    'COMPARTMENT_ID=$(oci iam compartment list \\',
    '  --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
    '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
    '',
  ]

  if (kind === 'instance-boot-volume') {
    return [
      ...common,
      `INSTANCE_NAME=${q(v('--instance-name', '<instance-name>'))}`,
      `BACKUP_DISPLAY_NAME_INPUT=${q(v('--backup-display-name'))}`,
      `BACKUP_TYPE=${q(v('--backup-type', 'FULL').toUpperCase())}`,
      `MAX_WAIT_SECONDS=${q(v('--max-wait-seconds', '3600'))}`,
      '',
      '[[ "$BACKUP_TYPE" == "FULL" || "$BACKUP_TYPE" == "INCREMENTAL" ]] || { echo "[ERROR] backup type은 FULL 또는 INCREMENTAL이어야 합니다." >&2; exit 2; }',
      '[[ "$MAX_WAIT_SECONDS" =~ ^[0-9]+$ ]] || { echo "[ERROR] max wait seconds는 숫자여야 합니다." >&2; exit 2; }',
      '',
      'INSTANCE_COUNT=$(oci compute instance list \\',
      '  --compartment-id "$COMPARTMENT_ID" --display-name "$INSTANCE_NAME" --all \\',
      '  --query \'length(data[?"lifecycle-state" != `TERMINATED`])\' --raw-output "${CTX[@]}")',
      'if [[ "$INSTANCE_COUNT" != "1" ]]; then',
      '  echo "[ERROR] 종료되지 않은 instance 이름은 정확히 1개여야 합니다: $INSTANCE_NAME (found=$INSTANCE_COUNT)" >&2',
      '  oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "$INSTANCE_NAME" --all \\',
      '    --query \'data[].{name:"display-name",state:"lifecycle-state",ad:"availability-domain",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'INSTANCE_ID=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "$INSTANCE_NAME" --all \\',
      '  --query \'data[?"lifecycle-state" != `TERMINATED`] | [0].id\' --raw-output "${CTX[@]}")',
      'INSTANCE_AD=$(oci compute instance get --instance-id "$INSTANCE_ID" --query \'data."availability-domain"\' --raw-output "${CTX[@]}")',
      '',
      'ATTACHMENT_COUNT=$(oci compute boot-volume-attachment list \\',
      '  --availability-domain "$INSTANCE_AD" --compartment-id "$COMPARTMENT_ID" --instance-id "$INSTANCE_ID" --all \\',
      '  --query \'length(data[?"lifecycle-state" == `ATTACHED`])\' --raw-output "${CTX[@]}")',
      'if [[ "$ATTACHMENT_COUNT" != "1" ]]; then',
      '  echo "[ERROR] ATTACHED boot volume 연결은 정확히 1개여야 합니다. (found=$ATTACHMENT_COUNT)" >&2',
      '  oci compute boot-volume-attachment list --availability-domain "$INSTANCE_AD" --compartment-id "$COMPARTMENT_ID" --instance-id "$INSTANCE_ID" --all \\',
      '    --query \'data[].{state:"lifecycle-state",bootVolumeId:"boot-volume-id",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'BOOT_VOLUME_ID=$(oci compute boot-volume-attachment list \\',
      '  --availability-domain "$INSTANCE_AD" --compartment-id "$COMPARTMENT_ID" --instance-id "$INSTANCE_ID" --all \\',
      '  --query \'data[?"lifecycle-state" == `ATTACHED`] | [0]."boot-volume-id"\' --raw-output "${CTX[@]}")',
      'BACKUP_DISPLAY_NAME="${BACKUP_DISPLAY_NAME_INPUT:-${INSTANCE_NAME}-boot-manual-$(date -u +%Y%m%d-%H%M%S)}"',
      '',
      'echo "[RESOLVED] compartment=$COMPARTMENT_ID"',
      'echo "[RESOLVED] instance=$INSTANCE_ID / AD=$INSTANCE_AD"',
      'echo "[RESOLVED] boot-volume=$BOOT_VOLUME_ID"',
      'BOOT_BACKUP_ID=$(oci bv boot-volume-backup create \\',
      '  --boot-volume-id "$BOOT_VOLUME_ID" --display-name "$BACKUP_DISPLAY_NAME" --type "$BACKUP_TYPE" \\',
      '  --wait-for-state AVAILABLE --max-wait-seconds "$MAX_WAIT_SECONDS" \\',
      '  --query \'data.id\' --raw-output "${CTX[@]}")',
      '',
      'echo "[CREATED] boot-volume-backup=$BOOT_BACKUP_ID"',
      'oci bv boot-volume-backup get --boot-volume-backup-id "$BOOT_BACKUP_ID" \\',
      '  --query \'data.{name:"display-name",type:type,state:"lifecycle-state",created:"time-created",id:id}\' --output table "${CTX[@]}"',
    ].join('\n')
  }

  return [
    ...common,
    `DB_SYSTEM_NAME=${q(v('--db-system-name', '<mysql-db-system-name>'))}`,
    `BACKUP_DISPLAY_NAME_INPUT=${q(v('--backup-display-name'))}`,
    `BACKUP_TYPE=${q(v('--backup-type', 'FULL').toUpperCase())}`,
    `RETENTION_DAYS=${q(v('--retention-in-days', '7'))}`,
    `SOFT_DELETE=${q(v('--soft-delete', 'ENABLED').toUpperCase())}`,
    `DESCRIPTION=${q(v('--description'))}`,
    `MAX_WAIT_SECONDS=${q(v('--max-wait-seconds', '7200'))}`,
    '',
    '[[ "$BACKUP_TYPE" == "FULL" || "$BACKUP_TYPE" == "INCREMENTAL" ]] || { echo "[ERROR] backup type은 FULL 또는 INCREMENTAL이어야 합니다." >&2; exit 2; }',
    '[[ "$SOFT_DELETE" == "ENABLED" || "$SOFT_DELETE" == "DISABLED" ]] || { echo "[ERROR] soft delete는 ENABLED 또는 DISABLED여야 합니다." >&2; exit 2; }',
    '[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "[ERROR] retention days는 숫자여야 합니다." >&2; exit 2; }',
    '[[ "$MAX_WAIT_SECONDS" =~ ^[0-9]+$ ]] || { echo "[ERROR] max wait seconds는 숫자여야 합니다." >&2; exit 2; }',
    '',
    'DB_SYSTEM_COUNT=$(oci mysql db-system list \\',
    '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --lifecycle-state ACTIVE --all \\',
    '  --query \'length(data)\' --raw-output "${CTX[@]}")',
    'if [[ "$DB_SYSTEM_COUNT" != "1" ]]; then',
    '  echo "[ERROR] ACTIVE MySQL DB System 이름은 정확히 1개여야 합니다: $DB_SYSTEM_NAME (found=$DB_SYSTEM_COUNT)" >&2',
    '  oci mysql db-system list --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --all \\',
    '    --query \'data[].{name:"display-name",state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
    '  exit 1',
    'fi',
    'DB_SYSTEM_ID=$(oci mysql db-system list \\',
    '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --lifecycle-state ACTIVE --all \\',
    '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
    'BACKUP_DISPLAY_NAME="${BACKUP_DISPLAY_NAME_INPUT:-${DB_SYSTEM_NAME}-manual-$(date -u +%Y%m%d-%H%M%S)}"',
    'DESCRIPTION_ARGS=()',
    '[[ -n "$DESCRIPTION" ]] && DESCRIPTION_ARGS=(--description "$DESCRIPTION")',
    '',
    'echo "[RESOLVED] compartment=$COMPARTMENT_ID"',
    'echo "[RESOLVED] mysql-db-system=$DB_SYSTEM_ID"',
    'MYSQL_BACKUP_ID=$(oci mysql backup create \\',
    '  --db-system-id "$DB_SYSTEM_ID" --display-name "$BACKUP_DISPLAY_NAME" --backup-type "$BACKUP_TYPE" \\',
    '  --retention-in-days "$RETENTION_DAYS" --soft-delete "$SOFT_DELETE" "${DESCRIPTION_ARGS[@]}" \\',
    '  --wait-for-state SUCCEEDED --max-wait-seconds "$MAX_WAIT_SECONDS" \\',
    '  --query \'data.id\' --raw-output "${CTX[@]}")',
    '',
    'echo "[CREATED] mysql-backup=$MYSQL_BACKUP_ID"',
    'oci mysql backup get --backup-id "$MYSQL_BACKUP_ID" \\',
    '  --query \'data.{name:"display-name",type:"backup-type",state:"lifecycle-state",retentionDays:"retention-in-days",created:"time-created",id:id}\' --output table "${CTX[@]}"',
  ].join('\n')
}

/* MySQL Backup CREATE는 정상 Backup 리소스 안에서 DB System 이름 조회만 보조합니다. */
function buildMysqlBackupCreate(
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  requestContext: string[] = [],
  responseContext: string[] = [],
): string {
  const v = (key: string) => (values[key] || '').trim()
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  const dynamicDbSystem = isDynamic(dyn, '--db-system-id')
  const dynamicCompartment = isDynamic(dyn, '--lookup-compartment-id')
  const contextArgs = requestContext
  const cliCommand = (command: string, args: string[]) => [command, ...args.map(arg => `  ${arg}`)].join(' \\\n')
  const prelude: string[] = []

  if (dynamicDbSystem) {
    prelude.push(
      `DB_SYSTEM_NAME=${q(v('--db-system-id') || '<mysql-db-system-name>')}`,
      `COMPARTMENT_INPUT=${q(v('--lookup-compartment-id') || (dynamicCompartment ? '<compartment-name>' : '<compartment-ocid>'))}`,
      '',
    )
    if (dynamicCompartment) {
      const compartmentArgs = [
        '--name "$COMPARTMENT_INPUT"', '--lifecycle-state ACTIVE',
        '--compartment-id-in-subtree true', '--access-level ACCESSIBLE', '--all',
        "--query 'length(data)'", '--raw-output', ...contextArgs,
      ]
      prelude.push(
        `COMPARTMENT_COUNT=$(${cliCommand('oci iam compartment list', compartmentArgs)})`,
        'if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
        '  echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2',
        `${cliCommand('  oci iam compartment list', [
          '--name "$COMPARTMENT_INPUT"', '--lifecycle-state ACTIVE',
          '--compartment-id-in-subtree true', '--access-level ACCESSIBLE', '--all',
          "--query 'data[].{name:name,id:id,parent:\"compartment-id\"}'", '--output table', ...contextArgs,
        ])} >&2`,
        '  exit 1',
        'fi',
        `COMPARTMENT_ID=$(${cliCommand('oci iam compartment list', [
          '--name "$COMPARTMENT_INPUT"', '--lifecycle-state ACTIVE',
          '--compartment-id-in-subtree true', '--access-level ACCESSIBLE', '--all',
          "--query 'data[0].id'", '--raw-output', ...contextArgs,
        ])})`,
      )
    } else {
      prelude.push('COMPARTMENT_ID="$COMPARTMENT_INPUT"')
    }
    const dbSystemArgs = [
      '--compartment-id "$COMPARTMENT_ID"', '--display-name "$DB_SYSTEM_NAME"',
      '--lifecycle-state ACTIVE', '--all', "--query 'length(data)'", '--raw-output', ...contextArgs,
    ]
    prelude.push(
      '',
      `DB_SYSTEM_COUNT=$(${cliCommand('oci mysql db-system list', dbSystemArgs)})`,
      'if [[ "$DB_SYSTEM_COUNT" != "1" ]]; then',
      '  echo "[ERROR] ACTIVE MySQL DB System 이름은 정확히 1개여야 합니다: $DB_SYSTEM_NAME (found=$DB_SYSTEM_COUNT)" >&2',
      `${cliCommand('  oci mysql db-system list', [
        '--compartment-id "$COMPARTMENT_ID"', '--display-name "$DB_SYSTEM_NAME"', '--all',
        "--query 'data[].{name:\"display-name\",state:\"lifecycle-state\",id:id}'", '--output table', ...contextArgs,
      ])} >&2`,
      '  exit 1',
      'fi',
      `DB_SYSTEM_ID=$(${cliCommand('oci mysql db-system list', [
        '--compartment-id "$COMPARTMENT_ID"', '--display-name "$DB_SYSTEM_NAME"',
        '--lifecycle-state ACTIVE', '--all', "--query 'data[0].id'", '--raw-output', ...contextArgs,
      ])})`,
    )
  }

  const createArgs = [
    `--db-system-id ${dynamicDbSystem ? '"$DB_SYSTEM_ID"' : q(v('--db-system-id') || '<mysql-db-system-ocid>')}`,
  ]
  for (const option of [
    '--display-name', '--description', '--backup-type', '--retention-in-days', '--soft-delete',
    '--freeform-tags', '--defined-tags', '--wait-for-state', '--max-wait-seconds', '--wait-interval-seconds',
  ]) {
    if (v(option)) createArgs.push(`${option} ${q(v(option))}`)
  }
  createArgs.push(...contextArgs, ...responseContext)
  const createCommand = cliCommand('oci mysql backup create', createArgs)
  return prelude.length ? `${prelude.join('\n')}\n\n${createCommand}` : createCommand
}

/* MySQL DB System GET의 필수 인자는 그대로 --db-system-id 하나이며,
   동적 모드에서만 compartment + display name을 OCID로 안전하게 해석합니다. */
function buildMysqlDbSystemGet(
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  requestContext: string[] = [],
  responseContext: string[] = [],
): string {
  const v = (key: string) => (values[key] || '').trim()
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  const dynamicDbSystem = isDynamic(dyn, '--db-system-id')
  const dynamicCompartment = isDynamic(dyn, '--lookup-compartment-id')
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `CTX=(${requestContext.join(' ')})`,
    `RESULT_CTX=(${responseContext.join(' ')})`,
    '',
  ]

  if (dynamicDbSystem) {
    lines.push(
      `DB_SYSTEM_NAME=${q(v('--db-system-id') || '<mysql-db-system-name>')}`,
      `COMPARTMENT_INPUT=${q(v('--lookup-compartment-id') || (dynamicCompartment ? '<compartment-name>' : '<compartment-ocid>'))}`,
      '',
    )
    if (dynamicCompartment) {
      lines.push(
        'COMPARTMENT_COUNT=$(oci iam compartment list \\',
        '  --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE \\',
        '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
        '  --query \'length(data)\' --raw-output "${CTX[@]}")',
        'if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
        '  echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2',
        '  oci iam compartment list --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
        '    --query \'data[].{name:name,id:id,parent:"compartment-id"}\' --output table "${CTX[@]}" >&2',
        '  exit 1',
        'fi',
        'COMPARTMENT_ID=$(oci iam compartment list \\',
        '  --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE \\',
        '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
        '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
      )
    } else {
      lines.push('COMPARTMENT_ID="$COMPARTMENT_INPUT"')
    }
    lines.push(
      '',
      'DB_SYSTEM_COUNT=$(oci mysql db-system list \\',
      '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --all \\',
      '  --query \'length(data[?"lifecycle-state" != `DELETED`])\' --raw-output "${CTX[@]}")',
      'if [[ "$DB_SYSTEM_COUNT" != "1" ]]; then',
      '  echo "[ERROR] 삭제되지 않은 MySQL DB System 이름은 정확히 1개여야 합니다: $DB_SYSTEM_NAME (found=$DB_SYSTEM_COUNT)" >&2',
      '  oci mysql db-system list --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --all \\',
      '    --query \'data[].{name:"display-name",state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'DB_SYSTEM_ID=$(oci mysql db-system list \\',
      '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --all \\',
      '  --query \'data[?"lifecycle-state" != `DELETED`] | [0].id\' --raw-output "${CTX[@]}")',
      '',
      'echo "[RESOLVED] compartment=$COMPARTMENT_ID"',
      'echo "[RESOLVED] mysql-db-system=$DB_SYSTEM_ID"',
    )
  } else {
    lines.push(`DB_SYSTEM_ID=${q(v('--db-system-id') || '<mysql-db-system-ocid>')}`, '')
  }

  lines.push('GET_ARGS=()')
  const ifNoneMatch = v('--if-none-match')
  lines.push(`IF_NONE_MATCH=${q(ifNoneMatch)}`, '[[ -n "$IF_NONE_MATCH" ]] && GET_ARGS+=(--if-none-match "$IF_NONE_MATCH")')
  lines.push(
    '',
    'oci mysql db-system get \\',
    '  --db-system-id "$DB_SYSTEM_ID" "${GET_ARGS[@]}" "${CTX[@]}" "${RESULT_CTX[@]}"',
  )
  return lines.join('\n')
}

/* Build a safety-gated Bash cleanup script for one exact compartment. */
/* MSP 모니터링 일괄등록 — Topic(재사용) → Email 구독 → 표준 알람 15개를 compartment 서브트리 전체에.
   compartment 이름 비우면 root(테넌시 전체). 메트릭은 공식 레퍼런스 검증분(2026-07). */
const WIZBASE_ALARMS = [
  'compute-cpu-90|oci_computeagent|CRITICAL|PT5M|CpuUtilization[1m].mean() > 90',
  'compute-mem-90|oci_computeagent|WARNING|PT5M|MemoryUtilization[1m].mean() > 90',
  'basedb-cpu-85|oci_database|CRITICAL|PT5M|CpuUtilization[1m].mean() > 85',
  'basedb-storage-85|oci_database|WARNING|PT5M|StorageUtilization[1m].mean() > 85',
  'basedb-down-absence|oci_database|CRITICAL|PT5M|CpuUtilization[5m].absent()',
  'adb-cpu-85|oci_autonomous_database|WARNING|PT5M|CpuUtilization[1m].mean() > 85',
  'adb-storage-85|oci_autonomous_database|WARNING|PT5M|StorageUtilization[1m].mean() > 85',
  'lb-unhealthy-backend|oci_lbaas|CRITICAL|PT5M|unhealthyBackendServers[1m].mean() > 0',
  'nlb-unhealthy-backend|oci_nlb|CRITICAL|PT5M|UnhealthyBackendsPerNlb[1m].mean() > 0',
  'blockvol-throttled-io|oci_blockstore|WARNING|PT5M|VolumeThrottledIOs[1m].mean() > 0',
  'vpn-tunnel-down|oci_vpn|CRITICAL|PT5M|TunnelState[1m].mean() < 1',
  'fastconnect-down|oci_fastconnect|CRITICAL|PT5M|ConnectionState[1m].mean() < 1',
  'natgw-sessions-high|oci_nat_gateway|WARNING|PT5M|ConnectionsEstablished[5m].sum() > 50000',
  'mysql-cpu-90|oci_mysql_database|CRITICAL|PT5M|CPUUtilization[1m].mean() > 90',
  'mysql-storage-85|oci_mysql_database|WARNING|PT5M|DbVolumeUtilization[1m].mean() > 85',
]
function buildWizbaseMonitoring(values: Record<string, string>, requestContext: string[] = []): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const q = (raw: string) => `'${raw.replaceAll("'", `'\\''`)}'`
  const emails = (values['--emails'] || '').split(/\r?\n/).map(e => e.trim()).filter(Boolean)
  const topicName = v('--topic-name', 'MSP_Alarm_Topic')
  return [
    '#!/usr/bin/env bash',
    '# MSP 모니터링 일괄 등록 — Topic → Email 구독 → 표준 알람 15',
    '# 위→아래 순서로 실행됩니다. Topic 은 이름으로 재사용(idempotent), 구독은 각 수신함 확인 링크 클릭 후 활성화됩니다.',
    'set -uo pipefail',
    '',
    `TOPIC_NAME=${q(topicName)}`,
    `COMPARTMENT_NAME=${q(v('--compartment-name'))}   # 비우면 root(테넌시 전체)`,
    `EMAILS=(${emails.map(q).join(' ')})`,
    `CTX=(${requestContext.join(' ')})`,
    '',
    '# compartment 해석 — 비우면 root(테넌시), 이름이면 tenancy 전체에서 ACTIVE 정확히 1개를 OCID 로 변환',
    `C=$(oci iam availability-domain list --query 'data[0]."compartment-id"' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    'if [ -n "$COMPARTMENT_NAME" ]; then',
    `  CNT=$(oci iam compartment list --compartment-id "$C" --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query 'length(data)' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    '  if [ "$CNT" != "1" ]; then echo "[ABORT] ACTIVE compartment 이름은 tenancy 전체에서 정확히 1개여야 합니다: $COMPARTMENT_NAME (found=$CNT)" >&2; exit 1; fi',
    `  C=$(oci iam compartment list --compartment-id "$C" --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query 'data[0].id' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    'fi',
    'echo "COMPARTMENT=$C"',
    '',
    '# 1) Notification Topic (이름으로 재사용, 없으면 생성)',
    `TOPIC=$(oci ons topic list -c "$C" --name "$TOPIC_NAME" --query 'data[0]."topic-id"' --raw-output "\${CTX[@]}" 2>/dev/null | tr -d '\\r')`,
    'if [ -z "$TOPIC" ] || [ "$TOPIC" = "null" ]; then',
    `  TOPIC=$(oci ons topic create -c "$C" --name "$TOPIC_NAME" --query 'data."topic-id"' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    'fi',
    'echo "TOPIC=$TOPIC"',
    '',
    '# 2) Email 구독 (각 수신함의 확인 링크를 눌러야 PENDING→ACTIVE)',
    'for EM in "${EMAILS[@]}"; do',
    '  oci ons subscription create -c "$C" --topic-id "$TOPIC" --protocol EMAIL --subscription-endpoint "$EM" "${CTX[@]}"',
    'done',
    '',
    '# 3) 표준 알람 15 — 전부 위 Topic 으로 발송, 서브트리 전체 감시(--metric-compartment-id-in-subtree true)',
    `printf '["%s"]' "$TOPIC" > dest.json`,
    'ALARMS=(',
    ...WIZBASE_ALARMS.map(row => `  ${q(row)}`),
    ')',
    'for row in "${ALARMS[@]}"; do',
    `  IFS='|' read -r NAME NS SEV PEND QT <<< "$row"`,
    '  oci monitoring alarm create \\',
    '    --compartment-id "$C" --metric-compartment-id "$C" --metric-compartment-id-in-subtree true \\',
    '    --display-name "$NAME" --namespace "$NS" --query-text "$QT" \\',
    '    --severity "$SEV" --pending-duration "$PEND" \\',
    '    --destinations file://dest.json --is-enabled true \\',
    '    --body "$NAME 임계 초과 감지" "${CTX[@]}"',
    'done',
    'rm -f dest.json',
    'echo "[OK] Topic/구독/알람 15 등록 완료 — 이메일 구독은 확인 링크 클릭 필요. database/adb/vpn 메트릭은 리전 런타임에서 재확인 권장."',
  ].join('\n')
}

function buildCompartmentCleanup(values: Record<string, string>, requestContext: string[] = []): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const enabled = (key: string) => values[key] === 'true' ? 'true' : 'false'
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

  return [
    '#!/usr/bin/env bash',
    '# OCI Compartment Resource Cleansing',
    '# 기본값은 PREVIEW입니다. DELETE는 동일한 compartment OCID를 한 번 더 확인합니다.',
    'set -uo pipefail',
    '',
    `COMPARTMENT=${q(v('--compartment-id', '<compartment-ocid>'))}`,
    `MODE=${q(v('--mode', 'PREVIEW').toUpperCase())}`,
    `CONFIRM_COMPARTMENT=${q(v('--confirm-compartment-id'))}`,
    `LA_NAMESPACE=${q(v('--log-analytics-namespace'))}`,
    `CLEAN_COMPUTE=${enabled('--cleanup-compute')}`,
    `CLEAN_LOAD_BALANCERS=${enabled('--cleanup-load-balancers')}`,
    `CLEAN_DATABASES=${enabled('--cleanup-databases')}`,
    `CLEAN_STORAGE=${enabled('--cleanup-storage')}`,
    `CLEAN_STORAGE_BACKUPS=${enabled('--cleanup-storage-backups')}`,
    `CLEAN_DB_BACKUPS=${enabled('--cleanup-db-backups')}`,
    `CLEAN_LOGGING=${enabled('--cleanup-logging')}`,
    `CLEAN_LOG_ANALYTICS=${enabled('--cleanup-log-analytics')}`,
    `CLEAN_NETWORK=${enabled('--cleanup-network')}`,
    `CTX=(${requestContext.join(' ')})`,
    '',
    'if [[ ! "$COMPARTMENT" =~ ^ocid1\\.compartment\\. ]]; then',
    '  echo "[ABORT] --compartment-id에는 컴파트먼트 OCID만 허용됩니다. 테넌시 OCID는 사용할 수 없습니다." >&2',
    '  exit 2',
    'fi',
    'if [[ "$MODE" != "PREVIEW" && "$MODE" != "DELETE" ]]; then',
    '  echo "[ABORT] MODE는 PREVIEW 또는 DELETE여야 합니다." >&2',
    '  exit 2',
    'fi',
    'if [[ "$MODE" == "DELETE" && "$CONFIRM_COMPARTMENT" != "$COMPARTMENT" ]]; then',
    '  echo "[ABORT] 실제 삭제에는 confirm compartment OCID가 대상과 완전히 같아야 합니다." >&2',
    '  exit 2',
    'fi',
    '',
    'print_command() { printf "[PREVIEW]"; printf " %q" "$@"; printf "\\n"; }',
    'run_delete() {',
    '  if [[ "$MODE" == "DELETE" ]]; then',
    '    echo "[DELETE] $*"',
    '    "$@" || echo "[WARN] 삭제 실패/진행 중: $*" >&2',
    '  else',
    '    print_command "$@"',
    '  fi',
    '}',
    'list_ids() {',
    '  "$@" --all --query \'data[].id\' --raw-output 2>/dev/null |',
    '    tr -d \'[],"\' | tr \' \' \'\\n\' | sed \'/^$/d\' || true',
    '}',
    'list_item_ids() {',
    '  "$@" --all --query \'data.items[].id\' --raw-output 2>/dev/null |',
    '    tr -d \'[],"\' | tr \' \' \'\\n\' | sed \'/^$/d\' || true',
    '}',
    'cleanup_ids() {',
    '  local label="$1" id_flag="$2"; shift 2',
    '  local -a list_cmd=() delete_cmd=()',
    '  while [[ "$1" != "::" ]]; do list_cmd+=("$1"); shift; done; shift',
    '  delete_cmd=("$@")',
    '  local id',
    '  while IFS= read -r id; do',
    '    [[ -z "$id" || "$id" == "null" ]] && continue',
    '    echo "[FOUND] $label $id"',
    '    run_delete "${delete_cmd[@]}" "$id_flag" "$id" "${CTX[@]}"',
    '  done < <(list_ids "${list_cmd[@]}" "${CTX[@]}")',
    '}',
    '',
    'echo "=== OCI compartment cleansing: $MODE / $COMPARTMENT / $REGION ==="',
    'echo "=== Search inventory (explicit cleanup 목록 밖의 자원도 확인) ==="',
    'oci search resource structured-search --query-text "query all resources where compartmentId = \'$COMPARTMENT\'" --query \'data.items[].{type:"resource-type",name:"display-name",id:identifier}\' --output table "${CTX[@]}" || echo "[WARN] Search inventory 조회 실패" >&2',
    '',
    'if $CLEAN_LOAD_BALANCERS; then',
    '  cleanup_ids "Load Balancer" --load-balancer-id oci lb load-balancer list --compartment-id "$COMPARTMENT" :: oci lb load-balancer delete --force',
    '  cleanup_ids "Network Load Balancer" --network-load-balancer-id oci nlb network-load-balancer list --compartment-id "$COMPARTMENT" :: oci nlb network-load-balancer delete --force',
    'fi',
    '',
    'if $CLEAN_DATABASES; then',
    '  cleanup_ids "Autonomous Database" --autonomous-database-id oci db autonomous-database list --compartment-id "$COMPARTMENT" :: oci db autonomous-database delete --force',
    '  cleanup_ids "Base DB System" --db-system-id oci db system list --compartment-id "$COMPARTMENT" :: oci db system terminate --force',
    '  cleanup_ids "MySQL DB System" --db-system-id oci mysql db-system list --compartment-id "$COMPARTMENT" :: oci mysql db-system delete --force',
    'fi',
    '',
    'if $CLEAN_COMPUTE; then',
    '  cleanup_ids "Instance Pool" --instance-pool-id oci compute-management instance-pool list --compartment-id "$COMPARTMENT" :: oci compute-management instance-pool terminate --force',
    '  cleanup_ids "Compute Instance" --instance-id oci compute instance list --compartment-id "$COMPARTMENT" :: oci compute instance terminate --preserve-boot-volume false --force',
    '  cleanup_ids "Instance Configuration" --instance-configuration-id oci compute-management instance-configuration list --compartment-id "$COMPARTMENT" :: oci compute-management instance-configuration delete',
    '  cleanup_ids "Custom Image" --image-id oci compute image list --compartment-id "$COMPARTMENT" :: oci compute image delete --force',
    'fi',
    '',
    'if $CLEAN_LOGGING; then',
    '  while IFS= read -r group_id; do',
    '    [[ -z "$group_id" || "$group_id" == "null" ]] && continue',
    '    while IFS= read -r log_id; do',
    '      [[ -z "$log_id" || "$log_id" == "null" ]] && continue',
    '      echo "[FOUND] Log $log_id"',
    '      run_delete oci logging log delete --log-group-id "$group_id" --log-id "$log_id" --force "${CTX[@]}"',
    '    done < <(list_ids oci logging log list --log-group-id "$group_id" "${CTX[@]}")',
    '    echo "[FOUND] Log Group $group_id"',
    '    run_delete oci logging log-group delete --log-group-id "$group_id" --force "${CTX[@]}"',
    '  done < <(list_ids oci logging log-group list --compartment-id "$COMPARTMENT" "${CTX[@]}")',
    'fi',
    '',
    'if $CLEAN_LOG_ANALYTICS; then',
    '  if [[ -z "$LA_NAMESPACE" ]]; then',
    '    echo "[SKIP] Log Analytics: namespace가 비어 있습니다. 테넌시 전체 offboard는 수행하지 않습니다."',
    '  else',
    '    while IFS= read -r entity_id; do',
    '      [[ -z "$entity_id" || "$entity_id" == "null" ]] && continue',
    '      echo "[FOUND] Log Analytics Entity $entity_id"',
    '      run_delete oci log-analytics entity delete --namespace-name "$LA_NAMESPACE" --entity-id "$entity_id" --force "${CTX[@]}"',
    '    done < <(list_item_ids oci log-analytics entity list --namespace-name "$LA_NAMESPACE" --compartment-id "$COMPARTMENT" "${CTX[@]}")',
    '    PURGE_UNTIL=$(date -u +%Y-%m-%dT%H:%M:%SZ)',
    '    run_delete oci log-analytics storage purge-storage-data --namespace-name "$LA_NAMESPACE" --compartment-id "$COMPARTMENT" --compartment-id-in-subtree false --time-data-ended "$PURGE_UNTIL" "${CTX[@]}"',
    '  fi',
    'fi',
    '',
    'if $CLEAN_STORAGE; then',
    '  OS_NAMESPACE=$(oci os ns get "${CTX[@]}" --query data --raw-output 2>/dev/null || true)',
    '  if [[ -n "$OS_NAMESPACE" && "$OS_NAMESPACE" != "null" ]]; then',
    '    while IFS= read -r bucket; do',
    '      [[ -z "$bucket" || "$bucket" == "null" ]] && continue',
    '      echo "[FOUND] Object Storage Bucket $bucket"',
    '      run_delete oci os object bulk-delete --namespace-name "$OS_NAMESPACE" --bucket-name "$bucket" --force "${CTX[@]}"',
    '      run_delete oci os bucket delete --namespace-name "$OS_NAMESPACE" --bucket-name "$bucket" --force "${CTX[@]}"',
    '    done < <(oci os bucket list --namespace-name "$OS_NAMESPACE" --compartment-id "$COMPARTMENT" --all --query \'data[].name\' --raw-output "${CTX[@]}" 2>/dev/null | tr -d \'[],"\' | tr \' \' \'\\n\' | sed \'/^$/d\' || true)',
    '  fi',
    '  cleanup_ids "File Storage Export" --export-id oci fs export list --compartment-id "$COMPARTMENT" :: oci fs export delete --force',
    '  cleanup_ids "File Storage Mount Target" --mount-target-id oci fs mount-target list --compartment-id "$COMPARTMENT" :: oci fs mount-target delete --force',
    '  cleanup_ids "File System" --file-system-id oci fs file-system list --compartment-id "$COMPARTMENT" :: oci fs file-system delete --force',
    'fi',
    '',
    'if $CLEAN_STORAGE_BACKUPS; then',
    '  cleanup_ids "Boot Volume Backup" --boot-volume-backup-id oci bv boot-volume-backup list --compartment-id "$COMPARTMENT" :: oci bv boot-volume-backup delete --force',
    '  cleanup_ids "Block Volume Backup" --volume-backup-id oci bv backup list --compartment-id "$COMPARTMENT" :: oci bv backup delete --force',
    '  cleanup_ids "Volume Group Backup" --volume-group-backup-id oci bv volume-group-backup list --compartment-id "$COMPARTMENT" :: oci bv volume-group-backup delete --force',
    'fi',
    '',
    'if $CLEAN_DB_BACKUPS; then',
    '  cleanup_ids "Base DB Backup" --backup-id oci db backup list --compartment-id "$COMPARTMENT" :: oci db backup delete --force',
    '  cleanup_ids "MySQL Backup" --backup-id oci mysql backup list --compartment-id "$COMPARTMENT" :: oci mysql backup delete --force',
    '  cleanup_ids "Autonomous DB Backup" --autonomous-database-backup-id oci db autonomous-database-backup list --compartment-id "$COMPARTMENT" :: oci db autonomous-database-backup delete --force',
    'fi',
    '',
    'if $CLEAN_STORAGE; then',
    '  cleanup_ids "Volume Group" --volume-group-id oci bv volume-group list --compartment-id "$COMPARTMENT" :: oci bv volume-group delete --force',
    '  cleanup_ids "Block Volume" --volume-id oci bv volume list --compartment-id "$COMPARTMENT" :: oci bv volume delete --force',
    '  cleanup_ids "Boot Volume" --boot-volume-id oci bv boot-volume list --compartment-id "$COMPARTMENT" :: oci bv boot-volume delete --force',
    'fi',
    '',
    'if $CLEAN_NETWORK; then',
    '  cleanup_ids "DRG Attachment" --drg-attachment-id oci network drg-attachment list --compartment-id "$COMPARTMENT" :: oci network drg-attachment delete --force',
    '  cleanup_ids "Remote Peering Connection" --remote-peering-connection-id oci network remote-peering-connection list --compartment-id "$COMPARTMENT" :: oci network remote-peering-connection delete --force',
    '  cleanup_ids "Local Peering Gateway" --local-peering-gateway-id oci network local-peering-gateway list --compartment-id "$COMPARTMENT" :: oci network local-peering-gateway delete --force',
    '  cleanup_ids "NAT Gateway" --nat-gateway-id oci network nat-gateway list --compartment-id "$COMPARTMENT" :: oci network nat-gateway delete --force',
    '  cleanup_ids "Service Gateway" --service-gateway-id oci network service-gateway list --compartment-id "$COMPARTMENT" :: oci network service-gateway delete --force',
    '  cleanup_ids "Internet Gateway" --ig-id oci network internet-gateway list --compartment-id "$COMPARTMENT" :: oci network internet-gateway delete --force',
    '  cleanup_ids "Subnet" --subnet-id oci network subnet list --compartment-id "$COMPARTMENT" :: oci network subnet delete --force',
    '  cleanup_ids "Network Security Group" --nsg-id oci network nsg list --compartment-id "$COMPARTMENT" :: oci network nsg delete --force',
    '  cleanup_ids "Reserved Public IP" --public-ip-id oci network public-ip list --scope REGION --compartment-id "$COMPARTMENT" :: oci network public-ip delete --force',
    '  cleanup_ids "Dynamic Routing Gateway" --drg-id oci network drg list --compartment-id "$COMPARTMENT" :: oci network drg delete --force',
    '  cleanup_ids "Virtual Cloud Network" --vcn-id oci network vcn list --compartment-id "$COMPARTMENT" :: oci network vcn delete --force',
    'fi',
    '',
    'echo "=== 완료: 비동기 삭제 또는 의존성 충돌이 남으면 같은 스크립트를 다시 실행하세요. ==="',
  ].join('\n')
}

function buildAllSubscriptionBalances(_values: Record<string, string>, requestContext: string[] = []): string {
  return [
    '#!/usr/bin/env bash',
    '# 모든 Subscription의 계약액 및 서비스 라인별 잔액 조회',
    'set -euo pipefail',
    '',
    `CTX=(${requestContext.join(' ')})`,
    '',
    'command -v jq >/dev/null 2>&1 || { echo "[ERROR] jq가 필요합니다. OCI Cloud Shell에는 기본 설치되어 있습니다." >&2; exit 2; }',
    'TENANCY_ID=$(oci iam availability-domain list \\',
    '  --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
    'if [[ ! "$TENANCY_ID" =~ ^ocid1\\.tenancy\\. ]]; then',
    '  echo "[ERROR] 프로필에서 테넌시 OCID를 확인하지 못했습니다: $TENANCY_ID" >&2',
    '  exit 2',
    'fi',
    '',
    'SUBSCRIPTIONS_JSON=$(oci onesubscription organization-subscription organization-subscription list \\',
    '  --compartment-id "$TENANCY_ID" --all --output json "${CTX[@]}")',
    'SUBSCRIPTION_COUNT=$(jq -r \'.data | length\' <<<"$SUBSCRIPTIONS_JSON")',
    'echo "=== tenancy=$TENANCY_ID / subscriptions=$SUBSCRIPTION_COUNT ==="',
    'if [[ "$SUBSCRIPTION_COUNT" == "0" ]]; then',
    '  echo "조회 가능한 Subscription이 없습니다."',
    '  exit 0',
    'fi',
    '',
    'while IFS=$\'\\t\' read -r SUBSCRIPTION_ID SERVICE_NAME STATUS TOTAL_VALUE CURRENCY; do',
    '  echo',
    '  echo "=== $SUBSCRIPTION_ID | $SERVICE_NAME | $STATUS | total=$TOTAL_VALUE $CURRENCY ==="',
    '  oci onesubscription subscribed-service subscribed-service list \\',
    '    --compartment-id "$TENANCY_ID" --subscription-id "$SUBSCRIPTION_ID" --all \\',
    '    --query \'data[].{Product:product.name,Status:status,Funded:"funded-allocation-value",Used:"used-amount",Available:"available-amount",Start:"time-start",End:"time-end"}\' \\',
    '    --output table "${CTX[@]}"',
    'done < <(jq -r \'.data[] | [',
    '  .id, (."service-name" // "-"), (.status // "-"),',
    '  (."total-value" // "-"), (.currency."iso-code" // "-")',
    '] | @tsv\' <<<"$SUBSCRIPTIONS_JSON")',
  ].join('\n')
}

function buildRootTenancyLookup(requestContext: string[] = []): string {
  return [
    `OCI_REQUEST_CONTEXT=(${requestContext.join(' ')})`,
    'TENANCY_ID=$(oci iam availability-domain list \\',
    '  --query \'data[0]."compartment-id"\' --raw-output "${OCI_REQUEST_CONTEXT[@]}")',
    '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 프로필에서 테넌시 OCID를 확인하지 못했습니다: $TENANCY_ID" >&2; exit 2; }',
  ].join('\n')
}

function buildImageDiscoveryCommand(
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  requestContext: string[] = [],
): string {
  const compartmentInput = (values['--compartment-id'] ?? '').trim() || '<compartment-name-or-ocid>'
  const shape = (values['--shape'] ?? '').trim()
  const dynamicCompartment = isDynamic(dyn, '--compartment-id')
  const lines = [
    '# 현재 리전·컴파트먼트의 최신 platform/custom image 조회',
    '# Shape를 입력했다면 호환 image만 반환',
    'set -euo pipefail',
    `CTX=(${requestContext.join(' ')})`,
    `COMPARTMENT_INPUT=${quoteCliValue(compartmentInput, true)}`,
  ]
  if (dynamicCompartment) {
    lines.push(
      'TENANCY_ID=$(oci iam availability-domain list --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
      '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 프로필에서 tenancy OCID를 얻지 못했습니다." >&2; exit 2; }',
      'if [[ "$COMPARTMENT_INPUT" == "ROOT" || "$COMPARTMENT_INPUT" == ocid1.tenancy.* ]]; then',
      '  IMAGE_COMPARTMENT_ID="$TENANCY_ID"',
      'elif [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* ]]; then',
      '  IMAGE_COMPARTMENT_ID="$COMPARTMENT_INPUT"',
      'else',
      '  IMAGE_COMPARTMENT_COUNT=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" \\',
      '    --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
      '    --query \'length(data)\' --raw-output "${CTX[@]}")',
      '  if [[ "$IMAGE_COMPARTMENT_COUNT" != "1" ]]; then',
      '    echo "[ERROR] ACTIVE compartment 이름은 tenancy 전체에서 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$IMAGE_COMPARTMENT_COUNT)" >&2',
      '    oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --all \\',
      '      --query \'data[].{name:name,state:"lifecycle-state",id:id,parent:"compartment-id"}\' --output table "${CTX[@]}" >&2 || true',
      '    exit 1',
      '  fi',
      '  IMAGE_COMPARTMENT_ID=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" \\',
      '    --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
      '    --query \'data[0].id\' --raw-output "${CTX[@]}")',
      'fi',
    )
  } else {
    lines.push(
      'IMAGE_COMPARTMENT_ID="$COMPARTMENT_INPUT"',
      '[[ "$IMAGE_COMPARTMENT_ID" == ocid1.compartment.* || "$IMAGE_COMPARTMENT_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 직접 입력 모드에는 compartment/tenancy OCID가 필요합니다." >&2; exit 2; }',
    )
  }
  lines.push(
    'IMAGE_ARGS=(--compartment-id "$IMAGE_COMPARTMENT_ID" --all --lifecycle-state AVAILABLE --sort-by TIMECREATED --sort-order DESC)',
  )
  if (shape) lines.push(`IMAGE_ARGS+=(--shape ${quoteCliValue(shape, true)})`)
  lines.push(
    'oci compute image list "${IMAGE_ARGS[@]}" \\',
    '  --query \'data[].{id:id,name:"display-name",os:"operating-system",version:"operating-system-version",state:"lifecycle-state",timeCreated:"time-created"}\' \\',
    '  --output json "${CTX[@]}"',
  )
  return lines.join('\n')
}

function buildInstanceLaunchPreflightCommand(
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  requestContext: string[] = [],
  executionValues: Record<string, string> = {},
): string {
  const compartmentInput = (values['--compartment-id'] ?? '').trim() || '<compartment-name-or-ocid>'
  const availabilityDomainInput = (values['--availability-domain'] ?? '').trim() || '1'
  const dynamicCompartment = isDynamic(dyn, '--compartment-id')
  const dynamicAvailabilityDomain = isDynamic(dyn, '--availability-domain')
  const lines = [
    '#!/usr/bin/env bash',
    '# Instance Create 사전조회: 전체 Shape + Shape별 호환 Image 매트릭스 → 단일 JSON 번들 출력',
    'set -euo pipefail',
    '',
    'command -v jq >/dev/null 2>&1 || { echo "[ERROR] jq가 필요합니다. OCI Cloud Shell에는 기본 설치되어 있습니다." >&2; exit 2; }',
    `CTX=(${requestContext.join(' ')})`,
    `PROFILE_VALUE=${quoteCliValue((executionValues['--profile'] ?? '').trim(), true)}`,
    `REGION_VALUE=${quoteCliValue((executionValues['--region'] ?? '').trim(), true)}`,
    `COMPARTMENT_INPUT=${quoteCliValue(compartmentInput, true)}`,
    `AD_INPUT=${quoteCliValue(availabilityDomainInput, true)}`,
    '',
    'TENANCY_ID=$(oci iam availability-domain list --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
    '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 프로필에서 tenancy OCID를 얻지 못했습니다: $TENANCY_ID" >&2; exit 2; }',
  ]
  if (dynamicCompartment) {
    lines.push(
      'if [[ "$COMPARTMENT_INPUT" == "ROOT" || "$COMPARTMENT_INPUT" == ocid1.tenancy.* ]]; then',
      '  COMPARTMENT_ID="$TENANCY_ID"',
      'elif [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* ]]; then',
      '  COMPARTMENT_ID="$COMPARTMENT_INPUT"',
      'else',
      '  COMPARTMENT_JSON=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" \\',
      '    --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --output json "${CTX[@]}")',
      '  COMPARTMENT_COUNT=$(jq -r \'.data | length\' <<<"$COMPARTMENT_JSON")',
      '  if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
      '    echo "[ERROR] ACTIVE compartment 이름은 tenancy 전체에서 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2',
      '    jq -r \'.data[] | [.name, ."lifecycle-state", .id, ."compartment-id"] | @tsv\' <<<"$COMPARTMENT_JSON" >&2 || true',
      '    exit 1',
      '  fi',
      '  COMPARTMENT_ID=$(jq -r \'.data[0].id\' <<<"$COMPARTMENT_JSON")',
      'fi',
    )
  } else {
    lines.push(
      'COMPARTMENT_ID="$COMPARTMENT_INPUT"',
      '[[ "$COMPARTMENT_ID" == ocid1.compartment.* || "$COMPARTMENT_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 직접 입력 모드에는 compartment/tenancy OCID가 필요합니다." >&2; exit 2; }',
    )
  }
  lines.push(
    '',
    'AD_JSON=$(oci iam availability-domain list --compartment-id "$TENANCY_ID" --all --output json "${CTX[@]}")',
  )
  if (dynamicAvailabilityDomain) {
    lines.push(
      '[[ "$AD_INPUT" =~ ^[0-9]+$ ]] || { echo "[ERROR] 동적 조회 AD는 1부터 시작하는 번호여야 합니다: $AD_INPUT" >&2; exit 2; }',
      'AD_NAME=$(jq -r --argjson index "$((AD_INPUT - 1))" \'.data[$index].name // empty\' <<<"$AD_JSON")',
      '[[ -n "$AD_NAME" ]] || { echo "[ERROR] AD 번호를 찾지 못했습니다: $AD_INPUT" >&2; jq -r \'.data[].name\' <<<"$AD_JSON" >&2; exit 1; }',
    )
  } else {
    lines.push(
      'AD_NAME="$AD_INPUT"',
      'AD_MATCH_COUNT=$(jq -r --arg name "$AD_NAME" \'[.data[] | select(.name == $name)] | length\' <<<"$AD_JSON")',
      '[[ "$AD_MATCH_COUNT" == "1" ]] || { echo "[ERROR] 프로필 tenancy에서 정확한 AD 이름을 찾지 못했습니다: $AD_NAME" >&2; jq -r \'.data[].name\' <<<"$AD_JSON" >&2; exit 1; }',
    )
  }
  lines.push(
    '',
    'SHAPES_RESPONSE=$(oci compute shape list --compartment-id "$COMPARTMENT_ID" --availability-domain "$AD_NAME" --all --output json "${CTX[@]}")',
    'SHAPES=$(jq -c \'[.data[] | {',
    '  shape: .shape,',
    '  vendor: (if ((."processor-description" // "") | ascii_downcase | test("amd|epyc")) then "AMD"',
    '    elif ((."processor-description" // "") | ascii_downcase | test("intel|xeon")) then "Intel"',
    '    elif (((."processor-description" // "") + " " + (.shape // "")) | ascii_downcase | test("ampere|altra|\\\\.a[0-9]+\\\\.")) then "Ampere"',
    '    else "Other" end),',
    '  processorDescription: (."processor-description" // ""),',
    '  ocpus: (.ocpus // null), memoryInGBs: (."memory-in-gbs" // null),',
    '  isFlexible: (."is-flexible" // false), baselineOcpuUtilizations: (."baseline-ocpu-utilizations" // []),',
    '  gpuDescription: (."gpu-description" // ""), billingType: (."billing-type" // ""),',
    '  networkingBandwidthInGbps: (."networking-bandwidth-in-gbps" // null)',
    '}] | sort_by((if .vendor == "AMD" then 0 elif .vendor == "Intel" then 1 elif .vendor == "Ampere" then 2 else 3 end), .shape)\' <<<"$SHAPES_RESPONSE")',
    'SHAPE_COUNT=$(jq -r \'length\' <<<"$SHAPES")',
    '[[ "$SHAPE_COUNT" != "0" ]] || { echo "[ERROR] 이 AD에서 사용 가능한 Shape가 없습니다." >&2; exit 1; }',
    '',
    'IMAGE_ROWS_FILE=$(mktemp)',
    'trap \'rm -f "$IMAGE_ROWS_FILE"\' EXIT',
    'echo "[INFO] $SHAPE_COUNT개 Shape의 이미지 호환성을 조회합니다. 목록은 출력하지 않고 최종 JSON에만 담습니다." >&2',
    'while IFS= read -r SHAPE_NAME; do',
    '  IMAGES_RESPONSE=$(oci compute image list --compartment-id "$COMPARTMENT_ID" --shape "$SHAPE_NAME" --all \\',
    '    --lifecycle-state AVAILABLE --sort-by TIMECREATED --sort-order DESC --output json "${CTX[@]}")',
    '  jq -c --arg shape "$SHAPE_NAME" \'.data[] | {',
    '    id: .id, name: ."display-name", os: ."operating-system", version: ."operating-system-version",',
    '    state: ."lifecycle-state", timeCreated: ."time-created", compatibleShape: $shape',
    '  }\' <<<"$IMAGES_RESPONSE" >> "$IMAGE_ROWS_FILE"',
    'done < <(jq -r \'.[].shape\' <<<"$SHAPES")',
    'IMAGES=$(jq -sc \'sort_by(.id) | group_by(.id) | map(',
    '  .[0] as $base | $base + {compatibleShapes: (map(.compatibleShape) | unique)} | del(.compatibleShape)',
    ') | sort_by(.os, .version, .name)\' "$IMAGE_ROWS_FILE")',
    'IMAGE_COUNT=$(jq -r \'length\' <<<"$IMAGES")',
    '[[ "$IMAGE_COUNT" != "0" ]] || { echo "[ERROR] 조회된 AVAILABLE 이미지가 없습니다." >&2; exit 1; }',
    'echo "[OK] Shape $SHAPE_COUNT개 / 중복 제거 이미지 $IMAGE_COUNT개 호환성 매트릭스 생성 완료" >&2',
    '',
    'echo "-----BEGIN OCI INSTANCE PREFLIGHT JSON-----"',
    'jq -n --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg profile "$PROFILE_VALUE" --arg region "$REGION_VALUE" \\',
    '  --arg compartmentInput "$COMPARTMENT_INPUT" --arg compartmentId "$COMPARTMENT_ID" --arg availabilityDomain "$AD_NAME" \\',
    '  --argjson shapes "$SHAPES" --argjson images "$IMAGES" \'{',
    '    schema: "oci-instance-launch-preflight/v2", generatedAt: $generatedAt,',
    '    context: {profile: $profile, region: $region, compartmentInput: $compartmentInput, compartmentId: $compartmentId, availabilityDomain: $availabilityDomain},',
    '    shapes: $shapes, images: $images',
    '  }\'',
    'echo "-----END OCI INSTANCE PREFLIGHT JSON-----"',
  )
  return lines.join('\n')
}

function buildIamCommand(
  cmd: CliCommand,
  selected: CliOperation,
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  requestContext: string[] = [],
  responseContext: string[] = [],
): string {
  if (!cmd.iamResource) return selected.cmd
  const v = (key: string) => (values[key] || '').trim()
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  const prelude: string[] = []
  const resolved = new Map<string, string>()
  let tenancyReady = false
  const ensureTenancy = () => {
    if (tenancyReady) return
    prelude.push(
      `CTX=(${requestContext.join(' ')})`,
      'TENANCY_ID=$(oci iam availability-domain list \\',
      '  --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
      '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 프로필에서 테넌시 OCID를 확인하지 못했습니다: $TENANCY_ID" >&2; exit 2; }',
    )
    tenancyReady = true
  }
  const resolveCompartment = (input: string, variable: string) => {
    if (input.toUpperCase() === 'ROOT') {
      ensureTenancy(); resolved.set(variable, '"$TENANCY_ID"'); return
    }
    if (input.startsWith('ocid1.compartment.') || input.startsWith('ocid1.tenancy.')) {
      resolved.set(variable, q(input)); return
    }
    ensureTenancy()
    const nameVariable = `${variable}_NAME`
    const countVariable = `${variable}_COUNT`
    prelude.push(
      `${nameVariable}=${q(input || '<compartment-name>')}`,
      `${countVariable}=$(oci iam compartment list --name "$${nameVariable}" --lifecycle-state ACTIVE \\`,
      '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
      '  --query \'length(data)\' --raw-output "${CTX[@]}")',
      `if [[ "$${countVariable}" != "1" ]]; then`,
      `  echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $${nameVariable} (found=$${countVariable})" >&2`,
      `  oci iam compartment list --name "$${nameVariable}" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\`,
      '    --query \'data[].{name:name,id:id,parent:"compartment-id"}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      `${variable}=$(oci iam compartment list --name "$${nameVariable}" --lifecycle-state ACTIVE \\`,
      '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
      '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
    )
    resolved.set(variable, `"$${variable}"`)
  }

  const compInput = v('--compartment-id')
  if (allOptions(selected).some(option => option.name === '--compartment-id')
    && isDynamic(dyn, '--compartment-id') && compInput) {
    resolveCompartment(compInput, 'COMPARTMENT_ID')
    resolved.set('--compartment-id', resolved.get('COMPARTMENT_ID') as string)
  }

  for (const [optionName, kind, variable] of [
    ['--user-id', 'user', 'USER_ID'],
    ['--group-id', 'group', 'GROUP_ID'],
  ] as const) {
    if (!allOptions(selected).some(option => option.name === optionName) || !isDynamic(dyn, optionName)) continue
    ensureTenancy()
    const inputVariable = `${variable}_NAME`
    const countVariable = `${variable}_COUNT`
    prelude.push(
      `${inputVariable}=${q(v(optionName) || `<${kind}-name>`)}`,
      `${countVariable}=$(oci iam ${kind} list --compartment-id "$TENANCY_ID" --name "$${inputVariable}" \\`,
      '  --lifecycle-state ACTIVE --all --query \'length(data)\' --raw-output "${CTX[@]}")',
      `if [[ "$${countVariable}" != "1" ]]; then`,
      `  echo "[ERROR] ACTIVE ${kind} 이름은 정확히 1개여야 합니다: $${inputVariable} (found=$${countVariable})" >&2`,
      `  oci iam ${kind} list --compartment-id "$TENANCY_ID" --name "$${inputVariable}" --all \\`,
      '    --query \'data[].{name:name,state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      `${variable}=$(oci iam ${kind} list --compartment-id "$TENANCY_ID" --name "$${inputVariable}" \\`,
      '  --lifecycle-state ACTIVE --all --query \'data[0].id\' --raw-output "${CTX[@]}")',
    )
    resolved.set(optionName, `"$${variable}"`)
  }

  if (allOptions(selected).some(option => option.name === '--policy-id') && isDynamic(dyn, '--policy-id')) {
    ensureTenancy()
    const scope = v('--lookup-compartment-id') || 'ROOT'
    if (scope.toUpperCase() === 'ROOT') {
      ensureTenancy(); resolved.set('POLICY_SCOPE_ID', '"$TENANCY_ID"')
    } else if (scope.startsWith('ocid1.')) resolved.set('POLICY_SCOPE_ID', q(scope))
    else resolveCompartment(scope, 'POLICY_SCOPE_ID')
    prelude.push(
      `POLICY_NAME=${q(v('--policy-id') || '<policy-name>')}`,
      'POLICY_COUNT=$(oci iam policy list --compartment-id ' + resolved.get('POLICY_SCOPE_ID') + ' --name "$POLICY_NAME" \\',
      '  --lifecycle-state ACTIVE --all --query \'length(data)\' --raw-output "${CTX[@]}")',
      'if [[ "$POLICY_COUNT" != "1" ]]; then',
      '  echo "[ERROR] ACTIVE policy 이름은 지정 위치에서 정확히 1개여야 합니다: $POLICY_NAME (found=$POLICY_COUNT)" >&2',
      '  oci iam policy list --compartment-id ' + resolved.get('POLICY_SCOPE_ID') + ' --name "$POLICY_NAME" --all \\',
      '    --query \'data[].{name:name,state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'POLICY_ID=$(oci iam policy list --compartment-id ' + resolved.get('POLICY_SCOPE_ID') + ' --name "$POLICY_NAME" \\',
      '  --lifecycle-state ACTIVE --all --query \'data[0].id\' --raw-output "${CTX[@]}")',
    )
    resolved.set('--policy-id', '"$POLICY_ID"')
  }

  const args: string[] = []
  const keySource = v('--key-source') || 'KEY_FILE'
  for (const option of allOptions(selected)) {
    if (option.lookupOnly) continue
    if (option.name === '--key' && keySource !== 'PEM_TEXT') continue
    if (option.name === '--key-file' && keySource !== 'KEY_FILE') continue
    if (option.flag) {
      if (v(option.name) === 'true') args.push(`  ${option.name}`)
      continue
    }
    if (resolved.has(option.name)) {
      args.push(`  ${option.name} ${resolved.get(option.name)}`); continue
    }
    let value = v(option.name)
    if (option.name === '--key-file' && keySource === 'KEY_FILE' && !value) value = '<rsa-public-key.pem>'
    if (option.name === '--key' && keySource === 'PEM_TEXT' && !value) value = '<rsa-public-key-pem>'
    if (!value) continue
    args.push(`  ${option.name} ${q(value)}`)
  }
  args.push(...requestContext.map(argument => `  ${argument}`), ...responseContext.map(argument => `  ${argument}`))
  const main = [selected.cmd, ...args].join(' \\\n')
  return prelude.length ? ['#!/usr/bin/env bash', 'set -euo pipefail', '', ...prelude, '', main].join('\n') : main
}

function buildIamMfaReset(values: Record<string, string>, requestContext: string[] = []): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  return [
    '#!/usr/bin/env bash',
    '# IAM User MFA TOTP reset — PREVIEW 기본, RESET은 이름 이중 확인 후 모든 등록 장치 삭제',
    'set -euo pipefail',
    '',
    `USER_LOOKUP=${q(v('--user-lookup', 'NAME').toUpperCase())}`,
    `USER_INPUT=${q(v('--user-id', '<user-name-or-ocid>'))}`,
    `MODE=${q(v('--mode', 'PREVIEW').toUpperCase())}`,
    `CONFIRM_USER_NAME=${q(v('--confirm-user-name'))}`,
    `CTX=(${requestContext.join(' ')})`,
    'command -v jq >/dev/null 2>&1 || { echo "[ERROR] jq가 필요합니다. OCI Cloud Shell에는 기본 설치되어 있습니다." >&2; exit 2; }',
    '',
    '[[ "$USER_LOOKUP" == "NAME" || "$USER_LOOKUP" == "OCID" ]] || { echo "[ERROR] USER_LOOKUP은 NAME 또는 OCID여야 합니다." >&2; exit 2; }',
    '[[ "$MODE" == "PREVIEW" || "$MODE" == "RESET" ]] || { echo "[ERROR] MODE는 PREVIEW 또는 RESET이어야 합니다." >&2; exit 2; }',
    'TENANCY_ID=$(oci iam availability-domain list --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
    '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ERROR] 프로필에서 테넌시 OCID를 확인하지 못했습니다." >&2; exit 2; }',
    '',
    'if [[ "$USER_LOOKUP" == "NAME" ]]; then',
    '  USER_COUNT=$(oci iam user list --compartment-id "$TENANCY_ID" --name "$USER_INPUT" --lifecycle-state ACTIVE --all --query \'length(data)\' --raw-output "${CTX[@]}")',
    '  if [[ "$USER_COUNT" != "1" ]]; then',
    '    echo "[ERROR] ACTIVE User 이름은 정확히 1개여야 합니다: $USER_INPUT (found=$USER_COUNT)" >&2',
    '    oci iam user list --compartment-id "$TENANCY_ID" --name "$USER_INPUT" --all --query \'data[].{name:name,state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
    '    exit 1',
    '  fi',
    '  USER_ID=$(oci iam user list --compartment-id "$TENANCY_ID" --name "$USER_INPUT" --lifecycle-state ACTIVE --all --query \'data[0].id\' --raw-output "${CTX[@]}")',
    '  USER_NAME="$USER_INPUT"',
    'else',
    '  [[ "$USER_INPUT" == ocid1.user.* ]] || { echo "[ERROR] OCID 모드에는 User OCID가 필요합니다." >&2; exit 2; }',
    '  USER_ID="$USER_INPUT"',
    '  USER_NAME=$(oci iam user get --user-id "$USER_ID" --query \'data.name\' --raw-output "${CTX[@]}")',
    'fi',
    '',
    'echo "=== MFA devices: user=$USER_NAME / id=$USER_ID / mode=$MODE ==="',
    'MFA_JSON=$(oci iam mfa-totp-device list --user-id "$USER_ID" --all --output json "${CTX[@]}")',
    'MFA_COUNT=$(jq -r \'.data | length\' <<<"$MFA_JSON")',
    'jq -r \'.data[] | [.id, (."is-activated"|tostring), (."time-created" // "-")] | @tsv\' <<<"$MFA_JSON" | column -t -s $\'\\t\' || true',
    'if [[ "$MFA_COUNT" == "0" ]]; then echo "등록된 MFA TOTP 장치가 없습니다."; exit 0; fi',
    'if [[ "$MODE" == "PREVIEW" ]]; then echo "PREVIEW 완료: 삭제하지 않았습니다."; exit 0; fi',
    'if [[ "$CONFIRM_USER_NAME" != "$USER_NAME" ]]; then',
    '  echo "[ABORT] RESET에는 confirm user name이 실제 User 이름과 정확히 같아야 합니다: $USER_NAME" >&2',
    '  exit 2',
    'fi',
    'while IFS= read -r MFA_ID; do',
    '  [[ -z "$MFA_ID" ]] && continue',
    '  echo "[DELETE] MFA TOTP device $MFA_ID"',
    '  oci iam mfa-totp-device delete --mfa-totp-device-id "$MFA_ID" --user-id "$USER_ID" --force "${CTX[@]}"',
    'done < <(jq -r \'.data[].id\' <<<"$MFA_JSON")',
    'echo "RESET 완료: User가 Console에서 MFA를 다시 등록해야 합니다."',
  ].join('\n')
}

/* WizOCM Functions migration foundation.  PLAN is deliberately read-only;
   APPLY is both explicitly confirmed and idempotent (0=create, 1=compare/reuse,
   N=stop).  Customer credentials and secret values are never inputs here. */
function buildWizocmFunctionsFoundation(values: Record<string, string>, requestContext: string[] = []): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const q = (raw: string) => quoteCliValue(raw, true)
  return [
    '#!/usr/bin/env bash',
    '# WizOCM Functions migration foundation — PLAN(read only) → APPLY(idempotent) → health invoke.',
    '# Customer API keys, private keys, PATs and secret VALUES are intentionally not accepted or written by this script.',
    'set -euo pipefail',
    '',
    `MODE=${q(v('--mode', 'PLAN').toUpperCase())}`,
    `CONFIRM_APPLY=${q(v('--confirm-apply'))}`,
    `COMPARTMENT_INPUT=${q(v('--compartment-input', '<compartment-name-or-ocid>'))}`,
    `VCN_INPUT=${q(v('--vcn-input', '<vcn-name-or-ocid>'))}`,
    `PRIVATE_SUBNET_INPUT=${q(v('--private-subnet-input', '<private-subnet-name-or-ocid>'))}`,
    `SPRING_VNIC_ID=${q(v('--spring-vnic-id', '<spring-vnic-ocid>'))}`,
    `SPRING_INSTANCE_ID=${q(v('--spring-instance-id', '<spring-instance-ocid>'))}`,
    `LOG_GROUP_INPUT=${q(v('--log-group-input', '<log-group-name-or-ocid>'))}`,
    `SPRING_INTERNAL_URL=${q(v('--spring-internal-url', '<private-spring-url>'))}`,
    `HMAC_SECRET_OCID=${q(v('--hmac-secret-ocid', '<hmac-secret-ocid>'))}`,
    `OCIR_NAMESPACE=${q(v('--ocir-namespace', '<ocir-namespace>'))}`,
    `RELEASE_VERSION=${q(v('--release-version', '<full-commit-sha>'))}`,
    `SCHEDULE_CRON=${q(v('--schedule-cron', '10 18 * * *'))}`,
    `CTX=(${requestContext.join(' ')})`,
    '',
    'command -v jq >/dev/null 2>&1 || { echo "[ABORT] jq가 필요합니다. OCI Cloud Shell에는 기본 설치되어 있습니다." >&2; exit 2; }',
    '[[ "$MODE" == "PLAN" || "$MODE" == "APPLY" ]] || { echo "[ABORT] MODE는 PLAN 또는 APPLY여야 합니다." >&2; exit 2; }',
    '[[ "$RELEASE_VERSION" =~ ^[0-9a-fA-F]{40,64}$ ]] || { echo "[ABORT] release version에는 immutable full Git commit SHA(40~64 hex)가 필요합니다." >&2; exit 2; }',
    '[[ "$SPRING_VNIC_ID" == ocid1.vnic.* ]] || { echo "[ABORT] Spring VNIC OCID가 필요합니다." >&2; exit 2; }',
    '[[ "$SPRING_INSTANCE_ID" == ocid1.instance.* ]] || { echo "[ABORT] Spring Instance OCID가 필요합니다." >&2; exit 2; }',
    '[[ "$HMAC_SECRET_OCID" == ocid1.vaultsecret.* ]] || { echo "[ABORT] HMAC secret OCID만 입력하세요. secret 값은 입력하지 않습니다." >&2; exit 2; }',
    'if [[ "$MODE" == "APPLY" && "$CONFIRM_APPLY" != "APPLY_WIZOCM_FUNCTIONS" ]]; then',
    '  echo "[ABORT] APPLY에는 --confirm-apply 값이 APPLY_WIZOCM_FUNCTIONS와 완전히 같아야 합니다." >&2; exit 2',
    'fi',
    '',
    '# 1. Discover — 이름 입력은 반드시 0/1/N을 구분하고, 임의의 첫 OCID를 선택하지 않습니다.',
    'TENANCY_ID=$(oci iam availability-domain list --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
    '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ABORT] 선택한 profile에서 tenancy OCID를 확인하지 못했습니다." >&2; exit 2; }',
    'if [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* ]]; then COMPARTMENT_ID="$COMPARTMENT_INPUT"; else',
    '  COMPARTMENT_JSON=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --output json "${CTX[@]}")',
    '  COUNT=$(jq --arg n "$COMPARTMENT_INPUT" \'[.data[]? | select(.name == $n)] | length\' <<<"$COMPARTMENT_JSON")',
    '  [[ "$COUNT" == "1" ]] || { echo "[ABORT] ACTIVE compartment 이름은 tenancy 전체에서 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COUNT)" >&2; jq -r \'.data[]? | [.name,.id,."compartment-id"] | @tsv\' <<<"$COMPARTMENT_JSON" >&2; exit 1; }',
    '  COMPARTMENT_ID=$(jq -r --arg n "$COMPARTMENT_INPUT" \'[.data[]? | select(.name == $n)][0].id\' <<<"$COMPARTMENT_JSON")',
    'fi',
    'if [[ "$VCN_INPUT" == ocid1.vcn.* ]]; then VCN_ID="$VCN_INPUT"; else',
    '  VCN_JSON=$(oci network vcn list --compartment-id "$COMPARTMENT_ID" --all --output json "${CTX[@]}")',
    '  COUNT=$(jq --arg n "$VCN_INPUT" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$VCN_JSON")',
    '  [[ "$COUNT" == "1" ]] || { echo "[ABORT] VCN 이름은 대상 compartment에서 정확히 1개여야 합니다: $VCN_INPUT (found=$COUNT)" >&2; jq -r \'.data[]? | [."display-name",.id] | @tsv\' <<<"$VCN_JSON" >&2; exit 1; }',
    '  VCN_ID=$(jq -r --arg n "$VCN_INPUT" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$VCN_JSON")',
    'fi',
    'if [[ "$PRIVATE_SUBNET_INPUT" == ocid1.subnet.* ]]; then SUBNET_ID="$PRIVATE_SUBNET_INPUT"; else',
    '  SUBNET_JSON=$(oci network subnet list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --all --output json "${CTX[@]}")',
    '  COUNT=$(jq --arg n "$PRIVATE_SUBNET_INPUT" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$SUBNET_JSON")',
    '  [[ "$COUNT" == "1" ]] || { echo "[ABORT] private subnet 이름은 VCN에서 정확히 1개여야 합니다: $PRIVATE_SUBNET_INPUT (found=$COUNT)" >&2; jq -r \'.data[]? | [."display-name",id,."prohibit-public-ip-on-vnic"] | @tsv\' <<<"$SUBNET_JSON" >&2; exit 1; }',
    '  SUBNET_ID=$(jq -r --arg n "$PRIVATE_SUBNET_INPUT" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$SUBNET_JSON")',
    'fi',
    'if [[ "$LOG_GROUP_INPUT" == ocid1.loggroup.* ]]; then LOG_GROUP_ID="$LOG_GROUP_INPUT"; else',
    '  LOG_GROUP_JSON=$(oci logging log-group list --compartment-id "$COMPARTMENT_ID" --display-name "$LOG_GROUP_INPUT" --all --output json "${CTX[@]}")',
    '  COUNT=$(jq --arg n "$LOG_GROUP_INPUT" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$LOG_GROUP_JSON")',
    '  [[ "$COUNT" == "1" ]] || { echo "[ABORT] Log Group 이름은 대상 compartment에서 정확히 1개여야 합니다: $LOG_GROUP_INPUT (found=$COUNT)" >&2; jq -r \'.data[]? | [."display-name",id] | @tsv\' <<<"$LOG_GROUP_JSON" >&2; exit 1; }',
    '  LOG_GROUP_ID=$(jq -r --arg n "$LOG_GROUP_INPUT" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$LOG_GROUP_JSON")',
    'fi',
    'PRIVATE_SUBNET_JSON=$(oci network subnet get --subnet-id "$SUBNET_ID" --output json "${CTX[@]}")',
    '[[ $(jq -r \'.data."prohibit-public-ip-on-vnic"\' <<<"$PRIVATE_SUBNET_JSON") == "true" ]] || { echo "[ABORT] Functions application에는 public IP가 금지된 private subnet이 필요합니다." >&2; exit 1; }',
    'ROUTE_TABLE_ID=$(jq -r \'.data."route-table-id" // empty\' <<<"$PRIVATE_SUBNET_JSON")',
    'ROUTE_JSON=$(oci network route-table get --rt-id "$ROUTE_TABLE_ID" --output json "${CTX[@]}")',
    'NAT_ROUTE_COUNT=$(jq \'[.data."route-rules"[]? | select((."network-entity-id" // "") | startswith("ocid1.natgateway."))] | length\' <<<"$ROUTE_JSON")',
    'SGW_ROUTE_COUNT=$(jq \'[.data."route-rules"[]? | select((."network-entity-id" // "") | startswith("ocid1.servicegateway."))] | length\' <<<"$ROUTE_JSON")',
    '[[ "$NAT_ROUTE_COUNT" != "0" && "$SGW_ROUTE_COUNT" != "0" ]] || { echo "[ABORT] private subnet route table에 NAT Gateway와 Service Gateway 경로가 모두 필요합니다. NAT=$NAT_ROUTE_COUNT SGW=$SGW_ROUTE_COUNT" >&2; exit 1; }',
    'echo "[DISCOVERED] compartment=$COMPARTMENT_ID vcn=$VCN_ID subnet=$SUBNET_ID log-group=$LOG_GROUP_ID"',
    'echo "[NETWORK] private subnet confirmed; NAT routes=$NAT_ROUTE_COUNT, Service Gateway routes=$SGW_ROUTE_COUNT"',
    '',
    'if [[ "$MODE" == "PLAN" ]]; then',
    '  echo "[PLAN] no resource will be changed."',
    '  oci network nsg list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --all --query \'data[].{name:"display-name",id:id,state:"lifecycle-state"}\' --output table "${CTX[@]}"',
    '  oci artifacts container repository list --compartment-id "$COMPARTMENT_ID" --all --query \'data[].{name:"display-name",immutable:"is-immutable",id:id}\' --output table "${CTX[@]}"',
    '  oci fn application list --compartment-id "$COMPARTMENT_ID" --all --query \'data[].{name:"display-name",id:id,state:"lifecycle-state"}\' --output table "${CTX[@]}"',
    '  echo "[NEXT] APPLY will create/reuse two NSGs, three immutable repositories, one Function application, three functions, Runtime IAM, schedule and invoke log."',
    '  echo "[NEXT] customer cross-tenancy Admit/Endorse and any API-key bridge stay out of this script and require separately approved tenant-specific policies."',
    '  exit 0',
    'fi',
    '',
    '# 2. Apply — create only if missing; an existing name must still satisfy the expected invariant.',
    'ensure_nsg() {',
    '  local name="$1" json count id immutable',
    '  json=$(oci network nsg list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name "$name" --all --output json "${CTX[@]}")',
    '  count=$(jq --arg n "$name" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$json")',
    '  [[ "$count" != "0" && "$count" != "1" ]] && { echo "[ABORT] NSG name collision: $name (found=$count)" >&2; exit 1; }',
    '  if [[ "$count" == "0" ]]; then',
    '    echo "[CREATE] NSG $name" >&2',
    '    id=$(oci network nsg create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --display-name "$name" --wait-for-state AVAILABLE --query \'data.id\' --raw-output "${CTX[@]}")',
    '  else id=$(jq -r --arg n "$name" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$json"); fi',
    '  printf "%s" "$id"',
    '}',
    'ensure_repo() {',
    '  local name="$1" json count id immutable',
    '  json=$(oci artifacts container repository list --compartment-id "$COMPARTMENT_ID" --display-name "$name" --all --output json "${CTX[@]}")',
    '  count=$(jq --arg n "$name" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$json")',
    '  [[ "$count" != "0" && "$count" != "1" ]] && { echo "[ABORT] OCIR repository name collision: $name (found=$count)" >&2; exit 1; }',
    '  if [[ "$count" == "0" ]]; then',
    '    echo "[CREATE] immutable OCIR repository $name" >&2',
    '    id=$(oci artifacts container repository create --compartment-id "$COMPARTMENT_ID" --display-name "$name" --is-immutable true --wait-for-state AVAILABLE --query \'data.id\' --raw-output "${CTX[@]}")',
    '  else',
    '    immutable=$(jq -r --arg n "$name" \'[.data[]? | select(."display-name" == $n)][0]."is-immutable" // false\' <<<"$json")',
    '    [[ "$immutable" == "true" ]] || { echo "[ABORT] existing repository is not immutable: $name" >&2; exit 1; }',
    '    id=$(jq -r --arg n "$name" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$json")',
    '  fi',
    '  printf "%s" "$id"',
    '}',
    'ensure_dynamic_group() {',
    '  local name="$1" rule="$2" json count id actual',
    '  json=$(oci iam dynamic-group list --compartment-id "$TENANCY_ID" --name "$name" --lifecycle-state ACTIVE --all --output json "${CTX[@]}")',
    '  count=$(jq --arg n "$name" \'[.data[]? | select(.name == $n)] | length\' <<<"$json")',
    '  [[ "$count" != "0" && "$count" != "1" ]] && { echo "[ABORT] dynamic group name collision: $name (found=$count)" >&2; exit 1; }',
    '  if [[ "$count" == "0" ]]; then',
    '    echo "[CREATE] dynamic group $name" >&2',
    '    id=$(oci iam dynamic-group create --compartment-id "$TENANCY_ID" --name "$name" --description "WizOCM Functions least-privilege principal" --matching-rule "$rule" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}")',
    '  else',
    '    id=$(jq -r --arg n "$name" \'[.data[]? | select(.name == $n)][0].id\' <<<"$json")',
    '    actual=$(oci iam dynamic-group get --dynamic-group-id "$id" --query \'data."matching-rule"\' --raw-output "${CTX[@]}")',
    '    [[ "$actual" == "$rule" ]] || { echo "[ABORT] dynamic group matching rule differs: $name" >&2; exit 1; }',
    '  fi',
    '  printf "%s" "$id"',
    '}',
    'ensure_policy() {',
    '  local name="$1" statements="$2" json count id current expected',
    '  json=$(oci iam policy list --compartment-id "$TENANCY_ID" --name "$name" --lifecycle-state ACTIVE --all --output json "${CTX[@]}")',
    '  count=$(jq --arg n "$name" \'[.data[]? | select(.name == $n)] | length\' <<<"$json")',
    '  [[ "$count" != "0" && "$count" != "1" ]] && { echo "[ABORT] policy name collision: $name (found=$count)" >&2; exit 1; }',
    '  if [[ "$count" == "0" ]]; then',
    '    echo "[CREATE] policy $name" >&2',
    '    oci iam policy create --compartment-id "$TENANCY_ID" --name "$name" --description "WizOCM Functions least-privilege runtime policy" --statements "$statements" --wait-for-state ACTIVE "${CTX[@]}" >/dev/null',
    '  else',
    '    id=$(jq -r --arg n "$name" \'[.data[]? | select(.name == $n)][0].id\' <<<"$json")',
    '    current=$(oci iam policy get --policy-id "$id" --output json "${CTX[@]}" | jq -c \'.data.statements | sort\')',
    '    expected=$(jq -c \'sort\' <<<"$statements")',
    '    [[ "$current" == "$expected" ]] || { echo "[ABORT] existing policy statements differ: $name" >&2; exit 1; }',
    '  fi',
    '}',
    'FUNCTIONS_NSG_ID=$(ensure_nsg "nsg-wizocm-functions-prod")',
    'SPRING_NSG_ID=$(ensure_nsg "nsg-wizocm-spring-prod")',
    'FUNCTIONS_RULES=$(jq -nc --arg spring "$SPRING_NSG_ID" \'[{direction:"EGRESS",protocol:"6",destination:$spring,destinationType:"NETWORK_SECURITY_GROUP",isStateless:false,tcpOptions:{destinationPortRange:{min:8080,max:8080}},description:"Functions to Spring internal API"},{direction:"EGRESS",protocol:"6",destination:"0.0.0.0/0",destinationType:"CIDR_BLOCK",isStateless:false,tcpOptions:{destinationPortRange:{min:443,max:443}},description:"HTTPS through private subnet egress"}]\')',
    'SPRING_RULES=$(jq -nc --arg functions "$FUNCTIONS_NSG_ID" \'[{direction:"INGRESS",protocol:"6",source:$functions,sourceType:"NETWORK_SECURITY_GROUP",isStateless:false,tcpOptions:{destinationPortRange:{min:8080,max:8080}},description:"Functions to Spring internal API"}]\')',
    'add_rules_if_missing() {',
    '  local nsg="$1" rules="$2" json',
    '  json=$(oci network nsg rules list --nsg-id "$nsg" --all --output json "${CTX[@]}")',
    '  if jq -e --argjson required "$rules" \'[.data[]? | {direction,protocol,source,destination,sourceType,destinationType,tcpOptions}] as $have | [$required[] | select(. as $need | ($have | any(.direction == $need.direction and .protocol == $need.protocol and (.source // "") == ($need.source // "") and (.destination // "") == ($need.destination // "")) | not)] | length == 0\' <<<"$json" >/dev/null; then',
    '    echo "[REUSE] NSG rules already present: $nsg" >&2',
    '  else',
    '    echo "[MERGE] add missing NSG rules: $nsg" >&2',
    '    oci network nsg rules add --nsg-id "$nsg" --security-rules "$rules" "${CTX[@]}" >/dev/null',
    '  fi',
    '}',
    'add_rules_if_missing "$FUNCTIONS_NSG_ID" "$FUNCTIONS_RULES"',
    'add_rules_if_missing "$SPRING_NSG_ID" "$SPRING_RULES"',
    'VNIC_JSON=$(oci network vnic get --vnic-id "$SPRING_VNIC_ID" --output json "${CTX[@]}")',
    'MERGED_NSG_IDS=$(jq -c --arg id "$SPRING_NSG_ID" \'(.data."nsg-ids" // []) + [$id] | unique\' <<<"$VNIC_JSON")',
    'if [[ "$MERGED_NSG_IDS" != "$(jq -c \'.data."nsg-ids" // []\' <<<"$VNIC_JSON")" ]]; then',
    '  oci network vnic update --vnic-id "$SPRING_VNIC_ID" --nsg-ids "$MERGED_NSG_IDS" --force --wait-for-state AVAILABLE "${CTX[@]}" >/dev/null',
    'else echo "[REUSE] Spring VNIC already has the Functions NSG" >&2; fi',
    'ADVISOR_REPO_ID=$(ensure_repo "wizocm/functions/cloud-advisor")',
    'DISPATCHER_REPO_ID=$(ensure_repo "wizocm/functions/dispatcher")',
    'WORKER_REPO_ID=$(ensure_repo "wizocm/functions/worker")',
    'for repo in "wizocm/functions/cloud-advisor" "wizocm/functions/dispatcher" "wizocm/functions/worker"; do',
    '  IMAGE_COUNT=$(oci artifacts container image list --compartment-id "$COMPARTMENT_ID" --repository-name "$repo" --image-version "$RELEASE_VERSION" --all --query \'length(data)\' --raw-output "${CTX[@]}")',
    '  [[ "$IMAGE_COUNT" != "0" ]] || { echo "[ABORT] immutable image tag not found in OCIR: $repo:$RELEASE_VERSION. Build/push first." >&2; exit 1; }',
    'done',
    'APP_NAME="wizocm-cost-functions-prod"',
    'APP_CONFIG=$(jq -nc --arg u "$SPRING_INTERNAL_URL" --arg s "$HMAC_SECRET_OCID" \'{APP_ENV:"prod",SPRING_INTERNAL_URL:$u,HMAC_SECRET_OCID:$s}\')',
    'APP_JSON=$(oci fn application list --compartment-id "$COMPARTMENT_ID" --display-name "$APP_NAME" --all --output json "${CTX[@]}")',
    'COUNT=$(jq --arg n "$APP_NAME" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$APP_JSON")',
    '[[ "$COUNT" != "0" && "$COUNT" != "1" ]] && { echo "[ABORT] Function application name collision: $APP_NAME (found=$COUNT)" >&2; exit 1; }',
    'if [[ "$COUNT" == "0" ]]; then',
    '  echo "[CREATE] Function application $APP_NAME" >&2',
    '  FUNCTION_APP_ID=$(oci fn application create --compartment-id "$COMPARTMENT_ID" --display-name "$APP_NAME" --subnet-ids "[\\\"$SUBNET_ID\\\"]" --network-security-group-ids "[\\\"$FUNCTIONS_NSG_ID\\\"]" --shape GENERIC_X86 --config "$APP_CONFIG" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}")',
    'else',
    '  FUNCTION_APP_ID=$(jq -r --arg n "$APP_NAME" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$APP_JSON")',
    '  APP_GET=$(oci fn application get --application-id "$FUNCTION_APP_ID" --output json "${CTX[@]}")',
    '  jq -e --arg subnet "$SUBNET_ID" --arg nsg "$FUNCTIONS_NSG_ID" \'((.data."subnet-ids" | index($subnet)) != null) and ((.data."network-security-group-ids" | index($nsg)) != null)\' <<<"$APP_GET" >/dev/null || { echo "[ABORT] existing Function application network differs; automatic update is refused." >&2; exit 1; }',
    'fi',
    'ensure_function() {',
    '  local name="$1" memory="$2" timeout="$3" detached="$4" image="$5" config="$6" json count id get current_config merged',
    '  json=$(oci fn function list --application-id "$FUNCTION_APP_ID" --display-name "$name" --all --output json "${CTX[@]}")',
    '  count=$(jq --arg n "$name" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$json")',
    '  [[ "$count" != "0" && "$count" != "1" ]] && { echo "[ABORT] Function name collision: $name (found=$count)" >&2; exit 1; }',
    '  if [[ "$count" == "0" ]]; then',
    '    echo "[CREATE] Function $name" >&2',
    '    id=$(oci fn function create --application-id "$FUNCTION_APP_ID" --display-name "$name" --image "$image" --memory-in-mbs "$memory" --timeout-in-seconds "$timeout" --detached-mode-timeout-in-seconds "$detached" --config "$config" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}")',
    '  else',
    '    id=$(jq -r --arg n "$name" \'[.data[]? | select(."display-name" == $n)][0].id\' <<<"$json")',
    '    get=$(oci fn function get --function-id "$id" --output json "${CTX[@]}")',
    '    jq -e --arg img "$image" --argjson m "$memory" --argjson t "$timeout" --argjson d "$detached" \'.data.image == $img and .data."memory-in-mbs" == $m and .data."timeout-in-seconds" == $t and .data."detached-mode-timeout-in-seconds" == $d\' <<<"$get" >/dev/null || { echo "[ABORT] existing Function immutable runtime settings/image differ: $name" >&2; exit 1; }',
    '    current_config=$(jq -c \'.data.config // {}\' <<<"$get")',
    '    merged=$(jq -nc --argjson current "$current_config" --argjson expected "$config" \'$current + $expected\')',
    '    if [[ "$merged" != "$current_config" ]]; then',
    '      echo "[MERGE] Function config (existing keys retained): $name" >&2',
    '      oci fn function update --function-id "$id" --config "$merged" --wait-for-state ACTIVE --force "${CTX[@]}" >/dev/null',
    '    fi',
    '  fi',
    '  printf "%s" "$id"',
    '}',
    'ADVISOR_FUNCTION_ID=$(ensure_function "wizocm-cloud-advisor-query-prod" 512 60 60 "icn.ocir.io/$OCIR_NAMESPACE/wizocm/functions/cloud-advisor:$RELEASE_VERSION" "{}")',
    'WORKER_FUNCTION_ID=$(ensure_function "wizocm-cost-worker-prod" 2048 300 1800 "icn.ocir.io/$OCIR_NAMESPACE/wizocm/functions/worker:$RELEASE_VERSION" "{}")',
    'DISPATCHER_CONFIG=$(jq -nc --arg worker "$WORKER_FUNCTION_ID" \'{WORKER_FUNCTION_OCID:$worker}\')',
    'DISPATCHER_FUNCTION_ID=$(ensure_function "wizocm-cost-dispatcher-prod" 512 60 600 "icn.ocir.io/$OCIR_NAMESPACE/wizocm/functions/dispatcher:$RELEASE_VERSION" "$DISPATCHER_CONFIG")',
    'ADVISOR_DG_ID=$(ensure_dynamic_group "dg-wizocm-fn-advisor-prod" "ALL {resource.type=\'fnfunc\', resource.id=\'$ADVISOR_FUNCTION_ID\'}")',
    'DISPATCHER_DG_ID=$(ensure_dynamic_group "dg-wizocm-fn-dispatcher-prod" "ALL {resource.type=\'fnfunc\', resource.id=\'$DISPATCHER_FUNCTION_ID\'}")',
    'WORKER_DG_ID=$(ensure_dynamic_group "dg-wizocm-fn-worker-prod" "ALL {resource.type=\'fnfunc\', resource.id=\'$WORKER_FUNCTION_ID\'}")',
    'SPRING_DG_ID=$(ensure_dynamic_group "dg-wizocm-spring-prod" "instance.id=\'$SPRING_INSTANCE_ID\'")',
    'SQ=$(printf "\\47")',
    'RUNTIME_STATEMENTS=$(jq -nc --arg c "$COMPARTMENT_ID" --arg secret "$HMAC_SECRET_OCID" --arg sq "$SQ" \'["Allow dynamic-group dg-wizocm-fn-dispatcher-prod to use fn-invocation in compartment id " + $c, "Allow dynamic-group dg-wizocm-fn-dispatcher-prod to read secret-bundles in compartment id " + $c + " where target.secret.id=" + $sq + $secret + $sq, "Allow dynamic-group dg-wizocm-fn-worker-prod to read secret-bundles in compartment id " + $c + " where target.secret.id=" + $sq + $secret + $sq, "Allow dynamic-group dg-wizocm-spring-prod to read secret-bundles in compartment id " + $c + " where target.secret.id=" + $sq + $secret + $sq]\')',
    'ensure_policy "wizocm-functions-runtime-prod" "$RUNTIME_STATEMENTS"',
    'SCHEDULE_NAME="wizocm-cost-daily-prod"',
    'SCHEDULE_JSON=$(oci resource-scheduler schedule list --compartment-id "$COMPARTMENT_ID" --display-name "$SCHEDULE_NAME" --all --output json "${CTX[@]}")',
    'COUNT=$(jq --arg n "$SCHEDULE_NAME" \'[(.data.items[]?, .data[]?) | select(."display-name" == $n)] | length\' <<<"$SCHEDULE_JSON")',
    '[[ "$COUNT" != "0" && "$COUNT" != "1" ]] && { echo "[ABORT] schedule name collision: $SCHEDULE_NAME (found=$COUNT)" >&2; exit 1; }',
    'SCHEDULE_RESOURCES=$(jq -nc --arg id "$DISPATCHER_FUNCTION_ID" \'[{id:$id,metadata:{},parameters:[{parameterType:"BODY",value:{mode:"daily",asOf:"AUTO",dryRun:"false"}}]}]\')',
    'if [[ "$COUNT" == "0" ]]; then',
    '  echo "[CREATE] Resource Scheduler daily dispatcher" >&2',
    '  SCHEDULE_ID=$(oci resource-scheduler schedule create --compartment-id "$COMPARTMENT_ID" --display-name "$SCHEDULE_NAME" --description "Invoke WizOCM dispatcher daily; UTC cron" --action START_RESOURCE --recurrence-type CRON --recurrence-details "$SCHEDULE_CRON" --resources "$SCHEDULE_RESOURCES" --wait-for-state SUCCEEDED --query \'data.id\' --raw-output "${CTX[@]}")',
    'else',
    '  SCHEDULE_ID=$(jq -r --arg n "$SCHEDULE_NAME" \'[(.data.items[]?, .data[]?) | select(."display-name" == $n)][0].id\' <<<"$SCHEDULE_JSON")',
    '  oci resource-scheduler schedule get --schedule-id "$SCHEDULE_ID" --output json "${CTX[@]}" | jq -e --arg id "$DISPATCHER_FUNCTION_ID" \'.data.resources[]? | select(.id == $id)\' >/dev/null || { echo "[ABORT] existing schedule does not target the expected dispatcher Function." >&2; exit 1; }',
    'fi',
    'SCHEDULER_DG_ID=$(ensure_dynamic_group "dg-wizocm-scheduler-prod" "ALL {resource.type=\'resourceschedule\', resource.id=\'$SCHEDULE_ID\'}")',
    'SCHEDULER_STATEMENTS=$(jq -nc \'["Allow dynamic-group dg-wizocm-scheduler-prod to manage functions-family in tenancy"]\')',
    'ensure_policy "wizocm-functions-scheduler-prod" "$SCHEDULER_STATEMENTS"',
    'LOG_NAME="wizocm-functions-invoke-prod"',
    'LOG_JSON=$(oci logging log list --log-group-id "$LOG_GROUP_ID" --display-name "$LOG_NAME" --all --output json "${CTX[@]}")',
    'COUNT=$(jq --arg n "$LOG_NAME" \'[.data[]? | select(."display-name" == $n)] | length\' <<<"$LOG_JSON")',
    '[[ "$COUNT" != "0" && "$COUNT" != "1" ]] && { echo "[ABORT] invoke log name collision: $LOG_NAME (found=$COUNT)" >&2; exit 1; }',
    'if [[ "$COUNT" == "0" ]]; then',
    '  FN_LOG_CONFIG=$(jq -nc --arg c "$COMPARTMENT_ID" --arg app "$FUNCTION_APP_ID" \'{archiving:{isEnabled:true},compartmentId:$c,source:{resource:$app,service:"functions",sourceType:"OCISERVICE",category:"invoke"}}\')',
    '  echo "[CREATE] Functions invoke log" >&2',
    '  oci logging log create --log-group-id "$LOG_GROUP_ID" --display-name "$LOG_NAME" --log-type SERVICE --is-enabled true --configuration "$FN_LOG_CONFIG" --wait-for-state SUCCEEDED "${CTX[@]}" >/dev/null',
    'fi',
    'HEALTH_FILE=$(mktemp); trap \'rm -f "$HEALTH_FILE"\' EXIT',
    'printf \'%s\' \'{"action":"health"}\' | oci fn function invoke --function-id "$ADVISOR_FUNCTION_ID" --file "$HEALTH_FILE" --body \'{"action":"health"}\' --fn-invoke-type sync "${CTX[@]}"',
    'echo "[VERIFY] advisor health response:"; cat "$HEALTH_FILE"; echo',
    'echo "[DONE] Functions foundation completed. Do not create customer API keys here; pilot cross-tenancy Admit/Endorse separately with the customer tenancy owner."',
  ].join('\n')
}

/* WizOCM native DevOps foundation.  It consumes an existing GitHub Connection
   OCID: OCI CLI connection create accepts a raw PAT, which belongs outside a
   static catalog and outside generated command output. */
function buildWizocmDevopsCicd(values: Record<string, string>, requestContext: string[] = []): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const q = (raw: string) => quoteCliValue(raw, true)
  return [
    '#!/usr/bin/env bash',
    '# WizOCM DevOps: native Generic Artifact → Manual Approval → one exact Compute instance.',
    '# No PAT, SSH private key, password, or artifact contents are printed by this script.',
    'set -euo pipefail',
    '',
    `MODE=${q(v('--mode', 'PLAN').toUpperCase())}`,
    `CONFIRM_APPLY=${q(v('--confirm-apply'))}`,
    `COMPARTMENT_INPUT=${q(v('--compartment-input', '<compartment-name-or-ocid>'))}`,
    `PROJECT_NAME=${q(v('--project-name', 'wizocm-native-cicd-prod'))}`,
    `REPOSITORY_NAME=${q(v('--generic-repository-name', 'wizocm-release-prod'))}`,
    `GITHUB_CONNECTION_ID=${q(v('--github-connection-id', '<github-connection-ocid>'))}`,
    `GITHUB_REPOSITORY_URL=${q(v('--github-repository-url', '<github-repository-url>'))}`,
    `GITHUB_BRANCH=${q(v('--github-branch', 'main'))}`,
    `BUILD_IMAGE=${q(v('--build-image', '<managed-build-image>'))}`,
    `BUILD_SPEC_FILE=${q(v('--build-spec-file', 'build_spec.yaml'))}`,
    `TARGET_INSTANCE_ID=${q(v('--target-instance-id', '<target-instance-ocid>'))}`,
    `RELEASE_ARTIFACT_PATH=${q(v('--release-artifact-path', 'releases/wizocm-release.zip'))}`,
    `RELEASE_VERSION_VARIABLE=${q(v('--release-version-variable', 'RELEASE_VERSION'))}`,
    `DEPLOYMENT_SPEC_FILE=${q(v('--deployment-spec-file', './deploy/deployment_spec.yaml'))}`,
    `DEPLOYMENT_SPEC_PATH=${q(v('--deployment-spec-path', 'deploy/deployment_spec.yaml'))}`,
    `DEPLOYMENT_SPEC_VERSION=${q(v('--deployment-spec-version', 'bootstrap-1'))}`,
    `ONS_TOPIC_ID=${q(v('--ons-topic-id', '<ons-topic-ocid>'))}`,
    `CTX=(${requestContext.join(' ')})`,
    '',
    'command -v jq >/dev/null 2>&1 || { echo "[ABORT] jq가 필요합니다." >&2; exit 2; }',
    '[[ "$MODE" == "PLAN" || "$MODE" == "APPLY" ]] || { echo "[ABORT] MODE는 PLAN 또는 APPLY여야 합니다." >&2; exit 2; }',
    '[[ "$GITHUB_CONNECTION_ID" == ocid1.devopsconnection.* ]] || { echo "[ABORT] 기존 GitHub Connection OCID가 필요합니다. PAT 원문은 입력하지 않습니다." >&2; exit 2; }',
    '[[ "$TARGET_INSTANCE_ID" == ocid1.instance.* ]] || { echo "[ABORT] 정확히 1개인 target instance OCID가 필요합니다." >&2; exit 2; }',
    '[[ "$ONS_TOPIC_ID" == ocid1.onstopic.* ]] || { echo "[ABORT] OCI DevOps Project 생성에는 notification-config가 필수입니다. 기존 ONS Topic OCID를 입력하세요." >&2; exit 2; }',
    '[[ "$BUILD_IMAGE" != "<managed-build-image>" && -n "$BUILD_IMAGE" ]] || { echo "[ABORT] Console에서 확인한 현재 Managed Build image를 입력하세요." >&2; exit 2; }',
    '[[ "$RELEASE_VERSION_VARIABLE" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "[ABORT] release version 변수명은 shell identifier여야 합니다." >&2; exit 2; }',
    'if [[ "$MODE" == "APPLY" && "$CONFIRM_APPLY" != "APPLY_WIZOCM_DEVOPS" ]]; then echo "[ABORT] APPLY에는 --confirm-apply 값이 APPLY_WIZOCM_DEVOPS와 완전히 같아야 합니다." >&2; exit 2; fi',
    '',
    '# Discover: name lookups reject 0/N matches instead of selecting the first resource.',
    'TENANCY_ID=$(oci iam availability-domain list --query \'data[0]."compartment-id"\' --raw-output "${CTX[@]}")',
    '[[ "$TENANCY_ID" == ocid1.tenancy.* ]] || { echo "[ABORT] profile의 tenancy OCID를 찾지 못했습니다." >&2; exit 2; }',
    'if [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* ]]; then COMPARTMENT_ID="$COMPARTMENT_INPUT"; else',
    '  COMPARTMENT_JSON=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --output json "${CTX[@]}")',
    '  COUNT=$(jq --arg n "$COMPARTMENT_INPUT" \'[.data[]? | select(.name == $n)] | length\' <<<"$COMPARTMENT_JSON")',
    '  [[ "$COUNT" == "1" ]] || { echo "[ABORT] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COUNT)" >&2; exit 1; }',
    '  COMPARTMENT_ID=$(jq -r --arg n "$COMPARTMENT_INPUT" \'[.data[]? | select(.name == $n)][0].id\' <<<"$COMPARTMENT_JSON")',
    'fi',
    'INSTANCE_JSON=$(oci compute instance get --instance-id "$TARGET_INSTANCE_ID" --output json "${CTX[@]}")',
    '[[ $(jq -r \'.data."compartment-id"\' <<<"$INSTANCE_JSON") == "$COMPARTMENT_ID" ]] || { echo "[ABORT] target instance가 DevOps Project compartment와 다릅니다. 교차 compartment 자동 배포는 허용하지 않습니다." >&2; exit 1; }',
    'oci devops connection get --connection-id "$GITHUB_CONNECTION_ID" --output json "${CTX[@]}" >/dev/null',
    'oci ons topic get --topic-id "$ONS_TOPIC_ID" --output json "${CTX[@]}" >/dev/null',
    'echo "[DISCOVERED] compartment=$COMPARTMENT_ID target-instance=$TARGET_INSTANCE_ID project=$PROJECT_NAME"',
    'if [[ "$MODE" == "PLAN" ]]; then',
    '  echo "[PLAN] no resource will be changed. PAT is deliberately absent; the supplied GitHub Connection is only read."',
    '  oci devops project list --compartment-id "$COMPARTMENT_ID" --all --query \'data.items[].{name:name,id:id,state:lifecycleState}\' --output table "${CTX[@]}"',
    '  oci artifacts repository list --compartment-id "$COMPARTMENT_ID" --all --query \'data[].{name:"display-name",id:id,immutable:"is-immutable"}\' --output table "${CTX[@]}"',
    '  echo "[NEXT] APPLY creates/reuses Project, immutable Generic Repository, exact-instance Environment, artifact references, Build→Deliver→Trigger, then Manual Approval→Compute stages."',
    '  echo "[CONTRACT] build_spec must export $RELEASE_VERSION_VARIABLE as an immutable release version; deployment spec must validate and activate a versioned release with health checks."',
    '  exit 0',
    'fi',
    '',
    '[[ -f "$DEPLOYMENT_SPEC_FILE" ]] || { echo "[ABORT] deployment spec file not found on this host: $DEPLOYMENT_SPEC_FILE" >&2; exit 1; }',
    'find_named_id() {',
    '  local label="$1" name="$2"; shift 2; local json count',
    '  json=$("$@" --display-name "$name" --all --output json "${CTX[@]}")',
    '  count=$(jq --arg n "$name" \'[(.data.items[]?, .data[]?) | select((.name // ."display-name") == $n)] | length\' <<<"$json")',
    '  [[ "$count" != "0" && "$count" != "1" ]] && { echo "[ABORT] $label name collision: $name (found=$count)" >&2; exit 1; }',
    '  [[ "$count" == "1" ]] || return 3',
    '  jq -r --arg n "$name" \'[(.data.items[]?, .data[]?) | select((.name // ."display-name") == $n)][0].id\' <<<"$json"',
    '}',
    'PROJECT_NOTIFICATION=$(jq -nc --arg id "$ONS_TOPIC_ID" \'{topicId:$id}\')',
    'if PROJECT_ID=$(find_named_id "DevOps Project" "$PROJECT_NAME" oci devops project list --compartment-id "$COMPARTMENT_ID"); then echo "[REUSE] DevOps Project $PROJECT_NAME" >&2; else PROJECT_ID=$(oci devops project create --compartment-id "$COMPARTMENT_ID" --name "$PROJECT_NAME" --notification-config "$PROJECT_NOTIFICATION" --description "WizOCM native CI/CD control plane" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'if REPOSITORY_ID=$(find_named_id "Generic Artifact Repository" "$REPOSITORY_NAME" oci artifacts repository list --compartment-id "$COMPARTMENT_ID"); then',
    '  REPO_GET=$(oci artifacts repository get --repository-id "$REPOSITORY_ID" --output json "${CTX[@]}")',
    '  jq -e \'.data."is-immutable" == true\' <<<"$REPO_GET" >/dev/null || { echo "[ABORT] existing Generic Artifact Repository must be immutable: $REPOSITORY_NAME" >&2; exit 1; }',
    '  echo "[REUSE] immutable Generic Artifact Repository $REPOSITORY_NAME" >&2',
    'else REPOSITORY_ID=$(oci artifacts repository create-generic-repository --compartment-id "$COMPARTMENT_ID" --display-name "$REPOSITORY_NAME" --is-immutable true --wait-for-state AVAILABLE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'if oci artifacts generic artifact get-by-path --repository-id "$REPOSITORY_ID" --artifact-path "$DEPLOYMENT_SPEC_PATH" --artifact-version "$DEPLOYMENT_SPEC_VERSION" "${CTX[@]}" >/dev/null 2>&1; then echo "[REUSE] immutable deployment spec artifact already exists" >&2; else oci artifacts generic artifact upload-by-path --repository-id "$REPOSITORY_ID" --artifact-path "$DEPLOYMENT_SPEC_PATH" --artifact-version "$DEPLOYMENT_SPEC_VERSION" --content-body "$DEPLOYMENT_SPEC_FILE" "${CTX[@]}" >/dev/null; fi',
    'if BUILD_PIPELINE_ID=$(find_named_id "Build pipeline" "wizocm-ci-build-prod" oci devops build-pipeline list --project-id "$PROJECT_ID" --compartment-id "$COMPARTMENT_ID"); then echo "[REUSE] Build pipeline" >&2; else BUILD_PIPELINE_ID=$(oci devops build-pipeline create --project-id "$PROJECT_ID" --display-name "wizocm-ci-build-prod" --description "WizOCM immutable release build" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'if DEPLOY_PIPELINE_ID=$(find_named_id "Deploy pipeline" "wizocm-cd-deploy-prod" oci devops deploy-pipeline list --project-id "$PROJECT_ID" --compartment-id "$COMPARTMENT_ID"); then echo "[REUSE] Deploy pipeline" >&2; else DEPLOY_PIPELINE_ID=$(oci devops deploy-pipeline create --project-id "$PROJECT_ID" --display-name "wizocm-cd-deploy-prod" --description "Manual approval before one-instance deployment" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'INSTANCE_SELECTORS=$(jq -nc --arg id "$TARGET_INSTANCE_ID" \'{items:[{computeInstanceIds:[$id],selectorType:"INSTANCE_IDS"}]}\')',
    'if ENVIRONMENT_ID=$(find_named_id "Compute environment" "wizocm-prod-exact-instance" oci devops deploy-environment list --project-id "$PROJECT_ID" --compartment-id "$COMPARTMENT_ID"); then echo "[REUSE] exact-instance environment" >&2; else ENVIRONMENT_ID=$(oci devops deploy-environment create-compute-instance-environment --project-id "$PROJECT_ID" --display-name "wizocm-prod-exact-instance" --compute-instance-group-selectors "$INSTANCE_SELECTORS" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'RELEASE_ARTIFACT_VERSION="\\${${RELEASE_VERSION_VARIABLE}}"',
    'ensure_deploy_artifact() {',
    '  local name="$1" path="$2" version="$3" type="$4" substitution="$5" id',
    '  if id=$(find_named_id "Deploy artifact" "$name" oci devops deploy-artifact list --project-id "$PROJECT_ID" --compartment-id "$COMPARTMENT_ID"); then printf "%s" "$id"; return; fi',
    '  oci devops deploy-artifact create-generic-artifact --project-id "$PROJECT_ID" --display-name "$name" --repository-id "$REPOSITORY_ID" --artifact-path "$path" --artifact-version "$version" --artifact-type "$type" --argument-substitution-mode "$substitution" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"',
    '}',
    'RELEASE_ARTIFACT_ID=$(ensure_deploy_artifact "wizocm-release-zip" "$RELEASE_ARTIFACT_PATH" "$RELEASE_ARTIFACT_VERSION" GENERIC_FILE NONE)',
    'DEPLOYMENT_SPEC_ARTIFACT_ID=$(ensure_deploy_artifact "wizocm-deployment-spec" "$DEPLOYMENT_SPEC_PATH" "$DEPLOYMENT_SPEC_VERSION" DEPLOYMENT_SPEC SUBSTITUTE_PLACEHOLDERS)',
    'EMPTY_PREDECESSORS=\'{"items":[]}\'',
    'BUILD_SOURCE=$(jq -nc --arg branch "$GITHUB_BRANCH" --arg connection "$GITHUB_CONNECTION_ID" --arg url "$GITHUB_REPOSITORY_URL" \'{items:[{name:"wizocm-source",branch:$branch,connectionId:$connection,connectionType:"GITHUB",repositoryUrl:$url}]}\')',
    'find_build_stage() { find_named_id "Build stage" "$1" oci devops build-pipeline-stage list --build-pipeline-id "$BUILD_PIPELINE_ID" --compartment-id "$COMPARTMENT_ID"; }',
    'if BUILD_STAGE_ID=$(find_build_stage "wizocm-build"); then echo "[REUSE] Build stage" >&2; else BUILD_STAGE_ID=$(oci devops build-pipeline-stage create-build-stage --build-pipeline-id "$BUILD_PIPELINE_ID" --display-name "wizocm-build" --image "$BUILD_IMAGE" --build-source-collection "$BUILD_SOURCE" --primary-build-source wizocm-source --build-spec-file "$BUILD_SPEC_FILE" --stage-predecessor-collection "$EMPTY_PREDECESSORS" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'DELIVER_PREDECESSORS=$(jq -nc --arg id "$BUILD_STAGE_ID" \'{items:[{id:$id}]}\')',
    'DELIVER_ARTIFACTS=$(jq -nc --arg id "$RELEASE_ARTIFACT_ID" \'{items:[{artifactId:$id,artifactName:"wizocm-release-zip"}]}\')',
    'if DELIVER_STAGE_ID=$(find_build_stage "wizocm-deliver-release"); then echo "[REUSE] Deliver stage" >&2; else DELIVER_STAGE_ID=$(oci devops build-pipeline-stage create-deliver-artifact-stage --build-pipeline-id "$BUILD_PIPELINE_ID" --display-name "wizocm-deliver-release" --deliver-artifact-collection "$DELIVER_ARTIFACTS" --stage-predecessor-collection "$DELIVER_PREDECESSORS" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'TRIGGER_PREDECESSORS=$(jq -nc --arg id "$DELIVER_STAGE_ID" \'{items:[{id:$id}]}\')',
    'if TRIGGER_STAGE_ID=$(find_build_stage "wizocm-trigger-deploy"); then echo "[REUSE] Trigger deployment stage" >&2; else TRIGGER_STAGE_ID=$(oci devops build-pipeline-stage create-trigger-deployment-stage --build-pipeline-id "$BUILD_PIPELINE_ID" --display-name "wizocm-trigger-deploy" --deploy-pipeline-id "$DEPLOY_PIPELINE_ID" --is-pass-all-parameters-enabled true --stage-predecessor-collection "$TRIGGER_PREDECESSORS" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'find_deploy_stage() { find_named_id "Deploy stage" "$1" oci devops deploy-stage list --pipeline-id "$DEPLOY_PIPELINE_ID" --compartment-id "$COMPARTMENT_ID"; }',
    'APPROVAL_POLICY=\'{"approvalPolicyType":"COUNT_BASED_APPROVAL","numberOfApprovalsRequired":1}\'',
    'if APPROVAL_STAGE_ID=$(find_deploy_stage "wizocm-manual-approval"); then echo "[REUSE] Manual approval stage" >&2; else APPROVAL_STAGE_ID=$(oci devops deploy-stage create-manual-approval-stage --pipeline-id "$DEPLOY_PIPELINE_ID" --display-name "wizocm-manual-approval" --approval-policy "$APPROVAL_POLICY" --stage-predecessor-collection "$EMPTY_PREDECESSORS" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'DEPLOY_PREDECESSORS=$(jq -nc --arg id "$APPROVAL_STAGE_ID" \'{items:[{id:$id}]}\')',
    'ROLLOUT_POLICY=\'{"policyType":"COMPUTE_INSTANCE_GROUP_LINEAR_ROLLOUT_POLICY_BY_COUNT","batchCount":1,"batchDelayInSeconds":0}\'',
    'FAILURE_POLICY=\'{"policyType":"COMPUTE_INSTANCE_GROUP_FAILURE_POLICY_BY_COUNT","failureCount":1}\'',
    'ROLLBACK_POLICY=\'{"policyType":"NO_STAGE_ROLLBACK_POLICY"}\'',
    'if DEPLOY_STAGE_ID=$(find_deploy_stage "wizocm-deploy-exact-instance"); then echo "[REUSE] Compute deployment stage" >&2; else DEPLOY_STAGE_ID=$(oci devops deploy-stage create-deploy-compute-instance-group-stage --pipeline-id "$DEPLOY_PIPELINE_ID" --display-name "wizocm-deploy-exact-instance" --compute-instance-group-environment-id "$ENVIRONMENT_ID" --deployment-spec-artifact-id "$DEPLOYMENT_SPEC_ARTIFACT_ID" --artifact-ids "[\\\"$RELEASE_ARTIFACT_ID\\\"]" --rollout-policy "$ROLLOUT_POLICY" --failure-policy "$FAILURE_POLICY" --rollback-policy "$ROLLBACK_POLICY" --stage-predecessor-collection "$DEPLOY_PREDECESSORS" --wait-for-state ACTIVE --query \'data.id\' --raw-output "${CTX[@]}"); fi',
    'echo "[VERIFY] Build pipeline: $BUILD_PIPELINE_ID → Manual Approval: $APPROVAL_STAGE_ID → exact Instance: $TARGET_INSTANCE_ID"',
    'echo "[DONE] Review build_spec/deployment_spec, IAM agent prerequisites, artifact version contract, and stage graph before the first pipeline run."',
  ].join('\n')
}

function buildCli(
  cmd: CliCommand,
  values: Record<string, string>,
  dyn: Record<string, boolean>,
  operation: CrudVerb,
  action?: string,
  requestContext: string[] = [],
  responseContext: string[] = [],
): string {
  if (cmd.crossCopy) return buildCrossCopy(cmd.crossCopy, values, requestContext)
  if (cmd.maintenanceReboot) return buildMaintenanceReboot(values, dyn, operation === 'update' ? 'update' : 'get', requestContext)
  if (cmd.compartmentCleanup) return buildCompartmentCleanup(values, requestContext)
  if (cmd.monitoringComposition) return buildWizbaseMonitoring(values, requestContext)
  if (cmd.allSubscriptionBalances) return buildAllSubscriptionBalances(values, requestContext)
  if (cmd.iamMfaReset) return buildIamMfaReset(values, requestContext)
  if (cmd.customWorkflow === 'wizocm-functions-foundation') return buildWizocmFunctionsFoundation(values, requestContext)
  if (cmd.customWorkflow === 'wizocm-devops-cicd') return buildWizocmDevopsCicd(values, requestContext)
  if (cmd.resource === 'mysql' && operation === 'get') return buildMysqlDbSystemGet(values, dyn, requestContext, responseContext)
  if (cmd.resource === 'mysql-backup' && operation === 'create') return buildMysqlBackupCreate(values, dyn, requestContext, responseContext)
  if (cmd.manualBackup) return buildManualBackup(cmd.manualBackup, values, requestContext)

  const selected = (action ? cmd.actions?.[action] : cmd.operations?.[operation]) ?? cmd
  if (cmd.iamResource) return buildIamCommand(cmd, selected, values, dyn, requestContext, responseContext)

  const prelude: string[] = []
  const args: string[] = []
  let rootTenancyReady = false
  let jqReady = false

  const ensureRootTenancy = () => {
    if (!rootTenancyReady) {
      prelude.push(buildRootTenancyLookup(requestContext))
      rootTenancyReady = true
    }
    return '"$TENANCY_ID"'
  }
  const ensureJq = () => {
    if (!jqReady) {
      prelude.push('command -v jq >/dev/null 2>&1 || { echo "[ERROR] 동적 조회에는 jq가 필요합니다. OCI Cloud Shell에는 기본 설치되어 있습니다." >&2; exit 2; }')
      jqReady = true
    }
  }
  const resolveCompartment = (input: string, variable: string) => {
    const raw = (values[input] ?? '').trim() || '<compartment-name-or-ocid>'
    if (raw.toUpperCase() === 'ROOT') return ensureRootTenancy()
    if (raw.startsWith('ocid1.compartment.') || raw.startsWith('ocid1.tenancy.')) {
      prelude.push(
        `${variable}=${quoteCliValue(raw, true)}`,
        `[[ "$${variable}" == ocid1.compartment.* || "$${variable}" == ocid1.tenancy.* ]] || { echo "[ERROR] ${input}에는 compartment/tenancy OCID가 필요합니다." >&2; exit 2; }`,
      )
      return `"$${variable}"`
    }
    const tenancy = ensureRootTenancy()
    const nameVariable = `${variable}_NAME`
    const countVariable = `${variable}_COUNT`
    prelude.push(
      `${nameVariable}=${quoteCliValue(raw, true)}`,
      `${countVariable}=$(${formatCliCommand('oci iam compartment list', [
        `--compartment-id ${tenancy}`, `--name "$${nameVariable}"`, '--lifecycle-state ACTIVE',
        '--compartment-id-in-subtree true', '--access-level ACCESSIBLE', '--all',
        "--query 'length(data)'", '--raw-output', ...requestContext,
      ])})`,
      `if [[ "$${countVariable}" != "1" ]]; then`,
      `  echo "[ERROR] ACTIVE compartment 이름은 tenancy 전체에서 정확히 1개여야 합니다: $${nameVariable} (found=$${countVariable})" >&2`,
      formatCliCommand('  oci iam compartment list', [
        `--compartment-id ${tenancy}`, `--name "$${nameVariable}"`, '--compartment-id-in-subtree true',
        '--access-level ACCESSIBLE', '--all', "--query 'data[].{name:name,state:\"lifecycle-state\",id:id,parent:\"compartment-id\"}'",
        '--output table', ...requestContext,
      ]),
      '  exit 1',
      'fi',
      `${variable}=$(${formatCliCommand('oci iam compartment list', [
        `--compartment-id ${tenancy}`, `--name "$${nameVariable}"`, '--lifecycle-state ACTIVE',
        '--compartment-id-in-subtree true', '--access-level ACCESSIBLE', '--all',
        "--query 'data[0].id'", '--raw-output', ...requestContext,
      ])})`,
      `[[ "$${variable}" == ocid1.compartment.* ]] || { echo "[ERROR] compartment OCID 변환에 실패했습니다." >&2; exit 2; }`,
    )
    return `"$${variable}"`
  }

  const compOption = allOptions(selected).find(o => o.name === '--compartment-id')
  const compStatic = (values['--compartment-id'] ?? '').trim()
  const compDynamic = !!compOption && isDynamic(dyn, '--compartment-id') && (compOption.required || !!compStatic)
  const rootTenancyDynamic = compDynamic && !!cmd.rootTenancyLookup
  // 다른 동적 조회가 참조할 compartment 표현
  const compRef = rootTenancyDynamic
    ? ensureRootTenancy()
    : compDynamic
      ? resolveCompartment('--compartment-id', 'COMP')
      : (compStatic ? quoteCliValue(compStatic, true) : '<compartment-ocid>')

  const ensureAvailabilityDomain = (input: string, scope: string, variable: string) => {
    ensureJq()
    const raw = (values[input] ?? '').trim() || '1'
    const inputVariable = `${variable}_INPUT`
    const jsonVariable = `${variable}_JSON`
    prelude.push(
      `${inputVariable}=${quoteCliValue(raw, true)}`,
      `${jsonVariable}=$(${formatCliCommand('oci iam availability-domain list', [
        `--compartment-id ${scope}`, '--output json', ...requestContext,
      ])})`,
      `if [[ "$${inputVariable}" =~ ^[0-9]+$ ]]; then`,
      `  ${variable}=$(jq -r --argjson INDEX "$(( $${inputVariable} - 1 ))" '.data[$INDEX].name // empty' <<<"$${jsonVariable}")`,
      'else',
      `  ${variable}_COUNT=$(jq -r --arg NAME "$${inputVariable}" '[.data[]? | select(.name == $NAME)] | length' <<<"$${jsonVariable}")`,
      `  if [[ "$${variable}_COUNT" != "1" ]]; then echo "[ERROR] Availability Domain은 번호 또는 정확한 이름 1개여야 합니다: $${inputVariable} (found=$${variable}_COUNT)" >&2; exit 1; fi`,
      `  ${variable}=$(jq -r --arg NAME "$${inputVariable}" '[.data[]? | select(.name == $NAME)][0].name // empty' <<<"$${jsonVariable}")`,
      'fi',
      `[[ -n "$${variable}" ]] || { echo "[ERROR] Availability Domain을 찾지 못했습니다: $${inputVariable}" >&2; exit 1; }`,
    )
    return `"$${variable}"`
  }

  const resolveExactName = (option: CliOption, lookup: CliDynamicLookup, rawName: string, suffix = '') => {
    // 입력이 이미 OCID 면 조회를 건너뛰고 그대로 사용한다.
    // exactName 조회는 지정 compartment 범위 안에서만 매칭하므로, 다른 compartment 의 자원
    // OCID 를 붙여넣으면 found=0 으로 실패했다. OCID 는 이미 확정 식별자이니 통과시킨다.
    const trimmedName = (rawName || '').trim()
    if (/^ocid1\.[a-z0-9-]+\./i.test(trimmedName)) {
      return quoteCliValue(trimmedName, true)
    }
    ensureJq()
    const variableBase = `LOOKUP_${option.name.slice(2).replaceAll('-', '_').toUpperCase()}${suffix}`
    const inputVariable = `${variableBase}_NAME`
    const jsonVariable = `${variableBase}_JSON`
    const countVariable = `${variableBase}_COUNT`
    const idVariable = `${variableBase}_ID`
    const field = JSON.stringify(lookup.nameField ?? 'display-name')
    // 이름(nameField) 또는 OCID(.id) 어느 쪽으로 입력해도 매칭한다. 사용자가 이미 OCID 를
    // 가지고 있으면(예: Announcement) 그대로 조회 성공하도록. (name 은 ocid1.* 와 겹치지 않음)
    const itemIterator = dynamicLookupItemIterator(lookup.target)
    const scope = lookup.scope === 'tenancy'
      ? ensureRootTenancy()
      : lookup.scopeInput === '--compartment-id'
        ? compRef
        : resolveCompartment(lookup.scopeInput ?? '--lookup-compartment-id', `${variableBase}_COMPARTMENT_ID`)
    const lookupArguments = lookup.scopeArgument ? [`${lookup.scopeArgument} ${scope}`] : []
    for (const prerequisite of lookup.prerequisites ?? []) {
      if (prerequisite.kind === 'availabilityDomain') {
        lookupArguments.push(`${prerequisite.argument} ${ensureAvailabilityDomain(prerequisite.input, scope, `${variableBase}_AD`)}`)
      } else {
        lookupArguments.push(`${prerequisite.argument} ${quoteCliValue((values[prerequisite.input] ?? '').trim(), true)}`)
      }
    }
    if (lookup.supportsAll) lookupArguments.push('--all')
    lookupArguments.push('--output json', ...requestContext)
    prelude.push(
      `${inputVariable}=${quoteCliValue(rawName || lookup.inputPlaceholder, true)}`,
      `${jsonVariable}=$(${formatCliCommand(lookup.listCommand ?? '<missing-list-command>', lookupArguments)})`,
      `${countVariable}=$(jq -r --arg NAME "$${inputVariable}" '[${itemIterator} | select((.[${field}] // "") == $NAME or (.id // "") == $NAME)] | length' <<<"$${jsonVariable}")`,
      `if [[ "$${countVariable}" != "1" ]]; then`,
      `  echo "[ERROR] ${lookup.inputLabel}은(는) 조회 범위에서 정확히 1개여야 합니다: $${inputVariable} (found=$${countVariable})" >&2`,
      `  jq -r '${itemIterator} | [(.[${field}] // "-"), (."lifecycle-state" // "-"), (.id // "-")] | @tsv' <<<"$${jsonVariable}" | column -t -s $'\\t' >&2 || true`,
      '  exit 1',
      'fi',
      `${idVariable}=$(jq -r --arg NAME "$${inputVariable}" '[${itemIterator} | select((.[${field}] // "") == $NAME or (.id // "") == $NAME)][0].id // empty' <<<"$${jsonVariable}")`,
      `[[ "$${idVariable}" == ocid1.* ]] || { echo "[ERROR] ${lookup.inputLabel} OCID 변환에 실패했습니다." >&2; exit 2; }`,
    )
    return `"$${idVariable}"`
  }

  const selectedOptions = allOptions(selected).filter(option => !isExecutionContextName(option.name))
  const activeOptionNames = new Set(selectedOptions
    .filter(option => isCliOptionValueActive(option, values[option.name] ?? ''))
    .map(option => option.name))

  for (const o of selectedOptions) {
    let v = (values[o.name] ?? '').trim()
    if (o.lookupOnly) continue
    // 즐겨찾기 등 이전 저장값에 충돌 옵션이 함께 남아 있어도 결정적으로 하나만 직렬화한다.
    if (o.conflictsWith?.some(name => activeOptionNames.has(name) && name.localeCompare(o.name) < 0)) continue
    if (o.multiSelect && o.name === '--query') {
      const customQuery = (values[subKey(o.name, 'custom')] ?? '').trim()
      v = customQuery || buildMultiSelectQuery(v)
    }
    if (o.flag) {
      for (const argument of serializeCliOption(o, v)) args.push(`  ${argument}`)
      continue
    }
    // JSON 서브필드 스펙 — 값이 조립되면 넣고, 비면 생략
    if (JSONSPEC[o.name]) {
      const j = buildJsonValue(o.name, values)
      if (j) args.push(`  ${o.name} '${j}'`)
      else if (o.required) args.push(`  ${o.name} '<required-json>'`)
      continue
    }
    // 값 없는 선택 옵션은 동적 모드여도 생략 — 명령을 어지럽히지 않는다
    if (!o.required && !v) continue
    if (o.name === '--compartment-id') {
      if (rootTenancyDynamic) args.push(`  ${o.name} "$TENANCY_ID"`)
      else if (compDynamic) args.push(`  ${o.name} "$COMP"`)
      else if (v) args.push(`  ${o.name} ${quoteCliValue(v, o.shellQuote)}`)
      else if (o.required) args.push(`  ${o.name} <required:compartment-id>`)
      continue
    }
    if (o.dynamicLookup && isDynamic(dyn, o.name, true)) {
      if (o.dynamicLookup.kind === 'tenancy') {
        args.push(`  ${o.name} ${ensureRootTenancy()}`)
        continue
      }
      if (o.dynamicLookup.kind === 'compartment') {
        const resolved = resolveCompartment(o.name, `LOOKUP_${o.name.slice(2).replaceAll('-', '_').toUpperCase()}`)
        args.push(`  ${o.name} ${resolved}`)
        continue
      }
      if (o.dynamicLookup.kind === 'exactName') {
        if (o.dynamicLookup.multiple) {
          const names = v.split(/[\r\n,]+/).map(item => item.trim()).filter(Boolean)
          if (!names.length) names.push(o.dynamicLookup.inputPlaceholder)
          const resolvedIds = names.map((name, index) => resolveExactName(o, o.dynamicLookup as CliDynamicLookup, name, `_${index + 1}`))
          const jsonVariable = `LOOKUP_${o.name.slice(2).replaceAll('-', '_').toUpperCase()}_JSON`
          ensureJq()
          prelude.push(`${jsonVariable}=$(printf '%s\\n' ${resolvedIds.join(' ')} | jq -Rsc 'split("\\n") | map(select(length > 0))')`)
          args.push(`  ${o.name} "$${jsonVariable}"`)
        } else {
          args.push(`  ${o.name} ${resolveExactName(o, o.dynamicLookup, v)}`)
        }
        continue
      }
    }
    if (o.name === '--availability-domain' && isDynamic(dyn, o.name)) {
      args.push(`  ${o.name} ${ensureAvailabilityDomain(o.name, compRef, 'AVAILABILITY_DOMAIN')}`)
      continue
    }
    if (!v) {
      if (o.required) args.push(`  ${o.name} <required:${o.name.slice(2)}>`)
      continue
    }
    for (const argument of serializeCliOption(o, v)) args.push(`  ${argument}`)
  }

  args.push(...requestContext.map(argument => `  ${argument}`), ...responseContext.map(argument => `  ${argument}`))

  const main = [selected.cmd, ...args].join(' \\\n')
  return prelude.length ? ['#!/usr/bin/env bash', 'set -euo pipefail', '', ...prelude, '', main].join('\n') : main
}

export default function CliBuilderPage() {
  const { showToast, rewardActivity } = useHub()
  const protectedState = useProtectedData()
  const CAT = (protectedState.data?.cliCatalog as Catalog | undefined) ?? EMPTY_CATALOG
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const rParam = sp.get('r')                                  // Ctrl+K 딥링크: ?r=<resource>
  const [active, setActive] = useState<string>('__custom')
  const [officialCommand, setOfficialCommand] = useState<OfficialCliCommand | null>(null)
  const [officialPresentation, setOfficialPresentation] = useState<OfficialCommandPresentation>('official')
  const [sidebarView, setSidebarView] = useState<CliSidebarView>('all')
  const [recentOfficialCommands, setRecentOfficialCommands] = useState<RecentOfficialCommand[]>(loadRecentOfficialCommands())
  const [values, setValues] = useState<Record<string, string>>({})
  const [executionValues, setExecutionValues] = useState<Record<string, string>>({})
  const [dyn, setDyn] = useState<Record<string, boolean>>({})
  const [customText, setCustomText] = useState('oci ')
  const [favs, setFavs] = useState<Favorite[]>(loadFavs())
  const [showOptional, setShowOptional] = useState(false)
  const [showDeprecated, setShowDeprecated] = useState(false)
  const [contextOpen, setContextOpen] = useState(true)
  const [crudOperation, setCrudOperation] = useState<CrudVerb>('list')
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [outOpen, setOutOpen] = useState(true)          // 최종 명령 접기/펼치기
  const [outUncapped, setOutUncapped] = useState(false) // 사용자가 다시 열면 높이 제한 해제
  const [wizardOpen, setWizardOpen] = useState(false)
  const [instancePreflightInput, setInstancePreflightInput] = useState('')
  const [instancePreflightError, setInstancePreflightError] = useState('')
  // ── 프로필: 로컬 저장된 이름 후보(컴파트먼트·리소스)·리전을 골라 쓰기 ──
  const [profiles, setProfiles] = useState<OciProfile[]>(() => loadProfiles())
  const [selectedProfileName, setSelectedProfileNameState] = useState<string>(() => getSelectedProfileName())
  const [profilePaste, setProfilePaste] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const selectedProfile = profiles.find(p => p.name === selectedProfileName) ?? null
  const profileCollectScript = useMemo(() => renderProfileCollectScript(), [])
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => loadCliSidebarWidth('left'))
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => loadCliSidebarWidth('right'))
  const sidebarResizeRef = useRef<{
    side: CliSidebarSide; pointerId: number; startX: number; startWidth: number; currentWidth: number
  } | null>(null)
  const setCliSidebarWidth = (side: CliSidebarSide, width: number, persist = false) => {
    const next = clampCliSidebarWidth(side, width)
    if (side === 'left') setLeftSidebarWidth(next)
    else setRightSidebarWidth(next)
    if (persist) saveCliSidebarWidth(side, next)
    return next
  }
  const startSidebarResize = (side: CliSidebarSide, event: ReactPointerEvent<HTMLButtonElement>) => {
    const startWidth = side === 'left' ? leftSidebarWidth : rightSidebarWidth
    sidebarResizeRef.current = { side, pointerId: event.pointerId, startX: event.clientX, startWidth, currentWidth: startWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const resizeSidebar = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = sidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const delta = event.clientX - resize.startX
    resize.currentWidth = setCliSidebarWidth(resize.side, resize.startWidth + (resize.side === 'left' ? delta : -delta))
  }
  const finishSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = sidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    saveCliSidebarWidth(resize.side, resize.currentWidth)
    sidebarResizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const resizeSidebarWithKeyboard = (side: CliSidebarSide, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const config = CLI_SIDEBAR_WIDTH[side]
    const current = side === 'left' ? leftSidebarWidth : rightSidebarWidth
    let next: number | undefined
    if (event.key === 'Home') next = config.min
    else if (event.key === 'End') next = config.max
    else if (event.key === 'ArrowLeft') next = current + (side === 'left' ? -16 : 16)
    else if (event.key === 'ArrowRight') next = current + (side === 'left' ? 16 : -16)
    if (next === undefined) return
    event.preventDefault()
    setCliSidebarWidth(side, next, true)
  }

  // 팔레트에서 ?r 이 바뀌며 재진입하면 해당 자원 선택 + 카테고리 펼침
  useEffect(() => {
    if (!rParam || !CAT.commands[rParam]) return
    const operation = defaultCliOperation(CAT.commands[rParam])
    const surface = selectedSurface(CAT.commands[rParam], operation)
    setOfficialCommand(null); setOfficialPresentation('official'); setActive(rParam); setValues(operationDefaults(CAT.commands[rParam], operation)); setExecutionValues(executionContextDefaults(CAT.executionContext, surface.contextOverrides)); setDyn({}); setShowOptional(false); setShowDeprecated(false); setCrudOperation(operation); setSelectedAction(null)
    if (isAutomationRecipe(CAT.commands[rParam])) setSidebarView('automation')
  }, [rParam, CAT])

  // 검증 상태 — 내가 직접 실행해 확인한 명령만 파란색. blog-db knowledge/oci-cli/verified.json 공유.
  const pat = getPat()
  const [verified, setVerified] = useState<string[]>([])
  const vShaRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!pat && protectedState.data?.cliVerified) setVerified(protectedState.data.cliVerified)
  }, [pat, protectedState.data])
  useEffect(() => {
    if (!pat) return
    getFile(pat, 'knowledge/oci-cli/verified.json').then(f => {
      if (f) { vShaRef.current = f.sha; try { setVerified(JSON.parse(f.content).verified ?? []) } catch { /* keep */ } }
    }).catch(() => { /* 미생성/권한없음 → 빈 목록 */ })
  }, [pat])
  const usesCrudVerification = (command: CliCommand | null | undefined) => !!command
    && !command.crossCopy && !command.compartmentCleanup && !command.allSubscriptionBalances
    && (!!command.maintenanceReboot || !!command.operations)
  const verificationKey = (r: string, operation: string) => !r.startsWith('official:') && usesCrudVerification(CAT.commands[r]) ? `${r}:${operation}` : r
  const isOperationVerified = (r: string, operation: string) => verified.includes(verificationKey(r, operation))
  const isResourceVerified = (r: string) => verified.includes(r) || verified.some(key => key.startsWith(`${r}:`))
  const toggleVerified = async (r: string, operation: string, aliases: string[] = []) => {
    if (!pat) { showToast('검증 표시는 PAT 등록 후 가능'); return }
    const key = verificationKey(r, operation)
    const prev = verified
    const keys = new Set([key, ...aliases.filter(Boolean)])
    const alreadyVerified = verified.some(item => keys.has(item))
    const next = alreadyVerified ? verified.filter(item => !keys.has(item)) : [...verified, key]
    setVerified(next)
    try {
      vShaRef.current = await putFile(pat, 'knowledge/oci-cli/verified.json',
        JSON.stringify({ verified: next }, null, 2) + '\n', 'cli: 검증 상태 갱신', vShaRef.current)
    } catch (e) { showToast(`저장 실패: ${explainGhError(e)}`); setVerified(prev) }
  }

  const curatedPathMap = useMemo(() => {
    const result = new Map<string, CuratedCliTarget>()
    const add = (path: string | undefined, target: CuratedCliTarget) => { if (path && !result.has(path)) result.set(path, target) }
    for (const [resource, command] of Object.entries(CAT.commands)) {
      Object.entries(command.operations ?? {}).forEach(([operation, surface]) =>
        add(surface?.cmd, { resource, operation: operation as CrudVerb }))
      Object.entries(command.actions ?? {}).forEach(([action, surface]) =>
        add(surface?.cmd, { resource, action }))
      add(command.cmd, { resource })
    }
    return result
  }, [CAT])
  const curatedTargetPathMap = useMemo(() => {
    const result = new Map<string, string>()
    for (const [path, target] of curatedPathMap) {
      const key = curatedTargetKey(target)
      if (!result.has(key)) result.set(key, path)
    }
    return result
  }, [curatedPathMap])
  // 좌측 nav 분류 넘버링 — 카탈로그 STRUCTURE(카테고리→기능그룹→resource)에서 코드 유도.
  const resourceCodeMap = useMemo(() => computeResourceCodes(CAT.categories, OCI_CONSOLE_CATEGORY_ORDER), [CAT])
  const officialBuilderCommand = useMemo(() => officialCommand ? officialCommandToBuilder(officialCommand) : null, [officialCommand])
  const activeOfficialTarget = officialCommand ? curatedPathMap.get(officialCommand.path) : undefined
  const activeEnhancedCommand = activeOfficialTarget ? CAT.commands[activeOfficialTarget.resource] : undefined
  const isOperationallyEnhanced = !!(officialCommand && activeEnhancedCommand && officialPresentation === 'enhanced')
  const cmd = isOperationallyEnhanced
    ? activeEnhancedCommand
    : officialBuilderCommand ?? (active !== '__custom' ? CAT.commands[active] : null)
  const activeVerificationResource = officialCommand ? `official:${officialCommand.path}` : active
  useCliInputWizardShortcut(Boolean(cmd) && sp.get('mode') !== 'blueprint' && !wizardOpen, () => setWizardOpen(true))
  const selectedActionMeta = selectedAction ? cmd?.actions?.[selectedAction] : undefined
  const selectedOperation = selectedActionMeta ?? cmd?.operations?.[crudOperation]
  const formSurface = selectedOperation ?? cmd
  const operationFormSections = cmd?.maintenanceReboot
    ? cmd.sections.filter((_, index) => crudOperation === 'update' || index === 0)
    : selectedOperation?.sections ?? cmd?.sections ?? []
  const rawFormSections = [
    ...((formSurface?.lookupInputs?.length ?? 0) > 0
      ? [{ label: '동적 조회 범위', options: formSurface?.lookupInputs ?? [] }]
      : []),
    ...operationFormSections,
  ]
  const formSections = rawFormSections
    .map(section => ({ ...section, options: section.options.filter(option => !isExecutionContextName(option.name)) }))
    .filter(section => section.options.length > 0)
  const formAdvanced = (selectedOperation?.advanced ?? cmd?.advanced ?? [])
    .filter(option => !isExecutionContextName(option.name))
  const formRules = selectedOperation?.rules ?? []
  const formOptionNotices = selectedOperation?.optionNotices ?? []
  const formDeprecated = [...formSections.flatMap(section => section.options), ...formAdvanced]
    .filter(option => option.deprecated)
  const visibleFormSections = formSections
    .map(section => ({ ...section, options: section.options.filter(option => !option.deprecated) }))
    .filter(section => section.options.length > 0)
  const visibleFormAdvanced = formAdvanced.filter(option => !option.deprecated)
  const hasCrud = usesCrudVerification(cmd)
  const currentVerificationOperation = officialCommand ? 'command' : selectedAction ? `action:${selectedAction}` : crudOperation
  const currentLegacyVerificationKey = activeOfficialTarget
    ? verificationKey(activeOfficialTarget.resource, activeOfficialTarget.action ? `action:${activeOfficialTarget.action}` : activeOfficialTarget.operation ?? 'command')
    : ''
  const isCurrentCommandVerified = isOperationVerified(activeVerificationResource, currentVerificationOperation)
    || !!currentLegacyVerificationKey && verified.includes(currentLegacyVerificationKey)
  const officialPathForTarget = (target: CuratedCliTarget) => curatedTargetPathMap.get(curatedTargetKey(target))
  const isEnhancedOperationVerified = (operation: CrudVerb) => {
    if (!activeOfficialTarget) return isOperationVerified(activeVerificationResource, operation)
    const path = officialPathForTarget({ resource: activeOfficialTarget.resource, operation })
    return !!path && verified.includes(`official:${path}`)
      || verified.includes(verificationKey(activeOfficialTarget.resource, operation))
  }
  const isEnhancedActionVerified = (action: string) => {
    if (!activeOfficialTarget) return isOperationVerified(activeVerificationResource, `action:${action}`)
    const path = officialPathForTarget({ resource: activeOfficialTarget.resource, action })
    return !!path && verified.includes(`official:${path}`)
      || verified.includes(verificationKey(activeOfficialTarget.resource, `action:${action}`))
  }
  const isOperationAvailable = (operation: CrudVerb) => supportsOperation(cmd, operation)
  const operationHelp = cmd?.maintenanceReboot
    ? crudOperation === 'update'
      ? '인스턴스 유지보수 재부팅 예정 시각을 변경합니다.'
      : '유지보수 재부팅을 연장할 수 있는 최대 시각을 조회합니다.'
    : selectedOperation?.help || cmd?.help
  const executionSurface = selectedOperation ?? cmd
  const contextOverrides = executionSurface?.contextOverrides ?? {}
  const requestContextOptions = executionContextOptions(CAT.executionContext, contextOverrides, 'request')
  const responseContextOptions = executionContextOptions(CAT.executionContext, contextOverrides, 'response')
  const responseContextEnabled = supportsResponseContext(cmd)
  const resolvedExecutionValues = { ...executionValues }
  // 리전은 도시명(서울/도쿄/시드니…)을 입력해도 식별자(ap-seoul-1)로 해석해 명령에 넣는다.
  if (resolvedExecutionValues['--region']) resolvedExecutionValues['--region'] = resolveRegion(resolvedExecutionValues['--region'])
  const queryContextOption = responseContextOptions.find(option => option.name === '--query')
  if (queryContextOption?.multiSelect) {
    const customQuery = (executionValues[subKey('--query', 'custom')] ?? '').trim()
    resolvedExecutionValues['--query'] = customQuery || buildMultiSelectQuery(executionValues['--query'] ?? '')
  }
  const requestContextArguments = serializeExecutionContext(CAT.executionContext, contextOverrides, resolvedExecutionValues, 'request')
  const responseContextArguments = responseContextEnabled
    ? serializeExecutionContext(CAT.executionContext, contextOverrides, resolvedExecutionValues, 'response')
    : []
  const effectiveValues = { ...values, ...resolvedExecutionValues }
  const migratedShapeConfig = legacyShapeConfigValue(values)
  if (migratedShapeConfig) effectiveValues['--shape-config'] = migratedShapeConfig
  const cli = cmd
    ? buildCli(cmd, effectiveValues, dyn, crudOperation, selectedAction ?? undefined, requestContextArguments, responseContextArguments)
    : customText

  const selectResource = (res: string, requestedOperation?: CrudVerb, requestedAction?: string) => {
    const next = CAT.commands[res]
    setOfficialCommand(null); setOfficialPresentation('official'); setActive(res); setDyn({}); setShowOptional(false); setShowDeprecated(false); setSelectedAction(null); setInstancePreflightInput(''); setInstancePreflightError('')
    if (next) {
      const operation = requestedOperation && supportsOperation(next, requestedOperation) ? requestedOperation : defaultCliOperation(next)
      const action = requestedAction && next.actions?.[requestedAction] ? requestedAction : undefined
      const surface = selectedSurface(next, operation, action)
      setCrudOperation(operation); setSelectedAction(action ?? null)
      setValues(action ? actionDefaults(next, action) : operationDefaults(next, operation))
      setExecutionValues(executionContextDefaults(CAT.executionContext, surface.contextOverrides))
    } else { setValues({}); setExecutionValues({}) }
  }
  const rememberOfficialCommand = (command: OfficialCliCommand) => {
    setRecentOfficialCommands(current => {
      const next = [
        { path: command.path, label: command.help || command.path, openedAt: new Date().toISOString() },
        ...current.filter(item => item.path !== command.path),
      ].slice(0, 30)
      saveRecentOfficialCommands(next)
      return next
    })
  }
  const selectOfficialCommand = (
    command: OfficialCliCommand,
    savedValues?: Record<string, string>,
    savedContext?: Record<string, string>,
    savedDyn?: Record<string, boolean>,
    savedPresentation?: OfficialCommandPresentation,
  ) => {
    const target = curatedPathMap.get(command.path)
    const enhanced = target ? CAT.commands[target.resource] : undefined
    const operation = enhanced && target?.operation && supportsOperation(enhanced, target.operation)
      ? target.operation
      : enhanced ? defaultCliOperation(enhanced) : 'list'
    const action = enhanced && target?.action && enhanced.actions?.[target.action] ? target.action : undefined
    const surface = enhanced ? selectedSurface(enhanced, operation, action) : undefined
    setOfficialCommand(command); setOfficialPresentation(enhanced ? savedPresentation ?? 'enhanced' : 'official')
    setActive(target?.resource ?? '__official'); setDyn(savedDyn ?? {}); setShowOptional(false); setShowDeprecated(false)
    setSelectedAction(action ?? null); setCrudOperation(operation)
    setValues(savedValues ?? (enhanced ? action ? actionDefaults(enhanced, action) : operationDefaults(enhanced, operation) : {}))
    setExecutionValues(savedContext ?? executionContextDefaults(CAT.executionContext, surface?.contextOverrides ?? {}))
    setInstancePreflightInput(''); setInstancePreflightError('')
    rememberOfficialCommand(command)
    requestAnimationFrame(() => document.getElementById('cli-command-workspace')?.scrollIntoView({ block: 'start' }))
  }
  const openOfficialPath = (path: string, favorite?: Favorite) => {
    loadOfficialCliCommand(path)
      .then(command => selectOfficialCommand(command, favorite?.values, favorite?.context, favorite?.dyn))
      .catch(error => showToast(error instanceof Error ? error.message : String(error)))
  }
  const openOfficialPathRef = useRef(openOfficialPath)
  openOfficialPathRef.current = openOfficialPath
  useEffect(() => {
    if (!rParam) return
    const command = CAT.commands[rParam]
    if (!command || isAutomationRecipe(command)) return
    const operation = defaultCliOperation(command)
    const path = curatedTargetPathMap.get(curatedTargetKey({ resource: rParam, operation }))
      ?? curatedTargetPathMap.get(curatedTargetKey({ resource: rParam }))
    if (path) openOfficialPathRef.current(path)
  }, [rParam, CAT, curatedTargetPathMap])
  const selectOperation = (operation: CrudVerb) => {
    if (!isOperationAvailable(operation)) return
    if (isOperationallyEnhanced && activeOfficialTarget) {
      const path = officialPathForTarget({ resource: activeOfficialTarget.resource, operation })
      if (path && path !== officialCommand?.path) { openOfficialPath(path); return }
    }
    const surface = cmd ? selectedSurface(cmd, operation) : undefined
    setCrudOperation(operation); setSelectedAction(null); setValues(cmd ? operationDefaults(cmd, operation) : {}); setExecutionValues(surface ? executionContextDefaults(CAT.executionContext, surface.contextOverrides) : {}); setDyn({}); setShowOptional(false); setShowDeprecated(false); setInstancePreflightInput(''); setInstancePreflightError('')
  }
  const selectAction = (action: string) => {
    if (!cmd?.actions?.[action]) return
    if (isOperationallyEnhanced && activeOfficialTarget) {
      const path = officialPathForTarget({ resource: activeOfficialTarget.resource, action })
      if (path && path !== officialCommand?.path) { openOfficialPath(path); return }
    }
    setSelectedAction(action); setValues(actionDefaults(cmd, action)); setExecutionValues(executionContextDefaults(CAT.executionContext, cmd.actions[action].contextOverrides)); setDyn({}); setShowOptional(false); setShowDeprecated(false); setInstancePreflightInput(''); setInstancePreflightError('')
  }
  const formOptions = [...formSections.flatMap(section => section.options), ...formAdvanced]
  const formOptionsByName = new Map(formOptions.map(option => [option.name, option]))
  const setExecutionVal = (name: string, value: string) => setExecutionValues(current => ({ ...current, [name]: value }))
  // 활성 프로필 선택 — --profile 주입 + 홈리전을 기본 --region 으로. 선택은 localStorage 에 sticky.
  const activateProfile = (name: string) => {
    setSelectedProfileNameState(name); setSelectedProfileName(name)
    const prof = profiles.find(p => p.name === name)
    // 선택 → 주입, 해제('') → --profile·--region 을 비워 프로필 흔적을 남기지 않는다.
    setExecutionValues(current => prof
      ? { ...current, '--profile': prof.name, ...(prof.homeRegion ? { '--region': prof.homeRegion } : {}) }
      : { ...current, '--profile': '', '--region': '' })
  }
  // 자원을 바꾸면 실행 컨텍스트가 리셋되므로, 선택된 프로필을 다시 채워 sticky 를 유지한다.
  useEffect(() => {
    if (!selectedProfile) return
    setExecutionValues(current => ({
      ...current, '--profile': selectedProfile.name,
      '--region': current['--region'] || selectedProfile.homeRegion || '',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileName, active])
  const registerProfiles = () => {
    const result = registerProfilesFromPaste(profilePaste, profiles)
    if (result.error) { setProfileMsg(result.error); return }
    setProfiles(result.profiles); setProfilePaste('')
    setProfileMsg(`프로필 ${result.added}개 등록/갱신 완료.`)
  }
  const removeProfile = (name: string) => {
    setProfiles(current => deleteProfile(name, current))
    // 활성 프로필을 지우면 선택 해제 + 주입된 --profile·--region 도 함께 비운다.
    if (selectedProfileName === name) {
      setSelectedProfileNameState(''); setSelectedProfileName('')
      setExecutionValues(current => ({ ...current, '--profile': '', '--region': '' }))
    }
  }
  const wizardQuestions = useMemo<CliWizardQuestion[]>(() => {
    const questions: CliWizardQuestion[] = []
    const seen = new Set<string>()
    const add = (option: CliOption, scope: 'context' | 'resource', recommended = false) => {
      if (seen.has(option.name) || option.deprecated) return
      seen.add(option.name)
      const requirement = option.requirement ?? (option.required ? 'required' : 'optional')
      const spec = JSONSPEC[option.name]
      questions.push({
        id: scope + ':' + option.name,
        valueId: option.name,
        label: scope === 'context'
          ? (option.name === '--profile' ? '프로필' : option.name === '--region' ? '리전' : option.name)
          : (option.displayLabel || option.name),
        type: option.type,
        choices: option.choices ?? undefined,
        optional: requirement === 'optional',
        recommended,
        essential: scope === 'context' && (option.name === '--profile' || option.name === '--region'),
        requirement,
        help: option.help,
        placeholder: option.placeholder,
        meta: option,
        isFilled: current => {
          if (String(current[option.name] ?? '').trim()) return true
          if (option.multiSelect && String(current[subKey(option.name, 'custom')] ?? '').trim()) return true
          return !!spec?.fields?.some(field => String(current[subKey(option.name, field.key)] ?? '').trim())
        },
      })
    }
    const request = [...requestContextOptions].sort((a, b) => {
      const order = ['--profile', '--region', '--auth', '--endpoint']
      return order.indexOf(a.name) - order.indexOf(b.name)
    })
    request.forEach(option => add(option as CliOption, 'context', option.name === '--profile' || option.name === '--region'))
    const resourceOptions = [...visibleFormSections.flatMap(section => section.options), ...visibleFormAdvanced]
    const priority = (option: CliOption) => option.requirement === 'required' || option.required ? 0 : option.requirement === 'conditional' ? 1 : 2
    resourceOptions.sort((a, b) => priority(a) - priority(b)).forEach(option => add(option, 'resource'))
    if (responseContextEnabled) responseContextOptions.forEach(option => add(option as CliOption, 'context'))
    return questions
  }, [requestContextOptions, responseContextEnabled, responseContextOptions, visibleFormAdvanced, visibleFormSections])
  const wizardValues = { ...values, ...executionValues }
  const validationValues = { ...effectiveValues }
  for (const option of formOptions) {
    if (JSONSPEC[option.name]) validationValues[option.name] = buildJsonValue(option.name, values)
  }
  if (cmd?.rootTenancyLookup && isDynamic(dyn, '--compartment-id')) {
    validationValues['--compartment-id'] = '__root-tenancy-from-profile__'
  }
  for (const option of formOptions) {
    if (option.dynamicLookup?.kind === 'tenancy' && isDynamic(dyn, option.name, true)) {
      validationValues[option.name] = '__root-tenancy-from-profile__'
    }
  }
  if (formOptionsByName.has('--availability-domain') && isDynamic(dyn, '--availability-domain')) {
    validationValues['--availability-domain'] = values['--availability-domain']?.trim() || '1'
  }
  const baseCommandValidation = cmd
    ? validateCliOptions(formOptions, validationValues, formRules)
    : { valid: true, issues: [], missing: [] }
  const jsonIssues = validateJsonInputs(formOptions, validationValues)
  const lookupIssues = formOptions.flatMap(option => {
    const lookup = option.dynamicLookup
    if (!lookup || !isDynamic(dyn, option.name, true) || lookup.kind !== 'exactName') return []
    const requiredInputs = [
      ...(lookup.scope === 'compartment' ? [lookup.scopeInput].filter((name): name is string => !!name) : []),
      ...(lookup.prerequisites ?? []).map(prerequisite => prerequisite.input),
    ]
    return requiredInputs
      .filter(name => !(values[name] ?? '').trim())
      .map(name => ({
        code: 'required' as const,
        message: `${option.name} 동적 조회에는 ${name} 값이 필요합니다.`,
        options: [name],
      }))
  })
  const commandValidation = {
    valid: baseCommandValidation.valid && lookupIssues.length === 0 && jsonIssues.length === 0,
    issues: [...baseCommandValidation.issues, ...lookupIssues, ...jsonIssues],
    missing: [...new Set([
      ...baseCommandValidation.missing,
      ...lookupIssues.flatMap(issue => issue.options),
      ...jsonIssues.flatMap(issue => issue.options),
    ])],
  }
  const commandReady = commandValidation.valid
  const setVal = (name: string, v: string) => setValues(current => {
    const next = { ...current, [name]: v }
    const option = formOptionsByName.get(name)
    if (isCliOptionValueActive(option, v)) {
      for (const conflict of option?.conflictsWith ?? []) next[conflict] = ''
    }
    return next
  })
  const setWizardValue = (name: string, value: string) => {
    if (isExecutionContextName(name) || name.startsWith('--query::')) setExecutionVal(name, value)
    else setVal(name, value)
  }
  const setFormVal = (option: CliOption, value: string) => {
    if (option.name !== '--shape') { setVal(option.name, value); return }
    setValues(current => ({
      ...current,
      '--shape': value,
      '--image-id': '',
      [subKey('--image-id', '__image-os')]: '',
    }))
  }
  const preflightMeta = executionSurface?.instanceLaunchPreflight
  const instancePreflightCommand = preflightMeta
    ? buildInstanceLaunchPreflightCommand(values, dyn, requestContextArguments, resolvedExecutionValues)
    : ''
  const applyInstanceLaunchPreflight = () => {
    const parsed = parseInstanceLaunchPreflight(instancePreflightInput)
    if (!parsed.bundle) { setInstancePreflightError(parsed.error || '사전조회 JSON을 붙여넣으세요.'); return }
    const bundle = parsed.bundle
    setValues(current => ({
      ...current,
      '--compartment-id': bundle.context.compartmentId,
      '--availability-domain': bundle.context.availabilityDomain,
      '--shape': '',
      '--image-id': '',
      [subKey('--shape', '__shape-catalog')]: JSON.stringify(bundle.shapes),
      [subKey('--shape', '__shape-vendor')]: '',
      [subKey('--image-id', '__image-catalog')]: JSON.stringify(bundle.images),
      [subKey('--image-id', '__image-shape')]: '',
      [subKey('--image-id', '__image-scope')]: 'all-shapes',
      [subKey('--image-id', '__image-os')]: '',
    }))
    setExecutionValues(current => ({
      ...current,
      ...(bundle.context.profile ? { '--profile': bundle.context.profile } : {}),
      ...(bundle.context.region ? { '--region': bundle.context.region } : {}),
    }))
    setDyn(current => ({ ...current, '--compartment-id': false, '--availability-domain': false }))
    setInstancePreflightError('')
    showToast(`사전조회 적용됨 · Shape ${bundle.shapes.length}개 · 이미지 ${bundle.images.length}개`)
  }
  const focusValidationField = (name: string) => {
    const option = formOptionsByName.get(name)
    if (option?.deprecated) setShowDeprecated(true)
    else if (formAdvanced.some(item => item.name === name)) setShowOptional(true)
    const focusField = () => {
      const target = document.getElementById(cliFieldAnchorId(name))
      const control = target?.querySelector<HTMLElement>(
        '.cli-input, .cli-flag-control input, .cli-multiple-choices input, .cli-query-picker input',
      )
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      control?.focus({ preventScroll: true })
    }
    requestAnimationFrame(() => requestAnimationFrame(focusField))
  }

  const copy = useCallback(async () => {
    if (!commandReady) {
      showToast(`미완성 명령: ${commandValidation.issues[0]?.message ?? '필수 입력을 확인하세요.'}`)
      return
    }
    try {
      await navigator.clipboard.writeText(cli)
      const rewarded = rewardActivity(`cli-copy:${active}`, 5, 'OCI CLI 명령 복사')
      if (!rewarded) showToast('클립보드에 복사됨')
    }
    catch { showToast('복사 실패 — 수동 선택') }
  }, [active, cli, commandReady, commandValidation.issues, rewardActivity, showToast])

  const toggleOutput = useCallback(() => {
    if (!outOpen) setOutUncapped(true)
    setOutOpen(open => !open)
  }, [outOpen])

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.code === 'KeyO') {
        e.preventDefault(); e.stopImmediatePropagation(); toggleOutput()
      } else if (e.code === 'KeyC') {
        e.preventDefault(); e.stopImmediatePropagation(); void copy()
      }
    }
    window.addEventListener('keydown', onShortcut, true)
    return () => window.removeEventListener('keydown', onShortcut, true)
  }, [copy, toggleOutput])

  const addFav = () => {
    if (!commandReady) {
      showToast(`미완성 명령: ${commandValidation.issues[0]?.message ?? '필수 입력을 확인하세요.'}`)
      return
    }
    const name = prompt('즐겨찾기 이름', cmd ? `${cmd.label} ${values['--display-name'] || ''}`.trim() : 'custom')
    if (!name) return
    const favoriteResource = officialCommand ? `official:${officialCommand.path}` : active
    const fav: Favorite = {
      id: `fav-${favs.length}-${name}`, name, resource: favoriteResource,
      values: active === '__custom' ? { __custom: customText } : values,
      context: active === '__custom' ? undefined : executionValues,
      dyn, operation: crudOperation, action: selectedAction ?? undefined,
    }
    const next = [...favs, fav]; setFavs(next); saveFavs(next); showToast('즐겨찾기 저장됨')
  }
  const loadFav = (f: Favorite) => {
    if (f.resource === '__custom') { setOfficialCommand(null); setOfficialPresentation('official'); setActive('__custom'); setCustomText(f.values.__custom || 'oci '); setExecutionValues({}); setSidebarView('automation') }
    else if (f.resource.startsWith('official:')) {
      const path = f.resource.slice('official:'.length)
      openOfficialPath(path, f)
    }
    else {
      const legacy = splitLegacyExecutionContext(f.values)
      const favoriteCommand = CAT.commands[f.resource]
      if (favoriteCommand) {
        const operation = f.operation && supportsOperation(favoriteCommand, f.operation) ? f.operation : defaultCliOperation(favoriteCommand)
        const officialPath = officialPathForTarget({ resource: f.resource, operation, action: f.action })
        if (officialPath) {
          openOfficialPath(officialPath, { ...f, values: legacy.resource, context: f.context ?? legacy.context })
          return
        }
        setOfficialCommand(null); setOfficialPresentation('official'); setActive(f.resource); setValues(legacy.resource); setDyn(f.dyn ?? {}); setShowOptional(true); setShowDeprecated(false); setSelectedAction(null)
        setCrudOperation(operation)
        if (f.action && favoriteCommand.actions?.[f.action]) setSelectedAction(f.action)
        const favoriteOperation = (f.action ? favoriteCommand.actions?.[f.action] : favoriteCommand.operations?.[operation]) ?? favoriteCommand
        setExecutionValues({
          ...executionContextDefaults(CAT.executionContext, favoriteOperation.contextOverrides),
          ...(f.context ?? legacy.context),
        })
        setShowDeprecated(allOptions(favoriteOperation).some(option => option.deprecated && isCliOptionValueActive(option, legacy.resource[option.name] ?? '')))
        if (isAutomationRecipe(favoriteCommand)) setSidebarView('automation')
      }
    }
  }
  const delFav = (id: string) => { const n = favs.filter(f => f.id !== id); setFavs(n); saveFavs(n) }



  // 전용 레시피 화면에선 동적 조회 비활성 — OCID와 실행 환경을 직접 입력
  const noDyn = !!(cmd?.disableDynamic || cmd?.crossCopy || cmd?.compartmentCleanup || cmd?.manualBackup || cmd?.iamMfaReset || cmd?.monitoringComposition || cmd?.customWorkflow)
  const SPECIAL_COMMANDS = Object.values(CAT.commands).filter(isAutomationRecipe)
  const verifiedOfficialPaths = [...new Set(verified.flatMap(key => {
    if (key.startsWith('official:')) return [key.slice('official:'.length)]
    const migrated = curatedTargetPathMap.get(key) ?? curatedTargetPathMap.get(`${key}:command`)
    return migrated ? [migrated] : []
  }))]
  const verifiedAutomationCommands = [...new Map(verified.flatMap(key => {
    if (key.startsWith('official:') || curatedTargetPathMap.has(key) || curatedTargetPathMap.has(`${key}:command`)) return []
    const resource = key.split(':')[0]
    const command = CAT.commands[resource]
    return command && isAutomationRecipe(command)
      ? [[resource, command] as const]
      : []
  })).values()]
  const field = (o: CliOption, optional?: boolean) => {
    const mysqlBackupTarget = cmd?.resource === 'mysql-backup' && crudOperation === 'create'
    const mysqlDbSystemGet = cmd?.resource === 'mysql' && crudOperation === 'get'
    const iamDynamic = !!cmd?.iamResource && ['--user-id', '--group-id', '--policy-id', '--compartment-id'].includes(o.name)
    const catalogDynamic = !!o.dynamicLookup
    const legacyDynamic = o.name in DYNAMIC && (iamDynamic || o.name !== '--db-system-id' || mysqlBackupTarget || mysqlDbSystemGet)
    // compartment 동적조회(이름→OCID)는 disableDynamic/특수빌더여도 항상 허용 — 사용자가 compartment 를 OCID 로만 입력하도록 강요하지 않는다.
    // (DIRECT_ONLY_LOOKUPS 의 compartment 는 dynamicLookup 자체가 없어 여기서 자연히 제외된다.)
    const compartmentDynamic = o.dynamicLookup?.kind === 'compartment'
    const dynamicAllowed = (catalogDynamic || legacyDynamic) && (compartmentDynamic || !noDyn)
    const fieldDynamic = dynamicAllowed && isDynamic(dyn, o.name, true)
    // 선택된 프로필에 캐시된 이름 후보(컴파트먼트·리소스)를 드롭다운으로. OCID 해석은 여전히 실행시점 live.
    const lookupTarget = o.dynamicLookup?.kind === 'compartment'
      ? 'compartment'
      : (!o.dynamicLookup?.multiple ? o.dynamicLookup?.target : undefined)
    const lookupNames = fieldDynamic && selectedProfile && lookupTarget
      ? lookupNamesFor(selectedProfile, lookupTarget)
      : undefined
    return <Field key={o.name} o={o} value={o.name === '--shape-config' ? (effectiveValues[o.name] || '') : (values[o.name] || '')} onChange={v => setFormVal(o, v)} optional={optional}
      dynamic={fieldDynamic}
      lookupNames={lookupNames}
      rootTenancy={!!cmd?.rootTenancyLookup && o.name === '--compartment-id'}
      onToggleDynamic={dynamicAllowed ? (on => setDyn(s => ({ ...s, [o.name]: on }))) : undefined}
      imageDiscoveryCommand={o.imagePicker ? buildImageDiscoveryCommand(effectiveValues, dyn, requestContextArguments) : undefined}
      currentShape={values['--shape'] || ''}
      subVal={k => values[subKey(o.name, k)] || ''}
      onSub={(k, v) => setVal(subKey(o.name, k), v)} />
  }
  const executionField = (option: CliOption) => (
    <Field key={option.name} o={option} value={executionValues[option.name] || ''}
      onChange={value => setExecutionVal(option.name, value)} optional
      dynamic={false} onToggleDynamic={undefined}
      regionOptions={option.name === '--region' ? selectedProfile?.regions : undefined}
      subVal={key => executionValues[subKey(option.name, key)] || ''}
      onSub={(key, value) => setExecutionVal(subKey(option.name, key), value)} />
  )

  if (!protectedState.data) return (
    <div className="cli-main">
      <div className="cmt-empty">{protectedState.loading ? '보호된 OCI CLI 데이터를 복호화하는 중…' : protectedState.error}</div>
    </div>
  )

  // Blueprint 모드 — 자원 조립(선언형) 워크스페이스. ?mode=blueprint 딥링크로 진입.
  if (sp.get('mode') === 'blueprint') return (
    <CliBlueprintWorkspace
      catalog={CAT as unknown as { commands: Record<string, unknown> }}
      blueprintCatalog={protectedState.data.cliBlueprints as BlueprintCatalog | undefined}
      initialId={sp.get('blueprint')}
      initialVersion={sp.get('version')}
      onExit={() => nav('/knowledge/oci-cli')}
    />
  )

  const cliLayoutStyle = {
    '--cli-left-width': `${leftSidebarWidth}px`,
    '--cli-right-width': `${rightSidebarWidth}px`,
  } as CSSProperties

  return (
    <div className="cli-layout" style={cliLayoutStyle}>
      {/* 공식 정본·개인 보기·자동화를 한 사이드바에서 탐색 */}
      <aside id="cli-resource-nav" className="cli-nav">
        <div className="cli-unified-tabs" role="tablist" aria-label="OCI CLI 탐색 보기">
          {([
            ['all', '전체 명령'],
            ['recent', '최근'],
            ['favorites', '즐겨찾기'],
            ['verified', '실행 확인'],
            ['automation', '자동화'],
            ['profiles', '프로필'],
          ] as [CliSidebarView, string][]).map(([view, label]) => (
            <button type="button" role="tab" key={view} aria-selected={sidebarView === view}
              className={sidebarView === view ? 'on' : ''} onClick={() => setSidebarView(view)}>
              {label}
            </button>
          ))}
        </div>

        {sidebarView === 'all' && (
          <OciOfficialCommandNav activePath={officialCommand?.path} curatedPaths={curatedPathMap}
            resourceCode={resourceCodeMap} onSelect={selectOfficialCommand} />
        )}

        {sidebarView === 'recent' && (
          <section className="cli-personal-view" aria-label="최근 열어본 공식 명령">
            <div className="cli-personal-heading"><span>최근 열어본 명령</span><b>{recentOfficialCommands.length}</b></div>
            {recentOfficialCommands.map(item => (
              <button type="button" key={item.path} className={`cli-personal-command${officialCommand?.path === item.path ? ' on' : ''}`}
                onClick={() => openOfficialPath(item.path)}>
                <code>{item.path}</code><span>{item.label}</span>
              </button>
            ))}
            {!recentOfficialCommands.length && <p className="cli-personal-empty">공식 명령을 열면 최대 30개까지 기록됩니다.</p>}
          </section>
        )}

        {sidebarView === 'favorites' && (
          <section className="cli-personal-view" aria-label="OCI CLI 즐겨찾기">
            <div className="cli-personal-heading"><span>즐겨찾기</span><b>{favs.length}</b></div>
            {favs.map(f => (
              <div key={f.id} className="cli-fav">
                <button className="cli-navitem fav" onClick={() => loadFav(f)}>{f.name}</button>
                <button className="cli-favdel" onClick={() => delFav(f.id)} title="삭제">✕</button>
              </div>
            ))}
            {!favs.length && <p className="cli-personal-empty">현재 입력값과 명령을 저장하면 여기에 표시됩니다.</p>}
          </section>
        )}

        {sidebarView === 'verified' && (
          <section className="cli-personal-view" aria-label="직접 실행해 확인한 공식 명령">
            <div className="cli-personal-heading"><span>실행 확인</span><b>{verifiedOfficialPaths.length + verifiedAutomationCommands.length}</b></div>
            {verifiedOfficialPaths.map(path => (
              <button type="button" key={path} className={`cli-personal-command verified${officialCommand?.path === path ? ' on' : ''}`}
                onClick={() => openOfficialPath(path)}>
                <code>{path}</code><span>직접 실행해 확인함</span>
              </button>
            ))}
            {verifiedAutomationCommands.map(command => (
              <button type="button" key={command.resource}
                className={`cli-personal-command verified${active === command.resource && !officialCommand ? ' on' : ''}`}
                onClick={() => selectResource(command.resource)}>
                <code>{command.label}</code><span>자동화 · 직접 실행해 확인함</span>
              </button>
            ))}
            {!verifiedOfficialPaths.length && !verifiedAutomationCommands.length && <p className="cli-personal-empty">실행 결과를 확인한 뒤 명령 화면의 체크박스로 기록하세요.</p>}
          </section>
        )}

        {sidebarView === 'automation' && (
          <section className="cli-personal-view cli-automation-view" aria-label="OCI CLI 자동화">
            <div className="cli-personal-heading"><span>자동화</span><b>{SPECIAL_COMMANDS.length + 2}</b></div>
            <button className="cli-navitem automation" onClick={() => nav('/knowledge/oci-cli?mode=blueprint')} title="선언형 자원 조립 — 여러 자원을 한 번에 계획·생성">
              <span className="cli-bp-mark">◆</span> Blueprints
            </button>
            <button className={`cli-navitem automation${active === '__custom' && !officialCommand ? ' on' : ''}`}
              onClick={() => { setOfficialCommand(null); setOfficialPresentation('official'); setActive('__custom') }}>
              Custom Command
            </button>
            {SPECIAL_COMMANDS.map(c => (
              <button key={c.resource} className={`cli-navitem automation${active === c.resource && !officialCommand ? ' on' : ''}${isResourceVerified(c.resource) ? ' verified' : ''}`}
                onClick={() => selectResource(c.resource)}>
                {c.label}
                {isResourceVerified(c.resource) && <span className="cli-vmark" title="검증됨">✓</span>}
              </button>
            ))}
          </section>
        )}

        {sidebarView === 'profiles' && (
          <section className="cli-personal-view cli-profile-hub" aria-label="OCI 프로필 관리">
            <div className="cli-personal-heading"><span>프로필</span><b>{profiles.length}</b></div>
            <p className="cli-profile-intro">
              로컬 <code>~/.oci/config</code> 에서 리전·컴파트먼트·리소스 이름을 한 번 수집해 두면,
              프로필을 고르기만 해도 <code>--profile</code>·리전·이름이 자동으로 채워집니다.
              크리덴셜은 저장하지 않습니다.
            </p>

            <details className="cli-profile-collect">
              <summary>1. 수집 스크립트 (복사 → 로컬 실행)</summary>
              <p>읽기전용(list/get/search)만 실행합니다. 셸에서 돌린 뒤 출력을 아래에 붙여넣으세요.
                config 가 바뀌면 다시 실행해 갱신합니다.</p>
              <div className="cli-inline-command">
                <pre>{profileCollectScript}</pre>
                <button type="button" onClick={() => void navigator.clipboard.writeText(profileCollectScript)}>스크립트 복사</button>
              </div>
            </details>

            <label className="cli-profile-paste">
              <span><b>2. 실행 결과 붙여넣기</b> JSON 배열</span>
              <textarea className="cli-input cli-json" rows={4} value={profilePaste}
                placeholder='[{"name":"locktonkorea","tenancy":"ocid1.tenancy...","subscriptions":{"data":[...]},...}]'
                onChange={event => { setProfilePaste(event.target.value); setProfileMsg('') }} />
              <button type="button" className="cli-json-apply" onClick={registerProfiles} disabled={!profilePaste.trim()}>프로필 등록</button>
              {profileMsg && <span className="cli-profile-msg">{profileMsg}</span>}
            </label>

            {profiles.length > 0 && (
              <div className="cli-profile-list" role="list">
                <div className="cli-profile-list-title">등록된 프로필</div>
                {profiles.map(p => {
                  const s = profileSummary(p)
                  return (
                    <div key={p.name} className={`cli-profile-row${p.name === selectedProfileName ? ' on' : ''}`} role="listitem">
                      <button type="button" className="cli-profile-pick"
                        onClick={() => activateProfile(p.name === selectedProfileName ? '' : p.name)}
                        title={p.name === selectedProfileName ? '활성 해제' : '활성 프로필로 선택'}>
                        <span className="cli-profile-name">{p.name === selectedProfileName ? '● ' : '○ '}{p.name}</span>
                        <span className="cli-profile-meta">
                          {p.homeRegion || '리전?'} · 리전 {s.regions} · 컴파트먼트 {s.compartments} · 이름 {s.resources}
                        </span>
                      </button>
                      <button type="button" className="cli-profile-del" title="프로필 삭제"
                        onClick={() => removeProfile(p.name)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </aside>

      <button type="button" className="cli-sidebar-resizer left" role="separator" aria-orientation="vertical"
        aria-label="왼쪽 메뉴 너비 조절" aria-controls="cli-resource-nav" aria-valuemin={CLI_SIDEBAR_WIDTH.left.min}
        aria-valuemax={CLI_SIDEBAR_WIDTH.left.max} aria-valuenow={leftSidebarWidth} title={`${leftSidebarWidth}px · 드래그/방향키 · 더블클릭 초기화`}
        onPointerDown={event => startSidebarResize('left', event)} onPointerMove={resizeSidebar}
        onPointerUp={finishSidebarResize} onPointerCancel={finishSidebarResize}
        onKeyDown={event => resizeSidebarWithKeyboard('left', event)}
        onDoubleClick={() => setCliSidebarWidth('left', CLI_SIDEBAR_WIDTH.left.fallback, true)}>
        <span aria-hidden="true">⋮</span>
      </button>

      {/* 우측 폼 + 결과 */}
      <main id="cli-command-workspace" className="cli-main">
        <div className="crumb"><span className="px">OCI CLI</span> / {officialCommand ? `Official / ${officialCommand.path}` : cmd ? cmd.label : 'Custom'}</div>
        <h1 className={`sheet-h1${cmd && isCurrentCommandVerified ? ' cli-verified' : ''}`}>{cmd ? cmd.label : 'Custom 명령'}</h1>
        {hasCrud && (
          <div className="cli-crud-strip" aria-label={`${cmd?.label} 명령 선택`}>
            {CRUD_OPERATIONS.map(operation => {
              const available = isOperationAvailable(operation.verb)
              return (
              <button type="button" key={operation.verb} disabled={!available}
                className={`cli-crud-op verb-${operation.verb}${!selectedAction && crudOperation === operation.verb ? ' selected' : ''}${available && isEnhancedOperationVerified(operation.verb) ? ' verified' : ''}`}
                aria-pressed={available ? !selectedAction && crudOperation === operation.verb : undefined}
                title={`${operation.verb.toUpperCase()}${available ? ' 명령 선택' : ' 명령 없음'}`}
                onClick={() => selectOperation(operation.verb)}>
                <span className="cli-crud-icon" aria-hidden="true">{operation.icon}</span>
                <span className="cli-crud-verb">{operation.verb.toUpperCase()}</span>
                {available && isEnhancedOperationVerified(operation.verb) && <span className="cli-crud-verified" title="직접 실행해 확인함">✓</span>}
              </button>
              )
            })}
          </div>
        )}
        {cmd?.actions && Object.keys(cmd.actions).length > 0 && (
          <div className="cli-action-strip" aria-label={`${cmd.label} 자격 증명 및 할당 작업`}>
            <span className="cli-action-label px">ACTIONS</span>
            {Object.entries(cmd.actions).map(([key, action]) => (
              <button type="button" key={key}
                className={`cli-action-op tone-${action.tone ?? 'create'}${selectedAction === key ? ' selected' : ''}${isEnhancedActionVerified(key) ? ' verified' : ''}`}
                aria-pressed={selectedAction === key}
                onClick={() => selectAction(key)}>
                <span aria-hidden="true">{action.icon ?? '→'}</span>
                <span>{action.label}</span>
                {isEnhancedActionVerified(key) && <span className="cli-crud-verified" title="직접 실행해 확인함">✓</span>}
              </button>
            ))}
          </div>
        )}
        {cmd
          ? <p className="cli-help">{operationHelp}</p>
          : <p className="cli-help">자유 입력 — 직접 작성하거나, 왼쪽에서 자원을 골라 폼으로 만드세요. 저장하면 즐겨찾기로 재사용됩니다.</p>}
        {officialCommand && (
          <div className="cli-official-source">
            <span className="cli-official-source-badge">공식 정본</span>
            <code>OCI CLI v{officialCommand.docsUrl.match(/oci-cli\/([^/]+)\//)?.[1] ?? 'pinned'}</code>
            <span>최종 Click 트리에서 자동 생성</span>
            {activeEnhancedCommand && <span className="cli-official-enhanced-badge">운영 강화됨</span>}
            <a href={officialCommand.docsUrl} target="_blank" rel="noreferrer">Oracle 명령 문서 ↗</a>
            {activeEnhancedCommand && (
              <button type="button" aria-pressed={officialPresentation === 'official'}
                onClick={() => setOfficialPresentation(current => current === 'enhanced' ? 'official' : 'enhanced')}>
                {officialPresentation === 'enhanced' ? '공식 원본 보기' : '운영 강화 보기'}
              </button>
            )}
          </div>
        )}
        {cmd && (
          <label className="cli-verify">
            <input type="checkbox" checked={isCurrentCommandVerified}
              onChange={() => toggleVerified(activeVerificationResource, currentVerificationOperation, currentLegacyVerificationKey ? [currentLegacyVerificationKey] : [])} />
            <span>현재 <b>{officialCommand ? `${activeOfficialTarget?.action ? activeEnhancedCommand?.actions?.[activeOfficialTarget.action]?.label ?? activeOfficialTarget.action : activeOfficialTarget?.operation?.toUpperCase() ?? officialCommand.path.split(' ').at(-1)?.toUpperCase()} · 공식 정본` : selectedActionMeta?.label ?? (hasCrud ? crudOperation.toUpperCase() : 'CUSTOM')}</b> 명령을 직접 실행해 확인함 — 확인한 동작만 <b className="cli-verified">파란색</b>으로 표시</span>
          </label>
        )}

        {cmd && (
          <section className="cli-context-panel" aria-label="OCI CLI 공통 실행 컨텍스트">
            <button type="button" className="cli-context-toggle" aria-expanded={contextOpen}
              onClick={() => setContextOpen(open => !open)}>
              <span className="cli-context-heading"><span aria-hidden="true">{contextOpen ? '▾' : '▸'}</span> 공통 실행 컨텍스트</span>
              <span className="cli-context-summary">
                <code>{executionValues['--profile'] || 'DEFAULT'}</code>
                <span>{executionValues['--region'] || '프로필 리전'}</span>
                <span>{executionValues['--auth'] || '기본 인증'}</span>
              </span>
            </button>
            <div className="cli-context-actions">
              <button type="button" className="cli-input-wizard-launch" aria-keyshortcuts="Alt+I"
                onClick={() => setWizardOpen(true)}>
                입력 마법사 <kbd>Alt+I</kbd><span>프로필·리전 → 필수 → 선택</span>
              </button>
            </div>
            {contextOpen && (
              <div className="cli-context-body">
                <div className="cli-active-profile">
                  <label>활성 프로필
                    <select value={selectedProfileName} onChange={event => activateProfile(event.target.value)}>
                      <option value="">(없음 · 직접 입력)</option>
                      {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </label>
                  {selectedProfile
                    ? <span className="cli-active-profile-meta">홈 {selectedProfile.homeRegion || '—'} · 가용리전 {selectedProfile.regions.length} · 컴파트먼트 {selectedProfile.compartments.length}</span>
                    : <button type="button" className="cli-active-profile-link" onClick={() => setSidebarView('profiles')}>프로필 수집·관리 →</button>}
                </div>
                <p>이 값은 자원 입력과 분리되며 동적 조회와 실제 명령에 동일하게 전달됩니다. Region을 비우면 프로필 설정을 사용합니다.</p>
                <div className="cli-context-groups">
                  <div className="cli-context-group">
                    <div className="cli-context-group-title"><span>REQUEST</span> 접속·인증</div>
                    {requestContextOptions.map(executionField)}
                  </div>
                  <div className={`cli-context-group${responseContextEnabled ? '' : ' unavailable'}`}>
                    <div className="cli-context-group-title"><span>RESPONSE</span> 출력·조회</div>
                    {responseContextEnabled
                      ? responseContextOptions.map(executionField)
                      : <p className="cli-context-unavailable">여러 OCI 명령을 묶은 운영 절차라 내부 검증 Query와 Output을 보호합니다. 접속·인증 컨텍스트만 공통 적용됩니다.</p>}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {cmd?.crossCopy && (
          <div className="cross-note">
            최종 명령에 <b>대상 테넌시 Endorse policy</b> → <b>원본 테넌시 Admit policy</b> → 복사 루프가 모두 포함됩니다.
            policy 는 최초 1회만 실행하면 되고, 전파에 수 분 걸릴 수 있습니다.
          </div>
        )}

        {cmd?.compartmentCleanup && (
          <div className="cross-note cleanup-note">
            기본은 <b>PREVIEW</b>이며 조회만 실행하고 삭제 예정 명령을 보여줍니다. 실제 삭제는 <b>DELETE</b> 선택과
            동일한 컴파트먼트 OCID 재입력이 모두 맞아야 시작됩니다. Log Analytics는 테넌시 전체 offboard를 하지 않습니다.
          </div>
        )}

        {cmd?.iamMfaReset && (
          <div className="cross-note cleanup-note">
            기본 <b>PREVIEW</b>는 등록 장치만 조회합니다. <b>RESET</b>은 실제 User 이름을 다시 확인한 뒤 TOTP 장치를 모두 삭제합니다.
            MFA 등록은 CLI만으로 완료할 수 없으므로, 삭제 후 사용자가 Console에서 다시 등록해야 합니다.
          </div>
        )}

        {cmd?.customWorkflow === 'wizocm-functions-foundation' && (
          <div className="cross-note cleanup-note">
            <b>PLAN</b>은 읽기 전용입니다. <b>APPLY</b>는 정확한 확인 문구를 요구하며, private subnet·NAT/Service Gateway·이미지 tag·기존 자원 불변식을 통과할 때만 진행합니다.
            고객 API key, secret 값, cross-tenancy 정책은 이 레시피가 다루지 않습니다.
          </div>
        )}
        {cmd?.customWorkflow === 'wizocm-devops-cicd' && (
          <div className="cross-note cleanup-note">
            <b>PLAN</b>은 조회만 합니다. <b>APPLY</b>는 Generic Artifact·Manual Approval·정확히 한 대의 Compute instance를 묶습니다.
            GitHub PAT는 받지 않으므로, 먼저 안전하게 생성한 Connection OCID를 입력하세요.
          </div>
        )}

        {cmd ? (
          <div className="cli-form">
            {(formRules.length > 0 || formOptionNotices.length > 0) && (
              <div className="cli-rule-panel" aria-label="OCI CLI 입력 관계">
                <div className="cli-rule-title px">입력 관계</div>
                {formRules.map(rule => (
                  <div key={rule.id} className={`cli-rule kind-${rule.kind}`}>
                    <span className="cli-rule-kind">{rule.kind === 'oneOf' ? '택일·필수' : rule.kind === 'mutuallyExclusive' ? '상호배타' : '조건부'}</span>
                    <span>{rule.message}</span>
                    <span className="cli-rule-options">
                      {(rule.options ?? [rule.when, ...(rule.requires ?? [])]).filter((name): name is string => !!name)
                        .map(name => <code key={name}>{name}</code>)}
                    </span>
                  </div>
                ))}
                {formOptionNotices.map(notice => (
                  <div key={`${notice.kind}:${notice.option}`} className="cli-rule kind-notice">
                    <span className="cli-rule-kind">공개 인터페이스</span>
                    <span>{notice.message}</span>
                    <span className="cli-rule-options"><code>{notice.option}</code><span>→</span>{notice.replacements.map(name => <code key={name}>{name}</code>)}</span>
                  </div>
                ))}
              </div>
            )}
            {visibleFormSections.map(sec => (
              <div key={sec.label} className="cli-form-section-group">
                <div className="cli-sec">
                  <div className="cli-section-label px">{sec.label}</div>
                  {sec.options.map(o => field(o, o.requirement === 'optional'))}
                </div>
                {preflightMeta && sec.options.some(option => option.name === '--availability-domain') && (
                  <section className="cli-instance-preflight" aria-label="Instance Create 실시간 사전조회">
                    <div className="cli-preflight-head">
                      <div><span className="px">LIVE PREFLIGHT</span><h2>전체 목록 한 번 붙여넣고, 화면에서 Shape 고르기</h2></div>
                      <span className="cli-live-badge">OCI 실시간 조회</span>
                    </div>
                    <p>위 컴파트먼트와 AD를 먼저 입력하세요. 명령은 Shape 전체와 Shape별 호환 이미지를 한 JSON으로 만들며, 터미널에서 목록을 출력하거나 Shape 번호를 묻지 않습니다.</p>
                    <details className="cli-preflight-command">
                      <summary>사전조회 Bash 열기</summary>
                      <div className="cli-inline-command"><pre>{instancePreflightCommand}</pre>
                        <button type="button" onClick={() => void navigator.clipboard.writeText(instancePreflightCommand)}>전체 명령 복사</button>
                      </div>
                    </details>
                    <label className="cli-preflight-paste"><span><b>실행 결과 전체 붙여넣기</b> BEGIN/END 줄을 포함해도 자동으로 JSON만 읽습니다.</span>
                      <textarea className="cli-input cli-json" rows={7} value={instancePreflightInput}
                        placeholder="-----BEGIN OCI INSTANCE PREFLIGHT JSON-----&#10;{ ... }&#10;-----END OCI INSTANCE PREFLIGHT JSON-----"
                        onChange={event => { setInstancePreflightInput(event.target.value); setInstancePreflightError('') }} />
                    </label>
                    <div className="cli-preflight-actions">
                      <button type="button" className="cli-json-apply" onClick={applyInstanceLaunchPreflight}>전체 Shape·이미지 한 번에 적용</button>
                      <span>적용 후 Shape 카드를 누르면 붙여넣은 이미지가 즉시 필터링됩니다.</span>
                    </div>
                    {instancePreflightError && <p className="cli-json-error">{instancePreflightError}</p>}
                    <div className="cli-preflight-docs">
                      <a href={preflightMeta.shapeDocs} target="_blank" rel="noreferrer">Oracle Shape LIST 공식 문서 ↗</a>
                      <a href={preflightMeta.imageDocs} target="_blank" rel="noreferrer">Oracle Image LIST 공식 문서 ↗</a>
                    </div>
                  </section>
                )}
              </div>
            ))}
            {visibleFormAdvanced.length > 0 && <>
              <button className="cli-optional-toggle" onClick={() => setShowOptional(s => !s)}>
                {showOptional ? '▾' : '▸'} 고급 옵션 {visibleFormAdvanced.length}개 (태그·대기 등) {showOptional ? '접기' : '펼치기'}
              </button>
              {showOptional && visibleFormAdvanced.map(o => field(o, true))}
            </>}
            {formDeprecated.length > 0 && <>
              <button className="cli-optional-toggle cli-deprecated-toggle" onClick={() => setShowDeprecated(open => !open)}>
                {showDeprecated ? '▾' : '▸'} 사용 중단 옵션 {formDeprecated.length}개 — 기본적으로 숨김
              </button>
              {showDeprecated && <div className="cli-deprecated-options">
                {formDeprecated.map(option => field(option, true))}
              </div>}
            </>}
          </div>
        ) : (
          <textarea className="cmdinput cli-custom" value={customText} onChange={e => setCustomText(e.target.value)}
            placeholder="oci compute instance launch --compartment-id ... " />
        )}

        <div className={`cli-result${commandReady ? '' : ' incomplete'}`}>
          <div className="cli-result-hd">
            <button className="cli-out-toggle" aria-expanded={outOpen} aria-keyshortcuts="Alt+O"
              title={`${commandReady ? '최종 명령' : '미완성 명령 미리보기'} 접기/펼치기 (Alt+O)`} onClick={toggleOutput}>
              <span className="cli-out-caret" aria-hidden="true">{outOpen ? '▾' : '▸'}</span>
              <span>{commandReady ? '최종 명령' : '미완성 명령 미리보기'}</span>
              <kbd className="cli-shortcut">Alt+O</kbd>
            </button>
            <div className="cli-result-actions">
              <button className="submitbtn cli-copybtn" aria-keyshortcuts="Alt+C" aria-disabled={!commandReady} disabled={!commandReady}
                title={commandReady ? '최종 명령 복사 (Alt+C)' : '필수 입력을 완료해야 복사할 수 있습니다.'} onClick={copy}>
                복사 <kbd className="cli-shortcut">Alt+C</kbd>
              </button>
              <button className="donebtn" style={{ marginTop: 0 }} aria-disabled={!commandReady} disabled={!commandReady}
                title={commandReady ? '실행 가능한 명령을 즐겨찾기에 저장' : '필수 입력을 완료해야 저장할 수 있습니다.'}
                onClick={addFav}>즐겨찾기 저장</button>
            </div>
          </div>
          {outOpen && <pre className={`cli-output${outUncapped ? '' : ' initial'}`}>{cli}</pre>}
        </div>
      </main>

      <button type="button" className="cli-sidebar-resizer right" role="separator" aria-orientation="vertical"
        aria-label="오른쪽 메뉴 너비 조절" aria-controls="cli-input-check-nav" aria-valuemin={CLI_SIDEBAR_WIDTH.right.min}
        aria-valuemax={CLI_SIDEBAR_WIDTH.right.max} aria-valuenow={rightSidebarWidth} title={`${rightSidebarWidth}px · 드래그/방향키 · 더블클릭 초기화`}
        onPointerDown={event => startSidebarResize('right', event)} onPointerMove={resizeSidebar}
        onPointerUp={finishSidebarResize} onPointerCancel={finishSidebarResize}
        onKeyDown={event => resizeSidebarWithKeyboard('right', event)}
        onDoubleClick={() => setCliSidebarWidth('right', CLI_SIDEBAR_WIDTH.right.fallback, true)}>
        <span aria-hidden="true">⋮</span>
      </button>

      <aside id="cli-input-check-nav" className={`cli-validation-nav${cmd ? (commandReady ? ' ready' : '') : ' custom'}`} aria-label="실행 전 입력 확인" aria-live="polite">
        {!cmd ? (
          <>
            <div className="cli-validation-nav-title"><span>실행 전 입력 확인</span><span className="cli-validation-count">—</span></div>
            <p className="cli-validation-ready">Custom Command는 자동 필수 입력 검사를 제공하지 않습니다. 최종 명령을 직접 확인하세요.</p>
          </>
        ) : (
          <>
          <div className="cli-validation-nav-title">
            <span>실행 전 입력 확인</span>
            <span className="cli-validation-count">{commandReady ? '✓' : commandValidation.issues.length}</span>
          </div>
          {commandReady ? (
            <p className="cli-validation-ready">필수 입력이 모두 준비됐습니다. 최종 명령을 복사하거나 즐겨찾기에 저장할 수 있습니다.</p>
          ) : (
            <>
              <p className="cli-validation-guide">항목을 누르면 해당 입력칸으로 이동합니다.</p>
              <ul className="cli-validation-list">
                {commandValidation.issues.map((issue, index) => (
                  <li key={`${issue.code}:${issue.options.join(':')}:${index}`}>
                    <span className="cli-validation-message">{issue.message}</span>
                    {issue.options.length > 0 && (
                      <div className="cli-validation-targets">
                        {issue.options.map(name => (
                          <button type="button" key={name} onClick={() => focusValidationField(name)}>
                            <code>{name}</code><span>입력으로 이동</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          </>
        )}
      </aside>
      {wizardOpen && cmd ? (
        <CliInputWizard questions={wizardQuestions} values={wizardValues} setValue={setWizardValue}
          onClose={() => setWizardOpen(false)} title="OCI CLI INPUT" renderControl={renderCliWizardControl} />
      ) : null}
    </div>
  )
}

const jsonFieldLabel = (key: string) => key
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/^./, value => value.toUpperCase())
const isJsonExampleString = (value: string) => value === 'string'
  || value === '2017-01-01'
  || value === '2017-01-01T00:00:00+00:00'
const jsonVariantIdentity = (variant: JsonRecord) => Object.entries(variant)
  .find(([key, value]) => /type$/i.test(key) && typeof value === 'string' && value !== 'string')
const isJsonMapTemplate = (template: JsonRecord) => {
  const keys = Object.keys(template)
  return keys.length > 0 && keys.every(key => /^string\d*$/.test(key))
}

function JsonNodeEditor({ template, value, onChange, fieldKey, fieldPath = '', fieldChoices, depth = 0 }: {
  template: unknown
  value: unknown
  onChange: (value: unknown | undefined) => void
  fieldKey?: string
  fieldPath?: string
  fieldChoices?: Record<string, CliJsonFieldChoice[]>
  depth?: number
}) {
  const variants = jsonTemplateVariants(template)
  if (variants.length) {
    const selected = variants.find(variant => {
      const identity = jsonVariantIdentity(variant.value)
      return identity && isJsonRecord(value) && value[identity[0]] === identity[1]
    })
    return (
      <div className="cli-json-variants">
        <div className="cli-json-variant-tabs" role="radiogroup" aria-label={`${fieldKey ?? 'JSON'} 유형 선택`}>
          {variants.map(variant => {
            const identity = jsonVariantIdentity(variant.value)
            const active = !!identity && isJsonRecord(value) && value[identity[0]] === identity[1]
            return <button type="button" role="radio" aria-checked={active} key={variant.label}
              className={active ? 'selected' : ''} onClick={() => onChange(fixedJsonTemplateValues(variant.value))}>
              {variant.label}
            </button>
          })}
        </div>
        {selected
          ? <JsonNodeEditor template={selected.value} value={value} onChange={onChange}
              fieldPath={fieldPath} fieldChoices={fieldChoices} depth={depth + 1} />
          : <p className="cli-json-empty">먼저 JSON 유형을 선택하세요. 유형에 맞는 필드만 표시됩니다.</p>}
      </div>
    )
  }

  if (Array.isArray(template)) {
    const itemTemplate = template[0]
    const current = Array.isArray(value) ? value : []
    if (isJsonRecord(itemTemplate) || Array.isArray(itemTemplate)) {
      return (
        <div className="cli-json-array">
          {current.map((item, index) => (
            <div className="cli-json-array-item" key={index}>
              <div className="cli-json-array-head"><span>항목 {index + 1}</span>
                <button type="button" onClick={() => onChange(current.filter((_, itemIndex) => itemIndex !== index))}>삭제</button>
              </div>
              <JsonNodeEditor template={itemTemplate} value={item} fieldPath={`${fieldPath}[]`}
                fieldChoices={fieldChoices} depth={depth + 1}
                onChange={next => {
                  const copy = [...current]
                  if (next === undefined) copy.splice(index, 1)
                  else copy[index] = next
                  onChange(copy.length ? copy : undefined)
                }} />
            </div>
          ))}
          <button type="button" className="cli-json-add" onClick={() => onChange([...current, fixedJsonTemplateValues(itemTemplate) ?? {}])}>
            + 항목 추가
          </button>
        </div>
      )
    }
    const lines = current.map(item => String(item)).join('\n')
    return <textarea className="cli-input cli-json cli-json-list" value={lines} rows={Math.max(3, current.length)}
      placeholder="항목마다 한 줄씩 입력"
      onChange={event => {
        const items = event.target.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
          .map(item => typeof itemTemplate === 'number' ? Number(item) : typeof itemTemplate === 'boolean' ? item === 'true' : item)
        onChange(items.length ? items : undefined)
      }} />
  }

  if (isJsonRecord(template)) {
    const current = isJsonRecord(value) ? value : {}
    if (isJsonMapTemplate(template)) {
      const itemTemplate = Object.values(template)[0]
      const entries = Object.entries(current)
      const renameKey = (oldKey: string, requestedKey: string) => {
        const newKey = requestedKey.trim()
        if (!newKey || newKey === oldKey || Object.prototype.hasOwnProperty.call(current, newKey)) return false
        const next = Object.fromEntries(entries.map(([key, item]) => key === oldKey ? [newKey, item] : [key, item]))
        onChange(next)
        return true
      }
      const addKey = () => {
        let index = entries.length + 1
        let key = 'key'
        while (Object.prototype.hasOwnProperty.call(current, key)) key = `key${index++}`
        onChange({ ...current, [key]: fixedJsonTemplateValues(itemTemplate) ?? '' })
      }
      return (
        <div className="cli-json-map">
          {entries.map(([key, item]) => <div className="cli-json-map-item" key={key}>
            <div className="cli-json-map-key">
              <input className="cli-input" defaultValue={key} aria-label="JSON key"
                onBlur={event => { if (!renameKey(key, event.target.value)) event.target.value = key }} />
              <button type="button" onClick={() => {
                const next = { ...current }; delete next[key]
                onChange(Object.keys(next).length ? next : undefined)
              }}>삭제</button>
            </div>
            <JsonNodeEditor fieldKey={key} template={itemTemplate} value={item}
              fieldPath={fieldPath ? `${fieldPath}.${key}` : key} fieldChoices={fieldChoices} depth={depth + 1}
              onChange={nextValue => {
                const next = { ...current }
                if (nextValue === undefined) delete next[key]
                else next[key] = nextValue
                onChange(Object.keys(next).length ? next : undefined)
              }} />
          </div>)}
          <button type="button" className="cli-json-add" onClick={addKey}>+ 키·값 추가</button>
        </div>
      )
    }
    const fixed = fixedJsonTemplateValues(template)
    const fixedValues = isJsonRecord(fixed) ? fixed : {}
    return (
      <div className={`cli-json-object depth-${Math.min(depth, 3)}`}>
        {Object.entries(template).map(([key, childTemplate]) => {
          const nested = isJsonRecord(childTemplate) || Array.isArray(childTemplate)
          return <div className={`cli-json-property${nested ? ' nested' : ''}`} key={key}>
            <div className="cli-json-property-label"><code>{key}</code><span>{jsonFieldLabel(key)}</span></div>
            <JsonNodeEditor fieldKey={key} template={childTemplate} value={current[key]}
              fieldPath={fieldPath ? `${fieldPath}.${key}` : key} fieldChoices={fieldChoices} depth={depth + 1}
              onChange={nextValue => {
                const next = { ...fixedValues, ...current }
                if (nextValue === undefined || nextValue === '') delete next[key]
                else next[key] = nextValue
                onChange(Object.keys(next).length ? next : undefined)
              }} />
          </div>
        })}
      </div>
    )
  }

  const choices = fieldChoices?.[fieldPath]
  if (choices?.length) {
    const selected = typeof value === 'string' ? value : ''
    return <select className="cli-input" value={selected}
      onChange={event => onChange(event.target.value || undefined)}>
      <option value="">(미설정)</option>
      {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </select>
  }
  if (typeof template === 'boolean') {
    const selected = typeof value === 'boolean' ? String(value) : ''
    return <select className="cli-input" value={selected} onChange={event =>
      onChange(event.target.value ? event.target.value === 'true' : undefined)}>
      <option value="">(미설정)</option><option value="true">true</option><option value="false">false</option>
    </select>
  }
  if (typeof template === 'number') {
    return <input className="cli-input" inputMode="decimal" type="number"
      value={typeof value === 'number' ? value : ''} placeholder={String(template)}
      onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
  }
  if (typeof template === 'string' && fieldKey && /type$/i.test(fieldKey) && !isJsonExampleString(template)) {
    return <div className="cli-json-fixed"><span>자동 고정</span><code>{template}</code></div>
  }
  const current = typeof value === 'string' ? value : ''
  const placeholder = typeof template === 'string' ? (isJsonExampleString(template) ? '값 입력' : template) : '값 입력'
  return <input className="cli-input" value={current} placeholder={placeholder}
    onChange={event => onChange(event.target.value || undefined)} />
}

function JsonOptionField({ fieldId, option, label, value, onChange, subVal, onSub }: {
  fieldId: string
  option: CliOption
  label: ReactNode
  value: string
  onChange: (value: string) => void
  subVal: (key: string) => string
  onSub: (key: string, value: string) => void
}) {
  const savedTemplate = parseJsonValue(subVal('__template'))
  const template = option.jsonTemplate ?? savedTemplate
  const mode = subVal('__mode') || (template ? 'structured' : 'raw')
  const parsedValue = parseJsonValue(value)
  const rawInvalid = !!value.trim() && parsedValue === undefined
  const templateInput = subVal('__template-input')
  const templateError = subVal('__template-error')
  const applyTemplate = () => {
    const parsed = parseJsonValue(templateInput)
    if (!isJsonRecord(parsed) && !Array.isArray(parsed)) {
      onSub('__template-error', 'JSON object 또는 array 형태의 OCI 예시가 필요합니다.')
      return
    }
    onSub('__template', JSON.stringify(parsed))
    onSub('__template-error', '')
    onSub('__mode', 'structured')
  }
  return (
    <div id={fieldId} className="cli-field cli-structured-json" data-cli-option={option.name}>
      {label}
      <div className="cli-json-toolbar">
        <button type="button" className={mode === 'structured' ? 'selected' : ''} disabled={!template}
          onClick={() => onSub('__mode', 'structured')}>필드로 입력</button>
        <button type="button" className={mode === 'raw' ? 'selected' : ''} onClick={() => onSub('__mode', 'raw')}>JSON 직접 입력</button>
      </div>
      {option.jsonTemplateCommand && (
        <details className="cli-json-schema" open={!template}>
          <summary>공식 JSON 필드 구조 불러오기</summary>
          <p>아래 명령은 API를 호출하지 않고 현재 OCI CLI 버전의 필드 예시를 출력합니다. 실행 결과를 붙여넣으면 입력칸으로 변환됩니다.</p>
          <div className="cli-inline-command"><code>{option.jsonTemplateCommand}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(option.jsonTemplateCommand ?? '')}>명령 복사</button>
          </div>
          {!option.jsonTemplate && <>
            <textarea className="cli-input cli-json" rows={5} value={templateInput}
              placeholder="위 명령의 JSON 출력 전체를 붙여넣으세요."
              onChange={event => { onSub('__template-input', event.target.value); onSub('__template-error', '') }} />
            <button type="button" className="cli-json-apply" onClick={applyTemplate}>필드 구조 적용</button>
            {templateError && <p className="cli-json-error">{templateError}</p>}
          </>}
        </details>
      )}
      {mode === 'structured' && template ? (
        <div className="cli-json-editor">
          <p className="cli-json-editor-note">입력한 필드만 JSON에 포함됩니다. 비어 있는 선택 필드는 자동으로 제외됩니다.</p>
          {option.jsonNotice && <p className="cli-json-editor-note">{option.jsonNotice}</p>}
          {rawInvalid
            ? <p className="cli-json-error">현재 값이 올바른 JSON이 아닙니다. JSON 직접 입력에서 수정하세요.</p>
            : <JsonNodeEditor template={template} value={parsedValue}
                fieldChoices={option.jsonFieldChoices}
                onChange={next => onChange(next === undefined ? '' : JSON.stringify(next))} />}
        </div>
      ) : (
        <textarea className="cli-input cli-json" value={value} rows={6}
          placeholder={template ? '올바른 JSON object 또는 array 입력' : '먼저 공식 필드 구조를 불러오거나 JSON을 직접 입력하세요.'}
          onChange={event => onChange(event.target.value)} />
      )}
    </div>
  )
}

const SHAPE_VENDOR_LABELS: Record<ShapeVendor, string> = {
  AMD: 'AMD', Intel: 'Intel', Ampere: 'Ampere ARM', Other: '기타',
}

function ShapeOptionField({ fieldId, option, label, value, onChange, subVal, onSub }: {
  fieldId: string
  option: CliOption
  label: ReactNode
  value: string
  onChange: (value: string) => void
  subVal: (key: string) => string
  onSub: (key: string, value: string) => void
}) {
  const catalog = parseShapeCatalog(subVal('__shape-catalog'))
  const selectedEntry = catalog.entries.find(entry => entry.shape === value)
  const vendors = (['AMD', 'Intel', 'Ampere', 'Other'] as ShapeVendor[])
    .filter(vendor => catalog.entries.some(entry => entry.vendor === vendor))
  const selectedVendor = (subVal('__shape-vendor') as ShapeVendor) || selectedEntry?.vendor || vendors[0] || 'Other'
  const entries = catalog.entries.filter(entry => entry.vendor === selectedVendor)
  return (
    <div id={fieldId} className="cli-field cli-shape-picker" data-cli-option={option.name}>
      {label}
      {!catalog.entries.length && !catalog.error && (
        <p className="cli-picker-empty">위 <b>LIVE PREFLIGHT</b> 결과를 적용하면 현재 AD에서 사용 가능한 Shape가 CPU 계열별로 표시됩니다.</p>
      )}
      {catalog.error && <p className="cli-json-error">{catalog.error}</p>}
      {catalog.entries.length > 0 && <>
        <div className="cli-image-step"><b>1. CPU 계열 선택</b><span>실시간 조회 Shape {catalog.entries.length}개</span></div>
        <div className="cli-shape-vendors" role="radiogroup" aria-label="Shape CPU 계열 선택">
          {vendors.map(vendor => <button type="button" role="radio" aria-checked={selectedVendor === vendor}
            className={selectedVendor === vendor ? 'selected' : ''} key={vendor}
            onClick={() => onSub('__shape-vendor', vendor)}>
            <strong>{SHAPE_VENDOR_LABELS[vendor]}</strong>
            <span>{catalog.entries.filter(entry => entry.vendor === vendor).length}개 Shape</span>
          </button>)}
        </div>
        <div className="cli-image-step"><b>2. Shape 선택</b><span>선택 후 이미지는 이 Shape 호환 목록만 표시</span></div>
        <div className="cli-shape-grid" role="radiogroup" aria-label={`${SHAPE_VENDOR_LABELS[selectedVendor]} Shape 선택`}>
          {entries.map(entry => <button type="button" role="radio" aria-checked={value === entry.shape}
            className={value === entry.shape ? 'selected' : ''} key={entry.shape} onClick={() => onChange(entry.shape)}>
            <span className="cli-shape-card-head"><strong>{entry.shape}</strong>{entry.isFlexible && <em>Flex</em>}</span>
            <small>{entry.processorDescription || SHAPE_VENDOR_LABELS[entry.vendor]}</small>
            <span className="cli-shape-specs">
              {entry.ocpus !== null && <code>{entry.ocpus} OCPU</code>}
              {entry.memoryInGBs !== null && <code>{entry.memoryInGBs} GB</code>}
              {entry.networkingBandwidthInGbps !== null && <code>{entry.networkingBandwidthInGbps} Gbps</code>}
              {entry.gpuDescription && <code>{entry.gpuDescription}</code>}
            </span>
          </button>)}
        </div>
      </>}
      <label className="cli-image-direct"><span>Shape 이름 직접 입력</span>
        <input className="cli-input" value={value} placeholder="예: VM.Standard.E5.Flex"
          onChange={event => onChange(event.target.value)} />
      </label>
      {option.shapePicker?.docs && <a className="cli-image-docs" href={option.shapePicker.docs} target="_blank" rel="noreferrer">Oracle Shape LIST 공식 문서 ↗</a>}
    </div>
  )
}

function ImageOptionField({ fieldId, option, label, value, onChange, discoveryCommand, currentShape, subVal, onSub }: {
  fieldId: string
  option: CliOption
  label: ReactNode
  value: string
  onChange: (value: string) => void
  discoveryCommand: string
  currentShape: string
  subVal: (key: string) => string
  onSub: (key: string, value: string) => void
}) {
  const catalogRaw = subVal('__image-catalog')
  const catalog = parseImageCatalog(catalogRaw)
  const catalogShape = subVal('__image-shape')
  const hasCompatibilityMatrix = subVal('__image-scope') === 'all-shapes'
    && catalog.entries.some(entry => entry.compatibleShapes.length > 0)
  const shapeReady = !!currentShape.trim()
  const catalogCompatible = shapeReady && catalogShape === currentShape
  const visibleEntries = !shapeReady ? [] : hasCompatibilityMatrix
    ? catalog.entries.filter(entry => entry.compatibleShapes.includes(currentShape))
    : catalogCompatible ? catalog.entries : []
  const selectedEntry = visibleEntries.find(entry => entry.id === value)
  const systems = [...new Set(visibleEntries.map(entry => entry.operatingSystem))]
  const selectedSystem = subVal('__image-os') || selectedEntry?.operatingSystem || systems[0] || ''
  const versions = visibleEntries.filter(entry => entry.operatingSystem === selectedSystem)
  return (
    <div id={fieldId} className="cli-field cli-image-picker" data-cli-option={option.name}>
      {label}
      {!shapeReady && <p className="cli-picker-empty warning"><b>먼저 Shape 카드를 선택하세요.</b> 붙여넣은 전체 이미지가 Shape 호환 규칙으로 즉시 필터링됩니다.</p>}
      {hasCompatibilityMatrix && (
        <p className="cli-picker-empty success">전체 이미지 {catalog.entries.length}개와 Shape별 호환 관계를 불러왔습니다. OCI를 다시 조회하지 않고 현재 Shape에 맞는 이미지만 표시합니다.</p>
      )}
      {!hasCompatibilityMatrix && shapeReady && catalog.entries.length > 0 && !catalogCompatible && (
        <p className="cli-picker-empty warning">Shape이 <code>{catalogShape || '미지정'}</code> → <code>{currentShape}</code>로 바뀌었습니다. 아래 조회 명령을 다시 실행해 이미지 목록을 갱신하세요.</p>
      )}
      {!hasCompatibilityMatrix && <div className="cli-image-guide">
        <div><b>1. 현재 이미지 조회</b><span>{option.imagePicker?.note}</span></div>
        <div className="cli-inline-command cli-image-command"><pre>{discoveryCommand}</pre>
          <button type="button" onClick={() => void navigator.clipboard.writeText(discoveryCommand)}>조회 명령 복사</button>
        </div>
        <label className="cli-image-paste"><span><b>2. 실행 결과 붙여넣기</b> JSON 배열 또는 원본 <code>data</code> 응답</span>
          <textarea className="cli-input cli-json" rows={5} value={catalogRaw}
            placeholder='[{"id":"ocid1.image...","name":"Oracle-Linux-9...","os":"Oracle Linux","version":"9"}]'
            disabled={!shapeReady}
            onChange={event => { onSub('__image-catalog', event.target.value); onSub('__image-shape', currentShape); onSub('__image-scope', '') }} />
        </label>
        {catalog.error && <p className="cli-json-error">{catalog.error}</p>}
      </div>}
      {hasCompatibilityMatrix && shapeReady && visibleEntries.length === 0 && (
        <p className="cli-json-error">붙여넣은 매트릭스에서 <code>{currentShape}</code>와 호환되는 AVAILABLE 이미지를 찾지 못했습니다.</p>
      )}
      {visibleEntries.length > 0 && <div className="cli-image-selection">
        <div className="cli-image-step"><b>3. 운영체제 선택</b><span>{visibleEntries.length}개 호환 이미지</span></div>
        <div className="cli-image-os-grid" role="radiogroup" aria-label="운영체제 선택">
          {systems.map(system => <button type="button" role="radio" aria-checked={selectedSystem === system}
            className={selectedSystem === system ? 'selected' : ''} key={system}
            onClick={() => onSub('__image-os', system)}>
            <strong>{system}</strong><span>{visibleEntries.filter(entry => entry.operatingSystem === system).length}개 버전</span>
          </button>)}
        </div>
        <div className="cli-image-versions" role="radiogroup" aria-label={`${selectedSystem} 이미지 버전 선택`}>
          {versions.map(entry => <label key={entry.id} className={value === entry.id ? 'selected' : ''}>
            <input type="radio" name={`${fieldId}-version`} checked={value === entry.id} onChange={() => onChange(entry.id)} />
            <span><strong>{entry.operatingSystemVersion}</strong><small>{entry.name}</small></span>
            <code>{entry.id}</code>
          </label>)}
        </div>
      </div>}
      <label className="cli-image-direct"><span>Image OCID 직접 입력</span>
        <input className="cli-input" value={value} placeholder="ocid1.image.oc1.ap-seoul-1..."
          onChange={event => onChange(event.target.value)} />
      </label>
      {option.imagePicker?.docs && <a className="cli-image-docs" href={option.imagePicker.docs} target="_blank" rel="noreferrer">Oracle Image LIST 공식 문서 ↗</a>}
    </div>
  )
}

function renderCliWizardControl(context: CliWizardRenderContext): ReactNode {
  const option = context.question.meta as CliOption | undefined
  if (!option) return defaultCliWizardControl(context)
  const { value, valueId, inputClass, assignRef, setValue, subValue, setSubValue } = context
  const checked = value !== ''
  if (option.name === '--region') {
    return <RegionSelect value={value} onChange={v => setValue(valueId, v)} inputClass={inputClass} assignRef={assignRef} />
  }
  if (option.flag || option.checkbox) {
    return (
      <label className="cli-wizard-check">
        <input ref={assignRef} type="checkbox" checked={checked}
          onChange={event => setValue(valueId, event.target.checked ? (option.defaultValue ?? 'true') : '')} />
        <span>{checked ? (option.checkboxLabel || '사용') : '사용 안 함'}</span>
      </label>
    )
  }
  if (option.type === 'boolean') {
    return (
      <select ref={assignRef} className={inputClass} value={value} onChange={event => setValue(valueId, event.target.value)}>
        {option.requirement === 'optional' ? <option value="">(미설정)</option> : null}
        <option value="true">예</option><option value="false">아니오</option>
      </select>
    )
  }
  if (option.multiple && option.choices?.length) {
    const selected = new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))
    return (
      <div className="cli-wizard-checks" role="group" aria-label={option.name + ' 복수 값 선택'}>
        {option.choices.map(choice => (
          <label key={choice} className="cli-multiple-choice">
            <input type="checkbox" checked={selected.has(choice)} onChange={event => {
              const next = new Set(selected)
              if (event.target.checked) next.add(choice); else next.delete(choice)
              setValue(valueId, [...next].join('\n'))
            }} />
            <span>{choice}</span>
          </label>
        ))}
      </div>
    )
  }
  if (option.multiSelect && option.suggestions?.length) {
    const selected = new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))
    const custom = subValue('custom')
    return (
      <div className="cli-wizard-checks" role="group" aria-label={option.name + ' 복수 선택'}>
        {option.suggestions.map(suggestion => (
          <label key={suggestion} className="cli-multiple-choice">
            <input type="checkbox" checked={selected.has(suggestion)} disabled={custom.trim() !== ''}
              onChange={event => {
                const next = new Set(selected)
                if (event.target.checked) next.add(suggestion); else next.delete(suggestion)
                setValue(valueId, [...next].join('\n'))
              }} />
            <span>{option.suggestionLabels?.[suggestion] ?? suggestion}</span>
          </label>
        ))}
        <input ref={assignRef} className={inputClass} value={custom} placeholder="직접 JMESPath 입력"
          onChange={event => setSubValue('custom', event.target.value)} />
      </div>
    )
  }
  if (!option.multi && option.choices?.length) {
    return (
      <select ref={assignRef} className={inputClass} value={value} onChange={event => setValue(valueId, event.target.value)}>
        {option.requirement !== 'required' ? <option value="">(선택 안 함)</option> : null}
        {option.choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    )
  }
  const spec = JSONSPEC[option.name]
  if (spec?.list) {
    return <input ref={assignRef} className={inputClass} value={value} placeholder={spec.ph}
      onChange={event => setValue(valueId, event.target.value)} />
  }
  if (spec?.fields) {
    return (
      <div className="cli-wizard-json-fields">
        {spec.fields.map((field, index) => (
          <label key={field.key}>
            <span>{field.label}</span>
            {field.kind === 'bool'
              ? <select ref={index === 0 ? assignRef : undefined} className={inputClass} value={subValue(field.key)}
                  onChange={event => setSubValue(field.key, event.target.value)}>
                  <option value="">(미설정)</option><option value="true">true</option><option value="false">false</option>
                </select>
              : <input ref={index === 0 ? assignRef : undefined} className={inputClass} value={subValue(field.key)}
                  placeholder={field.ph} onChange={event => setSubValue(field.key, event.target.value)} />}
          </label>
        ))}
      </div>
    )
  }
  if (option.type === 'json' || option.type === 'stringArray' || option.multi) {
    return <textarea ref={assignRef} className={inputClass + ' bp-wizard-textarea'} rows={5} value={value}
      placeholder={option.placeholder} onChange={event => setValue(valueId, event.target.value)} />
  }
  if (option.suggestions?.length) {
    const listId = 'cli-wizard-suggestions-' + option.name.replaceAll('-', '')
    return (
      <>
        <input ref={assignRef} className={inputClass} list={listId} value={value} placeholder={option.placeholder}
          onChange={event => setValue(valueId, event.target.value)} />
        <datalist id={listId}>{option.suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}</datalist>
      </>
    )
  }
  return <input ref={assignRef} className={inputClass} value={value} placeholder={option.placeholder}
    onChange={event => setValue(valueId, event.target.value)} autoComplete="off" />
}

// 리전 검색 콤보박스 — "서" 입력 시 서울이 필터되고(한국어 부분일치), 선택하면 식별자(ap-seoul-1)가
// 값으로 들어간다. 별도 datalist/네이티브 select 대신 사이트 스타일에 맞춘 드롭다운 하나로 통일.
function RegionSelect({ value, onChange, inputClass = 'cli-input', assignRef, allowedRegions }: {
  value: string; onChange: (v: string) => void; inputClass?: string
  assignRef?: (element: HTMLInputElement | null) => void
  allowedRegions?: string[]
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setText(value) }, [value])
  useEffect(() => {
    const onDoc = (event: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  // 선택된 프로필이 있으면 그 프로필의 구독 리전으로 후보를 좁힌다. 테이블에 없는 신규 리전은 id 로 폴백.
  const pool = allowedRegions && allowedRegions.length > 0
    ? allowedRegions.map(id => REGIONS.find(r => r.id === id) ?? { id, ko: id, en: id, geo: '' })
    : REGIONS
  const raw = text.trim()
  const q = raw.toLowerCase()
  const matches = raw
    ? pool.filter(r => r.ko.includes(raw) || r.en.toLowerCase().includes(q) || r.id.includes(q))
    : pool
  const pick = (id: string) => { onChange(id); setText(id); setOpen(false) }
  const commit = () => { const resolved = resolveRegion(text); setText(resolved); if (resolved !== value) onChange(resolved) }
  return (
    <div className="region-select" ref={wrapRef}>
      <input ref={assignRef} className={inputClass} value={text} placeholder="서울 · tokyo · ap-seoul-1 …"
        autoComplete="off" role="combobox" aria-expanded={open}
        onFocus={() => { setOpen(true); setHi(0) }}
        onChange={event => { setText(event.target.value); setOpen(true); setHi(0) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, matches.length - 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (event.key === 'Enter' && open && matches[hi]) { event.preventDefault(); pick(matches[hi].id) }
          else if (event.key === 'Escape') setOpen(false)
        }}
        onBlur={() => window.setTimeout(() => { commit(); setOpen(false) }, 120)} />
      {open && matches.length > 0 && (
        <ul className="region-menu" role="listbox">
          {matches.slice(0, 20).map((r, i) => (
            <li key={r.id}>
              <button type="button" className={`region-opt${i === hi ? ' on' : ''}${r.id === value ? ' sel' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={event => { event.preventDefault(); pick(r.id) }}>
                <span className="region-city"><b>{r.ko}</b> · {r.en}</span>
                <span className="region-id">{r.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 이름 후보 콤보박스 — 선택된 프로필에 캐시된 컴파트먼트·리소스 이름을 드롭다운으로 고르거나 자유 입력.
// 선택하면 값은 "이름"이 되고, 최종 bash 가 이름→OCID 를 실행시점에 조회한다(값 캐시 아님).
function NameSelect({ value, onChange, names, placeholder }: {
  value: string; onChange: (v: string) => void; names: string[]; placeholder?: string
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setText(value) }, [value])
  useEffect(() => {
    const onDoc = (event: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const raw = text.trim().toLowerCase()
  const matches = raw ? names.filter(n => n.toLowerCase().includes(raw)) : names
  const pick = (name: string) => { onChange(name); setText(name); setOpen(false) }
  return (
    <div className="region-select name-select" ref={wrapRef}>
      <input className="cli-input" value={text} placeholder={placeholder || '이름 선택 또는 입력'}
        autoComplete="off" role="combobox" aria-expanded={open}
        onFocus={() => { setOpen(true); setHi(0) }}
        onChange={event => { setText(event.target.value); onChange(event.target.value); setOpen(true); setHi(0) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, matches.length - 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (event.key === 'Enter' && open && matches[hi]) { event.preventDefault(); pick(matches[hi]) }
          else if (event.key === 'Escape') setOpen(false)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)} />
      {open && matches.length > 0 && (
        <ul className="region-menu" role="listbox">
          {matches.slice(0, 30).map((n, i) => (
            <li key={n}>
              <button type="button" className={`region-opt${i === hi ? ' on' : ''}${n === value ? ' sel' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={event => { event.preventDefault(); pick(n) }}>
                <span className="region-city">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ o, value, onChange, optional, dynamic, rootTenancy, onToggleDynamic, imageDiscoveryCommand, currentShape = '', lookupNames, regionOptions, subVal, onSub }: {
  o: CliOption; value: string; onChange: (v: string) => void; optional?: boolean
  dynamic: boolean; rootTenancy?: boolean; onToggleDynamic?: (on: boolean) => void
  imageDiscoveryCommand?: string
  currentShape?: string
  lookupNames?: string[]
  regionOptions?: string[]
  subVal: (key: string) => string; onSub: (key: string, v: string) => void
}) {
  const fieldId = cliFieldAnchorId(o.name)
  const dynMeta = rootTenancy
    ? { input: '프로필에서 자동 조회 — 입력 불필요', note: '선택한 OCI 프로필의 루트 테넌시 OCID를 자동 조회' }
    : o.dynamicLookup
      ? { input: o.dynamicLookup.inputPlaceholder, note: o.dynamicLookup.note }
      : DYNAMIC[o.name]
  const label = (
    <label className={`cli-field-label${optional ? ' optional' : ''}`}>
      {o.lookupOnly ? <span>{o.displayLabel || o.name}</span> : <code>{o.name}</code>}
      {(o.requirement ?? (o.required ? 'required' : 'optional')) === 'required'
        ? <span className="cli-requirement required">필수</span>
        : (o.requirement === 'conditional'
          ? <span className="cli-requirement conditional">조건부 필수</span>
          : <span className="cli-requirement optional">선택</span>)}
      {o.deprecated && <span className="cli-requirement deprecated">사용 중단</span>}
      {o.multiple && <span className="cli-type-tag">여러 값</span>}
      {['json', 'file', 'datetime'].includes(o.type) && <span className="cli-type-tag">{o.type.toUpperCase()}</span>}
      {o.directLookupReason && <span className="cli-type-tag">직접 OCID</span>}
      {o.conflictsWith?.length && <span className="cli-conflict-note">{o.conflictsWith.join(', ')}와 동시 사용 불가</span>}
      {onToggleDynamic && (
        <span className="cli-dyn-toggle" title={dynMeta.note}>
          <input type="checkbox" checked={dynamic} onChange={e => onToggleDynamic(e.target.checked)} />
          동적 조회
        </span>
      )}
      <span className="cli-field-help">{dynamic && dynMeta ? dynMeta.note : (o.directLookupReason || (o.deprecated ? o.deprecation : o.help))}</span>
      {o.deprecated && o.replacement?.length && <span className="cli-replacement">대체: {o.replacement.join(', ')}</span>}
    </label>
  )
  if (o.name === '--region') {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <RegionSelect value={value} onChange={onChange} allowedRegions={regionOptions} />
      </div>
    )
  }
  // 동적 조회 필드 + 선택된 프로필의 이름 후보 → 콤보박스(선택 or 자유입력). OCID 는 실행시점 live 해석.
  if (lookupNames && lookupNames.length > 0 && dynamic) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <NameSelect value={value} onChange={onChange} names={lookupNames} placeholder={o.dynamicLookup?.inputPlaceholder || o.placeholder} />
      </div>
    )
  }
  if (o.flag) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <label className="cli-flag-control">
          <input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : '')} />
          <span>{value === 'true' ? '사용' : '사용 안 함'}</span>
        </label>
      </div>
    )
  }
  if (o.checkbox) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <label className="cli-flag-control">
          <input type="checkbox" checked={value !== ''}
            onChange={e => onChange(e.target.checked ? (o.defaultValue ?? '') : '')} />
          <span>{o.checkboxLabel || (value !== '' ? '사용' : '사용 안 함')}</span>
        </label>
      </div>
    )
  }
  if (o.shapePicker) {
    return <ShapeOptionField fieldId={fieldId} option={o} label={label} value={value} onChange={onChange}
      subVal={subVal} onSub={onSub} />
  }
  if (o.imagePicker && imageDiscoveryCommand) {
    return <ImageOptionField fieldId={fieldId} option={o} label={label} value={value} onChange={onChange}
      discoveryCommand={imageDiscoveryCommand} currentShape={currentShape} subVal={subVal} onSub={onSub} />
  }
  if (o.multi) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <textarea className="cli-input cli-json" value={value} rows={4}
          placeholder={`${o.placeholder}\n… 여러 개는 줄바꿈 또는 콤마로 구분 (각각 for 루프로 복사)`}
          onChange={e => onChange(e.target.value)} />
      </div>
    )
  }
  if (o.multiple) {
    const selected = value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
    const selectedSet = new Set(selected)
    if (o.choices?.length) {
      const toggle = (choice: string, checked: boolean) => {
        const next = checked ? [...selected, choice] : selected.filter(item => item !== choice)
        onChange([...new Set(next)].join('\n'))
      }
      return (
        <div id={fieldId} className="cli-field" data-cli-option={o.name}>
          {label}
          <div className="cli-multiple-choices" role="group" aria-label={`${o.name} 복수 값 선택`}>
            {o.choices.map(choice => (
              <label key={choice} className="cli-multiple-choice">
                <input type="checkbox" checked={selectedSet.has(choice)}
                  onChange={event => toggle(choice, event.target.checked)} />
                <span>{choice}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <textarea className="cli-input cli-json" value={value} rows={4}
          placeholder={`${o.placeholder || 'value'}\n값마다 한 줄씩 입력하면 같은 옵션을 반복합니다.`}
          onChange={event => onChange(event.target.value)} />
      </div>
    )
  }
  if (o.multiSelect && o.suggestions?.length) {
    const selected = value.split('\n').map(item => item.trim()).filter(Boolean)
    const selectedSet = new Set(selected)
    const customQuery = subVal('custom')
    const toggle = (suggestion: string, checked: boolean) => {
      const next = checked
        ? [...selected, suggestion]
        : selected.filter(item => item !== suggestion)
      onChange([...new Set(next)].join('\n'))
    }
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <div className="cli-query-picker" role="group" aria-label="조회할 인스턴스 필드 복수 선택">
          {o.suggestions.map(suggestion => (
            <label key={suggestion} className="cli-query-choice">
              <input type="checkbox" checked={selectedSet.has(suggestion)}
                disabled={customQuery.trim() !== ''}
                onChange={event => toggle(suggestion, event.target.checked)} />
              <span>{o.suggestionLabels?.[suggestion] ?? suggestion}</span>
              <code>{suggestion}</code>
            </label>
          ))}
        </div>
        <div className="cli-query-custom">
          <span className="cli-sublabel">직접 JMESPath 입력 <small>(입력 시 위 선택보다 우선)</small></span>
          <input className="cli-input" value={customQuery} placeholder="예: data.shapeConfig.ocpus"
            onChange={event => onSub('custom', event.target.value)} />
        </div>
      </div>
    )
  }
  if (!dynamic && o.choices && o.choices.length) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <select className="cli-input" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">(선택 안 함)</option>
          {o.choices.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    )
  }
  const spec = JSONSPEC[o.name]
  if (spec?.list) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <input className="cli-input" value={value} placeholder={spec.ph} onChange={e => onChange(e.target.value)} />
      </div>
    )
  }
  if (spec?.fields) {
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <div className="cli-json-group">
          {spec.fields.map(f => (
            <div key={f.key} className="cli-subfield">
              <span className="cli-sublabel">{f.label}</span>
              {f.kind === 'bool' ? (
                <select className="cli-input" value={subVal(f.key)} onChange={e => onSub(f.key, e.target.value)}>
                  <option value="">(미설정)</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : f.kind === 'ssh' ? (
                <div className="cli-sshrow">
                  <label className="cli-filebtn">
                    파일 업로드
                    <input type="file" accept=".pub,.txt,.pem,text/plain" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) file.text().then(txt => onSub(f.key, txt.trim()))
                        e.target.value = ''
                      }} />
                  </label>
                  <input className="cli-input" value={subVal(f.key)} placeholder={f.ph}
                    onChange={e => onSub(f.key, e.target.value)} />
                </div>
              ) : (
                <input className="cli-input" value={subVal(f.key)} placeholder={f.ph}
                  onChange={e => onSub(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (!dynamic && o.type === 'json') {
    return <JsonOptionField fieldId={fieldId} option={o} label={label} value={value}
      onChange={onChange} subVal={subVal} onSub={onSub} />
  }
  if (o.suggestions?.length) {
    const listId = `cli-suggestions-${o.name.replaceAll('-', '')}`
    return (
      <div id={fieldId} className="cli-field" data-cli-option={o.name}>
        {label}
        <input className="cli-input" list={listId} value={value} placeholder={o.placeholder}
          onChange={e => onChange(e.target.value)} />
        <datalist id={listId}>
          {o.suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}
        </datalist>
      </div>
    )
  }
  return (
    <div id={fieldId} className="cli-field" data-cli-option={o.name}>
      {label}
      <input className="cli-input" value={value}
        inputMode={o.type === 'int' || o.type === 'float' ? 'decimal' : undefined}
        placeholder={dynamic && dynMeta ? dynMeta.input : o.placeholder}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}
