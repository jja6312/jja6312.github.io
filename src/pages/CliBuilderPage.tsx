import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHub } from '../store'
import { getPat, getFile, putFile, explainGhError } from '../lib/githubDb'
import catalog from '../data/cliCatalog.json'

interface CliOption {
  name: string
  required: boolean
  console?: boolean          // CLI 스키마상 optional 이지만 콘솔 기준 필수 (승격)
  type: string
  choices: string[] | null
  help: string
  placeholder: string
}
interface CliSection { label: string; options: CliOption[] }
interface CliCommand {
  resource: string; label: string
  cmd: string; help: string
  sections: CliSection[]; advanced: CliOption[]
}
// 조립·검색용 평탄화 — 섹션 순서(콘솔 마법사 순서)를 그대로 유지
const allOptions = (c: CliCommand): CliOption[] => [...c.sections.flatMap(s => s.options), ...c.advanced]
interface Catalog {
  categories: { id: string; label: string; groups: { label: string; resources: string[] }[] }[]
  commands: Record<string, CliCommand>
}
const CAT = catalog as unknown as Catalog

/* ── 동적 조회 지원 옵션 — 이름만 넣으면 $()/변수로 OCID를 찾아준다 ──
   기본값 = 동적. 체크 해제 시 OCID 직접 입력. */
const DYNAMIC: Record<string, { input: string; note: string }> = {
  '--compartment-id': { input: 'compartment 이름 (예: prod)', note: '이름으로 OCID 자동 조회' },
  '--availability-domain': { input: 'AD 번호 1~3 (기본 1)', note: '번호로 AD 이름 자동 조회' },
  '--vcn-id': { input: 'VCN 이름', note: '이름으로 OCID 자동 조회 (compartment 기준)' },
  '--subnet-id': { input: 'Subnet 이름', note: '이름으로 OCID 자동 조회 (compartment 기준)' },
}

interface Favorite { id: string; name: string; resource: string; values: Record<string, string>; dyn?: Record<string, boolean> }
const FAV_KEY = 'hub-cli-favorites'
const loadFavs = (): Favorite[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }
const saveFavs = (f: Favorite[]) => localStorage.setItem(FAV_KEY, JSON.stringify(f))

const isDynamic = (dyn: Record<string, boolean>, name: string) =>
  name in DYNAMIC ? (dyn[name] ?? true) : false

/* 최종 명령 조립 — 동적 옵션은 변수 선언(prelude) + 참조로 */
function buildCli(cmd: CliCommand, values: Record<string, string>, dyn: Record<string, boolean>): string {
  const prelude: string[] = []
  const args: string[] = []

  const compDynamic = allOptions(cmd).some(o => o.name === '--compartment-id') && isDynamic(dyn, '--compartment-id')
  const compStatic = (values['--compartment-id'] ?? '').trim()
  // 다른 동적 조회가 참조할 compartment 표현
  const compRef = compDynamic ? '"$COMP"' : (compStatic ? compStatic : '<compartment-ocid>')

  if (compDynamic) {
    const name = compStatic || '<compartment-name>'
    prelude.push(
      `COMP=$(oci iam compartment list --compartment-id-in-subtree true --all \\\n` +
      `  --query "data[?name=='${name}'].id | [0]" --raw-output)`,
    )
  }

  for (const o of allOptions(cmd)) {
    const v = (values[o.name] ?? '').trim()
    // 값 없는 선택 옵션은 동적 모드여도 생략 — 명령을 어지럽히지 않는다
    if (!o.required && !v) continue
    if (o.name === '--compartment-id') {
      if (compDynamic) args.push(`  ${o.name} "$COMP"`)
      else if (v) args.push(`  ${o.name} ${v}`)
      continue
    }
    if (o.name === '--availability-domain' && isDynamic(dyn, o.name)) {
      const n = Math.max(1, parseInt(v || '1', 10) || 1)
      args.push(`  ${o.name} $(oci iam availability-domain list --compartment-id ${compRef} --query "data[${n - 1}].name" --raw-output)`)
      continue
    }
    if (o.name === '--vcn-id' && isDynamic(dyn, o.name)) {
      const name = v || '<vcn-name>'
      prelude.push(
        `VCN=$(oci network vcn list --compartment-id ${compRef} \\\n` +
        `  --query "data[?\\"display-name\\"=='${name}'].id | [0]" --raw-output)`,
      )
      args.push(`  ${o.name} "$VCN"`)
      continue
    }
    if (o.name === '--subnet-id' && isDynamic(dyn, o.name)) {
      const name = v || '<subnet-name>'
      prelude.push(
        `SUBNET=$(oci network subnet list --compartment-id ${compRef} \\\n` +
        `  --query "data[?\\"display-name\\"=='${name}'].id | [0]" --raw-output)`,
      )
      args.push(`  ${o.name} "$SUBNET"`)
      continue
    }
    if (!v) continue
    const quoted = /\s|[{}$]/.test(v) ? `'${v}'` : v
    args.push(`  ${o.name} ${quoted}`)
  }

  const main = [cmd.cmd, ...args].join(' \\\n')
  return prelude.length ? prelude.join('\n\n') + '\n\n' + main : main
}

const catOfResource = (r: string) =>
  CAT.categories.find(c => c.groups.some(g => g.resources.includes(r)))?.id

export default function CliBuilderPage() {
  const { showToast } = useHub()
  const [sp] = useSearchParams()
  const rParam = sp.get('r')                                  // Ctrl+K 딥링크: ?r=<resource>
  const initial = rParam && CAT.commands[rParam] ? rParam : '__custom'
  const [active, setActive] = useState<string>(initial)
  const [values, setValues] = useState<Record<string, string>>({})
  const [dyn, setDyn] = useState<Record<string, boolean>>({})
  const [customText, setCustomText] = useState('oci ')
  const [favs, setFavs] = useState<Favorite[]>(loadFavs())
  const [showOptional, setShowOptional] = useState(false)
  // 딥링크로 들어온 자원의 카테고리는 펼쳐 둔다 (그 외는 닫힘)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    const cat = rParam && CAT.commands[rParam] ? catOfResource(rParam) : undefined
    return cat ? { [cat]: true } : {}
  })

  // 팔레트에서 ?r 이 바뀌며 재진입하면 해당 자원 선택 + 카테고리 펼침
  useEffect(() => {
    if (!rParam || !CAT.commands[rParam]) return
    setActive(rParam); setValues({}); setDyn({}); setShowOptional(false)
    const cat = catOfResource(rParam)
    if (cat) setOpenCats(s => ({ ...s, [cat]: true }))
  }, [rParam])

  // 검증 상태 — 내가 직접 실행해 확인한 명령만 파란색. blog-db knowledge/oci-cli/verified.json 공유.
  const pat = getPat()
  const [verified, setVerified] = useState<string[]>([])
  const vShaRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!pat) return
    getFile(pat, 'knowledge/oci-cli/verified.json').then(f => {
      if (f) { vShaRef.current = f.sha; try { setVerified(JSON.parse(f.content).verified ?? []) } catch { /* keep */ } }
    }).catch(() => { /* 미생성/권한없음 → 빈 목록 */ })
  }, [pat])
  const isVerified = (r: string) => verified.includes(r)
  const toggleVerified = async (r: string) => {
    if (!pat) { showToast('검증 표시는 PAT 등록 후 가능'); return }
    const prev = verified
    const next = verified.includes(r) ? verified.filter(x => x !== r) : [...verified, r]
    setVerified(next)
    try {
      vShaRef.current = await putFile(pat, 'knowledge/oci-cli/verified.json',
        JSON.stringify({ verified: next }, null, 2) + '\n', 'cli: 검증 상태 갱신', vShaRef.current)
    } catch (e) { showToast(`저장 실패: ${explainGhError(e)}`); setVerified(prev) }
  }

  const cmd = active !== '__custom' ? CAT.commands[active] : null
  const cli = useMemo(() => cmd ? buildCli(cmd, values, dyn) : customText, [cmd, values, dyn, customText])

  const selectResource = (res: string) => {
    setActive(res); setValues({}); setDyn({}); setShowOptional(false)
  }
  const setVal = (name: string, v: string) => setValues(s => ({ ...s, [name]: v }))
  const toggleCat = (id: string) => setOpenCats(s => ({ ...s, [id]: !s[id] }))

  const copy = async () => {
    try { await navigator.clipboard.writeText(cli); showToast('클립보드에 복사됨') }
    catch { showToast('복사 실패 — 수동 선택') }
  }

  const addFav = () => {
    const name = prompt('즐겨찾기 이름', cmd ? `${cmd.label} ${values['--display-name'] || ''}`.trim() : 'custom')
    if (!name) return
    const fav: Favorite = {
      id: `fav-${favs.length}-${name}`, name, resource: active,
      values: active === '__custom' ? { __custom: customText } : values, dyn,
    }
    const next = [...favs, fav]; setFavs(next); saveFavs(next); showToast('즐겨찾기 저장됨')
  }
  const loadFav = (f: Favorite) => {
    if (f.resource === '__custom') { setActive('__custom'); setCustomText(f.values.__custom || 'oci ') }
    else { setActive(f.resource); setValues(f.values); setDyn(f.dyn ?? {}); setShowOptional(true) }
  }
  const delFav = (id: string) => { const n = favs.filter(f => f.id !== id); setFavs(n); saveFavs(n) }



  const field = (o: CliOption, optional?: boolean) => (
    <Field key={o.name} o={o} value={values[o.name] || ''} onChange={v => setVal(o.name, v)} optional={optional}
      dynamic={isDynamic(dyn, o.name)}
      onToggleDynamic={o.name in DYNAMIC ? (on => setDyn(s => ({ ...s, [o.name]: on }))) : undefined} />
  )

  return (
    <div className="cli-layout">
      {/* 좌측 계층 네비 — 대분류 아코디언 (기본 닫힘) */}
      <aside className="cli-nav">
        <button className={`cli-navitem custom${active === '__custom' ? ' on' : ''}`} onClick={() => setActive('__custom')}>
          <span className="px">Custom</span>
        </button>
        {CAT.categories.map(c => (
          <div key={c.id} className="cli-cat">
            <button className="cli-cat-toggle" onClick={() => toggleCat(c.id)}>
              <span className={`caret${openCats[c.id] ? ' open' : ''}`}>▸</span> {c.label}
            </button>
            {openCats[c.id] && c.groups.map(g => (
              <div key={g.label} className="cli-group">
                <div className="cli-group-label px">{g.label}</div>
                {g.resources.map(r => (
                  <button key={r} className={`cli-navitem${active === r ? ' on' : ''}${isVerified(r) ? ' verified' : ''}`} onClick={() => selectResource(r)}>
                    {CAT.commands[r].label}
                    {isVerified(r) && <span className="cli-vmark" title="검증됨">✓</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
        {favs.length > 0 && (
          <div className="cli-cat">
            <div className="cli-cat-label px">FAVORITES</div>
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
        <h1 className={`sheet-h1${cmd && isVerified(active) ? ' cli-verified' : ''}`}>{cmd ? cmd.label : 'Custom 명령'}</h1>
        {cmd
          ? <p className="cli-help">{cmd.help}</p>
          : <p className="cli-help">자유 입력 — 직접 작성하거나, 왼쪽에서 자원을 골라 폼으로 만드세요. 저장하면 즐겨찾기로 재사용됩니다.</p>}
        {cmd && (
          <label className="cli-verify">
            <input type="checkbox" checked={isVerified(active)} onChange={() => toggleVerified(active)} />
            <span>내가 직접 실행해 확인함 — 확인 전 명령은 모두 의심 대상, 확인하면 <b className="cli-verified">파란색</b>으로 표시</span>
          </label>
        )}

        {cmd ? (
          <div className="cli-form">
            {cmd.sections.map(sec => (
              <div key={sec.label} className="cli-sec">
                <div className="cli-section-label px">{sec.label}</div>
                {sec.options.map(o => field(o, !o.required))}
              </div>
            ))}
            {cmd.advanced.length > 0 && <>
              <button className="cli-optional-toggle" onClick={() => setShowOptional(s => !s)}>
                {showOptional ? '▾' : '▸'} 고급 옵션 {cmd.advanced.length}개 (태그·대기 등) {showOptional ? '접기' : '펼치기'}
              </button>
              {showOptional && cmd.advanced.map(o => field(o, true))}
            </>}
          </div>
        ) : (
          <textarea className="cmdinput cli-custom" value={customText} onChange={e => setCustomText(e.target.value)}
            placeholder="oci compute instance launch --compartment-id ... " />
        )}

        <div className="cli-result">
          <div className="cli-result-hd">
            <span className="px">최종 명령</span>
            <button className="submitbtn" onClick={copy}>복사</button>
            <button className="donebtn" style={{ marginTop: 0 }} onClick={addFav}>즐겨찾기 저장</button>
          </div>
          <pre className="cli-output">{cli}</pre>
        </div>
      </main>
    </div>
  )
}

function Field({ o, value, onChange, optional, dynamic, onToggleDynamic }: {
  o: CliOption; value: string; onChange: (v: string) => void; optional?: boolean
  dynamic: boolean; onToggleDynamic?: (on: boolean) => void
}) {
  const dynMeta = DYNAMIC[o.name]
  const label = (
    <label className={`cli-field-label${optional ? ' optional' : ''}`}>
      <code>{o.name}</code>
      {o.required && <span className="req">*</span>}
      {o.console && <span className="cli-console-req px">콘솔 필수</span>}
      {onToggleDynamic && (
        <span className="cli-dyn-toggle" title={dynMeta.note}>
          <input type="checkbox" checked={dynamic} onChange={e => onToggleDynamic(e.target.checked)} />
          동적 조회
        </span>
      )}
      <span className="cli-field-help">{dynamic && dynMeta ? dynMeta.note : o.help}</span>
    </label>
  )
  if (!dynamic && o.choices && o.choices.length) {
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
  if (!dynamic && o.type === 'json') {
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
      <input className="cli-input" value={value}
        placeholder={dynamic && dynMeta ? dynMeta.input : o.placeholder}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}
