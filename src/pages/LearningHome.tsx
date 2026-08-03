import { Link } from 'react-router-dom'
import { curricula, sheets } from '../data'
import { useHub } from '../store'
import type { Curriculum } from '../types'

function SprintCard({ cur }: { cur: Curriculum }) {
  const { steps, completedSheets } = useHub()
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="course-hd" style={{ padding: '16px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{cur.title}</b>
          <span className="chip">난이도 {'★'.repeat(cur.difficulty)}{'☆'.repeat(3 - cur.difficulty)}</span>
          <span className="chip px" style={{ fontSize: 10 }}>SPRINT</span>
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
              <div style={{ color: exists ? 'var(--text)' : undefined, fontSize: 13.5 }}>{d.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.goal}</div>
            </div>
            <span className="px" style={{ fontSize: 10, color: done ? 'var(--accent)' : started ? 'var(--pixel)' : 'var(--text-faint)' }}>
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
          <b style={{ fontSize: 16 }}>{cur.title}</b>
          <span className="chip">난이도 {'★'.repeat(cur.difficulty)}{'☆'.repeat(3 - cur.difficulty)}</span>
          <span className="chip px" style={{ fontSize: 10, borderColor: 'var(--pixel)', color: 'var(--pixel)' }}>CATEGORY</span>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>{cur.description}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, padding: '14px 20px 18px' }}>
        {cur.topics?.map(t => {
          const planned = t.status === 'planned' || !sheets[t.sheet]
          const done = completedSheets.includes(t.sheet)
          const started = Object.keys(steps).some(k => k.startsWith(`${t.sheet}:`))
          const box = (
            <div className="topic-box" style={{
              border: `1px solid ${done ? 'var(--accent-dim)' : 'var(--line-soft)'}`,
              borderRadius: 12, padding: '14px 16px', height: '100%',
              background: done ? 'var(--accent-glow)' : 'var(--bg-inset)',
              opacity: planned ? .55 : 1,
            }}>
              <span className="px" style={{ fontSize: 9, color: planned ? 'var(--text-faint)' : done ? 'var(--accent)' : 'var(--pixel)' }}>
                {planned ? '🔒 예정' : done ? '✓ 완료' : started ? '진행중' : `${t.estimated_minutes}m`}
              </span>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: planned ? 'var(--text-dim)' : 'var(--text)', margin: '6px 0 4px' }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t.goal}</div>
            </div>
          )
          return planned
            ? <div key={t.topic}>{box}</div>
            : <Link key={t.topic} to={`/learning/${cur.id}/${t.sheet}`} style={{ textDecoration: 'none' }}>{box}</Link>
        })}
      </div>
    </div>
  )
}

export default function LearningHome() {
  const sprints = curricula.filter(c => (c.mode ?? 'sprint') === 'sprint')
  const categories = curricula.filter(c => c.mode === 'category')

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">LEARNING</span></div>
      <h1 className="sheet-h1">학습</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 13.5, margin: '8px 0 28px' }}>
        학습지 = 개념 → 시나리오 실습 → 채점 3단.
        Claude Code에 "OOO 학습지 만들어줘"라고 하면 여기에 추가된다.
      </p>

      {sprints.length > 0 && <>
        <div className="side-title px" style={{ marginBottom: 10 }}>SPRINT — 일정을 정해 순서대로</div>
        {sprints.map(c => <SprintCard key={c.id} cur={c} />)}
      </>}

      {categories.length > 0 && <>
        <div className="side-title px" style={{ margin: '26px 0 10px' }}>CATEGORY — 주제를 골라 자유롭게</div>
        {categories.map(c => <CategoryCard key={c.id} cur={c} />)}
      </>}
    </div>
  )
}
