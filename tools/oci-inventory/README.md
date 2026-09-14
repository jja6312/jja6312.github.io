# OCI 리소스 현행화 v3

Python으로 OCI 구성을 수집하고, 같은 스냅샷으로 날짜별 Excel과 브라우저 화면을 만듭니다. 공개 웹사이트에는 코드만 배포합니다. 실제 고객 JSON, Excel, OCI config, API 키는 저장소에 넣지 않습니다.

## 안전 경계

- 클라우드 호출은 검토된 **GET / LIST** 허용 목록만 실행합니다. 사용자가 승인한 Resource Search와 Monitoring 중 HTTP POST인 조회는 정확히 `search_resources`, `list_metrics`, `summarize_metrics_data`만 허용합니다. HTTP POST라는 이유만으로 다른 API를 허용하지 않습니다.
- SDK 호출명과 실제 HTTP 동사를 모두 검사합니다. CREATE / UPDATE / DELETE / ACTION / 실행 / 콘솔 접속을 사용하지 않습니다. 권한 부족은 자동으로 정책을 만들어 해결하지 않습니다.
- Secret 내용, 개인키, Wallet, 접속 비밀번호, kubeconfig, Object 본문, DB 데이터, 로그 본문은 수집 대상이 아닙니다. Vault Secret의 이름·설정 같은 메타데이터는 수집합니다.
- OCID, IP, 메일주소, 태그는 사용자가 승인한 실제 값으로 보관합니다. 태그 자체에 비밀을 적어둔 경우도 마스킹하지 않으므로 원본 파일의 접근권한을 별도로 관리해야 합니다.
- 운영 API 계정도 조회 전용 권한을 유지하세요. 코드의 안전장치는 IAM 권한을 대신하지 않습니다.

## 수집과 변경 판단

1. OCI config의 모든 유효 프로필을 읽고, API로 실제 테넌시 이름과 READY 구독 리전을 확인합니다. 같은 테넌시의 중복 프로필은 첫 프로필로 수집하고 실행 보고서에 남깁니다.
2. Root 및 접근 가능한 하위 컴파트먼트, 각 리전의 AD를 조회합니다. 검색 목록과 서비스별 native LIST를 함께 수집하며 페이지 끝까지 읽습니다.
3. 서비스별 GET과 자식 설정 LIST로 상세를 채웁니다. Security List / NSG 규칙, Route / DRG 규칙, Policy Statement, OKE 옵션, LB Listener / Backend, DHCP 및 DNS 연결 등을 보관합니다.
4. LIST 응답이 같아도 GET 전용 설정은 바뀔 수 있습니다. 따라서 변경 가능한 설정은 매일 GET합니다. 검토한 Image 상세만 AVAILABLE 상태·동일 LIST 해시·7일 이내 조건에서 재사용합니다. `--full`은 이 재사용도 끕니다.
5. 자원 식별자는 **테넌시 + 유형 + 식별자**입니다. BootVolumeAttachment가 Instance와 같은 OCID를 쓰는 실제 사례 때문에 OCID 하나로 합치지 않습니다.
6. 직전 스냅샷과 필드 단위로 비교합니다. 규칙 순서·태그 순서·변동성 메타데이터는 불필요한 변경으로 세지 않습니다. 일반 배열은 임의로 정렬하지 않습니다.
7. 실패한 범위의 자원은 이전 정보로 표시합니다. 목록만 읽힌 경우 마지막 정상 상세를 따로 보존합니다. 정상 LIST에서 없어졌어도 **삭제·이동 확인 필요**로 표시하며 삭제를 단정하지 않습니다.

매일 한 번의 스냅샷은 두 실행 사이에 잠깐 생성됐다가 삭제된 자원까지 보장하지 않습니다. 그것까지 필요하면 별도 승인된 감사 이벤트 수집 설계가 필요합니다.

수집은 테넌시 전체를 한 순간에 고정하는 트랜잭션이 아닙니다. 자원별 `observed_at`, `detail_observed_at`과 요청 원문의 시각을 함께 보관하며, 중단 후 재개해 읽은 기존 응답을 새로 조회한 시각으로 바꾸지 않습니다. Public IP는 REGION / AVAILABILITY_DOMAIN, DNS Zone은 GLOBAL / PRIVATE 범위를 각각 조회합니다.

일반 API-key 서명 객체는 한 프로필의 실행 안에서만 재사용하고, HTTP 세션은 스레드별로 분리합니다. 키를 매번 파싱·검증하는 초기화 비용을 줄이며 고객 간 서명 객체를 공유하지 않습니다. 갱신형 토큰 서명 객체는 이 최적화에서 제외합니다.

### “전체 수집”의 정확한 의미

`specs.py`에 등록된 서비스·범위 전체를 조회합니다. Search에도 서비스별 색인 제한이 있으므로 OCI의 모든 존재 자원을 100% 증명한다고 표현하지 않습니다. 검색에서만 발견된 유형, 미지원 SDK, 권한 부족, 일부 페이지 실패는 `coverage`에 구분해 남깁니다. 아무것도 못 읽은 것과 실제 0건은 다릅니다.

플랫폼 Image 카탈로그와 테넌시에 추가되지 않은 OS Management Hub 벤더 소스는 고객 자원 건수에 넣지 않습니다. Oracle 정의상 `AVAILABLE`은 접근 가능하지만 아직 미등록, `SELECTED`는 서비스에 추가된 상태입니다. OCI / 비OCI 양쪽 모두 미선택임이 확인된 VENDOR 소스만 참고 카탈로그로 분리하고 LIST 원문과 `reference_catalogs` 인덱스를 보존합니다. 선택된 소스, Custom / Private / Third-party 소스와 상태가 불확실한 항목은 상세 수집합니다. [Oracle의 상태 정의](https://docs.oracle.com/en-us/iaas/osmh/doc/add-vendor-software-sources.htm)

Identity Domain은 각 Domain의 endpoint / home region으로 SCIM 목록을 읽습니다. SCIM에서 기본 응답에 포함되지 않는 선택 속성이나 자격증명은 전체 저장을 보장하지 않습니다. OKE 내부 Kubernetes 객체나 워크로드 사용량을 자동 조회하지 않습니다. 현재 Monitoring 메서드는 허용되어 있지만 시계열 수집은 기본 실행에 포함하지 않습니다.

## 산출물과 화면

- `snapshots/<tenancy OCID>/<run id>/raw/`: 요청별 원본 구성 응답
- `snapshots/.../coverage.jsonl`: 완료 체크포인트와 실패 근거
- `snapshots/.../snapshot.json`: 정규화 자원, 관계, 규칙, 변경, 커버리지
- `web/<tenancy name>/<run id>.json`: 웹사이트에서 가져올 파일
- `excel/<tenancy name>/<local date>/<run id>.xlsx`: 날짜별 Excel
- `latest/`, `latest-complete/`: 최근 실행 / 등록 범위 전체 성공 포인터
- `runs/`, `logs/`: 프로필별 실행 결과와 로컬 로그

원본 JSON을 기준으로 같은 데이터에서 Excel과 웹 화면을 생성합니다. 이전 날짜 파일은 자동 삭제하지 않습니다. 브라우저 데이터는 백업이 아니므로 JSON 원본을 계속 보관하세요.

Excel은 첫 장 요약 → 변경 / 설정 / 커버리지 → 컴파트먼트 요약 → Console 계열 번호 시트 → 기술 원본 순입니다. Compute 1xx, Storage 2xx, Network 3xx, Oracle Database 4xx, MySQL 등 5xx, Analytics 6xx, 애플리케이션 7xx, IAM / Security 8xx, 운영 9xx를 사용합니다. 시트 안은 컴파트먼트 → 리전 → 유형 → 이름 순입니다. 규칙 상세 행은 자원 수에 중복 합산하지 않습니다. OCID·부모 OCID·Raw JSON은 오른쪽, 긴 JSON은 분할 시트에 보존합니다.

웹사이트 **지식모음 → 리소스 현행화 (자물쇠 3)** 에서 JSON 파일을 선택합니다. 파일 크기를 고려해 localStorage 대신 IndexedDB에 저장하고 표시 설정만 localStorage에 둡니다. 고객 / 날짜 / 서비스 / 컴파트먼트 / 리전 / 유형 / 이름·IP·OCID·태그로 탐색할 수 있습니다. 자물쇠는 기존 사이트 접근 흐름이며 브라우저 저장소를 암호화하는 장치는 아닙니다. 공용 PC나 공용 브라우저 프로필은 사용하지 마세요.

기본 화면과 Excel 요약 그래프는 구성 자원을 우선 보여줍니다. 수천 건이 될 수 있는 소프트웨어 소스와 백업·실행 이력은 별도 분류하며, 웹 체크박스로 함께 볼 수 있습니다. 사용하지 않는다는 판정이나 삭제가 아닙니다. 전체 원본과 전체 건수는 계속 보존합니다. 분류표는 웹과 Excel이 같은 `resource_classes.json`을 사용합니다.

## 설치와 일상 실행

필수: Python + OCI Python SDK, Node.js + `@oai/artifact-tool` 런타임. 웹 프런트엔드 자체에는 OCI SDK와 고객 데이터가 들어가지 않습니다. 현재 설치 환경의 정확한 경로는 설치 폴더의 `.runtime.json`에 저장합니다. 이 파일에도 API 키 내용은 저장하지 않습니다.

`install.ps1`에 InstallDirectory, OutputDirectory, Python, SdkPath, Node, NodeModules, OciConfig를 전달하고 `-RegisterSchedule`을 붙이면 Windows 작업을 등록합니다. 같은 이름의 작업은 백업 후 갱신하고, 사람이 수정한 `baselines.json`은 덮어쓰지 않습니다.

- 작업 이름: `Wizbase OCI Resource Inventory`
- 매일 PC 현지 시각 **11:30**
- 놓친 실행: 다음 사용자 로그인 시 보완 실행
- 동일 작업 중복 실행 방지, 별도 관리자 권한·비밀번호 저장 없음
- PC가 켜져도 사용자 로그인 전에는 API 키 접근을 전제로 실행하지 않습니다.

수동 실행은 설치 폴더의 `run_daily.ps1`입니다. 해당 예정일에 이미 실행했다면 중복 실행하지 않습니다.

```powershell
# OCI SDK 경로를 PYTHONPATH에 지정한 터미널에서 실행합니다.
python collector.py --config <oci-config> --output <private-data-directory> --node <node-executable>
# 한 테넌시 테스트
python collector.py --config <oci-config> --profile <profile> --output <private-data-directory> --no-excel
# 중단된 실행의 성공한 요청을 재사용하고 실패한 요청을 다시 시도
python collector.py --config <oci-config> --profile <profile> --output <private-data-directory> --resume <run-id> --no-excel
```

## 기준값 관리

`baselines.json`은 사람이 검토·수정하는 규칙 목록입니다. 필드 경로, 비교값, 대상 유형, 설명, 공식 근거를 함께 둡니다. 알려진 기본값 차이(`nondefault`), 설계 특성(`configuration`), 검토 항목(`review`)을 구분합니다. “다름”은 “잘못됨”이 아닙니다. 공식 기본값이 확실하지 않은 값은 기본값이라고 단정하지 않습니다.

웹의 **기준 관리**에서 수정·검증·적용·JSON 내보내기를 할 수 있습니다. 수집 결과에도 적용하려면 내보낸 파일로 로컬 수집기의 `baselines.json`을 갱신합니다. 공개 사이트에서 로컬 파일을 조용히 변경하지 않습니다.

## Postman (선택 사항)

GitHub Pages는 JSON을 받는 POST 서버가 아닙니다. 필요할 때만 `bridge.py --inbox <private-inbox> --token-file <private-token.json>`을 실행합니다. 로컬 서버는 `127.0.0.1:8766`에만 바인딩됩니다.

Postman에서 `POST http://127.0.0.1:8766/imports`, `Authorization: Bearer <token>`, `Content-Type: application/json`으로 **스냅샷 JSON**을 보냅니다. 이 POST는 로컬 JSON 저장만 수행하며 OCI와 통신하지 않습니다. 웹의 **JSON 가져오기 → Postman · 로컬 연결**에서 같은 토큰으로 가져옵니다. 브라우저의 로컬 네트워크 제한으로 연결되지 않으면 파일 가져오기를 사용하세요.

서버는 지정된 사이트 Origin, 로컬 Host, 토큰을 확인합니다. 다른 내용으로 같은 run_id를 덮어쓰지 않습니다. 토큰 파일을 공개 저장소나 고객 배포물에 넣지 마세요.

## 확장과 검증

- 새 유형: 설치 SDK / 공식 문서에서 LIST / GET / 필수 인자 확인 → `specs.py` 등록 → `model.py` 핵심 속성 → 테스트
- 비밀 값 GET, 실행 API, 이름만 read처럼 보이는 API는 허용하지 않습니다.
- `python validate_registry.py`: 설치 SDK 메서드·서명·HTTP 동사 오프라인 검사
- `python -m unittest discover -s . -p "test_*.py"`: 클라우드 호출 없는 회귀 검사
- `node scripts/verify-inventory.mjs`: 웹 계약 검사 (저장소 루트)
- `npm run lint`, `npm run build`: 기존 웹사이트 회귀 검사
- `render_excel.mjs`는 수식 / 자원 수 / 재열기 / 저장 후 10초 해시를 확인합니다. 검증용 preview 인자를 주면 모든 시트를 렌더링합니다.

현재 번들 렌더러는 PNG 미리보기 후 종료 과정에서 비정상 종료 코드를 반환할 수 있습니다. 정기 실행은 미리보기 없이 XLSX를 생성하며, 이 경로의 정상 종료와 재열기 검증을 별도로 확인했습니다. 진단용 PNG 생성의 종료 상태를 정기 수집의 성공으로 오인하지 마세요.

일부 서비스에 접근 실패가 있는 실행은 PARTIAL로 보관합니다. 코드가 추가됐거나 권한이 확대되면 “새로 발견”은 실제 신규 생성이 아닐 수도 있습니다. 생성 시각과 수집 근거를 함께 보세요.

참고: [OCI Search 범위](https://docs.oracle.com/en-us/iaas/Content/Search/Concepts/queryoverview.htm), [브라우저 저장 공간](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Block Volume 성능 기본값](https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/blockvolumeperformance.htm).
