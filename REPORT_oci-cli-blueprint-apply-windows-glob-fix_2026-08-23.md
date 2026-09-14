# OCI CLI Blueprint Apply 실패 — 원인·수정 보고 (2026-08-23)

## 1. 증상

`network-baseline-2tier` blueprint Apply 실행 중 **VCN·IGW·NAT 3개는 정상 생성**된 뒤,
4번째(**Service Gateway**) 생성에서 아래로 죽음:

```
re.error: bad character range l-1 at position 44
── 중단: 부분 run-result 를 출력합니다 ──   ← (설계된 부분 flush 는 정상 동작)
```

트레이스백 경로:
```
click/utils.py:581  _expand_args
 → glob.py:21 glob → _iglob → _glob1
 → fnmatch.py filter → _compile_pattern
 → re.compile → sre_parse → re.error: bad character range l-1
```

## 2. 근본 원인 — Windows OCI CLI(Click)의 인자 glob 확장

- OCI CLI 는 Click 기반. Click 은 **Windows 에서 셸이 glob 을 못 한다고 가정**하고,
  실행 시 `_expand_args()` 로 **모든 인자를 스스로 glob 확장**한다.
- glob 은 `*` `?` `[` 를 magic 으로 본다. **JSON 배열 인자는 `[` 로 시작**하므로
  Click 이 이를 glob 문자클래스로 해석한다.
- Service Gateway 의 `--services '[{"serviceId":"ocid1.service.oc1.ap-seoul-1.…"}]'` 는
  `[…]` 안에 region 문자열 **`ap-seoul-1`** 을 포함 → `…seou`**`l-1`**`…` 이
  문자클래스 역범위(`l`=108 > `1`=49)가 되어 **`bad character range`**.
- 사용자의 oci CLI 는 **Python 3.8.5** 프리즈 번들(`C:\Users\opc\cli-local-3`).
  3.8 의 `re` 는 역범위를 예외로 던진다(3.9+/3.13 은 완화되어 재현 안 됨 — 아래 확인).

### 왜 앞의 3개는 성공했나 (일관성 확인)
- **VCN**: `[`-인자는 `--cidr-blocks ["10.0.0.0/16"]` 뿐. OCID 가 없어 `-` 역범위가 없음 →
  glob 이 매칭 0건으로 원본 유지 → 성공.
- **IGW·NAT**: `[`-로 시작하는 JSON 배열 인자 자체가 없음(`--freeform-tags` 는 `{` 시작 → glob magic 아님) → 성공.
- **SGW(4번째)**: `--services` 에서 처음으로 `[` + OCID(`ap-seoul-1`) 동시 등장 → 폭발.
  → 사용자 로그의 "3개 생성 후 4번째에서 실패" 와 정확히 일치.

### 재현 확인
- Python 3.8 계열: `re.compile(fnmatch.translate('[…ap-seoul-1…]'))` → `bad character range`.
- 로컬 Python 3.13: 완화되어 예외 없음(버전차 확인). 트레이스백이 3.8 경로를 정확히 가리켜 확정.
- 같은 위험이 `--route-rules`, `--security-list-ids`(모두 OCID 포함 배열)에도 존재 →
  SGW 를 넘겼어도 라우트테이블·서브넷에서 재발했을 것.

## 3. 수정 — JSON 배열 인자를 `file://` 임시파일로 전달

인라인으로 `[…]` 를 넘기지 않고, **임시파일에 쓴 뒤 `file://` 로 참조**한다.
이는 복잡 JSON 을 Windows 에서 넘기는 OCI 공식 권장 방식이며 `[` 자체가 인자에서 사라져 glob 이 개입하지 않는다.

수정 파일(site repo):
- `src/lib/oci-cli/blueprintResolve.mjs` — `emitOption()` json 분기:
  `--opt '<json>'` → `jq/printf 로 "$BP_TMP/<VAR>.json" 기록` + `--opt "file://$BP_TMP/<VAR>.json"`.
  (VarRef 인젝션 차단·`--arg` 안전주입은 그대로 유지.)
- `src/lib/oci-cli/blueprintRender.mjs` — `renderApplyLike()`:
  `BP_TMP=".bp-tmp-$RUN_ID"; mkdir -p "$BP_TMP"`(CWD 상대경로 → Windows 경로 변환 문제 회피) +
  EXIT trap 에 `rm -rf "$BP_TMP"` 정리 추가.

수정 후 생성 예:
```bash
jq -nc --arg a0 "$SGW_SERVICE_ID" '[{"serviceId":$a0}]' > "$BP_TMP/SERVICE_GATEWAY_SERVICES.json"
oci network service-gateway create … \
  --services "file://$BP_TMP/SERVICE_GATEWAY_SERVICES.json" \
  …
```
`file://.bp-tmp-run-…/….json` 인자에는 `[ * ?` 가 없어 Click 이 glob 확장하지 않는다.

적용 대상 옵션(전부 `file://` 전환): `--cidr-blocks · --route-rules · --ingress/egress-security-rules · --services · --security-list-ids · --freeform-tags · --defined-tags`.

## 4. 검증

- `npm run test:blueprint` **51건 통과** — 신규 회귀 테스트 추가:
  "Apply 에 인라인 `[` JSON 인자 없음 + 배열 옵션은 `file://` + BP_TMP 생성/정리".
- 5개 스크립트 `bash -n` 통과. `jq --arg` 파일기록 → 유효 JSON 확인.
  `file://.bp-tmp-…/*.json` 인자에 glob magic(`[ * ?`) 없음 기능 확인.
- `tsc -b` 0 · `oxlint` 0 · `vite build` 성공.
- 정본 digest·planDigest 불변(정의 자체는 안 바뀜) → 기존 계획과 정합.

## 5. 사용자 조치 (배포 후)

1. 사이트 재배포(코드 푸시로 자동)되면 blueprint 워크스페이스가 **수정된 bash 를 생성**한다.
   (blueprint 데이터 재-bake 불필요 — 엔진 코드만 바뀜.)
2. 이미 만들어진 **VCN·IGW·NAT 는 그대로 재사용**하면 된다:
   - APPLY 탭에 방금 받은 **부분 run-result(3개 노드) JSON 을 Import** →
   - **Resume(중단 후 재개)** 스크립트를 생성 → 실행하면 3개는 `get` 으로 건너뛰고
     **Service Gateway 부터 이어서 생성**된다.
3. (선택) 처음부터 다시 하려면: 생성된 3개를 Rollback 스크립트로 정리(소유권 태그+compartment 이중확인) 후 Apply.

## 6. 커밋
- site: `src/lib/oci-cli/blueprintResolve.mjs`, `blueprintRender.mjs`, `scripts/test-blueprint-engine.mjs`, 본 보고서.
