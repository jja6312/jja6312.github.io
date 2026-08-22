# Claude 구현 프롬프트: OCI CLI Blueprint Engine

아래 내용을 Claude Code의 새 작업에 그대로 전달한다.

---

당신은 `jja6312/jja6312.github.io` 블로그의 OCI CLI Blueprint Engine을 구현한다.

## 작업 위치

- 사이트 저장소: `C:\0jja\2project\0work\jja6312.github.io`
- private 데이터 저장소: `C:\0jja\2project\0work\blog-db`
- 공개 사이트: `https://jja6312.github.io`

## 사용자 결정

사용자는 OCI CLI 자산화 방식으로 **B. First-class Blueprint Engine**을 선택했다. 단일 Network Bash를 Custom CLI에 추가하는 방식으로 축소하지 마라.

사용자는 이번 구현의 우선순위를 명시적으로 변경했다. 현재 `OCI_CLI_COMPLETION_PLAN.md`의 P2 순서를 존중하되, 서비스 범위 확장 전에 `Phase 2.5 — Blueprint Foundation`을 추가하여 이 작업을 수행한다.

## 반드시 먼저 읽을 파일

1. `AGENTS.md`
2. `OCI_CLI_COMPLETION_PLAN.md`
3. `OCI_CLI_BLUEPRINT_ENGINE_DESIGN.md`
4. `blog-db/AUTHORING.md`가 있으면 해당 파일
5. 다음 현재 구현 파일
   - `src/pages/CliBuilderPage.tsx`
   - `src/lib/cliOptionModel.ts`
   - `src/lib/cliExecutionContext.ts`
   - `src/lib/cliDynamicLookup.ts`
   - `scripts/generate-cli-catalog.py`
   - `scripts/generate-protected-data.mjs`
   - `scripts/verify-oci-cli-generated-commands.mjs`
   - `scripts/verify-protected-data.mjs`
   - `scripts/oci-cli-source.lock.json`

설계 문서를 끝까지 읽기 전에는 구현하지 마라.

## 목표

기존 Resource CLI 카탈로그를 원자 자산으로 재사용하는 Blueprint Engine을 만들고, 첫 자산으로 `network-baseline-2tier/v1`을 완성한다.

사용자는 Blueprint 입력 JSON을 붙여넣거나 폼에 입력하고 다음 흐름을 수행할 수 있어야 한다.

```text
DESIGN → DISCOVER → PLAN → APPLY → RUN RESULT IMPORT
       → PROVISIONAL MANIFEST → VERIFY → FINAL MANIFEST/ROLLBACK
```

블로그는 OCI CLI를 직접 실행하지 않는다. read-only Discover Bash와 Apply/Resume/Verify/Rollback Bash를 생성하고, 사용자가 실행 결과 JSON을 다시 붙여넣는 구조다.

## 핵심 제약

1. Blueprint에 OCI command string이나 option metadata를 복제하지 마라.
2. 각 node는 `resource + operation`으로 현재 `cliCatalog`의 공식 operation을 참조해야 한다.
3. generator가 unknown resource/operation/option, required binding 누락, deprecated option, cycle을 차단해야 한다.
4. `CliBuilderPage.tsx`에 Blueprint 전용 거대한 if/else를 추가하지 마라.
5. 카탈로그 타입과 일반 공식 명령 renderer를 순수 모듈로 추출하고 Resource UI와 Blueprint가 공유하게 하라.
6. 기존 특수 builder를 전면 재작성하지 마라. v1에서 필요한 경계만 추출하라.
7. 자유 문자열 expression evaluator, `eval`, 임의 JavaScript 실행을 만들지 마라. typed value source만 사용하라.
8. 동일 이름만으로 기존 자원을 재사용하지 마라. 자원별 comparison contract가 일치해야 한다.
9. 기존 자원의 설정이 다르면 `CONFLICT`다. v1은 자동 UPDATE/merge를 하지 않는다.
10. Rollback은 SUCCEEDED node 자체 또는 FAILED node의 `resource`가 `actualAction=CREATED`, `createdByRun=true`이고 삭제 직전 OCI GET에서 `blueprint-run-id=<runId>` 태그가 일치할 때만 역순 삭제한다. REUSED 자원은 절대 삭제하지 않는다.
11. 실 고객명, 실제 OCID, 비밀번호, API Private Key, Security Token을 source/fixture에 넣지 마라.
12. Blueprint generic asset은 자물쇠1, 고객 Run Manifest는 로컬 Download/Import를 v1 필수로 하고 L3 remote save는 후속으로 둔다.
13. v1 Import는 JSON만 지원한다. YAML dependency를 추가하지 마라.
14. Terraform exporter, IPv6, DRG, OKE, LB, Compute, DB 생성으로 범위를 넓히지 마라.
15. v1 `PUBLIC_PRIVATE_STANDARD`은 IGW/NAT/Service Gateway를 모두 켜고 Public Subnet public IP=true, Private Subnet public IP=false를 강제하는 고정 Preset이다. 이들을 독립 toggle로 만들지 마라.

## 구현 순서

### 0. 사전 조사와 계획 반영

- `git status`로 사용자 변경을 확인하고 건드리지 마라.
- 현재 OCI CLI source pin과 latest check 상태를 확인한다.
- Oracle 공식 문서와 고정 OCI CLI source에서 VCN, Internet/NAT/Service Gateway, Route Table, Security List, Subnet의 현재 명령·옵션·응답 필드를 검증한다.
- OCI Console의 현재 Networking 메뉴 경로를 공식 문서로 검증한다.
- 기존 catalog에서 관련 리소스와 CRUD를 검색하고 중복 생성하지 않는다.
- `OCI_CLI_COMPLETION_PLAN.md`에 `Phase 2.5 — Blueprint Foundation` 항목을 추가한다. 완료 체크는 배포와 라이브 검증 전까지 하지 않는다.

### 1. Source contracts and generator

private `blog-db`에 다음 source를 만든다.

```text
knowledge/oci-cli/blueprints/catalog.json
knowledge/oci-cli/blueprints/network-baseline-2tier.v1.json
knowledge/oci-cli/naming-policies/msp-standard.v1.json
```

public site에 다음 schema/generator를 만든다.

```text
schemas/oci-cli-blueprint.schema.json
schemas/oci-cli-blueprint-input.schema.json
schemas/oci-cli-artifact-envelope.schema.json
schemas/oci-cli-discovery-result.schema.json
schemas/oci-cli-run-result.schema.json
schemas/oci-cli-verification-result.schema.json
schemas/oci-cli-run-manifest.schema.json
scripts/generate-cli-blueprints.mjs
scripts/verify-oci-cli-blueprints.mjs
scripts/verify-oci-cli-blueprint-scripts.mjs
```

generator는 `.protected-cache/cliCatalog.json`을 읽어 commandRef와 option binding을 검증한 뒤 `.protected-cache/cliBlueprintCatalog.json`을 만든다.

`scripts/generate-protected-data.mjs`와 `src/lib/protectedData.ts`에 L1 `cliBlueprints`를 추가한다.

### 2. Shared pure engine

권장 파일 경계:

```text
src/lib/oci-cli/catalogTypes.ts
src/lib/oci-cli/renderOperation.ts
src/lib/oci-cli/blueprintTypes.ts
src/lib/oci-cli/blueprintCanonical.ts
src/lib/oci-cli/blueprintValidate.ts
src/lib/oci-cli/blueprintNaming.ts
src/lib/oci-cli/blueprintGraph.ts
src/lib/oci-cli/blueprintPlan.ts
src/lib/oci-cli/blueprintRender.ts
src/lib/oci-cli/blueprintManifest.ts
```

필수 순수 기능:

- Input validation
- CIDR validation/containment/overlap
- Naming derivation and collision detection
- DAG topological sort and cycle detection
- Discovery marker extraction and schema validation
- CREATE/REUSE/CONFLICT/BLOCKED/SKIP plan
- Discover/Apply/Resume/Verify/Rollback Bash rendering
- Plan Digest canonicalization/invalidation
- Run Result parsing, Resume rendering, Provisional Manifest generation
- Verification Result parsing and Final Manifest merge
- Manifest/draft import/export

Condition, Discovery, Comparison, Verify, Rollback, Run Result, Manifest의 union과 제약은 설계 문서 10.5~10.10, 14.3~14.8의 계약을 그대로 구현한다. 임의 expression/JMESPath evaluator나 느슨한 `Record<string, unknown>` 대체로 계약을 축소하지 않는다. JSON 결과 경로는 RFC 6901 JSON Pointer만 허용한다.

- v1 derived key registry와 commandRef별 response output pointer/type registry를 명시하고 unknown key/path/type은 build 실패
- Bash wire payload와 브라우저/Node import envelope를 분리
- RFC 8785 canonicalization/SHA-256은 브라우저와 Node가 공유하는 단일 모듈에서만 수행하고 `jq -S`로 대체하지 않음
- 같은 fixture를 Node/browser에서 canonicalize하여 bytes/digest가 일치하는 교차 테스트

기존 `cliOptionModel`, `cliExecutionContext`, `cliDynamicLookup`의 안전한 직렬화와 lookup 패턴을 재사용한다.

### 3. Network baseline definition

기본 Preset은 다음 10개 자원을 관리한다.

1. VCN
2. Internet Gateway
3. NAT Gateway
4. Service Gateway
5. Public Route Table
6. Private Route Table
7. Public Security List
8. Private Security List
9. Public Regional Subnet
10. Private Regional Subnet

요구 동작:

- VCN 기본 DHCP Options ID를 조회해 두 Subnet에 재사용
- VCN 기본 RT/SL은 변경하지 않음
- Public RT: `0.0.0.0/0 → IGW`
- Private RT: `0.0.0.0/0 → NAT Gateway`
- Private RT: Oracle Services Network → Service Gateway
- Service ID/CIDR은 Profile/Region read-only discovery로 조회하고 하드코딩하지 않음
- ingress 기본 deny
- SSH ingress 기본 off
- SSH on이면 source CIDR 필수, `0.0.0.0/0` 경고/차단
- Private Subnet public IP 금지
- v1에서 NSG 자동 연결 없음
- 모든 10개 자원에 관리 태그를 넣고, Apply에서 생성하는 자원에는 `blueprint-run-id=<runId>`를 포함
- 기존 동일 이름 자원은 관리 태그를 포함한 comparison contract가 정확히 맞아야 REUSE한다. 태그가 없으면 CONFLICT이며 v1 자동 adopt/update/merge는 없다.

### 4. UI

권장 컴포넌트:

```text
src/pages/cli/CliBlueprintWorkspace.tsx
src/pages/cli/BlueprintNavigation.tsx
src/pages/cli/BlueprintDesignPanel.tsx
src/pages/cli/BlueprintDiscoveryPanel.tsx
src/pages/cli/BlueprintPlanPanel.tsx
src/pages/cli/BlueprintOutputPanel.tsx
src/pages/cli/BlueprintManifestPanel.tsx
```

OCI CLI 좌측에 독립 `Blueprints` accordion을 만든다. Custom CLI 하위에 넣지 마라.

Workspace 탭:

```text
DESIGN | DISCOVER | PLAN | APPLY | VERIFY | MANIFEST
```

UI 요구:

- 폼과 JSON 붙여넣기 양방향
- 이름 Preview와 기본 구조도
- Discover Bash 복사와 결과 Paste
- Plan node별 상태와 conflict diff
- Discover/유효 Plan 없이는 Apply 복사 차단
- Apply Run Result 붙여넣기, Provisional Manifest 생성, 실패 node Resume 제공
- Provisional Manifest가 없으면 Verify 차단, Verify Result를 붙여넣어 Final Manifest 생성
- 기존 Alt+O/Alt+C, 최초 높이 제한, 재펼침 전체 높이 유지
- Right validation sidebar가 INPUT/NAMING/NETWORK/DISCOVERY/CONFLICT/SAFETY를 표시하고 클릭 시 focus
- Desktop/mobile에서 sticky overlap 없음
- 긴 Bash/OCID/이름에서 가로 overflow 없음
- 자동 복구는 `sessionStorage`의 `hub-cli-blueprint-session-v1`, 30일 TTL과 Clear 제공
- `localStorage`의 `hub-cli-blueprint-drafts-v1`은 사용자가 30일 보관을 명시적으로 켠 경우만 사용
- Discovery raw JSON, Run Result, Provisional/Final Manifest는 session/local storage에 자동 저장하지 않음
- 공유 PC 경고와 현재 Blueprint 데이터 전체 삭제 기능
- 새로고침 복구는 입력 draft만 허용하고, 복구된 Plan summary는 stale/non-actionable로 표시하여 Discover 재실행 또는 재Import 요구
- Manifest JSON Download/Import
- Bash UI는 CI fixture 기반 `빌드 검증된 템플릿` badge만 표시한다. 브라우저가 사용자별 생성 Bash에 `bash -n`을 실행한 것처럼 표시하지 않는다.
- URL deep link: `?mode=blueprint&blueprint=network-baseline-2tier&version=1`

### 5. Bash safety contract

모든 multi-command script는 다음을 만족해야 한다.

- `set -Eeuo pipefail`
- `umask 077`
- `mktemp -d` + cleanup trap
- request context는 shell array
- `eval` 없음
- unchecked `data[0]` 없음
- 0/1/N exact-name 처리
- pagination 끝까지 처리
- 일부 조회 실패를 0건으로 취급하지 않음
- 기본 mode는 read-only PLAN/DISCOVER
- Apply는 `MODE=APPLY`와 `CONFIRM=<planDigest>` 필요
- Plan Digest는 설계 문서 14.3의 RFC 8785 canonical payload + SHA-256 계약을 그대로 구현하고, 입력/Context/Discovery 변경 시 downstream 산출물을 모두 무효화
- 브라우저가 만든 canonical Plan bytes의 base64를 Apply에 고정하고, Bash는 decode한 동일 bytes를 hash할 뿐 JSON canonicalization을 하지 않음
- Apply 직전 discovery/comparison 재검증
- `runId`/`attemptId`와 node별 typed Run Result 누적
- ERR/EXIT trap에서 성공·부분 실패·실패 모두 marker 사이의 현재 Run Result 출력. `emit_run_result_once` guard로 ERR 후 EXIT에서도 marker 묶음은 정확히 한 번만 출력
- CREATE API가 OCID를 반환하면 WAIT 전에 Run Result에 CREATED/createdByRun/OCID를 먼저 기록; 이후 WAIT/GET 실패 시 FAILED.resource로 소유권 유지
- JSON은 안전한 temp file 또는 `jq -n` 사용
- node별 결과와 marker 사이 JSON 출력
- Resume은 같은 `runId`, 새 `attemptId`를 사용하고 성공 node를 OCID로 재검증한 뒤 FAILED(resumeEligible)/PENDING만 DAG 순서로 재시도
- Rollback은 `MODE=ROLLBACK`, run ID, compartment ID와 현재 ownership tag 확인

### 6. Tests

최소한 다음 fixture와 자동 검증을 추가한다.

- empty compartment → 10 CREATE
- exact match → 10 REUSE
- partial match → CREATE/REUSE mixed
- duplicate name → CONFLICT
- VCN/subnet/route mismatch → CONFLICT
- permission/pagination failure → BLOCKED
- management tag 없는 동일 이름 자원 → CONFLICT
- 고정 v1 Topology와 다른 Import 조합 → validation failure
- input/context/discovery 변경 → Plan Digest와 Apply/Verify/Manifest stale
- cycle/unknown option/deprecated binding/build failure
- naming determinism/normalization/truncation/DNS collision
- CIDR containment/overlap/private public IP/SSH source
- Discover/Apply/Resume/Verify/Rollback `bash -n`
- no `eval`, no unchecked first result
- Apply/Resume ERR·EXIT에서 typed Run Result 보존
- ERR 후 EXIT에서도 Run Result marker는 정확히 1회 출력
- CREATE 성공 후 WAIT/GET 실패 → FAILED.resource에 CREATED ownership/OCID 보존
- 위 FAILED node Resume → CREATE 반복 없이 WAIT/POST_CREATE_GET부터 재개
- partial failure → Provisional Manifest/rollback preview, Verify disabled
- Resume 성공 node drift → RESUME_BLOCKED
- Verify는 Provisional Manifest OCID만 사용하고 digest 일치 결과만 Final Manifest에 merge
- rollback은 `CREATED + createdByRun + current run-id tag` 조건 없이는 삭제하지 않음
- rollback은 node 성공 여부와 무관하게 FAILED.resource도 ownership 조건이 맞으면 Preview 대상
- Run Result/Manifest discriminated union과 semantic invariant 검증
- Node/browser RFC 8785 canonical bytes/digest 교차 일치
- unknown derived key/output pointer/type build failure
- session/local storage TTL/opt-in/clear와 민감 결과 자동 저장 금지
- existing Resource CLI representative 219 commands unchanged

새 테스트를 `package.json`의 독립 script로 노출하고 `gen:protected` gate에 포함한다.

## 완료 조건

다음이 모두 끝나기 전에는 작업 완료로 보고하지 마라.

1. 설계 문서의 Acceptance Criteria 17개 충족
2. Blueprint source와 public generated catalog 모두 검증
3. `npm run gen:protected` 성공
4. 모든 기존·신규 OCI CLI 테스트 성공
5. `npm run lint` 성공
6. `npm run build` 성공
7. 생성된 모든 Blueprint Bash `bash -n` 성공
8. Desktop/mobile 브라우저 QA
9. `OCI_CLI_COMPLETION_PLAN.md`에 실제 완료일, commit, 테스트, 배포 증거 기록
10. site와 blog-db의 의도한 파일만 각각 commit/push
11. GitHub Pages 자동 배포 완료
12. 라이브 `https://jja6312.github.io/#/knowledge/oci-cli`에서 Blueprint 메뉴와 전체 흐름 확인
13. 라이브 JS/CSS/protected-data가 로컬 최종 산출물과 일치

## 작업 방식

- 합리적인 기본값은 설계 문서의 `Open decisions with defaults`를 따른다.
- 결과 구조를 바꾸는 진짜 blocker만 사용자에게 질문한다.
- 테스트 fixture에 실제 고객 정보를 사용하지 않는다.
- 기존 사용자 변경이나 관련 없는 dirty file을 덮어쓰지 않는다.
- 구현 중 Oracle 공식 문서·고정 OCI CLI source와 설계의 명령 경로, 옵션명, 응답 field가 사실상 충돌하면 해당 사실 교정만 `Implementation Note`로 기록할 수 있다.
- Architecture, lifecycle 순서, digest/Run Result/Resume/Manifest/Rollback safety, persistence, non-goal 또는 scope를 바꾸어야 하는 충돌은 임의 수정하지 말고 구현을 멈춘 뒤 사용자 승인을 요청한다.
- 단순히 UI가 보이는 데서 끝내지 말고, 생성된 Bash와 lifecycle 계약이 실제로 닫혀 있는지 확인한다.
- 배포까지 자동으로 완료한다.

## 최종 보고 형식

- 구현한 architecture와 사용자 경험
- 수정한 주요 파일
- Blueprint resource/node 수
- 테스트 명령과 결과
- 생성 Bash syntax 결과
- commit SHA와 GitHub Actions run URL
- 라이브 URL과 확인한 항목
- 남은 제한과 후속 Phase

---
