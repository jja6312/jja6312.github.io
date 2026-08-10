// 프로필 정본 — 자격증·커리어 방향은 cc9(indivisual) cover-letter/profile.md 기준(2026-08 반영)
// 갱신 시 이 파일만 수정. 개조식·이모지 금지.

export const PROFILE = {
  name: '정지안',
  role: '클라우드 MSP 엔지니어 · 운영 자동화',
  company: '위즈베이스(Wizbase) OCI사업부',
  hireDate: '2025-02-17',   // 근속 자동계산 기준 (표시 문구는 ProfilePage 에서 오늘 날짜로 계산)
  tagline: '고객 운영에서 발견한 반복과 장애를 자동화와 내부 플랫폼으로 바꾸는 엔지니어',
  summary: '20여 개 고객사의 OCI 환경을 구축·운영하며 장애 대응, 비용·리소스 모니터링 자동화, 마이그레이션과 네트워크 구축을 경험했습니다. 아직 해보지 않은 기술은 아는 척하지 않고, 실제 환경과 홈랩에서 검증한 범위를 넓혀가고 있습니다.',
  github: 'https://github.com/jja6312',
}

export interface CareerItem {
  company: string
  role: string
  period: string
  summary: string
  bullets: string[]
  tags: string[]
}

export const CAREER: CareerItem[] = [
  {
    company: '위즈베이스(Wizbase) OCI사업부',
    role: '클라우드 MSP 엔지니어',
    period: '2025.02 — 재직 중',
    summary: 'Oracle Cloud 기반 고객 환경의 구축·운영과 운영 자동화를 담당합니다.',
    bullets: [
      '20여 개 고객 환경의 프로비저닝, 모니터링, 정기 점검과 장애 대응',
      '비용·리소스 확인 업무를 자동화한 사내 CMP를 기획·개발·운영',
      '증권사 HPC 전환 PoC, AWS→OCI 마이그레이션, Palo Alto 연동 환경 구축 참여',
    ],
    tags: ['OCI', 'MSP', '운영', '자동화'],
  },
  {
    company: '메두사툴즈',
    role: '대표 · 3D 모델링/프린팅 제조·판매',
    period: '2018.12 — 2022.12',
    summary: '반려동물 모형을 직접 기획·생산·판매하며 작은 제조 사업을 운영했습니다.',
    bullets: [
      '60여 종 제품 출시, 오프라인 전시회 8회 참가, 누적 약 1억 원 매출',
      '청년창업사관학교 10기 선정, 지원금 5천만 원으로 제품 품질과 브랜딩 개선',
      '기획부터 생산·판매·고객 대응까지 끝까지 책임지는 실행 방식을 배움',
    ],
    tags: ['창업', '문제해결', '실행'],
  },
]

export interface ProfileHighlight {
  title: string
  context: string
  action: string
  result: string
  tags: string[]
}

export const PROFILE_HIGHLIGHTS: ProfileHighlight[] = [
  {
    title: '하루 1시간 반복 업무를 사내 플랫폼으로',
    context: '20여 고객 환경에 매일 로그인해 비용 사용량을 확인·기록하던 업무가 있었습니다.',
    action: 'OCI Python SDK 서버리스 배치로 수집을 자동화하고 Spring·React·MySQL 기반 CMP로 확장했습니다.',
    result: '사용량 시각화, 계약 만료·잔액 소진 인사이트와 리소스 변동 감지를 제공하며 영업 제안에도 활용되고 있습니다.',
    tags: ['Python SDK', 'Spring', 'React', 'MySQL'],
  },
  {
    title: 'SSH 장애의 우선 복구와 근본원인 제거',
    context: '재부팅 후 ping은 되지만 SSH 접속과 애플리케이션 구동이 되지 않는 고객 장애를 맡았습니다.',
    action: 'RunCommand로 애플리케이션을 먼저 구동한 뒤 tcpdump·부팅 로그·Console Connection으로 sshd 설정 오류를 추적했습니다.',
    result: '문의 후 약 10분 안에 긴급 상황을 낮추고, 잘못된 sshd_config 문자열까지 수정했습니다.',
    tags: ['Linux', 'RCA', 'RunCommand', 'tcpdump'],
  },
  {
    title: '증권사 HPC의 OCI 전환 PoC',
    context: '파생상품 평가용 HPC 환경을 온프레미스에서 OCI로 전환하는 프로젝트에 1년차 엔지니어로 참여했습니다.',
    action: 'Compute·Network·Storage와 HPC Pack/AD 구성을 학습하고, 다른 리전의 테스트 인프라를 처음부터 구축했습니다.',
    result: '테스트 리전 구축을 완수하고 고객 대상 OCI 콘솔 설명 세션을 담당했습니다. 핵심 아키텍처는 팀과 함께 설계·검증했습니다.',
    tags: ['OCI', 'HPC', 'Windows AD', 'Monitoring'],
  },
  {
    title: 'AWS에서 OCI로, 없는 기능은 작게 검증',
    context: 'EC2·RDS·Beanstalk 환경을 비용 문제로 OCI로 이전하는 고객에게 배포 기능의 공백이 있었습니다.',
    action: 'Object Storage ETag 변경 감지와 cron 배포를 구현하고, 태그 기반 롤링배포·롤백 구조를 설계·테스트했습니다.',
    result: '추가 관리형 서비스 없이 배포 자동화 가능성을 검증했으며 현재 이관을 진행하고 있습니다.',
    tags: ['AWS→OCI', 'Migration', '배포 자동화'],
  },
  {
    title: 'SNAT 뒤에 가려진 고객 IP 복원',
    context: 'Palo Alto 방화벽의 SNAT 때문에 서버가 실제 고객 IP를 식별하지 못했습니다.',
    action: 'Hub&Spoke 네트워크를 구축하고 앞단 Edge WAF의 X-Forwarded-For로 원본 IP가 전달되도록 구성했습니다.',
    result: '방화벽을 유지하면서 애플리케이션이 고객 IP를 식별할 수 있는 경로를 마련했습니다.',
    tags: ['Hub&Spoke', 'Palo Alto', 'WAF', 'XFF'],
  },
]

export interface SkillScope {
  label: string
  description: string
  items: string[]
}

export const SKILL_SCOPES: SkillScope[] = [
  {
    label: '업무에서 사용',
    description: '설명과 장애 대응이 가능한 범위',
    items: ['OCI 구축·운영', 'OCI CLI·SDK', 'OCI Monitoring', 'Linux 기본 장애 대응', 'VCN·LB·Hub&Spoke', 'Spring·React·MySQL'],
  },
  {
    label: '프로젝트에서 경험',
    description: '참여 범위와 깊이를 구분해 설명하는 기술',
    items: ['AWS→OCI 마이그레이션', 'Terraform 기반 프로비저닝', 'HPC Pack·Windows AD', 'Palo Alto·WAF', 'OpenStack·openstacksdk', 'GitHub·Gerrit 코드리뷰'],
  },
  {
    label: '학습·보강 중',
    description: '아직 운영 경험으로 단정하지 않는 영역',
    items: ['Kubernetes·CKA', 'Terraform 모듈·상태관리', 'RHCSA', 'Prometheus·Grafana', 'Ansible'],
  },
]

export const EDUCATION = [
  { name: '금오공과대학교 기계시스템공학과', period: '2014.03 — 2024.02', note: '학사 졸업. 군 복무와 4년간의 창업을 병행했습니다.' },
  { name: '네이버 클라우드캠프 DevOps 1기', period: '2023.06 — 2023.12', note: '1,032시간. 5인 팀장, 동료평가 1위(4.8/5)와 리더십상.' },
  { name: '삼성 청년 SW 아카데미(SSAFY) 12기', period: '2024.07 — 2024.11', note: 'Java 기반 백엔드 설계 중심 교육 수료.' },
  { name: '오픈소스 컨트리뷰션 아카데미 참여형', period: '2025.07 — 2025.12', note: 'OpenStack 생태계의 Gerrit 리뷰와 협업 과정을 경험했습니다.' },
]

// 오픈소스 기여이력 — 메인 레포 정식 머지분만. (링크는 실제 검증된 URL)
export interface Contribution {
  project: string
  repo: string
  ref: string             // PR #1057 · Merged / change 961895 · Merged
  kind: string            // Feature / Documentation
  title: string           // PR·change 제목 (verbatim)
  summary: string
  date: string
  url: string
}
export const CONTRIBUTIONS: Contribution[] = [
  {
    project: 'Oracle OCI CLI',
    repo: 'oracle/oci-cli',
    ref: 'PR #1057 · Merged',
    kind: 'Feature',
    title: 'fix: suggest true/false completions for BOOLEAN params in interactive mode',
    summary: '인터랙티브 모드(oci -i)에서 BOOLEAN 옵션의 Tab 자동완성이 되지 않던 버그를 수정. BOOLEAN 타입을 식별해 true/false 후보를 제안하도록 구현하여 Oracle 메인테이너 정식 머지(OCA Verified).',
    date: '2026.05',
    url: 'https://github.com/oracle/oci-cli/pull/1057',
  },
  {
    project: 'OpenStack · openstacksdk',
    repo: 'openstack/openstacksdk',
    ref: 'change 961895 · Merged',
    kind: 'Documentation',
    title: 'image: Fix docstring typo',
    summary: 'image(glance) 모듈 docstring 오탈자 수정. Gerrit 리뷰를 거쳐 openstacksdk 4.11.0 릴리스에 반영.',
    date: '2025',
    url: 'https://review.opendev.org/c/openstack/openstacksdk/+/961895',
  },
]

export interface Cert {
  name: string
  issued: string          // YYYY.MM
  expires?: string
  id?: string
}
export interface CertGroup {
  domain: string
  certs: Cert[]           // 최신 취득 순
}

// 영역별 분류 트리 — 취득일 최신 순
export const CERT_GROUPS: CertGroup[] = [
  {
    domain: 'Oracle / OCI',
    certs: [
      { name: 'OCI 2025 Certified Architect Professional', issued: '2025.12', id: '319033597OCICAP2025OPN' },
      { name: 'OCI 2025 Certified AI Foundations Associate', issued: '2025.11' },
      { name: 'Oracle Fusion AI Agent Studio Foundations Associate', issued: '2025.07', id: '319033597OFAASOFA' },
      { name: 'OCI 2025 Certified Architect Associate', issued: '2025.07', id: '319033597OCI25CAA' },
      { name: 'Oracle AI Vector Search Certified Professional', issued: '2025.04', id: '319033597DB23AIOCP' },
      { name: 'OCI 2024 Certified Foundations Associate', issued: '2025.02', id: '101216903OCI2024FNDCFA' },
    ],
  },
  {
    domain: '국내 클라우드 (KT / NCP)',
    certs: [
      { name: 'KT Cloud Certified Associate', issued: '2026.03', expires: '2029.03', id: 'KTC_CA260324_51181' },
      { name: 'Naver Cloud Platform Certified Professional', issued: '2024.01', id: 'NCP_20246906' },
      { name: 'Naver Cloud Platform Certified Associate', issued: '2023.08', id: 'NCP_20235837' },
    ],
  },
  {
    domain: 'AWS / Azure',
    certs: [
      { name: 'AWS Certified Solutions Architect – Associate', issued: '2024.01', expires: '2027.01', id: 'ecb51818e60a46b999a82bc48230e3ea' },
      { name: 'Microsoft Certified Azure Fundamentals', issued: '2025.03', id: '354FA9-2R610D' },
    ],
  },
  {
    domain: '국가기술자격 / 국내',
    certs: [
      { name: '네트워크관리사 2급', issued: '2025.04', id: 'NT2077280' },
      { name: '리눅스마스터 2급 (KAIT)', issued: '2025.01', id: 'LMS2404006041' },
      { name: '정보처리기사 (과기정통부)', issued: '2024.06', id: '24201011517T' },
      { name: 'SQLD (한국데이터진흥원)', issued: '2024.04', expires: '2036.12', id: 'SQLD-052009064' },
    ],
  },
  {
    domain: '수상 / 기여',
    certs: [
      { name: '2025 오픈소스 개발자대회 우수작 (한국오픈소스협회)', issued: '2025.12', id: 'fd7676a9-2dfe-4164-84b4-52878f4ef190' },
    ],
  },
]
