// 공개 학습글 번들 — blog-db learning/oci-security (category 모드)
import type { Curriculum, Sheet } from '../types'

export const ociSecurity: Curriculum = {
  id: 'oci-security',
  title: 'OCI 보안',
  description: 'OCI 보안 서비스를 카테고리 단위로 학습. 기간 없이 주제별로 골라 진행한다.',
  mode: 'category',
  difficulty: 2,
  public: true,
  tags: ['oci', 'security', 'cloud-guard'],
  created: '2026-08-02',
  topics: [
    { topic: 'cloud-guard', sheet: 'cloud-guard', title: 'Cloud Guard — 탐지와 대응의 골격', goal: 'Target→Detector→Problem→Responder 처리 모델을 그릴 수 있고, 권한 설계(verb 단계)를 실무 요구에 맞게 고른다', estimated_minutes: 50 },
    { topic: 'security-zones', sheet: 'security-zones', title: 'Security Zones — 예방적 통제', goal: '(예정) Cloud Guard와의 관계, recipe 기반 정책 강제를 이해한다', estimated_minutes: 40, status: 'planned' },
    { topic: 'vault-kms', sheet: 'vault-kms', title: 'Vault·KMS — 키와 시크릿', goal: '(예정) 키 계층과 시크릿 수명주기를 이해한다', estimated_minutes: 50, status: 'planned' },
  ],
}

const svgPipeline = `
<svg viewBox="0 0 660 110" font-family="Pretendard,sans-serif">
  <defs><marker id="cg-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)"/></marker></defs>
  <g text-anchor="middle" font-size="12.5">
    <rect x="8" y="24" width="130" height="42" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="73" y="50" fill="var(--text)" font-weight="600">Target</text>
    <rect x="178" y="24" width="130" height="42" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="243" y="50" fill="var(--text)" font-weight="600">Detector Recipe</text>
    <rect x="348" y="24" width="130" height="42" rx="9" fill="var(--accent-glow)" stroke="var(--accent)"/>
    <text x="413" y="50" fill="var(--accent)" font-weight="700">Problem</text>
    <rect x="518" y="24" width="134" height="42" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="585" y="50" fill="var(--text)" font-weight="600">Responder</text>
  </g>
  <g stroke="var(--text-faint)" stroke-width="1.6" marker-end="url(#cg-ar)">
    <line x1="138" y1="45" x2="174" y2="45"/><line x1="308" y1="45" x2="344" y2="45"/><line x1="478" y1="45" x2="514" y2="45"/>
  </g>
  <g text-anchor="middle" font-size="10" fill="var(--text-faint)">
    <text x="73" y="92">감시 대상 (compartment)</text><text x="243" y="92">규칙으로 검사</text>
    <text x="413" y="92">탐지 결과 생성</text><text x="585" y="92">교정 액션 (제안/자동)</text>
  </g>
</svg>`

const svgDetectors = `
<svg viewBox="0 0 660 200" font-family="Pretendard,sans-serif">
  <defs><marker id="cg-ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>
  <g font-size="11.5">
    <rect x="8" y="14" width="250" height="176" rx="12" fill="none" stroke="var(--line)" stroke-dasharray="6 5"/>
    <text x="22" y="36" fill="var(--text-dim)" font-size="11" font-weight="700">Detector 4종 (무엇을 잡나)</text>
    <rect x="22" y="48" width="222" height="28" rx="7" fill="var(--bg-card)" stroke="var(--line)"/><text x="34" y="67" fill="var(--text)">Configuration — 설정 취약점</text>
    <rect x="22" y="82" width="222" height="28" rx="7" fill="var(--bg-card)" stroke="var(--line)"/><text x="34" y="101" fill="var(--text)">Activity — 위험 행위</text>
    <rect x="22" y="116" width="222" height="28" rx="7" fill="var(--bg-card)" stroke="var(--line)"/><text x="34" y="135" fill="var(--text)">Threat — 악성 패턴</text>
    <rect x="22" y="150" width="222" height="28" rx="7" fill="var(--bg-card)" stroke="var(--line)"/><text x="34" y="169" fill="var(--text)">Instance Security — 호스트 내부</text>
  </g>
  <g font-size="11.5" text-anchor="middle">
    <rect x="300" y="48" width="150" height="46" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="375" y="68" fill="var(--text)" font-weight="600">Oracle-managed</text>
    <text x="375" y="84" fill="var(--wrong)" font-size="10">직접 수정 불가 🔒</text>
    <rect x="500" y="48" width="150" height="46" rx="9" fill="var(--accent-glow)" stroke="var(--accent)"/>
    <text x="575" y="68" fill="var(--accent)" font-weight="700">user-managed</text>
    <text x="575" y="84" fill="var(--text-dim)" font-size="10">규칙 조정 가능</text>
    <line x1="450" y1="64" x2="496" y2="64" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#cg-ar2)"/>
    <text x="473" y="56" fill="var(--accent)" font-size="10" font-family="Consolas,monospace">clone</text>
    <path d="M575 94 C 575 130, 420 130, 385 98" fill="none" stroke="var(--text-faint)" stroke-width="1.3" stroke-dasharray="4 4"/>
    <text x="480" y="140" fill="var(--text-faint)" font-size="10">원본과 연결(ties) 유지 — 규칙 업데이트 이어받음</text>
  </g>
</svg>`

const svgLifecycle = `
<svg viewBox="0 0 660 170" font-family="Pretendard,sans-serif">
  <defs><marker id="cg-ar3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)"/></marker></defs>
  <g text-anchor="middle" font-size="11.5">
    <rect x="8" y="24" width="130" height="40" rx="9" fill="var(--accent-glow)" stroke="var(--accent)"/>
    <text x="73" y="49" fill="var(--accent)" font-weight="700">Problem 생성</text>
    <rect x="188" y="24" width="150" height="40" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="263" y="43" fill="var(--text)">조회·정렬·필터</text>
    <text x="263" y="57" fill="var(--text-dim)" font-size="9.5">일괄 상태 변경 가능</text>
    <rect x="388" y="4" width="120" height="34" rx="9" fill="var(--bg-card)" stroke="var(--accent-dim)"/>
    <text x="448" y="26" fill="var(--accent)">Resolve (해결)</text>
    <rect x="388" y="52" width="120" height="34" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="448" y="74" fill="var(--text-dim)">Dismiss (기각)</text>
    <rect x="544" y="24" width="108" height="40" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="598" y="43" fill="var(--text)" font-size="10.5">responder</text>
    <text x="598" y="57" fill="var(--text-dim)" font-size="9.5">execution 별도 이력</text>
  </g>
  <g stroke="var(--text-faint)" stroke-width="1.6" fill="none" marker-end="url(#cg-ar3)">
    <line x1="138" y1="44" x2="184" y2="44"/>
    <path d="M338 36 C 358 30, 364 26, 384 22"/>
    <path d="M338 52 C 358 58, 364 62, 384 68"/>
  </g>
  <g font-size="11">
    <rect x="8" y="110" width="310" height="46" rx="9" fill="var(--bg-card)" stroke="var(--accent-dim)"/>
    <text x="24" y="129" fill="var(--accent)" font-weight="700">Security Score ↑</text>
    <text x="24" y="146" fill="var(--text-dim)" font-size="10">시스템이 얼마나 안전한가 (높을수록 좋음)</text>
    <rect x="342" y="110" width="310" height="46" rx="9" fill="var(--bg-card)" stroke="var(--wrong)"/>
    <text x="358" y="129" fill="var(--wrong)" font-weight="700">Risk Score ↓</text>
    <text x="358" y="146" fill="var(--text-dim)" font-size="10">problem들이 만드는 위험 수준 (낮을수록 좋음) — 방향이 반대</text>
  </g>
</svg>`

const svgVerbs = `
<svg viewBox="0 0 660 210" font-family="Pretendard,sans-serif">
  <defs><marker id="cg-ar4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--pixel)"/></marker></defs>
  <g font-size="11" font-family="Consolas,monospace">
    <rect x="8"  y="14" width="400" height="130" rx="12" fill="none" stroke="var(--pixel)" stroke-width="1.6"/>
    <text x="26" y="36" fill="var(--pixel)" font-weight="700">manage</text>
    <rect x="26" y="46" width="290" height="88" rx="10" fill="none" stroke="var(--accent)" stroke-width="1.4"/>
    <text x="44" y="66" fill="var(--accent)" font-weight="700">use</text>
    <rect x="44" y="74" width="190" height="50" rx="8" fill="none" stroke="var(--line)"/>
    <text x="60" y="93" fill="var(--text-dim)">read</text>
    <rect x="60" y="99" width="120" height="18" rx="5" fill="var(--bg-card)" stroke="var(--line-soft)"/>
    <text x="120" y="112" fill="var(--text-faint)" text-anchor="middle" font-size="10">inspect</text>
  </g>
  <g font-size="10" font-family="Pretendard">
    <text x="330" y="66" fill="var(--accent)">← problem 상태 변경</text>
    <text x="330" y="80" fill="var(--accent)">   responder 수동 트리거</text>
    <text x="330" y="94" fill="var(--accent)">   recipe 수정</text>
    <text x="424" y="36" fill="var(--pixel)">← recipe·target 생성/삭제는 여기서만</text>
  </g>
  <text x="8" y="166" font-size="10.5" fill="var(--text-dim)" font-family="Pretendard">verb 포함 관계: inspect &lt; read &lt; use &lt; manage — aggregate는 cloud-guard-family</text>
  <g font-size="10.5">
    <rect x="8" y="176" width="404" height="26" rx="7" fill="var(--bg-inset)" stroke="var(--line-soft)"/>
    <text x="20" y="193" fill="var(--text)" font-family="Consolas,monospace">allow service cloudguard to &lt;verb&gt; &lt;resource_type&gt; …</text>
    <line x1="416" y1="189" x2="470" y2="189" stroke="var(--pixel)" stroke-width="1.5" marker-end="url(#cg-ar4)"/>
    <text x="478" y="193" fill="var(--text-dim)" font-family="Pretendard">Responder가 리소스를 실제로 고칠 때 필요</text>
  </g>
</svg>`

export const cloudGuard: Sheet = {
  curriculum: 'oci-security',
  topic: 'cloud-guard',
  sheet: 'cloud-guard',
  title: 'Cloud Guard — 탐지와 대응의 골격',
  tags: ['oci', 'security', 'cloud-guard', 'iam'],
  difficulty: 2,
  estimated_minutes: 50,
  goal: 'Target→Detector→Problem→Responder 모델 + verb 단계 권한 설계',
  concepts: [
    {
      id: 'c1', title: '개념 1. 처리 모델 — Target → Detector → Problem → Responder', diagram: svgPipeline,
      body: `<pre>├── Target ──────── Cloud Guard가 감시하는 대상 (compartment 단위로 리소스 지정)
├── Detector ────── 검사 규칙. recipe(규칙 묶음)를 target에 붙여서 동작
├── Problem ─────── detector가 잡아낸 이슈. 조회·필터·해결·기각의 lifecycle을 가짐
└── Responder ───── problem에 대한 교정 액션. 설정에 따라 제안만 하거나 자동 실행</pre>`,
    },
    {
      id: 'c2', title: '개념 2. Detector 4종과 recipe 소유권', diagram: svgDetectors,
      body: `<p>recipe 소유권이 실무 포인트 — <b>Oracle-managed recipe는 직접 수정 불가</b>. 규칙을 조정하려면 user-managed로 <b>clone</b> 해서 사용. clone본은 원본과의 연결(ties)을 유지해 규칙 업데이트를 이어받음.</p>`,
    },
    {
      id: 'c3', title: '개념 3. Problem lifecycle과 점수', diagram: svgLifecycle,
      body: `<ul><li>Problem은 Problems 페이지에서 조회·정렬·필터·일괄 상태 변경 가능</li><li>Responder 실행 이력은 problem과 별개 리소스(responder execution)로 남음</li></ul>`,
    },
    {
      id: 'c4', title: '개념 4. IAM 권한 설계 — verb 단계가 곧 역할 설계', diagram: svgVerbs,
      body: `<p>실무에서 자주 쓰는 검증된 정책:</p><pre>Allow group SecurityAdmins to manage cloud-guard-family in tenancy</pre><p>Responder가 리소스를 실제로 고치려면 <b>Cloud Guard 서비스 자체</b>에게 권한이 필요:</p><pre>allow service cloudguard to &lt;verb&gt; &lt;resource_type&gt; in &lt;compartment or tenancy details&gt;</pre>`,
    },
  ],
  sources: [
    { label: 'Cloud Guard 개요 — Oracle Docs', url: 'https://docs.oracle.com/en-us/iaas/cloud-guard/using/index.htm' },
    { label: 'IAM Policies for Cloud Guard', url: 'https://docs.oracle.com/en-us/iaas/Content/cloud-guard/using/policies.htm' },
  ],
  scenarios: [
    {
      id: 's1', type: 'ox',
      situation: "동료가 'Oracle-managed detector recipe에서 불필요한 규칙을 끄면 되니까 그냥 원본 recipe를 편집하자'고 한다.",
      question: '이 말은 맞다 (O/X)',
      answers: ['X'],
      explanation: 'Oracle-managed recipe는 직접 수정할 수 없다. user-managed로 clone한 뒤 규칙을 조정한다. clone본은 원본과의 연결을 유지해 업데이트를 이어받는다.',
      concept_anchor: 'c2', xp: 10,
    },
    {
      id: 's2', type: 'choice',
      situation: "고객사에서 '퍼블릭으로 노출된 Object Storage 버킷 같은 설정 실수를 자동으로 잡아달라'는 요구가 왔다.",
      question: '이 요구에 해당하는 detector 종류는?',
      choices: ['Activity Detector', 'Configuration Detector', 'Threat Detector', 'Instance Security Detector'],
      answers: ['2'],
      explanation: '설정 상태의 취약점은 Configuration Detector 영역. Activity는 사용자 행위, Threat은 악성 패턴, Instance Security는 호스트 내부 활동을 본다.',
      concept_anchor: 'c2', xp: 10,
    },
    {
      id: 's3', type: 'command',
      situation: '보안팀 그룹 SecurityAdmins에게 tenancy 전체의 Cloud Guard 관리 권한을 부여해야 한다.',
      question: '필요한 IAM 정책 한 줄은? (공식 문서 예시 그대로)',
      answers: ['Allow group SecurityAdmins to manage cloud-guard-family in tenancy', 'allow group SecurityAdmins to manage cloud-guard-family in tenancy'],
      match: 'exact-trim',
      explanation: 'cloud-guard-family aggregate + manage verb. 공식 Policy Examples에 있는 verbatim 정책이다.',
      concept_anchor: 'c4', xp: 10,
    },
    {
      id: 's4', type: 'choice',
      situation: "운영 담당자에게 'problem 상태 변경과 responder 수동 트리거는 허용하되, detector recipe나 target의 생성·삭제는 막아달라'는 요구.",
      question: 'cloud-guard-family에 부여할 최소 verb는?',
      choices: ['inspect', 'read', 'use', 'manage'],
      answers: ['3'],
      explanation: '공식 permission 표에서 CG_PROBLEM_UPDATE(상태 변경·responder 트리거)는 use 단계에 포함되고, recipe·target의 CREATE/DELETE는 manage에서만 열린다.',
      concept_anchor: 'c4', xp: 10,
    },
    {
      id: 's5', type: 'essay',
      situation: 'responder rule을 자동 실행으로 켰는데, problem은 계속 쌓이고 교정 액션은 실행되지 않는다는 고객 문의.',
      question: '가장 먼저 확인할 두 가지와 그 이유를 서술하라.',
      answers: [],
      rubric: '① target에 붙은 responder recipe에서 해당 rule의 실행 설정(자동 여부·조건) 확인 ② cloudguard 서비스 principal에 대상 리소스를 조작할 IAM 정책(allow service cloudguard to <verb> <resource_type> …)이 있는지 확인. 두 가지 모두 언급 시 O, 하나만 △.',
      explanation: 'responder 실행은 rule 설정과 서비스 권한 두 조건이 모두 충족돼야 한다. 탐지(problem 생성)는 되는데 대응만 안 되면 실행 경로 쪽 — 설정 또는 서비스 principal 권한이 첫 갈림길.',
      concept_anchor: 'c4', xp: 10,
    },
  ],
}
