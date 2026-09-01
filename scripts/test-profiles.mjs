#!/usr/bin/env node
// OCI CLI 프로필 — 순수 로직 테스트(node:assert). 수집 레시피는 bash -n 문법 검증.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  renderProfileCollectScript, parseCollectedProfiles, lookupNamesFor,
  mergeProfiles, profileSummary, SEARCH_TYPE_TO_TARGET,
} from '../src/lib/oci-cli/profilesParse.mjs'

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

/* ── 봉투 파싱 ── */
const envelope = JSON.stringify([
  {
    name: 'locktonkorea',
    tenancy: 'ocid1.tenancy.oc1..aaaa',
    subscriptions: { data: [
      { 'is-home-region': true, 'region-key': 'ICN', 'region-name': 'ap-seoul-1', status: 'READY' },
      { 'is-home-region': false, 'region-key': 'NRT', 'region-name': 'ap-tokyo-1', status: 'READY' },
      { 'is-home-region': false, 'region-key': 'SYD', 'region-name': 'ap-sydney-1', status: 'IN_PROGRESS' },
    ] },
    compartments: { data: [
      { name: 'prod', id: 'ocid1.compartment.oc1..prod', 'lifecycle-state': 'ACTIVE' },
      { name: 'dev', id: 'ocid1.compartment.oc1..dev', 'lifecycle-state': 'ACTIVE' },
      { name: 'gone', id: 'ocid1.compartment.oc1..gone', 'lifecycle-state': 'DELETED' },
    ] },
    resources: { data: [
      { 'resource-type': 'Vcn', 'display-name': 'prod-vcn', 'compartment-id': 'ocid1.compartment.oc1..prod' },
      { 'resource-type': 'Subnet', 'display-name': 'prod-sub-a', 'compartment-id': 'ocid1.compartment.oc1..prod' },
      { 'resource-type': 'Subnet', 'display-name': 'dev-sub', 'compartment-id': 'ocid1.compartment.oc1..dev' },
      { 'resource-type': 'Instance', 'display-name': 'zombie', 'compartment-id': 'x', 'lifecycle-state': 'TERMINATED' },
      { 'resource-type': 'ThingWeDoNotMap', 'display-name': 'ignored', 'compartment-id': 'x' },
    ] },
  },
])

const parsed = parseCollectedProfiles(envelope)
t('봉투 → 프로필 1개, 에러 없음', () => {
  assert.equal(parsed.error, undefined)
  assert.equal(parsed.profiles.length, 1)
})
const p = parsed.profiles[0]
t('홈리전 = is-home-region:true', () => { assert.equal(p.homeRegion, 'ap-seoul-1') })
t('regions = READY 만(IN_PROGRESS 제외)', () => {
  assert.deepEqual(p.regions, ['ap-seoul-1', 'ap-tokyo-1'])
})
t('tenancyId 추출', () => { assert.equal(p.tenancyId, 'ocid1.tenancy.oc1..aaaa') })
t('compartments = DELETED 제외', () => {
  assert.deepEqual(p.compartments.map(c => c.name), ['prod', 'dev'])
})
t('resources = 매핑 타입만, TERMINATED 제외', () => {
  assert.deepEqual(p.names.vcn.map(n => n.name), ['prod-vcn'])
  assert.deepEqual(p.names.subnet.map(n => n.name).sort(), ['dev-sub', 'prod-sub-a'])
  assert.equal(p.names.instance, undefined) // TERMINATED 하나뿐 → 버킷 없음
})

/* ── 이름 후보 조회 ── */
t('compartment 후보 = ROOT + 이름(정렬)', () => {
  assert.deepEqual(lookupNamesFor(p, 'compartment'), ['dev', 'prod', 'ROOT'])
})
t('exactName 후보 = 이름', () => {
  assert.deepEqual(lookupNamesFor(p, 'subnet'), ['dev-sub', 'prod-sub-a'])
})
t('exactName 후보 compartment 필터', () => {
  assert.deepEqual(lookupNamesFor(p, 'subnet', { compartmentId: 'ocid1.compartment.oc1..dev' }), ['dev-sub'])
})
t('없는 target → []', () => { assert.deepEqual(lookupNamesFor(p, 'nosuch'), []) })
t('profile 없음 → []', () => { assert.deepEqual(lookupNamesFor(null, 'compartment'), []) })

/* ── 병합 ── */
t('mergeProfiles: 같은 name 덮어씀, 정렬', () => {
  const a = [{ name: 'b', regions: [] }, { name: 'a', regions: ['x'] }]
  const b = [{ name: 'a', regions: ['y'] }, { name: 'c', regions: [] }]
  const merged = mergeProfiles(a, b)
  assert.deepEqual(merged.map(x => x.name), ['a', 'b', 'c'])
  assert.deepEqual(merged.find(x => x.name === 'a').regions, ['y'])
})

/* ── 요약 ── */
t('profileSummary 카운트', () => {
  const s = profileSummary(p)
  assert.equal(s.regions, 2)
  assert.equal(s.compartments, 2)
  assert.equal(s.resources, 3) // vcn 1 + subnet 2
})

/* ── 에러 케이스 ── */
t('빈 붙여넣기 → 에러', () => { assert.ok(parseCollectedProfiles('').error) })
t('깨진 JSON → 에러', () => { assert.ok(parseCollectedProfiles('{not json').error) })
t('name 없는 봉투 → 에러', () => { assert.ok(parseCollectedProfiles('[{"tenancy":"x"}]').error) })
t('단일 객체(배열 아님)도 허용', () => {
  const r = parseCollectedProfiles('{"name":"solo","subscriptions":{"data":[]}}')
  assert.equal(r.profiles.length, 1)
  assert.equal(r.profiles[0].name, 'solo')
})
t('프로젝션 shape(섹션이 bare 배열, --query 출력)도 파싱', () => {
  // 새 수집 스크립트는 --query 로 섹션을 bare 배열로 뽑는다({data:[]} 아님)
  const env = JSON.stringify([{
    name: 'proj', tenancy: 'ocid1.tenancy.oc1..t',
    subscriptions: [{ 'is-home-region': true, 'region-name': 'ap-seoul-1', status: 'READY' }],
    compartments: [{ name: 'prod', id: 'ocid1.compartment.oc1..p', 'lifecycle-state': 'ACTIVE' }],
    resources: [{ 'resource-type': 'Vcn', 'display-name': 'v1', 'compartment-id': 'ocid1.compartment.oc1..p', 'lifecycle-state': 'AVAILABLE' }],
  }])
  const { profiles, error } = parseCollectedProfiles(env)
  assert.equal(error, undefined)
  assert.equal(profiles[0].homeRegion, 'ap-seoul-1')
  assert.deepEqual(profiles[0].compartments.map(c => c.name), ['prod'])
  assert.deepEqual(profiles[0].names.vcn.map(n => n.name), ['v1'])
})

/* ── 매핑 무결성 ── */
t('SEARCH_TYPE_TO_TARGET 값 중복 없음', () => {
  const targets = Object.values(SEARCH_TYPE_TO_TARGET)
  assert.equal(targets.length, new Set(targets).size)
})

/* ── 수집 레시피 bash 문법 ── */
t('renderProfileCollectScript → bash -n 통과', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oci-profile-'))
  const file = join(dir, 'collect.sh')
  writeFileSync(file, renderProfileCollectScript())
  execFileSync('bash', ['-n', file])
})
t('레시피에 읽기전용 명령만(mutating 없음)', () => {
  const script = renderProfileCollectScript()
  assert.ok(script.includes('region-subscription list'))
  assert.ok(script.includes('compartment list'))
  assert.ok(script.includes('structured-search'))
  assert.ok(!/\b(create|delete|update|terminate)\b/.test(script))
})

console.log(`\nprofiles: ${passed} passed`)
