import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { computeNaming } from '../lib/oci-cli/blueprintNaming.mjs'
import { computePlan, planDigestInput } from '../lib/oci-cli/blueprintPlan.mjs'
import { renderDiscover, renderApply, renderResume, renderVerify, renderRollback } from '../lib/oci-cli/blueprintRender.mjs'
import { buildProvisionalManifest, mergeVerification } from '../lib/oci-cli/blueprintManifest.mjs'
import { sha256Hex } from '../lib/oci-cli/blueprintCanonical.ts'
import { validateAddressing } from '../lib/oci-cli/cidr.mjs'
import { findOciRegion, ociRegionLabel, searchOciRegions } from '../data/ociRegions.mjs'
import type {
  BlueprintCatalog, CliBlueprint, NamingPolicy, InputValues, DiscoveryResult,
  RunResult, VerificationResult, RunManifest, RenderedScript, PlanNode,
} from '../lib/oci-cli/blueprintTypes.d.mts'

type Catalog = { commands: Record<string, unknown> }
const TABS = ['design', 'discover', 'plan', 'apply', 'verify', 'manifest'] as const
type Tab = typeof TABS[number]
const TAB_LABEL: Record<Tab, string> = {
  design: '1 · DESIGN', discover: '2 · DISCOVER', plan: '3 · PLAN', apply: '4 · APPLY', verify: '5 · VERIFY', manifest: '6 · MANIFEST',
}
const STATE_TONE: Record<string, string> = { CREATE: 'create', REUSE: 'reuse', CONFLICT: 'conflict', BLOCKED: 'blocked', SKIP: 'skip' }
const NAMING_SEGMENTS = ['resource', 'customer', 'workload', 'environment', 'regionAlias', 'role', 'sequence'] as const
const SEGMENT_LABEL: Record<string, string> = {
  customer: '고객사', workload: '워크로드', environment: '환경', regionAlias: '리전',
  resource: '자원 종류', role: '역할', sequence: '순번',
}

function serializeValue(value: unknown, type?: string) {
  if (value === undefined || value === null) return ''
  if (type === 'stringArray' || type === 'json' || Array.isArray(value) || (typeof value === 'object' && typeof value !== 'string')) return JSON.stringify(value)
  return String(value)
}

function decodeList(raw: unknown, fallback: readonly string[] = NAMING_SEGMENTS) {
  if (Array.isArray(raw)) return raw.map(String)
  const value = String(raw ?? '').trim()
  if (!value) return [...fallback]
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch { /* 기존 CSV/줄바꿈 값도 허용 */ }
  return value.split(/[\n,]+/).map(v => v.trim()).filter(Boolean)
}

function mergeSerialized(blueprint: CliBlueprint, values: Record<string, unknown>) {
  const defs = new Map(blueprint.inputs.map(def => [def.id, def]))
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id, serializeValue(value, defs.get(id)?.type)]))
}

type RequiredInput = { id: string; label: string; focusId: string; missing: boolean }

function requiredInputsFor(blueprint: CliBlueprint, inputs: InputValues): RequiredInput[] {
  const items: RequiredInput[] = []
  const add = (id: string, label: string, focusId = `bp-in-${id}`) => items.push({ id, label, focusId, missing: !String(inputs[id] ?? '').trim() })
  for (const def of blueprint.inputs) {
    if (def.group !== 'naming' && def.requirement === 'required') add(def.id, def.label)
  }
  if (inputs['topology.enableSshIngress'] === 'true') add('address.sshSourceCidr', 'SSH 허용 source CIDR')

  const mode = inputs['naming.mode'] || 'CONVENTION'
  add('naming.mode', '네이밍 방식')
  if (mode === 'MANUAL') {
    for (const node of blueprint.nodes) add(`naming.manual.${node.id}`, `${node.label} 이름`)
  } else {
    const included = decodeList(inputs['naming.includedSegments'])
    for (const id of ['customer', 'workload', 'environment']) {
      if (included.includes(id)) add(`naming.${id}`, SEGMENT_LABEL[id])
    }
  }
  return items
}

type WizardQuestion = {
  id: string; label: string; type: string; valueId?: string; choices?: string[]
  optional?: boolean; help?: string; placeholder?: string
}

const INPUT_PLACEHOLDERS: Record<string, string> = {
  'execution.profile': '예: DEFAULT',
  'execution.region': '서울, 일본 또는 ap-seoul-1 검색',
  'execution.compartment': '예: ocid1.compartment.oc1.. 또는 컴파트먼트 이름',
  'naming.customer': '예: wizbase',
  'naming.workload': '예: web, erp, db',
  'naming.environment': '예: dev',
  'naming.regionAlias': '선택 입력 · 예: icn',
  'naming.sequence': '예: 01',
  'address.vcnCidrs': '예: 10.0.0.0/16',
  'address.publicSubnetCidr': '예: 10.0.10.0/24',
  'address.privateSubnetCidr': '예: 10.0.20.0/24',
  'address.sshSourceCidr': '예: 0.0.0.0/0 또는 203.0.113.0/24',
  'metadata.freeformTags': '키와 값을 각각 입력하세요',
  'metadata.definedTags': '네임스페이스, 키, 값을 각각 입력하세요',
}

function placeholderFor(id: string, type: string) {
  if (INPUT_PLACEHOLDERS[id]) return INPUT_PLACEHOLDERS[id]
  if (id.startsWith('naming.manual.')) return '직접 사용할 자원 이름'
  if (type === 'stringArray') return '쉼표 또는 줄바꿈으로 여러 값을 입력'
  return '값을 입력하세요'
}

function wizardQuestionsFor(blueprint: CliBlueprint, inputs: InputValues, enforcedKeys: Set<string>): WizardQuestion[] {
  const byId = new Map(blueprint.inputs.map(def => [def.id, def]))
  const fromDef = (id: string, optional?: boolean): WizardQuestion | null => {
    const def = byId.get(id)
    if (!def || enforcedKeys.has(id)) return null
    return { id, label: def.label, type: def.type, choices: def.choices?.map(String), optional: optional ?? def.requirement !== 'required', help: def.help, placeholder: placeholderFor(id, def.type) }
  }
  const questions: WizardQuestion[] = []
  const modeQuestion = fromDef('naming.mode', false)
  if (modeQuestion) questions.push(modeQuestion)
  const mode = inputs['naming.mode'] || 'CONVENTION'
  if (mode === 'MANUAL') {
    for (const node of blueprint.nodes) questions.push({ id: `naming.manual.${node.id}`, label: `${node.label} 이름`, type: 'string', optional: false, placeholder: `${node.label}에 사용할 이름` })
  } else {
    const separator = fromDef('naming.separator', false)
    if (separator) questions.push(separator)
    questions.push({ id: 'naming.segments', label: '네이밍 요소 선택·순서', type: 'segments', optional: false, help: '↑↓ 이동, Space 포함/제외, Alt+↑↓ 순서 변경, Enter 확정' })
    const included = decodeList(inputs['naming.includedSegments'])
    for (const segment of ['customer', 'workload', 'environment', 'regionAlias', 'sequence']) {
      if (!included.includes(segment)) continue
      const q = fromDef(`naming.${segment}`, !['customer', 'workload', 'environment'].includes(segment))
      if (q) questions.push(q)
    }
  }
  for (const group of ['execution', 'topology', 'address', 'metadata']) for (const def of blueprint.inputs) {
    if (def.group !== group || enforcedKeys.has(def.id)) continue
    questions.push({ id: def.id, label: def.label, type: def.type, choices: def.choices?.map(String), optional: def.requirement !== 'required' && !(def.id === 'address.sshSourceCidr' && inputs['topology.enableSshIngress'] === 'true'), help: def.help, placeholder: placeholderFor(def.id, def.type) })
  }
  return questions
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="bp-copy" onClick={() => {
      void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) })
    }}>{done ? '복사됨 ✓' : '복사'}</button>
  )
}

function ScriptBlock({ script }: { script: RenderedScript }) {
  return (
    <div className="bp-script">
      <div className="bp-script-head"><span className="bp-mono">{script.name}</span><CopyButton text={script.content} /></div>
      <pre className="bp-pre"><code>{script.content}</code></pre>
    </div>
  )
}

// artifactType 검증 후 파싱. 실패 시 {error}
function parseArtifact<T>(raw: string, expected: string): { value?: T; error?: string } {
  const s = raw.trim()
  if (!s) return {}
  let parsed: unknown
  try { parsed = JSON.parse(s) } catch (e) { return { error: `JSON 파싱 실패: ${(e as Error).message}` } }
  if (!parsed || typeof parsed !== 'object') return { error: 'JSON 객체가 아닙니다' }
  const at = (parsed as { artifactType?: string }).artifactType
  if (at && at !== expected) return { error: `artifactType 불일치: ${at} (기대: ${expected})` }
  return { value: parsed as T }
}

function ImportBox({ label, expected, value, onChange, error }: { label: string; expected: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="bp-import">
      <label className="bp-import-label">{label} <span className="bp-mono bp-dim">artifactType: {expected}</span></label>
      <textarea className="bp-textarea" spellCheck={false} value={value} placeholder={`스크립트가 마지막에 출력한 ${expected} JSON 을 붙여넣으세요`} onChange={e => onChange(e.target.value)} />
      {error ? <p className="bp-err">⚠ {error}</p> : null}
    </div>
  )
}

export default function CliBlueprintWorkspace({ catalog, blueprintCatalog, initialId, initialVersion, onExit }: {
  catalog: Catalog
  blueprintCatalog: BlueprintCatalog | undefined
  initialId?: string | null
  initialVersion?: string | null
  onExit?: () => void
}) {
  const blueprints = useMemo(() => blueprintCatalog?.blueprints ?? [], [blueprintCatalog])
  const policies = useMemo(() => blueprintCatalog?.namingPolicies ?? [], [blueprintCatalog])
  const [selectedKey, setSelectedKey] = useState(() => {
    const m = blueprints.find(b => b.id === initialId && (!initialVersion || String(b.version) === String(initialVersion)))
    return m ? `${m.id}@${m.version}` : (blueprints[0] ? `${blueprints[0].id}@${blueprints[0].version}` : '')
  })
  const blueprint: CliBlueprint | undefined = useMemo(
    () => blueprints.find(b => `${b.id}@${b.version}` === selectedKey), [blueprints, selectedKey])
  const policy: NamingPolicy | undefined = useMemo(
    () => policies.find(p => p.id === blueprint?.namingPolicyId), [policies, blueprint])

  const [tab, setTab] = useState<Tab>('design')
  const [inputs, setInputs] = useState<InputValues>({})
  const [preset, setPreset] = useState<string>('')
  const [discoverRaw, setDiscoverRaw] = useState('')
  const [runRaw, setRunRaw] = useState('')
  const [verifyRaw, setVerifyRaw] = useState('')
  const [planDigest, setPlanDigest] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  // 초기 입력값(default + preset)
  useEffect(() => {
    if (!blueprint) return
    const base: InputValues = {}
    for (const i of blueprint.inputs) if (i.default !== undefined && i.default !== null) base[i.id] = serializeValue(i.default, i.type)
    const p = blueprint.presets?.[0]
    if (p) { Object.assign(base, mergeSerialized(blueprint, { ...p.values, ...(p.enforced ?? {}) })); setPreset(p.id) }
    setInputs(base)
    setDiscoverRaw(''); setRunRaw(''); setVerifyRaw(''); setTab('design')
  }, [blueprint])

  const setInput = (id: string, v: string) => setInputs(prev => ({ ...prev, [id]: v }))
  const enforcedKeys = useMemo(() => {
    const p = blueprint?.presets?.find(x => x.id === preset)
    return new Set(Object.keys(p?.enforced ?? {}))
  }, [blueprint, preset])
  const requiredInputs = useMemo(() => blueprint ? requiredInputsFor(blueprint, inputs) : [], [blueprint, inputs])
  const wizardQuestions = useMemo(() => blueprint ? wizardQuestionsFor(blueprint, inputs, enforcedKeys) : [], [blueprint, inputs, enforcedKeys])

  useEffect(() => {
    const openWizard = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        setWizardOpen(true)
      }
    }
    window.addEventListener('keydown', openWizard)
    return () => window.removeEventListener('keydown', openWizard)
  }, [])

  const focusInput = (focusId: string) => {
    setTab('design')
    window.setTimeout(() => {
      const element = document.getElementById(focusId) as HTMLElement | null
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element?.focus({ preventScroll: true })
    }, 80)
  }

  const naming = useMemo(() => (blueprint && policy) ? computeNaming(blueprint, policy, inputs) : null, [blueprint, policy, inputs])
  const discovery = useMemo<DiscoveryResult | undefined>(() => parseArtifact<DiscoveryResult>(discoverRaw, 'discovery-result').value, [discoverRaw])
  const discoveryErr = parseArtifact(discoverRaw, 'discovery-result').error
  const plan = useMemo(() => (blueprint && naming && discovery) ? computePlan({ blueprint, inputs, naming, discovery }) : null, [blueprint, naming, discovery, inputs])

  useEffect(() => {
    let alive = true
    if (plan) void sha256Hex(planDigestInput(plan)).then(d => { if (alive) setPlanDigest(d) })
    else setPlanDigest('')
    return () => { alive = false }
  }, [plan])

  const runResult = useMemo<RunResult | undefined>(() => parseArtifact<RunResult>(runRaw, 'run-result').value, [runRaw])
  const runErr = parseArtifact(runRaw, 'run-result').error
  const manifest = useMemo<RunManifest | null>(() => (blueprint && plan && runResult && naming) ? buildProvisionalManifest({ blueprint, plan, runResult, naming }) : null, [blueprint, plan, runResult, naming])
  const verification = useMemo<VerificationResult | undefined>(() => parseArtifact<VerificationResult>(verifyRaw, 'verification-result').value, [verifyRaw])
  const verifyErr = parseArtifact(verifyRaw, 'verification-result').error
  const finalManifest = useMemo<RunManifest | null>(() => (manifest && verification) ? mergeVerification(manifest, verification) : manifest, [manifest, verification])

  // 주소(CIDR) 사전검증 — Apply 전에 잡아 부분 실패(자원 N개 생성 후 서브넷서 중단) 방지
  const addressIssues = useMemo(() => (blueprint ? validateAddressing(inputs) : []), [blueprint, inputs])

  // 검증 사이드바 항목
  const issues: { tone: string; text: string }[] = []
  if (naming) for (const i of naming.issues) issues.push({ tone: 'warn', text: i })
  for (const i of addressIssues) issues.push({ tone: 'err', text: i })
  if (discoveryErr) issues.push({ tone: 'err', text: `Discovery import: ${discoveryErr}` })
  if (runErr) issues.push({ tone: 'err', text: `Run-result import: ${runErr}` })
  if (verifyErr) issues.push({ tone: 'err', text: `Verify import: ${verifyErr}` })
  if (plan) {
    for (const n of plan.nodes) if (n.state === 'CONFLICT' || n.state === 'BLOCKED') issues.push({ tone: n.state === 'BLOCKED' ? 'err' : 'warn', text: `${n.state}: ${n.displayName} — ${n.reasons.join(' / ')}` })
  }

  if (!blueprintCatalog || blueprints.length === 0) {
    return (
      <div className="bp-workspace">
        <div className="bp-topbar"><h1 className="bp-title">OCI CLI Blueprint</h1>{onExit ? <button className="bp-exit" onClick={onExit}>← CLI 빌더</button> : null}</div>
        <div className="bp-empty">
          <p>Blueprint 데이터가 아직 빌드되지 않았습니다.</p>
          <p className="bp-dim">보호 데이터에 <span className="bp-mono">cliBlueprints</span> L1 이 포함되도록 <span className="bp-mono">HUB_LOCK_1/2/3 npm run gen:protected</span> 실행 후 커밋·배포가 필요합니다.</p>
        </div>
      </div>
    )
  }

  const renderArgs = (blueprint && naming) ? { blueprint, catalog, inputs, naming } : null

  return (
    <div className="bp-workspace">
      <div className="bp-topbar">
        <h1 className="bp-title">OCI CLI Blueprint</h1>
        <select className="bp-select" value={selectedKey} onChange={e => setSelectedKey(e.target.value)} aria-label="Blueprint 선택">
          {blueprints.map(b => <option key={`${b.id}@${b.version}`} value={`${b.id}@${b.version}`}>{b.label} (v{b.version}{b.status !== 'verified' ? ` · ${b.status}` : ''})</option>)}
        </select>
        <button type="button" className="bp-wizard-launch" onClick={() => setWizardOpen(true)}>입력 마법사 <kbd>Alt+I</kbd></button>
        {onExit ? <button className="bp-exit" onClick={onExit}>← CLI 빌더</button> : null}
      </div>

      <div className="bp-body">
        <div className="bp-main">
          <div className="bp-tabs" role="tablist">
            {TABS.map(tk => <button key={tk} role="tab" aria-selected={tab === tk} className={`bp-tab${tab === tk ? ' on' : ''}`} onClick={() => setTab(tk)}>{TAB_LABEL[tk]}</button>)}
          </div>

          {tab === 'design' && blueprint && (
            <DesignTab blueprint={blueprint} inputs={inputs} setInput={setInput} preset={preset} setPreset={p => { setPreset(p); const pr = blueprint.presets?.find(x => x.id === p); if (pr) setInputs(prev => ({ ...prev, ...mergeSerialized(blueprint, { ...pr.values, ...(pr.enforced ?? {}) }) })) }} enforcedKeys={enforcedKeys} naming={naming} />
          )}

          {tab === 'discover' && renderArgs && (
            <div className="bp-tabpanel">
              <p className="bp-lead">기존 자원을 <b>읽기 전용</b>으로 조회합니다. 실행 후 마지막 JSON 을 아래에 붙여넣으세요.</p>
              <ScriptBlock script={renderDiscover(renderArgs)} />
              <ImportBox label="Discovery 결과 Import" expected="discovery-result" value={discoverRaw} onChange={setDiscoverRaw} error={discoveryErr} />
              {discovery ? <p className="bp-ok">✓ Discovery {discovery.nodes.length}개 노드 로드됨 → PLAN 탭 확인</p> : null}
            </div>
          )}

          {tab === 'plan' && (
            <PlanTab plan={plan} planDigest={planDigest} />
          )}

          {tab === 'apply' && renderArgs && (
            <div className="bp-tabpanel">
              {addressIssues.length ? <div className="bp-err">주소(CIDR) 오류로 Apply 를 생성하지 않습니다 — 서브넷은 VCN CIDR 안에 있어야 합니다:<ul>{addressIssues.map((i, k) => <li key={k}>{i}</li>)}</ul></div>
                : !plan ? <p className="bp-warn">먼저 DISCOVER 에서 결과를 Import 하면 PLAN 이 계산됩니다.</p>
                : !plan.executable ? <p className="bp-err">PLAN 에 CONFLICT/BLOCKED 가 있어 Apply 를 생성하지 않습니다. 충돌을 해소하세요.</p>
                  : <>
                    <p className="bp-lead">아래 스크립트를 검토 후 실행하고, 마지막 <span className="bp-mono">run-result</span> JSON 을 붙여넣으세요.</p>
                    <ScriptBlock script={renderApply({ ...renderArgs, plan, planDigest })} />
                    <details className="bp-details"><summary>중단 후 재개(Resume)</summary><ScriptBlock script={renderResume({ ...renderArgs, plan, planDigest, priorRunResult: runResult })} /></details>
                    <ImportBox label="Run 결과 Import" expected="run-result" value={runRaw} onChange={setRunRaw} error={runErr} />
                    {manifest ? <p className="bp-ok">✓ PROVISIONAL manifest 생성됨 → VERIFY/MANIFEST 확인</p> : null}
                  </>}
            </div>
          )}

          {tab === 'verify' && renderArgs && (
            <div className="bp-tabpanel">
              {!manifest ? <p className="bp-warn">APPLY 에서 run-result 를 Import 한 뒤 Verify 를 생성할 수 있습니다.</p>
                : <>
                  <p className="bp-lead">생성된 자원을 검증하고 <span className="bp-mono">verification-result</span> 를 붙여넣으세요.</p>
                  <ScriptBlock script={renderVerify({ ...renderArgs, manifest })} />
                  <ImportBox label="검증 결과 Import" expected="verification-result" value={verifyRaw} onChange={setVerifyRaw} error={verifyErr} />
                  {verification && finalManifest ? <VerifySummary manifest={finalManifest} /> : null}
                </>}
            </div>
          )}

          {tab === 'manifest' && renderArgs && (
            <ManifestTab manifest={finalManifest} renderArgs={renderArgs} planDigest={planDigest} />
          )}
        </div>

        <aside className="bp-side">
          <section className="bp-required-panel" aria-labelledby="bp-required-title">
            <div className="bp-side-heading">
              <h2 id="bp-required-title">실행 전 입력 확인</h2>
              <span>{requiredInputs.filter(item => !item.missing).length}/{requiredInputs.length}</span>
            </div>
            <div className="bp-required-list">
              {requiredInputs.map(item => (
                <button type="button" key={item.id} className={`bp-required-item${item.missing ? ' missing' : ' done'}`} onClick={() => focusInput(item.focusId)}>
                  <span aria-hidden="true">{item.missing ? '○' : '✓'}</span><span>{item.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="bp-wizard-side" onClick={() => setWizardOpen(true)}>키보드로 한 번에 입력 <kbd>Alt+I</kbd></button>
          </section>
          <h2 className="bp-side-title">검증</h2>
          {issues.length === 0 ? <p className="bp-ok">문제 없음</p> : (
            <ul className="bp-issues">{issues.map((it, i) => <li key={i} className={`bp-issue ${it.tone}`}>{it.text}</li>)}</ul>
          )}
          {blueprint ? (
            <div className="bp-evidence">
              <h3>근거</h3>
              <p className="bp-dim">{blueprint.description}</p>
              {(blueprint.evidence?.docs ?? []).map((d, i) => <a key={i} href={d.url} target="_blank" rel="noreferrer" className="bp-doc">{d.label}</a>)}
              {(blueprint.evidence?.notes ?? []).map((n, i) => <p key={i} className="bp-note">· {n}</p>)}
            </div>
          ) : null}
        </aside>
      </div>
      {wizardOpen && blueprint ? <InputWizard questions={wizardQuestions} inputs={inputs} setInput={setInput} onClose={() => setWizardOpen(false)} /> : null}
    </div>
  )
}

function RegionCombobox({ id, value, onChange, disabled = false, className, placeholder, onCommit, inputRef }: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className: string
  placeholder: string
  onCommit?: () => void
  inputRef?: (element: HTMLInputElement | null) => void
}) {
  const selected = findOciRegion(value)
  const selectedLabel = selected ? ociRegionLabel(selected) : value
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ownRef = useRef<HTMLInputElement | null>(null)
  const exactSelected = selected && query === selectedLabel
  const matches = exactSelected ? [selected] : searchOciRegions(query)

  useEffect(() => {
    if (!open) setQuery(selectedLabel)
  }, [selectedLabel, open])

  const assignInput = (element: HTMLInputElement | null) => {
    ownRef.current = element
    inputRef?.(element)
  }
  const choose = (region: NonNullable<typeof selected> | (typeof matches)[number], commit = false) => {
    onChange(region.id)
    setQuery(ociRegionLabel(region))
    setOpen(false)
    if (commit) window.setTimeout(() => onCommit?.(), 0)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation(); setOpen(true)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive(index => Math.max(0, Math.min(matches.length - 1, index + delta)))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation()
      if (exactSelected) onCommit?.()
      else if (matches[active]) choose(matches[active], true)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(selectedLabel)
    }
  }

  return (
    <div className="bp-region-combobox">
      <input ref={assignInput} id={id} className={className} disabled={disabled} value={query} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-expanded={open} aria-controls={`${id}-regions`} aria-autocomplete="list"
        onFocus={event => { setOpen(true); setActive(0); event.currentTarget.select() }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0) }} onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(selectedLabel) }, 120)} />
      {open && matches.length ? (
        <div id={`${id}-regions`} className="bp-region-options" role="listbox">
          {matches.map((region, index) => (
            <button type="button" role="option" aria-selected={index === active} key={region.id}
              className={`bp-region-option${index === active ? ' active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(region)}>
              <span>{ociRegionLabel(region)}</span><small>{region.countryKo} · {region.key} · {region.realm}</small>
            </button>
          ))}
        </div>
      ) : open ? <div className="bp-region-options empty">일치하는 OCI 리전이 없습니다.</div> : null}
    </div>
  )
}

type TagRow = { namespace: string; key: string; value: string }

function parseTagRows(raw: string, defined: boolean): TagRow[] {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>
    const rows: TagRow[] = []
    if (defined) {
      for (const [namespace, tags] of Object.entries(parsed)) if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
        for (const [key, value] of Object.entries(tags as Record<string, unknown>)) rows.push({ namespace, key, value: String(value ?? '') })
      }
    } else {
      for (const [key, value] of Object.entries(parsed)) rows.push({ namespace: '', key, value: String(value ?? '') })
    }
    return rows.length ? rows : [{ namespace: '', key: '', value: '' }]
  } catch {
    return [{ namespace: '', key: '', value: '' }]
  }
}

function serializeTagRows(rows: TagRow[], defined: boolean) {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    if (defined) {
      const namespace = row.namespace.trim()
      if (!namespace) continue
      const current = (result[namespace] ?? {}) as Record<string, string>
      current[key] = row.value
      result[namespace] = current
    } else result[key] = row.value
  }
  return Object.keys(result).length ? JSON.stringify(result) : ''
}

function TagEditor({ value, onChange, defined, disabled = false, wizard = false, inputRef }: {
  value: string
  onChange: (value: string) => void
  defined: boolean
  disabled?: boolean
  wizard?: boolean
  inputRef?: (element: HTMLInputElement | null) => void
}) {
  const [rows, setRows] = useState<TagRow[]>(() => parseTagRows(value, defined))
  useEffect(() => {
    const incoming = parseTagRows(value, defined)
    setRows(current => serializeTagRows(current, defined) === serializeTagRows(incoming, defined) ? current : incoming)
  }, [value, defined])

  const updateRows = (next: TagRow[]) => {
    const safe = next.length ? next : [{ namespace: '', key: '', value: '' }]
    setRows(safe)
    onChange(serializeTagRows(safe, defined))
  }
  const update = (index: number, field: keyof TagRow, nextValue: string) => {
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: nextValue } : row)
    updateRows(next)
  }

  return (
    <div className={`bp-tag-editor${defined ? ' defined' : ''}${wizard ? ' wizard' : ''}`}>
      <div className="bp-tag-head">
        {defined ? <span>네임스페이스</span> : null}<span>키</span><span>값</span><span aria-hidden="true" />
      </div>
      {rows.map((row, index) => (
        <div className="bp-tag-row" key={index}>
          {defined ? <input ref={index === 0 ? inputRef : undefined} disabled={disabled} value={row.namespace} placeholder="예: Operations" aria-label={`Defined tag ${index + 1} 네임스페이스`} onChange={event => update(index, 'namespace', event.target.value)} /> : null}
          <input ref={!defined && index === 0 ? inputRef : undefined} disabled={disabled} value={row.key} placeholder="예: owner" aria-label={`${defined ? 'Defined' : 'Free-form'} tag ${index + 1} 키`} onChange={event => update(index, 'key', event.target.value)} />
          <input disabled={disabled} value={row.value} placeholder="예: platform-team" aria-label={`${defined ? 'Defined' : 'Free-form'} tag ${index + 1} 값`} onChange={event => update(index, 'value', event.target.value)} />
          <button type="button" disabled={disabled} aria-label="태그 행 삭제" onKeyDown={event => event.stopPropagation()} onClick={() => updateRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>
      ))}
      <button type="button" className="bp-tag-add" disabled={disabled} onKeyDown={event => event.stopPropagation()}
        onClick={() => updateRows([...rows, { namespace: '', key: '', value: '' }])}>+ 태그 추가</button>
      <p className="bp-help">JSON은 자동 생성됩니다. {defined ? '네임스페이스·키·값' : '키·값'}만 입력하세요.</p>
    </div>
  )
}

function Field({ def, value, onChange, locked }: { def: CliBlueprint['inputs'][number]; value: string; onChange: (v: string) => void; locked: boolean }) {
  const common = { id: `bp-in-${def.id}`, disabled: locked, className: `bp-field-input${String(value).trim() ? ' filled' : ''}` }
  let control: ReactNode
  if (def.id === 'execution.region') {
    control = <RegionCombobox {...common} value={value} onChange={onChange} placeholder={placeholderFor(def.id, def.type)} />
  } else if (def.id === 'metadata.freeformTags' || def.id === 'metadata.definedTags') {
    control = <TagEditor value={value} onChange={onChange} defined={def.id === 'metadata.definedTags'} disabled={locked} />
  } else if (def.choices?.length) {
    const choices = [...new Set([...(def.requirement === 'required' ? [] : ['']), ...def.choices.map(String)])]
    control = <select {...common} value={value} onChange={e => onChange(e.target.value)}>{choices.map(c => <option key={c || '__empty'} value={c}>{c || '(구분자 없음/미선택)'}</option>)}</select>
  } else if (def.type === 'boolean') control = <label className="bp-check"><input id={`bp-in-${def.id}`} type="checkbox" disabled={locked} checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} /> {value === 'true' ? '예' : '아니오'}</label>
  else if (def.type === 'json' || def.type === 'stringArray') control = <textarea {...common} rows={2} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholderFor(def.id, def.type)} />
  else control = <input {...common} type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholderFor(def.id, def.type)} />
  return (
    <div className="bp-field">
      <label htmlFor={`bp-in-${def.id}`} className="bp-field-label">{def.label}{def.requirement === 'required' ? <span className="bp-req">*</span> : null}{locked ? <span className="bp-lock">preset 고정</span> : null}</label>
      {control}
      {def.help ? <p className="bp-help">{def.help}</p> : null}
    </div>
  )
}

function NamingEditor({ blueprint, inputs, setInput, enforcedKeys }: {
  blueprint: CliBlueprint; inputs: InputValues; setInput: (id: string, value: string) => void; enforcedKeys: Set<string>
}) {
  const [dragged, setDragged] = useState<string | null>(null)
  const mode = inputs['naming.mode'] || 'CONVENTION'
  const order = decodeList(inputs['naming.segmentOrder'])
  const included = decodeList(inputs['naming.includedSegments'])
  const defs = new Map(blueprint.inputs.map(def => [def.id, def]))
  const updateOrder = (next: string[]) => setInput('naming.segmentOrder', JSON.stringify(next))
  const updateIncluded = (segment: string, checked: boolean) => {
    const next = checked ? [...new Set([...included, segment])] : included.filter(value => value !== segment)
    setInput('naming.includedSegments', JSON.stringify(next))
  }
  const move = (segment: string, delta: number) => {
    const from = order.indexOf(segment)
    const to = Math.max(0, Math.min(order.length - 1, from + delta))
    if (from < 0 || from === to) return
    const next = [...order]
    next.splice(to, 0, next.splice(from, 1)[0])
    updateOrder(next)
  }
  const dropAt = (target: string) => {
    if (!dragged || dragged === target) return setDragged(null)
    const next = order.filter(value => value !== dragged)
    next.splice(Math.max(0, next.indexOf(target)), 0, dragged)
    updateOrder(next)
    setDragged(null)
  }
  const modeDef = defs.get('naming.mode')
  const separatorDef = defs.get('naming.separator')

  return <>
    {modeDef ? <Field def={modeDef} value={mode} onChange={value => setInput(modeDef.id, value)} locked={enforcedKeys.has(modeDef.id)} /> : null}
    {mode === 'MANUAL' ? (
      <div className="bp-manual-names">
        <p className="bp-help">컨벤션을 사용하지 않습니다. Blueprint가 만드는 모든 자원 이름을 직접 지정하세요.</p>
        {blueprint.nodes.map(node => (
          <div className="bp-field" key={node.id}>
            <label className="bp-field-label" htmlFor={`bp-in-naming.manual.${node.id}`}>{node.label} 이름<span className="bp-req">*</span></label>
            <input id={`bp-in-naming.manual.${node.id}`} className="bp-field-input" value={inputs[`naming.manual.${node.id}`] ?? ''} placeholder={`${node.label}에 사용할 이름`} onChange={event => setInput(`naming.manual.${node.id}`, event.target.value)} />
          </div>
        ))}
      </div>
    ) : <>
      {separatorDef ? <Field def={separatorDef} value={inputs[separatorDef.id] ?? '-'} onChange={value => setInput(separatorDef.id, value)} locked={enforcedKeys.has(separatorDef.id)} /> : null}
      <div className="bp-segment-box">
        <div className="bp-field-label">네이밍 요소 · 포함 여부와 순서</div>
        <div className="bp-segment-list">
          {order.map(segment => (
            <div key={segment} className={`bp-segment-row${dragged === segment ? ' dragging' : ''}`} draggable
              onDragStart={() => setDragged(segment)} onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()} onDrop={() => dropAt(segment)}>
              <span className="bp-drag-handle" aria-hidden="true">⋮⋮</span>
              <input id={`bp-segment-${segment}`} type="checkbox" checked={included.includes(segment)} onChange={event => updateIncluded(segment, event.target.checked)} />
              <label htmlFor={`bp-segment-${segment}`}>{SEGMENT_LABEL[segment] ?? segment}</label>
              <code>{segment}</code>
              <span className="bp-segment-actions">
                <button type="button" onClick={() => move(segment, -1)} aria-label={`${SEGMENT_LABEL[segment]} 앞으로 이동`}>↑</button>
                <button type="button" onClick={() => move(segment, 1)} aria-label={`${SEGMENT_LABEL[segment]} 뒤로 이동`}>↓</button>
              </span>
            </div>
          ))}
        </div>
      </div>
      {['customer', 'workload', 'environment', 'regionAlias', 'sequence'].filter(segment => included.includes(segment)).map(segment => {
        const def = defs.get(`naming.${segment}`)
        return def ? <Field key={def.id} def={def} value={inputs[def.id] ?? ''} onChange={value => setInput(def.id, value)} locked={enforcedKeys.has(def.id)} /> : null
      })}
    </>}
  </>
}

function DesignTab({ blueprint, inputs, setInput, preset, setPreset, enforcedKeys, naming }: {
  blueprint: CliBlueprint; inputs: InputValues; setInput: (id: string, v: string) => void
  preset: string; setPreset: (p: string) => void; enforcedKeys: Set<string>; naming: ReturnType<typeof computeNaming> | null
}) {
  const groups = ['execution', 'naming', 'address', 'topology', 'metadata'] as const
  const GLABEL: Record<string, string> = { execution: '실행 컨텍스트', naming: '네이밍', address: '주소(CIDR)', topology: '토폴로지', metadata: '태그' }
  return (
    <div className="bp-tabpanel bp-design">
      <div className="bp-design-form">
        {blueprint.presets?.length ? (
          <div className="bp-field">
            <label className="bp-field-label" htmlFor="bp-preset">프리셋</label>
            <select id="bp-preset" className="bp-field-input" value={preset} onChange={e => setPreset(e.target.value)}>
              {blueprint.presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        ) : null}
        {groups.map(g => {
          const fields = blueprint.inputs.filter(i => i.group === g)
          if (!fields.length) return null
          return (
            <fieldset key={g} className="bp-group">
              <legend>{GLABEL[g]}</legend>
              {g === 'naming'
                ? <NamingEditor blueprint={blueprint} inputs={inputs} setInput={setInput} enforcedKeys={enforcedKeys} />
                : fields.map(def => <Field key={def.id} def={def} value={inputs[def.id] ?? ''} onChange={v => setInput(def.id, v)} locked={enforcedKeys.has(def.id)} />)}
            </fieldset>
          )
        })}
      </div>
      <div className="bp-design-preview">
        <h3>이름 미리보기</h3>
        {naming ? (
          <table className="bp-names"><tbody>
            {Object.entries(naming.names).map(([id, n]) => (
              <tr key={id}>
                <td className="bp-mono bp-dim">{id}</td>
                <td>
                  {inputs['naming.mode'] === 'MANUAL' ? <span className="bp-mono">{n.displayName}</span> : (
                    <input className={`bp-name-override${inputs[`naming.override.${id}`] ? ' overridden' : ''}`}
                      value={inputs[`naming.override.${id}`] ?? ''} placeholder={n.displayName}
                      aria-label={`${id} 이름 개별 수정`} title="비워두면 컨벤션 이름을 사용합니다"
                      onChange={event => setInput(`naming.override.${id}`, event.target.value)} />
                  )}
                </td>
                <td className="bp-mono bp-dim">{n.dnsLabel ?? ''}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="bp-dim">naming 정책 로드 대기</p>}
        {inputs['naming.mode'] !== 'MANUAL' ? <p className="bp-help">자원별 입력값을 비워두면 컨벤션 이름으로 즉시 돌아갑니다.</p> : null}
        <p className="bp-dim bp-region">region alias: <span className="bp-mono">{naming?.regionAlias}</span></p>
      </div>
    </div>
  )
}

function WizardSegmentPicker({ inputs, setInput, onConfirm }: {
  inputs: InputValues; setInput: (id: string, value: string) => void; onConfirm: () => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const order = decodeList(inputs['naming.segmentOrder'])
  const included = decodeList(inputs['naming.includedSegments'])
  const [active, setActive] = useState(0)
  useEffect(() => { rootRef.current?.focus() }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = order[active]
    if (!current) return
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onConfirm(); return }
    if (event.key === ' ') {
      event.preventDefault(); event.stopPropagation()
      const next = included.includes(current) ? included.filter(v => v !== current) : [...included, current]
      setInput('naming.includedSegments', JSON.stringify(next))
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault(); event.stopPropagation()
    const delta = event.key === 'ArrowUp' ? -1 : 1
    if (event.altKey) {
      const to = Math.max(0, Math.min(order.length - 1, active + delta))
      if (to !== active) {
        const next = [...order]
        next.splice(to, 0, next.splice(active, 1)[0])
        setInput('naming.segmentOrder', JSON.stringify(next))
        setActive(to)
      }
    } else setActive(index => Math.max(0, Math.min(order.length - 1, index + delta)))
  }

  return (
    <div ref={rootRef} className="bp-wizard-segments" tabIndex={0} onKeyDown={onKeyDown} aria-label="네이밍 요소 선택 및 순서 변경">
      {order.map((segment, index) => (
        <div key={segment} className={`bp-wizard-segment${index === active ? ' active' : ''}${included.includes(segment) ? ' included' : ''}`}>
          <span>{included.includes(segment) ? '✓' : '○'}</span><strong>{SEGMENT_LABEL[segment] ?? segment}</strong><code>{segment}</code>
        </div>
      ))}
    </div>
  )
}

function questionHasValue(question: WizardQuestion, inputs: InputValues) {
  if (question.type === 'segments') return decodeList(inputs['naming.includedSegments'], []).length > 0
  const value = String(inputs[question.valueId ?? question.id] ?? '').trim()
  if (question.type === 'boolean') return value === 'true' || value === 'false'
  return Boolean(value)
}

function InputWizard({ questions, inputs, setInput, onClose }: {
  questions: WizardQuestion[]; inputs: InputValues; setInput: (id: string, value: string) => void; onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [moving, setMoving] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [completed, setCompleted] = useState<Set<string>>(() => new Set())
  const inputRef = useRef<HTMLElement | null>(null)
  const question = questions[Math.min(index, Math.max(0, questions.length - 1))]
  const questionValueId = question?.valueId ?? question?.id ?? ''
  const requiredChoiceDefault = !question?.optional ? question?.choices?.[0] : undefined

  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [])
  useEffect(() => {
    if (index >= questions.length && questions.length) setIndex(questions.length - 1)
  }, [index, questions.length])
  useEffect(() => {
    if (!moving && question?.type !== 'segments') window.setTimeout(() => inputRef.current?.focus(), 20)
    setBlocked(false)
  }, [question?.id, question?.type, moving])
  useEffect(() => {
    if (!questionValueId || !requiredChoiceDefault) return
    if (!String(inputs[questionValueId] ?? '').trim()) setInput(questionValueId, requiredChoiceDefault)
  }, [questionValueId, requiredChoiceDefault, inputs, setInput])

  const answered = () => !question || question.optional || questionHasValue(question, inputs)
  const goTo = (nextIndex: number) => {
    if (moving) return
    setIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)))
    setBlocked(false)
  }
  const advance = () => {
    if (moving || !question) return
    const valueId = question.valueId ?? question.id
    if (!String(inputs[valueId] ?? '').trim() && !question.optional && question.choices?.[0]) setInput(valueId, question.choices[0])
    if (!answered() && !(question.choices?.length && !question.optional)) { setBlocked(true); return }
    setCompleted(previous => new Set(previous).add(question.id))
    setMoving(true)
    window.setTimeout(() => {
      if (index >= questions.length - 1) onClose()
      else { setIndex(value => value + 1); setMoving(false) }
    }, 180)
  }
  const goBack = () => goTo(index - 1)
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); goBack(); return }
    if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); advance(); return }
    if (event.target instanceof HTMLButtonElement) return
    const multiline = question?.type === 'json' || question?.type === 'stringArray'
    if (event.key === 'Enter' && !(event.shiftKey && multiline)) {
      event.preventDefault()
      advance()
    }
  }

  if (!question) return null
  const valueId = question.valueId ?? question.id
  const value = inputs[valueId] ?? ''
  const filled = questionHasValue(question, inputs)
  const assignRef = (element: HTMLElement | null) => { inputRef.current = element }
  const inputClass = `bp-wizard-input${filled ? ' is-filled' : ''}`

  let control: ReactNode
  if (question.type === 'segments') control = <WizardSegmentPicker inputs={inputs} setInput={setInput} onConfirm={advance} />
  else if (question.id === 'execution.region') control = (
    <RegionCombobox id="bp-wizard-region" className={inputClass} value={value} onChange={next => setInput(valueId, next)}
      placeholder={question.placeholder ?? placeholderFor(question.id, question.type)} onCommit={advance} inputRef={assignRef} />
  )
  else if (question.id === 'metadata.freeformTags' || question.id === 'metadata.definedTags') control = (
    <TagEditor value={value} onChange={next => setInput(valueId, next)} defined={question.id === 'metadata.definedTags'} wizard inputRef={assignRef} />
  )
  else if (question.type === 'boolean') control = (
    <select ref={assignRef} className={inputClass} value={value || 'false'} onChange={event => setInput(valueId, event.target.value)}>
      <option value="true">예</option><option value="false">아니오</option>
    </select>
  )
  else if (question.choices?.length) control = (
    <select ref={assignRef} className={inputClass} value={value || (!question.optional ? question.choices[0] : '')} onChange={event => setInput(valueId, event.target.value)}>
      {[...new Set([...(question.optional ? [''] : []), ...question.choices])].map(choice => <option key={choice || '__empty'} value={choice}>{choice || '선택하지 않음'}</option>)}
    </select>
  )
  else if (question.type === 'json' || question.type === 'stringArray') control = (
    <textarea ref={assignRef} className={`${inputClass} bp-wizard-textarea`} value={value} onChange={event => setInput(valueId, event.target.value)} placeholder={question.placeholder} />
  )
  else control = <input ref={assignRef} className={inputClass} value={value} placeholder={question.placeholder} onChange={event => setInput(valueId, event.target.value)} autoComplete="off" />

  const remaining = Math.max(0, questions.length - index - 1)
  return (
    <div className="bp-wizard-overlay" role="dialog" aria-modal="true" aria-label="Blueprint 입력 마법사" onKeyDown={onKeyDown}>
      <div className="bp-wizard-head">
        <span>BLUEPRINT INPUT</span><span>{index + 1} / {questions.length} · {remaining}문항 남음</span><button type="button" onClick={onClose}>ESC 닫기</button>
      </div>
      <div className="bp-wizard-body">
        <div className={`bp-wizard-track${moving ? ' moving' : ''}`}>
          <div className="bp-wizard-current" key={question.id}>
            <div className="bp-wizard-question current">
              {question.label}{question.optional ? <small>선택</small> : <small>필수</small>}
              {filled ? <span className="bp-wizard-filled">✓ 입력됨</span> : null}
            </div>
            {question.help ? <p>{question.help}</p> : null}
            {control}
            {blocked ? <div className="bp-wizard-required">값을 입력한 뒤 Enter를 누르세요.</div> : null}
            <div className="bp-wizard-actions">
              <button type="button" disabled={index === 0} onClick={goBack}>← 이전</button>
              <span className="bp-wizard-hint">Enter 다음 · Alt+←/→ 이동 · Esc 닫기{question.type === 'stringArray' ? ' · Shift+Enter 줄바꿈' : ''}</span>
              <button type="button" onClick={advance}>{index === questions.length - 1 ? '완료' : '다음 →'}</button>
            </div>
          </div>
        </div>
        <nav className="bp-wizard-progress" aria-label="입력 진행 이정표">
          <strong>{remaining}</strong><small>남음</small>
          <div className="bp-wizard-progress-list">
            {questions.map((item, step) => {
              const done = completed.has(item.id) || step < index
              const hasValue = questionHasValue(item, inputs)
              return <button type="button" key={`${item.id}-${step}`} title={`${step + 1}. ${item.label}`} aria-label={`${step + 1}. ${item.label}`}
                aria-current={step === index ? 'step' : undefined} className={`${done ? 'done ' : ''}${hasValue ? 'filled ' : ''}${step === index ? 'current' : ''}`}
                onClick={() => goTo(step)}><span /></button>
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}

function PlanRow({ n }: { n: PlanNode }) {
  return (
    <tr>
      <td><span className={`bp-state ${STATE_TONE[n.state]}`}>{n.state}</span></td>
      <td className="bp-mono">{n.displayName}</td>
      <td className="bp-mono bp-dim">{n.resource}</td>
      <td className="bp-dim">{n.reasons.join(' / ')}{n.existingId ? ` (${n.existingId.slice(0, 18)}…)` : ''}</td>
    </tr>
  )
}

function PlanTab({ plan, planDigest }: { plan: ReturnType<typeof computePlan> | null; planDigest: string }) {
  if (!plan) return <div className="bp-tabpanel"><p className="bp-warn">DISCOVER 탭에서 discovery-result 를 Import 하면 계획이 계산됩니다.</p></div>
  return (
    <div className="bp-tabpanel">
      <div className="bp-plan-summary">
        <span className="bp-badge create">CREATE {plan.createCount}</span>
        <span className="bp-badge reuse">REUSE {plan.reuseCount}</span>
        <span className="bp-badge conflict">CONFLICT {plan.conflictCount}</span>
        <span className="bp-badge blocked">BLOCKED {plan.blockedCount}</span>
        <span className={`bp-exec ${plan.executable ? 'ok' : 'no'}`}>{plan.executable ? 'APPLY 가능' : 'APPLY 불가'}</span>
      </div>
      <table className="bp-plan"><thead><tr><th>상태</th><th>이름</th><th>자원</th><th>사유</th></tr></thead>
        <tbody>{plan.order.map(id => plan.nodes.find(n => n.nodeId === id)).filter((n): n is PlanNode => !!n).map(n => <PlanRow key={n.nodeId} n={n} />)}</tbody>
      </table>
      <p className="bp-dim">Plan Digest <span className="bp-mono">{planDigest || '계산 중…'}</span></p>
    </div>
  )
}

function VerifySummary({ manifest }: { manifest: RunManifest }) {
  return (
    <table className="bp-plan"><thead><tr><th>노드</th><th>검증</th></tr></thead>
      <tbody>{manifest.nodes.map(n => <tr key={n.nodeId}><td className="bp-mono">{n.displayName}</td><td><span className={`bp-state ${n.verify === 'PASS' ? 'reuse' : n.verify === 'WARN' ? 'conflict' : n.verify ? 'blocked' : 'skip'}`}>{n.verify ?? '—'}</span></td></tr>)}</tbody>
    </table>
  )
}

function ManifestTab({ manifest, renderArgs, planDigest }: { manifest: RunManifest | null; renderArgs: { blueprint: CliBlueprint; catalog: Catalog; inputs: InputValues; naming: ReturnType<typeof computeNaming> }; planDigest: string }) {
  if (!manifest) return <div className="bp-tabpanel"><p className="bp-warn">APPLY 에서 run-result 를 Import 하면 manifest 가 생성됩니다.</p></div>
  const json = JSON.stringify(manifest, null, 2)
  return (
    <div className="bp-tabpanel">
      <div className="bp-plan-summary">
        <span className={`bp-badge ${manifest.status === 'FINAL' ? 'reuse' : 'create'}`}>{manifest.status}</span>
        <span className="bp-dim">run-id <span className="bp-mono">{manifest.runId}</span></span>
        <CopyButton text={json} />
      </div>
      <p className="bp-dim">plan digest <span className="bp-mono">{manifest.planDigest || planDigest}</span></p>
      <pre className="bp-pre"><code>{json}</code></pre>
      <details className="bp-details">
        <summary>롤백 스크립트 (CREATED 자원만, 이중 확인 필요)</summary>
        <p className="bp-warn">실행 전 <span className="bp-mono">CONFIRM_RUN_ID</span> 와 <span className="bp-mono">CONFIRM_COMPARTMENT_ID</span> 를 환경변수로 설정해야 합니다. 재사용(REUSE) 자원은 삭제하지 않습니다.</p>
        <ScriptBlock script={renderRollback({ ...renderArgs, manifest })} />
      </details>
    </div>
  )
}
