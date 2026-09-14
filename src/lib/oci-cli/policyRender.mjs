// policy 번들 → oci iam policy create/verify/rollback bash 렌더러. 순수 함수.
// 안전 원칙(레포 학습분 반영):
//  1) --statements 는 '[' 로 시작 → Windows(Click) glob 확장 사고 → 반드시 file:// 임시파일로 전달.
//  2) 명령치환 결과를 URL/인자로 넘길 때 Windows python CRLF(%0D) 사고 → tr -d '\r' 로 세정.
//  3) compartment 는 이름→OCID 정확히 1개 해석(0/N 이면 후보 표로 중단). OCID 직접 입력도 허용.
//  4) 생성/검증/롤백을 각각 독립 실행 가능한 스크립트로(사용자 요구: 에러 포함 별도 파일).

/** 단일따옴표 안전 이스케이프 — bash 리터럴. */
function q(s) { return `'${String(s ?? '').replace(/'/g, `'\\''`)}'` }

/** 파일명/식별자용 슬러그. */
export function slugify(s) {
  return String(s || 'policy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'policy'
}

/** profile/region → CTX 배열 정의 라인. IAM 은 홈 리전에서만 쓰기 가능하므로 region 권장. */
function ctxLines(profile, region) {
  const lines = [`PROFILE=${q(profile || 'DEFAULT')}`]
  const ctx = ['--profile "$PROFILE"']
  if (region) { lines.push(`REGION=${q(region)}   # 정책은 홈 리전에서만 생성/수정 가능`); ctx.push('--region "$REGION"') }
  lines.push(`CTX=(${ctx.join(' ')})`)
  return lines
}

/** compartment 이름→OCID 해석 블록(스크립트 3종 공통 prelude). OCID 직접 입력이면 그대로 사용. */
function compartmentBlock(compartmentInput) {
  return [
    `COMPARTMENT_INPUT=${q(compartmentInput)}   # compartment 이름 또는 OCID`,
    '',
    '# compartment 해석 — 이름이면 테넌시 하위에서 ACTIVE 정확히 1개를 OCID 로 변환',
    `TENANCY_ID=$(oci iam availability-domain list --query 'data[0]."compartment-id"' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    'if [[ "$COMPARTMENT_INPUT" == ocid1.compartment.* || "$COMPARTMENT_INPUT" == ocid1.tenancy.* ]]; then',
    '  COMPARTMENT_ID="$COMPARTMENT_INPUT"',
    'else',
    `  COMPARTMENT_COUNT=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query 'length(data)' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    '  if [[ "$COMPARTMENT_COUNT" != "1" ]]; then',
    '    echo "[ERROR] ACTIVE compartment 이름은 정확히 1개여야 합니다: $COMPARTMENT_INPUT (found=$COMPARTMENT_COUNT)" >&2',
    `    oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query 'data[].{name:name,state:"lifecycle-state",id:id}' --output table "\${CTX[@]}" >&2`,
    '    exit 1',
    '  fi',
    `  COMPARTMENT_ID=$(oci iam compartment list --compartment-id "$TENANCY_ID" --name "$COMPARTMENT_INPUT" --lifecycle-state ACTIVE --compartment-id-in-subtree true --access-level ACCESSIBLE --all --query 'data[0].id' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
    'fi',
  ]
}

function header(title) {
  return [
    '#!/usr/bin/env bash',
    `# ${title}`,
    '# 생성: 지식모음 > OCI Policy (jja6312.github.io) — 붙여넣어 실행하세요.',
    'set -euo pipefail',
    '',
  ]
}

/**
 * @param {import('./policyRender.d.mts').PolicyRenderArgs} args
 * @returns {import('./policyRender.d.mts').PolicyScriptSet}
 */
export function renderPolicyScripts({ policyName, description, statements, compartmentInput, profile, region }) {
  const name = String(policyName || '').trim()
  const stmts = (statements || []).map(s => String(s).trim()).filter(Boolean)
  if (!name) throw new Error('policyName 이 필요합니다')
  if (stmts.length === 0) throw new Error('statements 가 비어 있습니다')
  const slug = slugify(name)
  const desc = String(description || `${name} — OCI Policy`).trim()
  const ctx = ctxLines(profile, region)
  const comp = compartmentBlock(compartmentInput || '<compartment-name-or-ocid>')
  const stmtJson = JSON.stringify(stmts, null, 2)

  // ── 생성 ──────────────────────────────────────────────
  const create = {
    title: `OCI Policy 생성 — ${name}`,
    filename: `policy-${slug}.create.sh`,
    body: [
      ...header(`OCI Policy 생성 — ${name}  (statements ${stmts.length}개)`),
      ...ctx,
      '',
      ...comp,
      '',
      '# statements 는 "[" 로 시작 → Windows glob 사고 회피 위해 반드시 file:// 로 전달',
      'STMT_FILE="$(mktemp 2>/dev/null || echo "./.oci-policy-stmts.$$.json")"',
      `trap 'rm -f "$STMT_FILE"' EXIT`,
      `cat > "$STMT_FILE" <<'OCI_POLICY_STATEMENTS'`,
      stmtJson,
      'OCI_POLICY_STATEMENTS',
      '',
      'oci iam policy create \\',
      '  --compartment-id "$COMPARTMENT_ID" \\',
      `  --name ${q(name)} \\`,
      `  --description ${q(desc)} \\`,
      '  --statements "file://$STMT_FILE" \\',
      '  --output json "${CTX[@]}"',
      '',
      `echo "[OK] policy 생성 요청 완료 — ${name}"`,
    ].join('\n'),
  }

  // ── 검증(조회) ────────────────────────────────────────
  const verify = {
    title: `OCI Policy 검증(조회) — ${name}`,
    filename: `policy-${slug}.verify.sh`,
    body: [
      ...header(`OCI Policy 검증 — ${name} 의 statements 를 조회해 확인`),
      ...ctx,
      '',
      ...comp,
      '',
      `oci iam policy list --compartment-id "$COMPARTMENT_ID" --name ${q(name)} \\`,
      `  --query 'data[0].{name:name,id:id,statements:statements}' --output json "\${CTX[@]}"`,
    ].join('\n'),
  }

  // ── 롤백(삭제) ────────────────────────────────────────
  const rollback = {
    title: `OCI Policy 롤백(삭제) — ${name}`,
    filename: `policy-${slug}.rollback.sh`,
    body: [
      ...header(`OCI Policy 삭제 — ${name}  ⚠ 이중확인(DELETE 입력) 필요`),
      ...ctx,
      '',
      ...comp,
      '',
      `POLICY_ID=$(oci iam policy list --compartment-id "$COMPARTMENT_ID" --name ${q(name)} --query 'data[0].id' --raw-output "\${CTX[@]}" | tr -d '\\r')`,
      'if [[ -z "$POLICY_ID" || "$POLICY_ID" == "None" ]]; then echo "[INFO] 삭제할 정책 없음"; exit 0; fi',
      'echo "삭제 대상 정책: $POLICY_ID"',
      'read -r -p "정말 삭제하려면 DELETE 를 입력: " CONFIRM',
      '[[ "$CONFIRM" == "DELETE" ]] || { echo "취소됨"; exit 1; }',
      'oci iam policy delete --policy-id "$POLICY_ID" --force "${CTX[@]}"',
      `echo "[OK] policy 삭제 완료 — ${name}"`,
    ].join('\n'),
  }

  return { create, verify, rollback }
}
