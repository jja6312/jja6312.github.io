# OCI CLI 자산화 — 입력 해석 통합 설계

> 2026-09-03 · 앵커 설계서 · 다음 빌드 세션이 이어받는 기준 문서
> 관련: [[project_cli_ui_wizard]] · [[project_ocicli_blueprint_engine]] · [[project_ocicli_profiles]] · [[reference_ocicli_system]]
> 선행: `REPORT_ocicli-profile-store-design_2026-08-30.md`

---

## 0. 한 줄

VCN·인스턴스를 "간단하게" 못 만드는 이유는 다중자원 조립이 아니라 **leaf 입력(AD·image·shape)을 사람이 손타이핑**해야 하기 때문이고, 그 해석 능력은 **이미 독립 빌더 안에 있는데 위저드 캔버스가 물려받지 못했다**. 해결책은 새 프레임워크가 아니라 **입력 출처(resolver)라는 개념 하나**를 두 화면이 공유하게 만드는 것.

---

## 1. 진단 — 왜 어려운가

### 1.1 자원 생성 = 의존성 폐포(closure)

인스턴스 하나를 띄우려면 아래가 전부 채워져야 한다.

```
compute instance launch 가 요구하는 값
├── 구조 입력 (다른 자원의 OCID)          ← "어느 서브넷" 류
│   └── subnet-id → subnet → route-table → vcn …   (연쇄)
└── 환경 입력 (테넌시/카탈로그 고유값)       ← "손타이핑 지옥" 류
    ├── availability-domain   Uocm:AP-SEOUL-1-AD-1   (외울 수 없음)
    ├── image-id              ocid1.image.oc1..aaaa… (지역·시점마다 다름)
    ├── shape                 VM.Standard.E5.Flex     (카탈로그)
    ├── compartment-id        ocid1.compartment…      (이름은 알지만 OCID는 모름)
    └── ssh key / metadata    (진짜 사람 결정)
```

### 1.2 근본원인 — 해석 엔진이 두 갈래로 따로 자랐다

```
현재 자산 두 개, 서로의 능력을 공유 안 함
├── 독립 빌더 (꺼내쓰기 레시피 경로)
│   ├── 잘함: 환경 입력을 live 해석
│   │   ├── dynamicLookup(kind: exactName·compartment·tenancy) → NameSelect 드롭다운(프로필 캐시)
│   │   ├── prerequisite(kind: availabilityDomain) → ensureAvailabilityDomain() 로 AD live 해석
│   │   └── oci-instance-launch-preflight/v2 번들: context+shapes[]+images[] 붙여넣기 → AD·shape·image 피커
│   └── 못함: 그래프가 없다 — 한 번에 자원 하나
│
└── UI 위저드 캔버스 (wizardModules / wizardCompose)
    ├── 잘함: 구조 입력을 그래프 엣지로 해석
    │   └── VCN→subnet→instance 엣지 → CliBlueprint nodeOutput 포인터로 OCID 연결
    └── 못함: leaf 입력이 맹탕 문자열
        └── instance.scalarInputs 의 availabilityDomain/imageId/shape = type:'string', default:'' (손타이핑)
```

**즉, 위저드는 "어느 서브넷"은 풀지만 "어느 AD"는 못 풀고, 독립 빌더는 반대다.** 둘 다 반쪽이라 어느 쪽으로도 인스턴스를 "간단하게" 못 만든다. 그리고 두 화면이 **leaf 해석 어휘를 공유하지 않아서**, 독립 빌더가 이미 가진 AD/image 해석을 위저드가 재사용하지 못한다.

---

## 2. 핵심 개념 하나 — 입력 출처 사다리(resolver ladder)

모든 입력에 "이 값이 어디서 오는가"를 딱 하나 붙인다. 새 개념은 이것뿐.

```
resolver — 입력값의 출처 (4단계 사다리, 위로 갈수록 사람 손 덜 탐)
├── ④ edge      다른 노드 출력에서      subnet-id ← subnet 노드            [위저드에 이미 있음]
├── ③ context   활성 프로필/실행맥락에서  compartment · region · AD          [독립빌더에 있음 → 위저드로 이식]
│                └ AD 특칙: 대개 AD-1 하나뿐 → 기본 자동선택, 여럿일 때만 피커
├── ② catalog   큐레이션 목록에서 고름    shape · OS 이미지 패밀리             [preflight 에 있음 → 공용화]
│                └ image 는 catalog 선택 → 실행시점 bash 가 최신 OCID live 해석(저장 안 함)
└── ① freeText  진짜 사람 결정만        display-name · custom CIDR · SSH key  [최소화가 목표]
```

**자산화의 정의(우아한 버전) = 모든 입력을 이 사다리 위로 밀어올리는 것.** 프레임워크를 늘리는 게 아니라, freeText 였던 것을 context/catalog/edge 로 승격시켜 **사람이 진짜 결정만 만지게** 하는 것.

| 아픈 입력 | 지금 | 목표 | 승격 |
|---|---|---|---|
| availability-domain | ① 손타이핑 | ③ context(AD-1 자동) | ①→③ |
| image-id | ① OCID 손타이핑 | ② catalog "Oracle Linux 9" + live | ①→② |
| shape | ① 손타이핑 | ② catalog 드롭다운 | ①→② |
| compartment-id | (부분) | ③ context | 유지·확대 |
| subnet-id 등 | ④ edge | ④ edge | 이미 완료 |

> 표는 사다리 보조용. 본질은 위 트리의 "승격" 한 방향뿐.

---

## 3. 아픈 입력이 사다리를 오르는 법 (구체)

### 3.1 AD — ①→③ (가장 큰 즉효, 가장 작은 작업)

- **관찰**: 한국 리전(ap-seoul-1, ap-chuncheon-1)은 전부 **단일 AD**. `Uocm:...-AD-1` 하나뿐.
- **설계**: 프로필 수집 스크립트에 `oci iam availability-domain list` **한 줄 추가**(리전당 read-only, 출력 2~3줄). 프로필 캐시에 `ads: {region: [adName,...]}` 로 저장.
  - AD가 1개 → 위저드/빌더가 **자동선택**, 입력칸 자체를 숨김(회색 "AD-1 자동" 배지).
  - AD가 2개 이상(US 등) → NameSelect 드롭다운(이미 있는 컴포넌트).
- **불변식 유지**: OCID 저장 안 함. AD는 이름(`Uocm:...`)이 곧 CLI 입력값이라 OCID 불필요 — 저장해도 크리덴셜 아님.
- **공식 근거**: `oci iam availability-domain list` → `data[].name` 이 `--availability-domain` 에 그대로 들어감(단일 read-only 조회). ※ 빌드 시 CLI 소스 AST 로 재확인.

### 3.2 image — ①→② + live (사다리와 안전원칙 동시 만족)

- **문제**: image OCID는 리전·시점마다 다르고, [[project_ocicli_blueprint_engine]] 안전원칙상 **OCID는 실행시점 live** 여야 한다. 그래서 "캐시하면 stale, 손타이핑하면 지옥"의 딜레마.
- **해결**: 사용자는 **카탈로그에서 OS 패밀리만** 고른다("Oracle Linux 9", "Ubuntu 22.04"). 방출되는 bash가 최신 OCID를 live 해석:
  ```bash
  IMAGE_ID=$(oci compute image list --compartment-id "$COMPARTMENT_ID" \
    --operating-system "Oracle Linux" --operating-system-version "9" \
    --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC \
    --query 'data[0].id' --raw-output ${REQUEST_CONTEXT})
  [[ "$IMAGE_ID" == ocid1.* ]] || { echo "[ERROR] 이미지 조회 실패" >&2; exit 2; }
  ```
- **이미 있는 자산**: 독립 빌더의 `oci-instance-launch-preflight/v2` 가 `images[]`(compatibleShapes 포함)로 **이 카탈로그를 이미 만든다**. 위저드는 이 파서(`parseImageCatalog`)를 공용화해 재사용.
- **사다리 위치**: 선택=②catalog, 해석=live(④ 옆의 특수 바인딩 `liveShell`). OCID는 끝까지 저장 안 됨.

### 3.3 shape — ①→② (순수 정적 카탈로그)

- shape는 거의 정적(E5.Flex, E4.Flex, A1.Flex, E5.Flex 등) + flex OCPU/메모리 기본값.
- 정적 카탈로그 드롭다운 하나면 끝. 조회 불필요. flex면 `--shape-config {"ocpus":..,"memoryInGBs":..}` 동반 입력(기본 1/16).
- preflight `shapes[]`(ShapeCatalogEntry)와 정적 목록을 합집합 — 프로필 있으면 실제 가용 shape 우선, 없으면 정적 표준.

---

## 4. UI 위저드 연계 — "가능한가?" → 예, 대부분 재사용

위저드 모듈은 이미 `scalarInputs` 를 선언한다. 여기에 `resolver` 서술자만 더한다. 그러면 3개 화면이 같은 어휘로 동작한다.

```
resolver 를 붙이면 자동으로 맞물리는 3개 지점
├── wizardModules.mjs (선언)
│   instance.scalarInputs:
│     availabilityDomain → resolver:{kind:'context', context:'availabilityDomain', default:'AD-1'}
│     shape              → resolver:{kind:'catalog', catalog:'shape'}
│     imageId            → resolver:{kind:'catalog', catalog:'osImage', live:true}
│
├── 캔버스 노드 인스펙터 (입력 UI) — 노드 클릭 시 뜨는 입력 패널
│   resolver.kind 로 컨트롤 분기:
│     context → NameSelect(프로필 ads/compartments 캐시)  ← 이미 있는 컴포넌트
│     catalog → 카탈로그 드롭다운(shape/osImage)          ← preflight 파서 공용화
│     freeText→ 평범한 Field                              ← 그대로
│
└── wizardCompose.mjs (컴파일러) — scalarInputs 바인딩부만 분기
    현재:  bindings[si.option] = inputSource(id)              // 무조건 리터럴
    변경:  resolver.kind==='context' → ctxSource(context)     // 실행맥락
           resolver.kind==='catalog'&&live → { source:'liveShell', ... } // 실행시점 해석
           그 외 → inputSource(id)                            // 기존과 동일(하위호환)
```

**새로 만들 것은 딱 4개** (나머지는 재사용):

```
신규(최소)                                        재사용(그대로)
├── 1. resolver 서술자 (모듈 scalarInput 필드)      ├── NameSelect 컴포넌트
├── 2. liveShell 바인딩 소스                        ├── 프로필 캐시 + parseCollectedProfiles
│      (compose→blueprintRender 에 1개 case)        ├── dynamicLookup(exactName/compartment/tenancy)
├── 3. 수집 스크립트 AD list 1줄 + 파서 ads 필드     ├── preflight images[]/shapes[] 파서
└── 4. 노드 인스펙터 resolver 분기(위 3지점)         ├── 블루프린트 엔진(plan/verify/rollback)
                                                    └── Alt+I 입력 마법사(renderCliWizardControl)
```

`liveShell` 은 [[project_ocicli_blueprint_engine]] 의 "블로그는 OCI 직접실행 안 함 — bash 생성→붙여넣기→결과 Import" 모델과 정확히 일치한다(방출 bash가 `$(oci …)` 로 해석). 안전 불변식(OCID 실행시점 live·미저장) 그대로.

---

## 5. 단계별 runbook (구현형 — 승인 시 이 순서로)

```
P0 · AD context 해석 (즉효, 반나절)          [①→③]
├── 수집 스크립트: oci iam availability-domain list 추가 → 프로필.ads
├── 파서/테스트: ads 필드 + lookupNamesFor(profile,'availabilityDomain',{region})
├── instance 모듈 availabilityDomain 에 resolver:{context, default:'AD-1'}
├── 캔버스 인스펙터 + Alt+I: AD 1개 자동/숨김, 여럿이면 NameSelect
└── 검증: test:profiles 확장(ads 파싱·자동선택), 사용자 실제 프로필로 붙여넣기 확인
      ⇒ "AD 손타이핑" 통증 제거. 여기까지만 해도 체감 큼.

P1 · shape/image 카탈로그 공용화                [①→②]
├── preflight parseImageCatalog/normalizeShapeCatalog 를 lib 공용 모듈로 승격
├── shape 정적 카탈로그 + 프로필 preflight 합집합
├── instance 모듈 shape/imageId 에 resolver:{catalog}
└── 검증: 카탈로그 렌더 + 정적 fallback(프로필 없음)

P2 · liveShell 바인딩 (image OCID 실행시점 해석)   [② live]
├── wizardCompose: catalog+live → {source:'liveShell', command, query, guard}
├── blueprintRender: liveShell → IMAGE_ID=$(oci compute image list … data[0].id) + ocid1 가드
├── 블루프린트 게이트(validateBlueprints)에 liveShell 소스 허용 규칙
└── 검증: test:blueprint + wizard 조합 스냅샷(instance가 OCID 손입력 0)

P3 · 위저드 canvas 통합 마감 + 라운드트립          [자산화 완성]
├── "웹서버 1대" 최소 템플릿: vcn→ig→rt→sl→subnet→instance 한 번에
├── 캔버스→CliBlueprint→bash 생성→(사용자 실행)→결과 Import 왕복
└── 적대적 리뷰(Phase E): AD 다중리전·image 미존재·shape 미가용 3함정
```

**권장 시작점: P0.** 사용자가 말한 "AD 입력이 까다롭다"를 가장 작은 변경으로 없앤다. P1~P3는 그 뒤 체감 보고 진행.

---

## 6. 검증 · 가정 · 안전 불변식

- **가정한 시나리오**: 한국 리전(단일 AD) 중심 사용. US 등 다중 AD는 NameSelect 폴백으로 커버(자동선택 안 함).
- **틀렸을 가능성 1줄**: preflight `images[]` 파서를 위저드로 떼어낼 때 compatibleShapes 결합 로직이 인스턴스 전용 가정에 묶여 있을 수 있음 → 판별: `parseImageCatalog` 를 순수 함수로 격리해 단위테스트가 통과하는지 먼저 확인(P1 첫 커밋).
- **안전 불변식(불변)**:
  - OCID·크리덴셜 저장 금지 — AD 이름/compartment 이름/OS 패밀리만 캐시. image OCID는 liveShell 로 실행시점 해석.
  - 읽기전용 수집 — AD list 추가도 list/get/search 범주 유지.
  - 블루프린트 게이트 통과 — liveShell 은 baked 아닌 runtime 소스라 게이트에 명시 허용 추가 필요(P2).
- **공식 근거 원칙**: AD list · image list 쿼리는 빌드 시 CLI 소스 AST(v3.76.1)로 옵션명 재확인, cmdref 교차검증([[reference_ocicli_system]] 규칙).
- **회귀 게이트**: `npm run test:profiles`(AD), `test:wizard`(compose), `test:blueprint`(liveShell), `build`(tsc+lint).

---

## 7. 다음 세션이 여기서 시작

1. 이 문서 §5 P0 부터.
2. 손댈 파일: `src/lib/oci-cli/profilesParse.mjs`(AD 수집·파싱), `wizardModules.mjs`(resolver), `wizardCompose.mjs`(context 바인딩), `CliBuilderPage.tsx`(노드 인스펙터·Alt+I 분기), `scripts/test-profiles.mjs`.
3. 재사용 확인처: `parseInstanceLaunchPreflight`/`parseImageCatalog`(CliBuilderPage), `NameSelect`, `dynamicLookup` kinds.
4. 통증 순위: AD > image > shape. 통증 큰 것부터 사다리 승격.
