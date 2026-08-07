import { Link, useNavigate, useParams } from 'react-router-dom'
import { curricula, sheets, findCurriculum } from '../data'
import { useHub } from '../store'
import type { Curriculum } from '../types'

function SprintCard({ cur }: { cur: Curriculum }) {
  const { steps, completedSheets } = useHub()
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="course-hd" style={{ padding: '16px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 17.5 }}>{cur.title}</b>
          <span className="chip">난이도 {'★'.repeat(cur.difficulty)}{'☆'.repeat(3 - cur.difficulty)}</span>
          <span className="chip px" style={{ fontSize: 11 }}>SPRINT</span>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>{cur.description}</div>
      </div>
      {cur.days?.map(d => {
        const exists = !!sheets[d.sheet]
        const done = completedSheets.includes(d.sheet)
        const started = Object.keys(steps).some(k => k.startsWith(`${d.sheet}:`))
        const inner = (
          <div className="dayitem" style={{ padding: '12px 20px', ...(exists ? {} : { opacity: .5, cursor: 'default' }) }}>
            <span className="dnum px">D-{String(d.day).padStart(2, '0')}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: exists ? 'var(--text)' : undefined, fontSize: 15 }}>{d.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{d.goal}</div>
            </div>
            <span className="px" style={{ fontSize: 11, color: done ? 'var(--accent)' : started ? 'var(--pixel)' : 'var(--text-faint)' }}>
              {!exists ? '생성 대기' : done ? '✓ 완주' : started ? '진행중' : `${d.estimated_minutes}m`}
            </span>
          </div>
        )
        return exists
          ? <Link key={d.day} to={`/learning/${cur.id}/${d.sheet}`} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
          : <div key={d.day}>{inner}</div>
      })}
    </div>
  )
}

function CategoryCard({ cur }: { cur: Curriculum }) {
  const { completedSheets, steps } = useHub()
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="course-hd" style={{ padding: '16px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 17.5 }}>{cur.title}</b>
          <span className="chip">난이도 {'★'.repeat(cur.difficulty)}{'☆'.repeat(3 - cur.difficulty)}</span>
          <span className="chip px" style={{ fontSize: 11, borderColor: 'var(--pixel)', color: 'var(--pixel)' }}>CATEGORY</span>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>{cur.description}</div>
      </div>
      {[1, 2, 3].map(lv => {
        const topics = cur.topics?.filter(t => (t.level ?? 1) === lv) ?? []
        if (topics.length === 0) return null
        return (
          <div key={lv} style={{ padding: '4px 20px 14px' }}>
            <div className="px" style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: 1, margin: '8px 0 8px' }}>
              LEVEL {lv} <span style={{ color: 'var(--line)' }}>{'─'.repeat(3)}</span> {lv === 1 ? '기본기' : lv === 2 ? '운영 심화' : '아키텍처·거버넌스'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
              {topics.map(t => {
                const planned = t.status === 'planned' || !sheets[t.sheet]
                const done = completedSheets.includes(t.sheet)
                const started = Object.keys(steps).some(k => k.startsWith(`${t.sheet}:`))
                const box = (
                  <div style={{
                    border: `1px solid ${done ? 'var(--accent-dim)' : 'var(--line-soft)'}`,
                    borderRadius: 12, padding: '14px 16px', height: '100%',
                    background: done ? 'var(--accent-glow)' : 'var(--bg-inset)',
                    opacity: planned ? .55 : 1,
                  }}>
                    <span className="px" style={{ fontSize: 10, color: planned ? 'var(--text-faint)' : done ? 'var(--accent)' : 'var(--pixel)' }}>
                      {planned ? '예정' : done ? '완료' : started ? '진행중' : `${t.estimated_minutes}m`}
                    </span>
                    <div style={{ fontSize: 15, fontWeight: 600, color: planned ? 'var(--text-dim)' : 'var(--text)', margin: '6px 0 4px' }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t.goal}</div>
                  </div>
                )
                return planned
                  ? <div key={t.topic}>{box}</div>
                  : <Link key={t.topic} to={`/learning/${cur.id}/${t.sheet}`} style={{ textDecoration: 'none' }}>{box}</Link>
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 진행 중인 학습지 — 최근 학습 순 (스프린트·주제별 구분 없이)
function RecentSection() {
  const { lastActivity, steps, completedSheets } = useHub()

  const recent = Object.entries(lastActivity)
    .sort((a, b) => b[1] - a[1])
    .map(([sheetId]) => sheets[sheetId])
    .filter(Boolean)
    .slice(0, 4)

  if (recent.length === 0) return null

  const when = (ts: number) => {
    const m = Math.floor((Date.now() - ts) / 60000)
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
  }

  return (
    <div style={{ marginBottom: 30 }}>
      <div className="side-title px" style={{ marginBottom: 10 }}>이어서 학습</div>
      {recent.map(sh => {
        const total = sh.concepts.length + (sh.lab?.steps.length ?? 0) + sh.scenarios.length
        const done = Object.keys(steps).filter(k => k.startsWith(`${sh.sheet}:`) && steps[k]).length
        const cur = findCurriculum(sh.curriculum)
        const finished = completedSheets.includes(sh.sheet)
        return (
          <Link key={sh.sheet} to={`/learning/${sh.curriculum}/${sh.sheet}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="recent-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 2 }}>
                  {cur?.title} · {sh.day ? `Day ${sh.day}` : sh.topic}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{sh.title}</div>
                <div className="labbar" style={{ margin: '8px 0 0', height: 6 }}>
                  <div className="f" style={{ width: `${(done / total) * 100}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="px" style={{ fontSize: 12, color: finished ? 'var(--accent)' : 'var(--pixel)' }}>
                  {finished ? '완주' : `${done}/${total}`}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>
                  {when(lastActivity[sh.sheet])}
                </div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// 서브탭 — ALL(기본) / 스프린트 / 주제별 / 복습
const MODES = [
  { id: 'all', label: 'ALL', hint: '최근 학습한 것부터, 전체 커리큘럼' },
  { id: 'sprint', label: '스프린트', hint: '일정을 정해 순서대로' },
  { id: 'category', label: '주제별', hint: '주제를 골라 자유롭게' },
] as const

export default function LearningHome() {
  const nav = useNavigate()
  const { section } = useParams()
  const active = MODES.find(m => m.id === section)?.id ?? 'all'
  const sprints = curricula.filter(c => (c.mode ?? 'sprint') === 'sprint')
  const categories = curricula.filter(c => c.mode === 'category')
  const mode = MODES.find(m => m.id === active)!

  return (
    <div>
      <div className="ksec">
        {MODES.map(m => (
          <button key={m.id} className={`ksec-btn${active === m.id ? ' on' : ''}`}
            onClick={() => nav(`/learning/${m.id}`)}>{m.label}</button>
        ))}
        <button className="ksec-btn" onClick={() => nav('/learning/review')}>복습</button>
        <button className="ksec-btn" onClick={() => nav('/learning/request')}>생성 요청</button>
      </div>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
        <div className="crumb"><span className="px">LEARNING</span> / {mode.label}</div>
        <h1 className="sheet-h1">학습{active === 'all' ? '' : ` — ${mode.label}`}</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 15, margin: '8px 0 28px' }}>
          {mode.hint}. 학습지 = 개념 → 실전 구축 → 시나리오 → 채점.
          Claude Code에 "OOO 학습지 만들어줘"라고 하면 여기에 추가된다.
        </p>

        {active === 'all' && <>
          <RecentSection />
          {/* 전체 커리큘럼은 접힌 드롭다운 — ALL 은 이어서 학습(최근) 빠른 접근이 주목적 */}
          {sprints.length > 0 && (
            <details className="learn-acc">
              <summary>스프린트 <span>{sprints.length}</span></summary>
              <div className="learn-acc-body">{sprints.map(c => <SprintCard key={c.id} cur={c} />)}</div>
            </details>
          )}
          {categories.length > 0 && (
            <details className="learn-acc">
              <summary>주제별 <span>{categories.length}</span></summary>
              <div className="learn-acc-body">{categories.map(c => <CategoryCard key={c.id} cur={c} />)}</div>
            </details>
          )}
        </>}

        {active === 'sprint' && (sprints.length > 0
          ? sprints.map(c => <SprintCard key={c.id} cur={c} />)
          : <div className="cmt-empty">스프린트 커리큘럼이 없습니다.</div>)}

        {active === 'category' && (categories.length > 0
          ? categories.map(c => <CategoryCard key={c.id} cur={c} />)
          : <div className="cmt-empty">카테고리 커리큘럼이 없습니다.</div>)}
      </div>
    </div>
  )
}
