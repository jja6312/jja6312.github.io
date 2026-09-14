# OCI CLI 입력·조회 설계 검토

검토 기준: 2026-09-08, 시작 커밋 `3e4c3ee`. 코드 정적 조사 + 공통 입력 회귀 테스트 + 대표 화면 검증. 전체 9,130개 명령을 실제 OCI에서 실행한 전수 인증은 아니다. 고객 데이터·인증정보는 포함하지 않는다.

구조도: [OCI_CLI_DESIGN_2026-09-08.html](OCI_CLI_DESIGN_2026-09-08.html). 중립 밝은 테마, architecture / doc-wide, 전체 구조·공통 입력 판정·목록 선택 흐름으로 분리했다.

## 결론

공식 옵션의 정확성과 사람이 완주할 수 있는 입력 흐름은 별개다. `required=true`는 **OCI 실행 시 값이 필요하다**는 뜻이지, **사람이 반드시 직접 타이핑해야 한다**는 뜻이 아니다. 현재 시스템은 공식 Click 스키마 기반이라는 좋은 토대가 있지만, 운영 Overlay·폼·Alt+I·명령 생성기의 판단 규칙이 분산되어 있다. 이 분산이 이번 결함의 직접 원인이다.

## 이번 요청으로 교정한 범위

| 문제 | 원인·근거 | 변경 |
|---|---|---|
| 자동 조회할 테넌시인데 Alt+I가 차단 | `CliBuilderPage` 검증에는 가짜 문자열을 넣고 wizard `isFilled`는 원시 빈칸만 검사 | `cliInputResolution`의 provided / automatic / missing / blocked 상태를 폼·wizard·preflight에서 공유. 실제 입력값에 sentinel을 쓰지 않음 |
| Subscription ID를 찾으려면 메뉴를 왕복 | `directLookupReason`에 설명만 있고 실행 가능한 관계가 없음 | `cliDiscovery` 관계 계약 + 공통 `CliDiscoveryPanel`. 현재 폼에서 LIST 명령 복사 → JSON 붙여넣기 → ID 선택 |
| 선택 필드·직접 OCID에도 조회 범위 요구 | `lookupIssues`가 입력 사용 여부·직접 OCID 여부와 무관하게 모든 prerequisite 검사 | 빈 선택값에는 조회 요구를 만들지 않음. OCID 직접 입력이면 이름 조회용 범위를 요구하지 않음 |
| AD 기본값과 필수값 상태가 다름 | AD 첫 번째 선택은 builder에 있지만 wizard에는 없음 | scope가 준비된 경우만 “실행 시 자동 조회 · 첫 번째 AD”로 표시 |
| Alt+I에서 Shape 변경 후 이전 Image 잔존 | wizard는 `setVal`, 일반 폼은 `setFormVal`로 다른 경로 사용 | 공통 변경 함수를 호출해 종속 이미지 선택을 해제 |
| 이정표 클릭만으로 미입력을 완료처럼 표시 | `step < index`를 완료 판정으로 사용 | 실제 값/자동 해석 가능 여부로 표시. 마지막 이동에서도 누락 필수를 다시 확인 |
| 리전 자동완성보다 wizard Enter가 먼저 실행 | 부모 `onKeyDownCapture`가 자식 콤보박스 전에 처리 | bubble 처리 + `defaultPrevented`/IME 체크. 결과 패널 입력은 Enter를 가로채지 않음 |

필수 OCID가 모두 자동으로 바뀌는 것은 아니다. 이름·조회 범위·부모 ID가 더 필요한 항목은 계속 차단한다. 자동 표시 역시 “조회 성공”이 아니라 **생성한 Bash를 사용자가 실행할 때 조회 예정**이라는 의미다. IAM 권한·토큰·실제 0/1/N 결과는 실행 시 확인된다.

## Subscription 흐름의 정확한 계약

- Console 위치는 기존 Billing & Cost Management > Subscriptions를 유지한다. 새로운 중복 카테고리를 만들지 않는다.
- 출발 명령: `oci onesubscription organization-subscription organization-subscription list --all`. 루트 compartment는 기존 tenancy 동적 조회를 재사용한다.
- 선택 값: 원본 JSON `.data[].id`의 문자열 SPM Subscription ID. `oci organizations subscription list`의 Subscription OCID와 혼동하면 안 된다.
- 도착 명령: `oci onesubscription subscribed-service subscribed-service list --subscription-id ...`.
- 동일 Profile / Region / Auth / Endpoint를 양쪽에 전달한다. 발견 명령의 출력은 `--output json`으로 고정하며 사용자의 최종 `--query`, 표 출력, raw-output을 섞지 않는다.
- JSON 오류·예상 collection 없음·ID 없음·중복 ID·잘못된 ID 종류를 거부한다. 0건은 오류가 아닌 빈 조회 결과로 설명한다. ID를 임의로 첫 번째 값으로 확정하지 않는다.
- 목록과 붙여넣기 값은 메모리에만 둔다. Profile / Region / Auth / Endpoint·조회 범위·모드가 바뀌면 패널 후보와 해당 조회에서 선택한 ID를 무효화한다. 사용자가 이후 직접 수정한 값은 지우지 않는다. 조회 결과 선택 자체는 다른 폼 값을 변경하지 않는다.
- 새 조회 바로가기 Bash는 subshell로 감싸서 내부 `set -e`/`exit`가 현재 대화형 셸 설정을 바꾸지 않도록 한다. 실패 전파·명령 문법을 회귀 테스트로 확인한다.
- 같은 패널은 기존 exactName dynamicLookup의 LIST 관계에서도 재사용한다. source catalog가 없는 항목은 조회 명령을 추측해서 만들지 않는다.

공식 근거:

- [Organization Subscription LIST: root compartment 필수](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/onesubscription/organization-subscription/organization-subscription/list.html)
- [Subscribed Service LIST: line-level Subscription ID 필수](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/onesubscription/subscribed-service/subscribed-service/list.html)
- [OCI Subscriptions 콘솔 안내](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/subscriptions.htm)

`latest` 문서는 검색 캐시의 버전 표시가 일관되지 않을 수 있다. 실행 메타데이터의 정본은 계속 `scripts/oci-cli-source.lock.json`에 고정한 final Click 트리다.

## 남아 있는 설계 문제와 추천 순서

아래는 이번 수정 외의 후속 작업이다. 정적 코드상 위험과 재현된 결함을 구분하며, 광범위한 동작 변경은 이번 요청에 끼워 넣지 않는다.

| 순서 | 발견 | 사용자 영향 | 권고 / 검증 조건 |
|---|---|---|---|
| P1 | **기존 캐시의 실행 컨텍스트 변경 무효화 규칙 부재**. `activateProfile` 및 namespace 주입 effect가 비어 있는 값만 보충 | 다른 profile로 전환해도 이전 namespace·이미지 후보가 남을 위험. 정적 확인, 다중 테넌시 실증은 후속. **이번에 추가한 조회 후보·선택 ID에는 이미 provenance 무효화를 적용함** | 새 조회의 provenance 패턴을 기존 namespace·이미지·프로필 캐시로 확대. 직접 입력은 재확인 표시 |
| P1 | **비동기 공식 명령 로드에 최신 요청 우선 보장 없음**. `openOfficialPath`/`selectOfficialCommand` | A→B 빠른 클릭 후 늦게 도착한 A가 화면을 덮을 위험. 지연 네트워크 재현 필요 | AbortController 또는 requestId. 마지막 클릭만 반영하는 지연 응답 테스트 |
| P1 | **최신 릴리스 게이트가 기존 v3.91.0 pin의 갱신 필요를 알림** | 원천 버전을 “현재 최신”으로 표시하면 안 됨. 검사 실패를 코드 오류나 데이터 0건으로 오인할 수 있음 | v3.92.0 공식 diff 검토 → lock/runtime/catalog 일괄 갱신 → freshness/metadata gate. 버전 gate를 무시하거나 latest로 자동 변경하지 않음 |
| P2 | **완전한 실행 계획(IR)이 없음**. `CliBuilderPage`에 수천 줄의 일반/전용 builder, UI, validation 공존 | 조회 기본값·scope·가드 규칙이 재차 어긋날 수 있음. 이번에는 입력 상태부터 통합 | `CommandIntent → ResolvedPlan → Bash` 분리. 같은 계획으로 폼·Alt+I·preflight·Bash를 생성. 전용 builder는 adapter만 구현 |
| P2 | **공식 카탈로그와 운영 Overlay의 완주 수준 차이** | 공식 옵션은 있어도 서비스별 선행 LIST·JSON 도우미·오류 해석은 다 채워진 것이 아님 | 필수 ID마다 discovery relation / 자동 해석 / 정당한 direct-only를 기계 검사. 단순 명령 수 대신 업무 완주율을 지표화 |
| P2 | **일부 이름 조회에서 count와 ID 추출을 별도 LIST로 수행**. generic `resolveCompartment` | 두 호출 사이 자원 변경 시 서로 다른 snapshot을 검사할 위험 | LIST 1회 원본 JSON에서 count·후보·ID를 함께 계산. 동일 ID·compartment·lifecycle guard 후 실행 |
| P2 | **문자열 추출/정적 marker 위주의 기존 UI 회귀** | 테스트가 초록이어도 Enter, focus, stale context, 모바일에서 실패 가능 | 독립 builder 모듈의 단위 테스트 + 대표 업무별 브라우저 회귀를 CI에 추가. test:oci-input-flow를 시작점으로 삼기 |
| P3 | **완료 계획의 다음 작업 안내가 과거 상태** | 이미 bake/deploy한 P3-CS-09를 계속 대기로 읽게 됨 | 완료 증거와 다음 작업을 같은 상태 데이터에서 출력. 이번 사용자 우선순위를 계획에 기록 |

## 새 기능 설계 원칙

1. 공식 `required`는 그대로 보존한다. 사람의 추가 입력 필요 여부는 별도 readiness 계약이다.
2. 자동 조회는 사용자 입력 없이 실제 생성 스크립트가 해석 가능한 경우만 인정한다. 조회 조건 부족을 자동 완료로 표시하지 않는다.
3. 다른 메뉴로 이동하라고만 설명하지 말고 선행 조회 관계를 데이터로 등록한다. 생성기·명령 문자열을 패널마다 복제하지 않는다.
4. Profile / Region / Auth / Endpoint가 달라지면 이전 조회 결과의 출처도 달라진다. 후보 무효화·재확인 없이 재사용하지 않는다.
5. 빌드 성공, 생성 Bash 문법, 화면 동작, 실제 OCI 실행은 서로 다른 증거다. 하지 않은 검증은 완료라고 쓰지 않는다.

## 검증 기록

- 통과: lint, TypeScript, production build, 입력/조회 회귀 12종(테넌시 계약 11곳), 기존 validation/context/lookups/defaults/options/completeness/requirements/source/click, Blueprint 54건 + 5종 Bash.
- 생성 명령: 242개 surface의 `bash -n`, 동적 조회 266조합, 필수값/quote/JSON/multiple/flag/conflict/파괴적 확인 가드 통과.
- 로컬 브라우저: 실제 L1 복호화 후 Balance의 자동 tenancy Enter 통과, 직접 모드 빈값 차단, Alt+I 안 JSON 붙여넣기·선택, 필수 모드 4문항, Enter가 textarea에서 질답을 넘기지 않음, 복사 활성화, Profile 변경 시 선택 ID/후보 제거·복사 재차단 확인. 가상 SPM ID 사용; 실제 OCI 호출 없음.
- 모바일: 375×812, 문서 scrollWidth=375; 열린 결과 패널 scrollHeight > clientHeight의 내부 스크롤 및 직접 모드 입력 표시 확인. console errors 0.
- 구조도: skill self_check 통과; 각 도면 노드/연결 7/6, 5/4, 6/6; 실제 SVG bounding box 글자 초과 0, 스크린샷 직접 확인.
- 별도 미통과: `gen:protected`는 metadata 검사까지 통과한 뒤 **기존 v3.91.0 → 최신 v3.92.0 검토 필요 gate**에서 중단. gate를 끄거나 lock을 임의 변경하지 않았다. 재생성된 공식 데이터의 Git 내용 차이 0, 보호 데이터는 변경하지 않는다. UI-only 배포이며 “전체 생성 gate 통과”로 보고하지 않는다.
- 기존 보호 데이터 SHA-256: `6D25767A661EB225A59B5E38EF0BE4966C250F3A9FBF6B9F673D48CE2DA26EB6`. L1/L2/L3 복호화 및 최종 보호 회귀 통과. 프로필 26건 회귀 통과.
- 개발 도구 참고: Windows PowerShell에서 browse의 `@e1` 참조는 반드시 따옴표로 감싸야 한다. Bash 회귀는 Git for Windows `C:/Program Files/Git/bin/bash.exe`를 사용한다. 이 PC의 Vite dev 첫 변환 지연으로 화면 테스트는 `dist` 정적 서버에서 수행했다.

### 배포 완료 증거

- 상태: **DONE_WITH_CONCERNS**. 이번 UI 요청은 배포 완료, 위 원천 최신성 gate는 별도 검토 대기.
- 코드 커밋: `9e1f898ffd4e4e2a6a1dad68d067cce3848e4ce1`.
- [GitHub Pages deploy 34194735817](https://github.com/jja6312/jja6312.github.io/actions/runs/34194735817): success.
- 라이브/로컬 SHA-256 일치:
  - `assets/index-DDuEq0sQ.js`: `36c5547f92f58dc2a3581624b579705732e3b3bb767891b37ff3b24c21ddd183`
  - `assets/index-C26lPyBp.css`: `527d91873134b6e68e237c56360e7e71abdd087ed46fd921406c5dad87304412`
  - `protected-data.json`: `6d25767a661eb225a59b5e38ef0be4966c250f3a9fbf6b9f673d48ce2da26eb6`
- 실제 사이트 L1 로그인 → Balance → Alt+I 필수 모드 → 빈 테넌시 Enter 통과 → Subscription ID 조회 바로가기 표시 확인. 가상 JSON의 `SPM_QA_ONLY` 선택 후 입력값 반영·복사 활성화 확인. 라이브 모바일 375×812에서 문서 scrollWidth=375, console errors 0; 실제 화면 캡처 확인.
- 추가 로컬 실증: Region Subscription의 자동 tenancy Enter 완료; Instance GET 이름 조회의 조건부 scope 질문이 `R`처럼 입력 중인 값에도 유지됨. UI 조회로 얻은 ID와 후보는 Profile 변경 후 제거되며 복사 차단 복귀.
- 변경하지 않은 범위: CLI 원천 lock, 공식 카탈로그/보호 데이터의 Git 내용, 사용자 `blog-db/automation/inbox.json` 수정, 실제 OCI 리소스.
