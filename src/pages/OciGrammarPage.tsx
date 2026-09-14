import { useMemo, useState } from 'react'
import './OciPolicyPage.css' // pol-* 프리미티브(top·card·stmt·modal…) + oci-resource-nav 공유
import './OciGrammarPage.css'
import { useSyncedJson, SYNC_LABEL } from '../lib/scheduleDb'
import { GRAMMAR_LANGS, GRAMMAR_GROUPS, langById, EMPTY_GRAMMAR_DB } from '../lib/oci-grammar/grammarCatalog.mjs'
import type { GrammarDb, GrammarSnippet } from '../lib/oci-grammar/grammarCatalog.d.mts'
import { parseTypeList, buildResourceSearchQuery, renderResourceTypeExtract, renderResourceSearchRun, whereMixesConnectors } from '../lib/oci-grammar/grammarExtract.mjs'
import type { ExtractScript, WhereCond } from '../lib/oci-grammar/grammarExtract.d.mts'

const DB_PATH = 'knowledge/oci-grammar/grammar.json'
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const nowIso = () => new Date().toISOString()
const WHERE_OPS = ['=', '!=', '==', '!==', '=~', '>', '>=', '<', '<=', 'IN']

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="bp-copy" onClick={e => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200) }) }}>{ok ? '복사됨 ✓' : '복사'}</button>
}
function DlBtn({ text, filename }: { text: string; filename: string }) {
  return <button type="button" className="bp-copy bp-dl" title={filename} onClick={e => { e.preventDefault(); e.stopPropagation(); const b = new Blob([text], { type: 'text/x-shellscript' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000) }}>⬇ .sh</button>
}
function Script({ s, open }: { s: ExtractScript; open?: boolean }) {
  const lines = s.body.split('\n').length
  return (
    <details className="bp-script" open={open}>
      <summary className="bp-script-head"><span className="bp-script-caret" aria-hidden>▸</span><span className="bp-mono">{s.filename}</span><span className="bp-script-hint">{s.title} · {lines}줄</span><DlBtn text={s.body} filename={s.filename} /><CopyBtn text={s.body} /></summary>
      <pre className="bp-pre"><code>{s.body}</code></pre>
    </details>
  )
}

export default function OciGrammarPage() {
  const { data, update, sync, writable } = useSyncedJson<GrammarDb>(DB_PATH, EMPTY_GRAMMAR_DB, 'grammar: 스니펫 갱신')
  const snippets = useMemo(() => data.snippets ?? [], [data])
  const [sel, setSel] = useState('resource-search')
  const lang = langById(sel)
  const langsInGroup = (g: string) => GRAMMAR_LANGS.filter(l => l.group === g)
  const langSnippets = useMemo(() => snippets.filter(s => s.lang === sel), [snippets, sel])

  /* 스니펫 편집 폼 */
  const emptyDraft = { id: '', lang: sel, label: '', query: '', description: '', tags: '' }
  const [draft, setDraft] = useState(emptyDraft)
  const [showForm, setShowForm] = useState(false)
  const openNew = (lng: string, query = '') => { setDraft({ ...emptyDraft, lang: lng, query }); setShowForm(true) }
  const openEdit = (s: GrammarSnippet) => { setDraft({ id: s.id, lang: s.lang, label: s.label, query: s.query, description: s.description || '', tags: (s.tags || []).join(', ') }); setShowForm(true) }
  const saveDraft = () => {
    if (!draft.label.trim() || !draft.query.trim()) return
    const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
    if (draft.id) update({ ...data, snippets: snippets.map(s => s.id === draft.id ? { ...s, lang: draft.lang, label: draft.label.trim(), query: draft.query, description: draft.description.trim(), tags, updatedAt: nowIso() } : s) })
    else update({ ...data, snippets: [{ id: uid('gq'), lang: draft.lang, label: draft.label.trim(), query: draft.query, description: draft.description.trim(), tags, createdAt: nowIso() }, ...snippets] })
    setShowForm(false); setDraft(emptyDraft)
  }
  const removeSnippet = (id: string) => { if (confirm('이 스니펫을 삭제할까요?')) update({ ...data, snippets: snippets.filter(s => s.id !== id) }) }

  /* Resource Search 컴포저 */
  const [typesText, setTypesText] = useState('')
  const [whereRows, setWhereRows] = useState<WhereCond[]>([{ field: '', op: '!=', value: '', join: '&&' }])
  const [sortField, setSortField] = useState('timeCreated')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC')
  const [profile, setProfile] = useState('DEFAULT')
  const [region, setRegion] = useState('')
  const assembled = useMemo(() => buildResourceSearchQuery({ types: parseTypeList(typesText), where: whereRows, sortField, sortDir }), [typesText, whereRows, sortField, sortDir])
  const extractScript = useMemo(() => renderResourceTypeExtract({ profile, region }), [profile, region])
  const runScript = useMemo<ExtractScript | null>(() => { try { return renderResourceSearchRun({ query: assembled, profile, region }) } catch { return null } }, [assembled, profile, region])
  const setRow = (i: number, patch: Partial<WhereCond>) => setWhereRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  const addRow = () => setWhereRows(rows => [...rows, { field: '', op: '!=', value: '', join: '&&' }])
  const delRow = (i: number) => setWhereRows(rows => rows.filter((_, j) => j !== i))

  return (
    <div className="gr-shell">
      {/* 좌측 — 쿼리 언어 taxonomy */}
      <div className="oci-resource-nav" aria-label="OCI 쿼리 언어">
        {GRAMMAR_GROUPS.map(g => (
          <div className="cli-cat" key={g}>
            <div className="cli-group-label px">{g}</div>
            {langsInGroup(g).map(l => (
              <button type="button" key={l.id} className={`cli-navitem${sel === l.id ? ' on' : ''}${l.verified ? ' verified' : ''}`} onClick={() => setSel(l.id)}>
                {l.label}
                {snippets.some(s => s.lang === l.id) && <span className="gr-navcount">{snippets.filter(s => s.lang === l.id).length}</span>}
                {l.verified && <span className="cli-vmark" title="공식문서 확인">✓</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="gr-main">
        <div className="pol-top">
          <div>
            <div className="pol-title">OCI Grammar</div>
            <div className="pol-sub">OCI 쿼리·표현 문법 모음 — 참조 + 내가 쓴 쿼리 저장 · 조합</div>
          </div>
          <div className="pol-top-r">
            <span className={`pol-sync s-${sync}`}>{SYNC_LABEL[sync]}</span>
            {writable && <button type="button" className="pol-primary" onClick={() => openNew(sel)}>＋ 스니펫</button>}
          </div>
        </div>
        {!writable && <div className="pol-ro">🔒 읽기 전용입니다. 참조·조합·스크립트 생성은 그대로 되고, 스니펫 저장만 PAT(쓰기)가 필요합니다.</div>}

        {lang && <>
          {/* 언어 참조 */}
          <div className="gr-ref">
            <div className="gr-ref-head">
              <span className="gr-ref-title">{lang.label}</span>
              <span className="gr-ref-svc">{lang.service}</span>
              {lang.verified && <span className="gr-ref-ok">✓ 공식문서 확인</span>}
              {lang.docUrl && <a className="gr-ref-doc" href={lang.docUrl} target="_blank" rel="noreferrer">문서 ↗</a>}
            </div>
            <div className="gr-ref-purpose">{lang.purpose}</div>
            {lang.runCli && <div className="gr-ref-run">실행: <span className="bp-mono">{lang.runCli}</span></div>}
            {lang.skeleton && <pre className="gr-skeleton"><code>{lang.skeleton}</code></pre>}
            {lang.clauses && lang.clauses.length > 0 && (
              <ul className="gr-clauses">{lang.clauses.map((c, i) => <li key={i}>{c}</li>)}</ul>
            )}
            {lang.examples && lang.examples.length > 0 && (
              <div className="gr-examples">
                <div className="gr-sub-h">예시</div>
                {lang.examples.map((ex, i) => (
                  <div className="gr-example" key={i}>
                    <pre className="pol-stmt"><code>{ex}</code><CopyBtn text={ex} /></pre>
                    {writable && <button type="button" className="gr-save-ex" onClick={() => openNew(lang.id, ex)}>스니펫으로 저장</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resource Search 컴포저 */}
          {lang.id === 'resource-search' && (
            <div className="gr-composer">
              <div className="gr-sub-h">쿼리 조합 (Resource Search)</div>
              <label className="pol-l">리소스 타입 <span className="gr-hint">— 추출 스크립트 결과를 붙여넣기 (콤마/개행). 비우면 all</span>
                <textarea rows={2} spellCheck={false} value={typesText} onChange={e => setTypesText(e.target.value)} placeholder="instance, bootvolume, volume, bucket …" />
              </label>
              <div className="gr-where">
                <div className="gr-sub-h2">where 조건 <span className="gr-hint">— 문자열·날짜 값은 따옴표로: <span className="bp-mono">'GSIS'</span> · IN 은 <span className="bp-mono">('A','B')</span></span></div>
                {whereRows.map((r, i) => (
                  <div className="gr-where-row" key={i}>
                    {i > 0
                      ? <select className="gr-join" value={r.join} onChange={e => setRow(i, { join: e.target.value as '&&' | '||' })}><option value="&&">&&</option><option value="||">||</option></select>
                      : <span className="gr-join gr-join-first">where</span>}
                    <input className="gr-field" value={r.field} onChange={e => setRow(i, { field: e.target.value })} placeholder="definedTags.namespace" />
                    <select className="gr-op" value={r.op} onChange={e => setRow(i, { op: e.target.value })}>{WHERE_OPS.map(o => <option key={o} value={o}>{o}</option>)}</select>
                    <input className="gr-value" value={r.value} onChange={e => setRow(i, { value: e.target.value })} placeholder="'GSIS'" />
                    <button type="button" className="pol-icon pol-del" onClick={() => delRow(i)}>✕</button>
                  </div>
                ))}
                <button type="button" className="pol-ghost gr-addrow" onClick={addRow}>＋ 조건</button>
                {whereMixesConnectors(whereRows) && <div className="gr-warn">⚠ &&와 ||를 섞으면 문서상 <span className="bp-mono">( )</span> 괄호로 우선순위를 명시해야 합니다. 조합 결과를 확인·수정하세요.</div>}
              </div>
              <div className="gr-sort">
                <label className="pol-l gr-inline">정렬<input value={sortField} onChange={e => setSortField(e.target.value)} placeholder="timeCreated" /></label>
                <select value={sortDir} onChange={e => setSortDir(e.target.value as 'ASC' | 'DESC')}><option value="DESC">DESC</option><option value="ASC">ASC</option></select>
              </div>

              <div className="gr-assembled">
                <div className="gr-sub-h2">조합된 쿼리 <CopyBtn text={assembled} />{writable && <button type="button" className="gr-save-ex" onClick={() => openNew('resource-search', assembled)}>스니펫으로 저장</button>}</div>
                <pre className="pol-stmt gr-asm"><code>{assembled}</code></pre>
              </div>

              <div className="gr-scripts">
                <div className="gr-sub-h2">실행 / 추출 스크립트</div>
                <div className="gr-profile-row">
                  <label className="pol-l gr-inline">프로파일<input value={profile} onChange={e => setProfile(e.target.value)} placeholder="DEFAULT" /></label>
                  <label className="pol-l gr-inline">리전(선택)<input value={region} onChange={e => setRegion(e.target.value)} placeholder="ap-seoul-1" /></label>
                </div>
                {runScript && <Script s={runScript} open />}
                <Script s={extractScript} />
              </div>
            </div>
          )}

          {/* 스니펫 라이브러리 */}
          <div className="gr-lib">
            <div className="gr-sub-h">저장된 쿼리 · {lang.label} <span className="pol-count">{langSnippets.length}</span></div>
            {langSnippets.length === 0 && <div className="pol-empty sm">저장된 쿼리가 없습니다. {writable ? '위 예시의 «스니펫으로 저장» 또는 ＋스니펫으로 추가하세요.' : ''}</div>}
            <div className="pol-list">
              {langSnippets.map(s => (
                <div className="pol-card" key={s.id}>
                  <div className="pol-card-head">
                    <span className="pol-card-label">{s.label}</span>
                    <div className="pol-card-actions">
                      {writable && <button type="button" className="pol-icon" title="편집" onClick={() => openEdit(s)}>✎</button>}
                      {writable && <button type="button" className="pol-icon pol-del" title="삭제" onClick={() => removeSnippet(s.id)}>✕</button>}
                    </div>
                  </div>
                  <pre className="pol-stmt"><code>{s.query}</code><CopyBtn text={s.query} /></pre>
                  {(s.description || (s.tags || []).length > 0) && (
                    <div className="pol-meta">
                      {s.description && <span className="pol-desc">{s.description}</span>}
                      {(s.tags || []).map(t => <span key={t} className="pol-tag">#{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>}
      </div>

      {/* 스니펫 폼 모달 */}
      {showForm && writable && (
        <div className="pol-modal-bg" onClick={() => setShowForm(false)}>
          <div className="pol-modal" onClick={e => e.stopPropagation()}>
            <div className="pol-modal-head"><span>쿼리 스니펫 {draft.id ? '수정' : '추가'}</span><button type="button" className="pol-ghost" onClick={() => setShowForm(false)}>닫기 ✕</button></div>
            <div className="pol-modal-body">
              <div className="gr-form-grid">
                <label className="pol-l">이름(식별)<input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="예: GSIS 제외 최신 자원" autoFocus /></label>
                <label className="pol-l">언어<select value={draft.lang} onChange={e => setDraft({ ...draft, lang: e.target.value })}>{GRAMMAR_LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
              </div>
              <label className="pol-l">쿼리 (원문 그대로)
                <textarea value={draft.query} onChange={e => setDraft({ ...draft, query: e.target.value })} rows={5} spellCheck={false} placeholder="query … resources where … sorted by …" />
              </label>
              <div className="gr-form-grid">
                <label className="pol-l">태그(쉼표)<input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} placeholder="search, tag" /></label>
                <label className="pol-l">메모(선택)<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="언제·왜 썼는지" /></label>
              </div>
              <div className="pol-form-actions">
                <button type="button" className="pol-primary" onClick={saveDraft} disabled={!draft.label.trim() || !draft.query.trim()}>{draft.id ? '수정 저장' : '라이브러리에 추가'}</button>
                <button type="button" className="pol-ghost" onClick={() => setShowForm(false)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
