import { useEffect, useMemo, useState } from 'react'
import './OciPolicyPage.css'
import { useSyncedJson, SYNC_LABEL } from '../lib/scheduleDb'
import {
  parsePolicyStatement, POLICY_VERBS, verbRank, guessCategory, COMMON_RESOURCE_FAMILIES, EMPTY_POLICY_DB,
} from '../lib/oci-cli/policyParse.mjs'
import type { PolicyStatement, PolicyBundle, PolicyDb, ParsedPolicy } from '../lib/oci-cli/policyParse.d.mts'
import { renderPolicyScripts } from '../lib/oci-cli/policyRender.mjs'
import type { PolicyScriptSet, RenderedPolicyScript } from '../lib/oci-cli/policyRender.d.mts'
import CliInputWizard, { useCliInputWizardShortcut, type CliWizardQuestion } from '../components/CliInputWizard'
import OciResourceNav, { extractOciPolicyNavStatements, type OciNavEntry } from '../components/OciResourceNav'
import { useProtectedData } from '../lib/protectedData'

const DB_PATH = 'knowledge/oci-policy/policies.json'
const CART_KEY = 'oci-policy-cart.v1'
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const nowIso = () => new Date().toISOString()

/* ── 복사·다운로드·스크립트 (bp-* 클래스 공유) ───────────── */
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="bp-copy" onClick={e => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200) }) }}>{ok ? '복사됨 ✓' : '복사'}</button>
}
function DlBtn({ text, filename }: { text: string; filename: string }) {
  return <button type="button" className="bp-copy bp-dl" title={filename} onClick={e => { e.preventDefault(); e.stopPropagation(); const b = new Blob([text], { type: 'text/x-shellscript' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000) }}>⬇ .sh</button>
}
function Script({ s, open }: { s: RenderedPolicyScript; open?: boolean }) {
  const lines = s.body.split('\n').length
  return (
    <details className="bp-script" open={open}>
      <summary className="bp-script-head"><span className="bp-script-caret" aria-hidden>▸</span><span className="bp-mono">{s.filename}</span><span className="bp-script-hint">{lines}줄</span><DlBtn text={s.body} filename={s.filename} /><CopyBtn text={s.body} /></summary>
      <pre className="bp-pre"><code>{s.body}</code></pre>
    </details>
  )
}

/* ── 구조 분해 뱃지 (Allow <주체> to <동사> <자원> in <범위>) ── */
function Badges({ p }: { p: ParsedPolicy }) {
  if (!p.valid) return <span className="pol-badge pol-bad" title={p.error}>⚠ 비표준</span>
  if (p.kind === 'advanced') return <span className="pol-badge pol-adv">크로스테넌시 · {p.keyword}</span>
  return (
    <span className="pol-badges">
      <span className="pol-badge pol-subj">{p.subjectType} {p.subject}</span>
      <span className={`pol-badge pol-verb v${verbRank(p.verb ?? '')}`}>{p.verb}</span>
      <span className="pol-badge pol-res">{p.resourceType}</span>
      <span className="pol-badge pol-scope">{p.scope === 'compartment' ? `compartment ${p.locationName}` : p.locationName}</span>
      {p.where ? <span className="pol-badge pol-where" title={p.where}>where …</span> : null}
    </span>
  )
}

export default function OciPolicyPage() {
  const { data, update, sync, writable } = useSyncedJson<PolicyDb>(DB_PATH, EMPTY_POLICY_DB, 'policy: 라이브러리 갱신')
  const protectedState = useProtectedData()
  // data 는 저장 시에만 바뀌므로 배열을 memo 로 고정해야 아래 useMemo 들이 매 렌더 재계산되지 않는다.
  const statements = useMemo(() => data.statements ?? [], [data])
  const bundles = useMemo(() => data.bundles ?? [], [data])
  const byId = useMemo(() => new Map(statements.map(s => [s.id, s])), [statements])

  /* 장바구니 — 브라우저 로컬(스크래치). 묶음으로 승격되면 blog-db 저장. */
  const [cart, setCart] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] } })
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }, [cart])
  const inCart = (id: string) => cart.includes(id)
  const toggleCart = (id: string) => setCart(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  /* 라이브러리 편집 폼 */
  const emptyDraft = { id: '', label: '', statement: '', description: '', tags: '' }
  const [draft, setDraft] = useState(emptyDraft)
  const [showForm, setShowForm] = useState(false)
  const draftParsed = useMemo(() => parsePolicyStatement(draft.statement), [draft.statement])
  const startNew = () => { setDraft(emptyDraft); setShowForm(true) }
  const startEdit = (s: PolicyStatement) => { setDraft({ id: s.id, label: s.label, statement: s.statement, description: s.description || '', tags: (s.tags || []).join(', ') }); setShowForm(true) }
  const saveDraft = () => {
    if (!draft.statement.trim() || !draft.label.trim()) return
    const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
    if (draft.id) {
      update({ ...data, statements: statements.map(s => s.id === draft.id ? { ...s, label: draft.label.trim(), statement: draft.statement.trim(), description: draft.description.trim(), tags, updatedAt: nowIso() } : s) })
    } else {
      const s: PolicyStatement = { id: uid('st'), label: draft.label.trim(), statement: draft.statement.trim(), description: draft.description.trim(), tags, createdAt: nowIso() }
      update({ ...data, statements: [s, ...statements] })
    }
    setShowForm(false); setDraft(emptyDraft)
  }
  const removeStatement = (id: string) => {
    if (!confirm('이 문법을 삭제할까요? (묶음에서도 빠집니다)')) return
    update({ ...data, statements: statements.filter(s => s.id !== id), bundles: bundles.map(b => ({ ...b, statementIds: b.statementIds.filter(x => x !== id) })) })
    setCart(c => c.filter(x => x !== id))
  }

  /* 필터 */
  const [q, setQ] = useState('')
  const [verbFilter, setVerbFilter] = useState<string>('')
  const [navResourceFilter, setNavResourceFilter] = useState('')
  const [navActiveKey, setNavActiveKey] = useState('')
  const [navOpenCategories, setNavOpenCategories] = useState<Record<string, boolean>>({})
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return statements.filter(s => {
      const parsed = parsePolicyStatement(s.statement)
      if (verbFilter && parsed.verb !== verbFilter) return false
      if (navResourceFilter && (parsed.resourceType ?? `policy-${parsed.keyword ?? ''}`) !== navResourceFilter) return false
      if (!needle) return true
      return `${s.label} ${s.statement} ${(s.tags || []).join(' ')} ${s.description || ''}`.toLowerCase().includes(needle)
    })
  }, [statements, q, verbFilter, navResourceFilter])

  const selectPolicyNavEntry = (entry: OciNavEntry) => {
    if (!entry.policyResource) return
    setNavActiveKey(entry.key)
    setNavResourceFilter(entry.policyResource)
    setQ('')
    setVerbFilter('')
  }

  /* 묶음 만들기 */
  const [bundleName, setBundleName] = useState('')
  const [bundleDesc, setBundleDesc] = useState('')
  const createBundle = () => {
    if (!bundleName.trim() || cart.length === 0) return
    const b: PolicyBundle = { id: uid('bn'), name: bundleName.trim(), description: bundleDesc.trim(), statementIds: [...cart], createdAt: nowIso() }
    update({ ...data, bundles: [b, ...bundles] })
    setBundleName(''); setBundleDesc(''); setCart([])
  }
  const removeBundle = (id: string) => { if (confirm('이 묶음을 삭제할까요?')) update({ ...data, bundles: bundles.filter(b => b.id !== id) }) }

  /* 묶음 → OCI CLI 생성 모달 */
  const [genId, setGenId] = useState<string | null>(null)
  const genBundle = bundles.find(b => b.id === genId) || null
  const [gen, setGen] = useState<Record<string, string>>({})
  const [wizOpen, setWizOpen] = useState(false)
  const openGen = (b: PolicyBundle) => { setGen({ compartment: '', policyName: b.name, description: b.description || '', profile: 'DEFAULT', region: '' }); setGenId(b.id) }
  const setGenVal = (k: string, v: string) => setGen(g => ({ ...g, [k]: v }))
  useCliInputWizardShortcut(!!genId, () => setWizOpen(true))

  const genStatements = useMemo(() => genBundle ? genBundle.statementIds.map(id => byId.get(id)?.statement).filter((x): x is string => !!x) : [], [genBundle, byId])
  const scripts = useMemo<PolicyScriptSet | null>(() => {
    if (!genBundle || !gen.compartment?.trim() || !gen.policyName?.trim() || genStatements.length === 0) return null
    try { return renderPolicyScripts({ policyName: gen.policyName, description: gen.description, statements: genStatements, compartmentInput: gen.compartment, profile: gen.profile, region: gen.region }) } catch { return null }
  }, [genBundle, gen, genStatements])

  const genQuestions: CliWizardQuestion[] = [
    { id: 'compartment', label: '대상 compartment (이름 또는 OCID)', type: 'string', requirement: 'required', placeholder: 'prod  또는  ocid1.compartment.oc1..aaa', help: '이름이면 실행 시 테넌시 하위에서 ACTIVE 1개를 OCID 로 자동 조회합니다.' },
    { id: 'policyName', label: '정책 이름 (--name)', type: 'string', requirement: 'required', placeholder: 'net-baseline' },
    { id: 'description', label: '설명 (--description)', type: 'string', requirement: 'optional', placeholder: '네트워크 기본 정책' },
    { id: 'profile', label: 'OCI CLI 프로파일', type: 'string', requirement: 'optional', placeholder: 'DEFAULT' },
    { id: 'region', label: '리전 (정책은 홈 리전에서만 생성 가능)', type: 'string', requirement: 'optional', placeholder: 'ap-seoul-1' },
  ]

  return (
    <div className="pol-shell">
      <OciResourceNav
        catalog={protectedState.data?.cliCatalog as { categories?: Array<{ id: string; label: string; groups: Array<{ label: string; resources: string[] }> }>; commands?: Record<string, { label: string }> } | undefined}
        statements={extractOciPolicyNavStatements(data)}
        surface="policy"
        activeKey={navActiveKey}
        openCategories={navOpenCategories}
        onToggleCategory={id => setNavOpenCategories(current => ({ ...current, [id]: !current[id] }))}
        onSelect={selectPolicyNavEntry}
      />
      <div className="pol-wrap">
      <div className="pol-top">
        <div>
          <div className="pol-title">OCI Policy 라이브러리</div>
          <div className="pol-sub">내가 쓴 policy 문법을 구조로 저장 · 장바구니로 묶어 → 특정 compartment 에 <span className="bp-mono">oci iam policy create</span></div>
        </div>
        <div className="pol-top-r">
          <span className={`pol-sync s-${sync}`}>{SYNC_LABEL[sync]}</span>
          {writable && <button type="button" className="pol-primary" onClick={startNew}>＋ 새 문법</button>}
        </div>
      </div>

      {!writable && <div className="pol-ro">🔒 읽기 전용입니다. 문법·묶음 추가는 PAT(쓰기 권한)가 필요합니다. 조회·장바구니·CLI 생성은 그대로 됩니다.</div>}

      {/* 편집 폼 */}
      {showForm && writable && (
        <div className="pol-form">
          <div className="pol-form-grid">
            <label className="pol-l">이름(식별)<input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="예: 관리자 전체 권한" autoFocus /></label>
            <label className="pol-l">태그(쉼표)<input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} placeholder="admin, tenancy" /></label>
          </div>
          <label className="pol-l">policy 문법 (원문 그대로)
            <textarea value={draft.statement} onChange={e => setDraft({ ...draft, statement: e.target.value })} rows={2} spellCheck={false}
              placeholder="Allow group Admins to manage all-resources in tenancy" />
          </label>
          <div className="pol-parse-preview">
            <Badges p={draftParsed} />
            {!draftParsed.valid && draft.statement.trim() && <span className="pol-parse-note">저장은 되지만 표준 <span className="bp-mono">Allow …</span> 문법이 아닙니다.</span>}
            <span className="pol-families">자주 쓰는 자원: {COMMON_RESOURCE_FAMILIES.slice(0, 6).join(' · ')}</span>
          </div>
          <label className="pol-l">메모(선택)<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="언제·왜 썼는지" /></label>
          <div className="pol-form-actions">
            <button type="button" className="pol-primary" onClick={saveDraft} disabled={!draft.label.trim() || !draft.statement.trim()}>{draft.id ? '수정 저장' : '라이브러리에 추가'}</button>
            <button type="button" className="pol-ghost" onClick={() => { setShowForm(false); setDraft(emptyDraft) }}>취소</button>
          </div>
        </div>
      )}

      <div className="pol-body">
        {/* 라이브러리 */}
        <main className="pol-main">
          <div className="pol-filter">
            <input className="pol-search" value={q} onChange={e => setQ(e.target.value)} placeholder="검색 (이름·문법·태그)" />
            <div className="pol-verbs">
              <button type="button" className={`pol-vchip${verbFilter === '' ? ' on' : ''}`} onClick={() => setVerbFilter('')}>전체</button>
              {POLICY_VERBS.map(v => <button type="button" key={v.id} title={v.desc} className={`pol-vchip v${v.level}${verbFilter === v.id ? ' on' : ''}`} onClick={() => setVerbFilter(verbFilter === v.id ? '' : v.id)}>{v.label}</button>)}
            </div>
          </div>

          {statements.length === 0 && <div className="pol-empty">아직 저장된 문법이 없습니다. {writable ? '‹＋ 새 문법›으로 추가하세요.' : ''}</div>}
          {statements.length > 0 && filtered.length === 0 && <div className="pol-empty">검색 결과 없음</div>}

          <div className="pol-list">
            {filtered.map(s => {
              const p = parsePolicyStatement(s.statement)
              return (
                <div className={`pol-card${inCart(s.id) ? ' in-cart' : ''}`} key={s.id}>
                  <div className="pol-card-head">
                    <span className="pol-cat">{p.valid && p.kind === 'allow' ? guessCategory(p.resourceType ?? '') : '·'}</span>
                    <span className="pol-card-label">{s.label}</span>
                    <div className="pol-card-actions">
                      <button type="button" className={`pol-cart-btn${inCart(s.id) ? ' on' : ''}`} onClick={() => toggleCart(s.id)}>{inCart(s.id) ? '담김 ✓' : '＋ 장바구니'}</button>
                      {writable && <button type="button" className="pol-icon" title="편집" onClick={() => startEdit(s)}>✎</button>}
                      {writable && <button type="button" className="pol-icon pol-del" title="삭제" onClick={() => removeStatement(s.id)}>✕</button>}
                    </div>
                  </div>
                  <Badges p={p} />
                  <pre className="pol-stmt"><code>{s.statement}</code><CopyBtn text={s.statement} /></pre>
                  {(s.description || (s.tags || []).length > 0) && (
                    <div className="pol-meta">
                      {s.description && <span className="pol-desc">{s.description}</span>}
                      {(s.tags || []).map(t => <span key={t} className="pol-tag">#{t}</span>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </main>

        {/* 장바구니 + 묶음 */}
        <aside className="pol-aside">
          <section className="pol-panel">
            <div className="pol-panel-head">🛒 장바구니 <span className="pol-count">{cart.length}</span></div>
            {cart.length === 0 && <div className="pol-empty sm">라이브러리에서 ‹＋ 장바구니›로 담으세요.</div>}
            {cart.length > 0 && <>
              <ul className="pol-cart-list">
                {cart.map(id => { const s = byId.get(id); if (!s) return null; return <li key={id}><span className="pol-cart-label">{s.label}</span><button type="button" className="pol-icon" onClick={() => toggleCart(id)}>✕</button></li> })}
              </ul>
              {writable ? (
                <div className="pol-mkbundle">
                  <input value={bundleName} onChange={e => setBundleName(e.target.value)} placeholder="묶음 이름 (= 정책 이름 후보)" />
                  <input value={bundleDesc} onChange={e => setBundleDesc(e.target.value)} placeholder="설명(선택)" />
                  <div className="pol-mkbundle-row">
                    <button type="button" className="pol-primary" onClick={createBundle} disabled={!bundleName.trim()}>묶음 만들기</button>
                    <button type="button" className="pol-ghost" onClick={() => setCart([])}>비우기</button>
                  </div>
                </div>
              ) : <div className="pol-empty sm">묶음 저장은 PAT 필요. (임시로 담아두는 것은 됩니다)</div>}
            </>}
          </section>

          <section className="pol-panel">
            <div className="pol-panel-head">📦 묶음 <span className="pol-count">{bundles.length}</span></div>
            {bundles.length === 0 && <div className="pol-empty sm">저장된 묶음이 없습니다.</div>}
            <div className="pol-bundles">
              {bundles.map(b => (
                <div className="pol-bundle" key={b.id}>
                  <div className="pol-bundle-head">
                    <span className="pol-bundle-name">{b.name}</span>
                    <span className="pol-count sm">{b.statementIds.length}</span>
                    {writable && <button type="button" className="pol-icon pol-del" title="삭제" onClick={() => removeBundle(b.id)}>✕</button>}
                  </div>
                  {b.description && <div className="pol-bundle-desc">{b.description}</div>}
                  <ul className="pol-bundle-list">
                    {b.statementIds.map(id => { const s = byId.get(id); return <li key={id} className={s ? '' : 'pol-missing'}>{s ? s.label : '(삭제된 문법)'}</li> })}
                  </ul>
                  <button type="button" className="pol-mk-cli" onClick={() => openGen(b)}>⌘ 이 compartment 에 작성 (OCI CLI)</button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* 생성 모달 */}
      {genBundle && (
        <div className="pol-modal-bg" onClick={() => setGenId(null)}>
          <div className="pol-modal" onClick={e => e.stopPropagation()}>
            <div className="pol-modal-head">
              <span>«{genBundle.name}» → OCI CLI</span>
              <button type="button" className="pol-ghost" onClick={() => setGenId(null)}>닫기 ✕</button>
            </div>
            <div className="pol-modal-body">
              <div className="pol-gen-note">아래 값을 채우면 <span className="bp-mono">생성 · 검증 · 롤백</span> 스크립트가 만들어집니다. <button type="button" className="pol-alt" onClick={() => setWizOpen(true)}>Alt+I 로 빠른 입력</button></div>
              <div className="pol-gen-grid">
                {genQuestions.map(qn => (
                  <label className="pol-l" key={qn.id}>{qn.label}{qn.requirement === 'required' && <span className="pol-req"> *</span>}
                    <input value={gen[qn.id] || ''} placeholder={qn.placeholder} onChange={e => setGenVal(qn.id, e.target.value)} />
                  </label>
                ))}
              </div>
              <details className="bp-details pol-gen-stmts" open>
                <summary>이 묶음의 statements ({genStatements.length}개)</summary>
                <pre className="bp-pre"><code>{JSON.stringify(genStatements, null, 2)}</code></pre>
              </details>
              {scripts ? (
                <div className="pol-scripts">
                  <Script s={scripts.create} open />
                  <Script s={scripts.verify} />
                  <Script s={scripts.rollback} />
                </div>
              ) : (
                <div className="pol-empty">대상 compartment 와 정책 이름을 입력하세요.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {wizOpen && <CliInputWizard title="OCI POLICY CREATE" questions={genQuestions} values={gen} setValue={setGenVal} onClose={() => setWizOpen(false)} />}
      </div>
    </div>
  )
}
