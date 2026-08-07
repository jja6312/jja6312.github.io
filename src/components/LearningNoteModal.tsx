import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'

interface LearningNoteModalProps {
  sheetTitle: string
  initialText: string
  onSave: (text: string) => void
  onClose: () => void
}

const starter = (title: string) => `# ${title}\n\n## 핵심 개념\n\n- \n\n## 실습 메모\n\n- [ ] \n\n## 질문·추가 확인\n\n- \n`

function safeMarkdown(markdown: string) {
  const parsed = marked.parse(markdown, { async: false }) as string
  const doc = new DOMParser().parseFromString(parsed, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,form').forEach(el => el.remove())
  doc.body.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'style') el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'src') && /^(?:javascript|data):/i.test(attr.value.trim())) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}

export default function LearningNoteModal({ sheetTitle, initialText, onSave, onClose }: LearningNoteModalProps) {
  const startingText = initialText || starter(sheetTitle)
  const [text, setText] = useState(startingText)
  const [savedText, setSavedText] = useState(startingText)
  const [hasSaved, setHasSaved] = useState(Boolean(initialText))
  const [mobilePane, setMobilePane] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preview = useMemo(() => safeMarkdown(text), [text])
  const dirty = text !== savedText

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => textareaRef.current?.focus(), 0)
    return () => { document.body.style.overflow = previous }
  }, [])

  const save = () => {
    const next = text.trim()
    if (!next) return
    onSave(next)
    setText(next)
    setSavedText(next)
    setHasSaved(true)
  }

  const close = () => {
    if (dirty && !window.confirm('저장하지 않은 메모가 있습니다. 닫을까요?')) return
    onClose()
  }

  const insert = (before: string, after = '', placeholder = '') => {
    const area = textareaRef.current
    if (!area) return
    const start = area.selectionStart
    const end = area.selectionEnd
    const selected = text.slice(start, end) || placeholder
    const next = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`
    setText(next)
    window.requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  return (
    <div className="learning-note" role="dialog" aria-modal="true" aria-labelledby="learning-note-title"
      onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
        else if (e.key === 'Escape') { e.preventDefault(); close() }
      }}>
      <header className="learning-note-head">
        <div className="learning-note-heading">
          <span className="px">LEARNING NOTE</span>
          <h2 id="learning-note-title">{sheetTitle}</h2>
        </div>
        <div className="learning-note-status" aria-live="polite">
          {dirty ? '저장되지 않은 변경' : hasSaved ? '댓글에 저장됨' : '새 메모'} · {text.length.toLocaleString()}자
        </div>
        <div className="learning-note-actions">
          <button type="button" className="note-secondary" onClick={close}>닫기 <kbd>Esc</kbd></button>
          <button type="button" className="note-save" onClick={save} disabled={!text.trim()}>댓글에 저장 <kbd>Ctrl S</kbd></button>
        </div>
      </header>

      <div className="learning-note-toolbar" aria-label="마크다운 서식">
        <button type="button" onClick={() => insert('## ', '', '제목')}>H2</button>
        <button type="button" onClick={() => insert('**', '**', '강조')}>굵게</button>
        <button type="button" onClick={() => insert('`', '`', '코드')}>코드</button>
        <button type="button" onClick={() => insert('- ', '', '항목')}>목록</button>
        <button type="button" onClick={() => insert('- [ ] ', '', '할 일')}>체크</button>
        <span className="learning-note-hint"><kbd>gg</kbd>로 열기 · 마크다운 자동 미리보기</span>
        <div className="learning-note-mobile-tabs">
          <button type="button" className={mobilePane === 'write' ? 'on' : ''} onClick={() => setMobilePane('write')}>작성</button>
          <button type="button" className={mobilePane === 'preview' ? 'on' : ''} onClick={() => setMobilePane('preview')}>미리보기</button>
        </div>
      </div>

      <div className="learning-note-workspace">
        <section className={`learning-note-pane editor${mobilePane === 'write' ? ' mobile-active' : ''}`}>
          <div className="learning-note-pane-title px">MARKDOWN</div>
          <textarea
            ref={textareaRef}
            value={text}
            aria-label="학습 마크다운 메모"
            spellCheck={false}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Tab') {
                e.preventDefault()
                insert('  ')
              }
            }}
          />
        </section>
        <section className={`learning-note-pane preview${mobilePane === 'preview' ? ' mobile-active' : ''}`}>
          <div className="learning-note-pane-title px">PREVIEW</div>
          <article className="learning-note-rendered" dangerouslySetInnerHTML={{ __html: preview }} />
        </section>
      </div>
    </div>
  )
}
