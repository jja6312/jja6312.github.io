export type MobaSession = {
  id: string
  folder: string
  name: string
  host: string
  port: string
  user: string
  keyPath: string
  bastionHost: string
  bastionPort: string
  bastionUser: string
  bastionKeyPath: string
}

export const emptyMobaSession = (): MobaSession => ({
  id: crypto.randomUUID(), folder: '', name: '', host: '', port: '22', user: 'opc', keyPath: '',
  bastionHost: '', bastionPort: '22', bastionUser: 'opc', bastionKeyPath: '',
})

const aliases: Record<Exclude<keyof MobaSession, 'id'>, string[]> = {
  folder: ['folder', '폴더'], name: ['name', 'session', 'session_name', '세션명', '이름'],
  host: ['host', 'hostname', 'ip', '호스트', '아이피'], port: ['port', '포트'],
  user: ['user', 'username', '사용자', '계정'], keyPath: ['key_path', 'keypath', 'key', 'private_key', '키경로', '키'],
  bastionHost: ['bastion_host', 'bastionhost', 'bastion', 'jump_host', '점프호스트', '배스천호스트'],
  bastionPort: ['bastion_port', 'bastionport', 'jump_port', '점프포트', '배스천포트'],
  bastionUser: ['bastion_user', 'bastionuser', 'jump_user', '점프사용자', '배스천사용자'],
  bastionKeyPath: ['bastion_key_path', 'bastionkeypath', 'bastion_key', 'jump_key', '점프키경로', '배스천키경로'],
}

const text = (value: unknown) => value == null ? '' : String(value).trim()

function fromRecord(row: Record<string, unknown>): MobaSession {
  const lowered = new Map(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]))
  const result = emptyMobaSession()
  for (const [field, names] of Object.entries(aliases) as [keyof typeof aliases, string[]][]) {
    const found = names.map(name => lowered.get(name.toLowerCase())).find(value => value !== undefined)
    if (found !== undefined) result[field] = text(found)
  }
  result.folder = result.folder.replaceAll('/', '\\').replace(/^\\+|\\+$/g, '')
  result.port ||= '22'; result.user ||= 'opc'; result.bastionPort ||= '22'; result.bastionUser ||= 'opc'
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
    if (!session.name) issues.push(`${label}: 세션명이 비어 있습니다.`)
    if (!session.host) issues.push(`${label}: 호스트가 비어 있습니다.`)
    if (!validPort(session.port)) issues.push(`${label}: 포트는 1~65535여야 합니다.`)
    if (session.bastionHost && !validPort(session.bastionPort)) issues.push(`${label}: 점프 포트는 1~65535여야 합니다.`)
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

export function buildMobaLine(session: MobaSession) {
  const hasBastion = Boolean(session.bastionHost)
  const bPort = hasBastion ? session.bastionPort : ''
  const bUser = hasBastion ? session.bastionUser : ''
  const bKey = hasBastion ? (session.bastionKeyPath || session.keyPath) : ''
  return `${session.name}=#109#0%${session.host}%${session.port}%${session.user}%%-1%-1%%${session.bastionHost}%${bPort}%${bUser}%0%0%0%${session.keyPath}%${bKey}%-1%0%0%0%%1080%%0%0%1%%0%%%%0%-1%-1%0#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1%0%#0# #-1`
}

export function renderMobaExport(sessions: MobaSession[]) {
  const groups = new Map<string, MobaSession[]>()
  sessions.forEach(session => groups.set(session.folder, [...(groups.get(session.folder) ?? []), session]))
  return [...groups.entries()].map(([folder, items], index) => [
    index ? `[Bookmarks_${index}]` : '[Bookmarks]', `SubRep=${folder}`, 'ImgNum=41',
    ...items.map(buildMobaLine), '',
  ].join('\r\n')).join('\r\n')
}

export const mobaTemplate = `folder\tname\thost\tport\tuser\tkey_path\tbastion_host\tbastion_port\tbastion_user\tbastion_key_path\nwizocm\\production\tapp-01\t10.0.1.10\t22\topc\tC:\\keys\\wizocm.key\t203.0.113.10\t22\topc\tC:\\keys\\bastion.key`
