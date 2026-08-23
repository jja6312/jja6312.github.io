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
const generatedCliCatalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const cliSourceLock = JSON.parse(readFileSync(resolve('scripts/oci-cli-source.lock.json'), 'utf8'))
const { subtle } = webcrypto
const dec = new TextDecoder()
const fromB64 = value => new Uint8Array(Buffer.from(value, 'base64'))

for (const key of ['repository', 'releaseUrl', 'tag', 'version', 'commit', 'tree', 'publishedAt', 'collectedAt']) {
  if (generatedCliCatalog.source?.[key] !== cliSourceLock[key]) {
    throw new Error(`OCI CLI catalog source provenance mismatch: ${key}`)
  }
}
if (generatedCliCatalog.source?.metadataCollector !== 'final-click-tree') {
  throw new Error('OCI CLI catalog must use the final Click-tree metadata collector')
}
for (const [resource, command] of Object.entries(generatedCliCatalog.commands)) {
  if (command.source?.tag !== cliSourceLock.tag || command.source?.version !== cliSourceLock.version
    || command.source?.commit !== cliSourceLock.commit
    || !['generated', 'manual-curation'].includes(command.source?.kind)) {
    throw new Error(`${resource}: mixed or missing OCI CLI source provenance`)
  }
}

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
  if (bundle.cliCatalog.source?.metadataCollector !== 'final-click-tree') {
    throw new Error(`L${level} final Click-tree provenance 누락`)
  }
  const publicOptionNames = operation => new Set([
    ...operation.sections.flatMap(section => section.options),
    ...operation.advanced,
  ].map(option => option.name))
  const contextOption = (surface, name) => surface.contextOverrides?.[name]
    ?? [...bundle.cliCatalog.executionContext.request, ...bundle.cliCatalog.executionContext.response]
      .find(option => option.name === name)
  const requestContextNames = bundle.cliCatalog.executionContext?.request?.map(option => option.name)
  const responseContextNames = bundle.cliCatalog.executionContext?.response?.map(option => option.name)
  if (JSON.stringify(requestContextNames) !== JSON.stringify(['--profile', '--region', '--auth', '--endpoint'])
    || JSON.stringify(responseContextNames) !== JSON.stringify(['--output', '--query', '--raw-output'])) {
    throw new Error(`L${level} OCI CLI common execution context schema missing`)
  }
  const alarmCreateNames = publicOptionNames(bundle.cliCatalog.commands.alarm.operations.create)
  if (!alarmCreateNames.has('--query-text') || alarmCreateNames.has('--query-parameterconflict')) {
    throw new Error(`L${level} Alarm 공개 query 옵션 오류`)
  }
  const onsCreateNames = publicOptionNames(bundle.cliCatalog.commands.subscription.operations.create)
  if (!onsCreateNames.has('--subscription-endpoint') || onsCreateNames.has('--endpoint-parameterconflict')) {
    throw new Error(`L${level} ONS Subscription 공개 endpoint 옵션 오류`)
  }
  const catalogOperations = Object.values(bundle.cliCatalog.commands)
    .flatMap(command => Object.values(command.operations ?? {}))
  const catalogOptions = catalogOperations.flatMap(operation => [
    ...operation.sections.flatMap(section => section.options), ...operation.advanced,
  ])
  for (const type of ['json', 'file', 'datetime']) {
    if (!catalogOptions.some(option => option.type === type)) throw new Error(`L${level} ${type} option type missing`)
  }
  if (!catalogOptions.some(option => option.flag)
    || !catalogOptions.some(option => option.type === 'bool' && !option.flag)
    || !catalogOptions.some(option => option.multiple && option.choices?.length)) {
    throw new Error(`L${level} flag/boolean/multiple option model missing`)
  }
  for (const operation of catalogOperations) {
    const options = [...operation.sections.flatMap(section => section.options), ...operation.advanced]
    const all = options.find(option => option.name === '--all')
    const limit = options.find(option => option.name === '--limit')
    if (all && limit && (!all.conflictsWith?.includes('--limit') || !limit.conflictsWith?.includes('--all'))) {
      throw new Error(`L${level} --all/--limit conflict metadata missing: ${operation.cmd}`)
    }
  }
  if (catalogOptions.some(option => option.console)) {
    throw new Error(`L${level} CLI optional option was promoted by Console convention`)
  }
  const instanceCreate = bundle.cliCatalog.commands.instance.operations.create
  const instanceCreateOptions = [
    ...instanceCreate.sections.flatMap(section => section.options), ...instanceCreate.advanced,
  ]
  const instanceRequired = instanceCreateOptions.filter(option => option.required).map(option => option.name).sort()
  if (JSON.stringify(instanceRequired) !== JSON.stringify(['--availability-domain', '--compartment-id', '--subnet-id'])) {
    throw new Error(`L${level} Instance CREATE required metadata mismatch: ${JSON.stringify(instanceRequired)}`)
  }
  const bootSources = ['--image-id', '--source-details', '--source-boot-volume-id']
  if (bootSources.some(name => instanceCreateOptions.find(option => option.name === name)?.requirement !== 'conditional')) {
    throw new Error(`L${level} Instance boot source conditional metadata missing`)
  }
  const bootRule = instanceCreate.rules?.find(rule => rule.id === 'instance-boot-source')
  if (bootRule?.kind !== 'oneOf' || JSON.stringify(bootRule.options) !== JSON.stringify(bootSources)) {
    throw new Error(`L${level} Instance boot source one-of rule missing`)
  }
  const sourceDetails = instanceCreateOptions.find(option => option.name === '--source-details')
  const imageId = instanceCreateOptions.find(option => option.name === '--image-id')
  const shape = instanceCreateOptions.find(option => option.name === '--shape')
  const createShapeConfig = instanceCreateOptions.find(option => option.name === '--shape-config')
  const instanceUpdateOptions = [
    ...bundle.cliCatalog.commands.instance.operations.update.sections.flatMap(section => section.options),
    ...bundle.cliCatalog.commands.instance.operations.update.advanced,
  ]
  const updateShapeConfig = instanceUpdateOptions.find(option => option.name === '--shape-config')
  if (!Array.isArray(sourceDetails?.jsonTemplate) || sourceDetails.jsonTemplate.length !== 3
    || sourceDetails.jsonRules?.discriminator !== 'sourceType'
    || sourceDetails.jsonTemplateCommand !== 'oci compute instance launch --generate-param-json-input source-details') {
    throw new Error(`L${level} Instance source-details structured schema missing`)
  }
  if (imageId?.imagePicker?.listCommand !== 'oci compute image list'
    || imageId.imagePicker.shapeOption !== '--shape'
    || imageId.dynamicLookup
    || imageId.dynamicLookupImplementedBy !== 'dedicated-builder') {
    throw new Error(`L${level} Instance image picker metadata invalid`)
  }
  const launchOrder = instanceCreate.sections.flatMap(section => section.options.map(option => option.name))
  if (launchOrder.indexOf('--shape') < 0 || launchOrder.indexOf('--shape') > launchOrder.indexOf('--image-id')
    || shape?.shapePicker?.listCommand !== 'oci compute shape list'
    || instanceCreate.instanceLaunchPreflight?.schema !== 'oci-instance-launch-preflight/v2'
    || instanceCreate.instanceLaunchPreflight.shapeListCommand !== 'oci compute shape list'
    || instanceCreate.instanceLaunchPreflight.imageListCommand !== 'oci compute image list') {
    throw new Error(`L${level} Instance Shape-first live preflight metadata missing`)
  }
  for (const [operation, shapeConfig] of [['CREATE', createShapeConfig], ['UPDATE', updateShapeConfig]]) {
    if (!shapeConfig?.jsonTemplate?.baselineOcpuUtilization
      || JSON.stringify(shapeConfig.jsonFieldChoices?.baselineOcpuUtilization?.map(choice => choice.value))
        !== JSON.stringify(['BASELINE_1_8', 'BASELINE_1_2', 'BASELINE_1_1'])) {
      throw new Error(`L${level} Instance ${operation} Burstable shape-config metadata missing`)
    }
  }
  const jsonOptions = catalogOperations.flatMap(operation => [
    ...operation.sections.flatMap(section => section.options), ...operation.advanced,
  ]).filter(option => option.type === 'json')
  if (jsonOptions.some(option => !option.jsonTemplateCommand || /^\{\s*\}$/.test(option.placeholder ?? ''))) {
    throw new Error(`L${level} JSON option regressed to an unexplained raw placeholder`)
  }
  if (instanceCreateOptions.some(option => option.name === '--create-vnic-details')
    || !instanceCreate.optionNotices?.some(notice => notice.option === '--create-vnic-details'
      && notice.replacements.includes('--subnet-id'))) {
    throw new Error(`L${level} Instance final VNIC interface metadata mismatch`)
  }
  const deprecatedOptions = catalogOptions.filter(option => option.deprecated)
  if (deprecatedOptions.length < 1 || !deprecatedOptions.some(option => option.replacement?.length)) {
    throw new Error(`L${level} deprecated option metadata missing`)
  }
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
  const mysqlGetOption = name => mysqlGetOptions.find(option => option.name === name) ?? contextOption(mysqlDbSystem.operations.get, name)
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
    if ((backupCreateOptions.find(option => option.name === name) ?? contextOption(mysqlBackup.operations.create, name))?.required !== false) {
      throw new Error(`L${level} MySQL Backup optional field marked required: ${name}`)
    }
  }
  const storageCategory = bundle.cliCatalog.categories.find(category => category.id === '03-storage')
  const objectStorageGroup = storageCategory?.groups.find(group => group.label === 'Object Storage')
  if (JSON.stringify(objectStorageGroup?.resources) !== JSON.stringify(['bucket', 'object-bulk-upload', 'object-sync'])) {
    throw new Error(`L${level} Storage > Object Storage menu invalid`)
  }
  const bulkUpload = bundle.cliCatalog.commands['object-bulk-upload']
  const objectSync = bundle.cliCatalog.commands['object-sync']
  if (bulkUpload?.operations?.create?.cmd !== 'oci os object bulk-upload'
    || objectSync?.operations?.create?.cmd !== 'oci os object sync') {
    throw new Error(`L${level} Object Storage transfer commands invalid`)
  }
  if (bulkUpload.safeCreateOnly !== true || objectSync.safeCreateOnly !== true) {
    throw new Error(`L${level} Object Storage transfer safety metadata invalid`)
  }
  if (JSON.stringify(requiredNames(bulkUpload.operations.create)) !== JSON.stringify(['--bucket-name', '--namespace', '--src-dir']))
    throw new Error(`L${level} Bulk Upload required fields invalid`)
  if (JSON.stringify(requiredNames(objectSync.operations.create)) !== JSON.stringify(['--bucket-name', '--namespace']))
    throw new Error(`L${level} Object Sync required fields invalid`)
  for (const name of ['--dry-run', '--verify-checksum', '--no-follow-symlinks']) {
    if (!publicOptionNames(bulkUpload.operations.create).has(name)) throw new Error(`L${level} Bulk Upload option missing: ${name}`)
  }
  for (const name of ['--src-dir', '--dest-dir', '--delete', '--dry-run']) {
    if (!publicOptionNames(objectSync.operations.create).has(name)) throw new Error(`L${level} Object Sync option missing: ${name}`)
  }
  if (bulkUpload.operations.create.rules?.find(rule => rule.id === 'bulk-upload-overwrite-policy')?.kind !== 'mutuallyExclusive'
    || objectSync.operations.create.rules?.find(rule => rule.id === 'object-sync-direction')?.kind !== 'oneOf') {
    throw new Error(`L${level} Object Storage transfer option rules invalid`)
  }
  const governanceCategory = bundle.cliCatalog.categories.find(category => category.id === '07-governance')
  const accountManagementGroup = governanceCategory?.groups.find(group => group.label === 'Account Management')
  if (JSON.stringify(accountManagementGroup?.resources) !== JSON.stringify(['announcement'])) {
    throw new Error(`L${level} Governance & Administration > Account Management menu invalid`)
  }
  const billingCategory = bundle.cliCatalog.categories.find(category => category.id === '08-billing')
  const billingGroup = billingCategory?.groups.find(group => group.label === 'Billing')
  if (JSON.stringify(billingGroup?.resources) !== JSON.stringify(['subscription-list', 'subscription-balance'])) {
    throw new Error(`L${level} Billing & Cost Management > Billing menu invalid`)
  }
  const subscriptionBalance = bundle.cliCatalog.commands['subscription-balance']
  if (subscriptionBalance?.preferredOperation !== 'list' || subscriptionBalance?.rootTenancyLookup !== true) {
    throw new Error(`L${level} Subscription Balance default operation metadata invalid`)
  }
  if (JSON.stringify(Object.keys(subscriptionBalance.operations ?? {}).sort()) !== JSON.stringify(['list'])) {
    throw new Error(`L${level} Subscription Balance must expose LIST only`)
  }
  const balanceList = subscriptionBalance.operations.list
  if (balanceList.cmd !== 'oci onesubscription subscribed-service subscribed-service list') {
    throw new Error(`L${level} Subscription Balance LIST command invalid`)
  }
  if (JSON.stringify(requiredNames(balanceList)) !== JSON.stringify(['--compartment-id', '--subscription-id'])) {
    throw new Error(`L${level} Subscription Balance required fields invalid`)
  }
  const subscriptionOptions = balanceList.sections.flatMap(section => section.options)
  const subscriptionOption = name => subscriptionOptions.find(option => option.name === name) ?? contextOption(balanceList, name)
  if (!subscriptionOption('--all')?.flag || subscriptionOption('--all')?.defaultValue !== 'true'
    || subscriptionOption('--output')?.defaultValue !== 'table') {
    throw new Error(`L${level} Subscription Balance result defaults invalid`)
  }
  const subscriptionQuery = subscriptionOption('--query')?.defaultValue ?? ''
  if (!subscriptionQuery.startsWith('data[].{') || subscriptionQuery.includes('data.items')) {
    throw new Error(`L${level} Subscription Balance query must target the top-level data array`)
  }
  for (const field of ['funded-allocation-value', 'used-amount', 'available-amount']) {
    if (!subscriptionQuery.includes(field)) throw new Error(`L${level} Subscription Balance query missing ${field}`)
  }

  const subscriptionList = bundle.cliCatalog.commands['subscription-list']
  if (subscriptionList?.preferredOperation !== 'list' || subscriptionList?.rootTenancyLookup !== true
    || JSON.stringify(Object.keys(subscriptionList.operations ?? {})) !== JSON.stringify(['list'])) {
    throw new Error(`L${level} Subscription LIST metadata invalid`)
  }
  if (subscriptionList.operations.list.cmd !== 'oci onesubscription organization-subscription organization-subscription list'
    || JSON.stringify(requiredNames(subscriptionList.operations.list)) !== JSON.stringify(['--compartment-id'])) {
    throw new Error(`L${level} Subscription LIST command or required fields invalid`)
  }
  const subscriptionListOptions = subscriptionList.operations.list.sections.flatMap(section => section.options)
  const subscriptionListOption = name => subscriptionListOptions.find(option => option.name === name) ?? contextOption(subscriptionList.operations.list, name)
  if (!subscriptionListOption('--all')?.flag || subscriptionListOption('--all')?.defaultValue !== 'true'
    || subscriptionListOption('--output')?.defaultValue !== 'table') {
    throw new Error(`L${level} Subscription LIST result defaults invalid`)
  }
  const listQuery = subscriptionListOption('--query')?.defaultValue ?? ''
  for (const field of ['service-name', 'total-value', 'iso-code', 'time-start', 'time-end']) {
    if (!listQuery.includes(field)) throw new Error(`L${level} Subscription LIST query missing ${field}`)
  }

  const announcement = bundle.cliCatalog.commands.announcement
  if (announcement?.preferredOperation !== 'list' || announcement?.rootTenancyLookup !== true) {
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
  const announcementOption = name => announcementOptions.find(option => option.name === name) ?? contextOption(announcement.operations.list, name)
  if (!announcementOption('--all')?.flag || announcementOption('--all')?.defaultValue !== 'true'
    || announcementOption('--output')?.defaultValue !== 'table') {
    throw new Error(`L${level} Announcements result defaults invalid`)
  }
  const announcementQuery = announcementOption('--query')?.defaultValue ?? ''
  if (announcementOption('--query')?.checkbox !== true
    || announcementOption('--query')?.checkboxLabel !== '운영에 필요한 주요 컬럼만 표시') {
    throw new Error(`L${level} Announcements query must use the curated checkbox control`)
  }
  for (const field of ['reference-ticket-number', 'announcement-type', 'affected-regions', 'time-one-value']) {
    if (!announcementQuery.includes(field)) throw new Error(`L${level} Announcements query missing ${field}`)
  }
  const identityCategory = bundle.cliCatalog.categories.find(category => category.id === '06-identity-security')
  const identityGroup = identityCategory?.groups.find(group => group.label === 'Identity')
  if (JSON.stringify(identityGroup?.resources) !== JSON.stringify(['iam-user', 'iam-group', 'iam-policy'])) {
    throw new Error(`L${level} Identity & Security > Identity menu invalid`)
  }
  const expectedIamCommands = {
    'iam-user': 'oci iam user', 'iam-group': 'oci iam group', 'iam-policy': 'oci iam policy',
  }
  for (const [resource, prefix] of Object.entries(expectedIamCommands)) {
    const command = bundle.cliCatalog.commands[resource]
    if (command?.iamResource !== resource.replace('iam-', '')
      || JSON.stringify(Object.keys(command.operations ?? {})) !== JSON.stringify(['get', 'list', 'create', 'update', 'delete'])) {
      throw new Error(`L${level} ${resource} CRUD metadata invalid`)
    }
    for (const operation of ['get', 'list', 'create', 'update', 'delete']) {
      if (command.operations[operation].cmd !== `${prefix} ${operation}`) {
        throw new Error(`L${level} ${resource} ${operation} command invalid`)
      }
    }
  }
  const iamUser = bundle.cliCatalog.commands['iam-user']
  if (JSON.stringify(requiredNames(iamUser.operations.create)) !== JSON.stringify(['--description', '--name'])) {
    throw new Error(`L${level} IAM User CREATE required fields invalid`)
  }
  if (iamUser.actions?.['reset-password']?.cmd !== 'oci iam user ui-password create-or-reset'
    || iamUser.actions?.['assign-group']?.cmd !== 'oci iam group add-user'
    || iamUser.actions?.['upload-api-key']?.cmd !== 'oci iam user api-key upload') {
    throw new Error(`L${level} IAM User actions missing`)
  }
  const apiKeyOptions = iamUser.actions['upload-api-key'].sections.flatMap(section => section.options)
  if (!apiKeyOptions.find(option => option.name === '--key')
    || !apiKeyOptions.find(option => option.name === '--key-file')
    || apiKeyOptions.find(option => option.name === '--key-source')?.defaultValue !== 'KEY_FILE') {
    throw new Error(`L${level} API key mutually exclusive input controls invalid`)
  }
  if (JSON.stringify(requiredNames(bundle.cliCatalog.commands['iam-group'].operations.create)) !== JSON.stringify(['--description', '--name'])) {
    throw new Error(`L${level} IAM Group CREATE required fields invalid`)
  }
  if (JSON.stringify(requiredNames(bundle.cliCatalog.commands['iam-policy'].operations.create))
    !== JSON.stringify(['--compartment-id', '--description', '--name', '--statements'])) {
    throw new Error(`L${level} IAM Policy CREATE required fields invalid`)
  }
  const iamMfaReset = bundle.cliCatalog.commands['iam-user-mfa-reset']
  if (!iamMfaReset?.iamMfaReset || iamMfaReset.cmd !== 'oci iam mfa-totp-device list') {
    throw new Error(`L${level} IAM User MFA reset custom workflow missing`)
  }
  const allBalances = bundle.cliCatalog.commands['all-subscription-balances']
  if (!allBalances?.allSubscriptionBalances
    || allBalances.cmd !== 'oci onesubscription organization-subscription organization-subscription list') {
    throw new Error(`L${level} all Subscription balances custom CLI missing`)
  }
  if (contextOption(allBalances, '--profile')?.defaultValue !== 'DEFAULT'
    || contextOption(allBalances, '--region')?.defaultValue !== 'ap-seoul-1') {
    throw new Error(`L${level} all Subscription balances execution defaults invalid`)
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
  if (fullCrudCommands.length !== 41) throw new Error(`L${level} full CRUD resource count invalid: ${fullCrudCommands.length}`)
  for (const command of fullCrudCommands) {
    for (const operation of ['get', 'list', 'create', 'update', 'delete']) {
      if (!command.operations[operation]?.cmd) throw new Error(`L${level} ${command.resource} ${operation} 명령 누락`)
    }
  }
  const instanceGet = bundle.cliCatalog.commands.instance.operations.get
  const queryOption = contextOption(instanceGet, '--query')
  const rawOption = contextOption(instanceGet, '--raw-output')
  if (queryOption?.defaultValue !== undefined) throw new Error(`L${level} Instance GET query 기본값은 빈 값이어야 함`)
  if (!queryOption?.multiSelect || queryOption.suggestions?.length < 2) {
    throw new Error(`L${level} Instance GET query 복수 선택 설정 누락`)
  }
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
  for (const legacy of ['instance-maintenance-reboot', 'mysql', 'mysql-backup']) {
    if (bundle.cliVerified.includes(legacy)) throw new Error(`L${level} legacy resource-level verification remains: ${legacy}`)
  }
  for (const operationKey of ['instance-maintenance-reboot:get', 'mysql:get', 'mysql-backup:create']) {
    if (!bundle.cliVerified.includes(operationKey)) throw new Error(`L${level} CRUD verification migration missing: ${operationKey}`)
  }
  console.log(`L${level} 복호화 OK · payload ${Object.keys(keys).length}개`)
}

if (!cliBuilder.includes(`--query 'data."time-maintenance-reboot-due-max"'`)) throw new Error('최대 연장 시각 query 누락')
if (!cliBuilder.includes('function buildMultiSelectQuery')) throw new Error('Instance GET 복수 query 조합기 누락')
if (!cliBuilder.includes('if (o.checkbox)')) throw new Error('고정 query 체크박스 UI 누락')
if (!cliBuilder.includes('if (o.multiple)')) throw new Error('Click multiple 옵션 UI 누락')
if (!cliBuilder.includes('conflictsWith')) throw new Error('OCI CLI 옵션 충돌 UI 누락')
if (!cliBuilder.includes('visibleFormSections') || !cliBuilder.includes('showDeprecated')
  || !cliBuilder.includes('cli-rule-panel') || !cliBuilder.includes('조건부 필수')) {
  throw new Error('OCI CLI required/conditional/deprecated UI 누락')
}
if (!cliBuilder.includes('validateCliOptions(formOptions, validationValues, formRules)')
  || !cliBuilder.includes('미완성 명령 미리보기')
  || !cliBuilder.includes('disabled={!commandReady}')
  || !cliBuilder.includes('cli-validation-nav')
  || !cliBuilder.includes('focusValidationField')
  || !cliBuilder.includes('cli-sidebar-resizer left')
  || !cliBuilder.includes('cli-sidebar-resizer right')
  || !cliBuilder.includes('saveCliSidebarWidth')) {
  throw new Error('OCI CLI incomplete-command validation guard 누락')
}
if (!cliBuilder.includes('cli-context-panel') || !cliBuilder.includes('requestContextArguments')
  || !cliBuilder.includes('responseContextArguments') || !cliBuilder.includes('buildRootTenancyLookup(requestContext)')) {
  throw new Error('OCI CLI common execution context layer 누락')
}
if (!cliBuilder.includes('function buildInstanceLaunchPreflightCommand')
  || !cliBuilder.includes('function ShapeOptionField')
  || !cliBuilder.includes('parseInstanceLaunchPreflight')
  || !cliBuilder.includes('cli-instance-preflight')
  || !cliBuilder.includes('compatibleShapes.includes(currentShape)')
  || !cliBuilder.includes("[subKey('--image-id', '__image-scope')]: 'all-shapes'")) {
  throw new Error('Instance CREATE Shape-first live preflight UI 누락')
}
if (!cliBuilder.includes('oci compute instance update')) throw new Error('재부팅 달력 update 명령 누락')
if (!cliBuilder.includes('confirm compartment OCID')) throw new Error('컴파트먼트 정리 이중 확인 가드 누락')
if (!cliBuilder.includes('oci log-analytics storage purge-storage-data')) throw new Error('Log Analytics compartment purge 누락')
if (!cliBuilder.includes('oci compute boot-volume-attachment list')) throw new Error('instance boot volume attachment lookup missing')
if (!cliBuilder.includes('oci bv boot-volume-backup create')) throw new Error('boot volume manual backup create missing')
if (!cliBuilder.includes('oci mysql backup create')) throw new Error('MySQL manual backup create missing')
if (!cliBuilder.includes('defaultCliOperation')) throw new Error('safe preferred CRUD operation selection missing')
if (!cliBuilder.includes('cmd?.disableDynamic')) throw new Error('direct tenancy input mode missing')
if (!cliBuilder.includes('cmd.rootTenancyLookup')
  || !cliBuilder.includes('function buildRootTenancyLookup')) {
  throw new Error('profile-based root tenancy lookup missing')
}
if (!cliBuilder.includes('function buildAllSubscriptionBalances')
  || !cliBuilder.includes('allSubscriptionBalances) return buildAllSubscriptionBalances')) {
  throw new Error('all Subscription balances custom builder not connected')
}
if (!cliBuilder.includes('function buildIamCommand')
  || !cliBuilder.includes('function buildIamMfaReset')
  || !cliBuilder.includes('cmd.iamResource) return buildIamCommand')
  || !cliBuilder.includes('cmd.iamMfaReset) return buildIamMfaReset')) {
  throw new Error('IAM dynamic/action builders not connected')
}
if (!cliBuilder.includes('cli-action-strip') || !cliBuilder.includes('action:${selectedAction}')) {
  throw new Error('IAM action selection or verification UI missing')
}
if (!cliBuilder.includes('Custom CLI') || !cliBuilder.includes('setCustomOpen(open => !open)')) {
  throw new Error('Custom CLI accordion missing')
}
if (!cliBuilder.includes('`${r}:${operation}`') || !cliBuilder.includes('isOperationVerified(active, operation.verb)')) {
  throw new Error('CRUD-level verification controls missing')
}
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
}, {}, ["--profile 'DEFAULT'", "--region 'ap-seoul-1'", '--auth instance_principal', "--endpoint 'https://mysql.example.test'"])
globalThis.directScript = buildMysqlBackupCreate({
  '--lookup-compartment-id': '', '--db-system-id': 'ocid1.mysqldbsystem.oc1.ap-seoul-1.example',
  '--profile': '', '--region': '',
}, {'--db-system-id': false}, ["--profile 'DEFAULT'"])
globalThis.dynamicGetScript = buildMysqlDbSystemGet({
  '--lookup-compartment-id': 'prod', '--db-system-id': 'mysql-prod-01',
  '--profile': 'DEFAULT', '--region': 'ap-seoul-1', '--if-none-match': '',
}, {}, ["--profile 'DEFAULT'", "--region 'ap-seoul-1'", '--auth instance_principal'], ["--query 'data.id'", '--raw-output'])
globalThis.directGetScript = buildMysqlDbSystemGet({
  '--lookup-compartment-id': '', '--db-system-id': 'ocid1.mysqldbsystem.oc1.ap-seoul-1.example',
  '--profile': '', '--region': '', '--if-none-match': 'etag-example',
}, {'--db-system-id': false}, ["--profile 'DEFAULT'"], ['--output table'])
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
for (const expected of ["--profile 'DEFAULT'", "--region 'ap-seoul-1'", '--auth instance_principal', "--endpoint 'https://mysql.example.test'"]) {
  if (!context.dynamicScript.includes(expected)) throw new Error(`MySQL dynamic lookup/main context missing: ${expected}`)
}
for (const expected of ["--query 'data.id'", '--raw-output']) {
  if (!context.dynamicGetScript.includes(expected)) throw new Error(`MySQL GET response context missing: ${expected}`)
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

const iamBuilderStart = cliBuilder.indexOf('function buildIamCommand')
const iamBuilderEnd = cliBuilder.indexOf('\nfunction buildCli', iamBuilderStart)
if (iamBuilderStart < 0 || iamBuilderEnd < 0) throw new Error('IAM builder source extraction failed')
const iamUserCatalog = generatedCliCatalog.commands['iam-user']
const iamPolicyCatalog = generatedCliCatalog.commands['iam-policy']
const iamHarness = `
const allOptions = c => [...c.sections.flatMap(s => s.options), ...c.advanced]
const DYNAMIC = {'--compartment-id': {}, '--user-id': {}, '--group-id': {}, '--policy-id': {}}
const isDynamic = (dyn, name) => name in DYNAMIC ? (dyn[name] ?? true) : false
${cliBuilder.slice(iamBuilderStart, iamBuilderEnd)}
const userCommand = ${JSON.stringify(iamUserCatalog)}
const policyCommand = ${JSON.stringify(iamPolicyCatalog)}
globalThis.userCreate = buildIamCommand(userCommand, userCommand.operations.create, {
  '--name': 'ops.user@example.com', '--description': 'OCI operations', '--email': 'ops.user@example.com',
  '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, {}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'], ['--output table'])
globalThis.passwordReset = buildIamCommand(userCommand, userCommand.actions['reset-password'], {
  '--user-id': 'ops.user@example.com', '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, {}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'])
globalThis.groupAssign = buildIamCommand(userCommand, userCommand.actions['assign-group'], {
  '--user-id': 'ops.user@example.com', '--group-id': 'OCI-Operators', '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, {}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'])
globalThis.apiKeyUpload = buildIamCommand(userCommand, userCommand.actions['upload-api-key'], {
  '--user-id': 'ocid1.user.oc1..example', '--key-source': 'KEY_FILE', '--key-file': '/home/opc/.oci/oci_api_key_public.pem',
  '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, {'--user-id': false}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'])
globalThis.policyCreate = buildIamCommand(policyCommand, policyCommand.operations.create, {
  '--compartment-id': 'ROOT', '--name': 'OCI-Operators-Policy', '--description': 'OCI operators permissions',
  '--statements': '["Allow group OCI-Operators to inspect all-resources in tenancy"]',
  '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, {}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'])
globalThis.mfaPreview = buildIamMfaReset({
  '--user-lookup': 'NAME', '--user-id': 'ops.user@example.com', '--mode': 'PREVIEW',
  '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'])
globalThis.mfaReset = buildIamMfaReset({
  '--user-lookup': 'NAME', '--user-id': 'ops.user@example.com', '--mode': 'RESET',
  '--confirm-user-name': 'ops.user@example.com', '--profile': 'ADMIN', '--region': 'ap-seoul-1',
}, ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token'])
`
const iamContext = {}
vm.runInNewContext(ts.transpileModule(iamHarness, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, iamContext)
const iamScripts = {
  userCreate: iamContext.userCreate,
  passwordReset: iamContext.passwordReset,
  groupAssign: iamContext.groupAssign,
  apiKeyUpload: iamContext.apiKeyUpload,
  policyCreate: iamContext.policyCreate,
  mfaPreview: iamContext.mfaPreview,
  mfaReset: iamContext.mfaReset,
}
for (const [name, script] of Object.entries(iamScripts)) {
  const syntax = spawnSync('C:\\Program Files\\Git\\bin\\bash.exe', ['-n'], { input: script, encoding: 'utf8' })
  if (syntax.status !== 0) throw new Error(`IAM ${name} bash syntax invalid: ${syntax.stderr}`)
}
for (const [name, expected] of Object.entries({
  userCreate: 'oci iam user create',
  passwordReset: 'oci iam user ui-password create-or-reset',
  groupAssign: 'oci iam group add-user',
  apiKeyUpload: 'oci iam user api-key upload',
  policyCreate: 'oci iam policy create',
})) {
  if (!iamScripts[name].includes(expected)) throw new Error(`IAM ${name} command missing: ${expected}`)
}
for (const script of [iamContext.userCreate, iamContext.passwordReset, iamContext.groupAssign, iamContext.policyCreate]) {
  for (const expected of ["--profile 'ADMIN'", "--region 'ap-seoul-1'", '--auth security_token']) {
    if (!script.includes(expected)) throw new Error(`IAM request context missing: ${expected}`)
  }
}
if (!iamContext.passwordReset.includes('USER_ID_COUNT=$(oci iam user list')
  || !iamContext.groupAssign.includes('GROUP_ID_COUNT=$(oci iam group list')
  || !iamContext.groupAssign.includes('--user-id "$USER_ID"')
  || !iamContext.groupAssign.includes('--group-id "$GROUP_ID"')) {
  throw new Error('IAM User/Group exact-name dynamic lookup missing')
}
if (!iamContext.apiKeyUpload.includes('--key-file "/home/opc/.oci/oci_api_key_public.pem"')
  || iamContext.apiKeyUpload.includes('oci iam user list')) {
  throw new Error('IAM API key direct User OCID or public key file handling invalid')
}
if (!iamContext.policyCreate.includes('TENANCY_ID=$(oci iam availability-domain list')
  || !iamContext.policyCreate.includes('--compartment-id "$TENANCY_ID"')
  || !iamContext.policyCreate.includes('--statements "[\\"Allow group OCI-Operators')) {
  throw new Error('IAM Policy ROOT tenancy or statement handling invalid')
}
for (const script of [iamContext.mfaPreview, iamContext.mfaReset]) {
  for (const expected of ['oci iam mfa-totp-device list', 'oci iam mfa-totp-device delete', '--mfa-totp-device-id "$MFA_ID"', '--force']) {
    if (!script.includes(expected)) throw new Error(`IAM MFA workflow missing: ${expected}`)
  }
}
if (!iamContext.mfaReset.includes('CONFIRM_USER_NAME="ops.user@example.com"')
  || !iamContext.mfaReset.includes('if [[ "$CONFIRM_USER_NAME" != "$USER_NAME" ]]')) {
  throw new Error('IAM MFA RESET confirmation guard missing')
}

const allBalancesStart = cliBuilder.indexOf('function buildAllSubscriptionBalances')
const allBalancesEnd = cliBuilder.indexOf('\nfunction buildCli', allBalancesStart)
if (allBalancesStart < 0 || allBalancesEnd < 0) throw new Error('all Subscription balances builder extraction failed')
const allBalancesContext = {}
vm.runInNewContext(ts.transpileModule(`
${cliBuilder.slice(allBalancesStart, allBalancesEnd)}
globalThis.script = buildAllSubscriptionBalances({}, ["--profile 'FINOPS'", "--region 'ap-seoul-1'", '--auth instance_principal'])
globalThis.rootScript = buildRootTenancyLookup(["--profile 'FINOPS'", "--region 'ap-seoul-1'", '--auth instance_principal'])
`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, allBalancesContext)
const allBalancesScript = allBalancesContext.script
if (!allBalancesScript.includes(`--query 'data[].{Product:product.name`)
  || allBalancesScript.includes(`--query 'data.items[].{Product:product.name`)) {
  throw new Error('All Subscription Balances must query the top-level data array')
}
for (const expected of [
  'oci iam availability-domain list',
  'oci onesubscription organization-subscription organization-subscription list',
  'oci onesubscription subscribed-service subscribed-service list',
  '"funded-allocation-value"', '"used-amount"', '"available-amount"',
]) {
  if (!allBalancesScript.includes(expected)) throw new Error(`all Subscription balances script missing: ${expected}`)
}
const allBalancesSyntax = spawnSync('C:\\Program Files\\Git\\bin\\bash.exe', ['-n'], { input: allBalancesScript, encoding: 'utf8' })
if (allBalancesSyntax.status !== 0) throw new Error(`all Subscription balances bash syntax invalid: ${allBalancesSyntax.stderr}`)
for (const expected of [
  "OCI_REQUEST_CONTEXT=(--profile 'FINOPS' --region 'ap-seoul-1' --auth instance_principal)", 'oci iam availability-domain list',
  '--query \'data[0]."compartment-id"\' --raw-output', '[[ "$TENANCY_ID" == ocid1.tenancy.* ]]',
]) {
  if (!allBalancesContext.rootScript.includes(expected)) throw new Error(`root tenancy lookup script missing: ${expected}`)
}
const rootLookupSyntax = spawnSync('C:\\Program Files\\Git\\bin\\bash.exe', ['-n'], { input: allBalancesContext.rootScript, encoding: 'utf8' })
if (rootLookupSyntax.status !== 0) throw new Error(`root tenancy lookup bash syntax invalid: ${rootLookupSyntax.stderr}`)
