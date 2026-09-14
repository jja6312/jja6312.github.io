import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(path) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module, exports: module.exports, require }, { filename: path })
  return module.exports
}
const { resolveCliInputs } = load('src/lib/cliInputResolution.ts')
const { cliDiscoveryRelation, parseCliDiscovery, cliDiscoveryContext, wrapCliDiscoveryCommand } = load('src/lib/cliDiscovery.ts')
const { validateCliOptions } = load('src/lib/cliOptionModel.ts')
const { questionHasValue } = load('src/components/CliInputWizard.tsx')
const catalog = JSON.parse(readFileSync('.protected-cache/cliCatalog.json', 'utf8'))
const options = command => [...(command.lookupInputs ?? []), ...(command.sections ?? []).flatMap(section => section.options), ...(command.advanced ?? [])]
const test = (name, fn) => { fn(); console.log(`ok: ${name}`) }
const balance = catalog.commands['subscription-balance']
const balanceOptions = options(balance.operations.list)
const tenancy = { name: '--tenancy-id', required: true, dynamicLookup: { kind: 'tenancy' } }
const rootContext = { rootTenancyLookup: true, dynamic: { '--compartment-id': true } }
test('blank root tenancy is runtime automatic, not a fake filled OCID', () => {
  const values = { '--subscription-id': 'SPM_EXAMPLE' }
  const states = resolveCliInputs(balanceOptions, values, rootContext)
  assert.equal(states['--compartment-id'].state, 'automatic')
  assert.equal(values['--compartment-id'], undefined)
  assert.ok(validateCliOptions(balanceOptions, values, [], { '--compartment-id': states['--compartment-id'].ready }).valid)
  assert.ok(questionHasValue({ id: '--compartment-id', isFilled: () => states['--compartment-id'].ready }, values))
  assert.ok(!validateCliOptions(balanceOptions, values).valid)
})
test('region-subscription tenancy shares the same contract', () => {
  assert.equal(resolveCliInputs([tenancy], {}, { dynamic: { '--tenancy-id': true } })['--tenancy-id'].state, 'automatic')
  assert.equal(resolveCliInputs([tenancy], {}, { dynamic: { '--tenancy-id': false } })['--tenancy-id'].state, 'missing')
})
const scope = { name: '--lookup-compartment-id' }
const instance = { name: '--instance-id', required: true, dynamicLookup: { kind: 'exactName', scope: 'compartment', scopeInput: scope.name } }
test('name lookup needs scope but direct OCID does not', () => {
  const context = { dynamic: { '--instance-id': true } }
  assert.equal(resolveCliInputs([instance, scope], { '--instance-id': 'example' }, context)['--instance-id'].state, 'blocked')
  assert.equal(resolveCliInputs([instance, scope], { '--instance-id': 'ocid1.instance.oc1..example' }, context)['--instance-id'].state, 'provided')
  assert.equal(resolveCliInputs([instance, scope], { '--instance-id': 'example', '--lookup-compartment-id': 'ROOT' }, context)['--instance-id'].state, 'provided')
  assert.ok(resolveCliInputs([instance, scope], { '--instance-id': 'example', '--lookup-compartment-id': 'R' }, context)['--instance-id'].requiredInputs.includes(scope.name), 'scope question must remain visible while typing')
  assert.equal(resolveCliInputs([instance, scope], { '--instance-id': 'ocid1.instance.oc1..example,other-name' }, context)['--instance-id'].state, 'blocked')
})
test('empty optional lookups do not invent required scope', () => {
  const state = resolveCliInputs([{ ...instance, required: false }, scope], {}, { dynamic: { '--instance-id': true } })['--instance-id']
  assert.equal(state.state, 'missing'); assert.equal(state.dependencies.length, 0)
})
test('AD default only resolves with required scope or root', () => {
  const ad = { name: '--availability-domain', required: true }
  const compartment = { name: '--compartment-id', required: true }
  assert.equal(resolveCliInputs([ad, compartment], {}, { dynamic: { '--availability-domain': true } })[ad.name].state, 'blocked')
  assert.equal(resolveCliInputs([ad, compartment], { '--compartment-id': 'ROOT' }, { dynamic: { '--availability-domain': true } })[ad.name].state, 'automatic')
  assert.equal(resolveCliInputs([{ ...ad, required: false }, compartment], {}, { dynamic: { '--availability-domain': true } })[ad.name].state, 'missing')
})
const relation = cliDiscoveryRelation(balance.cmd, { name: '--subscription-id' })
test('lookup provenance changes with profile/region/scope/mode, not the selected ID', () => {
  const key = (request, values = {}, dyn = {}) => cliDiscoveryContext(balance.cmd, request, ['--compartment-id'], values, dyn)
  assert.notEqual(key(['--profile A']), key(['--profile B']))
  assert.notEqual(key(['--region a']), key(['--region b']))
  assert.notEqual(key([], { '--compartment-id': 'A' }), key([], { '--compartment-id': 'B' }))
  assert.notEqual(key([]), key([], {}, { '--compartment-id': false }))
  assert.equal(key([]), key([], { '--subscription-id': 'SPM_QA_ONLY' }))
})
test('copied discovery failure does not exit the parent shell', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
  const command = wrapCliDiscoveryCommand('set -euo pipefail\nfalse')
  execFileSync(bash, ['-n'], { input: command })
  const result = execFileSync(bash, ['--noprofile', '--norc', '-c', command + '\nprintf "parent-alive"'], { encoding: 'utf8' })
  assert.equal(result, 'parent-alive')
})
test('SPM shortcut points to existing LIST, not organizations OCID', () => {
  assert.equal(relation.command, catalog.commands['subscription-list'].operations.list.cmd)
  assert.equal(relation.idKind, 'subscription')
  const items = parseCliDiscovery(JSON.stringify({ data: [{ id: 'SPM_EXAMPLE', 'service-name': 'Cloud', status: 'ACTIVE' }] }), relation)
  assert.equal(items[0].id, 'SPM_EXAMPLE')
  assert.throws(() => parseCliDiscovery('{"data":[{"id":"ocid1.subscription.oc1..example"}]}', relation), /SPM/)
})
test('bad/filtered/duplicate/unsafe-precision JSON is refused; zero rows is explicit success', () => {
  for (const raw of ['bad', '{}', 'null', '{"data":[{}]}', '{"data":[{"id":9007199254740993}]}', '{"data":[{"id":"X"},{"id":"X"}]}']) assert.throws(() => parseCliDiscovery(raw, relation))
  assert.equal(parseCliDiscovery('{"data":[]}', relation).length, 0)
})
test('normal and nested LIST collection contracts', () => {
  const generic = cliDiscoveryRelation('oci compute instance get', { ...instance, dynamicLookup: { ...instance.dynamicLookup, listCommand: 'oci compute instance list', target: 'instance' } })
  assert.equal(parseCliDiscovery('{"data":[{"id":"ocid1.instance.oc1..example"}]}', generic).length, 1)
  assert.equal(parseCliDiscovery('{"data":{"items":[{"id":"ocid1.announcement.oc1..example"}]}}', { ...generic, target: 'announcement' }).length, 1)
})
test('all tenancy annotations produce consistent default and manual states', () => {
  let count = 0
  for (const cmd of Object.values(catalog.commands)) for (const surface of [cmd, ...Object.values(cmd.operations ?? {}), ...Object.values(cmd.actions ?? {})]) {
    for (const option of options(surface).filter(item => item.dynamicLookup?.kind === 'tenancy' || cmd.rootTenancyLookup && item.name === '--compartment-id')) {
      assert.equal(resolveCliInputs([option], {}, { rootTenancyLookup: cmd.rootTenancyLookup, dynamic: { [option.name]: true } })[option.name].state, option.required ? 'automatic' : 'missing')
      assert.equal(resolveCliInputs([option], {}, { dynamic: { [option.name]: false } })[option.name].state, 'missing')
      count++
    }
  }
  assert.ok(count > 5); console.log(`  tenancy contracts checked: ${count}`)
})
const page = readFileSync('src/pages/CliBuilderPage.tsx', 'utf8')
test('UI uses shared readiness and original builder/context; results invalidated on context changes', () => {
  for (const marker of ['resolveCliInputs(formOptions', 'formRules, automaticInputs)', 'inputResolution[option.name]', 'requestContextArguments, [\'--output json\']', 'JSON.stringify(sourceValues) + requestContextArguments.join', 'setFormVal(formOptionsByName.get(name)!']) assert.ok(page.includes(marker), marker)
  assert.ok(!page.includes('__root-tenancy-from-profile__'))
})
console.log('OCI CLI input/discovery regression passed')
