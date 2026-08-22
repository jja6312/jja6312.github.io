import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { computeNaming } from '../lib/oci-cli/blueprintNaming.mjs'
import { computePlan, planDigestInput } from '../lib/oci-cli/blueprintPlan.mjs'
import { renderDiscover, renderApply, renderResume, renderVerify, renderRollback } from '../lib/oci-cli/blueprintRender.mjs'
import { buildProvisionalManifest, mergeVerification } from '../lib/oci-cli/blueprintManifest.mjs'
import { sha256Hex } from '../lib/oci-cli/blueprintCanonical.ts'
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

  // 초기 입력값(default + preset)
  useEffect(() => {
    if (!blueprint) return
    const base: InputValues = {}
    for (const i of blueprint.inputs) if (i.default !== undefined && i.default !== null) base[i.id] = String(i.default)
    const p = blueprint.presets?.[0]
    if (p) { for (const [k, v] of Object.entries({ ...p.values, ...(p.enforced ?? {}) })) base[k] = String(v); setPreset(p.id) }
    setInputs(base)
    setDiscoverRaw(''); setRunRaw(''); setVerifyRaw(''); setTab('design')
  }, [blueprint])

  const setInput = (id: string, v: string) => setInputs(prev => ({ ...prev, [id]: v }))
  const enforcedKeys = useMemo(() => {
    const p = blueprint?.presets?.find(x => x.id === preset)
    return new Set(Object.keys(p?.enforced ?? {}))
  }, [blueprint, preset])

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

  // 검증 사이드바 항목
  const issues: { tone: string; text: string }[] = []
  if (naming) for (const i of naming.issues) issues.push({ tone: 'warn', text: i })
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
        {onExit ? <button className="bp-exit" onClick={onExit}>← CLI 빌더</button> : null}
      </div>

      <div className="bp-body">
        <div className="bp-main">
          <div className="bp-tabs" role="tablist">
            {TABS.map(tk => <button key={tk} role="tab" aria-selected={tab === tk} className={`bp-tab${tab === tk ? ' on' : ''}`} onClick={() => setTab(tk)}>{TAB_LABEL[tk]}</button>)}
          </div>

          {tab === 'design' && blueprint && (
            <DesignTab blueprint={blueprint} inputs={inputs} setInput={setInput} preset={preset} setPreset={p => { setPreset(p); const pr = blueprint.presets?.find(x => x.id === p); if (pr) setInputs(prev => ({ ...prev, ...pr.values as InputValues, ...(pr.enforced ?? {}) as InputValues })) }} enforcedKeys={enforcedKeys} naming={naming} />
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
              {!plan ? <p className="bp-warn">먼저 DISCOVER 에서 결과를 Import 하면 PLAN 이 계산됩니다.</p>
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
    </div>
  )
}

function Field({ def, value, onChange, locked }: { def: CliBlueprint['inputs'][number]; value: string; onChange: (v: string) => void; locked: boolean }) {
  const common = { id: `bp-in-${def.id}`, disabled: locked, className: 'bp-field-input' }
  let control: ReactNode
  if (def.choices?.length) control = <select {...common} value={value} onChange={e => onChange(e.target.value)}>{[...(def.requirement === 'required' ? [] : ['']), ...def.choices.map(String)].map(c => <option key={c} value={c}>{c || '(미선택)'}</option>)}</select>
  else if (def.type === 'boolean') control = <label className="bp-check"><input type="checkbox" disabled={locked} checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} /> {value === 'true' ? '예' : '아니오'}</label>
  else if (def.type === 'json' || def.type === 'stringArray') control = <textarea {...common} rows={2} value={value} onChange={e => onChange(e.target.value)} placeholder={def.type === 'stringArray' ? '["10.0.0.0/16"] 또는 줄바꿈' : '{ }'} />
  else control = <input {...common} type="text" value={value} onChange={e => onChange(e.target.value)} />
  return (
    <div className="bp-field">
      <label htmlFor={`bp-in-${def.id}`} className="bp-field-label">{def.label}{def.requirement === 'required' ? <span className="bp-req">*</span> : null}{locked ? <span className="bp-lock">preset 고정</span> : null}</label>
      {control}
      {def.help ? <p className="bp-help">{def.help}</p> : null}
    </div>
  )
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
              {fields.map(def => <Field key={def.id} def={def} value={inputs[def.id] ?? ''} onChange={v => setInput(def.id, v)} locked={enforcedKeys.has(def.id)} />)}
            </fieldset>
          )
        })}
      </div>
      <div className="bp-design-preview">
        <h3>이름 미리보기</h3>
        {naming ? (
          <table className="bp-names"><tbody>
            {Object.entries(naming.names).map(([id, n]) => (
              <tr key={id}><td className="bp-mono bp-dim">{id}</td><td className="bp-mono">{n.displayName}</td><td className="bp-mono bp-dim">{n.dnsLabel ?? ''}</td></tr>
            ))}
          </tbody></table>
        ) : <p className="bp-dim">naming 정책 로드 대기</p>}
        <p className="bp-dim bp-region">region alias: <span className="bp-mono">{naming?.regionAlias}</span></p>
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
