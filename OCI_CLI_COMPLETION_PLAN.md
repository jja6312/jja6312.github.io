# OCI CLI 신뢰성·MSP 운영 완성 계획

> 목적: 현재 OCI CLI 빌더를 "명령 예시 모음"에서 "복사해도 신뢰할 수 있는 OCI MSP 운영 도구"로 단계적으로 완성한다.
>
> 이 파일은 작업 현황의 단일 기준이다. OCI CLI 관련 변경을 시작할 때 먼저 읽고, 해당 작업을 배포한 뒤 체크박스와 증거를 갱신한다.

## 1. 기준선

- 최초 전수 검수일: 2026-08-15
- 최초 공식 비교 기준: OCI CLI 3.90.2
- 현재 일반·특수 항목: 51개
- 현재 full CRUD 리소스: 41개
- 현재 일반 Actions 적용 리소스: 1개 (`iam-user`)
- 현재 특수 운영 흐름: 7개
- 최초 검수 판정: `DONE_WITH_CONCERNS` — UI 프로토타입은 유용하지만, 명령 정확성·안전성·서비스 범위가 MSP 운영 도구 기준에 미달

### 최초 검수에서 확인한 핵심 결함

- 한 카탈로그에 OCI CLI 3.51.0, 3.76.1, 3.90.1, 3.90.2 계열 데이터가 섞일 수 있는 생성 구조
- 최신 3.90.2와 당시 185개 CRUD를 대조했을 때 최소 31개 동작에서 차이, 옵션 86개 누락
- `*_extended.py`의 공개 명령·옵션명 교정을 읽지 못해 내부 이름을 노출
- `--all`, `--force` 같은 값 없는 플래그를 일반 입력란으로 취급
- 필수값을 비워도 복사 가능한 최종 명령 생성
- CLI 선택값을 화면 필수값으로 잘못 승격한 항목과 조건부 필수·택일 관계 미표현
- Profile·Region 등 실행 컨텍스트가 대부분의 동작에서 빠짐
- 필수 OCID의 동적 조회 부족, `data[0]` 식의 무검증 첫 결과 선택
- 모든 일반 리소스가 CREATE로 처음 열리는 위험한 기본값
- CRUD 외 start/stop/attach/backup/failover 같은 실무 Actions를 담는 구조 부족
- Console 대분류 명칭과 서비스 배치가 일부 실제 Console 정보 구조와 다름
- 최신 옵션·플래그·조건부 필수·생성된 최종 명령을 막는 회귀 테스트 부족

## 2. 체크 규칙

- `[ ]` 미완료, `[x]` 완료로 관리한다. 진행 중인 항목은 체크하지 않고 항목 아래에 `상태: 진행 중`과 현재 증거를 적는다.
- 코드 일부가 있어도 아래 공통 완료 조건을 모두 만족하기 전에는 `[x]`로 바꾸지 않는다.
- 각 단계는 원칙적으로 번호 순서대로 진행한다. 선행 기반이 필요한 후속 기능은 앞 단계를 먼저 닫는다.
- 새 명령을 추가하기 전에 기존 리소스·카테고리 중복 여부와 Console 경로를 확인한다.
- 필수 OCID마다 `profile/region/compartment/resource name/LIST 결과`를 이용한 안전한 동적 조회 가능성을 검토한다.
- 공식 단일 명령은 일반 리소스에, 여러 명령을 조립한 운영 절차는 `Custom CLI`에 둔다.
- 위험한 변경·삭제 명령은 대상 표시, 영향 설명, 확인 절차, 복구 또는 롤백 방법을 갖춘다.

### 모든 작업의 공통 완료 조건

- [ ] 현재 Oracle 공식 문서와 고정한 OCI CLI 태그에서 명령 경로·필수/선택 옵션·flag·multiple·choices·상호배타 규칙 확인
- [ ] 정확한 `category > group > resource` 경로 회귀 테스트 추가
- [ ] 발견 → 선택 → 실행 → 결과 해석 흐름과 필요한 LIST/GET 선행 경로 제공
- [ ] 이름 동적 조회는 0건·1건·중복 결과를 구분하고, 모호하면 본 명령 실행 중단
- [ ] 필수값·조건부 필수·상호배타·위험 작업 UI 검증
- [ ] Custom Bash가 있으면 생성 결과 검사와 `bash -n` 통과
- [ ] 보호 데이터 생성·전용 회귀 테스트·lint·build 통과
- [ ] 자동 배포 완료 및 라이브 JavaScript·CSS·보호 데이터 일치 확인
- [ ] 이 파일에 완료일·커밋·검증 근거 기록

## 3. 이미 완료된 기반 작업

- [x] `DONE-01` OCI CLI 작성 강제 규칙을 프로젝트 `AGENTS.md`에 고정
  - 완료: 2026-08-12
  - 내용: Console 경로, 중복 방지, 동적 조회, 닫힌 흐름, CRUD별 검증, 테스트·배포 규칙
- [x] `DONE-02` 실행 확인 상태를 리소스 전체가 아닌 CRUD별로 관리
- [x] `DONE-03` Instance GET query 기본값을 빈 값으로 변경하고 복수 query 선택 지원
  - 완료: 2026-08-15
  - 커밋: `3d169a2`
- [x] `DONE-04` IAM Users·Groups·Policies full CRUD와 User 실무 Actions 구축
  - 완료: 2026-08-15
  - 커밋: `69e3e50`
  - 포함: Password 초기화, Group 할당, public key 기반 API Key 등록, MFA TOTP reset Custom CLI
- [x] `DONE-05` IAM 이름 조회에 0건·중복 중단 가드와 Policy ROOT 테넌시 조회 적용
  - 완료: 2026-08-15
  - 커밋: `69e3e50`

## 4. 실행 로드맵

### Phase 1 — P0 정확성 기반 교정

기능을 더 늘리기 전에 잘못된 메타데이터가 복제되는 원인을 제거한다.

- [x] `P1-01` OCI CLI 소스 버전을 최신 안정 태그 하나로 고정
  - 절대 로컬 설치 경로와 저장된 구버전 JSON 혼합 제거
  - 태그·공식 저장소 commit·수집일을 생성 산출물에 기록
  - 새 버전은 자동 diff를 만든 뒤 검토·승인해 올리는 방식으로 운영
  - 완료 기준: 모든 자동 생성 명령이 동일한 source tag를 사용하고, 재생성 결과가 환경에 따라 달라지지 않음
  - 완료: 2026-08-15
  - 고정 원천: Oracle 공식 `oracle/oci-cli` `v3.90.2`, commit `ad59a1f4c7df10decf51816ac16991621dae1b15`
  - 검증: 공식 원천 14개를 byte size·SHA-256으로 잠금, generated 37개·manual-curation 4개 원천 분리, 51개 명령 provenance 일치
  - 마이그레이션: `blog-db`의 41개 JSON을 단일 버전·tag·commit과 repository-relative path로 정규화 (`600de31`)
  - 버전 차이: 기존 보호 데이터 대비 34개 CRUD 동작 변경, 옵션 86개 추가·2개 제거·13개 메타데이터 변경을 검토
  - 재현성: 네트워크 차단 cache 모드에서 카탈로그 SHA-256 `D6AB00143889C00333B3821D6032C9B180C4CE6B72519B6895B181C23DE824FE` 재생성 일치
  - 사이트 커밋: `6f2b547`
  - 배포: GitHub Pages run `31870060396` 성공, 라이브 JavaScript·CSS·보호 데이터가 로컬 최종 산출물과 일치
- [x] `P1-02` 최종 Click 명령 트리 기반 메타데이터 수집기로 교체
  - generated 파일만 보는 AST 파서 의존 제거 또는 보조 수단으로 격하
  - `*_extended.py`가 바꾼 실제 공개 명령명·옵션명까지 수집
  - 우선 회귀 대상: Monitoring Alarm `--query-text`, ONS Subscription `--subscription-endpoint`
  - 완료 기준: 공식 `oci --help`/cmdref와 생성 명령·옵션 이름이 일치
  - 완료: 2026-08-15
  - 고정 런타임: Oracle 공식 `oci-cli-3.90.2.zip` SHA-256 `c76d0b1e14a19fa1df976be4eefaa9ca183f41e569b9392220d02b756af5e497`, 내부 wheel SHA-256 `b97d3ae64e8e0b3e3e40f54b07e8764511987ab0b461841c8f47a45eb27cffad`
  - 수집: Click 8.4.2·OCI SDK 2.184.1 격리 런타임에서 generated 뒤 `*_extended.py`까지 로드해 12개 서비스·공개 leaf 명령 1,373개 수집
  - 교체 결과: `generate-cli-catalog.py`의 AST 파서 의존 제거, `parse-oci-cli.py`는 legacy audit 용도로만 유지; 기존 AST 대비 공개 옵션 이름 +111/-28, 메타데이터 81건을 최종 트리 기준으로 교정
  - 공식 회귀: 릴리스 cmdref와 최종 Click 트리에서 Alarm `--query-text`, ONS Subscription `--subscription-endpoint` 일치 및 내부 `*-parameterconflict` 이름 미노출 확인
  - 재현성: 네트워크 차단 cache 모드에서 카탈로그 SHA-256 `4E05E661E25C4785A037A6901284722AEA2840CCDC3FB40AA9495F1D15C57D45` 2회 재생성 일치
  - 검증: generated 리소스 37개의 모든 제공 CRUD 경로가 최종 Click 트리에 존재, 보호 데이터 L1/L2/L3 복호화 회귀·lint·build 통과
  - 사이트 커밋: `7d9f9e6`
  - 배포: GitHub Pages run `31872360969` 성공; 라이브 `assets/index-DYEnip1d.js`, `assets/index-D2IOEbCJ.css`, 보호 데이터 SHA-256 `73EFEEA14645C9A56B5B3A6BB9F0274E38C97C06F7B90D873EC5D87D7271B1C5`가 로컬과 일치
- [ ] `P1-03` 옵션 타입 모델 교정
  - 값 없는 flag, boolean value, multiple, choices, JSON, file, datetime을 구분
  - `--all`, `--force`, `--raw-output` 등은 체크박스로 표현
  - `--all`과 `--limit` 같은 충돌 규칙 표현
  - 완료 기준: `--all true`, `--force true` 같은 잘못된 최종 명령이 생성되지 않음
- [ ] `P1-04` 필수·선택·조건부 필수·택일·상호배타 스키마 도입
  - CLI optional을 Console 관행만으로 무조건 required로 승격하지 않음
  - Instance CREATE의 image/source, subnet/create-vnic-details 같은 대체 관계를 그룹으로 표현
  - deprecated 옵션은 대체 옵션과 함께 표시하거나 기본 화면에서 제외
  - 완료 기준: 공식 문서의 required/optional 관계와 UI가 일치하고 조건부 규칙을 자동 테스트
- [ ] `P1-05` 미완성 명령 안전장치
  - 필수 또는 조건부 필수값이 빠지면 부족한 항목을 명시
  - 미완성 최종 명령은 미리보기로 보여줄 수 있으나 복사·즐겨찾기 실행본 저장은 비활성화
  - 완료 기준: 실행 불가능한 명령을 "완성된 최종 명령"으로 복사할 수 없음
- [ ] `P1-06` 공통 실행 컨텍스트 계층 도입
  - Profile, Region, Auth, Endpoint, Output, Query를 각 리소스와 분리된 공통 영역에서 관리
  - 동적 조회와 본 명령에 동일한 컨텍스트 전달
  - 리전이 필요 없는 명령은 억지로 요구하지 않음
  - 완료 기준: 모든 명령이 적용 가능한 공통 옵션을 일관되게 제공
- [ ] `P1-07` 최신 공식 메타데이터 자동 비교 게이트 추가
  - 명령·옵션 누락/추가/required/type/flag/choices 차이를 CI 보고서로 생성
  - 차이가 검토되지 않으면 보호 데이터 생성을 실패시킴
  - 완료 기준: 최초 검수에서 나온 31개 동작 차이와 86개 누락을 0건 또는 승인된 예외 목록으로 정리
- [ ] `P1-08` 생성 명령 회귀 테스트 강화
  - 빈 필수값, shell quote, JSON, multi value, flag, 상호배타, 위험 확인을 실제 최종 문자열로 검증
  - 모든 일반 명령과 Actions의 기본 예시를 최소 1개씩 생성해 구문 검사
  - 완료 기준: 기존 "리소스가 존재한다" 수준을 넘어 실행 문자열의 계약을 테스트

#### Phase 1 완료 증거

- 완료일: —
- 커밋: —
- 고정 OCI CLI 태그: `v3.90.2` (`P1-01` 완료, 이후 Phase 1에서도 유지)
- 공식 diff 결과: `P1-01` 기준 옵션 +86/-2, 메타데이터 변경 13; extended 공개 표면 비교는 `P1-02` 예정
- 배포·라이브 검증: —

### Phase 2 — P1 안전한 사용 흐름과 Console 정보 구조

- [ ] `P2-01` 기본 진입 동작을 안전한 LIST 또는 GET으로 변경
  - 리소스별 `preferredOperation`을 명시하고 CREATE 우선 fallback 제거
  - LIST가 없으면 GET, 둘 다 없을 때만 가장 안전한 동작 선택
- [ ] `P2-02` 모든 필수 OCID 동적 조회 전수표 작성 및 구현
  - 최초 기준: 필수 ID 109회, 동적 조회가 없는 유형 36종
  - 리소스별 이름 검색, 선행 LIST 선택, 직접 OCID 입력을 함께 제공
  - 단순 `data[0]` 선택을 제거하고 0/1/N건을 명시적으로 처리
- [ ] `P2-03` 발견 → 선택 → 실행 → 결과 해석 UX 완성
  - 입력창에 OCID만 요구하지 않고 관련 LIST/GET으로 찾는 경로 제공
  - 성공 출력 예시, 핵심 응답 필드, 다음 판단, 실패 진단을 표시
- [ ] `P2-04` Console 대분류·그룹 맵 분리
  - CLI namespace와 Console 메뉴 구조를 별도 데이터로 관리
  - `Observability`를 공식 `Observability & Management` 명칭으로 교정
  - Database 영역을 현재 Console 기준으로 `Oracle Database`/`Databases` 등 정확히 배치
  - 이후 모든 서비스는 공식 Console 경로 검증을 테스트로 고정
- [ ] `P2-05` 명령별 근거와 신뢰도 표시
  - OCI CLI version/tag, 공식 cmdref URL, source commit, 마지막 검증일, 검증 상태 표시
  - 검증 상태는 CRUD/Action별로 독립 관리
- [ ] `P2-06` 최종 명령 패널 UX 정리
  - 데스크톱에서는 입력폼을 가리지 않는 우측 preview 또는 하단 drawer 검토·적용
  - 모바일에서는 현재 경로와 메뉴 열기 중심으로 단순화
  - 긴 명령, 키보드, 복사, 접기/펼치기, 최초 높이 제한 회귀 검증

#### Phase 2 완료 증거

- 완료일: —
- 커밋: —
- 동적 조회 전수 결과: —
- Console 맵 검증 결과: —
- 배포·라이브 검증: —

### Phase 3 — 운영 핵심 서비스 확장

이 Phase에서는 조회·생성·변경·삭제의 닫힌 흐름을 먼저 확장한다. Actions가 필요한 항목은 Phase 4에서 이어서 완성한다.

#### Identity & Security

- [ ] `P3-IAM-01` Compartments
- [x] `P3-IAM-02` Users
- [x] `P3-IAM-03` Groups
- [x] `P3-IAM-04` Policies
- [ ] `P3-IAM-05` Dynamic Groups
- [ ] `P3-IAM-06` Identity Domains 핵심 관리 흐름
- [ ] `P3-IAM-07` Tag Namespaces·Tag Definitions·Tag Defaults

#### Compute·Storage

- [ ] `P3-CS-01` VNIC Attachments와 VNIC 발견 흐름
- [ ] `P3-CS-02` Boot Volume Attachments
- [ ] `P3-CS-03` Block Volume Attachments
- [ ] `P3-CS-04` Boot Volume Backups — LIST/GET/CREATE/DELETE와 복구 발견 흐름
- [ ] `P3-CS-05` Block Volume Backups — LIST/GET/CREATE/DELETE와 복구 발견 흐름
- [ ] `P3-CS-06` Volume Group Backups
- [ ] `P3-CS-07` Backup Policies와 Volume 할당 관계
- [ ] `P3-CS-08` File Storage Snapshots

#### Governance·Observability·Cost

- [ ] `P3-GOC-01` Audit Events
- [ ] `P3-GOC-02` Resource Search — structured/free text와 결과 선택
- [ ] `P3-GOC-03` Service Limits·Availability·Value
- [ ] `P3-GOC-04` Compartment Quotas
- [ ] `P3-GOC-05` Log Groups
- [ ] `P3-GOC-06` Logs
- [ ] `P3-GOC-07` Logging Search
- [ ] `P3-GOC-08` Monitoring Metric Data Query·Summarize Metrics
- [ ] `P3-GOC-09` Alarm History·Status
- [ ] `P3-GOC-10` Budgets
- [ ] `P3-GOC-11` Usage·Cost 조회와 비용 분석 기본 흐름

#### Phase 3 완료 증거

- 완료일: —
- 커밋: —
- 추가 리소스·동작 수: —
- 배포·라이브 검증: —

### Phase 4 — CRUD + Actions 운영 모델 완성

- [ ] `P4-01` Actions 메타데이터를 모든 리소스에서 재사용 가능한 정식 스키마로 확정
  - action별 tone, 위험도, required/conditional inputs, 동적 조회, 결과 해석, verified key 지원
  - 즐겨찾기·딥링크·키보드·모바일 동작 포함
- [ ] `P4-02` Instance actions
  - start, stop, softstop, reset, softreset, reboot 지원 범위를 공식 CLI 기준으로 확정
  - preserve boot volume, force, graceful timeout 등 위험 옵션 구분
- [ ] `P4-03` Change Compartment actions
  - 지원 리소스별 대상 compartment 발견, 영향, work request 추적 제공
- [ ] `P4-04` Attach/Detach actions
  - VNIC, boot/block volume, backend 등 대상별 선행 조회와 안전한 detach 조건
- [ ] `P4-05` Backup/Restore actions
  - boot/block/volume group, File Storage, Base DB, ADB의 생성·복원·복제 관계
- [ ] `P4-06` Database lifecycle actions
  - switchover, failover, reinstate, start/stop, scale 등 서비스별 지원 범위
- [ ] `P4-07` Actions별 실행 검증과 위험 확인
  - `<resource>:action:<action-id>` 단위 저장
  - 비가역·중단 영향 작업은 대상 재입력 또는 명시적 확인

#### Phase 4 완료 증거

- 완료일: —
- 커밋: —
- Actions 수와 위험 작업 테스트: —
- 배포·라이브 검증: —

### Phase 5 — 네트워크·데이터베이스 심화

#### Networking

- [ ] `P5-NET-01` NSG Security Rules
- [ ] `P5-NET-02` Route Rules
- [ ] `P5-NET-03` DRG Route Tables·Route Rules·Route Distributions
- [ ] `P5-NET-04` CPE
- [ ] `P5-NET-05` IPSec VPN·Tunnels
- [ ] `P5-NET-06` FastConnect Virtual Circuits
- [ ] `P5-NET-07` DNS Zones·Records·Views·Resolvers
- [ ] `P5-NET-08` Load Balancer Listeners·Backend Sets·Backends·Certificates·Health
- [ ] `P5-NET-09` Network Load Balancer Listeners·Backend Sets·Backends·Health

#### Oracle Database·MySQL

- [ ] `P5-DB-01` Base Database Backups·Restore·Database Homes·Databases
- [ ] `P5-DB-02` Data Guard Associations와 role 전환
- [ ] `P5-DB-03` Pluggable Databases
- [ ] `P5-DB-04` Autonomous Database Backups·Clone·Wallet·Scale
- [ ] `P5-DB-05` Exadata Infrastructure·VM Clusters 핵심 운영
- [ ] `P5-DB-06` MySQL Backup Restore와 point-in-time recovery까지 닫힌 흐름

#### Containers

- [ ] `P5-CON-01` OKE Clusters
- [ ] `P5-CON-02` OKE Node Pools·Nodes·Kubeconfig
- [ ] `P5-CON-03` OCIR Repository·Images·Retention 기본 운영

#### Phase 5 완료 증거

- 완료일: —
- 커밋: —
- 추가 리소스·Actions 수: —
- 배포·라이브 검증: —

### Phase 6 — MSP 보안·통합·자동화 확장

#### Security

- [ ] `P6-SEC-01` Vaults·Keys·Key Versions
- [ ] `P6-SEC-02` Secrets·Secret Bundles·Rotation 흐름
- [ ] `P6-SEC-03` Bastion·Sessions
- [ ] `P6-SEC-04` Certificates·Certificate Authorities
- [ ] `P6-SEC-05` Cloud Guard Targets·Recipes·Problems
- [ ] `P6-SEC-06` Vulnerability Scanning Targets·Reports
- [ ] `P6-SEC-07` Security Zones·Recipes
- [ ] `P6-SEC-08` WAF Policies·Rules·Logs 기본 운영

#### Integration·Automation

- [ ] `P6-AUTO-01` Events Rules
- [ ] `P6-AUTO-02` Notifications Topics·Subscriptions·Publish 닫힌 흐름
- [ ] `P6-AUTO-03` Service Connector Hub
- [ ] `P6-AUTO-04` Resource Manager Stacks·Jobs
- [ ] `P6-AUTO-05` DevOps Projects·Repositories·Build/Deploy Pipelines·Runs
- [ ] `P6-AUTO-06` Functions Applications·Functions·Invoke
- [ ] `P6-AUTO-07` API Gateway·Deployments
- [ ] `P6-AUTO-08` Full Stack Disaster Recovery Protection Groups·Plans·Plan Executions

#### Phase 6 완료 증거

- 완료일: —
- 커밋: —
- 추가 리소스·Actions·Custom workflows 수: —
- 배포·라이브 검증: —

### Phase 7 — 운영 품질 마감

- [ ] `P7-01` 전체 카탈로그 공식 최신 태그 재대조 및 승인된 예외 0/명시화
- [ ] `P7-02` 모든 리소스의 Console 경로·기본 동작·동적 조회·관련 LIST/GET 전수 검사
- [ ] `P7-03` 모든 CRUD/Action별 출처·버전·검증일·실행 확인 상태 완성
- [ ] `P7-04` 대표 MSP 업무 시나리오 end-to-end 브라우저 QA
  - 다중 profile/region, 이름 중복, 빈 결과, 권한 오류, 모바일, 긴 명령 포함
- [ ] `P7-05` 성능·접근성·키보드·모바일 회귀 검사
- [ ] `P7-06` 카탈로그 갱신 운영 문서와 새 OCI CLI release diff 절차 확정
- [ ] `P7-07` 최종 전수검수 판정을 `READY_FOR_MSP_USE`로 변경할 근거 기록

#### Phase 7 완료 증거

- 완료일: —
- 커밋: —
- 최종 OCI CLI 태그: —
- 전수검수 보고서: —
- 배포·라이브 검증: —

## 5. 다음 작업

다음 착수 항목은 `P1-03 옵션 타입 모델 교정`이다. 이 항목을 완료하기 전에는 대량의 새 리소스를 자동 생성하지 않는다.

## 6. 변경 이력

| 날짜 | 변경 | 커밋 | 작성자 |
|---|---|---|---|
| 2026-08-15 | P1-02 완료 — 공식 릴리스의 최종 Click 트리로 전환, extended 공개 이름·cmdref 회귀·오프라인 재현성 검증 | `7d9f9e6` | Codex |
| 2026-08-15 | P1-01 완료 — 공식 OCI CLI v3.90.2 단일 원천 잠금, 절대 경로·혼합 버전 제거, 재현성 검증 | 사이트 `6f2b547` / blog-db `600de31` | Codex |
| 2026-08-15 | 최초 전수검수 결과를 실행 가능한 단계별 계획으로 고정, 완료된 IAM·Instance query 작업 반영 | — | Codex |
