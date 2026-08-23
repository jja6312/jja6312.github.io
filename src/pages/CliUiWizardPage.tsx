import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './CliUiWizardPage.css'
import { useProtectedData } from '../lib/protectedData'
import { composeBlueprint, type WizardGraph, type WizardNode } from '../lib/oci-cli/wizardCompose.mjs'
import { MODULE_LIST, WIZARD_MODULES } from '../lib/oci-cli/wizardModules.mjs'
import { computeNaming } from '../lib/oci-cli/blueprintNaming.mjs'
import { computePlan, planDigestInput } from '../lib/oci-cli/blueprintPlan.mjs'
import { renderDiscover, renderApply, renderResume, renderVerify, renderRollback } from '../lib/oci-cli/blueprintRender.mjs'
import { buildProvisionalManifest, mergeVerification } from '../lib/oci-cli/blueprintManifest.mjs'
import { sha256Hex } from '../lib/oci-cli/blueprintCanonical.ts'
import type { NamingPolicy, RenderedScript, PlanNode, DiscoveryResult, RunResult, VerificationResult, RunManifest } from '../lib/oci-cli/blueprintTypes.d.mts'

type Catalog = { commands: Record<string, unknown> }
const LS_KEY = 'cli-wizard-graph.v1'
const NODE_W = 168, NODE_H = 70
const GROUP_LABEL: Record<string, string> = { network: '네트워크', compute: '컴퓨트', database: '데이터베이스', operations: '운영' }
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`

function emptyGraph(): WizardGraph {
  return {
    schemaVersion: 1, id: 'wiz', label: '내 아키텍처', namingPolicyId: 'msp-standard',
    execution: { region: 'ap-seoul-1', compartment: '', profile: 'DEFAULT', compartmentMode: 'OCID' },
    naming: { customer: '', workload: '', environment: 'dev', regionAlias: '', sequence: '01' },
    nodes: [], edges: [],
  }
}

// 예시: 2-Tier 네트워크 (학습용 시작점)
function exampleGraph(): WizardGraph {
  const N = (id: string, moduleType: string, role: string, x: number, y: number, inputs: Record<string, string> = {}): WizardNode => ({ id, moduleType, role, label: id, x, y, inputs })
  const E = (from: string, to: string, slot: string) => ({ id: `${from}-${to}-${slot}`, from, to, slot })
  return {
    schemaVersion: 1, id: 'wiz-net', label: '2-Tier 네트워크(예시)', namingPolicyId: 'msp-standard',
    execution: { region: 'ap-seoul-1', compartment: '', profile: 'DEFAULT', compartmentMode: 'OCID' },
    naming: { customer: 'acme', workload: 'web', environment: 'prd', regionAlias: 'icn', sequence: '01' },
    nodes: [
      N('vcn', 'vcn', 'main', 40, 40, { vcnCidrs: '["10.0.0.0/16"]' }),
      N('igw', 'internet-gateway', 'main', 300, 20), N('nat', 'nat-gateway', 'main', 300, 110), N('sgw', 'service-gateway', 'main', 300, 200),
      N('rtpub', 'route-table', 'public', 560, 20), N('rtpriv', 'route-table', 'private', 560, 150),
      N('slpub', 'security-list', 'public', 560, 280, { enableSshIngress: 'true', sshSourceCidr: '0.0.0.0/0' }),
      N('slpriv', 'security-list', 'private', 560, 370, { enableSshIngress: 'false' }),
      N('subpub', 'subnet', 'public', 820, 60, { cidr: '10.0.10.0/24' }), N('subpriv', 'subnet', 'private', 820, 260, { cidr: '10.0.20.0/24' }),
    ],
    edges: [
      E('vcn', 'igw', 'vcn'), E('vcn', 'nat', 'vcn'), E('vcn', 'sgw', 'vcn'),
      E('vcn', 'rtpub', 'vcn'), E('igw', 'rtpub', 'route-target'),
      E('vcn', 'rtpriv', 'vcn'), E('nat', 'rtpriv', 'route-target'), E('sgw', 'rtpriv', 'route-target'),
      E('vcn', 'slpub', 'vcn'), E('vcn', 'slpriv', 'vcn'),
      E('vcn', 'subpub', 'vcn'), E('rtpub', 'subpub', 'route-table'), E('slpub', 'subpub', 'security-list'),
      E('vcn', 'subpriv', 'vcn'), E('rtpriv', 'subpriv', 'route-table'), E('slpriv', 'subpriv', 'security-list'),
    ],
  }
}

function loadGraph(): WizardGraph {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw) } catch { /* ignore */ }
  return emptyGraph()
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="bp-copy" onClick={e => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200) }) }}>{ok ? '복사됨 ✓' : '복사'}</button>
}
function DlBtn({ text, filename }: { text: string; filename: string }) {
  return <button type="button" className="bp-copy bp-dl" title={filename} onClick={e => { e.preventDefault(); e.stopPropagation(); const b = new Blob([text], { type: 'text/x-shellscript' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000) }}>⬇ .sh</button>
}
function Script({ s, prefix }: { s: RenderedScript; prefix: string }) {
  const lines = s.content.split('\n').length
  return (
    <details className="bp-script">
      <summary className="bp-script-head"><span className="bp-script-caret" aria-hidden>▸</span><span className="bp-mono">{prefix}__{s.name}</span><span className="bp-script-hint">보기 · {lines}줄</span><DlBtn text={s.content} filename={`${prefix}__${s.name}`} /><CopyBtn text={s.content} /></summary>
      <pre className="bp-pre"><code>{s.content}</code></pre>
    </details>
  )
}
function Import({ label, expected, value, onChange, err }: { label: string; expected: string; value: string; onChange: (v: string) => void; err?: string }) {
  return (
    <div className="bp-import">
      <label className="bp-import-label">{label} <span className="bp-mono bp-dim">{expected}</span></label>
      <textarea className="bp-textarea" spellCheck={false} value={value} placeholder={`스크립트가 출력한 ${expected} JSON 붙여넣기`} onChange={e => onChange(e.target.value)} />
      {err ? <p className="bp-err">⚠ {err}</p> : null}
    </div>
  )
}
function parseArtifact<T>(raw: string, expected: string): { value?: T; error?: string } {
  const s = raw.trim(); if (!s) return {}
  let p: unknown; try { p = JSON.parse(s) } catch (e) { return { error: `JSON 파싱 실패: ${(e as Error).message}` } }
  if (!p || typeof p !== 'object') return { error: 'JSON 객체가 아닙니다' }
  const at = (p as { artifactType?: string }).artifactType
  if (at && at !== expected) return { error: `artifactType 불일치: ${at}` }
  return { value: p as T }
}

export default function CliUiWizardPage() {
  const protectedState = useProtectedData()
  const [graph, setGraph] = useState<WizardGraph>(loadGraph)
  const [sel, setSel] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [slotPick, setSlotPick] = useState<{ from: string; to: string; slots: string[] } | null>(null)
  const [discoverRaw, setDiscoverRaw] = useState(''); const [runRaw, setRunRaw] = useState(''); const [verifyRaw, setVerifyRaw] = useState('')
  const [planDigest, setPlanDigest] = useState('')
  const drag = useRef<{ id: string; dx: number; dy: number; pid: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(graph)) } catch { /* ignore */ } }, [graph])

  const bundle = protectedState.data as { cliCatalog?: Catalog; cliBlueprints?: { namingPolicies?: NamingPolicy[] } } | null
  const policy = useMemo(() => bundle?.cliBlueprints?.namingPolicies?.find(p => p.id === (graph.namingPolicyId || 'msp-standard')) || bundle?.cliBlueprints?.namingPolicies?.[0], [bundle, graph.namingPolicyId])
  const catalog = bundle?.cliCatalog

  const composed = useMemo(() => (policy ? composeBlueprint(graph, policy) : null), [graph, policy])
  const naming = useMemo(() => (composed && policy && composed.blueprint.nodes.length ? computeNaming(composed.blueprint, policy, composed.inputs) : null), [composed, policy])
  const discovery = useMemo(() => parseArtifact<DiscoveryResult>(discoverRaw, 'discovery-result'), [discoverRaw])
  const plan = useMemo(() => (composed && naming && discovery.value ? computePlan({ blueprint: composed.blueprint, inputs: composed.inputs, naming, discovery: discovery.value }) : null), [composed, naming, discovery.value])
  useEffect(() => { let a = true; if (plan) void sha256Hex(planDigestInput(plan)).then(d => { if (a) setPlanDigest(d) }); else setPlanDigest(''); return () => { a = false } }, [plan])
  const run = useMemo(() => parseArtifact<RunResult>(runRaw, 'run-result'), [runRaw])
  const manifest = useMemo<RunManifest | null>(() => (composed && plan && run.value && naming ? buildProvisionalManifest({ blueprint: composed.blueprint, plan, runResult: run.value, naming }) : null), [composed, plan, run.value, naming])
  const verification = useMemo(() => parseArtifact<VerificationResult>(verifyRaw, 'verification-result'), [verifyRaw])
  const finalManifest = useMemo<RunManifest | null>(() => (manifest && verification.value ? mergeVerification(manifest, verification.value) : manifest), [manifest, verification.value])

  const composeIssues = composed?.issues ?? []
  const namingIssues = naming?.issues ?? []
  const blocked = composeIssues.length > 0 || namingIssues.length > 0 || (composed?.blueprint.nodes.length ?? 0) === 0

  // ── 그래프 편집 ──
  const patch = (g: Partial<WizardGraph>) => setGraph(prev => ({ ...prev, ...g }))
  const addNode = (moduleType: string) => {
    const m = WIZARD_MODULES[moduleType]; if (!m) return
    const id = uid(moduleType.replace(/[^a-z]/g, '').slice(0, 4) || 'n')
    const n = graph.nodes.length
    setGraph(prev => ({ ...prev, nodes: [...prev.nodes, { id, moduleType, role: m.defaultRole, label: id, x: 40 + (n % 4) * 60, y: 40 + (n % 6) * 40, inputs: {} }] }))
    setSel({ kind: 'node', id })
  }
  const delNode = (id: string) => setGraph(prev => ({ ...prev, nodes: prev.nodes.filter(x => x.id !== id), edges: prev.edges.filter(e => e.from !== id && e.to !== id) }))
  const delEdge = (id: string) => setGraph(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== id) }))
  const setNode = (id: string, p: Partial<WizardNode>) => setGraph(prev => ({ ...prev, nodes: prev.nodes.map(x => x.id === id ? { ...x, ...p } : x) }))
  const setNodeInput = (id: string, key: string, v: string) => setGraph(prev => ({ ...prev, nodes: prev.nodes.map(x => x.id === id ? { ...x, inputs: { ...x.inputs, [key]: v } } : x) }))

  const nodeById = (id: string) => graph.nodes.find(n => n.id === id)
  const tryConnect = (to: string) => {
    const from = connectFrom; setConnectFrom(null); if (!from || from === to) return
    const fromType = nodeById(from)?.moduleType; const toMod = WIZARD_MODULES[nodeById(to)?.moduleType || '']
    if (!toMod || !fromType) return
    const slots = toMod.edgeSlots.filter(es => (Array.isArray(es.target) ? es.target : [es.target]).includes(fromType)).map(es => es.slot)
    if (slots.length === 0) return
    if (slots.length === 1) addEdge(from, to, slots[0])
    else setSlotPick({ from, to, slots })
  }
  const addEdge = (from: string, to: string, slot: string) => {
    setGraph(prev => ({ ...prev, edges: [...prev.edges.filter(e => !(e.from === from && e.to === to && e.slot === slot)), { id: uid('e'), from, to, slot }] }))
    setSlotPick(null)
  }

  // 드래그 이동
  const onNodePointerDown = (e: ReactPointerEvent, id: string) => {
    const n = nodeById(id); if (!n) return
    drag.current = { id, dx: e.clientX - (n.x ?? 0), dy: e.clientY - (n.y ?? 0), pid: e.pointerId }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId); setSel({ kind: 'node', id })
  }
  const onCanvasPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current; if (!d || d.pid !== e.pointerId) return
    setNode(d.id, { x: Math.max(0, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) })
  }
  const onCanvasPointerUp = (e: ReactPointerEvent) => { if (drag.current?.pid === e.pointerId) drag.current = null }

  if (!protectedState.data) return <div className="cli-main"><div className="cmt-empty">{protectedState.loading ? '보호된 데이터를 복호화하는 중…' : protectedState.error}</div></div>
  if (!policy) return <div className="cli-main"><div className="cmt-empty">naming 정책을 불러올 수 없습니다 (blueprint 데이터 필요).</div></div>

  const selNode = sel?.kind === 'node' ? nodeById(sel.id) : null
  const selMod = selNode ? WIZARD_MODULES[selNode.moduleType] : null
  const center = (n?: WizardNode) => ({ x: (n?.x ?? 0) + NODE_W / 2, y: (n?.y ?? 0) + NODE_H / 2 })
  const prefix = graph.id || 'wizard'
  const renderArgs = composed && naming ? { blueprint: composed.blueprint, catalog: catalog as Catalog, inputs: composed.inputs, naming } : null

  return (
    <div className="wiz-wrap">
      {/* 상단 그래프 설정 */}
      <div className="wiz-top">
        <input className="bp-select wiz-title" value={graph.label ?? ''} onChange={e => patch({ label: e.target.value })} aria-label="아키텍처 이름" />
        <span className="wiz-field"><label>리전</label><input className="bp-field-input" value={graph.execution?.region ?? ''} onChange={e => patch({ execution: { ...graph.execution, region: e.target.value } })} placeholder="ap-seoul-1" /></span>
        <span className="wiz-field"><label>Compartment</label><input className="bp-field-input" value={graph.execution?.compartment ?? ''} onChange={e => patch({ execution: { ...graph.execution, compartment: e.target.value } })} placeholder="ocid1.compartment... 또는 이름" /></span>
        <span className="wiz-field"><label>고객사</label><input className="bp-field-input wiz-sm" value={String(graph.naming?.customer ?? '')} onChange={e => patch({ naming: { ...graph.naming, customer: e.target.value } })} /></span>
        <span className="wiz-field"><label>워크로드</label><input className="bp-field-input wiz-sm" value={String(graph.naming?.workload ?? '')} onChange={e => patch({ naming: { ...graph.naming, workload: e.target.value } })} /></span>
        <span className="wiz-field"><label>환경</label><input className="bp-field-input wiz-sm" value={String(graph.naming?.environment ?? '')} onChange={e => patch({ naming: { ...graph.naming, environment: e.target.value } })} /></span>
        <span className="wiz-actions">
          <button className="submitbtn" onClick={() => { setGraph(exampleGraph()); setSel(null) }}>예시 불러오기</button>
          <button className="iconbtn" title="비우기" onClick={() => { if (confirm('캔버스를 비울까요?')) { setGraph(emptyGraph()); setSel(null) } }}>비우기</button>
        </span>
      </div>

      <div className="wiz-body">
        {/* 팔레트 */}
        <aside className="wiz-palette">
          <h3 className="bp-side-title">리소스</h3>
          {Object.entries(MODULE_LIST.reduce<Record<string, typeof MODULE_LIST>>((a, m) => { (a[m.group] ||= []).push(m); return a }, {})).map(([g, mods]) => (
            <div key={g} className="wiz-pgroup">
              <div className="wiz-pgroup-title px">{GROUP_LABEL[g] ?? g}</div>
              {mods.map(m => <button key={m.type} className="wiz-pitem" onClick={() => addNode(m.type)}>+ {m.label}</button>)}
            </div>
          ))}
          <p className="bp-dim wiz-hint">노드의 <b>연결</b>을 누르고 대상 노드를 클릭하면 관계가 이어집니다.</p>
        </aside>

        {/* 캔버스 */}
        <div className="wiz-canvas" ref={canvasRef} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onClick={() => { setSel(null); setConnectFrom(null) }}>
          <svg className="wiz-edges" aria-hidden>
            {graph.edges.map(e => {
              const a = center(nodeById(e.from)), b = center(nodeById(e.to))
              const midX = (a.x + b.x) / 2
              return <path key={e.id} d={`M${a.x},${a.y} C${midX},${a.y} ${midX},${b.y} ${b.x},${b.y}`} className={`wiz-edge${sel?.kind === 'edge' && sel.id === e.id ? ' on' : ''}`} onClick={ev => { ev.stopPropagation(); setSel({ kind: 'edge', id: e.id }) }} />
            })}
          </svg>
          {graph.nodes.map(n => {
            const m = WIZARD_MODULES[n.moduleType]
            return (
              <div key={n.id} className={`wiz-node${sel?.kind === 'node' && sel.id === n.id ? ' on' : ''}${connectFrom === n.id ? ' connecting' : ''}`} style={{ left: n.x, top: n.y, width: NODE_W }}
                onClick={ev => { ev.stopPropagation(); if (connectFrom) tryConnect(n.id); else setSel({ kind: 'node', id: n.id }) }}>
                <div className="wiz-node-head" onPointerDown={ev => onNodePointerDown(ev, n.id)}>
                  <span className="wiz-node-badge">{m?.label ?? n.moduleType}</span>
                  <button className="wiz-node-x" title="삭제" onClick={ev => { ev.stopPropagation(); delNode(n.id) }}>✕</button>
                </div>
                <div className="wiz-node-body">
                  <span className="wiz-node-role px">{n.role}</span>
                  <button className="wiz-connect" onClick={ev => { ev.stopPropagation(); setConnectFrom(n.id) }}>연결 →</button>
                </div>
              </div>
            )
          })}
          {slotPick && (
            <div className="wiz-slotpick" onClick={ev => ev.stopPropagation()}>
              <span className="px">연결 종류</span>
              {slotPick.slots.map(s => <button key={s} onClick={() => addEdge(slotPick.from, slotPick.to, s)}>{s}</button>)}
              <button className="iconbtn" onClick={() => setSlotPick(null)}>취소</button>
            </div>
          )}
          {graph.nodes.length === 0 && <div className="wiz-empty">왼쪽에서 리소스를 추가해 아키텍처를 그리세요 · 또는 <b>예시 불러오기</b></div>}
        </div>

        {/* 인스펙터 */}
        <aside className="wiz-inspector">
          {selNode && selMod ? (
            <>
              <h3 className="bp-side-title">{selMod.label}</h3>
              <label className="wiz-ins-label">노드 이름<input className="bp-field-input" value={selNode.label ?? ''} onChange={e => setNode(selNode.id, { label: e.target.value })} /></label>
              {selMod.roles && <label className="wiz-ins-label">역할(role)
                <select className="bp-field-input" value={selNode.role} onChange={e => setNode(selNode.id, { role: e.target.value })}>{selMod.roles.map(r => <option key={r} value={r}>{r}</option>)}</select>
              </label>}
              {(selMod.scalarInputs ?? []).map(si => (
                <label key={si.key} className="wiz-ins-label">{si.label}{si.required ? <span className="bp-req">*</span> : ''}
                  {si.type === 'boolean'
                    ? <select className="bp-field-input" value={selNode.inputs?.[si.key] ?? si.default ?? 'false'} onChange={e => setNodeInput(selNode.id, si.key, e.target.value)}><option value="false">아니오</option><option value="true">예</option></select>
                    : <input className="bp-field-input" value={selNode.inputs?.[si.key] ?? si.default ?? ''} onChange={e => setNodeInput(selNode.id, si.key, e.target.value)} placeholder={si.default} />}
                </label>
              ))}
              <div className="wiz-ins-edges">
                <div className="px bp-dim">연결</div>
                {graph.edges.filter(e => e.to === selNode.id).map(e => <div key={e.id} className="wiz-ins-edge">← {nodeById(e.from)?.label} <span className="px">({e.slot})</span><button className="wiz-node-x" onClick={() => delEdge(e.id)}>✕</button></div>)}
                {graph.edges.filter(e => e.from === selNode.id).map(e => <div key={e.id} className="wiz-ins-edge">→ {nodeById(e.to)?.label} <span className="px">({e.slot})</span><button className="wiz-node-x" onClick={() => delEdge(e.id)}>✕</button></div>)}
              </div>
              <button className="iconbtn" onClick={() => delNode(selNode.id)}>노드 삭제</button>
            </>
          ) : sel?.kind === 'edge' ? (
            <><h3 className="bp-side-title">연결</h3><button className="iconbtn" onClick={() => { delEdge(sel.id); setSel(null) }}>연결 삭제</button></>
          ) : (
            <>
              <h3 className="bp-side-title">검증</h3>
              {blocked ? <ul className="bp-issues">
                {composeIssues.map((i, k) => <li key={`c${k}`} className="bp-issue err">{i}</li>)}
                {namingIssues.map((i, k) => <li key={`n${k}`} className="bp-issue warn">{i}</li>)}
                {(composed?.blueprint.nodes.length ?? 0) === 0 && <li className="bp-issue">리소스를 추가하세요.</li>}
              </ul> : <p className="bp-ok">✓ 구성 유효 — 아래에서 실행</p>}
              {naming && <div className="wiz-names"><div className="px bp-dim">이름 미리보기</div>{Object.entries(naming.names).map(([id, n]) => <div key={id} className="wiz-name"><span className="bp-dim px">{id}</span> <span className="bp-mono">{n.displayName}</span></div>)}</div>}
            </>
          )}
        </aside>
      </div>

      {/* 라이프사이클 (compose 유효 시) */}
      {renderArgs && !blocked && (
        <div className="wiz-lifecycle">
          <div className="bp-step-div">① 조사·계획 (Discover → Plan)</div>
          <Script s={renderDiscover(renderArgs)} prefix={prefix} />
          <Import label="Discovery 결과 붙여넣기" expected="discovery-result" value={discoverRaw} onChange={setDiscoverRaw} err={discovery.error} />
          {plan ? <PlanTable plan={plan} digest={planDigest} /> : <p className="bp-dim">discovery 결과를 넣으면 계획이 계산됩니다.</p>}

          {plan && (plan.executable ? (
            <>
              <div className="bp-step-div">② 적용·검증 (Apply → Verify)</div>
              <Script s={renderApply({ ...renderArgs, plan, planDigest })} prefix={prefix} />
              <details className="bp-details"><summary>중단 후 재개(Resume)</summary><Script s={renderResume({ ...renderArgs, plan, planDigest, priorRunResult: run.value })} prefix={prefix} /></details>
              <Import label="Run 결과 붙여넣기" expected="run-result" value={runRaw} onChange={setRunRaw} err={run.error} />
              {run.value?.nodes?.some(n => n.action === 'FAILED') ? <div className="bp-err">실패 노드: <ul>{run.value.nodes.filter(n => n.action === 'FAILED').map((n, k) => <li key={k}><b>{n.node}</b> — {n.error || '원인 미기록'}</li>)}</ul></div> : null}
              {manifest && renderArgs ? <>
                <Script s={renderVerify({ ...renderArgs, manifest })} prefix={prefix} />
                <Import label="검증 결과 붙여넣기" expected="verification-result" value={verifyRaw} onChange={setVerifyRaw} err={verification.error} />
              </> : null}
              {finalManifest ? <ManifestBlock manifest={finalManifest} rollback={renderArgs ? renderRollback({ ...renderArgs, manifest: finalManifest }) : null} prefix={prefix} /> : null}
            </>
          ) : <p className="bp-err">계획에 CONFLICT/BLOCKED 가 있어 Apply 를 생성하지 않습니다.</p>)}
        </div>
      )}
    </div>
  )
}

function PlanTable({ plan, digest }: { plan: ReturnType<typeof computePlan>; digest: string }) {
  const TONE: Record<string, string> = { CREATE: 'create', REUSE: 'reuse', CONFLICT: 'conflict', BLOCKED: 'blocked', SKIP: 'skip' }
  return (
    <div>
      <div className="bp-plan-summary">
        <span className="bp-badge create">CREATE {plan.createCount}</span><span className="bp-badge reuse">REUSE {plan.reuseCount}</span>
        <span className="bp-badge conflict">CONFLICT {plan.conflictCount}</span><span className="bp-badge blocked">BLOCKED {plan.blockedCount}</span>
        <span className={`bp-exec ${plan.executable ? 'ok' : 'no'}`}>{plan.executable ? 'APPLY 가능' : 'APPLY 불가'}</span>
      </div>
      <table className="bp-plan"><thead><tr><th>상태</th><th>이름</th><th>자원</th><th>사유</th></tr></thead>
        <tbody>{plan.order.map(id => plan.nodes.find((n: PlanNode) => n.nodeId === id)).filter((n): n is PlanNode => !!n).map(n => (
          <tr key={n.nodeId}><td><span className={`bp-state ${TONE[n.state]}`}>{n.state}</span></td><td className="bp-mono">{n.displayName}</td><td className="bp-mono bp-dim">{n.resource}</td><td className="bp-dim">{n.reasons.join(' / ')}</td></tr>
        ))}</tbody></table>
      <p className="bp-dim">Plan Digest <span className="bp-mono">{digest || '계산 중…'}</span></p>
    </div>
  )
}

function ManifestBlock({ manifest, rollback, prefix }: { manifest: RunManifest; rollback: RenderedScript | null; prefix: string }) {
  const json = JSON.stringify(manifest, null, 2)
  return (
    <div>
      <div className="bp-step-div">③ 매니페스트</div>
      <div className="bp-plan-summary"><span className={`bp-badge ${manifest.status === 'FINAL' ? 'reuse' : 'create'}`}>{manifest.status}</span><span className="bp-dim">run-id <span className="bp-mono">{manifest.runId}</span></span><CopyBtn text={json} /></div>
      <pre className="bp-pre"><code>{json}</code></pre>
      {rollback ? <details className="bp-details"><summary>롤백 스크립트 (CREATED 만, 이중확인 필요)</summary><Script s={rollback} prefix={prefix} /></details> : null}
    </div>
  )
}
