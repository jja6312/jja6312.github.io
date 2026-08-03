import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHub } from '../store'
import { getPat, getFile, putFile, explainGhError } from '../lib/githubDb'
import { PROFILE, CERT_GROUPS, UPCOMING, ROADMAP } from '../data/profile'

/* ─────────── 달력 (blog-db profile/calendar.json 동기화) ───────────
   일정을 클릭한 날짜에 붙이고, 3초 debounce 후 commit — TODO 보드와 동일 패턴.
   카테고리별 색으로 "학습 방향"과 "일정"을 한눈에 구분. */

type Cat = 'study' | 'cert' | 'plan' | 'milestone'
interface CalEvent { id: string; text: string; cat: Cat }
type CalData = Record<string, CalEvent[]>   // 'YYYY-MM-DD' → events

const CATS: { id: Cat; label: string; color: string }[] = [
  { id: 'study', label: '학습', color: 'var(--accent)' },
  { id: 'cert', label: '자격증', color: 'var(--pixel)' },
  { id: 'plan', label: '일정', color: 'var(--text-dim)' },
  { id: 'milestone', label: '이정표', color: 'var(--pixel2)' },
]
const catColor = (c: Cat) => CATS.find(x => x.id === c)?.color ?? 'var(--text-dim)'

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

type Sync = 'loading' | 'synced' | 'dirty' | 'saving' | 'error' | 'local'
const syncLabel: Record<Sync, string> = {
  loading: '불러오는 중…', synced: '✓ 동기화됨', dirty: '● 변경됨 (3초 후 commit)',
  saving: '↑ commit 중…', error: '⚠ 저장 실패', local: '로컬 저장 (PAT 등록 시 기기 간 동기화)',
}

const LS_KEY = 'hub-calendar'
const loadLocal = (): CalData => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function Calendar() {
  const pat = getPat()
  const { showToast } = useHub()
  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [data, setData] = useState<CalData>(loadLocal)   // 로컬 우선 즉시 표시
  const [sync, setSync] = useState<Sync>(pat ? 'loading' : 'local')
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [cat, setCat] = useState<Cat>('study')
  const shaRef = useRef<string | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  // PAT 있으면 blog-db(정본)로 덮어쓰고 로컬 캐시 갱신 — 없으면 로컬만 사용
  useEffect(() => {
    if (!pat) { setSync('local'); return }
    getFile(pat, 'profile/calendar.json').then(f => {
      if (f) {
        shaRef.current = f.sha
        try { const d = JSON.parse(f.content); setData(d); localStorage.setItem(LS_KEY, f.content) } catch { /* keep local */ }
      }
      setSync('synced')
    }).catch(() => setSync('error'))
  }, [pat])

  const save = useCallback(async () => {
    setSync('saving')
    const body = JSON.stringify(dataRef.current, null, 2) + '\n'
    try {
      shaRef.current = await putFile(pat, 'profile/calendar.json', body, 'profile: 달력 갱신', shaRef.current)
      setSync('synced')
    } catch {
      try {
        const f = await getFile(pat, 'profile/calendar.json')
        shaRef.current = await putFile(pat, 'profile/calendar.json', body, 'profile: 달력 갱신', f?.sha)
        setSync('synced')
      } catch (e) { setSync('error'); showToast(`저장 실패: ${explainGhError(e)}`) }
    }
  }, [pat, showToast])

  // 로컬은 항상 즉시 저장, blog-db는 PAT 있을 때만 3초 debounce commit
  const markDirty = useCallback((next: CalData) => {
    setData(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next, null, 2) + '\n')
    if (!pat) { setSync('local'); return }
    setSync('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(save, 3000)
  }, [pat, save])

  const addEvent = () => {
    if (!sel || !draft.trim()) return
    const ev: CalEvent = { id: `ev-${Date.now()}`, text: draft.trim(), cat }
    markDirty({ ...data, [sel]: [...(data[sel] ?? []), ev] })
    setDraft('')
  }
  const removeEvent = (date: string, id: string) => {
    const rest = (data[date] ?? []).filter(e => e.id !== id)
    const next = { ...data }
    if (rest.length) next[date] = rest; else delete next[date]
    markDirty(next)
  }

  // 달력 셀 — 앞 공백 + 실제 일자
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay()
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const arr: (number | null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) arr.push(d)
    return arr
  }, [cursor])

  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate())
  const move = (delta: number) => {
    const m = cursor.m + delta
    setCursor({ y: cursor.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 })
    setSel(null)
  }

  const selEvents = sel ? (data[sel] ?? []) : []

  return (
    <section className="prof-sec">
      <div className="prof-h2-row">
        <h2 className="prof-h2">학습 달력</h2>
        <span className="px" style={{
          fontSize: 11, color: sync === 'synced' ? 'var(--accent)' : sync === 'error' ? 'var(--wrong)' : 'var(--partial)',
        }}>{syncLabel[sync]}</span>
      </div>
      <p className="prof-desc">
        날짜를 눌러 학습·자격증·일정·이정표를 붙인다. 로컬에 즉시 저장되고,
        PAT 등록 시 blog-db <code className="mono">profile/calendar.json</code> 로 기기 간 동기화. 카테고리 색으로 방향을 한눈에.
      </p>

      <div className="cal-top">
        <div className="cal-nav">
          <button className="iconbtn" onClick={() => move(-1)} title="이전 달">‹</button>
          <b className="px">{cursor.y}년 {cursor.m + 1}월</b>
          <button className="iconbtn" onClick={() => move(1)} title="다음 달">›</button>
          <button className="cal-today" onClick={() => { setCursor({ y: today.getFullYear(), m: today.getMonth() }); setSel(todayIso) }}>오늘</button>
        </div>
        <div className="cal-legend">
          {CATS.map(c => (
            <span key={c.id} className="cal-lg"><i style={{ background: c.color }} />{c.label}</span>
          ))}
        </div>
      </div>

      <div className="cal-grid">
        {WEEK.map((w, i) => (
          <div key={w} className={`cal-wk${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="cal-cell empty" />
          const date = iso(cursor.y, cursor.m, d)
          const evs = data[date] ?? []
          return (
            <div key={date}
              className={`cal-cell${date === todayIso ? ' today' : ''}${date === sel ? ' sel' : ''}`}
              onClick={() => setSel(date === sel ? null : date)}>
              <span className="cal-d">{d}</span>
              <div className="cal-dots">
                {evs.slice(0, 4).map(e => <i key={e.id} style={{ background: catColor(e.cat) }} />)}
              </div>
            </div>
          )
        })}
      </div>

      {sel && (
        <div className="cal-editor">
          <div className="cal-ed-hd">
            <b className="px">{sel.replace(/-/g, '.')}</b>
            <button className="iconbtn" onClick={() => setSel(null)} title="닫기">✕</button>
          </div>
          {selEvents.length === 0 && <div className="cmt-empty" style={{ padding: '10px 0', fontSize: 13 }}>등록된 일정 없음</div>}
          {selEvents.map(e => (
            <div key={e.id} className="cal-ev">
              <i style={{ background: catColor(e.cat) }} />
              <span style={{ flex: 1 }}>{e.text}</span>
              <span className="px" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{CATS.find(c => c.id === e.cat)?.label}</span>
              <button className="kdel" onClick={() => removeEvent(sel, e.id)} title="삭제">✕</button>
            </div>
          ))}
          <div className="cal-add">
            <div className="cal-cats">
              {CATS.map(c => (
                <button key={c.id} className={`cal-cat${cat === c.id ? ' on' : ''}`}
                  style={cat === c.id ? { borderColor: c.color, color: c.color } : undefined}
                  onClick={() => setCat(c.id)}>{c.label}</button>
              ))}
            </div>
            <input className="cmdinput" style={{ fontFamily: 'Pretendard', fontSize: 14, padding: '8px 12px' }}
              placeholder="+ 일정·학습 내용" value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addEvent() }} />
          </div>
        </div>
      )}
    </section>
  )
}

/* ─────────── 방향성 · 자격증 (정적 쇼케이스) ─────────── */

function Roadmap() {
  return (
    <section className="prof-sec">
      <h2 className="prof-h2">커리어 방향성 · 이정표</h2>
      <p className="prof-desc">OCI 깊이를 축으로, 멀티클라우드·IaC·네트워크·쿠버네티스로 아키텍트를 향한 궤도.</p>

      <div className="road">
        {ROADMAP.map(h => (
          <div key={h.span} className="road-col">
            <div className="road-span px">{h.span} 후</div>
            <ul>{h.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        ))}
      </div>

      <h3 className="prof-h3">취득 예정 · 학습 로드맵</h3>
      <div className="up-list">
        {UPCOMING.map(u => (
          <div key={u.label} className={`up-item ${u.status}`}>
            <span className="up-dot" />
            <b>{u.label}</b>
            <span className="up-when px">{u.when}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Certs() {
  const total = CERT_GROUPS.reduce((n, g) => n + g.certs.length, 0)
  return (
    <section className="prof-sec">
      <div className="prof-h2-row">
        <h2 className="prof-h2">보유 자격증</h2>
        <span className="chip goal">{total}개</span>
      </div>
      <p className="prof-desc">영역별 분류 — 클라우드 CSP 전방위 + 국가기술자격 기반.</p>

      {CERT_GROUPS.map(g => (
        <div key={g.domain} className="cert-grp">
          <div className="cert-dom px">{g.domain}</div>
          <div className="cert-list">
            {g.certs.map(c => (
              <div key={c.name} className="cert-card">
                <b>{c.name}</b>
                <div className="cert-meta">
                  <span>{c.issued} 취득{c.expires ? ` · ~${c.expires}` : ''}</span>
                  {c.id && <code className="mono cert-id">{c.id}</code>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export default function ProfilePage() {
  return (
    <div className="prof-wrap">
      <header className="prof-hero">
        <div className="crumb"><span className="px">PROFILE</span></div>
        <h1 className="sheet-h1">{PROFILE.name}</h1>
        <div className="prof-role">{PROFILE.role}</div>
        <div className="prof-sub">{PROFILE.company} · {PROFILE.since}</div>
        <p className="prof-tag">{PROFILE.tagline}</p>
        <a className="prof-gh" href={PROFILE.github} target="_blank" rel="noreferrer">{PROFILE.github.replace('https://', '')}</a>
      </header>

      <Calendar />
      <Roadmap />
      <Certs />
    </div>
  )
}
