#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fail = message => { throw new Error(message) }
const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const clickTree = JSON.parse(readFileSync(resolve(`.protected-cache/oci-cli-runtime/${catalog.source.tag}/click-tree.json`), 'utf8'))
const builder = readFileSync(resolve('src/pages/CliBuilderPage.tsx'), 'utf8')
const reportPath = resolve('OCI_CLI_REQUIRED_OCID_AUDIT.md')
const catalogListCommands = new Set(Object.values(catalog.commands)
  .map(command => command.operations?.list?.cmd).filter(Boolean))

const optionsOf = surface => [
  ...(surface.lookupInputs ?? []),
  ...(surface.sections ?? []).flatMap(section => section.options),
  ...(surface.advanced ?? []),
]
const isRequiredOcid = option => option.required && !option.lookupOnly && /-ids?$/.test(option.name)
const rows = []

for (const [resource, command] of Object.entries(catalog.commands)) {
  const surfaces = Object.keys(command.operations ?? {}).length
    ? Object.entries(command.operations)
    : [['custom', command]]
  surfaces.push(...Object.entries(command.actions ?? {}).map(([action, surface]) => [`action:${action}`, surface]))
  for (const [operation, surface] of surfaces) {
    for (const option of optionsOf(surface).filter(isRequiredOcid)) {
      let status = 'missing'
      let lookup = ''
      let reason = ''
      if (option.dynamicLookup) {
        status = option.dynamicLookup.kind === 'compartment' ? 'dynamic-compartment' : 'dynamic-exact-name'
        lookup = option.dynamicLookup.listCommand ?? 'oci iam compartment list'
        reason = option.dynamicLookup.note
      } else if (option.dynamicLookupImplementedBy === 'dedicated-builder') {
        status = 'dynamic-dedicated'
        lookup = '전용 0/1/N 안전 빌더'
      } else if (option.directLookupReason) {
        status = 'direct-only'
        lookup = '선행 LIST 확인 후 직접 입력'
        reason = option.directLookupReason
      }
      rows.push({ resource, operation, command: surface.cmd, option: option.name, status, lookup, reason })

      if (option.dynamicLookup?.kind === 'exactName') {
        if (!option.dynamicLookup.listCommand
          || (!clickTree.commands[option.dynamicLookup.listCommand] && !catalogListCommands.has(option.dynamicLookup.listCommand))) {
          fail(`${resource}:${operation}:${option.name}: lookup LIST is absent from the pinned final Click tree`)
        }
        if (!option.dynamicLookup.nameField) fail(`${resource}:${operation}:${option.name}: exact-match field missing`)
        if (option.dynamicLookup.scope === 'compartment') {
          const scopeInput = option.dynamicLookup.scopeInput
          if (!scopeInput) fail(`${resource}:${operation}:${option.name}: compartment scope input missing`)
          const available = optionsOf(surface).some(candidate => candidate.name === scopeInput)
          if (!available) fail(`${resource}:${operation}:${option.name}: scope input ${scopeInput} is not rendered`)
        }
      }
      if (option.directLookupReason && option.directLookupReason.trim().length < 20) {
        fail(`${resource}:${operation}:${option.name}: direct-only reason is too vague`)
      }
    }
  }
}

const missing = rows.filter(row => row.status === 'missing')
if (missing.length) fail(`Required OCIDs without a lookup decision: ${JSON.stringify(missing)}`)
if (rows.length < 230) fail(`Required OCID inventory unexpectedly shrank: ${rows.length}`)

const counts = Object.fromEntries([...new Set(rows.map(row => row.status))]
  .sort().map(status => [status, rows.filter(row => row.status === status).length]))
const dynamic = rows.filter(row => row.status.startsWith('dynamic-')).length
const direct = rows.filter(row => row.status === 'direct-only').length
const optionTypes = new Set(rows.map(row => row.option)).size
if (dynamic + direct !== rows.length) fail('Required OCID inventory classification is incomplete')
if (dynamic < 215) fail(`Too few dynamic/dedicated required OCIDs: ${dynamic}`)
if (direct < 10) fail(`Direct-only safety decisions unexpectedly missing: ${direct}`)

for (const marker of [
  'ACTIVE compartment 이름은 tenancy 전체에서 정확히 1개여야 합니다',
  '조회 범위에서 정확히 1개여야 합니다',
  'command -v jq',
  'directLookupReason',
  'dynamicLookup',
]) {
  if (!builder.includes(marker)) fail(`Builder safety marker missing: ${marker}`)
}
if (builder.includes(".id | [0]")) fail('Unvalidated first-result resource lookup remains in the generic builder')

const directRows = rows.filter(row => row.status === 'direct-only')
const markdown = [
  '# OCI CLI 필수 OCID 동적 조회 전수표',
  '',
  `- 생성 기준: Oracle OCI CLI ${catalog.source.version} (${catalog.source.tag}, ${catalog.source.commit})`,
  `- 필수 OCID 입력: ${rows.length}회 / ${optionTypes}종`,
  `- 동적·전용 안전 조회: ${dynamic}회`,
  `- 보안·제품 제약상 직접 입력: ${direct}회`,
  '- 미분류: 0회',
  '',
  '동적 조회는 정확한 이름이 1개일 때만 본 명령을 실행합니다. 0건 또는 중복(N건)이면 후보를 출력하고 종료합니다. 직접 입력 항목도 이유와 선행 LIST 경로를 함께 유지합니다.',
  '',
  '## 직접 입력 유지 결정',
  '',
  '| 리소스 | 동작 | 옵션 | 이유 |',
  '|---|---|---|---|',
  ...directRows.map(row => `| ${row.resource} | ${row.operation} | \`${row.option}\` | ${row.reason.replaceAll('|', '\\|')} |`),
  '',
  '## 전체 표',
  '',
  '| 리소스 | 동작 | 필수 OCID | 처리 | 조회 경로 |',
  '|---|---|---|---|---|',
  ...rows.map(row => `| ${row.resource} | ${row.operation} | \`${row.option}\` | ${row.status} | ${row.lookup || '-'} |`),
  '',
].join('\n')

if (process.argv.includes('--write-report')) writeFileSync(reportPath, markdown, 'utf8')
else if (readFileSync(reportPath, 'utf8') !== markdown) fail('OCI_CLI_REQUIRED_OCID_AUDIT.md is stale; regenerate it')

console.log(JSON.stringify({ requiredOcidOccurrences: rows.length, optionTypes, dynamic, direct, missing: missing.length, counts }))
