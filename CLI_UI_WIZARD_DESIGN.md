# CLI UI Wizard — 설계서 (2026-08-24)

## 0. 목적

OCI 아키텍처를 **드래그앤드롭 캔버스**에 도형으로 그리고 연관관계를 선으로 잇기만 하면,
그린 그대로 OCI CLI 가 **plan → apply → verify** 까지 완성되는 메뉴.
블루프린트가 *고정 템플릿*이라면, 위저드는 **리소스 모듈을 자유 조합**한다.

사이트 최종 지향점: 활용성·확장성 높고 기존 시스템(OCI CLI 카탈로그·블루프린트 엔진)과 깊게 연계.

## 1. 핵심 아키텍처 — "위저드는 런타임 CliBlueprint 컴파일러"

```
[캔버스 그래프]  ── compose() ──▶  [런타임 CliBlueprint]  ──▶  [기존 블루프린트 엔진]  ──▶  plan/apply/verify
 nodes+edges          (신규 순수모듈)     (network-baseline 과 동일 형태)   computePlan·renderApply·…       (동일 UX)
```

블루프린트 엔진(`src/lib/oci-cli/blueprint*.mjs`)은 **입력이 `CliBlueprint` 객체**면 그대로 동작한다.
`network-baseline-2tier` 는 그 형태의 *한* 인스턴스일 뿐이다. 따라서 위저드는 **캔버스를 CliBlueprint 로
컴파일**만 하면 되고, 렌더/플랜/검증/롤백/매니페스트는 **한 줄도 다시 안 짜도 된다.** (최대 재사용)

이 재사용 덕에:
- 사용자는 자유 조합의 편의를 얻고,
- 기존 OCI CLI 카탈로그·명명정책·엔진이 전부 활용되며,
- 유지보수 지점이 하나(엔진)로 유지된다.

## 2. 데이터 모델

### 2.1 캔버스 그래프 (사용자 저작물, 저장 대상)
```ts
interface WizardGraph {
  schemaVersion: 1
  id: string; label: string
  namingPolicyId: string           // 재사용: msp-standard
  execution: { region; compartment; profile; compartmentMode }  // 공통 실행 컨텍스트
  nodes: WizardNode[]
  edges: WizardEdge[]
}
interface WizardNode { id; moduleType; label; role?; x; y; inputs: Record<string,string> }
interface WizardEdge { id; from: string /*nodeId*/; to: string /*nodeId*/; slot: string /*모듈이 정의한 입력 슬롯*/; config?: Record<string,string> }
```

### 2.2 리소스 모듈 레지스트리 (blog-db 데이터, 엔진이 아는 "부품 사양")
`network-baseline-2tier` 의 10개 손수작성 노드를 **자원 타입별 재사용 모듈**로 일반화한다.
```ts
interface ResourceModule {
  type: string            // 'vcn' | 'subnet' | 'internet-gateway' | 'instance' | ...
  label: string; group: 'network'|'compute'|'database'|'operations'
  resource: string        // cliCatalog commands 키
  role: string            // 기본 naming role (사용자가 덮어쓸 수 있음)
  scalarInputs: { id; option; type; required; label; help?; default? }[]      // 사용자 입력 → input source
  fixed: Record<string, unknown>                                              // 리터럴 바인딩
  contextInputs: Record<string,'compartmentId'|'tenancyId'>                   // --compartment-id 등
  edgeSlots: EdgeSlot[]   // 이 모듈이 "받는" 연결(들어오는 화살표)
  outputs: Record<string,{pointer;type}>                                      // 노드가 노출하는 출력
  discovery; comparison; verify; rollback   // 계약 템플릿(엔진 형식 그대로, 노드/엣지로 파라미터화)
  ruleBuilders?: RuleBuilder[]   // route-rules / security-rules 처럼 엣지에서 JSON 배열을 만드는 규칙
}
interface EdgeSlot {
  slot: string            // 'vcn' | 'route-table' | 'security-list' | 'gateway'
  option: string          // 바인딩할 create 옵션(--vcn-id 등). rule 로 흡수되면 없음
  target: string|string[] // 연결 가능한 모듈 type(들)
  pointer: string         // 대상 노드 출력 포인터(기본 /data/id)
  required: boolean
  multiple?: boolean      // --security-list-ids 처럼 여러 개
  as?: 'binding'|'rule'   // binding: 옵션에 직접 / rule: ruleBuilder 입력으로
}
```
모듈 레지스트리는 **가능한 한 cliCatalog 에서 자동 도출**한다(create 옵션·required·타입·get id 옵션). 사람이
얹는 것은 edgeSlots 의 의미(어느 옵션이 어느 자원을 가리키는지)·계약 템플릿뿐이다.

### 2.3 컴파일 결과 = 런타임 CliBlueprint
`compose(graph, registry, policy)` 가 그래프를 **엔진이 먹는 CliBlueprint** 로 변환:
- node.inputs → `input` source 바인딩 (blueprint.inputs 에 per-node 입력 등록)
- edge → 대상 노드의 `nodeOutput` source 바인딩 (또는 ruleBuilder 로 route/security 규칙 JSON 생성)
- 태그 → 엔진의 `managedFreeformTags`(derived, run-id 주입은 엔진이)
- compartment → `context.compartmentId`
- dependsOn = 들어오는 엣지의 source 노드들 → 엔진 DAG/topo/rollback 이 그대로 성립
- naming.role/sequence 를 조합해 이름 충돌 회피

> 핵심: 고정 블루프린트의 **하드코딩 derived 키(publicRouteRules 등)에 의존하지 않는다.** 대신
> 컴파일러가 사용자의 엣지로부터 route-rules/security-rules JSON 바인딩(`json` + `nodeOutput`)을 **명시적으로 생성**한다.
> (이미 service-gateway `--services` 가 `json`+중첩 value-source 로 동작함 → 같은 메커니즘.)

## 3. 정합성 게이트 (Apply 전에 오류 차단 — 부분 실패 예방)

캔버스 편집 중 실시간 검증(검증 사이드바):
1. 필수 edgeSlot 미연결 (예: subnet 에 vcn 연결 없음).
2. 엣지 타입 불일치 (subnet → instance 를 vcn 슬롯에 연결 등).
3. cycle 검출(엔진 DAG 재사용) · 고아 노드.
4. CIDR 정합성(`validateAddressing` 재사용) · 필수 스칼라 입력 누락.
5. 이름 충돌(computeNaming issues).
오류가 있으면 compose 를 막고 Apply 스크립트를 생성하지 않는다.

## 4. UI

- **경로/메뉴**: `지식모음 > CLI UI Wizard` (`/knowledge/cli-wizard`, 자물쇠1 — OCI CLI 와 동일).
- **레이아웃**: 좌 팔레트(모듈 목록, 그룹별) · 중앙 캔버스(SVG, 드래그 배치·포트 간 엣지) · 우 인스펙터(선택 노드/엣지 입력).
- **캔버스**: 커스텀 SVG(외부 의존 0). 노드=둥근 사각형(자원 아이콘/라벨), 포트=상·하 점, 엣지=베지어.
  드래그 이동, 포트→포트 연결, 노드/엣지 삭제, 팬/줌(기본).
- **하단 = 블루프린트 라이프사이클 재사용**: compose 성공 시 기존 워크스페이스의 4탭
  (조사·계획 / 적용·검증 / 매니페스트)을 **공용 컴포넌트로 추출**해 그대로 렌더.
- 저장/불러오기(그래프 JSON), 예시 그래프(network-baseline 을 그래프로 역-표현)로 학습.

## 5. 기존 시스템 연계 (재사용 목록)

| 재사용 | 어디에 |
|---|---|
| cliCatalog(v3.90.x) | 모듈 create 옵션·required·타입·get id 옵션 자동 도출 |
| 블루프린트 엔진 전체 | compose 결과를 그대로 렌더/플랜/검증/롤백/매니페스트 |
| msp-standard 명명정책 | computeNaming 그대로 |
| cidr.mjs / validateAddressing | 주소 정합성 게이트 |
| CliBlueprintWorkspace 라이프사이클 탭 | 공용 컴포넌트로 추출 후 위저드·블루프린트 공유 |
| protected L1 cliBlueprints | 위저드 예시·모듈 시드 배포 채널 |

## 6. 구현 단계

- **P1 — 컴파일러 코어(엔진 재사용 증명, Node 테스트)**: 모듈 레지스트리(network 세트) + `wizardCompose.mjs`
  (graph → CliBlueprint) + `wizardValidate.mjs`(정합성). 테스트: network 그래프를 컴파일 → 엔진에 통과 →
  bash -n. **UI 없이도 파이프라인 검증.**
- **P2 — 캔버스 + 워크스페이스 + 메뉴**: SVG 캔버스, 인스펙터, 라이프사이클 공용화, 라우팅/권한/팔레트, 저장.
- **P3 — 확장**: compute(instance) 등 모듈 확대, 엣지 유효성 심화, 예시 그래프·시작 템플릿, 라운드트립(블루프린트↔그래프).

## 7. 검증 원칙

- 컴파일러는 순수 함수 → Node 단위테스트(엔진처럼 `.mjs`+`.d.mts`). compose 결과는 기존 `blueprint-validate`
  로 교차검증 + 렌더 bash `bash -n`.
- 라이브 검증은 자물쇠1 로그인 필요분(엔진 로직은 로그인 무관하게 테스트로 커버).

## 8. 미해결/결정 대기 (리서치 후 채움)

- 모듈 레지스트리 초기 커버리지(리서치: cliCatalog CRUD/edge 서베이 결과).
- route/security 규칙 UX(엣지 config vs 노드 입력).
- 그래프 저장 위치(protected L2/L3 vs 로컬).
