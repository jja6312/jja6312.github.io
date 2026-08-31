#!/usr/bin/env node
// OCI CLI nav 넘버링 순수 로직 테스트(node:assert).
import assert from 'node:assert/strict'
import { ociCategoryCode, computeResourceCodes, groupCodeRanges } from '../src/lib/oci-cli/ociNavNumbering.mjs'

const ORDER = [
  'Compute', 'Storage', 'Networking', 'Oracle Database', 'Databases',
  'Analytics & AI', 'Developer Services', 'Identity & Security',
  'Observability & Management', 'Hybrid', 'Migration',
  'Billing & Cost Management', 'Governance & Administration',
]

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

t('대분류 = 랭크 × 100', () => {
  assert.equal(ociCategoryCode('Compute', ORDER), 100)
  assert.equal(ociCategoryCode('Storage', ORDER), 200)
  assert.equal(ociCategoryCode('Networking', ORDER), 300)
  assert.equal(ociCategoryCode('Developer Services', ORDER), 700) // 정본 랭크 고정(부재 카테고리 무시 아님)
  assert.equal(ociCategoryCode('Governance & Administration', ORDER), 1300)
})
t('정본에 없는 라벨 → null', () => { assert.equal(ociCategoryCode('Others', ORDER), null) })

const categories = [
  { label: 'Compute', groups: [
    { label: 'Instances', resources: ['instance', 'instance-boot-volume-backup', 'instance-maintenance-reboot', 'instance-configuration', 'instance-pool'] },
    { label: 'Dedicated Infrastructure', resources: ['dedicated-vm-host', 'capacity-reservation', 'compute-cluster'] },
    { label: 'Custom Images', resources: ['custom-image'] },
  ] },
  { label: 'Storage', groups: [
    { label: 'Block Storage', resources: ['block-volume', 'boot-volume', 'volume-group', 'volume-backup-policy'] },
    { label: 'Object Storage', resources: ['bucket', 'object-put'] },
  ] },
]

const codes = computeResourceCodes(categories, ORDER)
t('Instances 10블록 = 101~105', () => {
  assert.equal(codes.get('instance'), 101)
  assert.equal(codes.get('instance-pool'), 105)
})
t('Dedicated = 111~ (다음 10블록)', () => {
  assert.equal(codes.get('dedicated-vm-host'), 111)
  assert.equal(codes.get('compute-cluster'), 113)
})
t('Custom Images = 121 (세번째 블록)', () => { assert.equal(codes.get('custom-image'), 121) })
t('Storage 200대 = 201~ / Object 211~', () => {
  assert.equal(codes.get('block-volume'), 201)
  assert.equal(codes.get('volume-backup-policy'), 204)
  assert.equal(codes.get('bucket'), 211)
  assert.equal(codes.get('object-put'), 212)
})
t('코드 전부 유일', () => {
  const values = [...codes.values()]
  assert.equal(values.length, new Set(values).size)
})
t('그룹 범위 = 10블록', () => {
  const ranges = groupCodeRanges(categories[0], ORDER)
  assert.deepEqual(ranges.get('Instances'), { start: 101, end: 110 })
  assert.deepEqual(ranges.get('Dedicated Infrastructure'), { start: 111, end: 120 })
  assert.deepEqual(ranges.get('Custom Images'), { start: 121, end: 130 })
})

console.log(`\nnav-numbering: ${passed} passed`)
