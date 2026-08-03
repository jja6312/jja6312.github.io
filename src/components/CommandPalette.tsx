import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../store'

interface Cmd { id: string; ico: string; label: string; kbd?: string; run: () => void }

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, toggleTheme, setCmtOpen, setHelpOpen, cmtOpen } = useHub()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const cmds: Cmd[] = useMemo(() => [
    { id: 'learning', ico: '📚', label: '학습으로 이동', kbd: 'g l', run: () => nav('/learning') },
    { id: 'sheet', ico: '📝', label: '리눅스 기본 Day 1 열기', run: () => nav('/learning/linux-basics/day01-boot-and-systemd') },
    { id: 'review', ico: '🔁', label: '복습 퀴즈 시작', kbd: 'g r', run: () => nav('/review') },
    { id: 'feedback', ico: '📮', label: '피드백 남기기', kbd: 'g f', run: () => nav('/feedback') },
    { id: 'cloudguard', ico: '🛡', label: 'OCI 보안 — Cloud Guard 열기', run: () => nav('/learning/oci-security/cloud-guard') },
    { id: 'todo', ico: '🗂', label: 'TODO로 이동', kbd: 'g t', run: () => nav('/todo') },
    { id: 'ts', ico: '🔧', label: '트러블슈팅으로 이동', run: () => nav('/troubleshooting') },
    { id: 'meetings', ico: '🎙', label: '회의록으로 이동', run: () => nav('/meetings') },
    { id: 'theme', ico: '◐', label: '다크/라이트 토글', kbd: 'd', run: toggleTheme },
    { id: 'comments', ico: '💬', label: '댓글 패널 토글', kbd: 'c', run: () => setCmtOpen(!cmtOpen) },
    { id: 'help', ico: '⌨', label: '단축키 가이드', kbd: '?', run: () => setHelpOpen(true) },
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
              <span className="ico">{c.ico}</span>{c.label}
              {c.kbd && <kbd>{c.kbd}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
