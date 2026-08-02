import { useEffect, useState } from 'react'
import { useHub } from '../store'

export function Toast() {
  const toast = useHub(s => s.toast)
  return <div className={`toast${toast ? ' show' : ''}`}>{toast ?? ''}</div>
}

export function LevelFx() {
  const count = useHub(s => s.levelFx)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (count === 0) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 950)
    return () => clearTimeout(t)
  }, [count])
  if (!visible) return null
  return <div className="lvfx"><div className="box px">★ LEVEL UP! ★</div></div>
}

export function HelpOverlay() {
  const { helpOpen, setHelpOpen } = useHub()
  if (!helpOpen) return null
  return (
    <div className="overlay" onClick={() => setHelpOpen(false)}>
      <div className="helpcard" onClick={e => e.stopPropagation()}>
        <h3 className="px">⌨ 단축키</h3>
        <div className="krow"><span>커맨드 팔레트</span><span><kbd>Ctrl</kbd> <kbd>K</kbd></span></div>
        <div className="krow"><span>다크/라이트 토글</span><kbd>d</kbd></div>
        <div className="krow"><span>댓글 패널 토글</span><kbd>c</kbd></div>
        <div className="krow"><span>다음/이전 단계</span><span><kbd>j</kbd> <kbd>k</kbd></span></div>
        <div className="krow"><span>이동: 학습 / 복습 / TODO</span><span><kbd>g</kbd>+<kbd>l</kbd> / <kbd>g</kbd>+<kbd>r</kbd> / <kbd>g</kbd>+<kbd>t</kbd></span></div>
        <div className="krow"><span>이 가이드</span><span><kbd>?</kbd> <kbd>Esc</kbd></span></div>
      </div>
    </div>
  )
}
