import { useState } from 'react'
import { useHub } from '../store'

const anchors = ['전체', 'c1', 'c2', 'c3', 's1', 's2', 's3', 's4', 's5']

// 하단 챗 입력바 + 우측 댓글 패널 (v3: 주석 아님, 댓글)
export default function CommentDock() {
  const { comments, cmtOpen, setCmtOpen, addComment, cmtTarget, setCmtTarget } = useHub()
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    addComment(cmtTarget, text.trim())
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
          {anchors.map(a => <option key={a} value={a}>{a === '전체' ? '📄 전체' : `#${a}`}</option>)}
        </select>
        <input
          id="cmt-input"
          value={text} onChange={e => setText(e.target.value)}
          placeholder="배운 것 / 느낀 것을 댓글로 남기기…"
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <button className="send" onClick={submit} title="댓글 등록">↑</button>
      </div>

      <div className={`cmt-panel${cmtOpen ? ' open' : ''}`}>
        <div className="cmt-hd">
          <span className="px">COMMENTS</span> 댓글 <b>{comments.length}</b>
          <button className="close" onClick={() => setCmtOpen(false)}>✕</button>
        </div>
        <div className="cmt-list">
          {comments.length === 0 && (
            <div className="cmt-empty">아직 댓글이 없습니다.<br />아래 입력바에 댓글을 쓰면<br />이 패널에 쌓입니다.</div>
          )}
          {comments.map(c => (
            <div key={c.id} className="cmt-item">
              <div className="meta">
                <span className="tgt" onClick={() => jump(c.anchor)}>{c.anchor === '전체' ? '📄 전체' : `#${c.anchor}`}</span>
                <span className="time">{new Date(c.created).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {c.text}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
