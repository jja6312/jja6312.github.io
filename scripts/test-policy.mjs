#!/usr/bin/env node
// OCI Policy — 파서 + 렌더러 순수 로직 테스트 (러너 없이 node:assert).
// 렌더 결과는 bash -n 으로 문법까지 검증한다.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parsePolicyStatement, verbRank, guessCategory, POLICY_VERBS } from '../src/lib/oci-cli/policyParse.mjs'
import { renderPolicyScripts, slugify } from '../src/lib/oci-cli/policyRender.mjs'

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`) }

/* ── 파서 ── */
t('기본 Allow group→manage tenancy 분해', () => {
  const p = parsePolicyStatement('Allow group Admins to manage all-resources in tenancy')
  assert.equal(p.valid, true); assert.equal(p.kind, 'allow')
  assert.equal(p.subjectType, 'group'); assert.equal(p.subject, 'Admins')
  assert.equal(p.verb, 'manage'); assert.equal(p.resourceType, 'all-resources')
  assert.equal(p.scope, 'tenancy')
})
t('dynamic-group + compartment + where', () => {
  const p = parsePolicyStatement('Allow dynamic-group DG1 to use object-family in compartment prod where request.region = \'ap-seoul-1\'')
  assert.equal(p.subjectType, 'dynamic-group'); assert.equal(p.subject, 'DG1')
  assert.equal(p.verb, 'use'); assert.equal(p.resourceType, 'object-family')
  assert.equal(p.scope, 'compartment'); assert.equal(p.locationName, 'prod')
  assert.match(p.where, /request\.region/)
})
t('service 주체 + compartment id(OCID)', () => {
  const p = parsePolicyStatement('Allow service cloudguard to read all-resources in compartment id ocid1.compartment.oc1..aaa')
  assert.equal(p.subjectType, 'service'); assert.equal(p.subject, 'cloudguard')
  assert.equal(p.scope, 'compartment'); assert.equal(p.locationName, 'ocid1.compartment.oc1..aaa')
})
t('any-user 인식', () => {
  const p = parsePolicyStatement('Allow any-user to inspect instances in tenancy')
  assert.equal(p.subjectType, 'any-user'); assert.equal(p.verb, 'inspect')
})
t('대소문자·공백 관대', () => {
  const p = parsePolicyStatement('  allow   GROUP   NetAdmins   to   MANAGE   virtual-network-family   in   COMPARTMENT   net  ')
  assert.equal(p.valid, true); assert.equal(p.verb, 'manage'); assert.equal(p.subject, 'NetAdmins')
})
t('Endorse(크로스테넌시) = 유효하되 advanced', () => {
  const p = parsePolicyStatement('Endorse group Admins to manage object-family in any-tenancy')
  assert.equal(p.valid, true); assert.equal(p.kind, 'advanced'); assert.equal(p.keyword, 'endorse')
})
t('비표준 문장 = invalid', () => {
  const p = parsePolicyStatement('please give admins access')
  assert.equal(p.valid, false); assert.equal(p.kind, 'unknown')
})
t('빈 문장 = invalid', () => {
  assert.equal(parsePolicyStatement('   ').valid, false)
})
t('verb 사다리 순서', () => {
  assert.ok(verbRank('inspect') < verbRank('read'))
  assert.ok(verbRank('read') < verbRank('use'))
  assert.ok(verbRank('use') < verbRank('manage'))
  assert.equal(POLICY_VERBS.length, 4)
})
t('카테고리 추정', () => {
  assert.equal(guessCategory('all-resources'), '전체')
  assert.equal(guessCategory('instance-family'), 'Compute')
  assert.equal(guessCategory('virtual-network-family'), 'Networking')
  assert.equal(guessCategory('object-family'), 'Storage')
})

/* ── 렌더러 ── */
t('slugify', () => {
  assert.equal(slugify('New Tenancy Baseline!'), 'new-tenancy-baseline')
  assert.equal(slugify(''), 'policy')
})
t('빈 statements → throw', () => {
  assert.throws(() => renderPolicyScripts({ policyName: 'x', statements: [], compartmentInput: 'prod' }))
})
t('빈 policyName → throw', () => {
  assert.throws(() => renderPolicyScripts({ policyName: '', statements: ['Allow ...'], compartmentInput: 'prod' }))
})

const sample = renderPolicyScripts({
  policyName: 'net-baseline',
  description: '네트워크 기본 정책',
  statements: [
    'Allow group NetAdmins to manage virtual-network-family in compartment net',
    "Allow dynamic-group DG to use object-family in tenancy where request.region = 'ap-seoul-1'",
  ],
  compartmentInput: 'net',
  profile: 'CUST_A',
  region: 'ap-seoul-1',
})

t('create/verify/rollback 3종 생성 + 파일명', () => {
  assert.equal(sample.create.filename, 'policy-net-baseline.create.sh')
  assert.equal(sample.verify.filename, 'policy-net-baseline.verify.sh')
  assert.equal(sample.rollback.filename, 'policy-net-baseline.rollback.sh')
})
t('create: statements 는 file:// 로 전달(glob 회피)', () => {
  assert.match(sample.create.body, /--statements "file:\/\/\$STMT_FILE"/)
  assert.doesNotMatch(sample.create.body, /--statements '\[/) // 인라인 배열 금지
})
t('create: heredoc 에 JSON 배열 포함', () => {
  assert.match(sample.create.body, /<<'OCI_POLICY_STATEMENTS'/)
  assert.match(sample.create.body, /"Allow group NetAdmins to manage virtual-network-family in compartment net"/)
})
t('compartment 이름→OCID + CRLF 세정(tr -d)', () => {
  assert.match(sample.create.body, /oci iam compartment list/)
  assert.match(sample.create.body, /tr -d '\\r'/)
  assert.match(sample.create.body, /COMPARTMENT_INPUT='net'/)
})
t('profile/region CTX 반영', () => {
  assert.match(sample.create.body, /PROFILE='CUST_A'/)
  assert.match(sample.create.body, /REGION='ap-seoul-1'/)
  assert.match(sample.create.body, /--region "\$REGION"/)
})
t('rollback: 이중확인(DELETE) + force', () => {
  assert.match(sample.rollback.body, /CONFIRM" == "DELETE"/)
  assert.match(sample.rollback.body, /oci iam policy delete --policy-id "\$POLICY_ID" --force/)
})
t('작은따옴표 이스케이프 안전', () => {
  const r = renderPolicyScripts({ policyName: "it's-a-test", statements: ["Allow group G to use x in tenancy where a = 'b'"], compartmentInput: "o'brien" })
  assert.match(r.create.body, /'\\''/) // 이스케이프 흔적
})

/* bash -n 문법 검증 (bash 없으면 skip) */
let bash = 'bash'
try { execFileSync(bash, ['--version'], { stdio: 'ignore' }) } catch { bash = '' }
if (bash) {
  const dir = mkdtempSync(join(tmpdir(), 'policy-'))
  for (const key of ['create', 'verify', 'rollback']) {
    const s = sample[key]
    const f = join(dir, s.filename)
    writeFileSync(f, s.body)
    t(`bash -n ${key}`, () => { execFileSync(bash, ['-n', f], { stdio: 'pipe' }) })
  }
} else {
  console.log('  --  bash 없음 → 문법검증 skip')
}

console.log(`\nOCI Policy 테스트 통과 — ${passed}건`)
