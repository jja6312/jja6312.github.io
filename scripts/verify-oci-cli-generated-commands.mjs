#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import ts from 'typescript'

const fail = message => { throw new Error(message) }
const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const page = readFileSync(resolve('src/pages/CliBuilderPage.tsx'), 'utf8')
const optionSource = readFileSync(resolve('src/lib/cliOptionModel.ts'), 'utf8')

const compiledOptionModel = ts.transpileModule(optionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const optionModule = { exports: {} }
vm.runInNewContext(compiledOptionModel, { module: optionModule, exports: optionModule.exports })
const optionModel = optionModule.exports

const builderStart = page.indexOf('const formatCliCommand')
const builderEnd = page.indexOf('\nconst catOfResource', builderStart)
if (builderStart < 0 || builderEnd < 0) fail('OCI CLI builder extraction failed')
const commonNames = [
  ...catalog.executionContext.request.map(option => option.name),
  ...catalog.executionContext.response.map(option => option.name),
]
const harness = `
const JSONSPEC = {}
const allOptions = command => [...(command.lookupInputs ?? []), ...command.sections.flatMap(section => section.options), ...command.advanced]
const isDynamic = (dynamic, name) => dynamic[name] === true
const isExecutionContextName = name => ${JSON.stringify(commonNames)}.includes(name)
const isCliOptionValueActive = ${optionModel.isCliOptionValueActive.toString()}
const serializeCliOption = ${optionModel.serializeCliOption.toString()}
const quoteCliValue = ${optionModel.quoteCliValue.toString()}
const splitRepeatedCliValues = ${optionModel.splitRepeatedCliValues.toString()}
const buildJsonValue = (name, values) => values[name] || '{}'
const subKey = (option, key) => option + '::' + key
const buildMultiSelectQuery = value => value
${page.slice(builderStart, builderEnd)}
globalThis.buildCli = buildCli
globalThis.buildImageDiscoveryCommand = buildImageDiscoveryCommand
globalThis.buildInstanceLaunchPreflightCommand = buildInstanceLaunchPreflightCommand
`
const builderContext = {}
vm.runInNewContext(ts.transpileModule(harness, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText, builderContext)
const buildCli = builderContext.buildCli
const buildImageDiscoveryCommand = builderContext.buildImageDiscoveryCommand
const buildInstanceLaunchPreflightCommand = builderContext.buildInstanceLaunchPreflightCommand
if (typeof buildCli !== 'function') fail('OCI CLI buildCli harness did not compile')
if (typeof buildImageDiscoveryCommand !== 'function') fail('OCI image discovery harness did not compile')
if (typeof buildInstanceLaunchPreflightCommand !== 'function') fail('OCI Instance preflight harness did not compile')

const allOptions = surface => [
  ...(surface.lookupInputs ?? []),
  ...(surface.sections ?? []).flatMap(section => section.options),
  ...(surface.advanced ?? []),
]
const uniqueOptions = (...surfaces) => {
  const byName = new Map()
  for (const surface of surfaces) {
    for (const option of allOptions(surface)) byName.set(option.name, option)
  }
  return [...byName.values()]
}
const sampleValue = option => {
  if (option.defaultValue !== undefined) return String(option.defaultValue)
  if (option.flag) return option.required ? 'true' : ''
  if (option.choices?.length) return String(option.choices[0])
  if (option.type === 'json') {
    if (option.name === '--statements') return '["Allow group ExampleGroup to inspect all-resources in tenancy"]'
    return '{}'
  }
  if (option.type === 'file') return './input.txt'
  if (option.type === 'datetime' || option.name.startsWith('--time-')) return '2026-08-30T23:18:00Z'
  if (option.name === '--availability-domain') return 'Uocm:AP-SEOUL-1-AD-1'
  if (option.name.includes('cidr')) return option.multiple ? '10.0.0.0/24\n10.0.1.0/24' : '10.0.0.0/24'
  if (option.name.includes('email')) return 'operator@example.com'
  if (option.name.includes('password')) return 'Example-Password-2026!'
  if (option.name === '--query-text') return 'CpuUtilization[1m].mean() > 80'
  if (option.name === '--severity') return 'CRITICAL'
  if (option.name === '--namespace-name') return 'example_namespace'
  if (option.name.endsWith('-id') || option.name.endsWith('-ids')) {
    const kind = option.name.replace(/^--/, '').replace(/-ids?$/, '').replaceAll('-', '') || 'resource'
    const value = `ocid1.${kind}.oc1.ap-seoul-1.exampleuniqueid`
    return option.multiple ? `${value}1\n${value}2` : value
  }
  if (option.name.includes('name')) return 'example-resource'
  if (option.name.includes('port')) return '443'
  if (option.type === 'int' || option.type === 'float') return '1'
  if (option.type === 'bool') return 'true'
  return option.multiple ? 'example-one\nexample-two' : 'example-value'
}

const makeValues = (command, surface) => {
  const options = uniqueOptions(command, surface)
  const byName = new Map(options.map(option => [option.name, option]))
  const values = {}
  for (const option of options) {
    if (option.defaultValue !== undefined || option.required || option.requirement === 'required') {
      values[option.name] = sampleValue(option)
    }
  }
  for (const rule of surface.rules ?? []) {
    if (rule.kind === 'oneOf') {
      const [selected, ...others] = rule.options ?? []
      if (selected && byName.has(selected)) values[selected] = sampleValue(byName.get(selected))
      for (const name of others) values[name] = ''
    } else if (rule.kind === 'mutuallyExclusive') {
      const active = (rule.options ?? []).filter(name => optionModel.isCliOptionValueActive(byName.get(name), values[name] ?? ''))
      for (const name of active.slice(1)) values[name] = ''
    } else if (rule.kind === 'requires' && rule.when
      && optionModel.isCliOptionValueActive(byName.get(rule.when), values[rule.when] ?? '')) {
      for (const name of rule.requires ?? []) {
        if (byName.has(name)) values[name] = sampleValue(byName.get(name))
      }
    }
  }
  for (const option of options) {
    if (!optionModel.isCliOptionValueActive(option, values[option.name] ?? '')) continue
    for (const conflict of option.conflictsWith ?? []) {
      if (optionModel.isCliOptionValueActive(byName.get(conflict), values[conflict] ?? '')) values[conflict] = ''
    }
  }
  return values
}

const records = []
for (const [resource, command] of Object.entries(catalog.commands)) {
  const operations = Object.entries(command.operations ?? {})
  if (operations.length) {
    for (const [operation, surface] of operations) records.push({ resource, command, operation, surface })
  } else {
    records.push({ resource, command, operation: command.preferredOperation ?? 'create', surface: command })
  }
  for (const [action, surface] of Object.entries(command.actions ?? {})) {
    records.push({ resource, command, operation: command.preferredOperation ?? 'get', action, surface })
  }
}
if (records.length !== 219) fail(`Expected 219 command surfaces, got ${records.length}`)

let requiredGuards = 0
let actionScripts = 0
let specialScripts = 0
const scripts = new Map()
for (const record of records) {
  const { resource, command, operation, action, surface } = record
  const validationSurface = command.maintenanceReboot
    ? { ...command, sections: command.sections.filter((_section, index) => operation === 'update' || index === 0) }
    : surface
  const options = uniqueOptions(validationSurface).filter(option => !commonNames.includes(option.name))
  const values = makeValues(command, surface)
  const validation = optionModel.validateCliOptions(options, values, surface.rules ?? [])
  if (!validation.valid) {
    fail(`${resource}:${action ? `action:${action}` : operation} sample is invalid: ${JSON.stringify(validation.issues)}`)
  }
  const empty = optionModel.validateCliOptions(options, {}, surface.rules ?? [])
  if (options.some(option => (option.requirement ?? (option.required ? 'required' : 'optional')) === 'required')
    || (surface.rules ?? []).some(rule => rule.kind === 'oneOf')) {
    requiredGuards += 1
    if (empty.valid) fail(`${resource}:${action ? `action:${action}` : operation} accepts empty required input`)
  }
  const responseEnabled = !command.crossCopy && !command.maintenanceReboot && !command.compartmentCleanup
    && !command.allSubscriptionBalances && !command.iamMfaReset && !command.manualBackup
  const script = buildCli(command, values, {}, operation, action,
    ["--profile 'DEFAULT'"], responseEnabled ? ['--output json'] : [])
  const key = `${resource}:${action ? `action:${action}` : operation}`
  if (!script.trim() || /\b(?:undefined|NaN)\b/.test(script)) fail(`${key} generated an invalid placeholder`)
  scripts.set(key, script)
  actionScripts += action ? 1 : 0
  specialScripts += !!(command.crossCopy || command.maintenanceReboot || command.compartmentCleanup
    || command.allSubscriptionBalances || command.iamMfaReset || command.manualBackup)
}

const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'
const syntaxBatch = [...scripts.entries()]
  .map(([key, script]) => `# ===== ${key} =====\n{\n${script}\n}\n`)
  .join('\n')
const syntax = spawnSync(bash, ['-n'], { input: syntaxBatch, encoding: 'utf8' })
if (syntax.status !== 0) fail(`Generated command Bash syntax invalid: ${syntax.stderr}`)

const imageDiscovery = buildImageDiscoveryCommand({
  '--compartment-id': 'production',
  '--shape': 'VM.Standard.E5.Flex',
}, { '--compartment-id': true }, ["--profile 'DEFAULT'", "--region 'ap-seoul-1'"])
for (const marker of [
  'oci compute image list', '--lifecycle-state AVAILABLE', '--sort-by TIMECREATED',
  'IMAGE_ARGS+=(--shape', 'VM.Standard.E5.Flex', 'IMAGE_COMPARTMENT_COUNT', 'found=$IMAGE_COMPARTMENT_COUNT',
  '--profile \'DEFAULT\'', '--region \'ap-seoul-1\'',
]) {
  if (!imageDiscovery.includes(marker)) fail(`Instance image discovery missing marker: ${marker}`)
}
const imageSyntax = spawnSync(bash, ['-n'], { input: imageDiscovery, encoding: 'utf8' })
if (imageSyntax.status !== 0) fail(`Instance image discovery Bash syntax invalid: ${imageSyntax.stderr}`)

const instancePreflight = buildInstanceLaunchPreflightCommand({
  '--compartment-id': 'production', '--availability-domain': '1',
}, { '--compartment-id': true, '--availability-domain': true },
["--profile 'DEFAULT'", "--region 'ap-seoul-1'"], { '--profile': 'DEFAULT', '--region': 'ap-seoul-1' })
for (const marker of [
  'oci compute shape list', '--availability-domain "$AD_NAME"', 'SHAPE_COUNT=',
  'oci compute image list', '--shape "$SHAPE_NAME"', 'compatibleShape: $shape', 'group_by(.id)',
  'compatibleShapes:', 'oci-instance-launch-preflight/v2',
  'COMPARTMENT_COUNT=', 'found=$COMPARTMENT_COUNT', '-----BEGIN OCI INSTANCE PREFLIGHT JSON-----',
  '--profile \'DEFAULT\'', '--region \'ap-seoul-1\'',
]) {
  if (!instancePreflight.includes(marker)) fail(`Instance launch preflight missing marker: ${marker}`)
}
for (const forbidden of ['사용할 Shape 번호', 'OCI_SHAPE_INDEX', '=== 사용 가능한 Shape:']) {
  if (instancePreflight.includes(forbidden)) fail(`Instance launch preflight must not print/select Shape in terminal: ${forbidden}`)
}
const preflightSyntax = spawnSync(bash, ['-n'], { input: instancePreflight, encoding: 'utf8' })
if (preflightSyntax.status !== 0) fail(`Instance launch preflight Bash syntax invalid: ${preflightSyntax.stderr}`)
const shapeFilter = instancePreflight.match(/SHAPES=\$\(jq -c '([\s\S]*?)' <<<"\$SHAPES_RESPONSE"\)/)?.[1]
if (!shapeFilter) fail('Instance launch preflight Shape jq filter extraction failed')
const shapeFilterResult = spawnSync('jq', ['-c', shapeFilter], {
  input: JSON.stringify({ data: [
    { shape: 'VM.Standard3.Flex', 'processor-description': 'Intel Xeon', 'is-flexible': true },
    { shape: 'VM.Standard.A1.Flex', 'processor-description': 'Ampere Altra', 'is-flexible': true },
    { shape: 'VM.Standard.E5.Flex', 'processor-description': 'AMD EPYC', 'is-flexible': true },
  ] }),
  encoding: 'utf8',
})
if (shapeFilterResult.status !== 0) fail(`Instance launch preflight Shape jq invalid: ${shapeFilterResult.stderr}`)
const normalizedShapes = JSON.parse(shapeFilterResult.stdout)
if (JSON.stringify(normalizedShapes.map(shape => [shape.vendor, shape.shape])) !== JSON.stringify([
  ['AMD', 'VM.Standard.E5.Flex'], ['Intel', 'VM.Standard3.Flex'], ['Ampere', 'VM.Standard.A1.Flex'],
])) fail(`Instance launch preflight Shape classification/order invalid: ${shapeFilterResult.stdout}`)
const imageMatrixFilter = instancePreflight.match(/IMAGES=\$\(jq -sc '([\s\S]*?)' "\$IMAGE_ROWS_FILE"\)/)?.[1]
if (!imageMatrixFilter) fail('Instance launch preflight Image compatibility jq filter extraction failed')
const imageMatrixResult = spawnSync('jq', ['-sc', imageMatrixFilter], {
  input: [
    { id: 'ocid1.image.example1', name: 'Oracle Linux 9', os: 'Oracle Linux', version: '9', compatibleShape: 'VM.Standard.E5.Flex' },
    { id: 'ocid1.image.example1', name: 'Oracle Linux 9', os: 'Oracle Linux', version: '9', compatibleShape: 'VM.Standard3.Flex' },
    { id: 'ocid1.image.example2', name: 'Oracle Linux 9 ARM', os: 'Oracle Linux', version: '9', compatibleShape: 'VM.Standard.A1.Flex' },
  ].map(row => JSON.stringify(row)).join('\n'),
  encoding: 'utf8',
})
if (imageMatrixResult.status !== 0) fail(`Instance launch preflight Image compatibility jq invalid: ${imageMatrixResult.stderr}`)
const normalizedImages = JSON.parse(imageMatrixResult.stdout)
if (normalizedImages.length !== 2
  || JSON.stringify(normalizedImages.find(image => image.id.endsWith('example1'))?.compatibleShapes)
    !== JSON.stringify(['VM.Standard.E5.Flex', 'VM.Standard3.Flex'])) {
  fail(`Instance launch preflight Image compatibility aggregation invalid: ${imageMatrixResult.stdout}`)
}

let dynamicLookups = 0
const dynamicScripts = []
const dynamicScriptMap = new Map()
for (const record of records) {
  const { resource, command, operation, action, surface } = record
  const dynamicOptions = allOptions(surface).filter(option => option.dynamicLookup)
  if (!dynamicOptions.length) continue
  const values = makeValues(command, surface)
  const dynamic = {}
  for (const option of dynamicOptions) {
    dynamic[option.name] = true
    if (option.dynamicLookup.kind === 'exactName') {
      values[option.name] = option.dynamicLookup.multiple ? 'example-one\nexample-two' : 'example-resource'
    } else values[option.name] = 'example-compartment'
  }
  for (const input of surface.lookupInputs ?? []) {
    if (input.defaultValue !== undefined) values[input.name] = String(input.defaultValue)
    else if (input.name === '--lookup-compartment-id') values[input.name] = 'example-compartment'
  }
  const script = buildCli(command, values, dynamic, operation, action,
    ["--profile 'DEFAULT'"], command.maintenanceReboot ? [] : ['--output json'])
  const key = `${resource}:${action ? `action:${action}` : operation}`
  const rootOnly = command.rootTenancyLookup
    && dynamicOptions.every(option => option.dynamicLookup.kind === 'compartment')
  if (rootOnly) {
    if (!script.includes('ocid1.tenancy.*')) fail(`${key}: root tenancy derivation lacks OCID validation`)
  } else if (!script.includes('found=$') || !script.includes('exit 1')) {
    fail(`${key}: dynamic lookup lacks explicit 0/1/N guard`)
  }
  if (dynamicOptions.some(option => option.dynamicLookup.kind === 'exactName')
    && (!script.includes('command -v jq') || !script.includes(' | length'))) {
    fail(`${key}: exact-name lookup lacks jq exact-match resolution`)
  }
  dynamicLookups += dynamicOptions.length
  dynamicScriptMap.set(key, script)
  dynamicScripts.push(`# ===== dynamic ${key} =====\n{\n${script}\n}\n`)
}
const dynamicSyntax = spawnSync(bash, ['-n'], { input: dynamicScripts.join('\n'), encoding: 'utf8' })
if (dynamicSyntax.status !== 0) fail(`Dynamic lookup Bash syntax invalid: ${dynamicSyntax.stderr}`)
if (dynamicLookups < 200) fail(`Too few required-ID dynamic lookup surfaces covered: ${dynamicLookups}`)

const dynamicFlowAssertions = [
  ['instance:get', ['oci compute instance list', 'display-name', 'LOOKUP_INSTANCE_ID_COUNT']],
  ['announcement:get', ['oci announce announcements list', 'reference-ticket-number']],
  ['export:create', ['oci fs export-set list', 'oci fs file-system list', 'oci iam availability-domain list']],
  ['load-balancer:create', ['oci network subnet list', 'LOOKUP_SUBNET_IDS_JSON']],
  ['instance-maintenance-reboot:get', ['oci compute instance list', 'INSTANCE_COUNT']],
]
for (const [key, markers] of dynamicFlowAssertions) {
  const script = dynamicScriptMap.get(key)
  if (!script) fail(`${key}: representative dynamic lookup command was not generated`)
  for (const marker of markers) {
    if (!script.includes(marker)) fail(`${key}: missing dynamic lookup marker ${marker}`)
  }
}

const quoted = optionModel.serializeCliOption({ name: '--name' }, "O'Reilly; echo unsafe")
if (quoted.join('') !== "--name 'O'\\''Reilly; echo unsafe'") fail(`Unsafe shell value was not quoted: ${quoted}`)
const jsonArgs = optionModel.serializeCliOption({ name: '--defined-tags' }, '{"Operations":{"Owner":"MSP"}}')
if (jsonArgs.join('') !== "--defined-tags '{\"Operations\":{\"Owner\":\"MSP\"}}'") fail(`JSON quoting failed: ${jsonArgs}`)
const repeated = optionModel.serializeCliOption({ name: '--tag-name', multiple: true, shellQuote: true }, 'first\nsecond value')
if (JSON.stringify(repeated) !== JSON.stringify(["--tag-name 'first'", "--tag-name 'second value'"])) {
  fail(`Multiple option serialization failed: ${JSON.stringify(repeated)}`)
}
if (optionModel.serializeCliOption({ name: '--force', flag: true }, 'true').join('') !== '--force'
  || optionModel.serializeCliOption({ name: '--force', flag: true }, 'false').length !== 0) {
  fail('Flag serialization failed')
}
const exclusive = optionModel.validateCliOptions([
  { name: '--all', flag: true }, { name: '--limit' },
], { '--all': 'true', '--limit': '10' }, [{
  id: 'all-limit', kind: 'mutuallyExclusive', options: ['--all', '--limit'], message: 'exclusive',
}])
if (exclusive.valid || !exclusive.issues.some(issue => issue.code === 'mutuallyExclusive')) {
  fail('Mutually exclusive option regression was not detected')
}

const cleanup = scripts.get('compartment-resource-cleansing:create')
if (!cleanup?.includes('CONFIRM_COMPARTMENT') || !cleanup.includes('confirm compartment OCID')) {
  fail('Compartment cleanup confirmation guard missing from generated command')
}
const mfa = scripts.get('iam-user-mfa-reset:create')
if (!mfa?.includes('CONFIRM_USER_NAME') || !mfa.includes('confirm user name')) {
  fail('IAM MFA reset confirmation guard missing from generated command')
}

console.log(JSON.stringify({
  surfaces: records.length,
  bashSyntax: scripts.size,
  requiredGuards,
  actions: actionScripts,
  specialScripts,
  shellQuote: true,
  json: true,
  multiple: true,
  flag: true,
  mutuallyExclusive: true,
  dangerConfirmations: 2,
  dynamicLookups,
  imageDiscoveryBash: true,
  instancePreflightBash: true,
}))
