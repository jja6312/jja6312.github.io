import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../store'

interface Cmd { id: string; label: string; kbd?: string; run: () => void }

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, toggleTheme, setCmtOpen, setHelpOpen, cmtOpen } = useHub()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const cmds: Cmd[] = useMemo(() => [
    { id: 'learning', label: '학습으로 이동', kbd: 'g l', run: () => nav('/learning') },
    { id: 'sheet', label: '리눅스 기본 Day 1 열기', run: () => nav('/learning/linux-basics/day01-boot-and-systemd') },
    { id: 'review', label: '복습 퀴즈 시작', kbd: 'g r', run: () => nav('/review') },
    { id: 'feedback', label: '피드백 남기기', kbd: 'g f', run: () => nav('/feedback') },
    { id: 'cloudguard', label: 'OCI 보안 — Cloud Guard 열기', run: () => nav('/learning/oci-security/cloud-guard') },
    { id: 'todo', label: 'TODO로 이동', kbd: 'g d', run: () => nav('/todo') },
    { id: 'ts', label: '지식모음 — 트러블슈팅', kbd: 'g s', run: () => nav('/knowledge/troubleshooting') },
    { id: 'ann', label: '지식모음 — Announcement', kbd: 'g a', run: () => nav('/knowledge/announcements') },
    { id: 'cli', label: '지식모음 — OCI CLI 레시피', kbd: 'g c', run: () => nav('/knowledge/oci-cli') },
    { id: 'tf', label: '지식모음 — Terraform', kbd: 'g t', run: () => nav('/knowledge/terraform') },
    { id: 'quote', label: '지식모음 — 견적', kbd: 'g q', run: () => nav('/knowledge/quote') },
    { id: 'meetings', label: '지식모음 — 회의록', kbd: 'g m', run: () => nav('/knowledge/meetings') },
    { id: 'profile', label: '프로필로 이동', kbd: 'g p', run: () => nav('/profile') },
    { id: 'theme', label: '다크/라이트 토글', kbd: 'd', run: toggleTheme },
    { id: 'comments', label: '댓글 패널 토글', kbd: 'c', run: () => setCmtOpen(!cmtOpen) },
    { id: 'help', label: '단축키 가이드', kbd: '?', run: () => setHelpOpen(true) },
  ], [nav, toggleTheme, setCmtOpen, setHelpOpen, cmtOpen])

  const filtered = cmds.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))

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
