#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import ts from 'typescript'

const fail = message => { throw new Error(message) }
const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const lock = JSON.parse(readFileSync(resolve('scripts/oci-cli-source.lock.json'), 'utf8'))
const builder = readFileSync(resolve('src/pages/CliBuilderPage.tsx'), 'utf8')
const generator = readFileSync(resolve('scripts/generate-cli-catalog.py'), 'utf8')
const rootSource = readFileSync(resolve(
  `.protected-cache/oci-cli-runtime/${lock.tag}/runtime/site-packages/oci_cli/cli_root.py`,
), 'utf8')

const compileModule = (source, requireFn = () => { throw new Error('Unexpected require') }) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireFn })
  return module.exports
}
const optionModel = compileModule(readFileSync(resolve('src/lib/cliOptionModel.ts'), 'utf8'))
const contextModel = compileModule(
  readFileSync(resolve('src/lib/cliExecutionContext.ts'), 'utf8'),
  specifier => {
    if (specifier === './cliOptionModel') return optionModel
    throw new Error(`Unexpected require: ${specifier}`)
  },
)

const schema = catalog.executionContext
if (schema?.source?.kind !== 'final-click-root' || schema.source.tag !== lock.tag || schema.source.commit !== lock.commit) {
  fail('Execution context does not carry pinned final Click-root provenance')
}
const requestNames = schema.request.map(option => option.name)
const responseNames = schema.response.map(option => option.name)
if (JSON.stringify(requestNames) !== JSON.stringify(['--profile', '--region', '--auth', '--endpoint'])) {
  fail(`Unexpected request context: ${requestNames}`)
}
if (JSON.stringify(responseNames) !== JSON.stringify(['--output', '--query', '--raw-output'])) {
  fail(`Unexpected response context: ${responseNames}`)
}
for (const name of [...requestNames, ...responseNames]) {
  if (!rootSource.includes(`@click.option('${name}'`)) fail(`Pinned OCI CLI root option is missing: ${name}`)
}
const authChoices = ['api_key', 'instance_principal', 'security_token', 'instance_obo_user', 'resource_principal', 'oke_workload_identity']
if (JSON.stringify(schema.request.find(option => option.name === '--auth')?.choices) !== JSON.stringify(authChoices)) {
  fail('Auth choices do not match OCI_CLI_AUTH_CHOICES')
}
for (const choice of authChoices) {
  if (!rootSource.includes(`OCI_CLI_AUTH_${choice === 'api_key' ? 'API_KEY' : choice === 'security_token' ? 'SESSION_TOKEN' : choice.toUpperCase()}`)
    && !rootSource.includes(`'${choice}'`)) fail(`Pinned root auth choice is missing: ${choice}`)
}
const region = schema.request.find(option => option.name === '--region')
if (region?.required || region?.defaultValue !== undefined) fail('Region must remain optional and inherit from profile/environment by default')

const commonNames = new Set([...requestNames, ...responseNames])
const optionsOf = surface => [...(surface.sections ?? []).flatMap(section => section.options), ...(surface.advanced ?? [])]
const surfaces = []
for (const [resource, command] of Object.entries(catalog.commands)) {
  const operations = Object.entries(command.operations ?? {})
  if (operations.length) {
    for (const [operation, surface] of operations) surfaces.push([`${resource}:${operation}`, surface])
  } else surfaces.push([resource, command])
  for (const [action, surface] of Object.entries(command.actions ?? {})) surfaces.push([`${resource}:action:${action}`, surface])
}
for (const [key, surface] of surfaces) {
  const leaked = optionsOf(surface).filter(option => commonNames.has(option.name)).map(option => option.name)
  if (leaked.length) fail(`${key}: common context leaked into resource form: ${leaked}`)
  for (const option of Object.values(surface.contextOverrides ?? {})) {
    if (option.required || option.requirement !== 'optional') fail(`${key}: lifted context option became required: ${option.name}`)
  }
}
if (surfaces.length < 219) fail(`Too few command surfaces use the common context layer: ${surfaces.length}`)

const instanceGet = catalog.commands.instance.operations.get
if (!instanceGet.contextOverrides?.['--query']?.multiSelect
  || instanceGet.contextOverrides?.['--raw-output']?.defaultValue !== 'true') {
  fail('Instance GET query/raw-output controls were not preserved while lifting context')
}
const announcementList = catalog.commands.announcement.operations.list
if (!announcementList.contextOverrides?.['--query']?.checkbox
  || announcementList.contextOverrides?.['--output']?.defaultValue !== 'table') {
  fail('Announcement LIST curated result context was not preserved')
}

const defaults = contextModel.executionContextDefaults(schema, instanceGet.contextOverrides)
if (defaults['--profile'] !== 'DEFAULT' || defaults['--raw-output'] !== 'true' || defaults['--region']) {
  fail(`Execution context defaults are incorrect: ${JSON.stringify(defaults)}`)
}
const requestArgs = contextModel.serializeExecutionContext(schema, {}, {
  '--profile': 'OPS', '--region': '', '--auth': 'instance_principal',
  '--endpoint': 'https://iaas.example.test/20160918',
}, 'request')
if (requestArgs.join('|') !== "--profile 'OPS'|--auth instance_principal|--endpoint 'https://iaas.example.test/20160918'") {
  fail(`Request context serialization failed: ${requestArgs}`)
}
const responseArgs = contextModel.serializeExecutionContext(schema, {}, {
  '--output': 'table', '--query': 'data.id', '--raw-output': 'true',
}, 'response')
if (responseArgs.join('|') !== "--output table|--query 'data.id'|--raw-output") {
  fail(`Response context serialization failed: ${responseArgs}`)
}
const migrated = contextModel.splitLegacyExecutionContext({ '--profile': 'OLD', '--region': 'ap-seoul-1', '--instance-id': 'ocid1.instance.example' })
if (migrated.context['--profile'] !== 'OLD' || migrated.resource['--instance-id'] !== 'ocid1.instance.example'
  || migrated.resource['--profile']) fail('Legacy favorite context migration failed')

for (const marker of [
  'lift_execution_context', "catalog['executionContext'] = _execution_context()",
  'cli-context-panel', '공통 실행 컨텍스트', 'executionContextDefaults',
  'requestContextArguments', 'responseContextArguments',
  'buildRootTenancyLookup(requestContext)',
  'args.push(...requestContext.map',
  'context: active === \'__custom\' ? undefined : executionValues',
]) {
  const source = marker.includes('lift_') || marker.includes("catalog['execution") ? generator : builder
  if (!source.includes(marker)) fail(`Common context implementation marker is missing: ${marker}`)
}
if ((builder.match(/\.\.\.requestContext/g) ?? []).length < 6
  || (builder.match(/requestContext\.join/g) ?? []).length < 7) {
  fail('Request context is not propagated through enough dynamic/custom builders')
}
if (builder.includes('CTX=(--profile "$PROFILE" --region "$REGION")')) fail('A builder still hard-codes the old Profile/Region-only context')

const buildStart = builder.indexOf('function buildCli(')
const buildEnd = builder.indexOf('\nconst catOfResource', buildStart)
if (buildStart < 0 || buildEnd < 0) fail('Generic CLI builder extraction failed')
const buildHarness = `
const DYNAMIC = {'--compartment-id': {}}
const JSONSPEC = {}
const allOptions = command => [...command.sections.flatMap(section => section.options), ...command.advanced]
const isDynamic = (dynamic, name) => name in DYNAMIC ? (dynamic[name] ?? true) : false
const isExecutionContextName = name => ${JSON.stringify([...commonNames])}.includes(name)
const isCliOptionValueActive = ${optionModel.isCliOptionValueActive.toString()}
const serializeCliOption = ${optionModel.serializeCliOption.toString()}
const quoteCliValue = ${optionModel.quoteCliValue.toString()}
const splitRepeatedCliValues = ${optionModel.splitRepeatedCliValues.toString()}
const buildJsonValue = () => ''
const subKey = (option, key) => option + '::' + key
const buildMultiSelectQuery = value => value
const formatCliCommand = (command, args) => [command, ...args.map(argument => '  ' + argument)].join(' \\\n')
const buildRootTenancyLookup = requestContext =>
  'TENANCY_ID=$(oci iam availability-domain list ' + requestContext.join(' ') + ')'
${builder.slice(buildStart, buildEnd)}
const operation = {
  cmd: 'oci network vcn list', help: '',
  sections: [{label: 'scope', options: [{name: '--compartment-id', required: true, type: 'str', choices: null, help: '', placeholder: ''}]}],
  advanced: [],
}
const command = {resource: 'vcn', cmd: operation.cmd, help: '', sections: operation.sections, advanced: [], operations: {list: operation}}
globalThis.generated = buildCli(command, {'--compartment-id': 'prod'}, {}, 'list', undefined,
  ["--profile 'OPS'", '--auth instance_principal'], ['--output table'])
`
const buildContext = {}
vm.runInNewContext(ts.transpileModule(buildHarness, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText, buildContext)
const generated = buildContext.generated
const occurrences = (text, part) => text.split(part).length - 1
if (occurrences(generated, "--profile 'OPS'") !== 2
  || occurrences(generated, '--auth instance_principal') !== 2
  || occurrences(generated, '--output table') !== 1) {
  fail(`Dynamic lookup/final command context propagation failed:\n${generated}`)
}
const syntax = spawnSync('C:\\Program Files\\Git\\bin\\bash.exe', ['-n'], { input: generated, encoding: 'utf8' })
if (syntax.status !== 0) fail(`Context-aware generic command has invalid Bash syntax: ${syntax.stderr}`)

console.log(JSON.stringify({
  surfaces: surfaces.length,
  request: requestNames,
  response: responseNames,
  authChoices: authChoices.length,
  liftedOverrides: surfaces.filter(([, surface]) => Object.keys(surface.contextOverrides ?? {}).length).length,
  requestPropagationSites: (builder.match(/\.\.\.requestContext/g) ?? []).length,
  genericRequestOccurrences: occurrences(generated, "--profile 'OPS'"),
}))
