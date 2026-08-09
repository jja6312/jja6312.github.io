import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'

interface LearningNoteModalProps {
  sheetTitle: string
  initialText: string
  onSave: (text: string) => void
  onClose: () => void
}

type EditorMode = 'rich' | 'markdown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
})

turndown.addRule('taskCheckbox', {
  filter: node => node.nodeName === 'INPUT' && (node as HTMLInputElement).type === 'checkbox',
  replacement: (_content, node) => (node as HTMLInputElement).checked ? '[x] ' : '[ ] ',
})

turndown.addRule('notionTask', {
  filter: node => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('notion-task'),
  replacement: content => `\n- ${content.trim()}\n`,
})

function safeMarkdown(markdown: string) {
  const parsed = marked.parse(markdown, { async: false }) as string
  const doc = new DOMParser().parseFromString(parsed, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,form').forEach(element => element.remove())
  doc.body.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('on') || attribute.name === 'style') element.removeAttribute(attribute.name)
      if ((attribute.name === 'href' || attribute.name === 'src') && /^(?:javascript|data):/i.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => {
    input.removeAttribute('disabled')
    input.setAttribute('contenteditable', 'false')
    input.dataset.checked = input.checked ? 'true' : 'false'
  })
  return doc.body.innerHTML
}

const slashCommands = [
  { label: '본문', description: '일반 텍스트', command: 'formatBlock', value: 'div' },
  { label: '큰 제목', description: '문서의 큰 구분', command: 'formatBlock', value: 'h1' },
  { label: '제목', description: '내용 구분', command: 'formatBlock', value: 'h2' },
  { label: '글머리 목록', description: '순서 없는 목록', command: 'insertUnorderedList' },
  { label: '할 일', description: '체크할 수 있는 항목', command: 'todo' },
  { label: '인용', description: '중요 문장 강조', command: 'formatBlock', value: 'blockquote' },
  { label: '코드 블록', description: '명령과 코드 기록', command: 'formatBlock', value: 'pre' },
] as const

export default function LearningNoteModal({ sheetTitle, initialText, onSave, onClose }: LearningNoteModalProps) {
  const startingText = initialText
  const [text, setText] = useState(startingText)
  const [savedText, setSavedText] = useState(startingText)
  const [hasSaved, setHasSaved] = useState(Boolean(initialText))
  const [mode, setMode] = useState<EditorMode>('rich')
  const [slashOpen, setSlashOpen] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dirty = text !== savedText

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    if (mode === 'rich' && editorRef.current) {
      editorRef.current.innerHTML = safeMarkdown(text)
      window.setTimeout(() => editorRef.current?.focus(), 0)
    } else if (mode === 'markdown') {
      window.setTimeout(() => textareaRef.current?.focus(), 0)
    }
  // Rich HTML is refreshed only when entering rich mode so typing never loses its caret.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (!dirty) return
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeClose)
    return () => window.removeEventListener('beforeunload', warnBeforeClose)
  }, [dirty])

  const markdownFromEditor = () => {
    const html = editorRef.current?.innerHTML ?? ''
    const markdown = turndown.turndown(html)
      .replace(/[\u200B\uFEFF]/g, '')
      .replace(/^-\s+\[([ xX])\]\s+/gm, '- [$1] ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return markdown
  }

  const syncFromEditor = () => setText(markdownFromEditor())

  const save = () => {
    const next = (mode === 'rich' ? markdownFromEditor() : text).trim()
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

  const removeSlashTrigger = () => {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    const offset = selection?.anchorOffset ?? 0
    if (!selection || !node || node.nodeType !== Node.TEXT_NODE || offset < 1 || node.textContent?.[offset - 1] !== '/') return
    const range = document.createRange()
    range.setStart(node, offset - 1)
    range.setEnd(node, offset)
    range.deleteContents()
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const insertTodoBlock = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount) return

    const task = document.createElement('div')
    task.className = 'notion-task'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.contentEditable = 'false'
    checkbox.dataset.checked = 'false'
    task.append(checkbox, document.createTextNode(' 할 일'))
    const nextBlock = document.createElement('p')
    const caretMarker = document.createTextNode('\uFEFF')
    nextBlock.append(caretMarker)

    const anchor = selection.anchorNode
    let block = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor as HTMLElement | null
    while (block?.parentElement && block.parentElement !== editor) block = block.parentElement
    if (block && block.parentElement === editor) block.after(task, nextBlock)
    else editor.append(task, nextBlock)

    const range = document.createRange()
    range.setStart(caretMarker, caretMarker.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    if (slashOpen) removeSlashTrigger()
    if (command === 'todo') {
      insertTodoBlock()
    } else {
      document.execCommand(command, false, value)
    }
    setSlashOpen(false)
    syncFromEditor()
  }

  const switchMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return
    if (mode === 'rich') setText(markdownFromEditor())
    setSlashOpen(false)
    setMode(nextMode)
  }

  return (
    <div className="learning-note notion-note" role="dialog" aria-modal="true" aria-labelledby="learning-note-title"
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
        else if (event.key === 'Escape' && !slashOpen) { event.preventDefault(); close() }
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

      <div className="notion-toolbar" aria-label="문서 서식">
        {mode === 'rich' && <div className="notion-format-tools">
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'div')}>본문</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'h2')}>제목</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('bold')}><b>B</b></button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('italic')}><i>I</i></button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')}>목록</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('todo')}>☐ 할 일</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'blockquote')}>인용</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'pre')}>코드</button>
        </div>}
        <span className="notion-slash-hint">문단 첫 칸에 <kbd>/</kbd> 입력</span>
        <div className="notion-mode-tabs" role="tablist" aria-label="편집 방식">
          <button type="button" role="tab" aria-selected={mode === 'rich'} className={mode === 'rich' ? 'on' : ''} onClick={() => switchMode('rich')}>문서</button>
          <button type="button" role="tab" aria-selected={mode === 'markdown'} className={mode === 'markdown' ? 'on' : ''} onClick={() => switchMode('markdown')}>Markdown</button>
        </div>
      </div>

      <main className="notion-workspace">
        {mode === 'rich' ? (
          <div className="notion-page-wrap">
            <div
              ref={editorRef}
              className="notion-editor"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="학습 문서 메모"
              data-placeholder="내용을 입력하세요. '/'를 누르면 블록을 선택할 수 있습니다."
              onInput={syncFromEditor}
              onClick={event => {
                const input = event.target as HTMLInputElement
                if (!input.matches('input[type="checkbox"]')) return
                event.preventDefault()
                const nextChecked = input.dataset.checked !== 'true'
                input.dataset.checked = nextChecked ? 'true' : 'false'
                window.setTimeout(() => {
                  input.checked = nextChecked
                  if (nextChecked) input.setAttribute('checked', '')
                  else input.removeAttribute('checked')
                  syncFromEditor()
                }, 0)
              }}
              onKeyDown={event => {
                if (event.key === 'Escape' && slashOpen) {
                  event.preventDefault()
                  event.stopPropagation()
                  setSlashOpen(false)
                  return
                }
                if (event.key === '/') {
                  const selection = window.getSelection()
                  const prefix = selection?.anchorNode?.textContent?.slice(0, selection.anchorOffset).replace(/[\u200B\uFEFF]/g, '') ?? ''
                  if (!prefix.trim()) window.setTimeout(() => setSlashOpen(true), 0)
                } else if (slashOpen && ['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                  event.preventDefault()
                }
              }}
            />
            {slashOpen && (
              <div className="notion-slash-menu" role="menu" aria-label="블록 선택">
                <div className="notion-slash-title">기본 블록</div>
                {slashCommands.map(item => (
                  <button type="button" role="menuitem" key={item.label}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => runCommand(item.command, 'value' in item ? item.value : undefined)}>
                    <strong>{item.label}</strong><span>{item.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="notion-markdown-wrap">
            <textarea
              ref={textareaRef}
              className="notion-markdown-editor"
              value={text}
              aria-label="Markdown 원문"
              spellCheck={false}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Tab') {
                  event.preventDefault()
                  const area = event.currentTarget
                  const start = area.selectionStart
                  const end = area.selectionEnd
                  const next = `${text.slice(0, start)}  ${text.slice(end)}`
                  setText(next)
                  window.requestAnimationFrame(() => area.setSelectionRange(start + 2, start + 2))
                }
              }}
            />
          </div>
        )}
      </main>
    </div>
  )
}
