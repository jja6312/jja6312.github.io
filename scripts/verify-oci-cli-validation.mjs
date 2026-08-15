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
const { validateCliOptions } = module.exports

const fail = message => { throw new Error(message) }
const optionsOf = command => [
  ...(command?.sections ?? []).flatMap(section => section.options),
  ...(command?.advanced ?? []),
]
const codesOf = result => result.issues.map(issue => issue.code)

const instance = catalog.commands.instance.operations.create
const instanceOptions = optionsOf(instance)
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
  "필수 입력을 완료해야 복사할 수 있습니다.",
  "필수 입력을 완료해야 저장할 수 있습니다.",
]) {
  if (!pageSource.includes(marker)) fail(`CLI validation UI/guard is missing: ${marker}`)
}

const layoutRule = cssSource.match(/\.cli-layout\s*\{([^}]*)\}/s)?.[1] ?? ''
const validationNavRule = cssSource.match(/\.cli-validation-nav\s*\{([^}]*)\}/s)?.[1] ?? ''
if (!/grid-template-columns:\s*220px\s+minmax\(0,\s*1fr\)\s+280px/.test(layoutRule)
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
}))
