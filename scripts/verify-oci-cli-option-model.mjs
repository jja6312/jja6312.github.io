#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const tree = JSON.parse(readFileSync(resolve('.protected-cache/oci-cli-runtime/v3.90.2/click-tree.json'), 'utf8'))
const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))
const modelSource = readFileSync(resolve('src/lib/cliOptionModel.ts'), 'utf8')
const compiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports }, { filename: 'cliOptionModel.js' })
const { serializeCliOption } = module.exports

const fail = message => { throw new Error(message) }
const optionsOf = command => [
  ...(command?.sections ?? []).flatMap(section => section.options),
  ...(command?.advanced ?? []),
]
const optionOf = (command, name) => optionsOf(command).find(option => option.name === name)

const clickOptions = Object.values(tree.commands).flatMap(command => command.options)
const counts = {
  flags: clickOptions.filter(option => option.flag).length,
  booleanValues: clickOptions.filter(option => option.type === 'bool' && !option.flag).length,
  multiple: clickOptions.filter(option => option.multiple).length,
  choices: clickOptions.filter(option => option.choices).length,
  json: clickOptions.filter(option => option.type === 'json').length,
  file: clickOptions.filter(option => option.type === 'file').length,
  datetime: clickOptions.filter(option => option.type === 'datetime').length,
}
for (const [kind, count] of Object.entries(counts)) {
  if (count < 1) fail(`Final Click tree did not preserve ${kind} option metadata`)
}

for (const command of Object.values(catalog.commands)) {
  for (const operation of Object.values(command.operations ?? {})) {
    const source = tree.commands[operation.cmd]
    if (!source) continue
    const sourceByName = new Map(source.options.map(option => [option.name, option]))
    for (const option of optionsOf(operation)) {
      const clickOption = sourceByName.get(option.name)
      if (!clickOption) continue
      if (!!option.flag !== !!clickOption.flag) fail(`${operation.cmd} ${option.name}: flag metadata mismatch`)
      if (!!option.multiple !== !!clickOption.multiple) fail(`${operation.cmd} ${option.name}: multiple metadata mismatch`)
      if (['json', 'file', 'datetime'].includes(clickOption.type) && option.type !== clickOption.type) {
        fail(`${operation.cmd} ${option.name}: expected ${clickOption.type}, got ${option.type}`)
      }
    }
    const all = optionOf(operation, '--all')
    const limit = optionOf(operation, '--limit')
    if (all && limit && (!all.conflictsWith?.includes('--limit') || !limit.conflictsWith?.includes('--all'))) {
      fail(`${operation.cmd}: --all/--limit conflict metadata missing`)
    }
  }
}

const alarmCreate = catalog.commands.alarm.operations.create
const allExample = Object.values(catalog.commands).flatMap(command => Object.values(command.operations ?? {}))
  .find(operation => optionOf(operation, '--all')?.flag && optionOf(operation, '--limit'))
const forceExample = Object.values(catalog.commands).flatMap(command => Object.values(command.operations ?? {}))
  .find(operation => optionOf(operation, '--force')?.flag)
const repeatedExample = Object.values(catalog.commands).flatMap(command => Object.values(command.operations ?? {}))
  .find(operation => optionOf(operation, '--wait-for-state')?.multiple)
if (!allExample || !forceExample || !repeatedExample) fail('Representative flag/multiple catalog options are missing')
if (optionOf(alarmCreate, '--is-enabled')?.flag || optionOf(alarmCreate, '--is-enabled')?.choices?.join(',') !== 'true,false') {
  fail('Boolean value option must remain a true/false value selector')
}

const allArgument = serializeCliOption(optionOf(allExample, '--all'), 'true')
const forceArgument = serializeCliOption(optionOf(forceExample, '--force'), 'true')
const boolArgument = serializeCliOption(optionOf(alarmCreate, '--is-enabled'), 'true')
const repeatedArguments = serializeCliOption(optionOf(repeatedExample, '--wait-for-state'), 'ACTIVE\nDELETED')
if (allArgument.join(' ') !== '--all' || forceArgument.join(' ') !== '--force') {
  fail(`Value-less flags were serialized with a value: ${allArgument} / ${forceArgument}`)
}
if (boolArgument.join(' ') !== '--is-enabled true') fail(`Boolean value serialization failed: ${boolArgument}`)
if (repeatedArguments.join(' | ') !== '--wait-for-state ACTIVE | --wait-for-state DELETED') {
  fail(`Multiple option serialization failed: ${repeatedArguments}`)
}
for (const forbidden of ['--all true', '--force true']) {
  if ([...allArgument, ...forceArgument].some(argument => argument.includes(forbidden))) fail(`Forbidden output: ${forbidden}`)
}

console.log(JSON.stringify({ ...counts, checkedOperations: Object.values(catalog.commands)
  .reduce((sum, command) => sum + Object.keys(command.operations ?? {}).length, 0) }))
