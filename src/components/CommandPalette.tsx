import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../store'
import { useProtectedData } from '../lib/protectedData'

interface Cmd { id: string; label: string; kbd?: string; run: () => void }
interface CliCmd { resource: string; label: string; cmd: string; help: string }

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, toggleTheme, setCmtOpen, setHelpOpen, cmtOpen } = useHub()
  const nav = useNavigate()
  const protectedState = useProtectedData()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const cmds: Cmd[] = useMemo(() => [
    { id: 'learning', label: '학습으로 이동', kbd: 'g l', run: () => nav('/learning') },
    { id: 'review', label: '학습 — 복습 퀴즈', kbd: 'g r', run: () => nav('/learning/review') },
    { id: 'learning-request', label: '학습 — 학습자료 생성 요청', run: () => nav('/learning/request') },
    { id: 'feedback', label: '피드백 남기기', kbd: 'g f', run: () => nav('/feedback') },
    { id: 'cloudguard', label: 'OCI 보안 — Cloud Guard 열기', run: () => nav('/learning/oci-security/cloud-guard') },
    { id: 'sched-cal', label: '일정관리 — 월간일정', kbd: 'g d', run: () => nav('/schedule/calendar') },
    { id: 'sched-tasks', label: '일정관리 — 업무관리', run: () => nav('/schedule/tasks') },
    { id: 'sched-todo', label: '일정관리 — TODO LIST', run: () => nav('/schedule/todo') },
    { id: 'sched-goals', label: '일정관리 — 목표', run: () => nav('/schedule/goals') },
    { id: 'ts', label: '지식모음 — 트러블슈팅', kbd: 'g s', run: () => nav('/knowledge/troubleshooting') },
    { id: 'support-history', label: '지식모음 — 지원이력', kbd: 'g h', run: () => nav('/knowledge/support-history') },
    { id: 'ann', label: '지식모음 — Announcement', kbd: 'g a', run: () => nav('/knowledge/announcements') },
    { id: 'cli', label: '지식모음 — OCI CLI 레시피', kbd: 'g c', run: () => nav('/knowledge/oci-cli') },
    { id: 'tf', label: '지식모음 — Terraform', kbd: 'g t', run: () => nav('/knowledge/terraform') },
    { id: 'quote', label: '지식모음 — 견적', kbd: 'g q', run: () => nav('/knowledge/quote') },
    { id: 'provisioning', label: '지식모음 — 프로비저닝 관리', kbd: 'g v', run: () => nav('/knowledge/provisioning') },
    { id: 'meetings', label: '지식모음 — 회의록', kbd: 'g m', run: () => nav('/knowledge/meetings') },
    { id: 'profile', label: '프로필로 이동', kbd: 'g p', run: () => nav('/profile') },
    { id: 'theme', label: '다크/라이트 토글', kbd: 'd', run: toggleTheme },
    { id: 'comments', label: '댓글 패널 토글', kbd: 'c', run: () => setCmtOpen(!cmtOpen) },
    { id: 'help', label: '단축키 가이드', kbd: '?', run: () => setHelpOpen(true) },
  ], [nav, toggleTheme, setCmtOpen, setHelpOpen, cmtOpen])

  // OCI CLI 자원 — 검색어가 있을 때만 노출 (37개가 기본 목록을 채우지 않도록).
  // label(자원명) + cmd(oci compute …) 둘 다 검색 대상 → "oci compute" 로 찾힌다.
  const cliCmds: Cmd[] = useMemo(() => Object.values(
    (protectedState.data?.cliCatalog as { commands?: Record<string, CliCmd> } | undefined)?.commands ?? {},
  ).map(c => ({
    id: `cli-${c.resource}`,
    label: `OCI CLI · ${c.label} — ${c.cmd}`,
    run: () => nav(`/knowledge/oci-cli?r=${c.resource}`),
  })), [nav, protectedState.data])

  const ql = q.trim().toLowerCase()
  const base = cmds.filter(c => c.label.toLowerCase().includes(ql))
  const cli = ql ? cliCmds.filter(c => c.label.toLowerCase().includes(ql)) : []
  const filtered = [...base, ...cli]

  useEffect(() => {
    if (paletteOpen) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 10) }
  }, [paletteOpen])

  if (!paletteOpen) return null
  const exec = (c: Cmd) => { setPaletteOpen(false); c.run() }

  return (
    <div className="palette" onClick={() => setPaletteOpen(false)}>
      <div className="palette-box" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef} value={q} placeholder="명령 검색…"
          onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
            else if (e.key === 'Enter' && filtered[sel]) exec(filtered[sel])
            else if (e.key === 'Escape') setPaletteOpen(false)
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">일치하는 명령 없음</div>}
          {filtered.map((c, i) => (
            <div key={c.id} className={`palette-item${i === sel ? ' sel' : ''}`}
              onMouseEnter={() => setSel(i)} onClick={() => exec(c)}>
              {c.label}
              {c.kbd && <kbd>{c.kbd}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
