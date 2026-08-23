import { useMemo, useState } from 'react'
import {
  useSyncedJson, SYNC_LABEL, EMPTY_BOARD,
  type Board, type Card, type TasksFile, type WorkTask,
} from '../../lib/scheduleDb'
import {
  EMPTY_AUTOMATION_INBOX, automationDecisionLabel, automationStatusLabel,
  confidencePercent, type AutomationCandidate, type AutomationInbox, type AutomationStatus,
} from '../../lib/todoAutomation'
import { useHub } from '../../store'

const today = () => new Date().toISOString().slice(0, 10)
const dateOnly = (value?: string) => value ? value.slice(0, 10) : ''
const fmtDateTime = (value?: string) => value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '미정'

type Draft = { title: string; status: AutomationStatus; customer: string; dueAt: string; completedAt: string }

function draftOf(candidate: AutomationCandidate, drafts: Record<string, Draft>): Draft {
  return drafts[candidate.id] ?? {
    title: candidate.title,
    status: candidate.status,
    customer: candidate.customer ?? '',
    dueAt: dateOnly(candidate.dueAt),
    completedAt: dateOnly(candidate.completedAt),
  }
}

function toTask(candidate: AutomationCandidate, draft: Draft, taskId: string): WorkTask {
  const isDone = draft.status === 'done'
  return {
    id: taskId,
    title: draft.title.trim(),
    threads: [],
    createdAt: candidate.createdAt,
    ...(draft.dueAt ? { dueDate: draft.dueAt } : {}),
    ...(isDone ? { done: true, completedAt: draft.completedAt || today() } : { done: false }),
    status: draft.status,
    automationCandidateId: candidate.id,
  }
}

function placeCard(board: Board, task: WorkTask, candidate: AutomationCandidate, draft: Draft): Board {
  const source = `task:${task.id}`
  const columns = board.columns.map(column => ({
    ...column,
    cards: column.cards.filter(card => card.source !== source),
  }))
  const targetId = draft.status === 'done' ? 'done' : draft.status === 'doing' ? 'doing' : 'todo'
  const target = columns.find(column => column.id === targetId) ?? columns[0]
  if (!target) return board
  const card: Card = {
    id: `automation-${candidate.id}`,
    text: draft.title.trim(),
    created: candidate.createdAt || new Date().toISOString(),
    kind: 'task',
    source,
    ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
    ...(draft.status === 'done' ? { doneAt: draft.completedAt || today() } : {}),
  }
  target.cards = [...target.cards, card]
  return { columns }
}

export default function AutomationInboxView() {
  const showToast = useHub(s => s.showToast)
  const rewardActivity = useHub(s => s.rewardActivity)
  const inbox = useSyncedJson<AutomationInbox>('automation/inbox.json', EMPTY_AUTOMATION_INBOX, 'automation: 수집 후보 갱신')
  const tasks = useSyncedJson<TasksFile>('schedule/tasks.json', { recurring: [], oneoff: [], projects: [] }, 'automation: 승인 업무 반영')
  const board = useSyncedJson<Board>('todo/board.json', EMPTY_BOARD, 'automation: 승인 TODO 반영')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [showHistory, setShowHistory] = useState(false)

  const pending = useMemo(() => inbox.data.candidates.filter(candidate => candidate.decision === 'pending'), [inbox.data.candidates])
  const history = useMemo(() => inbox.data.candidates.filter(candidate => candidate.decision !== 'pending'), [inbox.data.candidates])
  const writable = inbox.writable && tasks.writable && board.writable

  const patchDraft = (candidate: AutomationCandidate, patch: Partial<Draft>) => {
    const current = draftOf(candidate, drafts)
    setDrafts(previous => ({ ...previous, [candidate.id]: { ...current, ...patch } }))
  }

  const approve = (candidate: AutomationCandidate) => {
    if (!writable) { showToast('승인하려면 PAT로 쓰기 권한을 열어 주세요'); return }
    const draft = draftOf(candidate, drafts)
    if (!draft.title.trim()) { showToast('업무 제목을 입력해 주세요'); return }
    const taskId = candidate.taskRef ?? `automation-${candidate.id}`
    const task = toTask(candidate, draft, taskId)
    const existing = tasks.data.oneoff.find(item => item.id === taskId)
    const nextTasks: TasksFile = {
      ...tasks.data,
      oneoff: existing ? tasks.data.oneoff.map(item => item.id === taskId ? { ...item, ...task } : item) : [...tasks.data.oneoff, task],
    }
    const approved = {
      ...candidate,
      title: draft.title.trim(),
      status: draft.status,
      ...(draft.customer ? { customer: draft.customer } : { customer: undefined }),
      ...(draft.dueAt ? { dueAt: draft.dueAt } : { dueAt: undefined }),
      ...(draft.completedAt ? { completedAt: draft.completedAt } : draft.status === 'done' ? { completedAt: today() } : { completedAt: undefined }),
      decision: 'approved' as const,
      reviewedAt: new Date().toISOString(),
      taskRef: taskId,
    }
    tasks.update(nextTasks)
    board.update(placeCard(board.data, task, approved, draft))
    inbox.update({
      ...inbox.data,
      updatedAt: new Date().toISOString(),
      candidates: inbox.data.candidates.map(item => item.id === candidate.id ? approved : item),
    })
    rewardActivity(`automation-approved:${candidate.id}`, 3, '자동 업무 승인', 'once')
    showToast('승인됨 — 업무관리와 TODO에 반영을 예약했습니다')
  }

  const reject = (candidate: AutomationCandidate) => {
    if (!inbox.writable) { showToast('거절하려면 PAT로 쓰기 권한을 열어 주세요'); return }
    const note = window.prompt('거절 사유(선택)', '') ?? ''
    inbox.update({
      ...inbox.data,
      updatedAt: new Date().toISOString(),
      candidates: inbox.data.candidates.map(item => item.id === candidate.id
        ? { ...item, decision: 'rejected' as const, reviewedAt: new Date().toISOString(), ...(note ? { reviewNote: note } : {}) }
        : item),
    })
    showToast('후보를 거절했습니다')
  }

  return (
    <div className="automation-inbox">
      <div className="sched-head">
        <div>
          <h1 className="sheet-h1">업무 자동 수집함</h1>
          <p className="prof-desc">Outlook과 카카오톡 ‘업무’ 대화에서 추출한 후보를 검토한 뒤 TODO에 반영합니다. 승인 전에는 기존 업무 데이터가 바뀌지 않습니다.</p>
        </div>
        <span className="px sched-sync">{SYNC_LABEL[inbox.sync]}</span>
      </div>

      {!writable && <div className="cross-note automation-readonly">현재는 읽기 전용입니다. 후보 검토는 가능하지만 승인·거절에는 blog-db Contents 쓰기 권한이 있는 PAT가 필요합니다.</div>}

      <div className="automation-summary">
        <div><span className="px">검토 대기</span><b>{pending.length}</b></div>
        <div><span className="px">최근 실행</span><b>{inbox.data.runs.length ? fmtDateTime(inbox.data.runs[inbox.data.runs.length - 1].startedAt) : '없음'}</b></div>
        <div><span className="px">운영 정책</span><b>17:30 KST · 수동 승인</b></div>
      </div>

      <section className="automation-section">
        <div className="automation-section-head"><h2>검토 대기 후보</h2><span className="px">{pending.length}건</span></div>
        {pending.length === 0 && <div className="cmt-empty">새 후보가 없습니다. 다음 수집 실행은 매일 17:30입니다.</div>}
        <div className="automation-list">
          {pending.map(candidate => {
            const draft = draftOf(candidate, drafts)
            return (
              <article className="automation-card" key={candidate.id}>
                <div className="automation-card-head">
                  <span className={`automation-status ${draft.status}`}>{automationStatusLabel[draft.status]}</span>
                  <span className="px automation-confidence">신뢰도 {confidencePercent(candidate.confidence)}%</span>
                  <span className="px automation-created">{fmtDateTime(candidate.createdAt)}</span>
                </div>
                <div className="automation-fields">
                  <label>업무 제목<input className="cli-input" value={draft.title} onChange={e => patchDraft(candidate, { title: e.target.value })} /></label>
                  <label>고객사<input className="cli-input" value={draft.customer} placeholder="선택" onChange={e => patchDraft(candidate, { customer: e.target.value })} /></label>
                  <label>상태<select className="cli-input" value={draft.status} onChange={e => patchDraft(candidate, { status: e.target.value as AutomationStatus })}>
                    {(['todo', 'doing', 'done', 'needs_review'] as AutomationStatus[]).map(status => <option key={status} value={status}>{automationStatusLabel[status]}</option>)}
                  </select></label>
                  <label>마감일<input className="cli-input" type="date" value={draft.dueAt} onChange={e => patchDraft(candidate, { dueAt: e.target.value })} /></label>
                  <label>완료일<input className="cli-input" type="date" value={draft.completedAt} disabled={draft.status !== 'done'} onChange={e => patchDraft(candidate, { completedAt: e.target.value })} /></label>
                </div>
                <div className="automation-evidence">
                  <span className="px">발화 주체: {candidate.actor}</span>
                  {candidate.evidence.map((evidence, index) => <p key={`${candidate.id}-evidence-${index}`}><b>{evidence.source === 'outlook' ? 'Outlook' : '카카오톡'}</b> · {evidence.summary}</p>)}
                </div>
                <div className="automation-card-actions">
                  <button className="submitbtn" onClick={() => approve(candidate)}>승인하고 TODO 반영</button>
                  <button className="iconbtn" onClick={() => reject(candidate)}>거절</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="automation-section">
        <button className="automation-history-toggle" onClick={() => setShowHistory(value => !value)}>
          {showHistory ? '▲' : '▼'} 처리 이력 {history.length}건
        </button>
        {showHistory && <div className="automation-history">
          {history.slice().reverse().map(candidate => <div className="automation-history-row" key={candidate.id}>
            <span className={`automation-decision ${candidate.decision}`}>{automationDecisionLabel[candidate.decision]}</span>
            <b>{candidate.title}</b>
            <span className="px">{fmtDateTime(candidate.reviewedAt)}</span>
          </div>)}
        </div>}
      </section>

      <section className="automation-section automation-runs">
        <div className="automation-section-head"><h2>수집 실행 기록</h2><span className="px">읽기 전용 로그</span></div>
        {inbox.data.runs.slice().reverse().slice(0, 5).map(run => <div className="automation-run" key={run.id}>
          <span className="px">{fmtDateTime(run.startedAt)}</span>
          <span>Outlook {run.sources.outlook?.status ?? '없음'} · 카카오톡 {run.sources.kakao?.status ?? '없음'}</span>
          <span className="px">후보 {run.candidateCount}건</span>
          {run.errors.length > 0 && <span className="automation-run-error">실패 {run.errors.length}건</span>}
        </div>)}
      </section>
    </div>
  )
}
