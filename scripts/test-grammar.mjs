#!/usr/bin/env node
// OCI Grammar — 조립/추출/실행 순수 로직 테스트 (node:assert). 렌더는 bash -n 검증.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseTypeList, buildResourceSearchQuery, renderResourceTypeExtract, renderResourceSearchRun, whereMixesConnectors } from '../src/lib/oci-grammar/grammarExtract.mjs'
import { GRAMMAR_LANGS, GRAMMAR_GROUPS, langById } from '../src/lib/oci-grammar/grammarCatalog.mjs'

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

/* ── parseTypeList ── */
t('콤마/개행/공백 혼재 → 배열, resources·query 제거', () => {
  assert.deepEqual(parseTypeList('query instance, bootvolume\nvolume  bucket resources'), ['instance', 'bootvolume', 'volume', 'bucket'])
})
t('중복 제거', () => {
  assert.deepEqual(parseTypeList('instance, instance, volume'), ['instance', 'volume'])
})
t('빈 입력 → []', () => { assert.deepEqual(parseTypeList('  '), []) })

/* ── buildResourceSearchQuery ── */
t('사용자 예시 재현', () => {
  const q = buildResourceSearchQuery({
    types: ['instance', 'bootvolume', 'volume'],
    where: [
      { field: 'definedTags.namespace', op: '!=', value: "'GSIS'" },
      { field: 'definedTags.namespace', op: '!=', value: "'SOTA'", join: '&&' },
    ],
    sortField: 'timeCreated', sortDir: 'DESC',
  })
  assert.equal(q, "query instance, bootvolume, volume resources\nwhere definedTags.namespace != 'GSIS'\n&& definedTags.namespace != 'SOTA'\nsorted by timeCreated DESC")
})
t('타입 없으면 all', () => {
  assert.match(buildResourceSearchQuery({ types: [] }), /^query all resources$/)
})
t('|| join 반영', () => {
  const q = buildResourceSearchQuery({ types: ['bucket'], where: [{ field: 'a', op: '=', value: '1' }, { field: 'b', op: '=', value: '2', join: '||' }] })
  assert.match(q, /where a = 1\n\|\| b = 2/)
})
t('불완전 조건(필드/연산자/값 없음) 제외', () => {
  const q = buildResourceSearchQuery({ types: ['bucket'], where: [{ field: '', op: '=', value: '1' }, { field: 'b', op: '', value: '2' }, { field: 'c', op: '=', value: '' }] })
  assert.equal(q, 'query bucket resources') // 빈 value(c) 도 제외 → malformed 'where c =' 방지
})
t('정렬 없으면 sorted by 생략', () => {
  assert.doesNotMatch(buildResourceSearchQuery({ types: ['bucket'] }), /sorted by/)
})
t('sortDir 소문자 asc 도 대문자 ASC 로 정규화', () => {
  assert.match(buildResourceSearchQuery({ types: ['bucket'], sortField: 'timeCreated', sortDir: 'asc' }), /sorted by timeCreated ASC/)
})
t('&& 와 || 혼용 감지', () => {
  const mixed = [{ field: 'a', op: '=', value: '1' }, { field: 'b', op: '=', value: '2', join: '&&' }, { field: 'c', op: '=', value: '3', join: '||' }]
  assert.equal(whereMixesConnectors(mixed), true)
  assert.equal(whereMixesConnectors([{ field: 'a', op: '=', value: '1' }, { field: 'b', op: '=', value: '2', join: '&&' }]), false)
})

/* ── 카탈로그 ── */
t('언어 8종 · 그룹 3개 · 전부 검증됨', () => {
  assert.equal(GRAMMAR_LANGS.length, 8)
  assert.equal(GRAMMAR_GROUPS.length, 3)
  assert.ok(GRAMMAR_LANGS.every(l => l.verified === true))
  assert.ok(GRAMMAR_LANGS.every(l => l.docUrl && l.docUrl.startsWith('https://docs.oracle.com')))
})
t('resource-search 는 사용자 예시 + 실행 CLI 보유', () => {
  const rs = langById('resource-search')
  assert.ok(rs.examples.some(e => e.includes("definedTags.namespace != 'GSIS'")))
  assert.match(rs.runCli, /oci search resource structured-search/)
})
t('모든 그룹이 최소 1개 언어', () => {
  for (const g of GRAMMAR_GROUPS) assert.ok(GRAMMAR_LANGS.some(l => l.group === g), `그룹 비어있음: ${g}`)
})

/* ── 추출 스크립트 ── */
const ext = renderResourceTypeExtract({ profile: 'CUST_A', region: 'ap-seoul-1' })
t('추출: oci search resource-type list + CRLF 세정', () => {
  assert.match(ext.body, /oci search resource-type list --all/)
  assert.match(ext.body, /tr -d '\\r'/)
  assert.match(ext.body, /PROFILE='CUST_A'/)
  assert.match(ext.body, /--region "\$REGION"/)
})

/* ── 실행 스크립트 ── */
const run = renderResourceSearchRun({ query: "query bucket resources\nwhere a != 'x'\nsorted by timeCreated DESC", profile: 'DEFAULT' })
t('실행: --query-text "$QUERY" 문자열 직접 전달 (file:// 미사용)', () => {
  assert.match(run.body, /--query-text "\$QUERY"/)
  assert.doesNotMatch(run.body, /--query-text "file:/)   // --query-text 는 file:// 확장 안 함
  assert.doesNotMatch(run.body, /<<'/)                    // heredoc 델리미터 충돌 회피
  assert.match(run.body, /oci search resource structured-search/)
})
t('실행: 내부 작은따옴표(\'x\')가 안전하게 이스케이프', () => {
  assert.match(run.body, /'\\''/)  // q() 이스케이프 흔적
})
t('실행: 빈 query → throw', () => {
  assert.throws(() => renderResourceSearchRun({ query: '  ' }))
})

/* bash -n 문법검증 */
let bash = 'bash'
try { execFileSync(bash, ['--version'], { stdio: 'ignore' }) } catch { bash = '' }
if (bash) {
  const dir = mkdtempSync(join(tmpdir(), 'grammar-'))
  for (const s of [ext, run]) {
    const f = join(dir, s.filename)
    writeFileSync(f, s.body)
    t(`bash -n ${s.filename}`, () => { execFileSync(bash, ['-n', f], { stdio: 'pipe' }) })
  }
} else {
  console.log('  --  bash 없음 → 문법검증 skip')
}

console.log(`\nOCI Grammar 테스트 통과 — ${passed}건`)
