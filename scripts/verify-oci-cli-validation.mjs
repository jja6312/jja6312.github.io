#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const modelSource = readFileSync(resolve('src/lib/cliOptionModel.ts'), 'utf8')
const pageSource = readFileSync(resolve('src/pages/CliBuilderPage.tsx'), 'utf8')
const cssSource = readFileSync(resolve('src/index.css'), 'utf8')
const compiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports }, { filename: 'cliOptionModel.js' })
const { validateCliOptions, serializeCliOption } = module.exports

const jsonHelperStart = pageSource.indexOf('const isJsonRecord')
const jsonHelperEnd = pageSource.indexOf('\nfunction buildMultiSelectQuery', jsonHelperStart)
if (jsonHelperStart < 0 || jsonHelperEnd < 0) throw new Error('Structured JSON helper extraction failed')
const jsonHelperHarness = `
const isCliOptionValueActive = ${module.exports.isCliOptionValueActive.toString()}
${pageSource.slice(jsonHelperStart, jsonHelperEnd)}
globalThis.validateJsonInputs = validateJsonInputs
globalThis.parseImageCatalog = parseImageCatalog
`
const jsonHelperContext = {}
vm.runInNewContext(ts.transpileModule(jsonHelperHarness, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText, jsonHelperContext)
const { validateJsonInputs, parseImageCatalog } = jsonHelperContext

const fail = message => { throw new Error(message) }
const optionsOf = command => [
  ...(command?.sections ?? []).flatMap(section => section.options),
  ...(command?.advanced ?? []),
]
const codesOf = result => result.issues.map(issue => issue.code)

const instance = catalog.commands.instance.operations.create
const instanceUpdate = catalog.commands.instance.operations.update
const instanceOptions = optionsOf(instance)
const instanceUpdateOptions = optionsOf(instanceUpdate)
const instanceSourceDetails = instanceOptions.find(option => option.name === '--source-details')
const instanceImageId = instanceOptions.find(option => option.name === '--image-id')
const launchShapeConfig = instanceOptions.find(option => option.name === '--shape-config')
const updateShapeConfig = instanceUpdateOptions.find(option => option.name === '--shape-config')
const baseValues = {
  '--compartment-id': 'ocid1.compartment.oc1..example',
  '--availability-domain': 'Uocm:AP-SEOUL-1-AD-1',
  '--subnet-id': 'ocid1.subnet.oc1.ap-seoul-1.example',
}

const empty = validateCliOptions(instanceOptions, {}, instance.rules)
for (const name of ['--compartment-id', '--availability-domain', '--subnet-id', '--image-id', '--source-details', '--source-boot-volume-id']) {
  if (!empty.missing.includes(name)) fail(`Incomplete Instance launch did not list ${name}`)
}
if (empty.valid || !codesOf(empty).includes('oneOfMissing')) fail('Empty Instance launch must fail its boot-source one-of rule')

const validImage = validateCliOptions(instanceOptions, { ...baseValues, '--image-id': 'ocid1.image.oc1..example' }, instance.rules)
if (!validImage.valid) fail(`Complete image launch was rejected: ${JSON.stringify(validImage.issues)}`)

const multipleSources = validateCliOptions(instanceOptions, {
  ...baseValues,
  '--image-id': 'ocid1.image.oc1..example',
  '--source-details': '{"sourceType":"image","imageId":"ocid1.image.oc1..other"}',
}, instance.rules)
if (multipleSources.valid || !codesOf(multipleSources).includes('oneOfConflict')) {
  fail('Multiple Instance boot sources must be rejected')
}

const missingDependency = validateCliOptions(instanceOptions, {
  ...baseValues,
  '--source-details': '{"sourceType":"image","imageId":"ocid1.image.oc1..example"}',
  '--boot-volume-size-in-gbs': '100',
}, instance.rules)
if (missingDependency.valid || !codesOf(missingDependency).includes('requires')) {
  fail('Boot volume size without --image-id must fail its dependency rule')
}

const allSurfaces = Object.values(catalog.commands).flatMap(command => [
  command,
  ...Object.values(command.operations ?? {}),
  ...Object.values(command.actions ?? {}),
])
const jsonOptions = allSurfaces.flatMap(surface => optionsOf(surface)
  .filter(option => option.type === 'json')
  .map(option => ({ command: surface.cmd, option })))
const unstructuredJson = jsonOptions.filter(({ option }) => !option.jsonTemplateCommand)
const braceOnlyExamples = jsonOptions.filter(({ option }) => /^\{\s*\}$/.test(option.placeholder ?? ''))
if (unstructuredJson.length) fail(`JSON options without schema command: ${JSON.stringify(unstructuredJson.slice(0, 5))}`)
if (braceOnlyExamples.length) fail(`Bare {} JSON examples remain: ${JSON.stringify(braceOnlyExamples.slice(0, 5))}`)
if (instanceSourceDetails?.jsonTemplateCommand !== 'oci compute instance launch --generate-param-json-input source-details'
  || !Array.isArray(instanceSourceDetails.jsonTemplate)
  || instanceSourceDetails.jsonTemplate.length !== 3
  || instanceSourceDetails.jsonRules?.discriminator !== 'sourceType') {
  fail('Instance source-details needs the pinned official variants and structured validation rules')
}
if (instanceImageId?.imagePicker?.listCommand !== 'oci compute image list'
  || instanceImageId.imagePicker.shapeOption !== '--shape'
  || instanceImageId.dynamicLookup
  || instanceImageId.dynamicLookupImplementedBy !== 'dedicated-builder') {
  fail('Instance image-id must use the shape-aware dedicated image picker')
}
const shapeFields = ['baselineOcpuUtilization', 'localVolumeSizeInGBs', 'memoryInGBs', 'nvmes', 'ocpus', 'resourceManagement', 'vcpus']
for (const [operation, shapeConfig] of [['launch', launchShapeConfig], ['update', updateShapeConfig]]) {
  if (JSON.stringify(Object.keys(shapeConfig?.jsonTemplate ?? {})) !== JSON.stringify(shapeFields)
    || JSON.stringify(shapeConfig?.jsonFieldChoices?.baselineOcpuUtilization?.map(choice => choice.value))
      !== JSON.stringify(['BASELINE_1_8', 'BASELINE_1_2', 'BASELINE_1_1'])
    || !shapeConfig?.jsonNotice?.includes('Burstable')
    || !shapeConfig.jsonNotice.includes('PARAVIRTUALIZED')) {
    fail(`Instance ${operation} shape-config lost its official Burstable schema`)
  }
}
const burstableShapeConfig = JSON.stringify({
  baselineOcpuUtilization: 'BASELINE_1_8', ocpus: 1, memoryInGBs: 8,
})
const burstableArguments = serializeCliOption(updateShapeConfig, burstableShapeConfig)
if (burstableArguments.join('') !== `--shape-config '${burstableShapeConfig}'`) {
  fail(`Instance UPDATE Burstable JSON was not serialized safely: ${JSON.stringify(burstableArguments)}`)
}
if (/['"]--shape-config['"]\s*:/.test(pageSource.slice(pageSource.indexOf('const JSONSPEC'), pageSource.indexOf('const subKey')))) {
  fail('Legacy shape-config JSONSPEC still overrides the official structured schema')
}
const sourceDetailChecks = [
  ['{', 'invalid-json'],
  ['{}', 'json-discriminator'],
  ['{"sourceType":"bootVolume"}', 'json-required'],
  ['{"sourceType":"image"}', 'json-one-of'],
]
for (const [value, expected] of sourceDetailChecks) {
  const issues = validateJsonInputs([instanceSourceDetails], { '--source-details': value })
  if (!issues.some(issue => issue.code === expected)) fail(`source-details did not report ${expected}: ${JSON.stringify(issues)}`)
}
if (validateJsonInputs([instanceSourceDetails], {
  '--source-details': '{"sourceType":"image","imageId":"ocid1.image.oc1.ap-seoul-1.example"}',
}).length) fail('Valid image source-details failed structured validation')
const parsedImages = parseImageCatalog(JSON.stringify({ data: [{
  id: 'ocid1.image.oc1.ap-seoul-1.example',
  'display-name': 'Oracle-Linux-9.6-2026.08.01-0',
  'operating-system': 'Oracle Linux',
  'operating-system-version': '9',
  'lifecycle-state': 'AVAILABLE',
  'time-created': '2026-08-01T00:00:00Z',
}] }))
if (parsedImages.error || parsedImages.entries.length !== 1
  || parsedImages.entries[0].operatingSystem !== 'Oracle Linux') {
  fail(`OCI image list response was not normalized: ${JSON.stringify(parsedImages)}`)
}

const allLimitOperation = Object.values(catalog.commands).flatMap(command => Object.values(command.operations ?? {}))
  .find(operation => {
    const names = new Set(optionsOf(operation).map(option => option.name))
    return names.has('--all') && names.has('--limit')
  })
if (!allLimitOperation) fail('Could not find an --all/--limit validation fixture')
const allLimit = validateCliOptions(optionsOf(allLimitOperation), { '--all': 'true', '--limit': '25' }, allLimitOperation.rules)
if (allLimit.valid || !codesOf(allLimit).some(code => code === 'conflict' || code === 'mutuallyExclusive')) {
  fail('--all and --limit must not form an executable command')
}

for (const marker of [
  'validateCliOptions(formOptions, validationValues, formRules)',
  "if (!commandReady)",
  "disabled={!commandReady}",
  "미완성 명령 미리보기",
  "cli-validation-nav",
  "focusValidationField",
  "scrollIntoView({ behavior: 'smooth', block: 'center' })",
  "control?.focus({ preventScroll: true })",
  "id={fieldId}",
  "cli-sidebar-resizer left",
  "cli-sidebar-resizer right",
  "role=\"separator\"",
  "resizeSidebarWithKeyboard",
  "saveCliSidebarWidth",
  "validateJsonInputs(formOptions, validationValues)",
  "function JsonNodeEditor",
  "isJsonMapTemplate",
  "+ 키·값 추가",
  "jsonFieldChoices",
  "legacyShapeConfigValue",
  "function JsonOptionField",
  "function ImageOptionField",
  "function buildImageDiscoveryCommand",
  "parseImageCatalog",
  "jsonTemplateCommand",
  "--shape",
  "필수 입력을 완료해야 복사할 수 있습니다.",
  "필수 입력을 완료해야 저장할 수 있습니다.",
]) {
  if (!pageSource.includes(marker)) fail(`CLI validation UI/guard is missing: ${marker}`)
}

const layoutRule = cssSource.match(/\.cli-layout\s*\{([^}]*)\}/s)?.[1] ?? ''
const validationNavRule = cssSource.match(/\.cli-validation-nav\s*\{([^}]*)\}/s)?.[1] ?? ''
if (!/grid-template-columns:\s*var\(--cli-left-width,\s*220px\)\s+14px\s+minmax\(0,\s*1fr\)\s+14px\s+var\(--cli-right-width,\s*280px\)/.test(layoutRule)
  || !/position:\s*sticky/.test(validationNavRule)
  || !/max-height:\s*calc\(100vh\s*-\s*90px\)/.test(validationNavRule)) {
  fail('CLI preflight validation must stay in a dedicated sticky right sidebar on wide screens')
}
if (!/@media\s*\(max-width:\s*860px\)[\s\S]*?\.cli-validation-nav\s*\{\s*grid-column:\s*1/.test(cssSource)) {
  fail('CLI preflight validation sidebar needs a non-overlapping mobile fallback')
}

console.log(JSON.stringify({
  emptyIssueCodes: codesOf(empty),
  instanceImageValid: validImage.valid,
  multipleSourceIssueCodes: codesOf(multipleSources),
  dependencyIssueCodes: codesOf(missingDependency),
  allLimitIssueCodes: codesOf(allLimit),
  validationPanelPlacement: 'right-sidebar',
  validationFieldFocus: true,
  resizableSidebars: true,
  structuredJsonOptions: jsonOptions.length,
  bareJsonExamples: braceOnlyExamples.length,
  instanceSourceVariants: instanceSourceDetails.jsonTemplate.length - 1,
  imagePicker: 'shape-aware-paste-to-select',
  burstableUpdate: burstableArguments.join(''),
}))
