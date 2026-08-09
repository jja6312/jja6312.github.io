import { AI_GOALS } from '../../data/aiGoals'
import {
  useSyncedJson, SYNC_LABEL, GOAL_COLORS, EMPTY_GOALS,
  type GoalsFile, type Goal,
} from '../../lib/scheduleDb'
import { useHub } from '../../store'

export default function AiGoalsView() {
  const { showToast } = useHub()
  const { data, update, sync, writable } = useSyncedJson<GoalsFile>('schedule/goals.json', EMPTY_GOALS, 'goals: 목표 갱신')
  const g = AI_GOALS

  // 추천 항목을 실제 '목표' 탭에 추가 (중복은 제목으로 방지)
  const addGoal = (title: string, deadline: string) => {
    if (!writable) { showToast('목표 추가는 PAT 등록 후 가능'); return }
    if (data.goals.some(x => x.title === title)) { showToast('이미 목표에 있음'); return }
    const goal: Goal = {
      id: `goal-${Date.now()}`, title, deadline,
      color: GOAL_COLORS[data.goals.length % GOAL_COLORS.length], createdAt: new Date().toISOString(),
    }
    update({ ...data, goals: [...data.goals, goal] })
    showToast(`목표에 추가됨 — ${title}`)
  }

  const empty = g.longTerm.pillars.length === 0

  return (
    <div>
      <div className="sched-head">
        <h1 className="sheet-h1">AI 추천 목표</h1>
        <span className="px sched-sync">{SYNC_LABEL[sync]}</span>
      </div>
      <p className="prof-desc">
        indivisual 학습기록(커리어 자기진단 · OCI 심화 · OS/네트워크 · 시장)을 분석해 설계한 3년 · 1년 · 4개월 목표. 기준 {g.asOf}.
      </p>

      {empty ? (
        <div className="cmt-empty" style={{ padding: '40px 0' }}>분석 결과 준비 중입니다.</div>
      ) : (
        <>
          {/* 진단 */}
          <section className="ai-diag">
            <div className="ai-diag-lv px">진단 · {g.diagnosis.level}</div>
            <p className="ai-diag-summary">{g.diagnosis.summary}</p>
            <div className="ai-diag-cols">
              <div>
                <div className="ai-col-h px">강점</div>
                <ul className="ai-list good">{g.diagnosis.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="ai-col-h px">보완할 갭</div>
                <ul className="ai-list gap">{g.diagnosis.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </section>

          {/* 3년 장기 */}
          <section className="ai-hz">
            <div className="ai-hz-head"><span className="ai-hz-badge long">3년</span><b>{g.longTerm.horizon}</b><span className="ai-hz-headline">{g.longTerm.headline}</span></div>
            <div className="ai-pillars">
              {g.longTerm.pillars.map((p, i) => (
                <div key={i} className="ai-pillar">
                  <b>{p.name}</b>
                  <p>{p.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 1년 */}
          <section className="ai-hz">
            <div className="ai-hz-head"><span className="ai-hz-badge mid">1년</span><b>{g.midTerm.horizon}</b><span className="ai-hz-headline">{g.midTerm.headline}</span></div>
            <div className="ai-goal-cards">
              {g.midTerm.goals.map((goal, i) => (
                <div key={i} className="ai-goal-card">
                  <div className="ai-goal-top">
                    <b>{goal.title}</b>
                    {writable && <button className="ai-add" onClick={() => addGoal(goal.title, '')} title="목표 탭에 추가">＋ 목표</button>}
                  </div>
                  <p className="ai-goal-why">{goal.rationale}</p>
                  <div className="ai-goal-metric px">지표 · {goal.metric}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 4개월 세부 */}
          <section className="ai-hz">
            <div className="ai-hz-head"><span className="ai-hz-badge short">4개월</span><b>{g.shortTerm.horizon}</b><span className="ai-hz-headline">{g.shortTerm.headline}</span></div>
            <div className="ai-months">
              {g.shortTerm.milestones.map((m, i) => (
                <div key={i} className="ai-month">
                  <div className="ai-month-head">
                    <span className="ai-month-period px">{m.period}</span>
                    <b>{m.focus}</b>
                    {writable && <button className="ai-add" onClick={() => addGoal(`[${m.period}] ${m.focus}`, '')} title="목표 탭에 추가">＋ 목표</button>}
                  </div>
                  <ul className="ai-actions">{m.actions.map((a, k) => <li key={k}>{a}</li>)}</ul>
                  <div className="ai-month-outcome px">완료 기준 · {m.outcome}</div>
                </div>
              ))}
            </div>
          </section>

          <p className="prof-desc" style={{ marginTop: 20, fontSize: 12 }}>
            ＋ 목표 버튼으로 이 추천을 <b>목표</b> 탭에 담아 진척을 추적할 수 있습니다. 추천은 참고용이며, 실제 목표는 직접 조정하세요.
          </p>
        </>
      )}
    </div>
  )
}
