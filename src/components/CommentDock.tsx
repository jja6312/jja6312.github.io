import { useEffect, useMemo, useRef, useState } from 'react'
import { useHub } from '../store'
import type { Comment } from '../types'

const anchors = ['전체', 'c1', 'c2', 'c3', 's1', 's2', 's3', 's4', 's5']

interface CommentDockProps {
  sheetId: string
  sheetTitle: string
}

// 하단 챗 입력바 + 우측 댓글 패널. 학습 메모도 특수 댓글로 함께 보관한다.
export default function CommentDock({ sheetId, sheetTitle }: CommentDockProps) {
  const { comments, cmtOpen, setCmtOpen, addComment, cmtTarget, setCmtTarget, showToast } = useHub()
  const [text, setText] = useState('')
  const noteWindowRef = useRef<Window | null>(null)

  const sheetComments = useMemo(
    () => comments.filter(c => !c.sheet || c.sheet === sheetId),
    [comments, sheetId],
  )
  const latestNote = useMemo(() => sheetComments
    .filter(c => c.kind === 'note' && c.sheet === sheetId)
    .sort((a, b) => Date.parse(b.updated || b.created) - Date.parse(a.updated || a.created))[0],
  [sheetComments, sheetId])

  const openNote = (note?: Comment) => {
    const target = note ?? latestNote
    setCmtOpen(false)
    if (noteWindowRef.current && !noteWindowRef.current.closed) {
      noteWindowRef.current.focus()
      return
    }

    const params = new URLSearchParams({ sheet: sheetId, title: sheetTitle })
    if (target?.id) params.set('note', target.id)
    const popupWidth = Math.min(1500, Math.max(320, window.screen.availWidth - 120))
    const popupHeight = Math.min(1000, Math.max(560, window.screen.availHeight - 100))
    const left = Math.max(0, Math.round((window.screen.availWidth - popupWidth) / 2))
    const top = Math.max(0, Math.round((window.screen.availHeight - popupHeight) / 2))
    const popup = window.open(
      `${window.location.origin}${window.location.pathname}#/learning-note?${params.toString()}`,
      `learning-note-${sheetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    )
    if (!popup) {
      showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요.')
      setCmtOpen(true)
      return
    }
    noteWindowRef.current = popup
    popup.focus()
  }

  useEffect(() => {
    const open = () => openNote()
    window.addEventListener('open-learning-note', open)
    return () => window.removeEventListener('open-learning-note', open)
  })

  const submit = () => {
    if (!text.trim()) return
    addComment(cmtTarget, text.trim(), sheetId, sheetTitle)
    setText('')
  }
  const jump = (anchor: string) => {
    const el = document.getElementById(anchor === '전체' ? 'c1' : anchor)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      <div className="chatbar">
        <select className="tgt" value={cmtTarget} onChange={e => setCmtTarget(e.target.value)}>
          {anchors.map(a => <option key={a} value={a}>{a === '전체' ? '전체' : `#${a}`}</option>)}
        </select>
        <input
          id="cmt-input"
          value={text} onChange={e => setText(e.target.value)}
          placeholder="배운 것 / 느낀 것을 댓글로 남기기…"
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" className="note-launch" onClick={() => openNote()} title="학습 메모 새 창 열기 (gg)">메모 <kbd>gg</kbd></button>
        <button type="button" className="send" onClick={submit} title="댓글 등록">↑</button>
      </div>

      <div className={`cmt-panel${cmtOpen ? ' open' : ''}`}>
        <div className="cmt-hd">
          <span className="px">COMMENTS</span> 댓글 <b>{sheetComments.length}</b>
          <button type="button" className="close" onClick={() => setCmtOpen(false)}>✕</button>
        </div>
        <div className="cmt-list">
          {sheetComments.length === 0 && (
            <div className="cmt-empty">아직 댓글이 없습니다.<br /><kbd>gg</kbd>를 눌러 학습 메모를<br />작성할 수도 있습니다.</div>
          )}
          {sheetComments.map(c => c.kind === 'note' ? (
            <button type="button" key={c.id} className="cmt-item cmt-note-card" onClick={() => openNote(c)}>
              <div className="meta">
                <span className="note-badge px">MARKDOWN NOTE</span>
                <span className="time">{new Date(c.updated || c.created).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <strong>{c.sheetTitle || sheetTitle}</strong>
              <span className="note-excerpt">{c.text.replace(/\s+/g, ' ').trim()}</span>
              <span className="note-reopen">눌러서 새 창으로 열기 →</span>
            </button>
          ) : (
            <div key={c.id} className="cmt-item">
              <div className="meta">
                <span className="tgt" onClick={() => jump(c.anchor)}>{c.anchor === '전체' ? '전체' : `#${c.anchor}`}</span>
                <span className="time">{new Date(c.created).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="cmt-text">{c.text}</div>
            </div>
          ))}
        </div>
      </div>

    </>
  )
}
