#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { webcrypto } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import ts from 'typescript'

const file = JSON.parse(readFileSync(resolve('public/protected-data.json'), 'utf8'))
const verifiers = JSON.parse(readFileSync(resolve('src/data/authVerifiers.json'), 'utf8'))
const cliBuilder = readFileSync(resolve('src/pages/CliBuilderPage.tsx'), 'utf8')
const { subtle } = webcrypto
const dec = new TextDecoder()
const fromB64 = value => new Uint8Array(Buffer.from(value, 'base64'))

async function passwordDecrypt(password, cipher) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(cipher.salt), iterations: 200_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )
  return JSON.parse(dec.decode(await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(cipher.iv) }, key, fromB64(cipher.ct),
  )))
}
async function rawDecrypt(keyB64, cipher) {
  const key = await subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt'])
  return JSON.parse(dec.decode(await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(cipher.iv) }, key, fromB64(cipher.ct),
  )))
}

for (const level of [1, 2, 3]) {
  const password = process.env[`HUB_LOCK_${level}`]
  if (!password) throw new Error(`HUB_LOCK_${level} 환경변수가 필요합니다`)
  if (await passwordDecrypt(password, verifiers[level]) !== 'jja-hub-auth-ok') throw new Error(`L${level} verifier 실패`)
  const keys = await passwordDecrypt(password, file.keyrings[level])
  const parts = await Promise.all(Object.entries(keys).map(([part, key]) => rawDecrypt(key, file.payloads[part])))
  const bundle = Object.assign({}, ...parts)
  if (!bundle.cliCatalog || Object.keys(bundle.cliCatalog.commands).length < 1) throw new Error(`L${level} CLI 누락`)
  const instanceGroup = bundle.cliCatalog.categories
    .flatMap(category => category.groups)
    .find(group => group.label === 'Instances')
  if (!instanceGroup?.resources.includes('instance-maintenance-reboot')) throw new Error(`L${level} Instance 메뉴 등록 누락`)
  if (bundle.cliCatalog.commands['instance-maintenance-reboot']?.cmd !== 'oci compute instance-maintenance-reboot get') {
    throw new Error(`L${level} maintenance reboot 조회 명령 오류`)
  }
  if (!instanceGroup.resources.includes('instance-boot-volume-backup')) {
    throw new Error(`L${level} instance boot volume manual backup menu missing`)
  }
  if (bundle.cliCatalog.commands['instance-boot-volume-backup']?.manualBackup !== 'instance-boot-volume') {
    throw new Error(`L${level} instance boot volume manual backup metadata invalid`)
  }
  const mysqlGroup = bundle.cliCatalog.categories
    .flatMap(category => category.groups)
    .find(group => group.label === 'MySQL HeatWave')
  if (JSON.stringify(mysqlGroup?.resources) !== JSON.stringify(['mysql', 'mysql-backup'])) {
    throw new Error(`L${level} MySQL resource boundary invalid: ${JSON.stringify(mysqlGroup?.resources)}`)
  }
  const mysqlDbSystem = bundle.cliCatalog.commands.mysql
  if (mysqlDbSystem.operations?.get?.cmd !== 'oci mysql db-system get'
    || mysqlDbSystem.operations?.list?.cmd !== 'oci mysql db-system list') {
    throw new Error(`L${level} existing MySQL DB System GET/LIST changed`)
  }
  const requiredNames = operation => operation.sections.flatMap(section => section.options)
    .filter(option => option.required && !option.lookupOnly).map(option => option.name).sort()
  if (JSON.stringify(requiredNames(mysqlDbSystem.operations.get)) !== JSON.stringify(['--db-system-id'])) {
    throw new Error(`L${level} MySQL DB System GET required fields invalid`)
  }
  const mysqlGetOptions = mysqlDbSystem.operations.get.sections.flatMap(section => section.options)
  const mysqlGetOption = name => mysqlGetOptions.find(option => option.name === name)
  if (mysqlGetOption('--lookup-compartment-id')?.required !== false
    || mysqlGetOption('--lookup-compartment-id')?.lookupOnly !== true) {
    throw new Error(`L${level} MySQL DB System GET lookup compartment metadata invalid`)
  }
  if (mysqlGetOption('--db-system-id')?.required !== true
    || mysqlGetOption('--profile')?.defaultValue !== 'DEFAULT'
    || mysqlGetOption('--region')?.defaultValue !== 'ap-seoul-1') {
    throw new Error(`L${level} MySQL DB System GET dynamic lookup fields invalid`)
  }
  if (JSON.stringify(requiredNames(mysqlDbSystem.operations.list)) !== JSON.stringify(['--compartment-id'])) {
    throw new Error(`L${level} MySQL DB System LIST required fields invalid`)
  }
  const mysqlBackup = bundle.cliCatalog.commands['mysql-backup']
  const expectedBackupCommands = {
    get: 'oci mysql backup get', list: 'oci mysql backup list', create: 'oci mysql backup create',
    update: 'oci mysql backup update', delete: 'oci mysql backup delete',
  }
  for (const [operation, command] of Object.entries(expectedBackupCommands)) {
    if (mysqlBackup?.operations?.[operation]?.cmd !== command) {
      throw new Error(`L${level} MySQL Backup ${operation} command invalid`)
    }
  }
  const backupCreateOptions = mysqlBackup.operations.create.sections.flatMap(section => section.options)
  if (JSON.stringify(requiredNames(mysqlBackup.operations.create)) !== JSON.stringify(['--db-system-id'])) {
    throw new Error(`L${level} MySQL Backup CREATE must require only --db-system-id`)
  }
  for (const name of ['--backup-type', '--description', '--display-name', '--retention-in-days', '--soft-delete', '--profile', '--region']) {
    if (backupCreateOptions.find(option => option.name === name)?.required !== false) {
      throw new Error(`L${level} MySQL Backup optional field marked required: ${name}`)
    }
  }
  const accountCategory = bundle.cliCatalog.categories.find(category => category.id === '01-account')
  const subscriptionGroup = accountCategory?.groups.find(group => group.label === 'Subscriptions')
  if (!subscriptionGroup?.resources.includes('subscription-balance')) {
    throw new Error(`L${level} Subscription Balance menu missing`)
  }
  const subscriptionBalance = bundle.cliCatalog.commands['subscription-balance']
  if (subscriptionBalance?.preferredOperation !== 'list' || subscriptionBalance?.disableDynamic !== true) {
    throw new Error(`L${level} Subscription Balance default operation metadata invalid`)
  }
  if (JSON.stringify(Object.keys(subscriptionBalance.operations ?? {}).sort()) !== JSON.stringify(['list'])) {
    throw new Error(`L${level} Subscription Balance must expose LIST only`)
  }
  const subscriptionList = subscriptionBalance.operations.list
  if (subscriptionList.cmd !== 'oci onesubscription subscribed-service subscribed-service list') {
    throw new Error(`L${level} Subscription Balance LIST command invalid`)
  }
  if (JSON.stringify(requiredNames(subscriptionList)) !== JSON.stringify(['--compartment-id', '--subscription-id'])) {
    throw new Error(`L${level} Subscription Balance required fields invalid`)
  }
  const subscriptionOptions = subscriptionList.sections.flatMap(section => section.options)
  const subscriptionOption = name => subscriptionOptions.find(option => option.name === name)
  if (!subscriptionOption('--all')?.flag || subscriptionOption('--all')?.defaultValue !== 'true'
    || subscriptionOption('--output')?.defaultValue !== 'table') {
    throw new Error(`L${level} Subscription Balance result defaults invalid`)
  }
  const subscriptionQuery = subscriptionOption('--query')?.defaultValue ?? ''
  for (const field of ['funded-allocation-value', 'used-amount', 'available-amount']) {
    if (!subscriptionQuery.includes(field)) throw new Error(`L${level} Subscription Balance query missing ${field}`)
  }

  const announcementGroup = bundle.cliCatalog.categories
    .flatMap(category => category.groups)
    .find(group => group.label === 'Announcements')
  if (!announcementGroup?.resources.includes('announcement')) {
    throw new Error(`L${level} Announcements menu missing`)
  }
  const announcement = bundle.cliCatalog.commands.announcement
  if (announcement?.preferredOperation !== 'list' || announcement?.disableDynamic !== true) {
    throw new Error(`L${level} Announcements default operation metadata invalid`)
  }
  if (JSON.stringify(Object.keys(announcement.operations ?? {}).sort()) !== JSON.stringify(['get', 'list'])) {
    throw new Error(`L${level} Announcements must expose GET and LIST only`)
  }
  if (announcement.operations.get.cmd !== 'oci announce announcements get'
    || announcement.operations.list.cmd !== 'oci announce announcements list') {
    throw new Error(`L${level} Announcements command invalid`)
  }
  if (JSON.stringify(requiredNames(announcement.operations.get)) !== JSON.stringify(['--announcement-id'])
    || JSON.stringify(requiredNames(announcement.operations.list)) !== JSON.stringify(['--compartment-id'])) {
    throw new Error(`L${level} Announcements required fields invalid`)
  }
  const announcementOptions = announcement.operations.list.sections.flatMap(section => section.options)
  const announcementOption = name => announcementOptions.find(option => option.name === name)
  if (!announcementOption('--all')?.flag || announcementOption('--all')?.defaultValue !== 'true'
    || announcementOption('--output')?.defaultValue !== 'table') {
    throw new Error(`L${level} Announcements result defaults invalid`)
  }
  const announcementQuery = announcementOption('--query')?.defaultValue ?? ''
  for (const field of ['reference-ticket-number', 'announcement-type', 'affected-regions', 'time-one-value']) {
    if (!announcementQuery.includes(field)) throw new Error(`L${level} Announcements query missing ${field}`)
  }
  const cleanup = bundle.cliCatalog.commands['compartment-resource-cleansing']
  if (!cleanup?.compartmentCleanup) throw new Error(`L${level} compartment cleansing 메뉴 누락`)
  const cleanupOptions = cleanup.sections.flatMap(section => section.options)
  if (cleanupOptions.find(option => option.name === '--mode')?.defaultValue !== 'PREVIEW') {
    throw new Error(`L${level} compartment cleansing PREVIEW 기본값 오류`)
  }
  if (!cleanupOptions.find(option => option.name === '--cleanup-log-analytics')?.defaultValue) {
    throw new Error(`L${level} compartment cleansing Log Analytics 옵션 누락`)
  }
  const fullCrudCommands = Object.values(bundle.cliCatalog.commands).filter(command => command.operations
    && ['get', 'list', 'create', 'update', 'delete'].every(operation => command.operations[operation]?.cmd))
  if (fullCrudCommands.length !== 38) throw new Error(`L${level} full CRUD resource count invalid: ${fullCrudCommands.length}`)
  for (const command of fullCrudCommands) {
    for (const operation of ['get', 'list', 'create', 'update', 'delete']) {
      if (!command.operations[operation]?.cmd) throw new Error(`L${level} ${command.resource} ${operation} 명령 누락`)
    }
  }
  const instanceGetOptions = bundle.cliCatalog.commands.instance.operations.get.sections.flatMap(section => section.options)
  const queryOption = instanceGetOptions.find(option => option.name === '--query')
  const rawOption = instanceGetOptions.find(option => option.name === '--raw-output')
  if (queryOption?.defaultValue !== 'data."time-maintenance-reboot-due"') throw new Error(`L${level} Instance GET query 기본값 오류`)
  if (!rawOption?.flag || rawOption.defaultValue !== 'true') throw new Error(`L${level} Instance GET raw-output 플래그 오류`)
  if ((level >= 2) !== !!bundle.schedule) throw new Error(`L${level} schedule 범위 오류`)
  if (level >= 2 && !Object.hasOwn(bundle.schedule.goals, 'longTermGoal')) throw new Error(`L${level} 장기 목표 필드 누락`)
  if ((level >= 3) !== !!bundle.meetings) throw new Error(`L${level} meetings 범위 오류`)
  if ((level >= 3) !== !!bundle.provisioning) throw new Error(`L${level} provisioning 범위 오류`)
  if ((level >= 3) !== !!bundle.supportHistory) throw new Error(`L${level} 지원이력 범위 오류`)
  if (level >= 3) {
    const fssCase = bundle.supportHistory.find(item => item.id === 'support-2026-08-11-fss-snapshot-backup')
    if (!fssCase || fssCase.validation?.samples !== 882 || fssCase.validation?.failures !== 0) {
      throw new Error(`L${level} FSS 지원이력 또는 검증 수치 누락`)
    }
  }
  console.log(`L${level} 복호화 OK · payload ${Object.keys(keys).length}개`)
}

if (!cliBuilder.includes(`--query 'data."time-maintenance-reboot-due-max"'`)) throw new Error('최대 연장 시각 query 누락')
if (!cliBuilder.includes('oci compute instance update')) throw new Error('재부팅 달력 update 명령 누락')
if (!cliBuilder.includes('confirm compartment OCID')) throw new Error('컴파트먼트 정리 이중 확인 가드 누락')
if (!cliBuilder.includes('oci log-analytics storage purge-storage-data')) throw new Error('Log Analytics compartment purge 누락')
if (!cliBuilder.includes('oci compute boot-volume-attachment list')) throw new Error('instance boot volume attachment lookup missing')
if (!cliBuilder.includes('oci bv boot-volume-backup create')) throw new Error('boot volume manual backup create missing')
if (!cliBuilder.includes('oci mysql backup create')) throw new Error('MySQL manual backup create missing')
if (!cliBuilder.includes('command.preferredOperation')) throw new Error('preferred CRUD operation selection missing')
if (!cliBuilder.includes('cmd?.disableDynamic')) throw new Error('direct tenancy input mode missing')
if (!cliBuilder.includes('function buildMysqlBackupCreate')
  || !cliBuilder.includes("cmd.resource === 'mysql-backup' && operation === 'create'")) {
  throw new Error('MySQL Backup CREATE builder not connected to the Backup resource')
}
if (!cliBuilder.includes('function buildMysqlDbSystemGet')
  || !cliBuilder.includes("cmd.resource === 'mysql' && operation === 'get'")) {
  throw new Error('MySQL DB System GET dynamic builder not connected')
}
if (cliBuilder.includes('buildMysqlDbSystemOps') || cliBuilder.includes('mysqlDbSystemOps')) {
  throw new Error('mixed MySQL DB System/Backup builder must not return')
}
if (!cliBuilder.includes('if (o.lookupOnly) continue')) throw new Error('lookup-only field leaks into OCI command')
if (!cliBuilder.includes('COMPARTMENT_COUNT') || !cliBuilder.includes('INSTANCE_COUNT') || !cliBuilder.includes('DB_SYSTEM_COUNT')) {
  throw new Error('manual backup duplicate-name guards missing')
}

const builderStart = cliBuilder.indexOf('function buildMysqlBackupCreate')
const builderEnd = cliBuilder.indexOf('/* Build a safety-gated Bash cleanup script', builderStart)
if (builderStart < 0 || builderEnd < 0) throw new Error('MySQL Backup builder source extraction failed')
const builderHarness = `
const DYNAMIC = {'--lookup-compartment-id': {}, '--db-system-id': {}}
const isDynamic = (dyn, name) => name in DYNAMIC ? (dyn[name] ?? true) : false
${cliBuilder.slice(builderStart, builderEnd)}
globalThis.dynamicScript = buildMysqlBackupCreate({
  '--lookup-compartment-id': 'prod', '--db-system-id': 'mysql-prod-01',
  '--profile': 'DEFAULT', '--region': 'ap-seoul-1',
  '--display-name': 'mysql-prod-01-manual', '--description': '', '--backup-type': 'FULL', '--retention-in-days': '7',
  '--soft-delete': 'ENABLED', '--freeform-tags': '', '--defined-tags': '', '--wait-for-state': '',
  '--max-wait-seconds': '', '--wait-interval-seconds': '',
}, {})
globalThis.directScript = buildMysqlBackupCreate({
  '--lookup-compartment-id': '', '--db-system-id': 'ocid1.mysqldbsystem.oc1.ap-seoul-1.example',
  '--profile': '', '--region': '',
}, {'--db-system-id': false})
globalThis.dynamicGetScript = buildMysqlDbSystemGet({
  '--lookup-compartment-id': 'prod', '--db-system-id': 'mysql-prod-01',
  '--profile': 'DEFAULT', '--region': 'ap-seoul-1', '--if-none-match': '',
}, {})
globalThis.directGetScript = buildMysqlDbSystemGet({
  '--lookup-compartment-id': '', '--db-system-id': 'ocid1.mysqldbsystem.oc1.ap-seoul-1.example',
  '--profile': '', '--region': '', '--if-none-match': 'etag-example',
}, {'--db-system-id': false})
`
const context = {}
vm.runInNewContext(ts.transpileModule(builderHarness, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, context)
for (const [mode, script] of Object.entries({ dynamic: context.dynamicScript, direct: context.directScript })) {
  if (!script.includes('oci mysql backup create') || script.includes('--lookup-compartment-id')) {
    throw new Error(`MySQL Backup ${mode} script command/lookup field invalid`)
  }
  if (script.startsWith('#!/usr/bin/env bash') || script.includes('EXTRA_ARGS=')
    || script.includes('oci mysql backup get')) {
    throw new Error(`MySQL Backup ${mode} must end as a normal CREATE command, not a workflow wrapper`)
  }
  const syntax = spawnSync('C:\\Program Files\\Git\\bin\\bash.exe', ['-n'], { input: script, encoding: 'utf8' })
  if (syntax.status !== 0) throw new Error(`MySQL Backup ${mode} bash syntax invalid: ${syntax.stderr}`)
}
if (!context.dynamicScript.includes('oci mysql db-system list') || context.directScript.includes('oci mysql db-system list')) {
  throw new Error('MySQL Backup name/OCID selection mode invalid')
}
for (const expected of [
  '--display-name "mysql-prod-01-manual"', '--backup-type "FULL"',
  '--retention-in-days "7"', '--soft-delete "ENABLED"',
]) {
  if (!context.dynamicScript.includes(expected)) throw new Error(`MySQL Backup CREATE optional value missing: ${expected}`)
}
if (context.directScript.split('\n').length > 4
  || !context.directScript.includes('--db-system-id "ocid1.mysqldbsystem.oc1.ap-seoul-1.example"')) {
  throw new Error('MySQL Backup direct OCID mode must remain a short OCI command')
}
for (const [mode, script] of Object.entries({ dynamic: context.dynamicGetScript, direct: context.directGetScript })) {
  if (!script.includes('oci mysql db-system get') || script.includes('--lookup-compartment-id')) {
    throw new Error(`MySQL DB System GET ${mode} command/lookup field invalid`)
  }
  if (!script.includes('[[ -n "$IF_NONE_MATCH" ]] && GET_ARGS+=(--if-none-match "$IF_NONE_MATCH")')) {
    throw new Error(`MySQL DB System GET ${mode} does not guard --if-none-match`)
  }
  const syntax = spawnSync('C:\\Program Files\\Git\\bin\\bash.exe', ['-n'], { input: script, encoding: 'utf8' })
  if (syntax.status !== 0) throw new Error(`MySQL DB System GET ${mode} bash syntax invalid: ${syntax.stderr}`)
}
if (!context.dynamicGetScript.includes('oci mysql db-system list')
  || context.directGetScript.includes('oci mysql db-system list')
  || !context.dynamicGetScript.includes('DB_SYSTEM_COUNT')) {
  throw new Error('MySQL DB System GET name/OCID selection mode invalid')
}
