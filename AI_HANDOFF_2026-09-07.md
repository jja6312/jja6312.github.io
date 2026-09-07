---
status: in-progress
branch: main
timestamp: 2026-09-07T21:50:47+09:00
base_commit: aa69fb0152b21b1266de0d3c0235a5966bd7267e
files_modified: []
---

# AI 인계: 블로그·OCI CLI 운영 상태

## 한눈에 보기

- 사이트 저장소: `jja6312/jja6312.github.io`
- 데이터 저장소: 비공개 `jja6312/blog-db`, 로컬에서는 사이트 저장소의 형제 폴더 `../blog-db`여야 한다.
- 운영 사이트: <https://jja6312.github.io>
- 기준 브랜치: `main`
- 이 문서를 만들기 직전 HEAD: `aa69fb0`
- 작업 트리: clean
- OCI CLI 고정 원천: Oracle 공식 `v3.91.0`, commit `fbff93ae6744ed23671b974fd876adb239545cea`
- 현재 공개 카탈로그: 171 services, 9,130 commands
- 최신 HEAD 배포: GitHub Pages run `33933945361` 성공
- 현재 열린 경고: OCI CLI metadata guard가 `v3.92.0` 출시를 감지하여 의도적으로 실패 중이다. 자동으로 lock만 올리지 말고 공식 diff 검토 후 갱신해야 한다.

## 지금까지 무엇을 만들었나

이 블로그는 단순 명령 예시 모음이 아니라, OCI MSP 엔지니어가 `발견 → 선택 → 입력 → 실행 → 결과 해석`을 한 화면에서 끝내는 운영 도구로 발전 중이다. 공식 OCI CLI 전체 카탈로그와 실무 운영 오버레이를 한 메뉴 안에서 다루며, 다중 명령 절차만 `Custom CLI`에 둔다.

주요 구현 상태:

- OCI Console 순서와 같은 공용 좌측 정보 구조를 CLI와 Policy가 함께 사용한다. 반대 화면에만 구현된 분야는 회색으로 표시한다.
- 일반 OCI CLI는 공식 최종 Click tree에서 생성한다. 내부 generated 명령명이 아니라 `*_extended.py`까지 반영된 공개 명령·옵션이 기준이다.
- 기본 동작은 안전한 `LIST > GET > CREATE > UPDATE > DELETE` 순서다.
- 필수, 선택, 조건부 필수, one-of, 상호배타, deprecated를 별도로 모델링한다.
- 모든 일반 CLI와 Blueprint가 공용 `Alt+I` 입력 마법사를 사용한다. 두 번째 `Alt+I`는 필수 입력 전용 모드다.
- Profile, Region, Auth, Endpoint는 공통 실행 컨텍스트다. 동적 조회와 본 명령에 같은 요청 컨텍스트가 전달된다.
- 필수 OCID는 이름 기반 동적 조회를 우선한다. 0건 또는 여러 건이면 후보를 보여주고 실행을 중단한다. 직접 입력만 허용할 때는 구체적 이유가 필요하다.
- 실행 전 입력 확인은 오른쪽 패널이며 누락 항목을 누르면 해당 input으로 포커스한다. 좌우 패널 폭은 조절 가능하다.
- 구조화 JSON은 `{}`를 직접 쓰게 하지 않고 필드, 선택기, 전용 빌더로 입력한다.
- Official CLI와 운영 오버레이는 중복 메뉴로 분리하지 않는다. 하나의 리소스 메뉴에 공식 명령과 운영 메타데이터를 함께 둔다.
- 명령 실행 확인 상태는 리소스 전체가 아니라 CRUD 및 Action별로 저장한다.
- 보호 데이터는 `public/protected-data.json`에 L1/L2/L3 암호화 스냅샷으로 굽는다.
- 사용자는 블로그 변경을 요청하면 별도 언급이 없어도 검증, 커밋, push, GitHub Pages 배포, 실제 사이트 확인까지 자동으로 끝내길 기대한다.

## Blueprint와 UI Wizard

Blueprint는 네트워크 기본 구조 등 여러 OCI 자원을 composition 방식으로 만드는 시스템이다.

- 6개 탭: DESIGN, DISCOVER, PLAN, APPLY, VERIFY, MANIFEST
- 순수 엔진: naming, graph, derive, resolve, plan, render, manifest
- 중복 이름, discovery 실패, ownership, resume, rollback, shell injection 방어를 갖춘다.
- 네이밍 컨벤션은 요소별 포함 여부, 구분자, 드래그 순서, 전체 비활성화와 수동 이름 입력을 지원한다.
- 컨벤션을 사용해도 이름 미리보기에서 특정 자원 이름만 override할 수 있다.
- 사용자의 명시적 선택에 따라 SSH `0.0.0.0/0`도 허용한다. 보안 경고는 유지하되 UI에서 무조건 차단하지 않는다.
- DISCOVERY 결과는 서비스별 LIST 성공과 실패를 구분한다. 실패를 빈 목록으로 위장하면 안 된다.
- UI Wizard는 실무 composition 템플릿과 Compute Instance 모듈이 구현되어 있다.
- 다음 설계 기준 문서: `REPORT_ocicli-asset-provisioning-design_2026-09-03.md`

## 최근 완료된 작업

### Functions와 DevOps Custom CLI

커밋:

- `e045df6 feat(oci-cli): add Functions and DevOps custom workflows`
- `33f91d1 chore(oci-cli): bake Functions and DevOps workflows`

자동화 탭에 아래 두 항목이 배포되어 있다.

- `WizOCM Functions — 기반 구축·검증`
  - private subnet, NAT/Service Gateway, NSG, immutable OCIR image, Fn application/functions, Dynamic Group/Policy, Resource Scheduler, invoke log, health invocation을 PLAN/APPLY로 구성한다.
  - exact VNIC와 exact instance처럼 보안 경계가 되는 대상은 사유를 가진 직접 OCID 입력이다.
- `WizOCM DevOps — CI/CD Release Foundation`
  - 기존 GitHub Connection, ONS Topic, immutable Generic Artifact, 단일 Compute target, Build → Deliver → Trigger → Manual Approval → Deploy 흐름을 구성한다.
  - PAT를 명령에 포함하지 않고 사전 생성된 GitHub Connection OCID를 사용한다.

당시 검증 증거:

- required OCID 257회: dynamic 241, justified direct 16, missing 0
- 생성 Bash 242/242 문법 통과, 특수 스크립트 9개 통과
- 보호 데이터 L1/L2/L3 생성·복호화, lint, build 통과
- GitHub Pages run `33405446856` 성공
- 실제 사이트에서 자물쇠1 로그인 후 두 메뉴, 필수 입력 오른쪽 패널, PLAN/APPLY, GitHub Connection, ONS Topic, Manual Approval을 확인했고 브라우저 console error는 없었다.

### 이후 프로필·입력 UX 개선

현재 HEAD에는 위 배포 이후 다음 변경도 포함된다.

- `b01507e`: 활성 프로필의 사용 가능 리전을 RegionSelect와 Alt+I에서 우선 표시
- `d5a7609`: 프로필 namespace 수집·자동 주입, Alt+I one-of 방향 선택 스텝
- `aa69fb0`: 동일 이름 프로필의 내용을 갱신하는 `기존 업데이트` 버튼
- `907cda5`: 네트워크·인스턴스 자산화 입력 해석 통합 설계서

## 반드시 먼저 읽을 파일

1. `AGENTS.md`: OCI CLI 작성 강제 규칙
2. `OCI_CLI_COMPLETION_PLAN.md`: 진행 순서와 완료 증거의 단일 기준
3. `REPORT_ocicli-asset-provisioning-design_2026-09-03.md`: 다음 자산화 설계 기준
4. `scripts/oci-cli-source.lock.json`: 고정 OCI CLI 원천
5. `package.json`: 검증·생성 명령
6. `src/pages/CliBuilderPage.tsx`, `src/components/CliInputWizard.tsx`
7. `src/lib/ociConsoleNavigation.ts`, `src/lib/oci-cli/officialCatalog.ts`
8. `scripts/generate-cli-catalog.py`, `scripts/generate-protected-data.mjs`

## 현재 우선순위와 열린 문제

1. **OCI CLI v3.92.0 검토**
   - daily metadata guard run `34083929071`이 `pinned=v3.91.0 latest=v3.92.0`을 감지했다.
   - 변경 source는 `src/oci_cli/version.py`와 `services/database/.../database_cli.py`다.
   - `npm run check:oci-source` 결과와 공식 release diff를 검토하고, Click tree·metadata contract·catalog diff를 확인한 뒤에만 lock을 갱신한다.
   - 실패는 회귀가 아니라 새 릴리스를 검토하지 않았다는 안전 신호다.
2. **완성 계획 계속 진행**
   - `OCI_CLI_COMPLETION_PLAN.md`의 미완료 항목을 번호 순서대로 처리한다.
   - 문서의 `다음 작업`은 `P3-CS-01`로 적혀 있으나, 사용자가 새로운 우선순위를 주면 그 요청이 우선이다.
3. **네트워크·인스턴스 자산화**
   - 구현 전에 `REPORT_ocicli-asset-provisioning-design_2026-09-03.md`를 기준으로 input interpretation과 discovery payload 계약을 확인한다.

오래된 채팅의 개별 요청을 전부 미완료로 간주하지 말 것. 이미 구현된 내용은 Git history, 계획 체크박스, 현재 UI와 테스트가 기준이다.

## 작업 규칙과 함정

- 새 리소스를 만들기 전에 기존 category/group/resource 중복과 최신 OCI Console 위치부터 확인한다.
- 공식 단일 명령은 일반 카탈로그에 넣고, 여러 명령을 묶은 절차만 Custom CLI에 둔다.
- CLI optional을 Console 관행 때문에 required로 승격하지 않는다.
- 직접 OCID 필드를 추가하기 전에 동적 조회 가능성을 조사하고 `OCI_CLI_REQUIRED_OCID_AUDIT.md`를 갱신한다.
- Bash 줄바꿈은 Git Bash에서 `\`를 사용한다. PowerShell backtick을 Git Bash에 붙여 넣으면 다음 줄이 별도 명령으로 실행된다.
- 복사된 명령의 역슬래시 뒤에 공백이 끼면 OCI CLI가 `Got unexpected extra argument ( )`를 낼 수 있다.
- `blog-db`가 형제 폴더에 없으면 catalog, learning, blueprint, protected-data 생성이 실패한다.
- `HUB_LOCK_1`, `HUB_LOCK_2`, `HUB_LOCK_3` 값은 Git, 문서, 로그, 소스에 쓰지 않는다. 필요할 때 사용자에게 받거나 해당 컴퓨터의 안전한 환경변수/비밀 저장소에서 주입한다.
- 사용자 수정과 다른 AI의 커밋이 자주 들어온다. 매 작업 시작 시 `git pull --ff-only`, `git status`, 최근 log를 다시 확인하고 dirty 파일을 함부로 덮어쓰지 않는다.
- `public/protected-data.json`은 생성 산출물이지만 배포에 필요하므로 bake 후 커밋한다.
- 완료 보고는 로컬 테스트 성공만으로 끝내지 않는다. push 후 Actions와 라이브 화면까지 확인한다.

## 검증·배포 실행 순서

의존성 설치 후, 변경 범위에 맞는 전용 테스트를 먼저 실행하고 전체 게이트를 통과시킨다.

```powershell
git pull --ff-only
npm ci
npm run test:profiles
npm run test:wizard
npm run test:blueprint
npm run test:oci-metadata
npm run test:oci-commands
```

보호 데이터 생성 시에만 자물쇠 값을 현재 프로세스 환경변수로 주입한다. 값을 명령 기록이나 문서에 직접 적지 않는다.

```powershell
$env:HUB_LOCK_1 = '<secure value>'
$env:HUB_LOCK_2 = '<secure value>'
$env:HUB_LOCK_3 = '<secure value>'
npm run gen:protected
npm run test:protected
npm run lint
npm run build
git diff --check
```

그 다음 의도한 파일만 `git add`하고 커밋·push한다. `git add -A`로 다른 사람의 변경을 섞지 않는다. push 후 해당 SHA의 GitHub Actions를 확인하고 `https://jja6312.github.io`에서 실제 메뉴, 입력, 모바일 overflow, console error와 로컬/라이브 산출물 일치를 검사한다.

## 다른 컴퓨터의 AI에게 보낼 짧은 프롬프트

> `git pull` 후 루트의 `AI_HANDOFF_2026-09-07.md`, `AGENTS.md`, `OCI_CLI_COMPLETION_PLAN.md`를 먼저 읽어. 현재 HEAD·dirty worktree·최근 Actions를 확인하고, 우선 `v3.92.0` 공식 diff 경고부터 검토해. 이후 계획의 다음 미완료 작업을 공식 Click tree, Console IA, 동적 조회, 공용 Alt+I, 회귀 테스트, 보호 데이터 bake, 자동 배포와 라이브 QA까지 한 흐름으로 완료해. 자물쇠 값은 Git에 저장하지 마.
