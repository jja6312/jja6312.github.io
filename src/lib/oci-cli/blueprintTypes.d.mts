// Blueprint 엔진 공유 타입 어휘. 런타임은 각 .mjs, 타입은 sibling .d.mts 가 이 파일을 참조한다.
// 스키마(schemas/*.json)·설계 §14 와 일치.

export type ScalarType = 'string' | 'boolean' | 'number' | 'stringArray' | 'json'

export type ValueSource =
  | { source: 'literal'; value: unknown }
  | { source: 'input'; input: string }
  | { source: 'derived'; key: string }
  | { source: 'context'; key: 'profile' | 'region' | 'compartmentId' | 'tenancyId' }
  | { source: 'name' }
  | { source: 'nodeOutput'; node: string; path: string }
  | { source: 'discovery'; key: string; path: string }
  | { source: 'json'; value: unknown }

export interface CommandRef { resource: string; operation: 'create' }
export interface OpCommandRef { kind: 'resourceOperation'; resource: string; operation: 'get' | 'list' | 'create' | 'delete' }

export interface NodeOutputDef { pointer: string; type: ScalarType }

export interface BlueprintNode {
  id: string
  label: string
  commandRef: CommandRef
  naming: { role: string; resourceToken?: string }
  dependsOn: string[]
  when?: unknown
  bindings: Record<string, ValueSource>
  discovery: DiscoveryContract
  comparison: ComparisonContract
  outputs: Record<string, NodeOutputDef>
  verify: VerifyContract[]
  rollback: NodeRollback
}

export interface DiscoveryContract {
  list: { commandRef: OpCommandRef; bindings: Record<string, ValueSource>; pagination: 'all'; itemsPointer: string }
  identity: { idPointer: string; namePointer: string; expectedName: ValueSource; cardinality: 'zero-or-one' }
  get?: { commandRef: OpCommandRef; idOption: string; collect: Record<string, NodeOutputDef> }
  onError: 'block'
}

export type Comparator = 'string' | 'boolean' | 'cidrSet' | 'jsonSet' | 'ocidSet' | 'tagSubset'
export interface ComparisonField { key: string; desired: ValueSource; actualPointer: string; comparator: Comparator; required: true }
export interface ComparisonContract { mode: 'exactManagedFields'; fields: ComparisonField[] }

export type AssertComparator = 'equals' | 'containsSet' | 'lifecycleAvailable' | 'tagSubset'
export interface VerifyAssertion { id: string; actualPointer: string; comparator: AssertComparator; expected: ValueSource; severity: 'fail' | 'warn' }
export interface VerifyContract { commandRef: OpCommandRef; bindings: Record<string, ValueSource>; assertions: VerifyAssertion[] }

export interface NodeRollback {
  commandRef: { kind: 'resourceOperation'; resource: string; operation: 'delete' }
  idOption: string
  waitForState?: string
  ownership: { requiredActualAction: 'CREATED'; runIdTagKey: 'blueprint-run-id'; requireCurrentTagMatch: true }
}

export interface BlueprintInputDef {
  id: string; label: string; group: 'execution' | 'naming' | 'address' | 'topology' | 'metadata'
  type: ScalarType; required?: boolean; requirement?: 'required' | 'optional' | 'conditional'
  default?: unknown; choices?: unknown[]; help?: string
}

export interface CliBlueprint {
  id: string; version: string; label: string; description: string
  category: 'network' | 'compute' | 'database' | 'operations'
  status: 'draft' | 'verified' | 'deprecated'
  namingPolicyId: string
  inputs: BlueprintInputDef[]
  presets: { id: string; label: string; description?: string; values: Record<string, unknown>; enforced?: Record<string, unknown> }[]
  nodes: BlueprintNode[]
  outputs?: unknown[]
  rollback: { order: 'reverseDag'; reusedNodesDeleted?: false; requireConfirm?: string[] }
  evidence: { verifiedAt: string; docs?: { label: string; url: string }[]; notes?: string[] }
  digest?: string
}

export interface NamingPolicy {
  id: string; version: string
  pattern: string
  segmentOrder?: string[]
  normalization?: { lowercase?: boolean; unicodeForm?: string; stripDiacritics?: boolean; replaceRun?: string; replaceWith?: string; trim?: string }
  resourceTokens: Record<string, string>
  roleTokens?: Record<string, string>
  displayName: { maxLength: number; allowedPattern?: string; appliesTo?: string[] }
  dnsLabel: { maxLength: number; mustStartWithLetter?: boolean; allowedPattern?: string; hyphenAllowed?: boolean; appliesTo?: string[] }
  regionAliases: { map: Record<string, string>; fallback?: string; note?: string }
  environments: string[]
  sequence?: { default?: string; pattern?: string }
  [k: string]: unknown
}

export interface BlueprintCatalog {
  schemaVersion: number
  cliSource: { repository?: string; tag?: string; version?: string; commit?: string }
  blueprints: CliBlueprint[]
  namingPolicies: NamingPolicy[]
}

// ── 실행 컨텍스트 + 입력값 ──
export interface ExecutionContext { profile: string; region: string; compartmentId: string; tenancyId?: string }
export type InputValues = Record<string, string>

// ── 파생값 + 이름 ──
export interface RoleName { role: string; displayName: string; dnsLabel?: string; resourceToken: string }
export interface DerivedValues { [key: string]: unknown }
export interface NamingResult { names: Record<string, RoleName>; derived: DerivedValues; issues: string[] }

// ── Discovery 결과(사용자가 붙여넣는 JSON) ──
export interface DiscoveryNodeResult {
  node: string
  status: 'OK' | 'DISCOVERY_ERROR'
  found?: { id: string; name: string; collected?: Record<string, unknown> }
  candidates?: { id: string; name: string }[]
  error?: string
}
export interface DiscoveryResult {
  artifactType: 'discovery-result'
  runId?: string
  services?: { key: string; items: { id: string; name: string }[] }[]
  nodes: DiscoveryNodeResult[]
}

// ── Plan ──
export type PlanState = 'CREATE' | 'REUSE' | 'CONFLICT' | 'BLOCKED' | 'SKIP'
export interface PlanFieldDiff { key: string; desired: unknown; actual: unknown; equal: boolean }
export interface PlanNode {
  nodeId: string; role: string; resource: string; displayName: string
  state: PlanState; reasons: string[]
  existingId?: string
  diffs?: PlanFieldDiff[]
}
export interface Plan {
  blueprintId: string; blueprintVersion: string; blueprintDigest?: string
  order: string[]
  nodes: PlanNode[]
  createCount: number; reuseCount: number; conflictCount: number; blockedCount: number
  executable: boolean
}
export interface PlanDigest { canonical: string; digest: string }

// ── Run 결과(Apply 실행 후 붙여넣는 JSON) ──
export type NodeAction = 'CREATED' | 'REUSED' | 'SKIPPED' | 'FAILED'
export interface OwnedResource { nodeId: string; resource: string; id: string; action: NodeAction; runIdTag?: string }
export interface RunNodeResult {
  node: string; action: NodeAction
  id?: string; outputs?: Record<string, unknown>
  error?: string
}
export interface RunResult {
  artifactType: 'run-result'
  runId: string; planDigest: string
  nodes: RunNodeResult[]
}

// ── Verify 결과 ──
export type VerifyOutcome = 'PASS' | 'WARN' | 'FAIL' | 'ERROR'
export interface VerifyNodeResult {
  node: string; outcome: VerifyOutcome
  assertions?: { id: string; outcome: VerifyOutcome; actual?: unknown; expected?: unknown }[]
  error?: string
}
export interface VerificationResult {
  artifactType: 'verification-result'
  runId: string
  nodes: VerifyNodeResult[]
}

// ── Manifest ──
export type ManifestStatus = 'PROVISIONAL' | 'FINAL'
export interface ManifestNode {
  nodeId: string; role: string; resource: string; displayName: string
  action: NodeAction; id?: string
  verify?: VerifyOutcome
}
export interface RunManifest {
  artifactType: 'run-manifest'
  status: ManifestStatus
  runId: string; blueprintId: string; blueprintVersion: string; planDigest: string
  createdAt?: string
  nodes: ManifestNode[]
  rollbackEligible: string[]
}

// ── 렌더 산출물 ──
export interface RenderedScript { name: string; title: string; content: string }
