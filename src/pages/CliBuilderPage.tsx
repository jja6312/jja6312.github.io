import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHub } from '../store'
import { getPat, getFile, putFile, explainGhError } from '../lib/githubDb'
import catalog from '../data/cliCatalog.json'

interface CliOption {
  name: string
  required: boolean
  console?: boolean          // CLI 스키마상 optional 이지만 콘솔 기준 필수 (승격)
  multi?: boolean            // 여러 값 입력(줄바꿈/콤마) → 전용 빌더에서 for 루프
  type: string
  choices: string[] | null
  help: string
  placeholder: string
}
interface CliSection { label: string; options: CliOption[] }
interface CliCommand {
  resource: string; label: string
  cmd: string; help: string
  crossCopy?: string         // 'boot-volume' | 'volume' — cross-tenancy 복사 전용 조립
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

/* ── JSON 옵션 서브필드 스키마 — 사용자는 값만 넣고 {} 는 자동 조립 ── */
interface JsonSubField { key: string; label: string; kind: 'text' | 'num' | 'bool' | 'strlist' | 'ssh'; ph?: string }
const JSONSPEC: Record<string, { list?: boolean; ph?: string; fields?: JsonSubField[] }> = {
  '--metadata': { fields: [
    { key: 'ssh_authorized_keys', label: 'SSH 공개키', kind: 'ssh', ph: 'ssh-rsa AAAA… (.pub 파일 업로드 또는 붙여넣기)' },
  ] },
  '--create-vnic-details': { fields: [
    { key: 'assignPublicIp', label: '공인 IP 할당', kind: 'bool' },
    { key: 'hostnameLabel', label: 'Hostname', kind: 'text', ph: 'web01' },
    { key: 'privateIp', label: '사설 IP (고정)', kind: 'text', ph: '10.0.1.10' },
    { key: 'nsgIds', label: 'NSG OCID (콤마 구분)', kind: 'strlist', ph: 'ocid1.networksecuritygroup…' },
  ] },
  '--shape-config': { fields: [
    { key: 'ocpus', label: 'OCPU 수', kind: 'num', ph: '1' },
    { key: 'memoryInGBs', label: '메모리(GB)', kind: 'num', ph: '16' },
  ] },
  '--shape-details': { fields: [
    { key: 'minimumBandwidthInMbps', label: '최소 대역폭(Mbps)', kind: 'num', ph: '10' },
    { key: 'maximumBandwidthInMbps', label: '최대 대역폭(Mbps)', kind: 'num', ph: '100' },
  ] },
  '--subnet-ids': { list: true, ph: 'ocid1.subnet… (콤마로 여러 개)' },
  '--nsg-ids': { list: true, ph: 'ocid1.networksecuritygroup… (콤마 구분)' },
  '--network-security-group-ids': { list: true, ph: 'ocid1.networksecuritygroup… (콤마 구분)' },
  '--security-list-ids': { list: true, ph: 'ocid1.securitylist… (콤마 구분)' },
  '--whitelisted-ips': { list: true, ph: '1.2.3.4, 5.6.7.8/29' },
}
const subKey = (opt: string, key: string) => `${opt}::${key}`

/* 서브필드 값 → JSON 문자열 (비면 '') */
function buildJsonValue(optName: string, values: Record<string, string>): string {
  const spec = JSONSPEC[optName]
  if (!spec) return ''
  if (spec.list) {
    const raw = (values[optName] ?? '').trim()
    if (!raw) return ''
    return JSON.stringify(raw.split(',').map(s => s.trim()).filter(Boolean))
  }
  const obj: Record<string, unknown> = {}
  for (const f of spec.fields ?? []) {
    const v = (values[subKey(optName, f.key)] ?? '').trim()
    if (!v) continue
    obj[f.key] = f.kind === 'num' ? Number(v)
      : f.kind === 'bool' ? v === 'true'
      : f.kind === 'strlist' ? v.split(',').map(s => s.trim()).filter(Boolean)
      : v
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : ''
}

interface Favorite { id: string; name: string; resource: string; values: Record<string, string>; dyn?: Record<string, boolean> }
const FAV_KEY = 'hub-cli-favorites'
const loadFavs = (): Favorite[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }
const saveFavs = (f: Favorite[]) => localStorage.setItem(FAV_KEY, JSON.stringify(f))

const isDynamic = (dyn: Record<string, boolean>, name: string) =>
  name in DYNAMIC ? (dyn[name] ?? true) : false

/* cross-tenancy 볼륨 복사 — 여러 원본 OCID 를 for 루프로 복사하고 원본 display name 을 유지.
   get(원본 이름) → create(대상 테넌시로 복사) → update(복사본 이름=원본). Admit/Endorse policy 전제. */
function buildCrossCopy(kind: string, values: Record<string, string>): string {
  const boot = kind === 'boot-volume'
  const srcOpt = boot ? '--source-boot-volume-id' : '--source-volume-id'
  const idOpt = boot ? '--boot-volume-id' : '--volume-id'
  const resCmd = boot ? 'bv boot-volume' : 'bv volume'
  const v = (k: string, dflt: string) => (values[k] || '').trim() || dflt
  const CONT = ' \\'                                  // 줄 끝 백슬래시(명령 이어짐)

  const profile = v('--profile', 'DEFAULT')
  const region = v('--region', '<region>')
  const comp = v('--compartment-id', '<dest-compartment-ocid>')
  const srcProfile = v('--source-profile', '<source-profile>')
  const srcTenancy = v('--source-tenancy-id', '<source-tenancy-ocid>')
  const srcGroupName = v('--source-group-name', '<source-group-name>')
  const srcGroupId = v('--source-group-id', '<source-group-ocid>')
  const destTenancy = v('--dest-tenancy-id', '<dest-tenancy-ocid>')
  const pname = v('--policy-name', 'cross-tenancy-volume')

  const srcs = (values[srcOpt] || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
  const list = srcs.length ? srcs : ['<source-ocid-1>', '<source-ocid-2>']

  // 원본 조회(Get) + 대상 생성(Create) 을 볼륨·부트볼륨 양쪽에 허용
  const ops = [
    "request.operation='GetVolume'", "request.operation='CreateVolume'",
    "request.operation='GetBootVolume'", "request.operation='CreateBootVolume'",
  ].join(', ')

  return [
    '#############################################',
    '# 0) 공통 변수',
    '#############################################',
    `SRC_PROFILE=${srcProfile}      # 원본(주는) 테넌시 프로파일`,
    `SRC_TENANCY=${srcTenancy}`,
    `SRC_GROUP_NAME=${srcGroupName}`,
    `SRC_GROUP_ID=${srcGroupId}`,
    `PROFILE=${profile}             # 대상(받는) 테넌시 프로파일`,
    `DEST_TENANCY=${destTenancy}`,
    `REGION=${region}`,
    `COMPARTMENT=${comp}            # 대상 compartment`,
    '',
    '#############################################',
    '# 1) 대상 테넌시 — Endorse policy (최초 1회)',
    '#############################################',
    "cat > /tmp/endorse-stmts.json <<'EOF'",
    '[',
    `  "Define tenancy DestTenancy as ${destTenancy}",`,
    `  "Endorse group ${srcGroupName} to use volumes in tenancy DestTenancy where ANY { ${ops} }"`,
    ']',
    'EOF',
    '',
    'oci iam policy create' + CONT,
    '  --compartment-id "$DEST_TENANCY"' + CONT,
    `  --name ${pname}-endorse` + CONT,
    '  --description "cross-tenancy volume copy - endorse"' + CONT,
    '  --statements file:///tmp/endorse-stmts.json' + CONT,
    '  --profile "$PROFILE"',
    '',
    '#############################################',
    '# 2) 원본 테넌시 — Admit policy (최초 1회)',
    '#############################################',
    "cat > /tmp/admit-stmts.json <<'EOF'",
    '[',
    `  "Define tenancy SourceTenancy as ${srcTenancy}",`,
    `  "Define group SourceGroup as ${srcGroupId}",`,
    `  "Admit group SourceGroup of tenancy SourceTenancy to use volumes in tenancy where ANY { ${ops} }"`,
    ']',
    'EOF',
    '',
    'oci iam policy create' + CONT,
    '  --compartment-id "$SRC_TENANCY"' + CONT,
    `  --name ${pname}-admit` + CONT,
    '  --description "cross-tenancy volume copy - admit"' + CONT,
    '  --statements file:///tmp/admit-stmts.json' + CONT,
    '  --profile "$SRC_PROFILE"',
    '',
    '# policy 전파에 수 분 걸릴 수 있다 — 3) 에서 NotAuthorized 면 잠시 후 재시도',
    '',
    '#############################################',
    `# 3) ${boot ? 'Boot Volume' : 'Block Volume'} 복사 (원본 이름 유지)`,
    '#############################################',
    'SOURCES=(',
    ...list.map(s => `  ${s}`),
    ')',
    '',
    'for SRC in "${SOURCES[@]}"; do',
    '  # 3-1) 원본 display name 조회 (Endorse/Admit 의 Get 권한 사용)',
    `  NAME=$(oci ${resCmd} get ${idOpt} "$SRC" --profile "$PROFILE" --region "$REGION"` + CONT,
    `    --query 'data."display-name"' --raw-output)`,
    '  # 3-2) 대상 테넌시로 복사',
    `  NEW=$(oci ${resCmd} create --profile "$PROFILE" --region "$REGION"` + CONT,
    `    ${srcOpt} "$SRC" --compartment-id "$COMPARTMENT"` + CONT,
    `    --wait-for-state AVAILABLE --query 'data.id' --raw-output)`,
    '  # 3-3) 복사본 이름을 원본과 동일하게',
    `  oci ${resCmd} update ${idOpt} "$NEW" --display-name "$NAME"` + CONT,
    '    --profile "$PROFILE" --region "$REGION"',
    '  echo "copied $SRC -> $NEW ($NAME)"',
    'done',
  ].join('\n')
}

/* 최종 명령 조립 — 동적 옵션은 변수 선언(prelude) + 참조로 */
function buildCli(cmd: CliCommand, values: Record<string, string>, dyn: Record<string, boolean>): string {
  if (cmd.crossCopy) return buildCrossCopy(cmd.crossCopy, values)

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
    // JSON 서브필드 스펙 — 값이 조립되면 넣고, 비면 생략
    if (JSONSPEC[o.name]) {
      const j = buildJsonValue(o.name, values)
      if (j) args.push(`  ${o.name} '${j}'`)
      continue
    }
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
// cross-tenancy 복사 — 카테고리 밖, Custom 과 같은 최상위 레벨
const CROSS_COMMANDS = Object.values(CAT.commands).filter(c => c.crossCopy)

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
  const [outOpen, setOutOpen] = useState(true)          // 최종 명령 접기/펼치기
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



  // cross-tenancy 복사 화면에선 동적 조회 비활성 — compartment 등은 OCID 직접 입력
  const noDyn = !!cmd?.crossCopy
  const field = (o: CliOption, optional?: boolean) => (
    <Field key={o.name} o={o} value={values[o.name] || ''} onChange={v => setVal(o.name, v)} optional={optional}
      dynamic={!noDyn && isDynamic(dyn, o.name)}
      onToggleDynamic={!noDyn && o.name in DYNAMIC ? (on => setDyn(s => ({ ...s, [o.name]: on }))) : undefined}
      subVal={k => values[subKey(o.name, k)] || ''}
      onSub={(k, v) => setVal(subKey(o.name, k), v)} />
  )

  return (
    <div className="cli-layout">
      {/* 좌측 계층 네비 — 대분류 아코디언 (기본 닫힘) */}
      <aside className="cli-nav">
        <button className={`cli-navitem custom${active === '__custom' ? ' on' : ''}`} onClick={() => setActive('__custom')}>
          <span className="px">Custom</span>
        </button>
        {CROSS_COMMANDS.map(c => (
          <button key={c.resource} className={`cli-navitem custom${active === c.resource ? ' on' : ''}${isVerified(c.resource) ? ' verified' : ''}`}
            onClick={() => selectResource(c.resource)}>
            <span className="px">{c.label}</span>
            {isVerified(c.resource) && <span className="cli-vmark" title="검증됨">✓</span>}
          </button>
        ))}
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

        {cmd?.crossCopy && (
          <div className="cross-note">
            최종 명령에 <b>대상 테넌시 Endorse policy</b> → <b>원본 테넌시 Admit policy</b> → 복사 루프가 모두 포함됩니다.
            policy 는 최초 1회만 실행하면 되고, 전파에 수 분 걸릴 수 있습니다.
          </div>
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
            <button className="cli-out-toggle" onClick={() => setOutOpen(o => !o)}>
              {outOpen ? '▾' : '▸'} 최종 명령
            </button>
            <div className="cli-result-actions">
              <button className="submitbtn" onClick={copy}>복사</button>
              <button className="donebtn" style={{ marginTop: 0 }} onClick={addFav}>즐겨찾기 저장</button>
            </div>
          </div>
          {outOpen && <pre className="cli-output">{cli}</pre>}
        </div>
      </main>
    </div>
  )
}

function Field({ o, value, onChange, optional, dynamic, onToggleDynamic, subVal, onSub }: {
  o: CliOption; value: string; onChange: (v: string) => void; optional?: boolean
  dynamic: boolean; onToggleDynamic?: (on: boolean) => void
  subVal: (key: string) => string; onSub: (key: string, v: string) => void
}) {
  const dynMeta = DYNAMIC[o.name]
  const label = (
    <label className={`cli-field-label${optional ? ' optional' : ''}`}>
      <code>{o.name}</code>
      {o.required && <span className="req">*</span>}
      {o.console && <span className="cli-console-req px">필수</span>}
      {onToggleDynamic && (
        <span className="cli-dyn-toggle" title={dynMeta.note}>
          <input type="checkbox" checked={dynamic} onChange={e => onToggleDynamic(e.target.checked)} />
          동적 조회
        </span>
      )}
      <span className="cli-field-help">{dynamic && dynMeta ? dynMeta.note : o.help}</span>
    </label>
  )
  if (o.multi) {
    return (
      <div className="cli-field">
        {label}
        <textarea className="cli-input cli-json" value={value} rows={4}
          placeholder={`${o.placeholder}\n… 여러 개는 줄바꿈 또는 콤마로 구분 (각각 for 루프로 복사)`}
          onChange={e => onChange(e.target.value)} />
      </div>
    )
  }
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
  const spec = JSONSPEC[o.name]
  if (spec?.list) {
    return (
      <div className="cli-field">
        {label}
        <input className="cli-input" value={value} placeholder={spec.ph} onChange={e => onChange(e.target.value)} />
      </div>
    )
  }
  if (spec?.fields) {
    return (
      <div className="cli-field">
        {label}
        <div className="cli-json-group">
          {spec.fields.map(f => (
            <div key={f.key} className="cli-subfield">
              <span className="cli-sublabel">{f.label}</span>
              {f.kind === 'bool' ? (
                <select className="cli-input" value={subVal(f.key)} onChange={e => onSub(f.key, e.target.value)}>
                  <option value="">(미설정)</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : f.kind === 'ssh' ? (
                <div className="cli-sshrow">
                  <label className="cli-filebtn">
                    파일 업로드
                    <input type="file" accept=".pub,.txt,.pem,text/plain" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) file.text().then(txt => onSub(f.key, txt.trim()))
                        e.target.value = ''
                      }} />
                  </label>
                  <input className="cli-input" value={subVal(f.key)} placeholder={f.ph}
                    onChange={e => onSub(f.key, e.target.value)} />
                </div>
              ) : (
                <input className="cli-input" value={subVal(f.key)} placeholder={f.ph}
                  onChange={e => onSub(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
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
