import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHub } from '../store'
import { getPat, getFile, putFile, explainGhError } from '../lib/githubDb'
import { useProtectedData } from '../lib/protectedData'

interface CliOption {
  name: string
  required: boolean
  console?: boolean          // CLI 스키마상 optional 이지만 콘솔 기준 필수 (승격)
  multi?: boolean            // 여러 값 입력(줄바꿈/콤마) → 전용 빌더에서 for 루프
  type: string
  choices: string[] | null
  help: string
  placeholder: string
  flag?: boolean
  defaultValue?: string
  suggestions?: string[]
  shellQuote?: boolean
  lookupOnly?: boolean       // 이름 조회에만 사용하고 최종 OCI 명령에는 전달하지 않음
  displayLabel?: string
}
interface CliSection { label: string; options: CliOption[] }
type CrudVerb = 'get' | 'list' | 'create' | 'update' | 'delete'
interface CliOperation {
  cmd: string; help: string
  sections: CliSection[]; advanced: CliOption[]
}
interface CliCommand {
  resource: string; label: string
  cmd: string; help: string
  crossCopy?: string         // 'boot-volume' | 'volume' — cross-tenancy 복사 전용 조립
  maintenanceReboot?: boolean // 인스턴스 유지보수 재부팅 조회 + 변경 전용 조립
  compartmentCleanup?: boolean // scoped resource cleanup PREVIEW/DELETE script
  manualBackup?: 'instance-boot-volume' | 'mysql'
  operations?: Partial<Record<CrudVerb, CliOperation>>
  sections: CliSection[]; advanced: CliOption[]
}
// 조립·검색용 평탄화 — 섹션 순서(콘솔 마법사 순서)를 그대로 유지
const allOptions = (c: Pick<CliCommand, 'sections' | 'advanced'>): CliOption[] => [...c.sections.flatMap(s => s.options), ...c.advanced]
interface Catalog {
  categories: { id: string; label: string; groups: { label: string; resources: string[] }[] }[]
  commands: Record<string, CliCommand>
}
const EMPTY_CATALOG: Catalog = { categories: [], commands: {} }

const CRUD_OPERATIONS: { verb: CrudVerb; icon: string }[] = [
  { verb: 'get', icon: '↓' },
  { verb: 'list', icon: '≡' },
  { verb: 'create', icon: '+' },
  { verb: 'update', icon: '↻' },
  { verb: 'delete', icon: '×' },
] as const

const defaultOperation = (command: CliCommand): CrudVerb => {
  if (command.maintenanceReboot) return 'get'
  if (command.operations?.create) return 'create'
  return CRUD_OPERATIONS.find(operation => command.operations?.[operation.verb])?.verb ?? 'create'
}
const supportsOperation = (command: CliCommand | null | undefined, operation: CrudVerb) => command?.maintenanceReboot
  ? operation === 'get' || operation === 'update'
  : !!command?.operations?.[operation]
const operationDefaults = (command: CliCommand, operation: CrudVerb): Record<string, string> => {
  const selected = command.operations?.[operation] ?? command
  return Object.fromEntries(allOptions(selected)
    .filter(option => option.defaultValue !== undefined)
    .map(option => [option.name, option.defaultValue as string]))
}

/* ── 동적 조회 지원 옵션 — 이름만 넣으면 $()/변수로 OCID를 찾아준다 ──
   기본값 = 동적. 체크 해제 시 OCID 직접 입력. */
const DYNAMIC: Record<string, { input: string; note: string }> = {
  '--compartment-id': { input: 'compartment 이름 (예: prod)', note: '이름으로 OCID 자동 조회' },
  '--availability-domain': { input: 'AD 번호 1~3 (기본 1)', note: '번호로 AD 이름 자동 조회' },
  '--vcn-id': { input: 'VCN 이름', note: '이름으로 OCID 자동 조회 (compartment 기준)' },
  '--subnet-id': { input: 'Subnet 이름', note: '이름으로 OCID 자동 조회 (compartment 기준)' },
  '--lookup-compartment-id': { input: 'compartment 이름 (예: prod)', note: 'DB System 이름 조회에만 사용할 compartment' },
  '--db-system-id': { input: 'MySQL DB System 이름', note: 'compartment 안에서 정확한 이름으로 OCID 조회' },
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

interface Favorite {
  id: string; name: string; resource: string; values: Record<string, string>
  dyn?: Record<string, boolean>; operation?: CrudVerb
}
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
  const targetGroupName = v('--target-group-name', '<target-group-name>')
  const targetGroupId = v('--target-group-id', '<target-group-ocid>')
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
    `PROFILE=${profile}             # 대상(받는) 테넌시 프로파일`,
    `DEST_TENANCY=${destTenancy}`,
    `TARGET_GROUP_NAME=${targetGroupName}`,
    `TARGET_GROUP_ID=${targetGroupId}`,
    `REGION=${region}`,
    `COMPARTMENT=${comp}            # 대상 compartment`,
    '',
    '#############################################',
    '# 1) 대상 테넌시 — Endorse policy (최초 1회)',
    '#############################################',
    "cat > /tmp/endorse-stmts.json <<'EOF'",
    '[',
    `  "Define tenancy SourceTenancy as ${srcTenancy}",`,
    `  "Endorse group ${targetGroupName} to use volumes in tenancy SourceTenancy where ANY { ${ops} }"`,
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
    `  "Define tenancy TargetTenancy as ${destTenancy}",`,
    `  "Define group TargetGroup as ${targetGroupId}",`,
    `  "Admit group TargetGroup of tenancy TargetTenancy to use volumes in tenancy where ANY { ${ops} }"`,
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

/* 인스턴스 유지보수 재부팅 예정 시각 — 선택한 GET 또는 UPDATE 명령 생성 */
function buildMaintenanceReboot(values: Record<string, string>, operation: 'get' | 'update'): string {
  const v = (key: string, fallback: string) => (values[key] || '').trim() || fallback
  const instanceId = v('--instance-id', '<instanceid>')
  const profile = v('--profile', '<profile>')
  const region = v('--region', '<region>')
  const rebootDue = v('--time-maintenance-reboot-due', '<YYYY-MM-DDTHH:mm:ssZ>')
  const CONT = ' \\'

  if (operation === 'get') {
    return [
      '# 유지보수 재부팅을 연장할 수 있는 최대 시각 조회',
      'oci compute instance-maintenance-reboot get' + CONT,
      `  --instance-id "${instanceId}"` + CONT,
      `  --profile "${profile}"` + CONT,
      `  --region "${region}"` + CONT,
      `  --query 'data."time-maintenance-reboot-due-max"'` + CONT,
      '  --raw-output',
    ].join('\n')
  }

  return [
    '# 인스턴스 유지보수 재부팅 달력 업데이트',
    'oci compute instance update' + CONT,
    `  --instance-id "${instanceId}"` + CONT,
    `  --time-maintenance-reboot-due "${rebootDue}"` + CONT,
    `  --profile "${profile}"` + CONT,
    `  --region "${region}"` + CONT,
    '  --force',
  ].join('\n')
}

/* 최종 명령 조립 — 동적 옵션은 변수 선언(prelude) + 참조로 */
/* Resolve exact resource names safely, then create and verify one manual backup. */
function buildManualBackup(kind: 'instance-boot-volume' | 'mysql', values: Record<string, string>): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  const common = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `PROFILE=${q(v('--profile', 'DEFAULT'))}`,
    `REGION=${q(v('--region', 'ap-seoul-1'))}`,
    `COMPARTMENT_NAME=${q(v('--compartment-name', '<compartment-name>'))}`,
    'CTX=(--profile "$PROFILE" --region "$REGION")',
    '',
    '# 이름이 중복되면 임의의 첫 번째 OCID를 사용하지 않고 안전하게 중단합니다.',
    'COMPARTMENT_COUNT=$(oci iam compartment list \\',
    '  --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE \\',
    '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
    '  --query \'length(data)\' --raw-output "${CTX[@]}")',
    'if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
    '  echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_NAME (found=$COMPARTMENT_COUNT)" >&2',
    '  oci iam compartment list --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
    '    --query \'data[].{name:name,id:id,parent:"compartment-id"}\' --output table "${CTX[@]}" >&2',
    '  exit 1',
    'fi',
    'COMPARTMENT_ID=$(oci iam compartment list \\',
    '  --name "$COMPARTMENT_NAME" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
    '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
    '',
  ]

  if (kind === 'instance-boot-volume') {
    return [
      ...common,
      `INSTANCE_NAME=${q(v('--instance-name', '<instance-name>'))}`,
      `BACKUP_DISPLAY_NAME_INPUT=${q(v('--backup-display-name'))}`,
      `BACKUP_TYPE=${q(v('--backup-type', 'FULL').toUpperCase())}`,
      `MAX_WAIT_SECONDS=${q(v('--max-wait-seconds', '3600'))}`,
      '',
      '[[ "$BACKUP_TYPE" == "FULL" || "$BACKUP_TYPE" == "INCREMENTAL" ]] || { echo "[ERROR] backup type은 FULL 또는 INCREMENTAL이어야 합니다." >&2; exit 2; }',
      '[[ "$MAX_WAIT_SECONDS" =~ ^[0-9]+$ ]] || { echo "[ERROR] max wait seconds는 숫자여야 합니다." >&2; exit 2; }',
      '',
      'INSTANCE_COUNT=$(oci compute instance list \\',
      '  --compartment-id "$COMPARTMENT_ID" --display-name "$INSTANCE_NAME" --all \\',
      '  --query \'length(data[?"lifecycle-state" != `TERMINATED`])\' --raw-output "${CTX[@]}")',
      'if [[ "$INSTANCE_COUNT" != "1" ]]; then',
      '  echo "[ERROR] 종료되지 않은 instance 이름은 정확히 1개여야 합니다: $INSTANCE_NAME (found=$INSTANCE_COUNT)" >&2',
      '  oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "$INSTANCE_NAME" --all \\',
      '    --query \'data[].{name:"display-name",state:"lifecycle-state",ad:"availability-domain",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'INSTANCE_ID=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "$INSTANCE_NAME" --all \\',
      '  --query \'data[?"lifecycle-state" != `TERMINATED`] | [0].id\' --raw-output "${CTX[@]}")',
      'INSTANCE_AD=$(oci compute instance get --instance-id "$INSTANCE_ID" --query \'data."availability-domain"\' --raw-output "${CTX[@]}")',
      '',
      'ATTACHMENT_COUNT=$(oci compute boot-volume-attachment list \\',
      '  --availability-domain "$INSTANCE_AD" --compartment-id "$COMPARTMENT_ID" --instance-id "$INSTANCE_ID" --all \\',
      '  --query \'length(data[?"lifecycle-state" == `ATTACHED`])\' --raw-output "${CTX[@]}")',
      'if [[ "$ATTACHMENT_COUNT" != "1" ]]; then',
      '  echo "[ERROR] ATTACHED boot volume 연결은 정확히 1개여야 합니다. (found=$ATTACHMENT_COUNT)" >&2',
      '  oci compute boot-volume-attachment list --availability-domain "$INSTANCE_AD" --compartment-id "$COMPARTMENT_ID" --instance-id "$INSTANCE_ID" --all \\',
      '    --query \'data[].{state:"lifecycle-state",bootVolumeId:"boot-volume-id",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'BOOT_VOLUME_ID=$(oci compute boot-volume-attachment list \\',
      '  --availability-domain "$INSTANCE_AD" --compartment-id "$COMPARTMENT_ID" --instance-id "$INSTANCE_ID" --all \\',
      '  --query \'data[?"lifecycle-state" == `ATTACHED`] | [0]."boot-volume-id"\' --raw-output "${CTX[@]}")',
      'BACKUP_DISPLAY_NAME="${BACKUP_DISPLAY_NAME_INPUT:-${INSTANCE_NAME}-boot-manual-$(date -u +%Y%m%d-%H%M%S)}"',
      '',
      'echo "[RESOLVED] compartment=$COMPARTMENT_ID"',
      'echo "[RESOLVED] instance=$INSTANCE_ID / AD=$INSTANCE_AD"',
      'echo "[RESOLVED] boot-volume=$BOOT_VOLUME_ID"',
      'BOOT_BACKUP_ID=$(oci bv boot-volume-backup create \\',
      '  --boot-volume-id "$BOOT_VOLUME_ID" --display-name "$BACKUP_DISPLAY_NAME" --type "$BACKUP_TYPE" \\',
      '  --wait-for-state AVAILABLE --max-wait-seconds "$MAX_WAIT_SECONDS" \\',
      '  --query \'data.id\' --raw-output "${CTX[@]}")',
      '',
      'echo "[CREATED] boot-volume-backup=$BOOT_BACKUP_ID"',
      'oci bv boot-volume-backup get --boot-volume-backup-id "$BOOT_BACKUP_ID" \\',
      '  --query \'data.{name:"display-name",type:type,state:"lifecycle-state",created:"time-created",id:id}\' --output table "${CTX[@]}"',
    ].join('\n')
  }

  return [
    ...common,
    `DB_SYSTEM_NAME=${q(v('--db-system-name', '<mysql-db-system-name>'))}`,
    `BACKUP_DISPLAY_NAME_INPUT=${q(v('--backup-display-name'))}`,
    `BACKUP_TYPE=${q(v('--backup-type', 'FULL').toUpperCase())}`,
    `RETENTION_DAYS=${q(v('--retention-in-days', '7'))}`,
    `SOFT_DELETE=${q(v('--soft-delete', 'ENABLED').toUpperCase())}`,
    `DESCRIPTION=${q(v('--description'))}`,
    `MAX_WAIT_SECONDS=${q(v('--max-wait-seconds', '7200'))}`,
    '',
    '[[ "$BACKUP_TYPE" == "FULL" || "$BACKUP_TYPE" == "INCREMENTAL" ]] || { echo "[ERROR] backup type은 FULL 또는 INCREMENTAL이어야 합니다." >&2; exit 2; }',
    '[[ "$SOFT_DELETE" == "ENABLED" || "$SOFT_DELETE" == "DISABLED" ]] || { echo "[ERROR] soft delete는 ENABLED 또는 DISABLED여야 합니다." >&2; exit 2; }',
    '[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "[ERROR] retention days는 숫자여야 합니다." >&2; exit 2; }',
    '[[ "$MAX_WAIT_SECONDS" =~ ^[0-9]+$ ]] || { echo "[ERROR] max wait seconds는 숫자여야 합니다." >&2; exit 2; }',
    '',
    'DB_SYSTEM_COUNT=$(oci mysql db-system list \\',
    '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --lifecycle-state ACTIVE --all \\',
    '  --query \'length(data)\' --raw-output "${CTX[@]}")',
    'if [[ "$DB_SYSTEM_COUNT" != "1" ]]; then',
    '  echo "[ERROR] ACTIVE MySQL DB System 이름은 정확히 1개여야 합니다: $DB_SYSTEM_NAME (found=$DB_SYSTEM_COUNT)" >&2',
    '  oci mysql db-system list --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --all \\',
    '    --query \'data[].{name:"display-name",state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
    '  exit 1',
    'fi',
    'DB_SYSTEM_ID=$(oci mysql db-system list \\',
    '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --lifecycle-state ACTIVE --all \\',
    '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
    'BACKUP_DISPLAY_NAME="${BACKUP_DISPLAY_NAME_INPUT:-${DB_SYSTEM_NAME}-manual-$(date -u +%Y%m%d-%H%M%S)}"',
    'DESCRIPTION_ARGS=()',
    '[[ -n "$DESCRIPTION" ]] && DESCRIPTION_ARGS=(--description "$DESCRIPTION")',
    '',
    'echo "[RESOLVED] compartment=$COMPARTMENT_ID"',
    'echo "[RESOLVED] mysql-db-system=$DB_SYSTEM_ID"',
    'MYSQL_BACKUP_ID=$(oci mysql backup create \\',
    '  --db-system-id "$DB_SYSTEM_ID" --display-name "$BACKUP_DISPLAY_NAME" --backup-type "$BACKUP_TYPE" \\',
    '  --retention-in-days "$RETENTION_DAYS" --soft-delete "$SOFT_DELETE" "${DESCRIPTION_ARGS[@]}" \\',
    '  --wait-for-state SUCCEEDED --max-wait-seconds "$MAX_WAIT_SECONDS" \\',
    '  --query \'data.id\' --raw-output "${CTX[@]}")',
    '',
    'echo "[CREATED] mysql-backup=$MYSQL_BACKUP_ID"',
    'oci mysql backup get --backup-id "$MYSQL_BACKUP_ID" \\',
    '  --query \'data.{name:"display-name",type:"backup-type",state:"lifecycle-state",retentionDays:"retention-in-days",created:"time-created",id:id}\' --output table "${CTX[@]}"',
  ].join('\n')
}

/* MySQL Backup CREATE는 정상 Backup 리소스 안에서 DB System 이름 조회만 보조합니다. */
function buildMysqlBackupCreate(values: Record<string, string>, dyn: Record<string, boolean>): string {
  const v = (key: string) => (values[key] || '').trim()
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
  const dynamicDbSystem = isDynamic(dyn, '--db-system-id')
  const dynamicCompartment = isDynamic(dyn, '--lookup-compartment-id')
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `PROFILE=${q(v('--profile'))}`,
    `REGION=${q(v('--region'))}`,
    'CTX=()',
    '[[ -n "$PROFILE" ]] && CTX+=(--profile "$PROFILE")',
    '[[ -n "$REGION" ]] && CTX+=(--region "$REGION")',
    '',
  ]

  if (dynamicDbSystem) {
    lines.push(
      `DB_SYSTEM_NAME=${q(v('--db-system-id') || '<mysql-db-system-name>')}`,
      `COMPARTMENT_INPUT=${q(v('--lookup-compartment-id') || (dynamicCompartment ? '<compartment-name>' : '<compartment-ocid>'))}`,
      '',
    )
    if (dynamicCompartment) {
      lines.push(
        'COMPARTMENT_COUNT=$(oci iam compartment list \\',
        '  --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE \\',
        '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
        '  --query \'length(data)\' --raw-output "${CTX[@]}")',
        'if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
        '  echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2',
        '  oci iam compartment list --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
        '    --query \'data[].{name:name,id:id,parent:"compartment-id"}\' --output table "${CTX[@]}" >&2',
        '  exit 1',
        'fi',
        'COMPARTMENT_ID=$(oci iam compartment list \\',
        '  --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE \\',
        '  --compartment-id-in-subtree true --access-level ACCESSIBLE --all \\',
        '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
      )
    } else {
      lines.push('COMPARTMENT_ID="$COMPARTMENT_INPUT"')
    }
    lines.push(
      '',
      'DB_SYSTEM_COUNT=$(oci mysql db-system list \\',
      '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --lifecycle-state ACTIVE --all \\',
      '  --query \'length(data)\' --raw-output "${CTX[@]}")',
      'if [[ "$DB_SYSTEM_COUNT" != "1" ]]; then',
      '  echo "[ERROR] ACTIVE MySQL DB System 이름은 정확히 1개여야 합니다: $DB_SYSTEM_NAME (found=$DB_SYSTEM_COUNT)" >&2',
      '  oci mysql db-system list --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --all \\',
      '    --query \'data[].{name:"display-name",state:"lifecycle-state",id:id}\' --output table "${CTX[@]}" >&2',
      '  exit 1',
      'fi',
      'DB_SYSTEM_ID=$(oci mysql db-system list \\',
      '  --compartment-id "$COMPARTMENT_ID" --display-name "$DB_SYSTEM_NAME" --lifecycle-state ACTIVE --all \\',
      '  --query \'data[0].id\' --raw-output "${CTX[@]}")',
    )
  } else {
    lines.push(`DB_SYSTEM_ID=${q(v('--db-system-id') || '<mysql-db-system-ocid>')}`)
  }

  const optional = [
    ['--display-name', 'DISPLAY_NAME'], ['--description', 'DESCRIPTION'], ['--backup-type', 'BACKUP_TYPE'],
    ['--retention-in-days', 'RETENTION_DAYS'], ['--soft-delete', 'SOFT_DELETE'],
    ['--freeform-tags', 'FREEFORM_TAGS'], ['--defined-tags', 'DEFINED_TAGS'],
    ['--wait-for-state', 'WAIT_FOR_STATE'], ['--max-wait-seconds', 'MAX_WAIT_SECONDS'],
    ['--wait-interval-seconds', 'WAIT_INTERVAL_SECONDS'],
  ] as const
  lines.push('', 'EXTRA_ARGS=()')
  for (const [option, variable] of optional) {
    lines.push(`${variable}=${q(v(option))}`, `[[ -n "$${variable}" ]] && EXTRA_ARGS+=(${option} "$${variable}")`)
  }
  lines.push(
    '',
    'echo "[RESOLVED] mysql-db-system=$DB_SYSTEM_ID"',
    'MYSQL_BACKUP_ID=$(oci mysql backup create \\',
    '  --db-system-id "$DB_SYSTEM_ID" "${EXTRA_ARGS[@]}" \\',
    '  --query \'data.id\' --raw-output "${CTX[@]}")',
    'echo "[CREATED] mysql-backup=$MYSQL_BACKUP_ID"',
    'oci mysql backup get --backup-id "$MYSQL_BACKUP_ID" \\',
    '  --query \'data.{name:"display-name",type:"backup-type",state:"lifecycle-state",retentionDays:"retention-in-days",created:"time-created",id:id}\' \\',
    '  --output table "${CTX[@]}"',
  )
  return lines.join('\n')
}

/* Build a safety-gated Bash cleanup script for one exact compartment. */
function buildCompartmentCleanup(values: Record<string, string>): string {
  const v = (key: string, fallback = '') => (values[key] || '').trim() || fallback
  const enabled = (key: string) => values[key] === 'true' ? 'true' : 'false'
  const q = (raw: string) => `"${raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

  return [
    '#!/usr/bin/env bash',
    '# OCI Compartment Resource Cleansing',
    '# 기본값은 PREVIEW입니다. DELETE는 동일한 compartment OCID를 한 번 더 확인합니다.',
    'set -uo pipefail',
    '',
    `PROFILE=${q(v('--profile', 'DEFAULT'))}`,
    `REGION=${q(v('--region', 'ap-seoul-1'))}`,
    `COMPARTMENT=${q(v('--compartment-id', '<compartment-ocid>'))}`,
    `MODE=${q(v('--mode', 'PREVIEW').toUpperCase())}`,
    `CONFIRM_COMPARTMENT=${q(v('--confirm-compartment-id'))}`,
    `LA_NAMESPACE=${q(v('--log-analytics-namespace'))}`,
    `CLEAN_COMPUTE=${enabled('--cleanup-compute')}`,
    `CLEAN_LOAD_BALANCERS=${enabled('--cleanup-load-balancers')}`,
    `CLEAN_DATABASES=${enabled('--cleanup-databases')}`,
    `CLEAN_STORAGE=${enabled('--cleanup-storage')}`,
    `CLEAN_STORAGE_BACKUPS=${enabled('--cleanup-storage-backups')}`,
    `CLEAN_DB_BACKUPS=${enabled('--cleanup-db-backups')}`,
    `CLEAN_LOGGING=${enabled('--cleanup-logging')}`,
    `CLEAN_LOG_ANALYTICS=${enabled('--cleanup-log-analytics')}`,
    `CLEAN_NETWORK=${enabled('--cleanup-network')}`,
    'CTX=(--profile "$PROFILE" --region "$REGION")',
    '',
    'if [[ ! "$COMPARTMENT" =~ ^ocid1\\.compartment\\. ]]; then',
    '  echo "[ABORT] --compartment-id에는 컴파트먼트 OCID만 허용됩니다. 테넌시 OCID는 사용할 수 없습니다." >&2',
    '  exit 2',
    'fi',
    'if [[ "$MODE" != "PREVIEW" && "$MODE" != "DELETE" ]]; then',
    '  echo "[ABORT] MODE는 PREVIEW 또는 DELETE여야 합니다." >&2',
    '  exit 2',
    'fi',
    'if [[ "$MODE" == "DELETE" && "$CONFIRM_COMPARTMENT" != "$COMPARTMENT" ]]; then',
    '  echo "[ABORT] 실제 삭제에는 confirm compartment OCID가 대상과 완전히 같아야 합니다." >&2',
    '  exit 2',
    'fi',
    '',
    'print_command() { printf "[PREVIEW]"; printf " %q" "$@"; printf "\\n"; }',
    'run_delete() {',
    '  if [[ "$MODE" == "DELETE" ]]; then',
    '    echo "[DELETE] $*"',
    '    "$@" || echo "[WARN] 삭제 실패/진행 중: $*" >&2',
    '  else',
    '    print_command "$@"',
    '  fi',
    '}',
    'list_ids() {',
    '  "$@" --all --query \'data[].id\' --raw-output 2>/dev/null |',
    '    tr -d \'[],"\' | tr \' \' \'\\n\' | sed \'/^$/d\' || true',
    '}',
    'list_item_ids() {',
    '  "$@" --all --query \'data.items[].id\' --raw-output 2>/dev/null |',
    '    tr -d \'[],"\' | tr \' \' \'\\n\' | sed \'/^$/d\' || true',
    '}',
    'cleanup_ids() {',
    '  local label="$1" id_flag="$2"; shift 2',
    '  local -a list_cmd=() delete_cmd=()',
    '  while [[ "$1" != "::" ]]; do list_cmd+=("$1"); shift; done; shift',
    '  delete_cmd=("$@")',
    '  local id',
    '  while IFS= read -r id; do',
    '    [[ -z "$id" || "$id" == "null" ]] && continue',
    '    echo "[FOUND] $label $id"',
    '    run_delete "${delete_cmd[@]}" "$id_flag" "$id" "${CTX[@]}"',
    '  done < <(list_ids "${list_cmd[@]}" "${CTX[@]}")',
    '}',
    '',
    'echo "=== OCI compartment cleansing: $MODE / $COMPARTMENT / $REGION ==="',
    'echo "=== Search inventory (explicit cleanup 목록 밖의 자원도 확인) ==="',
    'oci search resource structured-search --query-text "query all resources where compartmentId = \'$COMPARTMENT\'" --query \'data.items[].{type:"resource-type",name:"display-name",id:identifier}\' --output table "${CTX[@]}" || echo "[WARN] Search inventory 조회 실패" >&2',
    '',
    'if $CLEAN_LOAD_BALANCERS; then',
    '  cleanup_ids "Load Balancer" --load-balancer-id oci lb load-balancer list --compartment-id "$COMPARTMENT" :: oci lb load-balancer delete --force',
    '  cleanup_ids "Network Load Balancer" --network-load-balancer-id oci nlb network-load-balancer list --compartment-id "$COMPARTMENT" :: oci nlb network-load-balancer delete --force',
    'fi',
    '',
    'if $CLEAN_DATABASES; then',
    '  cleanup_ids "Autonomous Database" --autonomous-database-id oci db autonomous-database list --compartment-id "$COMPARTMENT" :: oci db autonomous-database delete --force',
    '  cleanup_ids "Base DB System" --db-system-id oci db system list --compartment-id "$COMPARTMENT" :: oci db system terminate --force',
    '  cleanup_ids "MySQL DB System" --db-system-id oci mysql db-system list --compartment-id "$COMPARTMENT" :: oci mysql db-system delete --force',
    'fi',
    '',
    'if $CLEAN_COMPUTE; then',
    '  cleanup_ids "Instance Pool" --instance-pool-id oci compute-management instance-pool list --compartment-id "$COMPARTMENT" :: oci compute-management instance-pool terminate --force',
    '  cleanup_ids "Compute Instance" --instance-id oci compute instance list --compartment-id "$COMPARTMENT" :: oci compute instance terminate --preserve-boot-volume false --force',
    '  cleanup_ids "Instance Configuration" --instance-configuration-id oci compute-management instance-configuration list --compartment-id "$COMPARTMENT" :: oci compute-management instance-configuration delete',
    '  cleanup_ids "Custom Image" --image-id oci compute image list --compartment-id "$COMPARTMENT" :: oci compute image delete --force',
    'fi',
    '',
    'if $CLEAN_LOGGING; then',
    '  while IFS= read -r group_id; do',
    '    [[ -z "$group_id" || "$group_id" == "null" ]] && continue',
    '    while IFS= read -r log_id; do',
    '      [[ -z "$log_id" || "$log_id" == "null" ]] && continue',
    '      echo "[FOUND] Log $log_id"',
    '      run_delete oci logging log delete --log-group-id "$group_id" --log-id "$log_id" --force "${CTX[@]}"',
    '    done < <(list_ids oci logging log list --log-group-id "$group_id" "${CTX[@]}")',
    '    echo "[FOUND] Log Group $group_id"',
    '    run_delete oci logging log-group delete --log-group-id "$group_id" --force "${CTX[@]}"',
    '  done < <(list_ids oci logging log-group list --compartment-id "$COMPARTMENT" "${CTX[@]}")',
    'fi',
    '',
    'if $CLEAN_LOG_ANALYTICS; then',
    '  if [[ -z "$LA_NAMESPACE" ]]; then',
    '    echo "[SKIP] Log Analytics: namespace가 비어 있습니다. 테넌시 전체 offboard는 수행하지 않습니다."',
    '  else',
    '    while IFS= read -r entity_id; do',
    '      [[ -z "$entity_id" || "$entity_id" == "null" ]] && continue',
    '      echo "[FOUND] Log Analytics Entity $entity_id"',
    '      run_delete oci log-analytics entity delete --namespace-name "$LA_NAMESPACE" --entity-id "$entity_id" --force "${CTX[@]}"',
    '    done < <(list_item_ids oci log-analytics entity list --namespace-name "$LA_NAMESPACE" --compartment-id "$COMPARTMENT" "${CTX[@]}")',
    '    PURGE_UNTIL=$(date -u +%Y-%m-%dT%H:%M:%SZ)',
    '    run_delete oci log-analytics storage purge-storage-data --namespace-name "$LA_NAMESPACE" --compartment-id "$COMPARTMENT" --compartment-id-in-subtree false --time-data-ended "$PURGE_UNTIL" "${CTX[@]}"',
    '  fi',
    'fi',
    '',
    'if $CLEAN_STORAGE; then',
    '  OS_NAMESPACE=$(oci os ns get "${CTX[@]}" --query data --raw-output 2>/dev/null || true)',
    '  if [[ -n "$OS_NAMESPACE" && "$OS_NAMESPACE" != "null" ]]; then',
    '    while IFS= read -r bucket; do',
    '      [[ -z "$bucket" || "$bucket" == "null" ]] && continue',
    '      echo "[FOUND] Object Storage Bucket $bucket"',
    '      run_delete oci os object bulk-delete --namespace-name "$OS_NAMESPACE" --bucket-name "$bucket" --force "${CTX[@]}"',
    '      run_delete oci os bucket delete --namespace-name "$OS_NAMESPACE" --bucket-name "$bucket" --force "${CTX[@]}"',
    '    done < <(oci os bucket list --namespace-name "$OS_NAMESPACE" --compartment-id "$COMPARTMENT" --all --query \'data[].name\' --raw-output "${CTX[@]}" 2>/dev/null | tr -d \'[],"\' | tr \' \' \'\\n\' | sed \'/^$/d\' || true)',
    '  fi',
    '  cleanup_ids "File Storage Export" --export-id oci fs export list --compartment-id "$COMPARTMENT" :: oci fs export delete --force',
    '  cleanup_ids "File Storage Mount Target" --mount-target-id oci fs mount-target list --compartment-id "$COMPARTMENT" :: oci fs mount-target delete --force',
    '  cleanup_ids "File System" --file-system-id oci fs file-system list --compartment-id "$COMPARTMENT" :: oci fs file-system delete --force',
    'fi',
    '',
    'if $CLEAN_STORAGE_BACKUPS; then',
    '  cleanup_ids "Boot Volume Backup" --boot-volume-backup-id oci bv boot-volume-backup list --compartment-id "$COMPARTMENT" :: oci bv boot-volume-backup delete --force',
    '  cleanup_ids "Block Volume Backup" --volume-backup-id oci bv backup list --compartment-id "$COMPARTMENT" :: oci bv backup delete --force',
    '  cleanup_ids "Volume Group Backup" --volume-group-backup-id oci bv volume-group-backup list --compartment-id "$COMPARTMENT" :: oci bv volume-group-backup delete --force',
    'fi',
    '',
    'if $CLEAN_DB_BACKUPS; then',
    '  cleanup_ids "Base DB Backup" --backup-id oci db backup list --compartment-id "$COMPARTMENT" :: oci db backup delete --force',
    '  cleanup_ids "MySQL Backup" --backup-id oci mysql backup list --compartment-id "$COMPARTMENT" :: oci mysql backup delete --force',
    '  cleanup_ids "Autonomous DB Backup" --autonomous-database-backup-id oci db autonomous-database-backup list --compartment-id "$COMPARTMENT" :: oci db autonomous-database-backup delete --force',
    'fi',
    '',
    'if $CLEAN_STORAGE; then',
    '  cleanup_ids "Volume Group" --volume-group-id oci bv volume-group list --compartment-id "$COMPARTMENT" :: oci bv volume-group delete --force',
    '  cleanup_ids "Block Volume" --volume-id oci bv volume list --compartment-id "$COMPARTMENT" :: oci bv volume delete --force',
    '  cleanup_ids "Boot Volume" --boot-volume-id oci bv boot-volume list --compartment-id "$COMPARTMENT" :: oci bv boot-volume delete --force',
    'fi',
    '',
    'if $CLEAN_NETWORK; then',
    '  cleanup_ids "DRG Attachment" --drg-attachment-id oci network drg-attachment list --compartment-id "$COMPARTMENT" :: oci network drg-attachment delete --force',
    '  cleanup_ids "Remote Peering Connection" --remote-peering-connection-id oci network remote-peering-connection list --compartment-id "$COMPARTMENT" :: oci network remote-peering-connection delete --force',
    '  cleanup_ids "Local Peering Gateway" --local-peering-gateway-id oci network local-peering-gateway list --compartment-id "$COMPARTMENT" :: oci network local-peering-gateway delete --force',
    '  cleanup_ids "NAT Gateway" --nat-gateway-id oci network nat-gateway list --compartment-id "$COMPARTMENT" :: oci network nat-gateway delete --force',
    '  cleanup_ids "Service Gateway" --service-gateway-id oci network service-gateway list --compartment-id "$COMPARTMENT" :: oci network service-gateway delete --force',
    '  cleanup_ids "Internet Gateway" --ig-id oci network internet-gateway list --compartment-id "$COMPARTMENT" :: oci network internet-gateway delete --force',
    '  cleanup_ids "Subnet" --subnet-id oci network subnet list --compartment-id "$COMPARTMENT" :: oci network subnet delete --force',
    '  cleanup_ids "Network Security Group" --nsg-id oci network nsg list --compartment-id "$COMPARTMENT" :: oci network nsg delete --force',
    '  cleanup_ids "Reserved Public IP" --public-ip-id oci network public-ip list --scope REGION --compartment-id "$COMPARTMENT" :: oci network public-ip delete --force',
    '  cleanup_ids "Dynamic Routing Gateway" --drg-id oci network drg list --compartment-id "$COMPARTMENT" :: oci network drg delete --force',
    '  cleanup_ids "Virtual Cloud Network" --vcn-id oci network vcn list --compartment-id "$COMPARTMENT" :: oci network vcn delete --force',
    'fi',
    '',
    'echo "=== 완료: 비동기 삭제 또는 의존성 충돌이 남으면 같은 스크립트를 다시 실행하세요. ==="',
  ].join('\n')
}

function buildCli(cmd: CliCommand, values: Record<string, string>, dyn: Record<string, boolean>, operation: CrudVerb): string {
  if (cmd.crossCopy) return buildCrossCopy(cmd.crossCopy, values)
  if (cmd.maintenanceReboot) return buildMaintenanceReboot(values, operation === 'update' ? 'update' : 'get')
  if (cmd.compartmentCleanup) return buildCompartmentCleanup(values)
  if (cmd.resource === 'mysql-backup' && operation === 'create') return buildMysqlBackupCreate(values, dyn)
  if (cmd.manualBackup) return buildManualBackup(cmd.manualBackup, values)

  const selected = cmd.operations?.[operation] ?? cmd

  const prelude: string[] = []
  const args: string[] = []

  const compOption = allOptions(selected).find(o => o.name === '--compartment-id')
  const compStatic = (values['--compartment-id'] ?? '').trim()
  const compDynamic = !!compOption && isDynamic(dyn, '--compartment-id') && (compOption.required || !!compStatic)
  // 다른 동적 조회가 참조할 compartment 표현
  const compRef = compDynamic ? '"$COMP"' : (compStatic ? compStatic : '<compartment-ocid>')

  if (compDynamic) {
    const name = compStatic || '<compartment-name>'
    prelude.push(
      `COMP=$(oci iam compartment list --compartment-id-in-subtree true --all \\\n` +
      `  --query "data[?name=='${name}'].id | [0]" --raw-output)`,
    )
  }

  for (const o of allOptions(selected)) {
    const v = (values[o.name] ?? '').trim()
    if (o.lookupOnly) continue
    if (o.flag) {
      if (v === 'true') args.push(`  ${o.name}`)
      continue
    }
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
    const quoted = o.shellQuote || /\s|[{}$]/.test(v) ? `'${v.replaceAll("'", "'\\''")}'` : v
    args.push(`  ${o.name} ${quoted}`)
  }

  const main = [selected.cmd, ...args].join(' \\\n')
  return prelude.length ? prelude.join('\n\n') + '\n\n' + main : main
}

const catOfResource = (catalog: Catalog, r: string) =>
  catalog.categories.find(c => c.groups.some(g => g.resources.includes(r)))?.id

export default function CliBuilderPage() {
  const { showToast, rewardActivity } = useHub()
  const protectedState = useProtectedData()
  const CAT = (protectedState.data?.cliCatalog as Catalog | undefined) ?? EMPTY_CATALOG
  const [sp] = useSearchParams()
  const rParam = sp.get('r')                                  // Ctrl+K 딥링크: ?r=<resource>
  const [active, setActive] = useState<string>('__custom')
  const [values, setValues] = useState<Record<string, string>>({})
  const [dyn, setDyn] = useState<Record<string, boolean>>({})
  const [customText, setCustomText] = useState('oci ')
  const [favs, setFavs] = useState<Favorite[]>(loadFavs())
  const [showOptional, setShowOptional] = useState(false)
  const [crudOperation, setCrudOperation] = useState<CrudVerb>('create')
  const [outOpen, setOutOpen] = useState(true)          // 최종 명령 접기/펼치기
  const [outUncapped, setOutUncapped] = useState(false) // 사용자가 다시 열면 높이 제한 해제
  // 딥링크로 들어온 자원의 카테고리는 펼쳐 둔다 (그 외는 닫힘)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})

  // 팔레트에서 ?r 이 바뀌며 재진입하면 해당 자원 선택 + 카테고리 펼침
  useEffect(() => {
    if (!rParam || !CAT.commands[rParam]) return
    const operation = defaultOperation(CAT.commands[rParam])
    setActive(rParam); setValues(operationDefaults(CAT.commands[rParam], operation)); setDyn({}); setShowOptional(false); setCrudOperation(operation)
    const cat = catOfResource(CAT, rParam)
    if (cat) setOpenCats(s => ({ ...s, [cat]: true }))
  }, [rParam, CAT])

  // 검증 상태 — 내가 직접 실행해 확인한 명령만 파란색. blog-db knowledge/oci-cli/verified.json 공유.
  const pat = getPat()
  const [verified, setVerified] = useState<string[]>([])
  const vShaRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!pat && protectedState.data?.cliVerified) setVerified(protectedState.data.cliVerified)
  }, [pat, protectedState.data])
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
  const selectedOperation = cmd?.operations?.[crudOperation]
  const formSections = cmd?.maintenanceReboot
    ? cmd.sections.filter((_, index) => crudOperation === 'update' || index === 0)
    : selectedOperation?.sections ?? cmd?.sections ?? []
  const formAdvanced = selectedOperation?.advanced ?? cmd?.advanced ?? []
  const hasCrud = !!cmd && !cmd.crossCopy && !cmd.compartmentCleanup && (!!cmd.maintenanceReboot || !!cmd.operations)
  const isOperationAvailable = (operation: CrudVerb) => supportsOperation(cmd, operation)
  const operationHelp = cmd?.maintenanceReboot
    ? crudOperation === 'update'
      ? '인스턴스 유지보수 재부팅 예정 시각을 변경합니다.'
      : '유지보수 재부팅을 연장할 수 있는 최대 시각을 조회합니다.'
    : selectedOperation?.help || cmd?.help
  const cli = useMemo(
    () => cmd ? buildCli(cmd, values, dyn, crudOperation) : customText,
    [cmd, values, dyn, crudOperation, customText],
  )

  const selectResource = (res: string) => {
    const next = CAT.commands[res]
    setActive(res); setDyn({}); setShowOptional(false)
    if (next) {
      const operation = defaultOperation(next)
      setCrudOperation(operation); setValues(operationDefaults(next, operation))
    } else setValues({})
  }
  const selectOperation = (operation: CrudVerb) => {
    if (!isOperationAvailable(operation)) return
    setCrudOperation(operation); setValues(cmd ? operationDefaults(cmd, operation) : {}); setDyn({}); setShowOptional(false)
  }
  const setVal = (name: string, v: string) => setValues(s => ({ ...s, [name]: v }))
  const toggleCat = (id: string) => setOpenCats(s => ({ ...s, [id]: !s[id] }))

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cli)
      const rewarded = rewardActivity(`cli-copy:${active}`, 5, 'OCI CLI 명령 복사')
      if (!rewarded) showToast('클립보드에 복사됨')
    }
    catch { showToast('복사 실패 — 수동 선택') }
  }, [active, cli, rewardActivity, showToast])

  const toggleOutput = useCallback(() => {
    if (!outOpen) setOutUncapped(true)
    setOutOpen(open => !open)
  }, [outOpen])

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.code === 'KeyO') {
        e.preventDefault(); e.stopImmediatePropagation(); toggleOutput()
      } else if (e.code === 'KeyC') {
        e.preventDefault(); e.stopImmediatePropagation(); void copy()
      }
    }
    window.addEventListener('keydown', onShortcut, true)
    return () => window.removeEventListener('keydown', onShortcut, true)
  }, [copy, toggleOutput])

  const addFav = () => {
    const name = prompt('즐겨찾기 이름', cmd ? `${cmd.label} ${values['--display-name'] || ''}`.trim() : 'custom')
    if (!name) return
    const fav: Favorite = {
      id: `fav-${favs.length}-${name}`, name, resource: active,
      values: active === '__custom' ? { __custom: customText } : values, dyn, operation: crudOperation,
    }
    const next = [...favs, fav]; setFavs(next); saveFavs(next); showToast('즐겨찾기 저장됨')
  }
  const loadFav = (f: Favorite) => {
    if (f.resource === '__custom') { setActive('__custom'); setCustomText(f.values.__custom || 'oci ') }
    else {
      setActive(f.resource); setValues(f.values); setDyn(f.dyn ?? {}); setShowOptional(true)
      const favoriteCommand = CAT.commands[f.resource]
      if (favoriteCommand) setCrudOperation(f.operation && supportsOperation(favoriteCommand, f.operation) ? f.operation : defaultOperation(favoriteCommand))
    }
  }
  const delFav = (id: string) => { const n = favs.filter(f => f.id !== id); setFavs(n); saveFavs(n) }



  // 전용 레시피 화면에선 동적 조회 비활성 — OCID와 실행 환경을 직접 입력
  const noDyn = !!(cmd?.crossCopy || cmd?.maintenanceReboot || cmd?.compartmentCleanup || cmd?.manualBackup)
  const SPECIAL_COMMANDS = Object.values(CAT.commands).filter(c => c.crossCopy || c.compartmentCleanup)
  const field = (o: CliOption, optional?: boolean) => {
    const mysqlBackupTarget = cmd?.resource === 'mysql-backup' && crudOperation === 'create'
    const dynamicAllowed = !noDyn && o.name in DYNAMIC && (o.name !== '--db-system-id' || mysqlBackupTarget)
    return <Field key={o.name} o={o} value={values[o.name] || ''} onChange={v => setVal(o.name, v)} optional={optional}
      dynamic={dynamicAllowed && isDynamic(dyn, o.name)}
      onToggleDynamic={dynamicAllowed ? (on => setDyn(s => ({ ...s, [o.name]: on }))) : undefined}
      subVal={k => values[subKey(o.name, k)] || ''}
      onSub={(k, v) => setVal(subKey(o.name, k), v)} />
  }

  if (!protectedState.data) return (
    <div className="cli-main">
      <div className="cmt-empty">{protectedState.loading ? '보호된 OCI CLI 데이터를 복호화하는 중…' : protectedState.error}</div>
    </div>
  )

  return (
    <div className="cli-layout">
      {/* 좌측 계층 네비 — 대분류 아코디언 (기본 닫힘) */}
      <aside className="cli-nav">
        <button className={`cli-navitem custom${active === '__custom' ? ' on' : ''}`} onClick={() => setActive('__custom')}>
          <span className="px">Custom</span>
        </button>
        {SPECIAL_COMMANDS.map(c => (
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
        {hasCrud && (
          <div className="cli-crud-strip" aria-label={`${cmd?.label} 명령 선택`}>
            {CRUD_OPERATIONS.map(operation => {
              const available = isOperationAvailable(operation.verb)
              return (
              <button type="button" key={operation.verb} disabled={!available}
                className={`cli-crud-op verb-${operation.verb}${crudOperation === operation.verb ? ' selected' : ''}`}
                aria-pressed={available ? crudOperation === operation.verb : undefined}
                title={`${operation.verb.toUpperCase()}${available ? ' 명령 선택' : ' 명령 없음'}`}
                onClick={() => selectOperation(operation.verb)}>
                <span className="cli-crud-icon" aria-hidden="true">{operation.icon}</span>
                <span className="cli-crud-verb">{operation.verb.toUpperCase()}</span>
              </button>
              )
            })}
          </div>
        )}
        {cmd
          ? <p className="cli-help">{operationHelp}</p>
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

        {cmd?.compartmentCleanup && (
          <div className="cross-note cleanup-note">
            기본은 <b>PREVIEW</b>이며 조회만 실행하고 삭제 예정 명령을 보여줍니다. 실제 삭제는 <b>DELETE</b> 선택과
            동일한 컴파트먼트 OCID 재입력이 모두 맞아야 시작됩니다. Log Analytics는 테넌시 전체 offboard를 하지 않습니다.
          </div>
        )}

        {cmd ? (
          <div className="cli-form">
            {formSections.map(sec => (
              <div key={sec.label} className="cli-sec">
                <div className="cli-section-label px">{sec.label}</div>
                {sec.options.map(o => field(o, !o.required))}
              </div>
            ))}
            {formAdvanced.length > 0 && <>
              <button className="cli-optional-toggle" onClick={() => setShowOptional(s => !s)}>
                {showOptional ? '▾' : '▸'} 고급 옵션 {formAdvanced.length}개 (태그·대기 등) {showOptional ? '접기' : '펼치기'}
              </button>
              {showOptional && formAdvanced.map(o => field(o, true))}
            </>}
          </div>
        ) : (
          <textarea className="cmdinput cli-custom" value={customText} onChange={e => setCustomText(e.target.value)}
            placeholder="oci compute instance launch --compartment-id ... " />
        )}

        <div className="cli-result">
          <div className="cli-result-hd">
            <button className="cli-out-toggle" aria-expanded={outOpen} aria-keyshortcuts="Alt+O"
              title="최종 명령 접기/펼치기 (Alt+O)" onClick={toggleOutput}>
              <span className="cli-out-caret" aria-hidden="true">{outOpen ? '▾' : '▸'}</span>
              <span>최종 명령</span>
              <kbd className="cli-shortcut">Alt+O</kbd>
            </button>
            <div className="cli-result-actions">
              <button className="submitbtn cli-copybtn" aria-keyshortcuts="Alt+C" title="최종 명령 복사 (Alt+C)" onClick={copy}>
                복사 <kbd className="cli-shortcut">Alt+C</kbd>
              </button>
              <button className="donebtn" style={{ marginTop: 0 }} onClick={addFav}>즐겨찾기 저장</button>
            </div>
          </div>
          {outOpen && <pre className={`cli-output${outUncapped ? '' : ' initial'}`}>{cli}</pre>}
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
      {o.lookupOnly ? <span>{o.displayLabel || o.name}</span> : <code>{o.name}</code>}
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
  if (o.flag) {
    return (
      <div className="cli-field">
        {label}
        <label className="cli-flag-control">
          <input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : '')} />
          <span>{value === 'true' ? '사용' : '사용 안 함'}</span>
        </label>
      </div>
    )
  }
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
  if (o.suggestions?.length) {
    const listId = `cli-suggestions-${o.name.replaceAll('-', '')}`
    return (
      <div className="cli-field">
        {label}
        <input className="cli-input" list={listId} value={value} placeholder={o.placeholder}
          onChange={e => onChange(e.target.value)} />
        <datalist id={listId}>
          {o.suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}
        </datalist>
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
