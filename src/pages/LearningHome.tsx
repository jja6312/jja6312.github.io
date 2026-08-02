import { Link } from 'react-router-dom'
import { linuxBasics } from '../data/linuxBasics'
import { useHub } from '../store'

export default function LearningHome() {
  const { steps, completedSheets } = useHub()

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">LEARNING</span></div>
      <h1 className="sheet-h1">학습</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 13.5, margin: '8px 0 28px' }}>
        커리큘럼 단위로 진행. 학습지 = 개념 → 시나리오 실습 → 채점 3단.
        Claude Code에 "OOO 학습지 만들어줘"라고 하면 여기에 추가된다.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="course-hd" style={{ padding: '16px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <b style={{ fontSize: 16 }}>{linuxBasics.title}</b>
            <span className="chip">난이도 {'★'.repeat(linuxBasics.difficulty)}{'☆'.repeat(3 - linuxBasics.difficulty)}</span>
            <span className="chip">공개</span>
          </div>
          <div className="meta" style={{ marginTop: 6 }}>{linuxBasics.description}</div>
        </div>
        {linuxBasics.days.map(d => {
          const exists = d.sheet === 'day01-boot-and-systemd'
          const done = completedSheets.includes(d.sheet)
          const started = Object.keys(steps).some(k => k.startsWith(`${d.sheet}:`))
          return exists ? (
            <Link key={d.day} to={`/learning/${linuxBasics.id}/${d.sheet}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="dayitem" style={{ padding: '12px 20px' }}>
                <span className="dnum px">D-{String(d.day).padStart(2, '0')}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text)', fontSize: 13.5 }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.goal}</div>
                </div>
                <span className="px" style={{ fontSize: 10, color: done ? 'var(--accent)' : started ? 'var(--pixel)' : 'var(--text-faint)' }}>
                  {done ? '✓ 완주' : started ? '진행중' : `${d.estimated_minutes}m`}
                </span>
              </div>
            </Link>
          ) : (
            <div key={d.day} className="dayitem" style={{ padding: '12px 20px', opacity: .5, cursor: 'default' }}>
              <span className="dnum px">D-{String(d.day).padStart(2, '0')}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>{d.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.goal}</div>
              </div>
              <span className="px" style={{ fontSize: 10, color: 'var(--text-faint)' }}>생성 대기</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
