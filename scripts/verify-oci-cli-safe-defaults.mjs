#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const fail = message => { throw new Error(message) }
const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const builder = readFileSync(resolve('src/pages/CliBuilderPage.tsx'), 'utf8')

const source = readFileSync(resolve('src/lib/cliDefaultOperation.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports })
const { defaultCliOperation } = module.exports

const cases = [
  [{ operations: { list: {}, get: {}, create: {} }, preferredOperation: 'create' }, 'list', 'LIST beats an unsafe preference'],
  [{ operations: { get: {}, create: {} }, preferredOperation: 'create' }, 'get', 'GET beats an unsafe preference'],
  [{ operations: { create: {}, update: {} }, preferredOperation: 'update' }, 'update', 'valid mutation preference is retained without reads'],
  [{ operations: { create: {} } }, 'create', 'CREATE is the last available fallback'],
  [{ maintenanceReboot: true }, 'get', 'maintenance workflow starts with GET'],
]
for (const [command, expected, label] of cases) {
  const actual = defaultCliOperation(command)
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`)
}

let operationResources = 0
let listDefaults = 0
let getDefaults = 0
let mutatingDefaults = 0
for (const [resource, command] of Object.entries(catalog.commands)) {
  const operations = command.operations ?? {}
  if (command.maintenanceReboot) {
    if (command.preferredOperation !== 'get' || defaultCliOperation(command) !== 'get') {
      fail(`${resource}: maintenance workflow must default to GET`)
    }
    getDefaults += 1
    continue
  }
  if (!Object.keys(operations).length) continue
  operationResources += 1
  const expected = operations.list ? 'list' : operations.get ? 'get'
    : ['create', 'update', 'delete'].find(operation => operations[operation])
  const actual = defaultCliOperation(command)
  if (command.preferredOperation !== expected) {
    fail(`${resource}: catalog preferredOperation must be ${expected}, got ${command.preferredOperation ?? '(missing)'}`)
  }
  if (actual !== expected) fail(`${resource}: UI default must be ${expected}, got ${actual}`)
  if ((operations.list || operations.get) && ['create', 'update', 'delete'].includes(actual)) {
    fail(`${resource}: mutating operation ${actual} selected while a read operation exists`)
  }
  if (actual === 'list') listDefaults += 1
  else if (actual === 'get') getDefaults += 1
  else mutatingDefaults += 1
}

if (operationResources < 41) fail(`Too few CRUD resources covered: ${operationResources}`)
if (listDefaults < 41) fail(`Expected at least 41 LIST defaults, got ${listDefaults}`)
if (mutatingDefaults !== 0) fail(`Unexpected mutating defaults: ${mutatingDefaults}`)

const callerCount = (builder.match(/defaultCliOperation\(/g) ?? []).length
if (callerCount !== 3) fail(`Deep link, resource selection, and favorite fallback must share the safe default helper; got ${callerCount} callers`)
if (!builder.includes("useState<CrudVerb>('list')")) fail('Builder state must start conservatively with LIST')

console.log(`OCI CLI safe defaults verified: ${operationResources} CRUD resources, ${listDefaults} LIST, ${getDefaults} GET, ${mutatingDefaults} mutating`)
