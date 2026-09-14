#!/usr/bin/env node
// blueprint CIDR 검증 테스트 (러너 없이 node:assert)
import assert from 'node:assert/strict'
import { parseCidr, cidrContains, cidrsOverlap, validateAddressing } from '../src/lib/oci-cli/cidr.mjs'

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

t('parseCidr 형식', () => {
  assert.ok(parseCidr('10.0.0.0/16'))
  assert.equal(parseCidr('10.0.0.0'), null)
  assert.equal(parseCidr('300.0.0.0/16'), null)
  assert.equal(parseCidr('10.0.0.0/33'), null)
})
t('cidrContains — 사용자 사례(172.16.10.0/24 ⊄ 172.0.0.0/16)', () => {
  assert.equal(cidrContains('172.0.0.0/16', '172.16.10.0/24'), false) // ← 실패했던 케이스
  assert.equal(cidrContains('172.16.0.0/16', '172.16.10.0/24'), true) // VCN 을 172.16 으로 했으면 OK
  assert.equal(cidrContains('172.0.0.0/16', '172.0.10.0/24'), true)   // 서브넷을 172.0 으로 하면 OK
})
t('cidrContains — 경계', () => {
  assert.equal(cidrContains('10.0.0.0/16', '10.0.0.0/16'), true)   // 동일
  assert.equal(cidrContains('10.0.0.0/24', '10.0.0.0/16'), false)  // inner 가 더 넓음
  assert.equal(cidrContains('10.0.0.0/8', '10.255.255.0/24'), true)
})
t('cidrsOverlap', () => {
  assert.equal(cidrsOverlap('10.0.1.0/24', '10.0.2.0/24'), false)
  assert.equal(cidrsOverlap('10.0.1.0/24', '10.0.1.128/25'), true)
  assert.equal(cidrsOverlap('10.0.0.0/16', '10.0.5.0/24'), true)
})
t('validateAddressing — 사용자 실패 입력 재현 → 이슈 검출', () => {
  const issues = validateAddressing({
    'address.vcnCidrs': '["172.0.0.0/16"]',
    'address.publicSubnetCidr': '172.16.10.0/24',
    'address.privateSubnetCidr': '172.16.20.0/24',
  })
  assert.ok(issues.some(i => i.includes('publicSubnetCidr') && i.includes('포함되지')))
  assert.ok(issues.some(i => i.includes('privateSubnetCidr') && i.includes('포함되지')))
})
t('validateAddressing — 올바른 입력 → 이슈 없음', () => {
  const issues = validateAddressing({
    'address.vcnCidrs': '["172.16.0.0/16"]',
    'address.publicSubnetCidr': '172.16.10.0/24',
    'address.privateSubnetCidr': '172.16.20.0/24',
    'address.sshSourceCidr': '203.0.113.0/24',
  })
  assert.deepEqual(issues, [])
})
t('validateAddressing — 서브넷 중첩 검출', () => {
  const issues = validateAddressing({
    'address.vcnCidrs': '["10.0.0.0/16"]',
    'address.publicSubnetCidr': '10.0.1.0/24',
    'address.privateSubnetCidr': '10.0.1.0/25',
  })
  assert.ok(issues.some(i => i.includes('중첩')))
})
t('validateAddressing — 형식 오류·빈 VCN', () => {
  assert.ok(validateAddressing({ 'address.vcnCidrs': '' }).some(i => i.includes('VCN CIDR')))
  assert.ok(validateAddressing({ 'address.vcnCidrs': '10.0.0/16' }).some(i => i.includes('형식 오류')))
})

console.log(`\ncidr 테스트 통과 — ${passed}건`)
