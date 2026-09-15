// 의존성 없는 최소 .xlsx 읽기/쓰기 — 세션 표 왕복(내보내기·가져오기)용.
// 쓰기: 무압축(store) ZIP + inline string (Excel 이 그대로 연다).
// 읽기: 중앙 디렉터리 파싱 후 store 는 그대로, deflate 는 브라우저 네이티브 DecompressionStream 으로 해제.
// 리치텍스트·수식·다중시트 등은 다루지 않는다(첫 시트의 셀 텍스트만).

type Aoa = (string | number | null | undefined)[][]

// ── CRC32 ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()
function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ── ZIP (store only) ──
function zipStore(files: { name: string, data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const nameBytes = enc.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    parts.push(local, file.data)
    const dir = new Uint8Array(46 + nameBytes.length)
    const dv = new DataView(dir.buffer)
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true)
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0x21, true)
    dv.setUint32(16, crc, true); dv.setUint32(20, size, true); dv.setUint32(24, size, true)
    dv.setUint16(28, nameBytes.length, true)
    dv.setUint32(42, offset, true)
    dir.set(nameBytes, 46)
    central.push(dir)
    offset += local.length + file.data.length
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true)
  const all = [...parts, ...central, eocd]
  const total = all.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const chunk of all) { out.set(chunk, p); p += chunk.length }
  return out
}

function readZipEntries(buffer: ArrayBuffer): Map<string, { method: number, data: Uint8Array }> {
  const bytes = new Uint8Array(buffer)
  const dv = new DataView(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break } }
  if (eocd < 0) throw new Error('올바른 xlsx(zip) 파일이 아닙니다.')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const entries = new Map<string, { method: number, data: Uint8Array }>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count && p + 46 <= bytes.length; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOff = dv.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    const lNameLen = dv.getUint16(localOff + 26, true)
    const lExtraLen = dv.getUint16(localOff + 28, true)
    const start = localOff + 30 + lNameLen + lExtraLen
    entries.set(name, { method, data: bytes.subarray(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!DS) throw new Error('이 브라우저는 .xlsx 압축 해제를 지원하지 않습니다. Excel 에서 CSV 로 저장해 붙여넣으세요.')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function entryText(entry: { method: number, data: Uint8Array }): Promise<string> {
  const raw = entry.method === 8 ? await inflateRaw(entry.data) : entry.data
  return new TextDecoder().decode(raw)
}

// ── XML helpers ──
const unescapeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')
const escapeXml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
function colName(index: number): string {
  let s = ''; let i = index + 1
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) }
  return s
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let s = ''
    for (const t of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += unescapeXml(t[1])
    out.push(s)
  }
  return out
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  for (const rowM of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cM of rowM[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1] ?? ''
      const inner = cM[2] ?? ''
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const type = /t="([^"]+)"/.exec(attrs)?.[1]
      let value = ''
      if (type === 'inlineStr') {
        for (const t of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) value += unescapeXml(t[1])
      } else if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
        value = shared[idx] ?? ''
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        value = v != null ? unescapeXml(v) : ''
      }
      const col = ref ? colIndex(ref) : cells.length
      cells[col] = value
    }
    for (let i = 0; i < cells.length; i += 1) if (cells[i] == null) cells[i] = ''
    rows.push(cells)
  }
  return rows
}

/** 세션 표(2차원 배열)를 .xlsx Blob 으로. 첫 행은 헤더. 모든 셀은 텍스트(inline string). */
export function buildXlsx(aoa: Aoa, sheetName = 'Sheet1'): Blob {
  const enc = new TextEncoder()
  const rowsXml = aoa.map((row, r) => {
    const cells = row.map((val, c) => {
      const ref = colName(c) + (r + 1)
      const text = val == null ? '' : String(val)
      if (text === '') return `<c r="${ref}"/>`
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
  ]
  return new Blob([zipStore(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** .xlsx(Blob/File/ArrayBuffer)의 첫 시트를 2차원 문자열 배열로. */
export async function readXlsx(source: Blob | ArrayBuffer): Promise<string[][]> {
  const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer()
  const entries = readZipEntries(buffer)
  let sheetKey = 'xl/worksheets/sheet1.xml'
  if (!entries.has(sheetKey)) sheetKey = [...entries.keys()].find(k => /^xl\/worksheets\/[^/]+\.xml$/.test(k)) ?? ''
  const sheetEntry = sheetKey ? entries.get(sheetKey) : undefined
  if (!sheetEntry) throw new Error('xlsx 에서 워크시트를 찾지 못했습니다.')
  const ssEntry = entries.get('xl/sharedStrings.xml')
  const shared = ssEntry ? parseSharedStrings(await entryText(ssEntry)) : []
  return parseSheet(await entryText(sheetEntry), shared)
}
