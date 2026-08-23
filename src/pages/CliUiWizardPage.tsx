import { useProtectedData } from '../lib/protectedData'

// CLI UI Wizard — 드래그앤드롭 아키텍처 캔버스 → 런타임 CliBlueprint → 블루프린트 엔진(plan/apply/verify).
// (스캐폴드: 컴파일러 코어/캔버스는 후속 커밋에서 채운다. 설계: CLI_UI_WIZARD_DESIGN.md)
export default function CliUiWizardPage() {
  const protectedState = useProtectedData()
  if (!protectedState.data) return (
    <div className="cli-main">
      <div className="cmt-empty">{protectedState.loading ? '보호된 데이터를 복호화하는 중…' : protectedState.error}</div>
    </div>
  )
  return (
    <div className="cli-main">
      <div className="cmt-empty">CLI UI Wizard — 준비 중 (아키텍처를 드래그앤드롭으로 그려 OCI CLI 를 생성)</div>
    </div>
  )
}
