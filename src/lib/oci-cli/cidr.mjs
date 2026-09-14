// IPv4 CIDR 검증(순수). blueprint 주소 입력을 Apply 전에 검사해 부분 실패(자원 N개 생성 후 중단)를 막는다.

/** '10.0.0.0/16' → { ip:uint32, bits } | null(형식오류) */
export function parseCidr(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(String(s ?? '').trim())
  if (!m) return null
  const oct = [m[1], m[2], m[3], m[4]].map(Number)
  const bits = Number(m[5])
  if (oct.some(o => o > 255) || bits > 32) return null
  const ip = ((oct[0] << 24) | (oct[1] << 16) | (oct[2] << 8) | oct[3]) >>> 0
  return { ip, bits }
}
export const isValidCidr = s => parseCidr(s) !== null

const maskOf = bits => (bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0)
const netOf = c => (c.ip & maskOf(c.bits)) >>> 0

/** inner 가 outer 에 완전히 포함되는가 */
export function cidrContains(outer, inner) {
  const o = parseCidr(outer), i = parseCidr(inner)
  if (!o || !i) return false
  if (i.bits < o.bits) return false // inner 가 더 넓으면 포함 불가
  const om = maskOf(o.bits)
  return ((i.ip & om) >>> 0) === netOf(o)
}

/** 두 CIDR 이 겹치는가(한쪽이 다른쪽을 포함하는 경우 포함) */
export function cidrsOverlap(a, b) {
  const x = parseCidr(a), y = parseCidr(b)
  if (!x || !y) return false
  const m = maskOf(Math.min(x.bits, y.bits))
  return ((x.ip & m) >>> 0) === ((y.ip & m) >>> 0)
}

/** blueprint 주소 입력 검증 → 사람이 읽는 이슈 배열(빈 배열 = 정상).
 *  vcnCidrs(배열) 안에 각 서브넷이 포함되는지, 서브넷끼리 겹치지 않는지, 형식이 맞는지. */
export function validateAddressing(inputs) {
  const issues = []
  const raw = inputs['address.vcnCidrs']
  let vcnList = []
  if (Array.isArray(raw)) vcnList = raw
  else if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim()
    if (s.startsWith('[')) { try { vcnList = JSON.parse(s) } catch { vcnList = [] } }
    else vcnList = s.split(/[\n,]+/).map(x => x.trim()).filter(Boolean)
  }
  vcnList = vcnList.map(String).map(x => x.trim()).filter(Boolean)

  if (vcnList.length === 0) issues.push('VCN CIDR(address.vcnCidrs)를 입력하세요.')
  for (const v of vcnList) if (!isValidCidr(v)) issues.push(`VCN CIDR 형식 오류: "${v}" (예: 10.0.0.0/16)`)

  // 서브넷 입력들(id 가 SubnetCidr 로 끝나는 것) 검사
  const subnetKeys = Object.keys(inputs).filter(k => /SubnetCidr$/.test(k))
  const subnets = []
  for (const k of subnetKeys) {
    const val = String(inputs[k] ?? '').trim()
    if (!val) continue
    const label = k.replace(/^address\./, '')
    if (!isValidCidr(val)) { issues.push(`서브넷 CIDR 형식 오류: ${label} = "${val}"`); continue }
    subnets.push({ label, cidr: val })
    // 어느 VCN CIDR 에도 포함되지 않으면 오류
    const validVcns = vcnList.filter(isValidCidr)
    if (validVcns.length && !validVcns.some(v => cidrContains(v, val))) {
      issues.push(`서브넷 ${label}(${val})이 VCN CIDR(${validVcns.join(', ')}) 안에 포함되지 않습니다.`)
    }
  }
  // 서브넷끼리 중첩 검사
  for (let a = 0; a < subnets.length; a += 1) for (let b = a + 1; b < subnets.length; b += 1) {
    if (cidrsOverlap(subnets[a].cidr, subnets[b].cidr)) {
      issues.push(`서브넷 CIDR 중첩: ${subnets[a].label}(${subnets[a].cidr}) ↔ ${subnets[b].label}(${subnets[b].cidr})`)
    }
  }
  // sshSourceCidr(있으면) 형식만 검사
  const ssh = String(inputs['address.sshSourceCidr'] ?? '').trim()
  if (ssh && !isValidCidr(ssh)) issues.push(`SSH source CIDR 형식 오류: "${ssh}"`)

  return issues
}
