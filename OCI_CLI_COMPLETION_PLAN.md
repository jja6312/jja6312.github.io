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
- [x] `P1-03` 옵션 타입 모델 교정
  - 값 없는 flag, boolean value, multiple, choices, JSON, file, datetime을 구분
  - `--all`, `--force`, `--raw-output` 등은 체크박스로 표현
  - `--all`과 `--limit` 같은 충돌 규칙 표현
  - 완료 기준: `--all true`, `--force true` 같은 잘못된 최종 명령이 생성되지 않음
  - 완료: 2026-08-15
  - 공식 메타데이터: 최종 Click 트리의 flag 564건, boolean value 691건, multiple 716건, choices 1,593건, JSON 1,357건, file 39건, datetime 79건을 분리 수집
  - UI·직렬화: flag는 체크박스와 값 없는 인자로, boolean value는 `true|false` 선택값으로, multiple choice는 복수 체크 후 옵션 반복으로 생성; JSON·file·datetime 타입 표식과 전용 입력 형태 적용
  - 충돌 처리: `--all`·`--limit`을 상호 충돌로 표시하고 한쪽 입력 시 반대쪽을 제거하며, 이전 즐겨찾기의 충돌값도 최종 명령에서 결정적으로 억제
  - 회귀 검증: 209개 CRUD 동작의 Click↔카탈로그 타입 일치와 `--all`, `--force`, boolean value, multiple 최종 문자열을 자동 검사; 보호 데이터 L1/L2/L3·lint·build 통과
  - 사이트 커밋: `b765c25`
  - 배포: GitHub Pages run `31873175930` 성공; 라이브 `assets/index-isdVxO5Z.js`, `assets/index-C5Ebu7lI.css`, 보호 데이터 SHA-256 `094022F60D5AC959B0D084493E804EC56928E139986DF7F357C913FF2F486400`이 로컬과 일치
- [x] `P1-04` 필수·선택·조건부 필수·택일·상호배타 스키마 도입
  - CLI optional을 Console 관행만으로 무조건 required로 승격하지 않음
  - Instance CREATE의 image/source, subnet/create-vnic-details 같은 대체 관계를 그룹으로 표현
  - deprecated 옵션은 대체 옵션과 함께 표시하거나 기본 화면에서 제외
  - 완료 기준: 공식 문서의 required/optional 관계와 UI가 일치하고 조건부 규칙을 자동 테스트
  - 완료: 2026-08-15
  - required 교정: Console 관행으로 승격하던 24개 옵션을 원복하고, Click-backed CRUD 190개 동작의 required 불일치 0건 확인
  - 관계 스키마: `required|optional|conditional`, `oneOf`, `mutuallyExclusive`, `requires`, `optionNotices`, `deprecated|replacement` 도입
  - Instance CREATE: 절대 필수는 `--availability-domain`, `--compartment-id`, `--subnet-id`; `--image-id|--source-details|--source-boot-volume-id`는 정확히 하나를 고르는 조건부 필수로 구현
  - VNIC 교정: 공식 최종 Click·cmdref에 없는 `--create-vnic-details`를 재도입하지 않고, `--subnet-id`와 공개 VNIC 개별 옵션을 대안으로 명시
  - 사용 중단 옵션: 카탈로그 내 5개를 기본 폼에서 숨기고 별도 토글로 분리; Block Volume `--size-in-mbs`와 VCN `--cidr-block`에 공식 대체 옵션 표시
  - 회귀 검증: 공식 릴리스 cmdref·final Click·확장 callback과 스키마를 대조하고 보호 데이터 L1/L2/L3·lint·build 통과
  - 사이트 커밋: `375af47`
  - 배포: GitHub Pages run `31874035399` 성공; 라이브 `assets/index-DuynVMnz.js`, `assets/index-Cm4zacWe.css`, 보호 데이터 SHA-256 `189C5939D85485F95A8DEF834921065AF3B673D854603545743F629EDE757948`이 로컬과 일치
- [x] `P1-05` 미완성 명령 안전장치
  - 필수 또는 조건부 필수값이 빠지면 부족한 항목을 명시
  - 미완성 최종 명령은 미리보기로 보여줄 수 있으나 복사·즐겨찾기 실행본 저장은 비활성화
  - 완료 기준: 실행 불가능한 명령을 "완성된 최종 명령"으로 복사할 수 없음
  - 완료: 2026-08-15
  - 검증기: `required`, 정확히 하나를 고르는 `oneOf`, `mutuallyExclusive`, `requires`, 옵션 간 `conflictsWith`를 단일 순수 함수로 판정
  - 동적 조회 판정: 입력 없이 확정 가능한 루트 테넌시와 기본 AD만 충족으로 인정하고, 리소스 이름이 필요한 동적 조회는 빈 값일 때 미완성 유지
  - 화면 안전장치: 부족한 입력과 관계 위반을 명시하고 `미완성 명령 미리보기`로 구분; 복사·Alt+C·즐겨찾기 저장 비활성화
  - 회귀 검증: Instance CREATE 빈 입력·정상 Image 부팅·복수 부팅 소스·Boot Volume 크기 의존성 및 `--all/--limit` 충돌 검증, 보호 데이터 L1/L2/L3·lint·build 통과
  - 사이트 커밋: `539569a`
  - 배포: GitHub Pages run `31874658029` 성공; 라이브 JS `assets/index-C5ofnAGc.js` SHA-256 `BF5C64D4ADCD84F51A412EB0196DA468FA7D927EC3769439CF987CD67A5FA643`, CSS `assets/index-s5uSnS7O.css` SHA-256 `B78B2411C0BD829E9D5DB8DCF42589B08AC7DEA73AF4F12ECFB671846A38D722`, 보호 데이터 SHA-256 `84CE55B0AB7F73B6F5C11178C3A8AF8EA45378FC34551F6AA03167B617CB50A2`가 로컬과 일치
- [x] `P1-06` 공통 실행 컨텍스트 계층 도입
  - Profile, Region, Auth, Endpoint, Output, Query를 각 리소스와 분리된 공통 영역에서 관리
  - 동적 조회와 본 명령에 동일한 컨텍스트 전달
  - 리전이 필요 없는 명령은 억지로 요구하지 않음
  - 완료 기준: 모든 명령이 적용 가능한 공통 옵션을 일관되게 제공
  - 완료: 2026-08-15
  - 공통 스키마: OCI CLI v3.90.2 최종 Click root 기준으로 Request(`Profile`, `Region`, `Auth`, `Endpoint`)와 Response(`Output`, `Query`, `Raw Output`)를 카탈로그 최상위에 1회 정의
  - 적용 범위: 일반·Action 219개 화면에서 중복 공통 옵션을 제거하고, 기존 맞춤값 32개는 optional override로 보존; Region은 전역 기본값 없이 프로필·환경 설정 상속
  - 실행 일관성: 컴파트먼트·AD·VCN·Subnet·IAM·MySQL 등의 동적 조회와 본 명령에 동일한 Request 컨텍스트를 전달하고 Response 컨텍스트는 최종 명령에만 적용
  - 운영 절차 보호: 여러 명령을 묶는 Custom CLI의 내부 Query·Output은 사용자 Response 옵션으로 덮어쓰지 않고, 기존 Instance 복수 Query와 Announcement 체크박스 Query UI 유지
  - 회귀 검증: 공통 스키마·219개 화면·32개 override·인증 방식 6개·즐겨찾기 마이그레이션·동적 조회/본 명령 전파·생성 Bash 구문, 보호 데이터 L1/L2/L3·lint·build 통과
  - 사이트 커밋: `c9ae258`
  - 배포: GitHub Pages run `31876558792` 성공; 라이브 JS `assets/index-B3HaIhF2.js` SHA-256 `6B375AD32BA53DCB133A0A8F703D5A39B91152EAC9587EFEBBE943EEFF0662EC`, CSS `assets/index-CEVH-R3Q.css` SHA-256 `73C56BC3FC7F6A14A2CE7C234F6060A54235E0D3908DA390E2B08392CDAFC947`, 보호 데이터 SHA-256 `38A275A2B5AAE233AEFD0A497B173CB69DBA73FC0AF40B9BD110F114857DBB36`가 로컬과 일치
- [x] `P1-07` 최신 공식 메타데이터 자동 비교 게이트 추가
  - 명령·옵션 누락/추가/required/type/flag/choices 차이를 CI 보고서로 생성
  - 차이가 검토되지 않으면 보호 데이터 생성을 실패시킴
  - 완료 기준: 최초 검수에서 나온 31개 동작 차이와 86개 누락을 0건 또는 승인된 예외 목록으로 정리
  - 완료: 2026-08-15
  - 비교 계약: 최종 Click 트리 기반 38개 리소스·190개 동작·1,874개 옵션의 명령 경로와 `required/type/flag/multiple/choices/deprecated`를 결정적 JSON 계약으로 고정
  - 현재 결과: 명령 차이 0, 누락 옵션 0, 메타데이터 차이 0; MySQL 이름 조회용 `--lookup-compartment-id` 2개만 `lookupOnly=true` 조건과 이유를 가진 정확한 승인 예외로 관리
  - 차단 정책: 미승인 차이뿐 아니라 이미 사라진 낡은 승인과 승인 조건 위반도 실패; 명령·옵션·메타데이터 변형 및 승인 정책 14개 자기검증 통과
  - 최신성: 보호 데이터 생성 전에 Oracle OCI CLI 최신 안정 릴리스와 고정 태그·커밋·14개 원천 파일 해시를 확인하며, 현재 최신 `v3.90.2`와 일치
  - CI: 매일 09:17 KST 및 관련 파일 변경 시 최신 릴리스와 고정 Click 계약을 독립 실행하고 JSON 보고서 2개를 artifact로 보존
  - 사이트 커밋: `d7253d1`
  - 검증: OCI CLI metadata guard run `31877286309` 성공; Linux 보고서도 미승인 0·낡은 승인 0·명령 차이 0·누락 옵션 0·메타데이터 차이 0
  - 배포: GitHub Pages run `31877286298` 성공; 라이브 JS `assets/index-B3HaIhF2.js` SHA-256 `6B375AD32BA53DCB133A0A8F703D5A39B91152EAC9587EFEBBE943EEFF0662EC`, CSS `assets/index-CEVH-R3Q.css` SHA-256 `73C56BC3FC7F6A14A2CE7C234F6060A54235E0D3908DA390E2B08392CDAFC947`, 보호 데이터 SHA-256 `2E043C7069BBED03CDC56ACDECE3A44E9DA98DCF178AA9724A5739E45B3E88B1`가 로컬과 일치
- [x] `P1-08` 생성 명령 회귀 테스트 강화
  - 빈 필수값, shell quote, JSON, multi value, flag, 상호배타, 위험 확인을 실제 최종 문자열로 검증
  - 모든 일반 명령과 Actions의 기본 예시를 최소 1개씩 생성해 구문 검사
  - 완료 기준: 기존 "리소스가 존재한다" 수준을 넘어 실행 문자열의 계약을 테스트
  - 완료: 2026-08-15
  - 전수 생성: 일반·Action·특수 흐름 219개 화면에서 대표 최종 명령을 생성하고 하나의 Bash syntax batch로 모두 `bash -n` 통과
  - 검증 범위: required/oneOf가 있는 208개 화면의 빈 입력 차단, Action 3개, 특수 운영 흐름 7개, shell quote·JSON·multiple·flag·상호배타·위험 확인 2개를 실제 문자열로 검증
  - 결함 교정: 작은따옴표·세미콜론·파이프 등 shell 메타문자를 놓치던 직렬화를 안전 문자 허용 목록 방식으로 변경하고 `O'Reilly; echo unsafe` 회귀 고정
  - 보호 데이터 생성 체인: 전체 명령 생성 검사를 암호화 직전에 강제해, 카탈로그 항목만 있고 유효한 최종 명령이 없는 상태를 차단
  - 사이트 커밋: `e45fe7d`
  - 배포: GitHub Pages run `31877749399` 성공; 라이브 JS `assets/index-EHw9cHO-.js` SHA-256 `9076EB24A2E45FDC245CA7BCE6F93D11DE04C8AED28195763C419E4F16CEA9A6`, CSS `assets/index-CEVH-R3Q.css` SHA-256 `73C56BC3FC7F6A14A2CE7C234F6060A54235E0D3908DA390E2B08392CDAFC947`, 보호 데이터 SHA-256 `CB3D0C3FB4289B3CE6476F0F6E1755646F44CD409C0FAA07CD458A10C4CE3963`가 로컬과 일치

#### Phase 1 완료 증거

- 완료일: 2026-08-15
- 커밋: `6f2b547`, `7d9f9e6`, `b765c25`, `375af47`, `539569a`, `c9ae258`, `d7253d1`, `e45fe7d`
- 고정 OCI CLI 태그: `v3.90.2` (`P1-01` 완료, 이후 Phase 1에서도 유지)
- 공식 diff 결과: 최종 Click 기준 190개 동작에서 명령 차이 0, 누락 옵션 0, 메타데이터 차이 0; CLI로 직렬화하지 않는 MySQL lookup-only UI 필드 2개만 정확한 승인 예외
- 배포·라이브 검증: P1-08 최종 GitHub Pages run `31877749399` 성공; 라이브 JS·CSS·보호 데이터가 로컬과 일치

### Phase 2 — P1 안전한 사용 흐름과 Console 정보 구조

- [x] `P2-01` 기본 진입 동작을 안전한 LIST 또는 GET으로 변경
  - 리소스별 `preferredOperation`을 명시하고 CREATE 우선 fallback 제거
  - LIST가 없으면 GET, 둘 다 없을 때만 가장 안전한 동작 선택
  - 완료: 2026-08-15
  - 카탈로그 결과: CRUD 리소스 44개는 모두 LIST, Instance Maintenance Reboot 전용 흐름은 GET으로 최초 진입
  - 안전장치: 카탈로그 생성기와 UI 양쪽에 `LIST > GET > CREATE > UPDATE > DELETE` 정책을 적용하고, 변경 작업 preference가 지원되는 LIST/GET을 앞설 수 없도록 차단
  - 진입 경로: 딥링크, 좌측 리소스 선택, 유효하지 않은 즐겨찾기 fallback이 동일한 `defaultCliOperation`을 사용
  - 회귀 검증: `test:oci-defaults`를 보호 데이터 생성 체인에 포함하고, 219개 최종 명령 Bash·필수값·상호배타·위험 확인 회귀 검사 유지
  - 사이트 커밋: `4c54320`
  - 배포: GitHub Pages run `31878599863` 성공; 라이브 JS `assets/index-D9i3FDON.js` SHA-256 `FA5EE7317F67C4E0F2C7F76EB0A8BB53BEF7F12AC853CF12A8B863E6AF045B9D`, CSS `assets/index-CEVH-R3Q.css` SHA-256 `73C56BC3FC7F6A14A2CE7C234F6060A54235E0D3908DA390E2B08392CDAFC947`, 보호 데이터 SHA-256 `1800C14AECB71B916E792E8EAC4A5E6F766D3E3B51DF1B7AA6FD7D55EFD3F445`가 로컬과 일치
- [x] `P2-02` 모든 필수 OCID 동적 조회 전수표 작성 및 구현
  - 최초 기준: 필수 ID 109회, 동적 조회가 없는 유형 36종
  - 리소스별 이름 검색, 선행 LIST 선택, 직접 OCID 입력을 함께 제공
  - 단순 `data[0]` 선택을 제거하고 0/1/N건을 명시적으로 처리
  - 완료: 2026-08-15
  - 최신 전수 결과: 카탈로그 확장분을 포함한 필수 OCID 232회·48종 중 동적 조회 220회, 사유가 명시된 직접 입력 12회, 미분류 0회
  - 동적 조회 구성: compartment 안전 조회 72회, 리소스 정확한 이름 조회 126회, IAM·MySQL 등 전용 안전 빌더 22회
  - 안전 처리: 공식 LIST JSON에서 이름을 정확히 비교하고 1건일 때만 실행하며, 0건 또는 중복 N건이면 후보를 출력하고 본 명령 전에 종료
  - 2026-08-20 회귀 수정: Announcement LIST의 중첩 응답(`data.items[]`)을 일반 `data[]`로 처리하던 오류를 교정하고, 참조번호→OCID 변환 및 실제 GET 성공을 전용 fixture·219개 생성 Bash·DEFAULT 프로필 읽기 검증으로 고정
  - 직접 입력 유지: cross-tenancy IAM 주체·원본 볼륨, 삭제 범위 compartment, 고유 이름이 없는 Subscription ID처럼 자동 추론이 위험하거나 불가능한 12회에 이유와 선행 경로 표시
  - 감사표: `OCI_CLI_REQUIRED_OCID_AUDIT.md`를 보호 데이터 생성 체인에서 자동 생성하고 드리프트를 차단
  - 회귀 검증: 일반·Action·특수 화면 219개와 동적 조회 입력 247개 조합을 생성해 `bash -n` 통과; Instance, Announcement, Export, Load Balancer, Maintenance 대표 흐름 고정
  - 사이트 커밋: `346d110`
  - 배포: GitHub Pages run `31884186670` 성공; 라이브 JS `assets/index-DyjqkMjj.js` SHA-256 `5DFB07E1C83211E74B68FCACD33FB5BCC22D8C75427270AA36690AC6DB4005DC`, CSS `assets/index-CEVH-R3Q.css` SHA-256 `73C56BC3FC7F6A14A2CE7C234F6060A54235E0D3908DA390E2B08392CDAFC947`, 보호 데이터 SHA-256 `E0C3994416F5A081766D4EADCFCD92300824E44C46CAE057CC8BA6F126DA7556`이 로컬과 일치
- [ ] `P2-03` 발견 → 선택 → 실행 → 결과 해석 UX 완성
  - 입력창에 OCID만 요구하지 않고 관련 LIST/GET으로 찾는 경로 제공
  - 성공 출력 예시, 핵심 응답 필드, 다음 판단, 실패 진단을 표시
  - 상태: 진행 중
  - 2026-08-15 부분 구현: 실행 전 입력 확인을 독립적인 우측 sticky 사이드바로 분리하고, 누락 옵션을 클릭하면 접힌 영역을 펼친 뒤 해당 입력칸으로 스크롤·포커스·강조
  - 2026-08-15 부분 구현: 좌·우 사이드바 폭을 포인터 드래그·방향키로 각각 조절하고 브라우저에 저장; 더블클릭 기본 폭 복원과 좁은 화면 자동 접힘 유지
  - 2026-08-15 부분 구현: 전 CRUD·Action에 노출되는 JSON 옵션 508회에 공식 `--generate-param-json-input` 경로를 부여하고, object·array·boolean·number·variant·자유 키 map을 입력칸으로 조립하는 범용 구조화 편집기와 JSON 유효성 차단 적용 (`b45e378`)
  - 2026-08-15 부분 구현: Instance CREATE `source-details`를 Image/Boot Volume 유형별 필드로 분리하고, 현재 profile·region·compartment·shape로 Image LIST를 조회한 결과를 OS 카드와 버전 radio로 선택해 Image OCID를 확정하는 흐름 구축 (`b45e378`)
  - 2026-08-15 부분 구현: Instance CREATE를 Shape → Image 순서로 교정하고, 현재 profile·region·compartment·AD의 전체 Shape와 Shape별 `image list --shape` 호환성 매트릭스를 단일 JSON으로 불러온 뒤 AMD·Intel·Ampere Shape 카드 클릭만으로 이미 붙여넣은 Image 목록을 로컬 필터링하는 흐름 구축
  - 2026-08-15 회귀 보호: 빈 `{}` 예시 0건, JSON schema 경로 누락 0건, source variant 필수 규칙, image 조회의 0/1/N compartment 가드와 생성 Bash `bash -n`을 보호 데이터 생성 전에 자동 검사
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

### Phase 2.5 — Blueprint Foundation

사용자 우선순위 변경(2026-08-22): 서비스 범위 확장(Phase 3) 전에 First-class Blueprint Engine을 구축한다. 정본 설계 = `OCI_CLI_BLUEPRINT_ENGINE_DESIGN.md`. 첫 자산 = `network-baseline-2tier/v1`(VCN·IGW·NAT·SGW·Public/Private RT·Public/Private SL·Public/Private Subnet 10개). 블로그는 OCI를 직접 실행하지 않고 read-only Discover + Apply/Resume/Verify/Rollback Bash를 생성하고 결과 JSON을 다시 Import한다. 각 하위 Phase는 테스트 통과 후 진행하며, 배포·라이브 검증 전까지 완료 처리하지 않는다.

- [x] `P2.5-01` Contracts & generator — 8 schema(envelope·run-result·verification·run-manifest·discovery·blueprint-input·blueprint·blueprint-schema), blog-db source 3(catalog·blueprint def·naming policy), 응답 pointer 레지스트리, 검증 코어 `scripts/lib/blueprint-validate.mjs` + `generate-cli-blueprints.mjs`/`verify-oci-cli-blueprints.mjs`(commandRef/option/deprecated/required/derived/pointer/DAG/cycle/nodeOutput ancestry 검증), RFC 8785+SHA-256 digest, protected L1 `cliBlueprints` 파이프라인. **green: 정본 통과 + negative fixture 8종 거부 + digest 결정성 + lint + `tsc -b`.** 라이브 bake(`generate-protected-data.mjs`)는 HUB_LOCK 비번 필요 → 사용자 실행 대기
- [x] `P2.5-02` Pure engine — 완료(green): 타입/canonical/graph/shellQuote + `blueprintNaming`(정규화·pattern·DNS·충돌) + `blueprintDerive`(10키, __ref 토큰) + `blueprintResolve`(compare/render 2단계, json 중첩 value-source 재귀, jq JSON 빌더) + `blueprintPlan`(discovery→CREATE/REUSE/CONFLICT/BLOCKED, planDigest, kebab↔camel 통일 comparator) + `blueprintRender`(Discover/Apply/Resume/Verify/Rollback bash) + `blueprintManifest`(provisional/verify평가/final merge/digest). `scripts/test-blueprint-engine.mjs` **40건 통과 + 5개 스크립트 bash -n 통과** · tsc · oxlint
- [x] `P2.5-03` Network Blueprint — 10노드 2-Tier 정의(P2.5-01) + Service Gateway discovery(oracleServicesNetworkAll) + per-resource comparison/verify/rollback 계약 엔진 반영. 실제 Apply bash 검수: run-id 태그 주입·route rules(IGW/NAT/SGW)·sgw services·subnet 참조·소유권 롤백 정상
- [x] `P2.5-04` UI — `CliBlueprintWorkspace`(6탭 DESIGN/DISCOVER/PLAN/APPLY/VERIFY/MANIFEST) + 좌측 `Blueprints` 진입 + 딥링크 `?mode=blueprint&blueprint=&version=` + JSON Import/Export(artifactType 검증) + 검증 사이드바 + 반응형. tsc·lint·vite build 통과. (라이브 렌더는 L1 bake 후)
- [x] `P2.5-04.5` 적대적 리뷰(ultracode 5-lens 워크플로우) — **CRITICAL 인젝션 수정**: 위조 `__var` 셸 인젝션 → `VarRef` 클래스 + bash 식별자 검증 + `stripReserved`. 그 외: discover 실패→DISCOVERY_ERROR(중복생성 차단), Apply EXIT trap 부분 run-result(resume 가능), rollback get 멱등, verify `--argjson`, ownership 빈 run-id 가드, `--wait-for-state AVAILABLE`, compartment 이중검증, derive ref ancestry 게이트. 보안 regression 테스트 3건 추가(총 43건) 및 Windows Git Bash 경로 호환 수정
- [x] `P2.5-05` Release — v3.90.3 source lock 검토·갱신, metadata contract/OCI provenance 갱신, HUB_LOCK bake 및 protected-data 검증 완료. 남은 작업 없음
- [x] `P2.5-06` Blueprint Input UX — SSH source `0.0.0.0/0` 차단 제거 및 실제 ingress rule 회귀 고정. 네이밍 컨벤션의 요소별 포함 체크·구분자(`-`/`_`/`.`/없음)·drag/키보드 순서 변경·전체 MANUAL 이름 입력을 엔진과 UI 계약에 반영했다. 우측 `실행 전 입력 확인`에서 누락 필드를 안내하고 클릭 시 실제 input으로 포커스한다. `Alt+I` 전체화면 질답은 이전/현재/다음 질문 대비, Enter 전환·Esc 종료·자동 종료, 요소 선택/정렬 키보드 조작을 제공한다. 모바일 375px overflow 0 및 우측 패널 하단 재배치를 라이브에서 확인했다.
- [x] `P2.5-07` 공통 OCI CLI Alt+I 입력 오케스트레이터 — Blueprint 전용 질답 흐름을 공통 `CliInputWizard` 모듈로 승격했다. 모든 일반 OCI CLI 화면에서 공통 실행 컨텍스트(Profile/Region/Auth/Endpoint) → 필수·조건부 필드 → 선택 필드 순으로 안내하고, 필수/권장/선택 표식·값 입력 상태·진행 이정표·Enter/Esc/Alt+←→ 키보드 이동을 동일하게 제공한다. 서비스별 JSON·복수선택·동적 목록 컨트롤은 공통 렌더 컨텍스트에 주입해 재사용한다. **완료: 2026-08-24**
  - 커밋(site): `7b17a33`; GitHub Actions deploy `32649136213` 성공
  - 라이브 검증: 자물쇠1 → OCI CLI → Compute → Instance → LIST → Alt+I에서 프로필/리전 → 필수 compartment → 선택 필드 순서, 필수 빈값 차단, Esc 종료, Blueprint Alt+I 재사용을 확인했다. 375px에서 `scrollWidth === innerWidth === 375`, console errors 0.
- [ ] `P2.5-08` OCI CLI 전체 공식 레퍼런스 + 운영 Overlay — 고정한 공식 릴리스의 최종 Click 트리를 모든 public service까지 수집하고, 전체 명령을 기본 탐색면으로 제공한다. 기존 큐레이션은 동적 조회·안전 기본값·Custom/Blueprint를 담당하는 운영 Overlay로 분리하며 공식 옵션 스키마를 복제하지 않는다.
  - 상태: 구현·로컬 검증 완료, 보호 데이터 bake·배포·라이브 검증 대기
  - 고정 원천: OCI CLI `v3.91.0`, commit `fbff93ae6744ed23671b974fd876adb239545cea`, Click 8.4.2, OCI SDK 2.185.0
  - 전체 범위: 14개 공식 그룹·171개 public service·9,130개 leaf command·75,307개 option을 171개 지연 로딩 shard와 전역 검색 index로 생성
  - 화면: 전체 공식 트리와 검색을 기본 노출하고, 명령 선택 시 기존 공통 실행 컨텍스트·Alt+I·필수/선택 입력·JSON schema 불러오기·최종 명령·즐겨찾기·실행 확인을 재사용
  - Overlay 계약: 53개 운영 리소스·229개 동작·2,258개 옵션의 공식 누락·명령 경로 차이 0. UI 전용 lookup 5개와 공식 Click이 enum으로 선언하지 않은 ONS protocol 1개만 사유·guard가 있는 승인 예외로 유지
  - 추가 교정: `iam region-subscription list --tenancy-id`를 선택 profile에서 동적으로 조회·OCID 검증 후 주입하고 Bash 회귀로 고정

#### Phase 2.5 완료 증거

- 완료일: 2026-08-22 (v3.90.3 source lock + HUB_LOCK bake 완료)
- 커밋(site): bb01221→7688de6→ed2734a→e7f3b36→c1dffbe→7e95601 (6커밋, main push, CI deploy success). blog-db: network-baseline-2tier 정의 + msp-standard 정책
- 테스트 명령·결과: `npm run gen:protected` 성공(L1 4 docs·L2 schedule·L3 2 customers/1 support cases/1 meetings/17 announcements). `npm run test:blueprint` = generate(1 blueprint·1 policy) + verify(정본+negative fixture 8 + digest 결정성) + 엔진/UI 48건(보안 regression 3, Blueprint 입력 UX regression 포함) 전부 통과. `tsc -b` 0, `oxlint` 0, `vite build` 성공. protected/source/click/options/requirements/validation/context/defaults/lookups/metadata/commands 회귀 전부 통과
- 생성 Bash `bash -n` 결과: discover/apply/resume/verify/rollback 5종 전부 통과. emit_result 부분/전체 flush 기능검증
- 적대적 리뷰: ultracode 5-lens 워크플로우 → CRITICAL 셸 인젝션(__var 위조) + HIGH 4건 발견·전부 수정+regression
- 배포·라이브 검증: site `68d050a`, blog-db `3243e80`, GitHub Actions deploy `32576083546` 성공. 자물쇠1 로그인 → OCI CLI → Blueprints에서 네이밍 control 7개·우측 필수입력 패널·Alt+I 질답·모바일 375px overflow 0·console error 0 확인. 라이브 JS/CSS 파일명과 `protected-data.json` SHA-256이 로컬 최종 산출물과 일치

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
- [x] `P3-CS-09` Object Storage `bulk-upload`·`object sync` — 최초 폴더 업로드, 반복 동기화, dry-run·체크섬·심볼릭 링크 안전 흐름
  - 구현: 카탈로그·공식 옵션 계약·메뉴·사용 문서·보호 회귀검증 추가 완료
  - 완료: 2026-08-23
  - 검증: OCI CLI v3.90.3 공식 Click 메타데이터·source lock·옵션 관계·명령 생성·블루프린트·lint·build·L1/L2/L3 보호 복호화 회귀 통과
  - 커밋: 사이트 `24ad8e1` / blog-db `05615eb`
  - 배포: GitHub Pages deploy run `32645218532` 성공; 라이브 JS `assets/index-c29gjZQD.js`, CSS `assets/index-CaBu59RP.css`, `protected-data.json` SHA-256이 로컬 산출물과 일치

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

사용자 요청으로 `P3-CS-09` Object Storage 전송 흐름을 우선 구현했다. 현재 카탈로그·문서·로컬 검증은 완료했으며 `HUB_LOCK_1~3`을 사용한 보호 데이터 bake와 GitHub Pages 배포 검증 후 완료 처리한다. 그 다음 미완료 우선순위는 `P3-CS-01`이다.

## 6. 변경 이력

| 날짜 | 변경 | 커밋 | 작성자 |
|---|---|---|---|
| 2026-08-24 | P2.5-07 완료 — 모든 일반 OCI CLI에 공통 Alt+I 입력 오케스트레이터 적용. 프로필·리전 권장 입력, 필수/조건부/선택 표식, 서비스별 JSON·복수선택 렌더러, 키보드 이동·진행 이정표·필수값 차단을 공유 모듈로 통합하고 Blueprint와 회귀 검증 | `7b17a33` / blog-db — | Codex |
| 2026-08-23 | P3-CS-09 완료 — Object Storage Bulk Upload·Object Sync 메뉴/옵션/안전 관계/문서 추가. 보호 데이터 L1/L2/L3 회귀·lint·build·Pages deploy `32645218532`·라이브 JS/CSS/protected-data SHA-256 일치 검증 | `24ad8e1` / blog-db `05615eb` | Codex |
| 2026-08-22 | P2.5-06 — Blueprint 입력 UX: SSH 0.0.0.0/0 허용, 선택·구분자·순서·수동 네이밍, 우측 필수입력 포커스, Alt+I 전체화면 키보드 질답, 모바일 overflow 회귀 수정. 엔진/UI 48건·lint·build·보호 데이터·라이브 artifact 일치 검증 | `68d050a` / blog-db `3243e80` | Codex |
| 2026-08-22 | Phase 2.5 — Blueprint Engine 코드 완료(P2.5-01~04.5): 계약 8스키마+생성기/검증(negative fixture 8), 순수 엔진(naming·derive·resolve·plan·render·manifest, 43 테스트+5 bash -n), 6탭 UI+딥링크, ultracode 5-lens 적대적 리뷰로 CRITICAL 셸 인젝션+HIGH 4건 수정. 6커밋 push·CI deploy success·앱셸 스모크 통과. 라이브 데이터는 HUB_LOCK bake(사용자) 대기 | `7e95601` | Claude |
| 2026-08-20 | P2-02 회귀 수정 — Announcement LIST `data.items[]` 응답 경로를 반영해 GET 동적 조회의 Bash 조기 종료 제거, 실제 OCI GET·219개 생성 Bash 회귀 검증 | — | Codex |
| 2026-08-15 | P2-03 부분 구현 — 범용 JSON 구조화 입력·유효성 검사, Instance 부팅 소스 variant, 현재 컨텍스트 기반 Image 조회·OS/버전 선택 흐름과 회귀 게이트 구축 | `b45e378` | Codex |
| 2026-08-15 | P2-02 완료 — 필수 OCID 232회 전수 분류, 220회 안전 동적 조회·12회 사유 있는 직접 입력, 0/1/N 중단 및 생성 Bash 회귀 구축 | `346d110` | Codex |
| 2026-08-15 | P2-01 완료 — 44개 CRUD 리소스 LIST 기본 진입, 유지보수 GET 기본 진입, 공통 안전 정책·회귀 게이트 구축 | `4c54320` | Codex |
| 2026-08-15 | P1-08 및 Phase 1 완료 — 219개 최종 명령·Bash 전수 검사, 직렬화 회귀, shell quoting 결함 교정 | `e45fe7d` | Codex |
| 2026-08-15 | P1-07 완료 — 190개 명령·1,874개 옵션 공식 메타데이터 계약, 정확한 승인 예외, 최신 릴리스·정기 CI 차단 게이트 구축 | `d7253d1` | Codex |
| 2026-08-15 | P1-06 완료 — OCI root 공통 실행 컨텍스트 분리, 동적 조회·본 명령 동일 Request 전달, 최종 Response 격리 및 회귀 검증 | `c9ae258` | Codex |
| 2026-08-15 | P1-05 완료 — 미완성 명령 사유 표시, 미리보기 구분, 복사·단축키·즐겨찾기 저장 차단 및 회귀 검증 | `539569a` | Codex |
| 2026-08-15 | P1-04 완료 — required 승격 제거, 조건부·택일·상호배타 스키마와 deprecated 기본 숨김 UI 도입 | `375af47` | Codex |
| 2026-08-15 | P1-03 완료 — flag/boolean/multiple/choices/JSON/file/datetime 분리, 충돌 UI와 최종 명령 직렬화 회귀 검증 | `b765c25` | Codex |
| 2026-08-15 | P1-02 완료 — 공식 릴리스의 최종 Click 트리로 전환, extended 공개 이름·cmdref 회귀·오프라인 재현성 검증 | `7d9f9e6` | Codex |
| 2026-08-15 | P1-01 완료 — 공식 OCI CLI v3.90.2 단일 원천 잠금, 절대 경로·혼합 버전 제거, 재현성 검증 | 사이트 `6f2b547` / blog-db `600de31` | Codex |
| 2026-08-15 | 최초 전수검수 결과를 실행 가능한 단계별 계획으로 고정, 완료된 IAM·Instance query 작업 반영 | — | Codex |
