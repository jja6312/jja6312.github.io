import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { findCurriculum, sheets } from '../data'
import { useHub } from '../store'
import type { Scenario, Verdict } from '../types'
import CommentDock from '../components/CommentDock'

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
const tokSort = (s: string) => norm(s).split(' ').sort().join(' ')

function verdictClass(v?: Verdict) {
  return v === 'O' ? ' correct' : v === '△' ? ' partial' : v === 'X' ? ' wrong' : ''
}

const typeLabel: Record<Scenario['type'], string> = { ox: 'OX', choice: '객관식', command: '명령어', essay: '서술형' }

function ScenarioCard({ sheet, scen }: { sheet: string; scen: Scenario }) {
  const { results, answers, setResult, addXP } = useHub()
  const key = `${sheet}:${scen.id}`
  const verdict = results[key]
  const graded = !!verdict
  const [input, setInput] = useState('')
  const [rubricOpen, setRubricOpen] = useState(false)

  const grade = (v: Verdict, submitted: string) => {
    setResult(sheet, scen.id, v, submitted)
    const xp = v === 'O' ? scen.xp : v === '△' ? Math.floor(scen.xp / 2) : 0
    if (xp > 0) addXP(xp)
  }

  const resultBox = (cls: string, verdictText: string, exp: string, ansHtml?: string) => (
    <div className={`result ${cls}`}>
      <div className="verdict px">{verdictText}</div>
      <div className="exp" dangerouslySetInnerHTML={{ __html: exp }} />
      {ansHtml && <div className="ans" dangerouslySetInnerHTML={{ __html: ansHtml }} />}
    </div>
  )

  return (
    <div className={`scen${verdictClass(verdict)}`} id={scen.id}>
      <div className="scen-hd">
        <span className="stype px">{typeLabel[scen.type]}</span>
        <span className="sid px">{scen.id.toUpperCase()} · 개념 #{scen.concept_anchor}</span>
        <span className="sxp px">+{scen.xp} XP</span>
      </div>
      <div className="situ"><b>상황</b>{scen.situation}</div>
      <div className="q">{scen.question}</div>

      {scen.type === 'ox' && (
        <div className="optrow">
          {(['O', 'X'] as const).map(pick => {
            const isAnswer = scen.answers.includes(pick)
            const picked = graded && answers[key] === pick
            const cls = picked ? (isAnswer ? ' sel-right' : ' sel-wrong') : ''
            return (
              <button key={pick} disabled={graded} className={`opt px${cls}`} style={{ fontSize: 17.5, padding: '9px 26px' }}
                onClick={() => grade(isAnswer ? 'O' : 'X', pick)}>{pick}</button>
            )
          })}
        </div>
      )}

      {scen.type === 'choice' && scen.choices && (
        <div className="choicecol">
          {scen.choices.map((c, i) => {
            const n = String(i + 1)
            const isAnswer = scen.answers.includes(n)
            const picked = graded && answers[key] === n
            const revealCorrect = graded && verdict === 'X' && isAnswer
            const cls = picked ? (isAnswer ? ' sel-right' : ' sel-wrong') : revealCorrect ? ' reveal' : ''
            return (
              <button key={n} disabled={graded} className={`opt${cls}`}
                onClick={() => grade(isAnswer ? 'O' : 'X', n)}>
                <span className="mono">{n}</span>&nbsp; {c}
              </button>
            )
          })}
        </div>
      )}

      {scen.type === 'command' && (
        <div className="cmdrow">
          <input className="cmdinput" disabled={graded}
            value={graded ? answers[key] : input}
            placeholder={scen.match === 'normalize-flags' ? '$ 명령어 입력 (플래그 순서 관용)' : '$ 명령어 입력'}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !input.trim()) return
              let ok = scen.answers.some(a => norm(a) === norm(input))
              if (!ok && scen.match === 'normalize-flags') ok = scen.answers.some(a => tokSort(a) === tokSort(input))
              grade(ok ? 'O' : 'X', input)
            }}
          />
          <button className="submitbtn" disabled={graded} onClick={() => {
            if (!input.trim()) return
            let ok = scen.answers.some(a => norm(a) === norm(input))
            if (!ok && scen.match === 'normalize-flags') ok = scen.answers.some(a => tokSort(a) === tokSort(input))
            grade(ok ? 'O' : 'X', input)
          }}>제출</button>
        </div>
      )}

      {scen.type === 'essay' && (
        <>
          <textarea className="cmdinput" disabled={graded || rubricOpen}
            value={graded ? answers[key] : input}
            placeholder="자유 서술 → 제출하면 정답·채점 기준이 공개되고 스스로 채점"
            onChange={e => setInput(e.target.value)} />
          {!rubricOpen && !graded && (
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button className="submitbtn" onClick={() => { if (input.trim()) setRubricOpen(true) }}>제출 → 채점 기준 보기</button>
            </div>
          )}
          {(rubricOpen || graded) && (
            <div style={{ marginTop: 12 }}>
              <div className="rubric-box"><b>채점 기준 (rubric)</b>{scen.rubric}</div>
              <div className="rubric-box"><b>해설</b><span dangerouslySetInnerHTML={{ __html: scen.explanation }} /></div>
              {!graded && (
                <div className="selfgrade">자기 채점:
                  <button className="sgbtn o" onClick={() => grade('O', input)}>O</button>
                  <button className="sgbtn d" onClick={() => grade('△', input)}>△</button>
                  <button className="sgbtn x" onClick={() => grade('X', input)}>X</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {graded && scen.type !== 'essay' && (
        verdict === 'O'
          ? resultBox('ok', `정답 · +${scen.xp} XP`, scen.explanation,
              scen.type === 'command' ? `정답 예: <code>${scen.answers[0]}</code>` : undefined)
          : resultBox('no', scen.type === 'choice' ? `오답 — 정답: ${scen.answers[0]}번` : '오답', scen.explanation,
              scen.type === 'command' ? `정답 예: <code>${scen.answers[0]}</code> <span style="color:var(--text-faint)">(오탐이라 생각되면 이의 → 수동 정정)</span>` : undefined)
      )}
      {graded && scen.type === 'essay' && (
        verdict === 'O' ? resultBox('ok', `자기채점 O · +${scen.xp} XP`, '자기채점 결과와 답안이 attempt 로 기록됩니다 — 복습 모드에서 틀린 것부터 재출제.')
        : verdict === '△' ? resultBox('mid', `자기채점 △ · +${Math.floor(scen.xp / 2)} XP (부분점수)`, '자기채점 결과와 답안이 attempt 로 기록됩니다.')
        : resultBox('no', '자기채점 X', '복습 모드에서 이 시나리오부터 재출제됩니다.')
      )}
    </div>
  )
}

export default function SheetPage() {
  const { curriculumId, sheetId } = useParams()
  const sheet = sheets[sheetId ?? '']
  const cur = findCurriculum(curriculumId) ?? findCurriculum(sheet?.curriculum)
  const { steps, results, markStep, addXP, showToast, completedSheets, completeSheet, sidebarCollapsed, toggleSidebar } = useHub()
  const bonusRef = useRef(false)

  const stepIds = useMemo(
    () => sheet ? [
      ...sheet.concepts.map(c => c.id),
      ...(sheet.lab?.steps.map(l => l.id) ?? []),
      ...sheet.scenarios.map(s => s.id),
    ] : [],
    [sheet],
  )
  const doneCount = stepIds.filter(id => steps[`${sheet?.sheet}:${id}`]).length
  const allDone = sheet && doneCount === stepIds.length
  const anyScenarioGraded = sheet && sheet.scenarios.some(s => results[`${sheet.sheet}:${s.id}`])
  const anyLabDone = sheet && (sheet.lab?.steps.some(l => steps[`${sheet.sheet}:${l.id}`]) ?? false)

  // 전 단계 완료 → 완주 보너스 1회
  useEffect(() => {
    if (!sheet || !allDone || bonusRef.current) return
    if (completedSheets.includes(sheet.sheet)) return
    bonusRef.current = true
    completeSheet(sheet.sheet)
    setTimeout(() => { addXP(100 * sheet.difficulty); showToast('완주 보너스!') }, 400)
  }, [allDone, sheet, completedSheets, completeSheet, addXP, showToast])

  if (!sheet || !cur) {
    return <div className="placeholder"><div className="big px">404</div><h2>학습지를 찾을 수 없습니다</h2>
      <Link to="/learning" style={{ color: 'var(--accent)' }}>← 학습 목록으로</Link></div>
  }

  const goStep = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  const isSprint = (cur.mode ?? 'sprint') === 'sprint'
  const sheetLabel = isSprint ? `Day ${sheet.day}` : (cur.topics?.find(t => t.sheet === sheet.sheet)?.title ?? sheet.topic)
  const oCount = sheet.scenarios.filter(s => results[`${sheet.sheet}:${s.id}`] === 'O').length
  const dCount = sheet.scenarios.filter(s => results[`${sheet.sheet}:${s.id}`] === '△').length

  return (
    <>
      <div className={`layout${sidebarCollapsed ? ' side-collapsed' : ''}`}>
        {sidebarCollapsed && (
          <button className="side-expand" onClick={toggleSidebar} title="메뉴 펼치기">
            <span className="px">☰ 메뉴</span>
          </button>
        )}
        <aside className="sidebar">
          <div>
            <div className="side-title px">CURRICULUM
              <button className="side-fold" onClick={toggleSidebar} title="메뉴 접기">접기 ◂</button>
            </div>
            <div className="card">
              <div className="course-hd">
                <b>{cur.title}</b>
                <div className="meta">
                  {isSprint ? `${cur.days?.length}일` : `주제 ${cur.topics?.length}개`} · 난이도 {'★'.repeat(cur.difficulty)}{'☆'.repeat(3 - cur.difficulty)} · 공개
                </div>
              </div>
              {isSprint
                ? cur.days?.map(d => (
                    <div key={d.day} className={`dayitem${d.sheet === sheet.sheet ? ' active' : ''}`}>
                      <span className="dnum px">D-{String(d.day).padStart(2, '0')}</span> {d.title}
                    </div>
                  ))
                : cur.topics?.map(t => (
                    <div key={t.topic} className={`dayitem${t.sheet === sheet.sheet ? ' active' : ''}`}
                      style={t.status === 'planned' ? { opacity: .5 } : undefined}>
                      <span className="dnum px">{t.status === 'planned' ? '-' : '●'}</span> {t.title.split(' — ')[0]}
                    </div>
                  ))}
            </div>
          </div>
          <div className="card">
            <div className="labhd px">LAB PROGRESS <span className="pct">{doneCount} / {stepIds.length}</span></div>
            <div className="labbar"><div className="f" style={{ width: `${(doneCount / stepIds.length) * 100}%` }} /></div>
            {sheet.concepts.map((c, i) => (
              <div key={c.id} className={`step${steps[`${sheet.sheet}:${c.id}`] ? ' done' : ''}`} onClick={() => goStep(c.id)}>
                <span className="bx" />개념 {i + 1} — {c.title.replace(/^개념 \d+\. /, '')}<span className="tag px">개념</span>
              </div>
            ))}
            {sheet.lab?.steps.map((l, i) => (
              <div key={l.id} className={`step${steps[`${sheet.sheet}:${l.id}`] ? ' done' : ''}`} onClick={() => goStep(l.id)}>
                <span className="bx" />구축 {i + 1} — {l.title.split(' — ')[0]}<span className="tag px">실습</span>
              </div>
            ))}
            {sheet.scenarios.map(s => (
              <div key={s.id} className={`step${steps[`${sheet.sheet}:${s.id}`] ? ' done' : ''}`} onClick={() => goStep(s.id)}>
                <span className="bx" />{s.id.toUpperCase()} — {typeLabel[s.type]}<span className="tag px">{typeLabel[s.type]}</span>
              </div>
            ))}
          </div>
        </aside>

        <main>
          <div className="crumb"><span className="px">LEARNING</span> / <Link to="/learning" style={{ color: 'inherit' }}>{cur.title}</Link> / {sheetLabel}</div>
          <h1 className="sheet-h1">{sheet.title}</h1>
          <div className="sheetmeta">
            <span className="chip goal">목표 — {sheet.goal}</span>
            <span className="chip">{sheet.estimated_minutes}분</span>
            {sheet.level && <span className="chip px" style={{ fontSize: 11 }}>Lv.{sheet.level}</span>}
            {sheet.tags.map(t => <span key={t} className="chip">#{t}</span>)}
          </div>

          {/* 모바일: 사이드바 대신 가로 스크롤 진도 스트립 */}
          <div className="mobile-lab">
            <span className="mcount">{doneCount}/{stepIds.length}</span>
            {stepIds.map((id, i) => {
              const done = steps[`${sheet.sheet}:${id}`]
              const label = id.startsWith('c') ? `개념${i + 1}` : id.startsWith('l') ? `실습${id.slice(1)}` : id.toUpperCase()
              return (
                <button key={id} className={`mstep${done ? ' done' : ''}`} onClick={() => goStep(id)}>
                  {done ? '✓ ' : ''}{label}
                </button>
              )
            })}
          </div>

          {/* STEP 바 — 클릭 시 해당 화면으로 이동 */}
          <div className="stagebar">
            <div className="stage on" onClick={() => goStep('c1')}><span className="n px">STEP 1</span>개념</div>
            {sheet.lab && (
              <div className={`stage${anyLabDone ? ' on' : ''}`} onClick={() => goStep('lab')}><span className="n px">STEP 2</span>실전 구축</div>
            )}
            <div className={`stage${anyScenarioGraded ? ' on' : ''}`} onClick={() => goStep('s1')}><span className="n px">STEP {sheet.lab ? 3 : 2}</span>시나리오</div>
            <div className={`stage${allDone ? ' on' : ''}`} onClick={() => goStep('grading')}><span className="n px">STEP {sheet.lab ? 4 : 3}</span>채점</div>
          </div>

          {sheet.concepts.map((c, i) => {
            const done = steps[`${sheet.sheet}:${c.id}`]
            return (
              <section key={c.id} className="concept" id={c.id}>
                <h2 className="concept-h2">{c.title} <span className="anchor px">#{c.id}</span>
                  <button className="cbtn" onClick={() => {
                    useHub.getState().setCmtTarget(c.id)
                    document.getElementById('cmt-input')?.focus()
                  }}>+ 댓글</button>
                </h2>
                <div className="diagram" dangerouslySetInnerHTML={{ __html: c.diagram }} />
                {c.body && <div className="concept-body" dangerouslySetInnerHTML={{ __html: c.body }} />}
                <button className={`donebtn${done ? ' checked' : ''}`} disabled={done}
                  onClick={() => { markStep(sheet.sheet, c.id); showToast(`진도 저장 ${doneCount + 1}/${stepIds.length}`) }}>
                  {done ? '✓ 완료됨' : `✓ 개념 ${i + 1} 이해 완료`}
                </button>
              </section>
            )
          })}

          <section className="concept">
            <h2 className="concept-h2">공식 문서 <span className="anchor px">#c{sheet.concepts.length + 1}</span></h2>
            <p className="doclink">
              {sheet.sources.map(s => <span key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a><br /></span>)}
            </p>
          </section>

          {/* 실습 — 실전 구축 챕터 (문제풀이가 아니라 고객 요청 구현) */}
          {sheet.lab && (
            <>
              <div className="divider" id="lab"><span className="ln" /><span className="px">STEP 2 — 실전 구축 ({sheet.lab.steps.length}단계)</span><span className="ln" /></div>
              <div className="labbrief">
                <div className="labrow"><span className="labtag px">상황</span><span dangerouslySetInnerHTML={{ __html: sheet.lab.situation }} /></div>
                <div className="labrow"><span className="labtag px req">요청</span><span dangerouslySetInnerHTML={{ __html: sheet.lab.request }} /></div>
              </div>
              {sheet.lab.steps.map((l, i) => {
                const done = steps[`${sheet.sheet}:${l.id}`]
                return (
                  <section key={l.id} className="concept labstep" id={l.id}>
                    <h2 className="concept-h2">
                      <span className="labnum px">{String(i + 1).padStart(2, '0')}</span>
                      {l.title} <span className="anchor px">#{l.id}</span>
                      <button className="cbtn" onClick={() => {
                        useHub.getState().setCmtTarget(l.id)
                        document.getElementById('cmt-input')?.focus()
                      }}>+ 댓글</button>
                    </h2>
                    <div className="concept-body" dangerouslySetInnerHTML={{ __html: l.body }} />
                    <button className={`donebtn${done ? ' checked' : ''}`} disabled={done}
                      onClick={() => { markStep(sheet.sheet, l.id); showToast(`진도 저장 ${doneCount + 1}/${stepIds.length}`) }}>
                      {done ? '✓ 완료됨' : `✓ 단계 ${i + 1} 완료`}
                    </button>
                  </section>
                )
              })}
            </>
          )}

          <div className="divider"><span className="ln" /><span className="px">STEP {sheet.lab ? 3 : 2} — 시나리오 ({sheet.scenarios.length}문항)</span><span className="ln" /></div>
          {sheet.scenarios.map(s => <ScenarioCard key={s.id} sheet={sheet.sheet} scen={s} />)}

          <div className="divider" id="grading"><span className="ln" /><span className="px">STEP {sheet.lab ? 4 : 3} — 채점</span><span className="ln" /></div>
          {allDone ? (
            <div className="summary">
              <div className="big px">채점 완료 — {oCount} / {sheet.scenarios.length}{dCount > 0 && ` (△${dCount})`}</div>
              <div className="row">{cur.title} · {sheetLabel}</div>
              <div className="row" style={{ fontSize: 12 }}>attempt 기록이 blog-db repo에 commit 됩니다 (복습·XP 원천)</div>
              <div className="xpgain px">완주 보너스 +{100 * sheet.difficulty} XP (난이도 ×{sheet.difficulty})</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-faint)', padding: 10 }}>
              LAB PROGRESS {stepIds.length}단계를 모두 완료하면 채점이 확정되고 XP가 정산됩니다
            </div>
          )}
        </main>
      </div>
      <div className="footer-note">
        ⓘ 진도·답안·점수·댓글은 현재 이 브라우저(localStorage)에 저장 — blog-db 연동(Phase 2)에서 commit 동기화로 전환 예정.
      </div>
      <CommentDock sheetId={sheet.sheet} sheetTitle={sheet.title} />
    </>
  )
}
