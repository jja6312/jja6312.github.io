const phaseMap: Record<string, { ico: string; title: string; desc: string; phase: string }> = {
  troubleshooting: { ico: '🔧', title: '트러블슈팅', desc: '케이스 기록 + 검색. automation-oci cases/facts 스키마 계승.', phase: 'Phase 4' },
  todo: { ico: '🗂', title: 'TODO', desc: 'Trello식 칸반 — 드래그앤드랍, board.json commit 동기화.', phase: 'Phase 5' },
  meetings: { ico: '🎙', title: '회의록', desc: '녹음/스크립트 업로드 → Claude Code가 정리한 회의록 열람.', phase: 'Phase 6' },
}

export default function Placeholder({ id }: { id: string }) {
  const m = phaseMap[id]
  return (
    <div className="placeholder">
      <div className="big">{m.ico}</div>
      <h2>{m.title}</h2>
      <p style={{ fontSize: 13.5 }}>{m.desc}</p>
      <p className="px" style={{ fontSize: 11, color: 'var(--pixel)', marginTop: 14 }}>{m.phase} — 준비중</p>
    </div>
  )
}
