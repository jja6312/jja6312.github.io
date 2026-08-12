import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findCurriculum, sheets } from '../data'
import { useHub } from '../store'
import type { Scenario, Verdict } from '../types'
import { useVisibleLearningProgress } from '../lib/useLearningProgress'

interface PoolItem { sheet: string; sheetTitle: string; scen: Scenario; firstVerdict?: Verdict }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
const tokSort = (s: string) => norm(s).split(' ').sort().join(' ')
const typeLabel: Record<Scenario['type'], string> = { ox: 'OX', choice: '객관식', command: '명령어', essay: '서술형' }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* 한 문항 카드 — 첫 학습(results)을 건드리지 않는 세션 로컬 채점 */
function ReviewCard({ item, onGraded }: { item: PoolItem; onGraded: (v: Verdict) => void }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [picked, setPicked] = useState('')
  const [input, setInput] = useState('')
  const [rubricOpen, setRubricOpen] = useState(false)
  const scen = item.scen
  const graded = verdict !== null

  const grade = (v: Verdict, submitted: string) => {
    if (graded) return
    setVerdict(v); setPicked(submitted); onGraded(v)
  }
  const gradeCmd = () => {
    if (!input.trim()) return
    let ok = scen.answers.some(a => norm(a) === norm(input))
    if (!ok && scen.match === 'normalize-flags') ok = scen.answers.some(a => tokSort(a) === tokSort(input))
    grade(ok ? 'O' : 'X', input)
  }

  return (
    <div className={`scen${verdict === 'O' ? ' correct' : verdict === '△' ? ' partial' : verdict === 'X' ? ' wrong' : ''}`}>
      <div className="scen-hd">
        <span className="stype px">{typeLabel[scen.type]}</span>
        <span className="sid px">{item.sheetTitle} · {scen.id.toUpperCase()}</span>
        {item.firstVerdict && item.firstVerdict !== 'O' &&
          <span className="sid px" style={{ color: 'var(--partial)' }}>지난번 {item.firstVerdict}</span>}
      </div>
      <div className="situ"><b>상황</b>{scen.situation}</div>
      <div className="q">{scen.question}</div>

      {scen.type === 'ox' && (
        <div className="optrow">
          {(['O', 'X'] as const).map(p => {
            const isAnswer = scen.answers.includes(p)
            const cls = graded && picked === p ? (isAnswer ? ' sel-right' : ' sel-wrong') : ''
            return <button key={p} disabled={graded} className={`opt px${cls}`} style={{ fontSize: 17.5, padding: '9px 26px' }}
              onClick={() => grade(isAnswer ? 'O' : 'X', p)}>{p}</button>
          })}
        </div>
      )}

      {scen.type === 'choice' && scen.choices && (
        <div className="choicecol">
          {scen.choices.map((c, i) => {
            const n = String(i + 1)
            const isAnswer = scen.answers.includes(n)
            const cls = graded && picked === n ? (isAnswer ? ' sel-right' : ' sel-wrong')
              : graded && verdict === 'X' && isAnswer ? ' reveal' : ''
            return <button key={n} disabled={graded} className={`opt${cls}`}
              onClick={() => grade(isAnswer ? 'O' : 'X', n)}><span className="mono">{n}</span>&nbsp; {c}</button>
          })}
        </div>
      )}

      {scen.type === 'command' && (
        <div className="cmdrow">
          <input className="cmdinput" disabled={graded} value={graded ? picked : input}
            placeholder={scen.match === 'normalize-flags' ? '$ 명령어 입력 (플래그 순서 관용)' : '$ 명령어 입력'}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') gradeCmd() }} />
          <button className="submitbtn" disabled={graded} onClick={gradeCmd}>제출</button>
        </div>
      )}

      {scen.type === 'essay' && (
        <>
          <textarea className="cmdinput" disabled={graded || rubricOpen} value={graded ? picked : input}
            placeholder="자유 서술 → 제출하면 채점 기준 공개 → 자기 채점"
            onChange={e => setInput(e.target.value)} />
          {!rubricOpen && !graded && (
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button className="submitbtn" onClick={() => { if (input.trim()) setRubricOpen(true) }}>제출 → 채점 기준 보기</button>
            </div>
          )}
          {(rubricOpen || graded) && (
            <div style={{ marginTop: 12 }}>
              <div className="rubric-box"><b>채점 기준 (rubric)</b>{scen.rubric}</div>
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

      {graded && (
        <div className={`result ${verdict === 'O' ? 'ok' : verdict === '△' ? 'mid' : 'no'}`}>
          <div className="verdict px">{verdict === 'O' ? '정답' : verdict === '△' ? '부분 정답' : '오답'}</div>
          <div className="exp" dangerouslySetInnerHTML={{ __html: scen.explanation }} />
          {scen.type === 'command' && verdict !== 'O' &&
            <div className="ans">정답 예: <code>{scen.answers[0]}</code></div>}
        </div>
      )}
    </div>
  )
}

export default function ReviewPage() {
  const navTab = useNavigate()
  const { results, addXP, showToast } = useHub()
  const { canManage } = useVisibleLearningProgress()
  const [phase, setPhase] = useState<'select' | 'run' | 'done'>('select')
  const [selected, setSelected] = useState<string[]>([])
  const [count, setCount] = useState(5)
  const [quiz, setQuiz] = useState<PoolItem[]>([])
  const [idx, setIdx] = useState(0)
  const [verdicts, setVerdicts] = useState<Verdict[]>([])

  // 진행 이력이 있는 학습지만 복습 대상
  const available = useMemo(() =>
    Object.values(sheets)
      .map(sh => {
        const graded = sh.scenarios.filter(s => results[`${sh.sheet}:${s.id}`]).length
        return { sheet: sh, graded }
      })
      .filter(x => x.graded > 0),
    [results])

  const poolSize = useMemo(() =>
    available.filter(a => selected.includes(a.sheet.sheet))
      .reduce((n, a) => n + a.sheet.scenarios.length, 0),
    [available, selected])

  const start = () => {
    const pool: PoolItem[] = available
      .filter(a => selected.includes(a.sheet.sheet))
      .flatMap(a => a.sheet.scenarios.map(scen => ({
        sheet: a.sheet.sheet,
        sheetTitle: a.sheet.day ? `Day ${a.sheet.day}` : (a.sheet.topic ?? a.sheet.sheet),
        scen,
        firstVerdict: results[`${a.sheet.sheet}:${scen.id}`],
      })))
    // 출제 순서: 틀렸던 것(X) > 부분(△) > 나머지 — 그룹 내 랜덤 (Leitner 간이)
    const wrong = shuffle(pool.filter(p => p.firstVerdict === 'X'))
    const part = shuffle(pool.filter(p => p.firstVerdict === '△'))
    const rest = shuffle(pool.filter(p => p.firstVerdict !== 'X' && p.firstVerdict !== '△'))
    setQuiz([...wrong, ...part, ...rest].slice(0, count))
    setIdx(0); setVerdicts([]); setPhase('run')
  }

  const onGraded = (v: Verdict) => setVerdicts(vs => [...vs, v])

  const finish = () => {
    const improved = quiz.filter((q, i) =>
      (q.firstVerdict === 'X' || q.firstVerdict === '△') && verdicts[i] === 'O').length
    const bonus = 30 + improved * 5
    addXP(bonus)
    showToast(`복습 완료 +${bonus} XP`)
    setPhase('done')
  }

  const o = verdicts.filter(v => v === 'O').length
  const d = verdicts.filter(v => v === '△').length
  const improved = quiz.filter((q, i) =>
    (q.firstVerdict === 'X' || q.firstVerdict === '△') && verdicts[i] === 'O').length

  if (!canManage) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 120px' }}>
        <div className="crumb"><span className="px">LEARNING</span> / 복습</div>
        <h1 className="sheet-h1">복습 퀴즈</h1>
        <div className="card" style={{ padding: '28px 24px', color: 'var(--text-dim)', lineHeight: 1.7 }}>
          공개 방문자는 학습 목록에서 자물쇠3 사용자의 진도를 읽을 수 있습니다.<br />
          답안 제출과 복습 기록 관리는 자물쇠3 사용자에게만 열립니다.
          <div style={{ marginTop: 16 }}><button className="submitbtn" onClick={() => useHub.getState().openAuth(3)}>자물쇠3으로 관리</button></div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="ksec" style={{ margin: '0 0 26px', padding: 0 }}>
        {[['all', 'ALL'], ['sprint', '스프린트'], ['category', '주제별']].map(([id, label]) => (
          <button key={id} className="ksec-btn" onClick={() => navTab(`/learning/${id}`)}>{label}</button>
        ))}
        <button className="ksec-btn on">복습</button>
        <button className="ksec-btn" onClick={() => navTab('/learning/request')}>생성 요청</button>
      </div>
      <div className="crumb"><span className="px">LEARNING</span> / 복습</div>
      <h1 className="sheet-h1">복습 퀴즈</h1>

      {phase === 'select' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 15, margin: '8px 0 24px' }}>
            학습한 학습지를 복수 선택 → 시나리오 풀에서 혼합 출제.
            출제 순서: 틀렸던 것 → 부분점수 → 나머지 랜덤.
          </p>
          {available.length === 0 ? (
            <div className="card" style={{ padding: '30px 24px', textAlign: 'center', fontSize: 14.5, color: 'var(--text-dim)' }}>
              아직 복습할 학습지가 없습니다.<br />
              학습지에서 시나리오를 1개 이상 풀면 여기 나타납니다.
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                {available.map(({ sheet: sh, graded }) => {
                  const on = selected.includes(sh.sheet)
                  return (
                    <div key={sh.sheet} className={`step${on ? ' done' : ''}`} style={{ padding: '12px 18px' }}
                      onClick={() => setSelected(s => on ? s.filter(x => x !== sh.sheet) : [...s, sh.sheet])}>
                      <span className="bx" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, color: on ? 'var(--text)' : undefined }}>{sh.day ? `Day ${sh.day} — ` : ''}{sh.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{findCurriculum(sh.curriculum)?.title ?? sh.curriculum} · 풀이 {graded}/{sh.scenarios.length}문항</div>
                      </div>
                      <span className="tag px">{sh.scenarios.length}문항</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 14.5, color: 'var(--text-dim)' }}>
                  문항 수&nbsp;
                  <select className="tgt" style={{ fontSize: 14.5, padding: '5px 10px', borderRadius: 8, background: 'var(--bg-inset)', color: 'var(--text)', border: '1px solid var(--line)' }}
                    value={count} onChange={e => setCount(Number(e.target.value))}>
                    {[3, 5, 8, 10].map(n => <option key={n} value={n} disabled={poolSize > 0 && n > poolSize}>{n}개</option>)}
                  </select>
                </label>
                <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>선택한 풀: {poolSize}문항</span>
                <button className="submitbtn" disabled={selected.length === 0} onClick={start}
                  style={{ marginLeft: 'auto' }}>▶ 복습 시작 ({Math.min(count, poolSize) || 0}문항)</button>
              </div>
            </>
          )}
        </>
      )}

      {phase === 'run' && quiz[idx] && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 18px' }}>
            <div className="labbar" style={{ flex: 1, margin: 0 }}>
              <div className="f" style={{ width: `${(verdicts.length / quiz.length) * 100}%` }} />
            </div>
            <span className="px" style={{ fontSize: 12, color: 'var(--accent)' }}>{Math.min(verdicts.length + 1, quiz.length)} / {quiz.length}</span>
          </div>
          <ReviewCard key={`${quiz[idx].sheet}:${quiz[idx].scen.id}:${idx}`} item={quiz[idx]} onGraded={onGraded} />
          {verdicts.length > idx && (
            <div style={{ textAlign: 'right' }}>
              {idx + 1 < quiz.length
                ? <button className="submitbtn" onClick={() => setIdx(i => i + 1)}>다음 문항 →</button>
                : <button className="submitbtn" onClick={finish}>세션 종료 → XP 정산</button>}
            </div>
          )}
        </>
      )}

      {phase === 'done' && (
        <div className="summary" style={{ marginTop: 20 }}>
          <div className="big px">복습 완료 — {o} / {quiz.length}{d > 0 && ` (△${d})`}</div>
          {improved > 0 && <div className="row" style={{ color: 'var(--accent)' }}>오답 → 정답 전환 {improved}건! (+{improved * 5} XP 보너스)</div>}
          <div className="row" style={{ fontSize: 12 }}>세션 결과가 attempt(review) 로 기록됩니다</div>
          <div className="xpgain px">세션 완료 +{30 + improved * 5} XP</div>
          <div style={{ marginTop: 16 }}>
            <button className="submitbtn" onClick={() => { setPhase('select'); setSelected([]) }}>다시 복습</button>
          </div>
        </div>
      )}
    </div>
  )
}
