// OCI IAM policy statement 문법 파서 — 순수 함수(프레임워크 무관, Node 테스트 가능).
// 표준 문법:  Allow <subject> to <verb> <resource-type> in <location> [where <conditions>]
// 목적: 사용자가 저장한 policy 문법을 "구조(주체·동사·자원·범위)"로 분해해
//       라이브러리에서 뱃지/그룹/필터로 보여주기 위함. 저장 원문(raw)은 절대 손대지 않는다.

/** 권한 사다리 — inspect < read < use < manage (OCI 공통 동사 의미). 교육/정렬용. */
export const POLICY_VERBS = [
  { id: 'inspect', level: 1, label: 'inspect', desc: '자원 목록·메타데이터 조회 (내용 제외)' },
  { id: 'read', level: 2, label: 'read', desc: 'inspect + 자원 내용·사용자 지정 메타데이터 조회' },
  { id: 'use', level: 3, label: 'use', desc: 'read + 기존 자원 사용·수정 (생성·삭제는 대부분 제외)' },
  { id: 'manage', level: 4, label: 'manage', desc: 'use + 자원 생성·삭제 등 전체 권한' },
]
const VERB_SET = new Set(POLICY_VERBS.map(v => v.id))
export function verbRank(v) { return POLICY_VERBS.find(x => x.id === v)?.level ?? 0 }

/** 자주 쓰는 aggregate resource-family (입력 자동완성 힌트용, 전수 아님). */
export const COMMON_RESOURCE_FAMILIES = [
  'all-resources', 'instance-family', 'volume-family', 'object-family',
  'virtual-network-family', 'database-family', 'autonomous-database-family',
  'cluster-family', 'file-family', 'load-balancers',
]

/** 주체(subject) 분해:  group X / dynamic-group X / service X / any-user / group id <ocid> ... */
function parseSubject(s) {
  const t = String(s).trim()
  if (/^any-user$/i.test(t)) return { type: 'any-user', name: '*' }
  let m
  if ((m = /^(dynamic-group|group|service|resource)\s+id\s+(.+)$/i.exec(t))) return { type: `${m[1].toLowerCase()}-id`, name: m[2].trim() }
  if ((m = /^(dynamic-group|group|service|resource)\s+(.+)$/i.exec(t))) return { type: m[1].toLowerCase(), name: m[2].trim() }
  return { type: 'other', name: t }
}

/** 범위(location) 분해:  tenancy / compartment X / compartment id <ocid> */
function parseLocation(s) {
  const t = String(s).trim()
  if (/^tenancy$/i.test(t)) return { scope: 'tenancy', name: 'tenancy' }
  let m
  if ((m = /^compartment\s+id\s+(.+)$/i.exec(t))) return { scope: 'compartment', name: m[1].trim(), byId: true }
  if ((m = /^compartment\s+(.+)$/i.exec(t))) return { scope: 'compartment', name: m[1].trim() }
  return { scope: 'other', name: t }
}

/**
 * policy 문장 1개를 구조로 분해한다.
 * @param {string} text
 * @returns {import('./policyParse.d.mts').ParsedPolicy}
 */
export function parsePolicyStatement(text) {
  const raw = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!raw) return { valid: false, error: '빈 문장' }

  const m = /^allow\s+(.+?)\s+to\s+(inspect|read|use|manage)\s+([a-z0-9-]+)\s+in\s+(.+?)(?:\s+where\s+(.+))?$/i.exec(raw)
  if (!m) {
    // 크로스테넌시(Endorse/Admit/Define)는 유효하지만 구조 분해는 생략한다.
    const kw = /^(endorse|admit|define)\b/i.exec(raw)
    if (kw) return { valid: true, kind: 'advanced', keyword: kw[1].toLowerCase(), raw }
    return { valid: false, kind: 'unknown', raw, error: '표준 Allow 문법이 아님 (Allow <주체> to <동사> <자원> in <범위>)' }
  }

  const [, subjectRaw, verbRaw, resourceType, locationRaw, where] = m
  const verb = verbRaw.toLowerCase()
  if (!VERB_SET.has(verb)) return { valid: false, kind: 'unknown', raw, error: `알 수 없는 동사: ${verbRaw}` }
  const subject = parseSubject(subjectRaw)
  const location = parseLocation(locationRaw)
  return {
    valid: true,
    kind: 'allow',
    raw,
    subjectType: subject.type,
    subject: subject.name,
    verb,
    resourceType,
    scope: location.scope,
    locationName: location.name,
    ...(where ? { where: where.trim() } : {}),
  }
}

/** 서비스 카테고리 추정 — resource-type 접두로 라이브러리 그룹핑에 사용(느슨한 힌트). */
export function guessCategory(resourceType) {
  const r = String(resourceType || '').toLowerCase()
  if (!r) return '기타'
  if (r === 'all-resources') return '전체'
  if (/(instance|compute|dedicated-vm)/.test(r)) return 'Compute'
  if (/(volume|object|file|bucket|storage)/.test(r)) return 'Storage'
  if (/(virtual-network|vcn|subnet|vnic|load-balancer|nat|drg|internet)/.test(r)) return 'Networking'
  if (/(database|autonomous|db-)/.test(r)) return 'Database'
  if (/(vault|key|secret|bastion|cloud-guard|waf|audit)/.test(r)) return 'Security'
  return '기타'
}

export const EMPTY_POLICY_DB = { statements: [], bundles: [] }
