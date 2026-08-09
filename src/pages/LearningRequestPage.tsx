import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buildLearningRequest, EMPTY_LEARNING_REQUEST, LEARNING_REQUEST_PRESETS,
  type LearningRequestForm,
} from '../lib/learningRequest'
import { useHub } from '../store'

const STORAGE_KEY = 'hub-learning-request-v2'
const LEGACY_STORAGE_KEY = 'hub-learning-request-v1'

const loadDraft = (): LearningRequestForm => {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<LearningRequestForm>
    return { ...EMPTY_LEARNING_REQUEST, ...saved }
  } catch { return EMPTY_LEARNING_REQUEST }
}

export default function LearningRequestPage() {
  const nav = useNavigate()
  const [form, setForm] = useState<LearningRequestForm>(loadDraft)
  const { showToast, rewardActivity } = useHub()
  const prompt = useMemo(() => buildLearningRequest(form), [form])
  const set = (key: keyof LearningRequestForm, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)) }, [form])

  const copyPrompt = async () => {
    if (!form.topic.trim() || !form.outcome.trim()) {
      showToast('학습 주제와 완료 목표를 먼저 입력하세요')
      return
    }
    try {
      await navigator.clipboard.writeText(prompt)
      if (!rewardActivity('learning-request-copy', 4, '학습자료 요청 설계')) showToast('학습자료 요청 프롬프트가 복사됨')
    } catch { showToast('복사 실패 — 미리보기에서 직접 선택하세요') }
  }

  const reset = () => {
    setForm(EMPTY_LEARNING_REQUEST)
    showToast('요청서를 초기화했습니다')
  }

  return (<>
    <div className="ksec">
      {[['all', 'ALL'], ['sprint', '스프린트'], ['category', '주제별']].map(([id, label]) => (
        <button key={id} className="ksec-btn" onClick={() => nav(`/learning/${id}`)}>{label}</button>
      ))}
      <button className="ksec-btn" onClick={() => nav('/learning/review')}>복습</button>
      <button className="ksec-btn on">생성 요청</button>
    </div>
    <main className="learn-request-page">
      <div className="learn-request-head">
        <div>
          <div className="crumb"><span className="px">LEARNING</span> / REQUEST BUILDER</div>
          <h1 className="sheet-h1">학습자료 생성 요청</h1>
          <p className="prof-desc">원하는 결과를 채우면, 깊이 있는 학습지를 만들기 위한 설계 기준까지 포함된 요청문이 완성됩니다.</p>
        </div>
        <div className="learn-request-head-actions">
          <button className="iconbtn" onClick={reset}>초기화</button>
          <button className="submitbtn learn-request-copy" onClick={copyPrompt}>요청 프롬프트 복사</button>
        </div>
      </div>

      <section className="learn-request-presets" aria-label="요청 유형 빠른 설정">
        {LEARNING_REQUEST_PRESETS.map(preset => (
          <button key={preset.label} className="learn-request-preset" onClick={() => setForm(prev => ({ ...prev, ...preset.patch }))}>
            <b>{preset.label}</b><span>{preset.description}</span>
          </button>
        ))}
      </section>

      <div className="learn-request-layout">
        <div className="learn-request-form">
          <section className="learn-request-section">
            <div className="learn-request-section-head"><span className="learn-request-step px">01</span><div><h2>무엇을 배우나요?</h2><p>주제보다 중요한 것은 학습 후 실제로 할 수 있는 일입니다.</p></div></div>
            <div className="learn-request-grid">
              <label className="learn-request-field wide"><span>학습 주제 <em>필수</em></span><input className="cli-input" value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="예: OCI DevOps 배포 파이프라인" /></label>
              <label className="learn-request-field wide"><span>현재 수준</span><textarea className="cli-input" rows={2} value={form.currentLevel} onChange={e => set('currentLevel', e.target.value)} placeholder="이미 아는 내용, 직접 해본 범위, 어려운 부분" /></label>
              <label className="learn-request-field wide"><span>완료 목표 <em>필수</em></span><textarea className="cli-input" rows={3} value={form.outcome} onChange={e => set('outcome', e.target.value)} placeholder="예: 코드 커밋부터 OKE 배포와 롤백까지 파이프라인을 직접 구성하고 실패 원인을 진단한다" /></label>
            </div>
          </section>

          <section className="learn-request-section">
            <div className="learn-request-section-head"><span className="learn-request-step px">02</span><div><h2>어떤 과정으로 만드나요?</h2><p>레벨은 지식의 양이 아니라 판단과 운영 책임의 깊이로 올라갑니다.</p></div></div>
            <div className="learn-request-grid two">
              <label className="learn-request-field"><span>구성 방식</span><select className="cli-input" value={form.courseType} onChange={e => set('courseType', e.target.value)}>
                <option value="" disabled>선택하세요</option>
                <option>단일 심화 학습지</option><option>주제별 Level 1~2</option><option>주제별 Level 1~3</option><option>7일 학습 스프린트</option><option>14일 학습 스프린트</option>
              </select></label>
              <label className="learn-request-field"><span>희망 분량</span><input className="cli-input" value={form.courseSize} onChange={e => set('courseSize', e.target.value)} placeholder="예: Level별 3개" /></label>
              <label className="learn-request-field compact"><span>학습지당 시간</span><div className="learn-request-unit"><input className="cli-input" type="number" min="10" max="240" value={form.lessonMinutes} onChange={e => set('lessonMinutes', e.target.value)} /><span>분</span></div></label>
              <label className="learn-request-field wide"><span>반드시 포함할 내용</span><textarea className="cli-input" rows={2} value={form.mustInclude} onChange={e => set('mustInclude', e.target.value)} placeholder="서비스 비교, IAM, 비용, 보안, 모니터링 등" /></label>
              <label className="learn-request-field wide"><span>제외할 내용</span><input className="cli-input" value={form.exclude} onChange={e => set('exclude', e.target.value)} placeholder="이미 아는 내용이나 다루지 않을 범위" /></label>
            </div>
          </section>

          <section className="learn-request-section">
            <div className="learn-request-section-head"><span className="learn-request-step px">03</span><div><h2>어디에 적용하나요?</h2><p>실제 환경과 업무 상황이 구체적일수록 따라 하기 자료를 넘어섭니다.</p></div></div>
            <div className="learn-request-grid">
              <label className="learn-request-field wide"><span>실습 환경·사전 준비</span><textarea className="cli-input" rows={2} value={form.environment} onChange={e => set('environment', e.target.value)} placeholder="사용할 클라우드, OS, 콘솔·CLI, 준비된 권한과 자원" /></label>
              <label className="learn-request-field wide"><span>최종 실습 결과물</span><textarea className="cli-input" rows={2} value={form.handsOnResult} onChange={e => set('handsOnResult', e.target.value)} placeholder="직접 구축하고 검증할 구체적인 결과" /></label>
              <label className="learn-request-field wide"><span>실제 업무·장애 시나리오</span><textarea className="cli-input" rows={3} value={form.workScenarios} onChange={e => set('workScenarios', e.target.value)} placeholder="고객 요청, 자주 만나는 오류, 의사결정 상황을 적어주세요" /></label>
            </div>
          </section>

          <section className="learn-request-section">
            <div className="learn-request-section-head"><span className="learn-request-step px">04</span><div><h2>정확성과 제약을 정합니다</h2><p>출처, 최신성, 보안과 비용 기준을 요청 단계에서 고정합니다.</p></div></div>
            <div className="learn-request-grid">
              <label className="learn-request-field wide"><span>출처·최신성 기준</span><textarea className="cli-input" rows={2} value={form.sourceRules} onChange={e => set('sourceRules', e.target.value)} /></label>
              <label className="learn-request-field wide"><span>그 밖의 제약</span><textarea className="cli-input" rows={2} value={form.constraints} onChange={e => set('constraints', e.target.value)} placeholder="무료 티어 범위, 특정 리전, 사용 금지 도구, 마감일 등" /></label>
            </div>
          </section>
        </div>

        <aside className="learn-request-aside">
          <section className="learn-request-quality">
            <span className="px">QUALITY BLUEPRINT</span><h2>내장된 학습지 설계</h2>
            <ol>
              <li><b>목표 정렬</b><span>행동 목표와 개념·실습·평가를 연결</span></li>
              <li><b>근거 검증</b><span>공식 1차 자료와 현재 동작 확인</span></li>
              <li><b>점진적 난이도</b><span>골격에서 설계 판단과 장애 대응까지</span></li>
              <li><b>재현 가능한 실습</b><span>성공 판정·진단·롤백·비용·보안 포함</span></li>
              <li><b>타당한 평가</b><span>오답 해설과 부분점수 기준 제공</span></li>
              <li><b>출고 전 검수</b><span>정확성·명료성·스키마·배포 확인</span></li>
            </ol>
          </section>
          <section className="learn-request-preview">
            <div className="learn-request-preview-head"><div><span className="px">PROMPT PREVIEW</span><b>{prompt.length.toLocaleString()}자</b></div><button className="submitbtn" onClick={copyPrompt}>복사</button></div>
            <textarea className="cli-input" readOnly value={prompt} aria-label="생성된 학습자료 요청 프롬프트" />
          </section>
        </aside>
      </div>
    </main>
  </>)
}
