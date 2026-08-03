import { useMemo, useState } from 'react'
import { useHub } from '../store'
import catalog from '../data/cliCatalog.json'

interface CliOption {
  name: string
  required: boolean
  type: string
  choices: string[] | null
  help: string
  placeholder: string
}
interface CliCommand {
  resource: string; category: string; label: string
  cmd: string; help: string; options: CliOption[]
}
interface Catalog {
  categories: { id: string; label: string; resources: string[] }[]
  commands: Record<string, CliCommand>
}
const CAT = catalog as unknown as Catalog

interface Favorite { id: string; name: string; resource: string; values: Record<string, string> }
const FAV_KEY = 'hub-cli-favorites'
const loadFavs = (): Favorite[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }
const saveFavs = (f: Favorite[]) => localStorage.setItem(FAV_KEY, JSON.stringify(f))

// 최종 oci cli 문자열 조립 — 값이 있는 옵션만, 여러 줄 백슬래시
function buildCli(cmd: CliCommand, values: Record<string, string>): string {
  const lines = [cmd.cmd]
  for (const o of cmd.options) {
    const v = (values[o.name] ?? '').trim()
    if (!v) continue
    const quoted = /\s|[{}$]/.test(v) ? `'${v}'` : v
    lines.push(`  ${o.name} ${quoted}`)
  }
  return lines.join(' \\\n')
}

export default function CliBuilderPage() {
  const { showToast } = useHub()
  const [active, setActive] = useState<string>('__custom')
  const [values, setValues] = useState<Record<string, string>>({})
  const [customText, setCustomText] = useState('oci ')
  const [favs, setFavs] = useState<Favorite[]>(loadFavs())
  const [showOptional, setShowOptional] = useState(false)

  const cmd = active !== '__custom' ? CAT.commands[active] : null
  const cli = useMemo(() => cmd ? buildCli(cmd, values) : customText, [cmd, values, customText])

  const selectResource = (res: string) => {
    setActive(res); setValues({}); setShowOptional(false)
  }
  const setVal = (name: string, v: string) => setValues(s => ({ ...s, [name]: v }))

  const copy = async () => {
    try { await navigator.clipboard.writeText(cli); showToast('클립보드에 복사됨') }
    catch { showToast('복사 실패 — 수동 선택') }
  }

  const addFav = () => {
    const name = prompt('즐겨찾기 이름', cmd ? `${cmd.label} ${values['--display-name'] || ''}`.trim() : 'custom')
    if (!name) return
    const fav: Favorite = {
      id: `fav-${favs.length}-${name}`,
      name, resource: active,
      values: active === '__custom' ? { __custom: customText } : values,
    }
    const next = [...favs, fav]; setFavs(next); saveFavs(next); showToast('즐겨찾기 저장됨')
  }
  const loadFav = (f: Favorite) => {
    if (f.resource === '__custom') { setActive('__custom'); setCustomText(f.values.__custom || 'oci ') }
    else { setActive(f.resource); setValues(f.values); setShowOptional(true) }
  }
  const delFav = (id: string) => { const n = favs.filter(f => f.id !== id); setFavs(n); saveFavs(n) }

  const requiredOpts = cmd?.options.filter(o => o.required) ?? []
  const optionalOpts = cmd?.options.filter(o => !o.required) ?? []

  return (
    <div className="cli-layout">
      {/* 좌측 계층 네비 */}
      <aside className="cli-nav">
        <button className={`cli-navitem custom${active === '__custom' ? ' on' : ''}`} onClick={() => setActive('__custom')}>
          <span className="px">✎ Custom</span>
        </button>
        {CAT.categories.map(c => (
          <div key={c.id} className="cli-cat">
            <div className="cli-cat-label px">{c.label}</div>
            {c.resources.map(r => (
              <button key={r} className={`cli-navitem${active === r ? ' on' : ''}`} onClick={() => selectResource(r)}>
                {CAT.commands[r].label}
              </button>
            ))}
          </div>
        ))}
        {favs.length > 0 && (
          <div className="cli-cat">
            <div className="cli-cat-label px">★ 즐겨찾기</div>
            {favs.map(f => (
              <div key={f.id} className="cli-fav">
                <button className="cli-navitem fav" onClick={() => loadFav(f)}>{f.name}</button>
                <button className="cli-favdel" onClick={() => delFav(f.id)} title="삭제">✕</button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* 우측 폼 + 결과 */}
      <main className="cli-main">
        <div className="crumb"><span className="px">OCI CLI</span> / {cmd ? cmd.label : 'Custom'}</div>
        <h1 className="sheet-h1">{cmd ? cmd.label : 'Custom 명령'}</h1>
        {cmd
          ? <p className="cli-help">{cmd.help}</p>
          : <p className="cli-help">자유 입력 — 아래에 직접 작성하거나, 왼쪽에서 자원을 골라 폼으로 만드세요. 저장하면 즐겨찾기로 재사용됩니다.</p>}

        {cmd ? (
          <div className="cli-form">
            <div className="cli-section-label px">필수 <span>{requiredOpts.length}</span></div>
            {requiredOpts.map(o => <Field key={o.name} o={o} value={values[o.name] || ''} onChange={v => setVal(o.name, v)} />)}

            {optionalOpts.length > 0 && <>
              <button className="cli-optional-toggle" onClick={() => setShowOptional(s => !s)}>
                {showOptional ? '▾' : '▸'} 선택 옵션 {optionalOpts.length}개 {showOptional ? '접기' : '펼치기'}
              </button>
              {showOptional && optionalOpts.map(o => <Field key={o.name} o={o} value={values[o.name] || ''} onChange={v => setVal(o.name, v)} optional />)}
            </>}
          </div>
        ) : (
          <textarea className="cmdinput cli-custom" value={customText} onChange={e => setCustomText(e.target.value)}
            placeholder="oci compute instance launch --compartment-id ... " />
        )}

        {/* 최종 결과 */}
        <div className="cli-result">
          <div className="cli-result-hd">
            <span className="px">최종 명령</span>
            <button className="submitbtn" onClick={copy}>복사</button>
            <button className="donebtn" style={{ marginTop: 0 }} onClick={addFav}>★ 즐겨찾기 저장</button>
          </div>
          <pre className="cli-output">{cli}</pre>
        </div>
      </main>
    </div>
  )
}

// enum → dropdown / bool → dropdown / json → textarea / 그 외 → input
function Field({ o, value, onChange, optional }: { o: CliOption; value: string; onChange: (v: string) => void; optional?: boolean }) {
  const label = (
    <label className={`cli-field-label${optional ? ' optional' : ''}`}>
      <code>{o.name}</code>
      {o.required && <span className="req">*</span>}
      {o.help && <span className="cli-field-help">{o.help}</span>}
    </label>
  )
  if (o.choices && o.choices.length) {
    return (
      <div className="cli-field">
        {label}
        <select className="cli-input" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">(선택 안 함)</option>
          {o.choices.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    )
  }
  if (o.type === 'json') {
    return (
      <div className="cli-field">
        {label}
        <textarea className="cli-input cli-json" value={value} placeholder={o.placeholder || '{ }'} onChange={e => onChange(e.target.value)} />
      </div>
    )
  }
  return (
    <div className="cli-field">
      {label}
      <input className="cli-input" value={value} placeholder={o.placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
