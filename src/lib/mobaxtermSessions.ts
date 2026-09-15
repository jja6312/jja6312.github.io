export type MobaSessionType = 'ssh' | 'rdp'

export type MobaSession = {
  id: string
  type: MobaSessionType
  folder: string
  name: string
  host: string
  port: string
  user: string
  keyPath: string
  domain: string
  bastionHost: string
  bastionPort: string
  bastionUser: string
  bastionKeyPath: string
}

// 타입별 기본값 — 포트는 SSH 22 / RDP 3389, 사용자는 공통 opc (OCI 는 RDP 도 opc 로 접속).
export const defaultPort = (type: MobaSessionType) => (type === 'rdp' ? '3389' : '22')
export const defaultUser = (_type: MobaSessionType) => 'opc'

export const emptyMobaSession = (type: MobaSessionType = 'ssh'): MobaSession => ({
  id: crypto.randomUUID(), type, folder: '', name: '', host: '', port: defaultPort(type), user: defaultUser(type),
  keyPath: '', domain: '', bastionHost: '', bastionPort: '22', bastionUser: 'opc', bastionKeyPath: '',
})

const aliases: Record<Exclude<keyof MobaSession, 'id'>, string[]> = {
  type: ['type', 'protocol', 'kind', '종류', '유형', '프로토콜'],
  folder: ['folder', '폴더'], name: ['name', 'session', 'session_name', '세션명', '이름'],
  host: ['host', 'hostname', 'ip', '호스트', '아이피'], port: ['port', '포트'],
  user: ['user', 'username', '사용자', '계정'], keyPath: ['key_path', 'keypath', 'key', 'private_key', '키경로', '키'],
  domain: ['domain', '도메인'],
  bastionHost: ['bastion_host', 'bastionhost', 'bastion', 'jump_host', '점프호스트', '배스천호스트'],
  bastionPort: ['bastion_port', 'bastionport', 'jump_port', '점프포트', '배스천포트'],
  bastionUser: ['bastion_user', 'bastionuser', 'jump_user', '점프사용자', '배스천사용자'],
  bastionKeyPath: ['bastion_key_path', 'bastionkeypath', 'bastion_key', 'jump_key', '점프키경로', '배스천키경로'],
}

const text = (value: unknown) => value == null ? '' : String(value).trim()

const normalizeType = (value: string): MobaSessionType =>
  /^(rdp|remote\s*desktop|windows|win|원격|윈도우)$/i.test(value.trim()) ? 'rdp' : 'ssh'

function fromRecord(row: Record<string, unknown>): MobaSession {
  const lowered = new Map(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]))
  const pick = (names: string[]) => names.map(name => lowered.get(name.toLowerCase())).find(value => value !== undefined)
  const type = normalizeType(text(pick(aliases.type)))
  const result = emptyMobaSession(type)
  for (const [field, names] of Object.entries(aliases) as [keyof typeof aliases, string[]][]) {
    if (field === 'type') continue
    const found = pick(names)
    if (found !== undefined) result[field] = text(found)
  }
  result.folder = result.folder.replaceAll('/', '\\').replace(/^\\+|\\+$/g, '')
  result.port ||= defaultPort(type); result.user ||= defaultUser(type)
  result.bastionPort ||= '22'; result.bastionUser ||= 'opc'
  return result
}

function splitDelimitedLine(line: string, delimiter: string) {
  if (delimiter === '\t') return line.split('\t')
  const cells: string[] = []; let cell = ''; let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && quoted && line[index + 1] === '"') { cell += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { cells.push(cell); cell = '' }
    else cell += char
  }
  cells.push(cell); return cells
}

export function parseMobaInput(raw: string): MobaSession[] {
  const value = raw.trim()
  if (!value) throw new Error('JSON 또는 Excel에서 복사한 행을 붙여넣으세요.')
  if (value.startsWith('{') || value.startsWith('[')) {
    const parsed: unknown = JSON.parse(value)
    const rows = Array.isArray(parsed) ? parsed : (parsed as { sessions?: unknown }).sessions
    if (!Array.isArray(rows)) throw new Error('JSON은 배열 또는 sessions 배열을 포함해야 합니다.')
    return rows.map(row => fromRecord(row as Record<string, unknown>))
  }
  const lines = value.split(/\r?\n/).filter(Boolean)
  const delimiter = lines[0]?.includes('\t') ? '\t' : ','
  const headers = splitDelimitedLine(lines.shift() ?? '', delimiter).map(item => item.trim())
  if (!headers.length) throw new Error('첫 행에 열 이름이 필요합니다.')
  return lines.map(line => fromRecord(Object.fromEntries(splitDelimitedLine(line, delimiter).map((cell, index) => [headers[index], cell]))))
}

const forbidden = /[\r\n=[\]]/
const validPort = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535

export function validateMobaSessions(sessions: MobaSession[]): string[] {
  const issues: string[] = []; const seen = new Set<string>()
  sessions.forEach((session, index) => {
    const label = `${index + 1}행`
    if (session.type !== 'ssh' && session.type !== 'rdp') issues.push(`${label}: 세션 종류는 ssh 또는 rdp 여야 합니다.`)
    if (!session.name) issues.push(`${label}: 세션명이 비어 있습니다.`)
    if (!session.host) issues.push(`${label}: 호스트가 비어 있습니다.`)
    if (!validPort(session.port)) issues.push(`${label}: 포트는 1~65535여야 합니다.`)
    if (session.type === 'ssh' && session.bastionHost && !validPort(session.bastionPort)) issues.push(`${label}: 점프 포트는 1~65535여야 합니다.`)
    for (const [field, value] of [['폴더', session.folder], ['세션명', session.name], ['호스트', session.host]] as const) {
      if (forbidden.test(value)) issues.push(`${label}: ${field}에 INI 예약문자를 사용할 수 없습니다.`)
    }
    const key = `${session.folder.toLowerCase()}\0${session.name.toLowerCase()}`
    if (seen.has(key)) issues.push(`${label}: 같은 폴더에 동일한 세션명이 있습니다.`)
    seen.add(key)
  })
  if (!sessions.length) issues.push('세션을 하나 이상 추가하세요.')
  return issues
}

// MobaXterm.ini 북마크의 세션 공통 후행부(터미널/폰트 표시 블록 + 아이콘 접미). 세션 타입과 무관하게 동일.
const MOBA_TRAILER = '#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1%0%#0# #-1'

// SSH 세션(#109#). MobaXterm 의 enabled=-1 / disabled=0 규약.
function buildSshLine(session: MobaSession) {
  const hasBastion = Boolean(session.bastionHost)
  const bPort = hasBastion ? session.bastionPort : ''
  const bUser = hasBastion ? session.bastionUser : ''
  const bKey = hasBastion ? (session.bastionKeyPath || session.keyPath) : ''
  const groupA = `0%${session.host}%${session.port}%${session.user}%%-1%-1%%${session.bastionHost}%${bPort}%${bUser}%0%0%0%${session.keyPath}%${bKey}%-1%0%0%0%%1080%%0%0%1%%0%%%%0%-1%-1%0`
  return `${session.name}=#109#${groupA}${MOBA_TRAILER}`
}

// RDP 세션(#91#). 필드 순서·기본값은 sessionator(Ruzgfpegk) MobaXterm/RDP.php 기준.
// 0:type=4 1:host 2:port 3:user 4:adminConsole 5-7:redirect ports/drives/printers
// 8:unk(-1) 9:enhGfx 10:resolution(fit) 11:unk(-1) 12:remoteCmd 13-15:sshGw host/port/user
// 16:audio 17:nativeAuth 18:sshGwKey 19:clipboard(-1) 20:rdpGateway 21:fwdKbd(-1) 22:settingsBar(-1)
// 23:unk 24:credSsp(-1) 25:mic 26:autoScale(-1) 27:zoom 28:colorDepth 29:smartCards 30:serverAuth
function buildRdpLine(session: MobaSession) {
  const login = session.domain ? `${session.domain}\\${session.user}` : session.user
  const groupA = [
    '4', session.host, session.port || '3389', login,
    '0', '0', '0', '0', '-1', '0', '0', '-1', '', '', '', '',
    '0', '0', '', '-1', '', '-1', '-1', '0', '-1', '0', '-1', '0', '0', '0', '0',
  ].join('%')
  return `${session.name}=#91#${groupA}${MOBA_TRAILER}`
}

export function buildMobaLine(session: MobaSession) {
  return session.type === 'rdp' ? buildRdpLine(session) : buildSshLine(session)
}

export function renderMobaExport(sessions: MobaSession[]) {
  const groups = new Map<string, MobaSession[]>()
  sessions.forEach(session => groups.set(session.folder, [...(groups.get(session.folder) ?? []), session]))
  return [...groups.entries()].map(([folder, items], index) => [
    index ? `[Bookmarks_${index}]` : '[Bookmarks]', `SubRep=${folder}`, 'ImgNum=41',
    ...items.map(buildMobaLine), '',
  ].join('\r\n')).join('\r\n')
}

export const mobaTemplate = `type\tfolder\tname\thost\tport\tuser\tkey_path\tdomain\tbastion_host\tbastion_port\tbastion_user\tbastion_key_path
ssh\twizocm\\production\tapp-01\t10.0.1.10\t22\topc\tC:\\keys\\wizocm.key\t\t203.0.113.10\t22\topc\tC:\\keys\\bastion.key
rdp\twizocm\\production\twin-db\t10.0.1.20\t3389\topc\t\tCORP\t\t\t\t`

// ── Excel(xlsx)/CSV 표 브리지 ──
export const SESSION_COLUMNS: [Exclude<keyof MobaSession, 'id'>, string][] = [
  ['type', 'type'], ['folder', 'folder'], ['name', 'name'], ['host', 'host'], ['port', 'port'], ['user', 'user'],
  ['keyPath', 'key_path'], ['domain', 'domain'], ['bastionHost', 'bastion_host'], ['bastionPort', 'bastion_port'],
  ['bastionUser', 'bastion_user'], ['bastionKeyPath', 'bastion_key_path'],
]

/** 세션 목록 → 2차원 배열(첫 행 헤더). xlsx/CSV 내보내기용. */
export function sessionsToAoa(sessions: MobaSession[]): string[][] {
  const headers = SESSION_COLUMNS.map(([, header]) => header)
  const rows = sessions.map(session => SESSION_COLUMNS.map(([key]) => String(session[key] ?? '')))
  return [headers, ...rows]
}

/** 2차원 배열(첫 행 헤더) → 세션 목록. 빈 행은 건너뛴다. 헤더 별칭은 fromRecord 가 처리. */
export function aoaToSessions(aoa: (string | number | null | undefined)[][]): MobaSession[] {
  if (!aoa.length) return []
  const headers = aoa[0].map(cell => String(cell ?? '').trim())
  return aoa.slice(1)
    .filter(row => row.some(cell => String(cell ?? '').trim() !== ''))
    .map(row => fromRecord(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))))
}

/** Excel 양식(헤더 + SSH·RDP 예시 2행). */
export function xlsxTemplateAoa(): string[][] {
  return [
    SESSION_COLUMNS.map(([, header]) => header),
    ['ssh', 'wizocm\\production', 'app-01', '10.0.1.10', '22', 'opc', 'C:\\keys\\wizocm.key', '', '203.0.113.10', '22', 'opc', ''],
    ['rdp', 'wizocm\\production', 'win-db', '10.0.1.20', '3389', 'opc', '', 'CORP', '', '', '', ''],
  ]
}

// ── MobaXterm .mxtsessions(.ini) → 세션 목록 (내보낸 파일을 다시 읽어들이거나 다른 PC 설정 로드) ──
export function parseMobaIni(text: string): MobaSession[] {
  const sessions: MobaSession[] = []
  let folder = ''
  for (const raw of String(text ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^\[Bookmarks(_\d+)?\]$/i.test(line)) { folder = ''; continue }
    const sub = /^SubRep=(.*)$/i.exec(line)
    if (sub) { folder = sub[1].trim(); continue }
    if (/^ImgNum=/i.test(line)) continue
    const match = /^(.+?)=#(109|91)#(.*)$/.exec(line)
    if (!match) continue
    const name = match[1].trim()
    const fields = match[3].split('#')[0].split('%')
    if (match[2] === '91') {
      let user = fields[3] ?? ''
      let domain = ''
      const slash = user.indexOf('\\')
      if (slash >= 0) { domain = user.slice(0, slash); user = user.slice(slash + 1) }
      sessions.push({ ...emptyMobaSession('rdp'), folder, name, host: fields[1] ?? '', port: fields[2] || '3389', user: user || defaultUser('rdp'), domain })
    } else {
      const keyPath = fields[14] ?? ''
      const bastionKey = fields[15] ?? ''
      sessions.push({
        ...emptyMobaSession('ssh'), folder, name, host: fields[1] ?? '', port: fields[2] || '22', user: fields[3] || defaultUser('ssh'),
        keyPath, bastionHost: fields[8] ?? '', bastionPort: fields[9] || '22', bastionUser: fields[10] || 'opc',
        bastionKeyPath: bastionKey && bastionKey !== keyPath ? bastionKey : '',
      })
    }
  }
  return sessions
}

// ── 세션 복제 (같은 폴더 내 고유 이름 보장) ──
export function cloneSession(session: MobaSession, existing: MobaSession[]): MobaSession {
  const taken = new Set(existing.filter(s => s.folder === session.folder).map(s => s.name.toLowerCase()))
  const base = `${session.name}-copy`
  let name = base
  for (let i = 2; taken.has(name.toLowerCase()); i += 1) name = `${base}${i}`
  return { ...session, id: crypto.randomUUID(), name }
}

// ── 작업 중인 세션 목록 저장/복원 (localStorage per-user) ──
const SESSIONS_KEY = 'moba:sessions'
export function loadStoredSessions(): MobaSession[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.map(item => {
      const stored = (item ?? {}) as Partial<MobaSession>
      const type: MobaSessionType = stored.type === 'rdp' ? 'rdp' : 'ssh'
      return { ...emptyMobaSession(type), ...stored, id: stored.id || crypto.randomUUID(), type }
    }).filter(session => session.name || session.host)
  } catch {
    return []
  }
}
export function storeSessions(sessions: MobaSession[]): void {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) } catch { /* per-user 저장소 사용 불가 — 무시 */ }
}
