export type LearningRequestForm = {
  topic: string
  currentLevel: string
  outcome: string
  courseType: string
  courseSize: string
  lessonMinutes: string
  environment: string
  handsOnResult: string
  workScenarios: string
  mustInclude: string
  exclude: string
  sourceRules: string
  constraints: string
}

export const EMPTY_LEARNING_REQUEST: LearningRequestForm = {
  topic: '',
  currentLevel: '',
  outcome: '',
  courseType: '',
  courseSize: '',
  lessonMinutes: '',
  environment: '',
  handsOnResult: '',
  workScenarios: '',
  mustInclude: '',
  exclude: '',
  sourceRules: '',
  constraints: '',
}

const field = (label: string, value: string, fallback = '별도 지정 없음') =>
  `- ${label}: ${value.trim() || fallback}`

export function buildLearningRequest(form: LearningRequestForm) {
  return `블로그 프로젝트에 아래 학습자료를 생성하고, 검증 후 자동으로 배포해줘.

[요청 개요]
${field('학습 주제', form.topic, '입력 필요')}
${field('현재 수준', form.currentLevel)}
${field('학습 완료 후 할 수 있어야 하는 일', form.outcome, '입력 필요')}
${field('구성 방식', form.courseType)}
${field('분량', form.courseSize)}
${field('학습지 1개당 목표 시간', form.lessonMinutes ? `${form.lessonMinutes}분` : '')}

[실습과 업무 맥락]
${field('실습 환경·사전 준비', form.environment)}
${field('최종 실습 결과물', form.handsOnResult)}
${field('반영할 실제 업무·장애 시나리오', form.workScenarios)}
${field('반드시 포함할 내용', form.mustInclude)}
${field('제외할 내용', form.exclude)}
${field('출처·최신성 기준', form.sourceRules)}
${field('그 밖의 제약', form.constraints)}

[학습지 설계 원칙 — 반드시 적용]
1. 먼저 현재 블로그의 curriculum, sheet 스키마와 기존 Education 자료를 조사한다. 이미 잘 설명된 기초는 연결·복습하고, 빠진 선수지식과 중복되지 않는 학습 경로를 설계한다.
2. 학습 목표는 “이해한다”가 아니라 설명·비교·구축·검증·진단처럼 관찰 가능한 행동으로 정의한다. 각 개념, 실습, 평가 문항을 이 목표에 연결한다.
3. 사실·명령·제품 동작은 최신 공식 문서와 1차 자료로 검증한다. 기억에 의존해 옵션이나 정책 문구를 만들지 말고, 직접 근거 URL을 남긴다. 변경 가능성이 있거나 확신이 낮은 내용은 명시한다.
4. 개념은 정의 나열이 아니라 왜 필요한지 → 어떻게 동작하는지 → 비슷한 선택지와의 차이 → 현업 판단 기준 → 흔한 오해 순서로 설명한다. 핵심 관계는 읽기 쉬운 다이어그램으로 시각화한다.
5. 실습은 실제 업무 요청 형태로 구성한다. 사전조건, 콘솔 경로와 CLI/API 예시, 변수 자리표시자, 예상 결과, 성공 판정, 실패 시 진단, 정리·롤백 절차를 포함한다. 비용·보안·권한·운영 위험도 함께 다룬다.
6. 단계별로 따라 치는 것에서 끝내지 않는다. 중간에는 예측 질문과 확인 지점을 두고, 마지막에는 도움 없이 재구성하거나 장애를 해결하는 독립 과제를 둔다.
7. 평가는 OX·선택·명령 작성·서술형을 목적에 맞게 섞는다. 정답뿐 아니라 오답이 왜 틀렸는지, 채점 기준, 연결되는 개념, 부분점수 기준을 제공한다.
8. 난이도는 선수지식 → 핵심 골격 → 통합 실습 → 변형 시나리오 순으로 상승시킨다. 상위 Level은 단순 분량 증가가 아니라 설계 판단, 트레이드오프, 장애 대응, 운영 자동화가 추가되어야 한다.
9. 민감정보를 예시에 넣지 말고 OCID·계정·IP·비밀번호는 안전한 자리표시자를 사용한다. 파괴적 명령은 대상 확인, 영향, 백업 또는 복구 절차를 함께 제시한다.
10. 초안을 만든 뒤 정확성, 목표 정렬, 실습 재현성, 설명 명료성, 평가 타당성, 최신 출처, 스키마 호환성을 스스로 점검하고 부족한 항목을 보완한 최종본만 반영한다.

[최종 산출물 및 완료 조건]
- 기존 블로그 형식에 맞는 커리큘럼과 완성된 학습지 데이터
- 각 학습지: 명확한 목표, 개념과 다이어그램, 실전 구축, 검증·롤백, 현업 시나리오, 채점 가능한 평가, 공식 출처
- 생성 스크립트와 스키마 호환성 확인
- lint, build 및 관련 테스트 통과
- 배포 완료 후 실제 사이트에서 메뉴·학습지·모바일 표시 확인

정보가 일부 비어 있어도 합리적인 가정을 명시하고 진행하되, 결과 구조를 크게 바꾸는 핵심 선택만 질문해줘.`
}

export const LEARNING_REQUEST_PRESETS: { label: string; description: string; patch: Partial<LearningRequestForm> }[] = [
  {
    label: '클라우드 실무',
    description: '구축·검증·장애 대응 중심',
    patch: {
      currentLevel: '클라우드 기본 개념과 콘솔 사용 경험은 있으나 해당 서비스 운영 경험은 적음',
      courseType: '주제별 Level 1~2',
      courseSize: 'Level별 학습지 3개 내외',
      environment: 'OCI 콘솔, Cloud Shell, OCI CLI를 사용할 수 있음',
      handsOnResult: '재현 가능한 최소 아키텍처를 구축하고 정상 동작을 명령으로 검증',
      workScenarios: '고객 요청을 받아 구축하고, 자주 발생하는 권한·네트워크·설정 오류를 진단',
      mustInclude: 'IAM, 네트워크 흐름, 비용, 보안, 모니터링, 정리·롤백',
    },
  },
  {
    label: '자격증 대비',
    description: '개념 구분과 판단 문제 중심',
    patch: {
      currentLevel: '기초 용어는 알고 있으나 비슷한 서비스와 옵션을 자주 혼동함',
      courseType: '7일 학습 스프린트',
      courseSize: '하루 1개 학습지, 마지막 날 종합 복습',
      handsOnResult: '핵심 기능을 직접 확인하는 짧은 실습과 시험형 판단 문제 풀이',
      workScenarios: '요구사항에 맞는 서비스·설계 선택, 틀린 구성 찾기, 비용과 가용성 비교',
      mustInclude: '시험 범위 매핑, 혼동 포인트 비교표, 오답 해설, 마지막 종합 모의평가',
    },
  },
  {
    label: '장애 대응',
    description: '증상에서 원인까지 진단 중심',
    patch: {
      currentLevel: '정상 구축은 가능하지만 장애 발생 시 점검 순서가 체계적이지 않음',
      courseType: '단일 심화 학습지',
      courseSize: '개념 3~5개와 종합 장애 실습 1개',
      handsOnResult: '의도적으로 장애를 만들고 관측 증거를 통해 원인을 격리한 뒤 복구',
      workScenarios: '고객 증상 접수 → 영향 범위 확인 → 가설 수립 → 증거 수집 → 복구 → 재발 방지',
      mustInclude: '진단 의사결정 트리, 로그·메트릭·CLI 확인법, 잘못된 가설, 에스컬레이션 기준',
    },
  },
]
