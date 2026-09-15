import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultPort, defaultUser, emptyMobaSession, mobaTemplate, parseMobaInput, renderMobaExport,
  validateMobaSessions, type MobaSession, type MobaSessionType,
} from '../lib/mobaxtermSessions'
import {
  deleteKeyProfile, getLastKeyPath, loadKeyProfiles, setLastKeyPath, upsertKeyProfile,
  type MobaKeyProfile,
} from '../lib/mobaKeyStore'
import CliInputWizard, {
  defaultCliWizardControl, useCliInputWizardShortcut,
  type CliWizardQuestion, type CliWizardRenderContext,
} from '../components/CliInputWizard'
import './MobaXtermPage.css'

const download = (text: string, filename: string, type = 'text/plain;charset=windows-949') => {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const KEY_DATALIST_ID = 'moba-key-datalist'
const TYPE_LABEL: Record<MobaSessionType, string> = { ssh: 'SSH (Linux)', rdp: 'RDP (Windows)' }

// 마법사 values(Record<string,string>) → MobaSession. 타입에 맞지 않는 필드는 비운다.
function valuesToSession(v: Record<string, string>): MobaSession {
  const type: MobaSessionType = v.type === 'rdp' ? 'rdp' : 'ssh'
  const base = emptyMobaSession(type)
  return {
    ...base,
    folder: (v.folder ?? '').replaceAll('/', '\\').replace(/^\\+|\\+$/g, ''),
    name: v.name ?? '', host: v.host ?? '', port: v.port || defaultPort(type), user: v.user || defaultUser(type),
    keyPath: type === 'ssh' ? (v.keyPath ?? '') : '',
    domain: type === 'rdp' ? (v.domain ?? '') : '',
    bastionHost: type === 'ssh' ? (v.bastionHost ?? '') : '',
    bastionPort: v.bastionPort || '22', bastionUser: v.bastionUser || 'opc',
    bastionKeyPath: type === 'ssh' ? (v.bastionKeyPath ?? '') : '',
  }
}

const wizardQuestions: CliWizardQuestion[] = [
  { id: 'type', valueId: 'type', label: '세션 종류', type: 'string', requirement: 'required', help: 'SSH(Linux) 또는 RDP(Windows)' },
  { id: 'folder', valueId: 'folder', label: '폴더', type: 'string', optional: true, placeholder: 'wizocm\\production', help: 'MobaXterm 세션 트리 폴더 (비우면 루트)' },
  { id: 'name', valueId: 'name', label: '세션명', type: 'string', requirement: 'required', placeholder: 'app-01' },
  { id: 'host', valueId: 'host', label: '호스트 / IP', type: 'string', requirement: 'required', placeholder: '10.0.1.10' },
  { id: 'port', valueId: 'port', label: '포트', type: 'string', requirement: 'required', help: 'SSH 기본 22 · RDP 기본 3389' },
  { id: 'user', valueId: 'user', label: '사용자', type: 'string', requirement: 'required', help: '기본 opc (OCI 는 RDP 도 opc 로 접속)' },
  { id: 'keyPath', valueId: 'keyPath', label: '개인키 경로', type: 'string', optional: true, placeholder: 'C:\\keys\\customer.key', help: '저장된 키를 목록에서 고르거나 경로 입력', visibleIf: v => v.type !== 'rdp' },
  { id: 'domain', valueId: 'domain', label: '도메인', type: 'string', optional: true, placeholder: '없으면 비움 (예: CORP)', visibleIf: v => v.type === 'rdp' },
  { id: 'bastionHost', valueId: 'bastionHost', label: '점프 호스트', type: 'string', optional: true, placeholder: '없으면 비움', visibleIf: v => v.type !== 'rdp' },
  { id: 'bastionPort', valueId: 'bastionPort', label: '점프 포트', type: 'string', optional: true, visibleIf: v => v.type !== 'rdp' && !!(v.bastionHost ?? '').trim() },
  { id: 'bastionUser', valueId: 'bastionUser', label: '점프 사용자', type: 'string', optional: true, visibleIf: v => v.type !== 'rdp' && !!(v.bastionHost ?? '').trim() },
  { id: 'bastionKeyPath', valueId: 'bastionKeyPath', label: '점프 키 경로', type: 'string', optional: true, placeholder: '비우면 개인키 재사용', visibleIf: v => v.type !== 'rdp' && !!(v.bastionHost ?? '').trim() },
]

export default function MobaXtermPage() {
  const [sessions, setSessions] = useState<MobaSession[]>([])
  const [draft, setDraft] = useState<MobaSession>(() => emptyMobaSession('ssh'))
  const [bulk, setBulk] = useState(mobaTemplate)
  const [bulkMessage, setBulkMessage] = useState('세션 종류(SSH/RDP)를 고르고 입력하세요. Excel 범위를 붙여넣어도 됩니다.')
  const [copied, setCopied] = useState(false)
  const [keyProfiles, setKeyProfiles] = useState<MobaKeyProfile[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardValues, setWizardValues] = useState<Record<string, string>>({})
  const nameRef = useRef<HTMLInputElement>(null)
  // 다음 빠른 추가에 반복 필드(폴더·타입·키 등)를 이어받아 여러 세션을 빠르게 넣는다.
  const seedRef = useRef<Partial<MobaSession>>({})

  const issues = useMemo(() => validateMobaSessions(sessions), [sessions])
  const output = useMemo(() => issues.length ? '' : renderMobaExport(sessions), [issues, sessions])
  const folders = useMemo(() => [...new Set(sessions.map(session => session.folder || '(루트)'))], [sessions])

  useEffect(() => { setKeyProfiles(loadKeyProfiles()) }, [])

  const setDraftType = useCallback((type: MobaSessionType) => {
    setDraft(current => ({ ...current, type, port: defaultPort(type), user: defaultUser(type) }))
  }, [])

  const saveCurrentKey = useCallback((keyPath: string) => {
    const path = keyPath.trim()
    if (!path) { setBulkMessage('저장할 개인키 경로를 먼저 입력하세요.'); return }
    setKeyProfiles(current => {
      const next = upsertKeyProfile('', path, current)
      setBulkMessage(`키 프로필 저장됨: ${next.find(p => p.keyPath === path)?.label ?? path}`)
      return next
    })
  }, [])
  const removeKey = useCallback((id: string) => setKeyProfiles(current => deleteKeyProfile(id, current)), [])

  const openWizard = useCallback(() => {
    const seed = seedRef.current
    const type: MobaSessionType = seed.type === 'rdp' ? 'rdp' : 'ssh'
    setWizardValues({
      type,
      folder: seed.folder ?? '',
      name: '', host: '',
      port: seed.port || defaultPort(type),
      user: seed.user || defaultUser(type),
      keyPath: seed.keyPath ?? getLastKeyPath(),
      domain: seed.domain ?? '',
      bastionHost: seed.bastionHost ?? '', bastionPort: seed.bastionPort || '22',
      bastionUser: seed.bastionUser || 'opc', bastionKeyPath: seed.bastionKeyPath ?? '',
    })
    setWizardOpen(true)
  }, [])
  useCliInputWizardShortcut(!wizardOpen, openWizard)

  const copyOutput = useCallback(async () => {
    if (!output) { setBulkMessage(issues[0] ?? '입력을 확인하세요.'); return }
    try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
    catch { setBulkMessage('클립보드 복사에 실패했습니다. 결과를 직접 선택하세요.') }
  }, [issues, output])
  useEffect(() => {
    if (wizardOpen) return
    const shortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === 'KeyC') { event.preventDefault(); event.stopImmediatePropagation(); void copyOutput() }
    }
    window.addEventListener('keydown', shortcut, true); return () => window.removeEventListener('keydown', shortcut, true)
  }, [copyOutput, wizardOpen])

  const wizardSetValue = useCallback((id: string, value: string) => {
    setWizardValues(prev => {
      if (id === 'type') {
        const type: MobaSessionType = value === 'rdp' ? 'rdp' : 'ssh'
        return { ...prev, type, port: defaultPort(type), user: defaultUser(type) }
      }
      return { ...prev, [id]: value }
    })
  }, [])

  const commitSession = useCallback((session: MobaSession, source: string) => {
    let ok = false
    setSessions(current => {
      const candidate = [...current, session]
      const problems = validateMobaSessions(candidate)
      if (problems.length) { setBulkMessage(problems.at(-1) ?? '입력을 확인하세요.'); return current }
      ok = true
      setBulkMessage(`${source} · 세션 ${candidate.length}개 · 폴더 ${new Set(candidate.map(item => item.folder)).size}개`)
      return candidate
    })
    if (ok) {
      if (session.keyPath) setLastKeyPath(session.keyPath)
      seedRef.current = {
        type: session.type, folder: session.folder, port: session.port, user: session.user,
        keyPath: session.keyPath, domain: session.domain, bastionHost: session.bastionHost,
        bastionPort: session.bastionPort, bastionUser: session.bastionUser, bastionKeyPath: session.bastionKeyPath,
      }
    }
    return ok
  }, [])

  const closeWizard = useCallback(() => {
    const values = wizardValues
    if ((values.name ?? '').trim() && (values.host ?? '').trim()) {
      const added = commitSession(valuesToSession(values), '빠른 입력 추가')
      if (added) setBulkMessage(prev => `${prev} · Alt+I로 계속 추가`)
    }
    setWizardOpen(false)
  }, [wizardValues, commitSession])

  const addDraft = () => {
    if (commitSession({ ...draft, id: crypto.randomUUID() }, '세션 추가')) {
      setDraft(current => ({ ...emptyMobaSession(current.type), folder: current.folder, keyPath: current.keyPath }))
      window.setTimeout(() => nameRef.current?.focus(), 0)
    }
  }
  const onDraftKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') { event.preventDefault(); addDraft() }
  }

  const importBulk = () => {
    try {
      const parsed = parseMobaInput(bulk); const parsedIssues = validateMobaSessions(parsed)
      if (parsedIssues.length) throw new Error(parsedIssues.join('\n'))
      setSessions(parsed); setBulkMessage(`${parsed.length}개 세션을 불러왔습니다.`)
    } catch (error) { setBulkMessage(error instanceof Error ? error.message : '입력 형식을 확인하세요.') }
  }
  const importFile = async (file?: File) => {
    if (!file) return
    if (file.name.toLowerCase().endsWith('.xlsx')) { setBulkMessage('웹에서는 Excel의 표를 복사해 붙여넣으세요. .xlsx 파일 직접 적용은 Codex Skill이 담당합니다.'); return }
    setBulk(await file.text()); setBulkMessage(`${file.name}을 읽었습니다. “목록으로 적용”을 누르세요.`)
  }

  const renderWizardControl = useCallback((context: CliWizardRenderContext) => {
    if (context.question.id === 'type') {
      return (
        <div className="moba-seg" role="tablist" aria-label="세션 종류">
          {(['ssh', 'rdp'] as const).map((option, optionIndex) => (
            <button type="button" role="tab" key={option} aria-selected={context.value === option}
              ref={optionIndex === 0 ? (element => context.assignRef(element)) : undefined}
              className={`moba-seg-btn${context.value === option ? ' on' : ''}`}
              onClick={() => context.setValue('type', option)}>{TYPE_LABEL[option]}</button>
          ))}
        </div>
      )
    }
    if (context.question.id === 'keyPath') {
      return (
        <>
          <input ref={element => context.assignRef(element)} className={context.inputClass} list={KEY_DATALIST_ID}
            value={context.value} placeholder={context.question.placeholder} autoComplete="off"
            onChange={event => context.setValue('keyPath', event.target.value)} />
          <datalist id={KEY_DATALIST_ID}>{keyProfiles.map(profile => <option key={profile.id} value={profile.keyPath}>{profile.label}</option>)}</datalist>
        </>
      )
    }
    return defaultCliWizardControl(context)
  }, [keyProfiles])

  const isRdp = draft.type === 'rdp'

  return <main className="moba-page">
    <header className="moba-hero">
      <div><span className="moba-eyebrow">KNOWLEDGE · SESSION TOOL</span><h1>MobaXterm 제어</h1><p>SSH·RDP 세션을 입력하면 MobaXterm이 바로 가져올 수 있는 파일을 만듭니다.</p></div>
      <button type="button" className="moba-primary" onClick={openWizard}>빠른 입력 <kbd>Alt+I</kbd></button>
    </header>

    <section className="moba-storage" aria-label="MobaXterm 저장 위치">
      <div><b>현재 설정 파일</b><code>%APPDATA%\MobaXterm\MobaXterm.ini</code></div>
      <div><b>세션 저장 구조</b><span><code>[Bookmarks_N]</code> + <code>SubRep=폴더\하위폴더</code> + <code>세션명=#109#…(SSH) / #91#…(RDP)</code></span></div>
      <p>이 화면은 비밀번호나 키 파일 내용은 다루지 않습니다. 키는 로컬 경로 문자열만 넣습니다. 다운로드한 파일은 MobaXterm의 <b>Import sessions from file</b>로 가져오세요.</p>
    </section>

    <div className="moba-grid">
      <section id="moba-quick-input" className="moba-card">
        <div className="moba-card-head"><div><span>01</span><h2>세션 한 개 빠르게 추가</h2></div><small>Enter 추가 · Alt+I 팝업</small></div>

        <div className="moba-seg" role="tablist" aria-label="세션 종류">
          {(['ssh', 'rdp'] as const).map(option => (
            <button type="button" role="tab" key={option} aria-selected={draft.type === option}
              className={`moba-seg-btn${draft.type === option ? ' on' : ''}`} onClick={() => setDraftType(option)}>{TYPE_LABEL[option]}</button>
          ))}
        </div>

        <div className="moba-form">
          <label>폴더<input value={draft.folder} placeholder="wizocm\production" onChange={e => setDraft(c => ({ ...c, folder: e.target.value }))} onKeyDown={onDraftKey} /></label>
          <label>세션명<input ref={nameRef} value={draft.name} placeholder="app-01" onChange={e => setDraft(c => ({ ...c, name: e.target.value }))} onKeyDown={onDraftKey} /></label>
          <label>호스트 / IP<input value={draft.host} placeholder="10.0.1.10" onChange={e => setDraft(c => ({ ...c, host: e.target.value }))} onKeyDown={onDraftKey} /></label>
          <label>{isRdp ? 'RDP 포트' : 'SSH 포트'}<input value={draft.port} onChange={e => setDraft(c => ({ ...c, port: e.target.value }))} onKeyDown={onDraftKey} /></label>
          <label>사용자<input value={draft.user} placeholder={defaultUser(draft.type)} onChange={e => setDraft(c => ({ ...c, user: e.target.value }))} onKeyDown={onDraftKey} /></label>
          {isRdp
            ? <label>도메인<input value={draft.domain} placeholder="없으면 비움 (예: CORP)" onChange={e => setDraft(c => ({ ...c, domain: e.target.value }))} onKeyDown={onDraftKey} /></label>
            : <label className="moba-keyfield">개인키 경로
                <span className="moba-keyrow">
                  <input value={draft.keyPath} placeholder="C:\keys\customer.key" list={KEY_DATALIST_ID}
                    onChange={e => setDraft(c => ({ ...c, keyPath: e.target.value }))} onKeyDown={onDraftKey} />
                  <button type="button" className="moba-key-save" title="현재 키 경로를 프로필로 저장" onClick={() => saveCurrentKey(draft.keyPath)}>＋ 저장</button>
                </span>
              </label>}
          {!isRdp && <>
            <label className="bastion">점프 호스트<input value={draft.bastionHost} placeholder="없으면 비움" onChange={e => setDraft(c => ({ ...c, bastionHost: e.target.value }))} onKeyDown={onDraftKey} /></label>
            <label className="bastion">점프 포트<input value={draft.bastionPort} onChange={e => setDraft(c => ({ ...c, bastionPort: e.target.value }))} onKeyDown={onDraftKey} /></label>
            <label className="bastion">점프 사용자<input value={draft.bastionUser} onChange={e => setDraft(c => ({ ...c, bastionUser: e.target.value }))} onKeyDown={onDraftKey} /></label>
            <label className="bastion">점프 키 경로<input value={draft.bastionKeyPath} placeholder="비우면 개인키 재사용" onChange={e => setDraft(c => ({ ...c, bastionKeyPath: e.target.value }))} onKeyDown={onDraftKey} /></label>
          </>}
        </div>

        {!isRdp && keyProfiles.length > 0 && (
          <div className="moba-keychips" aria-label="저장된 키 프로필">
            <span className="moba-keychips-label">저장된 키</span>
            {keyProfiles.map(profile => (
              <span key={profile.id} className="moba-keychip">
                <button type="button" title={profile.keyPath} onClick={() => setDraft(c => ({ ...c, keyPath: profile.keyPath }))}>{profile.label}</button>
                <button type="button" className="moba-keychip-x" title="삭제" onClick={() => removeKey(profile.id)}>×</button>
              </span>
            ))}
          </div>
        )}

        <button type="button" className="moba-add" onClick={addDraft}>+ 목록에 세션 추가</button>
        <datalist id={KEY_DATALIST_ID}>{keyProfiles.map(profile => <option key={profile.id} value={profile.keyPath}>{profile.label}</option>)}</datalist>
      </section>

      <section className="moba-card">
        <div className="moba-card-head"><div><span>02</span><h2>JSON · Excel 표 한 번에 입력</h2></div><small>첫 행은 열 이름 · type 열로 ssh/rdp</small></div>
        <textarea className="moba-bulk" rows={12} value={bulk} onChange={event => setBulk(event.target.value)} spellCheck={false} />
        <div className="moba-inline-actions">
          <button type="button" onClick={importBulk}>목록으로 적용</button>
          <label className="moba-file">JSON·CSV 파일 열기<input type="file" accept=".json,.csv,.tsv,.xlsx" onChange={event => void importFile(event.target.files?.[0])} /></label>
          <button type="button" onClick={() => download(mobaTemplate.replaceAll('\t', ','), 'mobaxterm-sessions-template.csv', 'text/csv;charset=utf-8')}>Excel용 CSV 양식</button>
        </div>
        <p className="moba-message" role="status">{bulkMessage}</p>
      </section>
    </div>

    <section className="moba-card moba-sessions">
      <div className="moba-card-head"><div><span>03</span><h2>폴더와 세션 확인</h2></div><small>{sessions.length} sessions · {folders.length} folders</small></div>
      {sessions.length === 0 ? <p className="moba-empty">아직 세션이 없습니다. 빠른 입력이나 일괄 입력으로 추가하세요.</p> : <>
        <div className="moba-folder-chips">{folders.map(folder => <span key={folder}>▾ {folder}</span>)}</div>
        <div className="moba-table-wrap"><table><thead><tr><th>종류</th><th>폴더</th><th>세션명</th><th>접속 대상</th><th>사용자</th><th>경유</th><th></th></tr></thead><tbody>
          {sessions.map(session => <tr key={session.id}>
            <td><span className={`moba-typebadge ${session.type}`}>{session.type.toUpperCase()}</span></td>
            <td>{session.folder || '(루트)'}</td><td><b>{session.name}</b></td>
            <td><code>{session.host}:{session.port}</code></td>
            <td>{session.type === 'rdp' && session.domain ? `${session.domain}\\${session.user}` : session.user}</td>
            <td>{session.type === 'ssh' && session.bastionHost ? `${session.bastionHost}:${session.bastionPort}` : '직접'}</td>
            <td><button type="button" onClick={() => setSessions(current => current.filter(item => item.id !== session.id))}>삭제</button></td>
          </tr>)}
        </tbody></table></div>
      </>}
    </section>

    <section className={`moba-result ${issues.length ? 'incomplete' : ''}`}>
      <div><span>04 · IMPORT FILE</span><h2>{issues.length ? '입력을 확인하세요' : 'MobaXterm 세션 파일 준비 완료'}</h2><p>{issues[0] ?? '가져오기 파일을 다운로드하거나 설정 내용을 복사할 수 있습니다.'}</p></div>
      <div className="moba-result-actions">
        <button type="button" onClick={() => void copyOutput()} disabled={!output}>{copied ? '복사됨 ✓' : '설정 복사'} <kbd>Alt+C</kbd></button>
        <button type="button" className="moba-primary" onClick={() => download(`\uFEFF${output}`, 'mobaxterm-sessions.mxtsessions')} disabled={!output}>.mxtsessions 다운로드</button>
      </div>
      {output && <details><summary>생성된 설정 미리보기</summary><pre>{output}</pre></details>}
    </section>

    {wizardOpen && (
      <CliInputWizard title="MOBAXTERM SESSION" questions={wizardQuestions} values={wizardValues}
        setValue={wizardSetValue} onClose={closeWizard} renderControl={renderWizardControl} />
    )}
  </main>
}
