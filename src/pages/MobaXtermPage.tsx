import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emptyMobaSession, mobaTemplate, parseMobaInput, renderMobaExport, validateMobaSessions, type MobaSession } from '../lib/mobaxtermSessions'
import './MobaXtermPage.css'

const fields: { key: Exclude<keyof MobaSession, 'id'>, label: string, placeholder?: string }[] = [
  { key: 'folder', label: '폴더', placeholder: 'wizocm\\production' }, { key: 'name', label: '세션명', placeholder: 'app-01' },
  { key: 'host', label: '호스트 / IP', placeholder: '10.0.1.10' }, { key: 'port', label: 'SSH 포트' },
  { key: 'user', label: '사용자' }, { key: 'keyPath', label: '개인키 경로', placeholder: 'C:\\keys\\customer.key' },
  { key: 'bastionHost', label: '점프 호스트', placeholder: '없으면 비움' }, { key: 'bastionPort', label: '점프 포트' },
  { key: 'bastionUser', label: '점프 사용자' }, { key: 'bastionKeyPath', label: '점프 키 경로', placeholder: '비우면 개인키 재사용' },
]

const download = (text: string, filename: string, type = 'text/plain;charset=windows-949') => {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function MobaXtermPage() {
  const [sessions, setSessions] = useState<MobaSession[]>([])
  const [draft, setDraft] = useState(emptyMobaSession)
  const [bulk, setBulk] = useState(mobaTemplate)
  const [bulkMessage, setBulkMessage] = useState('Excel 범위를 복사해 붙여넣어도 됩니다.')
  const [copied, setCopied] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const issues = useMemo(() => validateMobaSessions(sessions), [sessions])
  const output = useMemo(() => issues.length ? '' : renderMobaExport(sessions), [issues, sessions])
  const folders = useMemo(() => [...new Set(sessions.map(session => session.folder || '(루트)'))], [sessions])

  const openQuickInput = useCallback(() => {
    document.getElementById('moba-quick-input')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => nameRef.current?.focus(), 250)
  }, [])
  const copyOutput = useCallback(async () => {
    if (!output) { setBulkMessage(issues[0] ?? '입력을 확인하세요.'); return }
    try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
    catch { setBulkMessage('클립보드 복사에 실패했습니다. 결과를 직접 선택하세요.') }
  }, [issues, output])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === 'KeyI') { event.preventDefault(); event.stopImmediatePropagation(); openQuickInput() }
      if (event.code === 'KeyC') { event.preventDefault(); event.stopImmediatePropagation(); void copyOutput() }
    }
    window.addEventListener('keydown', shortcut, true); return () => window.removeEventListener('keydown', shortcut, true)
  }, [copyOutput, openQuickInput])

  const add = () => {
    const candidate = [...sessions, draft]
    const newIssues = validateMobaSessions(candidate)
    if (newIssues.length) { setBulkMessage(newIssues.at(-1) ?? '입력을 확인하세요.'); return }
    setSessions(candidate); setDraft(emptyMobaSession()); setBulkMessage(`세션 ${candidate.length}개 · 폴더 ${new Set(candidate.map(item => item.folder)).size}개`)
    window.setTimeout(() => nameRef.current?.focus(), 0)
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

  return <main className="moba-page">
    <header className="moba-hero">
      <div><span className="moba-eyebrow">KNOWLEDGE · SESSION TOOL</span><h1>MobaXterm 제어</h1><p>폴더와 SSH 세션을 입력하면 MobaXterm이 바로 가져올 수 있는 파일을 만듭니다.</p></div>
      <button type="button" className="moba-primary" onClick={openQuickInput}>빠른 입력 <kbd>Alt+I</kbd></button>
    </header>

    <section className="moba-storage" aria-label="MobaXterm 저장 위치">
      <div><b>현재 설정 파일</b><code>%APPDATA%\MobaXterm\MobaXterm.ini</code></div>
      <div><b>세션 저장 구조</b><span><code>[Bookmarks_N]</code> + <code>SubRep=폴더\하위폴더</code> + <code>세션명=#109#…</code></span></div>
      <p>이 화면은 비밀번호나 키 파일 내용은 다루지 않습니다. 키는 로컬 경로 문자열만 넣습니다. 다운로드한 파일은 MobaXterm의 <b>Import sessions from file</b>로 가져오세요.</p>
    </section>

    <div className="moba-grid">
      <section id="moba-quick-input" className="moba-card">
        <div className="moba-card-head"><div><span>01</span><h2>세션 한 개 빠르게 추가</h2></div><small>Enter 추가 · Alt+I 첫 입력</small></div>
        <div className="moba-form">
          {fields.map((field, index) => <label key={field.key} className={field.key.startsWith('bastion') ? 'bastion' : ''}>{field.label}
            <input ref={field.key === 'name' ? nameRef : undefined} value={draft[field.key]} placeholder={field.placeholder}
              onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))}
              onKeyDown={event => { if (event.key === 'Enter' && index === fields.length - 1) { event.preventDefault(); add() } }} />
          </label>)}
        </div>
        <button type="button" className="moba-add" onClick={add}>+ 목록에 세션 추가</button>
      </section>

      <section className="moba-card">
        <div className="moba-card-head"><div><span>02</span><h2>JSON · Excel 표 한 번에 입력</h2></div><small>첫 행은 열 이름</small></div>
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
        <div className="moba-table-wrap"><table><thead><tr><th>폴더</th><th>세션명</th><th>접속 대상</th><th>사용자</th><th>경유</th><th></th></tr></thead><tbody>
          {sessions.map(session => <tr key={session.id}><td>{session.folder || '(루트)'}</td><td><b>{session.name}</b></td><td><code>{session.host}:{session.port}</code></td><td>{session.user}</td><td>{session.bastionHost ? `${session.bastionHost}:${session.bastionPort}` : '직접'}</td><td><button type="button" onClick={() => setSessions(current => current.filter(item => item.id !== session.id))}>삭제</button></td></tr>)}
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
  </main>
}
