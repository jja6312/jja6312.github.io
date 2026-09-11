import { useEffect, useMemo, useRef, useState } from 'react'

// 테마 맞춤 캘린더 팝오버 — 브라우저 기본 type="date" 대신 월 그리드로 시각 선택.
// 값은 ISO(yyyy-mm-dd) 문자열. 빈 문자열이면 미선택. clearable 이면 지우기 허용.
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function DatePicker({ value, onChange, disabled, clearable, placeholder = '날짜 선택', className }: {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const b = value ? new Date(value + 'T00:00:00') : new Date()
    return { y: b.getFullYear(), m: b.getMonth() }
  })
  const wrapRef = useRef<HTMLDivElement>(null)

  // 열 때마다 선택값(없으면 오늘)의 달로 뷰를 맞춘다.
  useEffect(() => {
    if (!open) return
    const b = value ? new Date(value + 'T00:00:00') : new Date()
    setView({ y: b.getFullYear(), m: b.getMonth() })
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true) }
  }, [open])

  const todayStr = isoOf(new Date())
  const cells = useMemo(() => {
    const startDow = new Date(view.y, view.m, 1).getDay()
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const out: (string | null)[] = []
    for (let i = 0; i < startDow; i += 1) out.push(null)
    for (let d = 1; d <= daysInMonth; d += 1) out.push(isoOf(new Date(view.y, view.m, d)))
    return out
  }, [view])

  const shiftMonth = (delta: number) =>
    setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const commit = (iso: string) => { onChange(iso); setOpen(false) }

  return (
    <div className={'datepicker' + (className ? ' ' + className : '')} ref={wrapRef}>
      <button type="button" className="cli-input datepicker-trigger" disabled={disabled}
        onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={value ? '' : 'ph'}>{value ? value.replaceAll('-', '.') : placeholder}</span>
        <span className="datepicker-ico" aria-hidden="true">📅</span>
      </button>
      {open && (
        <div className="datepicker-pop" role="dialog" aria-label="날짜 선택">
          <div className="datepicker-nav">
            <button type="button" className="iconbtn" onClick={() => shiftMonth(-1)} aria-label="이전 달">‹</button>
            <b>{view.y}. {String(view.m + 1).padStart(2, '0')}</b>
            <button type="button" className="iconbtn" onClick={() => shiftMonth(1)} aria-label="다음 달">›</button>
          </div>
          <div className="datepicker-grid datepicker-dow" aria-hidden="true">
            {WEEKDAYS.map((w, i) => <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}
          </div>
          <div className="datepicker-grid">
            {cells.map((iso, i) => iso === null
              ? <span key={'e' + i} className="datepicker-empty" />
              : <button type="button" key={iso}
                  className={'datepicker-day' + (iso === value ? ' sel' : '') + (iso === todayStr ? ' today' : '')}
                  aria-current={iso === todayStr ? 'date' : undefined}
                  onClick={() => commit(iso)}>{Number(iso.slice(8))}</button>)}
          </div>
          <div className="datepicker-foot">
            <button type="button" className="cal-today" onClick={() => commit(todayStr)}>오늘</button>
            {clearable && value && <button type="button" className="datepicker-clear" onClick={() => commit('')}>지우기</button>}
          </div>
        </div>
      )}
    </div>
  )
}
