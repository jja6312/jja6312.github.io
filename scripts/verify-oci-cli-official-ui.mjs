#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fail = message => { throw new Error(message) }
const read = path => readFileSync(resolve(path), 'utf8')
const page = read('src/pages/CliBuilderPage.tsx')
const nav = read('src/components/OciOfficialCommandNav.tsx')
const loader = read('src/lib/oci-cli/officialCatalog.ts')
const css = read('src/index.css')
const pointer = JSON.parse(read('public/oci-cli/current.json'))
const index = JSON.parse(read(`public/oci-cli/${pointer.index}`))
const lock = JSON.parse(read('scripts/oci-cli-source.lock.json'))

if (index.source.scope !== 'all-public-services'
  || index.totals.services !== lock.clickTree.expectedServiceCount
  || index.totals.commands !== index.commandIndex.length
  || index.totals.commands < 9000
  || pointer.version !== index.source.version || index.source.commit !== lock.commit) {
  fail('Official UI is not backed by the complete pinned catalog')
}
for (const marker of [
  '<OciOfficialCommandNav',
  "type CliSidebarView = 'all' | 'recent' | 'favorites' | 'verified' | 'automation'",
  "type OfficialCommandPresentation = 'enhanced' | 'official'",
  "savedPresentation ?? 'enhanced'",
  '공식 원본 보기',
  '운영 강화 보기',
  '최근 열어본 명령',
  '실행 확인',
  '자동화',
  'officialCommandToBuilder',
  '--generate-param-json-input',
  'useCliInputWizardShortcut(Boolean(cmd)',
  "f.resource.startsWith('official:')",
  'Oracle 명령 문서',
  'curatedTargetPathMap',
  'openOfficialPath',
  'operation: operation as CrudVerb',
]) {
  if (!page.includes(marker)) fail(`Official OCI CLI workspace marker missing: ${marker}`)
}
for (const forbidden of ['<OciResourceNav', '운영 Overlay 열기', 'setCuratedOpen']) {
  if (page.includes(forbidden)) fail(`Duplicate official/overlay navigation must stay removed: ${forbidden}`)
}
for (const marker of [
  'loadOfficialCliIndex',
  'loadOfficialCliService',
  '서비스·명령·설명 검색',
  'index.commandIndex.filter',
  'buildCommandTree',
  'curatedPaths.has',
]) {
  if (!nav.includes(marker)) fail(`Official OCI CLI navigation marker missing: ${marker}`)
}
for (const marker of [
  ", 'no-cache')",
  ", 'force-cache')",
  "scope !== 'all-public-services'",
  'shard.source.commit !== index.source.commit',
]) {
  if (!loader.includes(marker)) fail(`Official OCI CLI lazy-loader contract missing: ${marker}`)
}
for (const marker of ['.oci-official-nav', '.oci-official-search', '.oci-official-tree-item', '.cli-unified-tabs', '.cli-personal-view', '.cli-official-enhanced-badge']) {
  if (!css.includes(marker)) fail(`Official OCI CLI UI style missing: ${marker}`)
}

console.log(JSON.stringify({
  services: index.totals.services,
  commands: index.totals.commands,
  defaultSurface: 'official-canonical-with-auto-enhancement',
  personalViews: ['recent', 'favorites', 'verified'],
  automation: ['custom-cli', 'blueprints'],
  lazyServiceShards: index.services.length,
  altInputWizard: true,
  jsonTemplateFlow: true,
}))
