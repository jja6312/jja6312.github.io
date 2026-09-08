import { useState } from 'react'
import './CliDiscoveryPanel.css'
import { parseCliDiscovery, type CliDiscoveryRelation, type CliDiscoveryItem } from '../lib/cliDiscovery'

export default function CliDiscoveryPanel({ relation, command, issues, onSelect, multiple = false }: {
  relation: CliDiscoveryRelation; command: string; issues: string[]
  onSelect: (id: string) => void; multiple?: boolean
}) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<CliDiscoveryItem[] | null>(null)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setMessage('복사됨 · 터미널에서 실행 후 JSON을 아래에 붙여넣으세요.') }
    catch { setMessage('복사 권한이 없습니다. 명령을 직접 선택해 복사하세요.') }
  }
  const load = () => {
    try { const parsed = parseCliDiscovery(text, relation); setItems(parsed); setSelected([]); setMessage(parsed.length ? `${parsed.length}건 · 적용할 ID를 직접 선택하세요.` : '조회 성공 · 0건. 프로필·리전·권한·계약 상태를 확인하세요.') }
    catch (error) { setItems(null); setMessage((error as Error).message) }
  }
  return <details className="cli-discovery" onKeyDown={event => { if (event.key !== 'Escape' && !event.altKey) event.stopPropagation() }}>
    <summary>↗ {relation.label}</summary>
    <p>현재 입력은 유지됩니다. ① 명령 복사·실행 → ② JSON 붙여넣기 → ③ ID 선택. 브라우저는 OCI에 접속하지 않습니다.</p>
    {issues.length ? <p role="status">먼저 입력: {issues.join(' · ')}</p> : <>
      <button type="button" onClick={copy}>목록 조회 명령 복사</button>
      <pre tabIndex={0}>{command}</pre>
      <textarea aria-label="목록 조회 JSON" placeholder={'{"data": [{"id": "...", ...}]}'} rows={3} value={text}
        onChange={event => { setText(event.target.value); setItems(null); setSelected([]); setMessage('') }} />
      <button type="button" disabled={!text.trim()} onClick={load}>JSON에서 목록 불러오기</button>
      {message && <p role="status">{message}</p>}
      {!!items?.length && <>
        <input aria-label="조회 결과 검색" placeholder="이름·ID·상태로 검색" value={filter} onChange={event => setFilter(event.target.value)} />
        <div className="cli-discovery-results">
          {items.filter(item => `${item.label} ${item.id} ${item.detail}`.toLowerCase().includes(filter.toLowerCase())).map(item => multiple
            ? <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span>{item.label}<code>{item.id}</code><small>{item.detail}</small></span></label>
            : <button type="button" key={item.id} onClick={() => { onSelect(item.id); setMessage(`적용됨: ${item.id}`) }}><strong>{item.label}</strong><code>{item.id}</code><small>{item.detail}</small><span>ID 적용 →</span></button>)}
        </div>
        {multiple && <button type="button" disabled={!selected.length} onClick={() => onSelect(selected.join('\n'))}>{selected.length}개 ID 적용</button>}
      </>}
    </>}
  </details>
}
