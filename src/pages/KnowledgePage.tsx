import { useNavigate, useParams } from 'react-router-dom'
import TroubleshootingPage from './TroubleshootingPage'
import AnnouncementsPage from './AnnouncementsPage'

// 지식모음 — 쌓이는 지식 계열(트러블슈팅·OCI공지)을 한 메뉴로 묶는다
const SECTIONS = [
  { id: 'troubleshooting', label: '트러블슈팅', kbd: 'g s' },
  { id: 'announcements', label: 'OCI공지', kbd: 'g a' },
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
            {s.label} <span className="px" style={{ fontSize: 9, opacity: .7 }}>{s.kbd}</span>
          </button>
        ))}
      </div>
      {active === 'troubleshooting' ? <TroubleshootingPage /> : <AnnouncementsPage />}
    </div>
  )
}
