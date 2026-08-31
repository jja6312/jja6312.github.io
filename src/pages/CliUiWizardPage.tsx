import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './CliUiWizardPage.css'
import { useProtectedData } from '../lib/protectedData'
import { composeBlueprint, type WizardGraph, type WizardNode } from '../lib/oci-cli/wizardCompose.mjs'
import { MODULE_LIST, WIZARD_MODULES } from '../lib/oci-cli/wizardModules.mjs'
import { WIZARD_TEMPLATES } from '../lib/oci-cli/wizardTemplates.mjs'
import { computeNaming } from '../lib/oci-cli/blueprintNaming.mjs'
import { computePlan, planDigestInput } from '../lib/oci-cli/blueprintPlan.mjs'
import { renderDiscover, renderApply, renderResume, renderVerify, renderRollback } from '../lib/oci-cli/blueprintRender.mjs'
import { buildProvisionalManifest, mergeVerification } from '../lib/oci-cli/blueprintManifest.mjs'
import { sha256Hex } from '../lib/oci-cli/blueprintCanonical.ts'
import type { NamingPolicy, RenderedScript, PlanNode, DiscoveryResult, RunResult, VerificationResult, RunManifest } from '../lib/oci-cli/blueprintTypes.d.mts'

type Catalog = { commands: Record<string, unknown> }
const LS_KEY = 'cli-wizard-graph.v1'
const GROUP_LABEL: Record<string, string> = { network: '네트워크', compute: '컴퓨트', database: '데이터베이스', operations: '운영' }
const SLOT_LABEL: Record<string, string> = { vcn: 'VCN 소속', 'route-target': '라우팅 대상', 'route-table': '라우트테이블', 'security-list': '시큐리티리스트' }
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`

// ── 컨테인먼트(포함) 레이아웃: VCN 큰 상자 안에 subnet, 경계에 gateway, 안쪽에 route-table/security-list ──
type Rect = { x: number; y: number; w: number; h: number }
const GW = { w: 138, h: 46 }, SUB = { w: 168, h: 60 }, SH = { w: 152, h: 46 }
const PAD = 16, HEADER = 34, GAP = 12
const isGateway = (t: string) => t === 'internet-gateway' || t === 'nat-gateway' || t === 'service-gateway'
const isShared = (t: string) => t === 'route-table' || t === 'security-list'

interface Container { vcn: WizardNode; rect: Rect; gateways: WizardNode[]; subnets: WizardNode[]; shared: WizardNode[] }
interface Layout { containers: Container[]; floating: WizardNode[]; rects: Map<string, Rect>; width: number; height: number }

function vcnOfNode(graph: WizardGraph, nodeId: string): string | null {
  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  for (const e of graph.edges) if (e.slot === 'vcn' && e.to === nodeId && byId.get(e.from)?.moduleType === 'vcn') return e.from
  return null
}

function layoutGraph(graph: WizardGraph): Layout {
  const memberVcn = new Map<string, string>()
  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  for (const e of graph.edges) if (e.slot === 'vcn' && byId.get(e.from)?.moduleType === 'vcn') memberVcn.set(e.to, e.from)
  const rects = new Map<string, Rect>()
  const containers: Container[] = []
  for (const vcn of graph.nodes.filter(n => n.moduleType === 'vcn')) {
    const members = graph.nodes.filter(n => memberVcn.get(n.id) === vcn.id)
    const gateways = members.filter(n => isGateway(n.moduleType))
    const subnets = members.filter(n => n.moduleType === 'subnet')
    const shared = members.filter(n => isShared(n.moduleType))
    const subCols = subnets.length > 2 ? 2 : Math.max(1, subnets.length)
    const subRows = Math.ceil(subnets.length / subCols) || 0
    const subAreaW = subnets.length ? subCols * SUB.w + (subCols - 1) * GAP : 0
    const subAreaH = subRows ? subRows * SUB.h + (subRows - 1) * GAP : 0
    const shAreaW = shared.length ? SH.w : 0
    const shAreaH = shared.length ? shared.length * SH.h + (shared.length - 1) * 8 : 0
    const gwW = gateways.length ? gateways.length * (GW.w + GAP) - GAP : 0
    const bodyW = Math.max(subAreaW + (shAreaW ? GAP + shAreaW : 0), gwW, 240)
    const bodyH = Math.max(subAreaH, shAreaH, 64)
    const w = bodyW + PAD * 2, h = HEADER + bodyH + PAD * 2
    const ox = vcn.x ?? 40, oy = vcn.y ?? 40
    rects.set(vcn.id, { x: ox, y: oy, w, h })
    gateways.forEach((g, i) => rects.set(g.id, { x: ox + PAD + i * (GW.w + GAP), y: oy - GW.h / 2, w: GW.w, h: GW.h }))
    subnets.forEach((s, i) => { const r = Math.floor(i / subCols), c = i % subCols; rects.set(s.id, { x: ox + PAD + c * (SUB.w + GAP), y: oy + HEADER + PAD + r * (SUB.h + GAP), w: SUB.w, h: SUB.h }) })
    shared.forEach((s, i) => rects.set(s.id, { x: ox + PAD + subAreaW + GAP, y: oy + HEADER + PAD + i * (SH.h + 8), w: SH.w, h: SH.h }))
    containers.push({ vcn, rect: { x: ox, y: oy, w, h }, gateways, subnets, shared })
  }
  const floating = graph.nodes.filter(n => n.moduleType !== 'vcn' && !memberVcn.has(n.id))
  const bottomOfContainers = containers.length ? Math.max(...containers.map(c => c.rect.y + c.rect.h)) : 80
  floating.forEach((n, i) => rects.set(n.id, { x: 24 + i * (SUB.w + GAP), y: bottomOfContainers + 36, w: SUB.w, h: SUB.h }))
  const all = [...rects.values()]
  const width = all.length ? Math.max(...all.map(r => r.x + r.w)) + 40 : 400
  const height = all.length ? Math.max(...all.map(r => r.y + r.h)) + 40 : 300
  return { containers, floating, rects, width, height }
}
const rectCenter = (r?: Rect) => ({ x: (r?.x ?? 0) + (r?.w ?? 0) / 2, y: (r?.y ?? 0) + (r?.h ?? 0) / 2 })

function emptyGraph(): WizardGraph {
  return {
    schemaVersion: 1, id: 'wiz', label: '내 아키텍처', namingPolicyId: 'msp-standard',
    execution: { region: 'ap-seoul-1', compartment: '', profile: 'DEFAULT', compartmentMode: 'OCID' },
    naming: { customer: '', workload: '', environment: 'dev', regionAlias: '', sequence: '01' },
    nodes: [], edges: [],
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
  const [templateOpen, setTemplateOpen] = useState(false)
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
    const vcns = graph.nodes.filter(x => x.moduleType === 'vcn')
    if (moduleType === 'vcn') {
      setGraph(prev => ({ ...prev, nodes: [...prev.nodes, { id, moduleType, role: m.defaultRole, label: id, x: 40 + vcns.length * 60, y: 40 + vcns.length * 60, inputs: {} }] }))
      setSel({ kind: 'node', id }); return
    }
    // VCN 하위 리소스는 활성 VCN 안에 자동 배치(containment 엣지 자동 생성)
    const selN = sel?.kind === 'node' ? graph.nodes.find(x => x.id === sel.id) : null
    const vcnId = selN?.moduleType === 'vcn' ? selN.id : (selN ? vcnOfNode(graph, selN.id) : null) || (vcns.length ? vcns[vcns.length - 1].id : null)
    const newNode: WizardNode = { id, moduleType, role: m.defaultRole, label: id, x: 40, y: 40, inputs: {} }
    const newEdges = vcnId ? [{ id: uid('e'), from: vcnId, to: id, slot: 'vcn' }] : []
    setGraph(prev => ({ ...prev, nodes: [...prev.nodes, newNode], edges: [...prev.edges, ...newEdges] }))
    setSel({ kind: 'node', id })
  }
  const delNode = (id: string) => setGraph(prev => ({ ...prev, nodes: prev.nodes.filter(x => x.id !== id), edges: prev.edges.filter(e => e.from !== id && e.to !== id) }))
  const delEdge = (id: string) => setGraph(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== id) }))
  const setNode = (id: string, p: Partial<WizardNode>) => setGraph(prev => ({ ...prev, nodes: prev.nodes.map(x => x.id === id ? { ...x, ...p } : x) }))
  const setNodeInput = (id: string, key: string, v: string) => setGraph(prev => ({ ...prev, nodes: prev.nodes.map(x => x.id === id ? { ...x, inputs: { ...x.inputs, [key]: v } } : x) }))

  const nodeById = (id: string) => graph.nodes.find(n => n.id === id)
  // 연결은 인스펙터에서 슬롯별 드롭다운/체크박스로 만든다(직관적·확실). 엣지 방향: from=소스, to=소비자(선택노드).
  const toggleEdge = (from: string, to: string, slot: string, on: boolean) => {
    setGraph(prev => {
      const rest = prev.edges.filter(e => !(e.from === from && e.to === to && e.slot === slot))
      return { ...prev, edges: on ? [...rest, { id: uid('e'), from, to, slot }] : rest }
    })
  }
  const setSingleEdge = (to: string, slot: string, from: string) => {
    setGraph(prev => {
      const rest = prev.edges.filter(e => !(e.to === to && e.slot === slot))
      return { ...prev, edges: from ? [...rest, { id: uid('e'), from, to, slot }] : rest }
    })
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
  const layout = layoutGraph(graph)
  const rects = layout.rects
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
          <span className="wiz-template-picker">
            <button className="submitbtn" aria-expanded={templateOpen} onClick={() => setTemplateOpen(open => !open)}>
              템플릿 불러오기 <span aria-hidden="true">▾</span>
            </button>
            {templateOpen && (
              <>
                <div className="wiz-template-backdrop" onClick={() => setTemplateOpen(false)} />
                <div className="wiz-template-menu" role="menu" aria-label="실무 composition 템플릿">
                  <div className="wiz-template-head">실무 시작 템플릿 — 클릭하면 캔버스에 올라갑니다</div>
                  {WIZARD_TEMPLATES.map(tpl => (
                    <button key={tpl.id} type="button" role="menuitem" className="wiz-template-card"
                      onClick={() => { setGraph(tpl.build()); setSel(null); setTemplateOpen(false) }}>
                      <div className="wiz-template-card-top">
                        <b>{tpl.label}</b>
                        <span className="wiz-template-tags">{tpl.tags.map(tag => <em key={tag}>{tag}</em>)}</span>
                      </div>
                      <span className="wiz-template-desc">{tpl.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </span>
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
          <p className="bp-dim wiz-hint">리소스를 클릭해 선택하면, 우측 <b>연결(관계 설정)</b>에서 어떤 자원에 붙일지 고릅니다.</p>
        </aside>

        {/* 캔버스 — 컨테인먼트 다이어그램 (연결은 노드 선택 후 우측 인스펙터에서) */}
        <div className="wiz-canvas" ref={canvasRef} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onClick={() => setSel(null)}>
          <div className="wiz-stage" style={{ width: layout.width, height: layout.height }}>
            {/* VCN 컨테이너 상자 (뒤) */}
            {layout.containers.map(c => {
              const r = c.rect
              return (
                <div key={c.vcn.id} className={`wiz-vcn${sel?.kind === 'node' && sel.id === c.vcn.id ? ' on' : ''}`}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  onClick={ev => { ev.stopPropagation(); setSel({ kind: 'node', id: c.vcn.id }) }}>
                  <div className="wiz-vcn-head" onPointerDown={ev => onNodePointerDown(ev, c.vcn.id)}>
                    <span className="wiz-vcn-badge">VCN · {c.vcn.label}</span>
                    <button className="wiz-node-x" title="삭제" onClick={ev => { ev.stopPropagation(); delNode(c.vcn.id) }}>✕</button>
                  </div>
                  {c.subnets.length === 0 && c.gateways.length === 0 && c.shared.length === 0 && <div className="wiz-vcn-hint">이 VCN 안에 subnet·gateway·route-table 를 추가하세요</div>}
                </div>
              )
            })}

            {/* 관계선 (vcn 소속선 제외) */}
            <svg className="wiz-edges" width={layout.width} height={layout.height} aria-hidden>
              {graph.edges.filter(e => e.slot !== 'vcn').map(e => {
                const a = rectCenter(rects.get(e.from)), b = rectCenter(rects.get(e.to))
                const midY = (a.y + b.y) / 2
                return <path key={e.id} d={`M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`} className={`wiz-edge${sel?.kind === 'edge' && sel.id === e.id ? ' on' : ''}`} onClick={ev => { ev.stopPropagation(); setSel({ kind: 'edge', id: e.id }) }} />
              })}
            </svg>

            {/* 자식 노드(게이트웨이/서브넷/공유) + 부유 노드 */}
            {[...layout.containers.flatMap(c => [...c.gateways.map(n => ['gw', n] as const), ...c.subnets.map(n => ['subnet', n] as const), ...c.shared.map(n => ['shared', n] as const)]), ...layout.floating.map(n => ['float', n] as const)].map(([kind, n]) => {
              const r = rects.get(n.id); if (!r) return null
              const m = WIZARD_MODULES[n.moduleType]
              const draggable = kind === 'float'
              return (
                <div key={n.id} className={`wiz-box wiz-${kind}${sel?.kind === 'node' && sel.id === n.id ? ' on' : ''}`}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  onPointerDown={draggable ? ev => onNodePointerDown(ev, n.id) : undefined}
                  onClick={ev => { ev.stopPropagation(); setSel({ kind: 'node', id: n.id }) }}>
                  <div className="wiz-box-top">
                    <span className="wiz-box-badge">{m?.label ?? n.moduleType}</span>
                    <button className="wiz-node-x" title="삭제" onClick={ev => { ev.stopPropagation(); delNode(n.id) }}>✕</button>
                  </div>
                  <div className="wiz-box-bot">
                    <span className="wiz-box-name">{n.label}{n.role && n.role !== 'main' ? ` · ${n.role}` : ''}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {graph.nodes.length === 0 && <div className="wiz-empty">왼쪽에서 <b>VCN</b> 을 먼저 추가하고, 그 안에 subnet·gateway 를 넣으세요 · 또는 <b>예시 불러오기</b></div>}
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
              <div className="wiz-ins-slots">
                <div className="px bp-dim">연결 (관계 설정)</div>
                {selMod.edgeSlots.length === 0 && <div className="wiz-slot-empty">이 자원은 다른 자원에 연결하지 않습니다(루트).</div>}
                {selMod.edgeSlots.map(es => {
                  const targets = Array.isArray(es.target) ? es.target : [es.target]
                  const candidates = graph.nodes.filter(n => n.id !== selNode.id && targets.includes(n.moduleType))
                  const current = graph.edges.filter(e => e.to === selNode.id && e.slot === es.slot).map(e => e.from)
                  const label = SLOT_LABEL[es.slot] ?? es.slot
                  return (
                    <div key={es.slot} className="wiz-slot">
                      <div className="wiz-slot-label">{label}{es.required ? <span className="bp-req">*</span> : null}{es.multiple ? <span className="wiz-slot-multi">여러 개 선택</span> : null}</div>
                      {candidates.length === 0
                        ? <div className="wiz-slot-empty">먼저 «{targets.map(t => WIZARD_MODULES[t]?.label ?? t).join('/')}» 를 캔버스에 추가하세요</div>
                        : es.multiple
                          ? <div className="wiz-slot-checks">{candidates.map(c => (
                              <label key={c.id} className={`wiz-slot-check${current.includes(c.id) ? ' on' : ''}`}>
                                <input type="checkbox" checked={current.includes(c.id)} onChange={ev => toggleEdge(c.id, selNode.id, es.slot, ev.target.checked)} /> {c.label}
                              </label>))}</div>
                          : <select className="bp-field-input" value={current[0] ?? ''} onChange={ev => setSingleEdge(selNode.id, es.slot, ev.target.value)}>
                              <option value="">(선택 안 함)</option>
                              {candidates.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>}
                    </div>
                  )
                })}
                {graph.edges.filter(e => e.from === selNode.id && e.slot !== 'vcn').length > 0 && (
                  <div className="wiz-slot-used">
                    <div className="px bp-dim">이 자원을 참조하는 곳</div>
                    {graph.edges.filter(e => e.from === selNode.id && e.slot !== 'vcn').map(e => <div key={e.id} className="wiz-slot-useditem">→ {nodeById(e.to)?.label} <span className="px bp-dim">({SLOT_LABEL[e.slot] ?? e.slot})</span></div>)}
                  </div>
                )}
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
