import { useNavigate, useParams } from 'react-router-dom'
import TroubleshootingPage from './TroubleshootingPage'
import AnnouncementsPage from './AnnouncementsPage'
import KnowledgeDocsPage from './KnowledgeDocsPage'
import QuotePage from './QuotePage'

// 지식모음 — 쌓이는 지식·도구 계열을 한 메뉴로 묶는다
const SECTIONS = [
  { id: 'troubleshooting', label: '트러블슈팅', kbd: 'g s' },
  { id: 'announcements', label: 'OCI공지', kbd: 'g a' },
  { id: 'oci-cli', label: 'OCI CLI', kbd: '' },
  { id: 'terraform', label: 'Terraform', kbd: '' },
  { id: 'quote', label: '견적서 작성', kbd: 'g q' },
] as const

export default function KnowledgePage() {
  const nav = useNavigate()
  const { section } = useParams()
  const active = SECTIONS.find(s => s.id === section)?.id ?? 'troubleshooting'

  return (
    <div>
      <div className="ksec">
        {SECTIONS.map(s => (
          <button key={s.id} className={`ksec-btn${active === s.id ? ' on' : ''}`}
            onClick={() => nav(`/knowledge/${s.id}`)}>
            {s.label}{s.kbd && <> <span className="px" style={{ fontSize: 9, opacity: .7 }}>{s.kbd}</span></>}
          </button>
        ))}
      </div>
      {active === 'troubleshooting' && <TroubleshootingPage />}
      {active === 'announcements' && <AnnouncementsPage />}
      {active === 'oci-cli' && (
        <KnowledgeDocsPage crumb="OCI CLI" title="OCI CLI 레시피" badge="CLI"
          desc="자원 종류별 oci cli 생성 레시피 — required/optional 트리 + 복사 즉시 실행. 추가·갱신은 Claude Code에."
          path="knowledge/oci-cli" />
      )}
      {active === 'terraform' && (
        <KnowledgeDocsPage crumb="TERRAFORM" title="OCI Terraform" badge="TF"
          desc="모듈 라이브러리 사용법 — 플레이북·모듈 카탈로그·apply 함정 모음."
          path="knowledge/terraform" />
      )}
      {active === 'quote' && <QuotePage />}
    </div>
  )
}
