import { useNavigate, useParams } from 'react-router-dom'
import TroubleshootingPage from './TroubleshootingPage'
import AnnouncementsPage from './AnnouncementsPage'
import KnowledgeDocsPage from './KnowledgeDocsPage'
import CliBuilderPage from './CliBuilderPage'
import CliUiWizardPage from './CliUiWizardPage'
import OciPolicyPage from './OciPolicyPage'
import OciGrammarPage from './OciGrammarPage'
import QuotePage from './QuotePage'
import MeetingsPage from './MeetingsPage'
import ProvisioningPage from './ProvisioningPage'
import SupportHistoryPage from './SupportHistoryPage'
import Locks from '../components/Locks'
import LockedNotice from '../components/LockedNotice'
import { requiredLevel } from '../lib/auth'
import { useHub } from '../store'

// 지식모음 — 쌓이는 지식·도구 계열. 자물쇠 레벨은 auth.LOCKS 에서 파생.
const SECTIONS = [
  { id: 'oci-cli', label: 'OCI CLI', kbd: 'g c' },
  { id: 'cli-wizard', label: 'CLI UI Wizard', kbd: 'g w' },
  { id: 'oci-policy', label: 'OCI Policy', kbd: 'g i' },
  { id: 'oci-grammar', label: 'OCI Grammar', kbd: 'g u' },
  { id: 'terraform', label: 'Terraform', kbd: 'g t' },
  { id: 'troubleshooting', label: '트러블슈팅', kbd: 'g s' },
  { id: 'support-history', label: '지원이력', kbd: 'g h', locked: true },
  { id: 'quote', label: '견적', kbd: 'g q', locked: true },
  { id: 'provisioning', label: '프로비저닝 관리', kbd: 'g v', locked: true },
  { id: 'meetings', label: '회의록', kbd: 'g m', locked: true },
  { id: 'announcements', label: 'Announcement', kbd: 'g a', locked: true },
] as const

export default function KnowledgePage() {
  const nav = useNavigate()
  const { section } = useParams()
  const { authLevel, openAuth } = useHub()
  const active = SECTIONS.find(s => s.id === section)?.id ?? 'oci-cli'
  const activeLevel = requiredLevel(`/knowledge/${active}`)
  const locked = activeLevel > authLevel

  return (
    <div>
      <div className="ksec">
        {SECTIONS.map(s => {
          const lv = requiredLevel(`/knowledge/${s.id}`)
          return (
            <button key={s.id} className={`ksec-btn${active === s.id ? ' on' : ''}`}
              onClick={() => { if (lv > authLevel) openAuth(lv); else nav(`/knowledge/${s.id}`) }}>
              {s.label}<Locks level={lv} authLevel={authLevel} />
              {s.kbd && <> <span className="px" style={{ fontSize: 10, opacity: .7 }}>{s.kbd}</span></>}
            </button>
          )
        })}
      </div>
      {locked ? (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
          <LockedNotice level={activeLevel} authLevel={authLevel} onLogin={() => openAuth(activeLevel)} />
        </div>
      ) : <>
        {active === 'troubleshooting' && <TroubleshootingPage />}
        {active === 'support-history' && <SupportHistoryPage />}
        {active === 'announcements' && <AnnouncementsPage />}
        {active === 'oci-cli' && <CliBuilderPage />}
        {active === 'cli-wizard' && <CliUiWizardPage />}
        {active === 'oci-policy' && <OciPolicyPage />}
        {active === 'oci-grammar' && <OciGrammarPage />}
        {active === 'terraform' && (
          <KnowledgeDocsPage crumb="TERRAFORM" title="OCI Terraform" badge="TF"
            desc="모듈 라이브러리 사용법 — 플레이북·모듈 카탈로그·apply 함정 모음."
            path="knowledge/terraform" />
        )}
        {active === 'quote' && <QuotePage />}
        {active === 'provisioning' && <ProvisioningPage />}
        {active === 'meetings' && <MeetingsPage />}
      </>}
    </div>
  )
}
