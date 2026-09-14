// OCI CLI 프로필 — 순수 로직(수집 레시피 생성 · 붙여넣기 봉투 파싱 · 이름 후보 조회).
// localStorage 접근은 profiles.ts(비순수)에서만. 여기는 테스트 가능한 순수 함수만 둔다.
//
// 설계: 동적조회 OCID 는 실행시점에 live 해석(신선도·안전 유지)하고, 여기서는 프로필별
// "이름 후보"만 캐시해 드롭다운으로 고르게 한다. OCID 는 저장하지 않는다(compartment 는
// 예외적으로 id 를 함께 담아 ROOT/스코프 표시에 쓰되, 최종 해석은 여전히 이름→OCID live).

export const PROFILE_SCHEMA_VERSION = 2

// OCI Resource Search 의 resource-type → 이 사이트의 동적조회 target 키.
// (exactName 동적조회가 참조하는 리소스만. 나머지 타입은 무시된다.)
export const SEARCH_TYPE_TO_TARGET = {
  Instance: 'instance',
  Vcn: 'vcn',
  Subnet: 'subnet',
  RouteTable: 'route-table',
  SecurityList: 'security-list',
  NetworkSecurityGroup: 'nsg',
  InternetGateway: 'internet-gateway',
  NatGateway: 'nat-gateway',
  ServiceGateway: 'service-gateway',
  LocalPeeringGateway: 'local-peering-gateway',
  Drg: 'drg',
  DrgAttachment: 'drg-attachment',
  RemotePeeringConnection: 'remote-peering-connection',
  PublicIp: 'public-ip',
  LoadBalancer: 'load-balancer',
  BootVolume: 'boot-volume',
  Volume: 'block-volume',
  VolumeGroup: 'volume-group',
  FileSystem: 'file-system',
  MountTarget: 'mount-target',
  InstanceConfiguration: 'instance-configuration',
  InstancePool: 'instance-pool',
  DedicatedVmHost: 'dedicated-vm-host',
  DbSystem: 'base-db',
  AutonomousDatabase: 'autonomous-database',
  MysqlDbSystem: 'mysql',
  OnsTopic: 'topic',
  Alarm: 'alarm',
}

const uniqueSorted = values => [...new Set(values.filter(Boolean))].sort((a, b) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' }))

// 타입당 저장 상한 — 스크립트가 이미 30개로 자르지만, 구버전/원본 붙여넣기 방어용 최종 상한.
const PARSER_TYPE_CAP = 100

// ── 수집 레시피(bash) ────────────────────────────────────────────────────
// ocicli "프로필" 카테고리에 그대로 노출된다. 읽기전용(list/get/search)만 실행하고,
// 프로필별 원본 출력을 봉투에 담아 단일 JSON 배열로 출력한다. 필드 추출은 블로그가 한다.
export function renderProfileCollectScript() {
  // 동적조회에 실제 쓰는 리소스 타입만 남긴다(나머지 리소스는 통째로 버려 출력을 작게).
  const targetTypes = JSON.stringify(Object.keys(SEARCH_TYPE_TO_TARGET))
  const perTypeCap = 30 // 타입당 최대 이름 수(피커는 표본이면 충분, 나머지는 자유입력)
  return `#!/usr/bin/env bash
# OCI 프로필 수집 — ~/.oci/config 의 모든 프로필에서 리전·컴파트먼트·리소스 "이름" + 오브젝트
# 스토리지 네임스페이스(ns)를 모아 블로그에 붙여넣을 단일 JSON 으로 출력한다. 읽기전용(list/get/search)만 실행한다.
#   ./collect.sh &> profiles.log   후 profiles.log 전체를 붙여넣으세요.
# 출력 최소화: (1) 동적조회에 쓰는 리소스 타입만, (2) 이름·타입만(긴 OCID 제외),
#   (3) 활성 자원만, (4) 타입당 최대 ${perTypeCap}개, (5) jq -c 로 한 줄 압축.
set -uo pipefail
command -v jq >/dev/null 2>&1 || { echo "[ERROR] jq 가 필요합니다(출력 압축용). 설치 후 다시 실행하세요." >&2; exit 3; }
CONFIG="\${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}"
[ -r "$CONFIG" ] || { echo "[ERROR] config 를 읽을 수 없습니다: $CONFIG" >&2; exit 1; }

# 프로필(섹션) 목록 — CRLF 제거 후 [섹션] 헤더만
mapfile -t PROFILES < <(tr -d '\\r' < "$CONFIG" | grep -oE '^\\[[^]]+\\]' | tr -d '[]')
[ "\${#PROFILES[@]}" -gt 0 ] || { echo "[ERROR] config 에서 프로필을 찾지 못했습니다." >&2; exit 1; }

# jq 프로젝션 — 필요한 필드만 뽑고 배열로. 응답이 list={data:[...]} 든 search={data:{items:[...]}} 든 처리.
JQ_SUB='[.data[]? | {"region-name":.["region-name"],"is-home-region":.["is-home-region"],"status":.status}]'
JQ_COMP='[.data[]? | {name:.name,id:.id,"lifecycle-state":.["lifecycle-state"]}]'
# 리소스: 활성 + 동적조회 대상 타입만, 이름·타입만, 타입당 상한. (OCID·태그 등 전부 버림)
TYPES='${targetTypes}'
JQ_RES='[((.data.items // .data // [])[]?) | select((.["lifecycle-state"] // "OK") | test("TERMINATED|DELETED") | not) | select(.["resource-type"] | IN(($T)[])) | {"display-name":.["display-name"],"resource-type":.["resource-type"]}] as $arr | (($arr | group_by(.["resource-type"]) | map(.[0:${perTypeCap}]) | add) // [])'

emit() {
  local P="$1" TEN NS SUBS COMPS RES
  # 같은 섹션의 tenancy= (CRLF 제거)
  TEN=$(tr -d '\\r' < "$CONFIG" | awk -v s="[$P]" \\
    '$0==s{f=1;next} /^\\[/{f=0} f&&/^[[:space:]]*tenancy[[:space:]]*=/{sub(/^[^=]*=[[:space:]]*/,"");print;exit}')
  # 각 조회를 jq 로 프로젝션·압축. jq 는 빈 입력에도 exit 0 이라 '|| echo' 가 안 걸린다
  # → 반드시 -n 가드로 빈 캡처를 '[]' 로 보정(안 그러면 "resources":} 같은 깨진 JSON).
  SUBS=$(oci iam region-subscription list --profile "$P" --output json 2>/dev/null | jq -c "$JQ_SUB" 2>/dev/null); [ -n "$SUBS" ] || SUBS='[]'
  COMPS=$(oci iam compartment list --compartment-id "$TEN" --compartment-id-in-subtree true --all \\
    --profile "$P" --output json 2>/dev/null | jq -c "$JQ_COMP" 2>/dev/null); [ -n "$COMPS" ] || COMPS='[]'
  # 리소스 이름 — Resource Search(프로필 홈 리전 기준). 타입 목록은 --argjson 으로 전달.
  RES=$(oci search resource structured-search --query-text "query all resources" \\
    --profile "$P" --output json 2>/dev/null | jq -c --argjson T "$TYPES" "$JQ_RES" 2>/dev/null); [ -n "$RES" ] || RES='[]'
  # 오브젝트 스토리지 네임스페이스 — 테넌시당 1개 고정 스칼라(read-only get). 실패 시 빈 문자열(유효 JSON).
  NS=$(oci os ns get --profile "$P" --output json 2>/dev/null | jq -r '.data // empty' 2>/dev/null)
  printf '{"name":"%s","tenancy":"%s","namespace":"%s","subscriptions":%s,"compartments":%s,"resources":%s}' \\
    "$P" "$TEN" "$NS" "$SUBS" "$COMPS" "$RES"
}

echo '['
sep=''
for P in "\${PROFILES[@]}"; do
  printf '%s' "$sep"; emit "$P"; sep=','
done
echo ']'
`
}

// ── 붙여넣기 봉투 → 프로필 레코드 ────────────────────────────────────────
function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && Array.isArray(value.data)) return value.data
  // search structured-search 원본은 {data:{items:[...]}} 형태
  if (value && value.data && Array.isArray(value.data.items)) return value.data.items
  return []
}

function extractOne(envelope) {
  if (!envelope || typeof envelope !== 'object') return null
  const name = String(envelope.name ?? '').trim()
  if (!name) return null
  // 오브젝트 스토리지 네임스페이스 — 스칼라 문자열(없으면 undefined). object/bucket 명령의 --namespace 자동주입에 쓴다.
  const namespace = String(envelope.namespace ?? '').trim()

  const subs = asArray(envelope.subscriptions)
  const homeRegion = (subs.find(s => s && s['is-home-region'])?.['region-name']) || ''
  const regions = uniqueSorted(subs
    .filter(s => s && s.status === 'READY')
    .map(s => s['region-name']))

  const compartments = asArray(envelope.compartments)
    .filter(c => c && c['lifecycle-state'] !== 'DELETED' && c.name && c.id)
    .map(c => ({ name: String(c.name), id: String(c.id) }))

  /** @type {Record<string, {name: string, compartmentId?: string}[]>} */
  const names = {}
  for (const item of asArray(envelope.resources)) {
    if (!item) continue
    const target = SEARCH_TYPE_TO_TARGET[item['resource-type']]
    const display = item['display-name']
    if (!target || !display) continue
    if (item['lifecycle-state'] === 'DELETED' || item['lifecycle-state'] === 'TERMINATED') continue
    const list = (names[target] ??= [])
    // 방어 상한 — 구버전/원본 붙여넣기가 타입당 수천 개를 담아도 localStorage·렌더를 폭주시키지 않는다.
    if (list.length >= PARSER_TYPE_CAP) continue
    list.push({ name: String(display), compartmentId: item['compartment-id'] })
  }

  return {
    v: PROFILE_SCHEMA_VERSION,
    name,
    tenancyId: String(envelope.tenancy ?? '').trim() || undefined,
    namespace: namespace || undefined,
    homeRegion: homeRegion || undefined,
    regions,
    compartments,
    names,
  }
}

/**
 * 붙여넣은 봉투 텍스트를 프로필 레코드 배열로 변환.
 * @returns {{ profiles: object[], error?: string }}
 */
export function parseCollectedProfiles(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { profiles: [], error: '붙여넣은 내용이 비어 있습니다.' }
  // 방어적 복구 — 조회가 빈 출력을 내면 스크립트가 "resources":} 처럼 값 없는 필드를 남길 수 있다
  // (구버전 스크립트/특정 셸). 알려진 3키의 빈 값을 []로 보정해 파싱 가능하게 한다.
  const repaired = trimmed.replace(/("(?:subscriptions|compartments|resources)"\s*:)\s*(?=[},\]])/g, '$1[]')
  let parsed
  try {
    parsed = JSON.parse(repaired)
  } catch {
    return { profiles: [], error: 'JSON 파싱 실패 — 수집 스크립트 출력 전체를 그대로 붙여넣었는지 확인하세요.' }
  }
  const envelopes = Array.isArray(parsed) ? parsed : [parsed]
  const profiles = envelopes.map(extractOne).filter(Boolean)
  if (!profiles.length) return { profiles: [], error: '유효한 프로필을 찾지 못했습니다(name 필드 확인).' }
  return { profiles }
}

// ── 이름 후보 조회 ───────────────────────────────────────────────────────
/**
 * 동적조회 필드에 보여줄 이름 후보 목록.
 * @param {object|null|undefined} profile
 * @param {string} target  'compartment' | 'vcn' | 'subnet' | ...
 * @param {{ compartmentId?: string }} [opts]  exactName 을 선택 컴파트먼트로 필터
 * @returns {string[]}
 */
export function lookupNamesFor(profile, target, opts = {}) {
  if (!profile || !target) return []
  if (target === 'compartment') {
    const names = (profile.compartments ?? []).map(c => c.name)
    return uniqueSorted(['ROOT', ...names])
  }
  let entries = profile.names?.[target] ?? []
  if (opts.compartmentId) entries = entries.filter(e => e.compartmentId === opts.compartmentId)
  return uniqueSorted(entries.map(e => e.name))
}

/** 프로필 레코드의 요약 카운트(관리 화면 표시용). */
export function profileSummary(profile) {
  const resourceCount = Object.values(profile.names ?? {}).reduce((sum, list) => sum + list.length, 0)
  return {
    regions: (profile.regions ?? []).length,
    compartments: (profile.compartments ?? []).length,
    resources: resourceCount,
  }
}

/** 이름으로 병합(같은 name 은 새 레코드로 덮어씀). 이름 정렬 유지. */
export function mergeProfiles(existing, incoming) {
  const byName = new Map(existing.map(p => [p.name, p]))
  for (const p of incoming) byName.set(p.name, p)
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}
