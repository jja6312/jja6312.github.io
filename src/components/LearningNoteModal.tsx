import { useEffect, useRef, useState, type CSSProperties, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'

interface LearningNoteModalProps {
  sheetTitle: string
  initialText: string
  onSave: (text: string) => void
  onClose: () => void
}

type EditorMode = 'rich' | 'markdown'

const NOTE_SCALE_MIN = 0.75
const NOTE_SCALE_MAX = 1.75
const NOTE_SCALE_STEP = 0.1
const NOTE_SCALE_KEY = 'learning-note-scale'
const IMAGE_MAX_INPUT_BYTES = 15 * 1024 * 1024
const IMAGE_TARGET_DATA_LENGTH = 850_000

const clampNoteScale = (value: number) => Math.min(NOTE_SCALE_MAX, Math.max(NOTE_SCALE_MIN, value))

function initialNoteScale() {
  const stored = Number(localStorage.getItem(NOTE_SCALE_KEY))
  return Number.isFinite(stored) ? clampNoteScale(stored) : 1
}

async function imageFileToDataUrl(file: File) {
  if (file.size > IMAGE_MAX_INPUT_BYTES) throw new Error('15MB 이하 이미지만 붙여넣을 수 있습니다.')
  const bitmap = await createImageBitmap(file)
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    const firstScale = Math.min(1, 1600 / longest)
    let width = Math.max(1, Math.round(bitmap.width * firstScale))
    let height = Math.max(1, Math.round(bitmap.height * firstScale))

    const encode = (targetWidth: number, targetHeight: number, quality: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('이미지 처리 화면을 만들 수 없습니다.')
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
      return canvas.toDataURL('image/webp', quality)
    }

    let dataUrl = encode(width, height, .82)
    if (dataUrl.length > IMAGE_TARGET_DATA_LENGTH) {
      const reduction = Math.min(.9, Math.sqrt(IMAGE_TARGET_DATA_LENGTH / dataUrl.length))
      width = Math.max(1, Math.round(width * reduction))
      height = Math.max(1, Math.round(height * reduction))
      dataUrl = encode(width, height, .72)
    }
    return dataUrl
  } finally {
    bitmap.close()
  }
}

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
      if (attribute.name === 'href' || attribute.name === 'src') {
        const value = attribute.value.trim()
        const safePastedImage = attribute.name === 'src' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)
        if (/^javascript:/i.test(value) || (/^data:/i.test(value) && !safePastedImage)) element.removeAttribute(attribute.name)
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
  const [noteScale, setNoteScale] = useState(initialNoteScale)
  const [imageStatus, setImageStatus] = useState('')
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

  useEffect(() => {
    localStorage.setItem(NOTE_SCALE_KEY, String(noteScale))
  }, [noteScale])

  const markdownFromEditor = () => {
    const html = editorRef.current?.innerHTML ?? ''
    const markdown = turndown.turndown(html)
      .replace(/[\u200B\uFEFF]/g, '')
      .replace(/^([*-])\s{2,}/gm, '$1 ')
      .replace(/^-\s+\[([ xX])\]\s+/gm, '- [$1] ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return markdown
  }

  const syncFromEditor = () => setText(markdownFromEditor())

  const adjustNoteScale = (direction: number) => {
    setNoteScale(current => Math.round(clampNoteScale(current + direction * NOTE_SCALE_STEP) * 100) / 100)
  }

  const clipboardImage = (event: ReactClipboardEvent<HTMLElement>) => {
    const item = [...event.clipboardData.items].find(entry => entry.kind === 'file' && entry.type.startsWith('image/'))
    return item?.getAsFile() ?? null
  }

  const reportImageError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '이미지를 붙여넣지 못했습니다.'
    setImageStatus(message)
    window.setTimeout(() => setImageStatus(''), 4500)
  }

  const pasteImageInRichEditor = async (event: ReactClipboardEvent<HTMLDivElement>) => {
    const file = clipboardImage(event)
    if (!file) return
    event.preventDefault()
    const editor = editorRef.current
    const selection = window.getSelection()
    const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    setImageStatus('이미지 처리 중…')
    try {
      const dataUrl = await imageFileToDataUrl(file)
      if (!editor) return
      const range = savedRange && editor.contains(savedRange.commonAncestorContainer)
        ? savedRange
        : document.createRange()
      if (!savedRange || !editor.contains(range.commonAncestorContainer)) range.selectNodeContents(editor)
      if (!savedRange || !editor.contains(savedRange.commonAncestorContainer)) range.collapse(false)

      const image = document.createElement('img')
      image.src = dataUrl
      image.alt = file.name ? `붙여넣은 이미지: ${file.name}` : '붙여넣은 이미지'
      range.deleteContents()
      range.insertNode(image)
      range.setStartAfter(image)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      syncFromEditor()
      setImageStatus('이미지 추가됨')
      window.setTimeout(() => setImageStatus(''), 1800)
    } catch (error) {
      reportImageError(error)
    }
  }

  const pasteImageInMarkdown = async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const file = clipboardImage(event)
    if (!file) return
    event.preventDefault()
    const area = event.currentTarget
    const start = area.selectionStart
    const end = area.selectionEnd
    setImageStatus('이미지 처리 중…')
    try {
      const dataUrl = await imageFileToDataUrl(file)
      const alt = file.name ? `붙여넣은 이미지: ${file.name}` : '붙여넣은 이미지'
      const markdown = `![${alt.replaceAll('[', '').replaceAll(']', '')}](${dataUrl})`
      setText(current => `${current.slice(0, start)}${markdown}${current.slice(end)}`)
      window.requestAnimationFrame(() => area.setSelectionRange(start + markdown.length, start + markdown.length))
      setImageStatus('이미지 추가됨')
      window.setTimeout(() => setImageStatus(''), 1800)
    } catch (error) {
      reportImageError(error)
    }
  }

  const applyMarkdownShortcut = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return false
    const editor = editorRef.current
    const selection = window.getSelection()
    const node = selection?.anchorNode
    const offset = selection?.anchorOffset ?? 0
    if (!editor || !selection || !node || node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return false
    const prefix = node.textContent?.slice(0, offset) ?? ''
    const isList = prefix === '-' || prefix === '*'
    const isHeading = /^#{1,3}$/.test(prefix)
    if (!isList && !isHeading) return false

    let block = node.parentElement
    while (block && block !== editor && block.parentElement !== editor) block = block.parentElement
    const isDirectText = block === editor
    if ((!isDirectText && block?.textContent !== prefix) || (isDirectText && node.textContent !== prefix)) return false

    event.preventDefault()
    const nextSibling = isDirectText ? node.nextSibling : block?.nextSibling ?? null
    const marker = document.createTextNode('\uFEFF')
    const replacement = isList
      ? document.createElement('ul')
      : document.createElement(`h${prefix.length}`)
    const caretHost = isList ? document.createElement('li') : replacement
    caretHost.append(marker)
    if (isList) replacement.append(caretHost)

    if (isDirectText) {
      node.parentNode?.removeChild(node)
      editor.insertBefore(replacement, nextSibling)
    } else {
      block?.replaceWith(replacement)
    }

    const range = document.createRange()
    range.setStart(marker, marker.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    syncFromEditor()
    return true
  }

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
      style={{
        '--note-font-size': `${15 * noteScale}px`,
        '--note-h1-size': `${29 * noteScale}px`,
        '--note-h2-size': `${21 * noteScale}px`,
        '--note-h3-size': `${17 * noteScale}px`,
        '--note-code-size': `${13 * noteScale}px`,
        '--note-markdown-size': `${14 * noteScale}px`,
      } as CSSProperties}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) { event.preventDefault(); adjustNoteScale(1) }
        else if ((event.ctrlKey || event.metaKey) && event.key === '-') { event.preventDefault(); adjustNoteScale(-1) }
        else if ((event.ctrlKey || event.metaKey) && event.key === '0') { event.preventDefault(); setNoteScale(1) }
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
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
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'h1')}>큰 제목</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'h2')}>제목</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('bold')}><b>B</b></button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('italic')}><i>I</i></button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')}>목록</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('todo')}>☐ 할 일</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'blockquote')}>인용</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'pre')}>코드</button>
        </div>}
        <span className="notion-slash-hint"><kbd>#</kbd> 제목 · <kbd>-</kbd> 목록 · <kbd>/</kbd> 블록</span>
        {imageStatus && <span className="notion-image-status" aria-live="polite">{imageStatus}</span>}
        <div className="notion-scale-tools" aria-label="메모 페이지 크기">
          <button type="button" onClick={() => adjustNoteScale(-1)} disabled={noteScale <= NOTE_SCALE_MIN} aria-label="메모 축소">−</button>
          <button type="button" className="notion-scale-value" onClick={() => setNoteScale(1)} title="100%로 초기화">{Math.round(noteScale * 100)}%</button>
          <button type="button" onClick={() => adjustNoteScale(1)} disabled={noteScale >= NOTE_SCALE_MAX} aria-label="메모 확대">＋</button>
        </div>
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
              data-placeholder="내용을 입력하세요. '# '는 제목, '- '는 목록, '/'는 블록 메뉴입니다."
              onInput={syncFromEditor}
              onPaste={event => { void pasteImageInRichEditor(event) }}
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
                if (applyMarkdownShortcut(event)) return
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
              onPaste={event => { void pasteImageInMarkdown(event) }}
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
