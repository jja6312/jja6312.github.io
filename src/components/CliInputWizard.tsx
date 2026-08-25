/* eslint-disable react/only-export-components -- this file is the intentionally shared wizard module. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

export type CliWizardRequirement = 'required' | 'optional' | 'conditional'

export type CliWizardQuestion = {
  id: string
  label: string
  type: string
  valueId?: string
  choices?: string[]
  optional?: boolean
  recommended?: boolean
  essential?: boolean
  requirement?: CliWizardRequirement
  help?: string
  placeholder?: string
  meta?: unknown
  isFilled?: (values: Record<string, string>) => boolean
}

export type CliWizardRenderContext = {
  question: CliWizardQuestion
  value: string
  valueId: string
  values: Record<string, string>
  inputClass: string
  assignRef: (element: HTMLElement | null) => void
  setValue: (id: string, value: string) => void
  subValue: (key: string) => string
  setSubValue: (key: string, value: string) => void
  onAdvance: () => void
}

export function isCliWizardRequired(question: CliWizardQuestion) {
  return question.essential || question.requirement === 'required' || question.requirement === 'conditional'
    || (!question.optional && !question.recommended)
}

export function questionHasValue(question: CliWizardQuestion, values: Record<string, string>) {
  if (question.isFilled) return question.isFilled(values)
  const value = String(values[question.valueId ?? question.id] ?? '').trim()
  if (question.type === 'boolean') return value === 'true' || value === 'false'
  return Boolean(value)
}

export function defaultCliWizardControl(context: CliWizardRenderContext): ReactNode {
  const { question, value, valueId, inputClass, assignRef, setValue } = context
  const required = isCliWizardRequired(question)
  if (question.type === 'boolean') {
    return (
      <select ref={assignRef} className={inputClass} value={value} onChange={event => setValue(valueId, event.target.value)}>
        {question.optional || question.recommended ? <option value="">(미설정)</option> : null}
        <option value="true">예</option>
        <option value="false">아니오</option>
      </select>
    )
  }
  if (question.choices?.length) {
    return (
      <select ref={assignRef} className={inputClass}
        value={value || (required ? question.choices[0] : '')}
        onChange={event => setValue(valueId, event.target.value)}>
        {required ? null : <option value="">(선택 안 함)</option>}
        {question.choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    )
  }
  if (question.type === 'json' || question.type === 'stringArray' || question.type === 'multiple') {
    return (
      <textarea ref={assignRef} className={inputClass + ' bp-wizard-textarea'} rows={4}
        value={value} onChange={event => setValue(valueId, event.target.value)}
        placeholder={question.placeholder} />
    )
  }
  return (
    <input ref={assignRef} className={inputClass} value={value}
      placeholder={question.placeholder} onChange={event => setValue(valueId, event.target.value)}
      autoComplete="off" />
  )
}

export function useCliInputWizardShortcut(enabled: boolean, onOpen: () => void) {
  const onOpenRef = useRef(onOpen)
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
  useEffect(() => {
    if (!enabled) return
    const openWizard = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        event.stopPropagation()
        onOpenRef.current()
      }
    }
    window.addEventListener('keydown', openWizard, true)
    return () => window.removeEventListener('keydown', openWizard, true)
  }, [enabled])
}

export default function CliInputWizard({
  questions,
  values,
  setValue,
  onClose,
  title = 'OCI CLI INPUT',
  renderControl = defaultCliWizardControl,
}: {
  questions: CliWizardQuestion[]
  values: Record<string, string>
  setValue: (id: string, value: string) => void
  onClose: () => void
  title?: string
  renderControl?: (context: CliWizardRenderContext) => ReactNode
}) {
  const [index, setIndex] = useState(0)
  const [moving, setMoving] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [completed, setCompleted] = useState<Set<string>>(() => new Set())
  const [requiredOnly, setRequiredOnly] = useState(false)
  const inputRef = useRef<HTMLElement | null>(null)
  const requiredQuestions = useMemo(() => questions.filter(isCliWizardRequired), [questions])
  const visibleQuestions = requiredOnly && requiredQuestions.length > 0 ? requiredQuestions : questions
  const question = visibleQuestions[Math.min(index, Math.max(0, visibleQuestions.length - 1))]
  const valueId = question?.valueId ?? question?.id ?? ''
  const required = !!question && isCliWizardRequired(question)

  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [])
  useEffect(() => {
    if (index >= visibleQuestions.length && visibleQuestions.length) setIndex(visibleQuestions.length - 1)
  }, [index, visibleQuestions.length])
  useEffect(() => {
    if (!moving && question?.type !== 'segments') window.setTimeout(() => inputRef.current?.focus(), 20)
    setBlocked(false)
  }, [question?.id, question?.type, moving])

  const value = question ? (values[valueId] ?? '') : ''
  const filled = question ? questionHasValue(question, values) : false
  const assignRef = (element: HTMLElement | null) => { inputRef.current = element }
  const goTo = (nextIndex: number) => {
    if (moving) return
    setIndex(Math.max(0, Math.min(visibleQuestions.length - 1, nextIndex)))
    setBlocked(false)
  }
  const toggleRequiredOnly = useCallback(() => {
    const nextRequiredOnly = !requiredOnly && requiredQuestions.length > 0
    const nextQuestions = nextRequiredOnly ? requiredQuestions : questions
    const currentIndex = Math.max(0, nextQuestions.findIndex(item => item.id === question?.id))
    setRequiredOnly(nextRequiredOnly)
    setIndex(currentIndex)
    setBlocked(false)
  }, [question?.id, questions, requiredOnly, requiredQuestions])
  const advance = () => {
    if (moving || !question) return
    if (!String(values[valueId] ?? '').trim() && required && question.choices?.[0]) setValue(valueId, question.choices[0])
    if (!filled && required && !(question.choices?.length && required)) {
      setBlocked(true)
      return
    }
    setCompleted(previous => new Set(previous).add(question.id))
    setMoving(true)
    window.setTimeout(() => {
      if (index >= visibleQuestions.length - 1) onClose()
      else { setIndex(current => current + 1); setMoving(false) }
    }, 180)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      event.stopPropagation()
      toggleRequiredOnly()
      return
    }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); return }
    if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); advance(); return }
    if (event.target instanceof HTMLButtonElement) return
    const multiline = question?.type === 'json' || question?.type === 'stringArray' || question?.type === 'multiple'
    if (event.key === 'Enter' && !(event.shiftKey && multiline)) {
      event.preventDefault()
      advance()
    }
  }

  if (!question) return null
  const remaining = Math.max(0, visibleQuestions.length - index - 1)
  const inputClass = 'bp-wizard-input' + (filled ? ' is-filled' : '')
  const context: CliWizardRenderContext = {
    question, value, valueId, values, inputClass, assignRef, setValue,
    subValue: key => values[valueId + '::' + key] ?? '',
    setSubValue: (key, nextValue) => setValue(valueId + '::' + key, nextValue),
    onAdvance: advance,
  }
  const control = renderControl(context)

  return (
    <div className="bp-wizard-overlay cli-input-wizard" role="dialog" aria-modal="true"
      aria-label={title + ' 입력 마법사'} onKeyDownCapture={onKeyDown}>
      <div className="bp-wizard-head">
        <span>{title}</span>
        <button type="button" className={'bp-wizard-mode' + (requiredOnly ? ' required-only' : '')} onClick={toggleRequiredOnly}>
          {requiredOnly ? '필수 입력 모드 · Alt+I 전체 보기' : '전체 입력 · Alt+I 필수만'}
        </button>
        <span>{index + 1} / {visibleQuestions.length} · {remaining}문항 남음</span>
        <button type="button" onClick={onClose}>ESC 닫기</button>
      </div>
      <div className="bp-wizard-body">
        <div className={'bp-wizard-track' + (moving ? ' moving' : '')}>
          <div className="bp-wizard-current" key={question.id}>
            <div className="bp-wizard-question current">
              {question.label}
              <small className={question.essential ? 'essential' : question.recommended ? 'recommended' : required ? 'required' : 'optional'}>
                {question.essential ? '* 공통 필수' : question.recommended ? '권장' : question.requirement === 'conditional' ? '△ 조건부 필수' : required ? '* 필수' : '선택'}
              </small>
              {filled ? <span className="bp-wizard-filled">✓ 입력됨</span> : null}
            </div>
            {question.help ? <p>{question.help}</p> : null}
            {control}
            {blocked ? <div className="bp-wizard-required">필수값을 입력한 뒤 Enter를 누르세요.</div> : null}
            <div className="bp-wizard-actions">
              <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)}>← 이전</button>
              <span className="bp-wizard-hint">Enter 다음 · Alt+I 필수/전체 · Alt+←/→ 이동 · Esc 닫기</span>
              <button type="button" onClick={advance}>{index === visibleQuestions.length - 1 ? '완료' : '다음 →'}</button>
            </div>
          </div>
        </div>
        <nav className="bp-wizard-progress" aria-label="입력 진행 이정표">
          <strong>{remaining}</strong><small>남음</small>
          <div className="bp-wizard-progress-list">
            {visibleQuestions.map((item, step) => {
              const done = completed.has(item.id) || step < index
              const hasValue = questionHasValue(item, values)
              return <button type="button" key={item.id + '-' + step} title={(step + 1) + '. ' + item.label}
                aria-label={(step + 1) + '. ' + item.label}
                aria-current={step === index ? 'step' : undefined}
                className={(done ? 'done ' : '') + (hasValue ? 'filled ' : '') + (step === index ? 'current' : '')}
                onClick={() => goTo(step)}><span /></button>
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
