// 프로필 정본 — 자격증·커리어 방향은 cc9(indivisual) cover-letter/profile.md 기준(2026-08 반영)
// 갱신 시 이 파일만 수정. 개조식·이모지 금지.

export const PROFILE = {
  name: '정지안',
  role: 'Oracle Cloud SA · 클라우드 MSP 엔지니어',
  company: '위즈베이스(Wizbase) OCI사업부',
  since: '2025.02.17 입사 · OCI 1년+',
  tagline: '클라우드를 가장 선명하게 바라보는 엔지니어 — OCI 깊이 위에 멀티클라우드·IaC·네트워크·쿠버네티스로 아키텍트를 향해',
  github: 'https://github.com/jja6312',
}

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

// 취득 예정 / 학습 로드맵 — 이정표
export interface Upcoming {
  label: string
  when: string
  status: 'progress' | 'planned'
}
export const UPCOMING: Upcoming[] = [
  { label: 'RHCSA → RHCE', when: '진행 중', status: 'progress' },
  { label: 'CKA (Kubernetes)', when: '올해', status: 'planned' },
  { label: 'AWS SAP (Solutions Architect Pro)', when: '올해', status: 'planned' },
  { label: '빅데이터분석기사', when: '올해', status: 'planned' },
  { label: '정보통신기술사', when: '2년 뒤~', status: 'planned' },
]

// 방향성 — 1/3/5년 이정표 (개조식)
export interface Horizon {
  span: string
  points: string[]
}
export const ROADMAP: Horizon[] = [
  {
    span: '1년',
    points: [
      'OCI 깊이 위에 AWS·GCP·Azure 멀티클라우드 확장 (IaC 병행)',
      'RHCSA → RHCE 취득으로 Linux 골격 다지기',
      '개인서버 VPN 연결 실습 — 네트워크 흐름 체득',
      '쿠버네티스 운영 수준까지',
      '데이터 분석 직접 경험 — 인프라 커뮤니케이션 근육',
      'HPC 실무 경험 개인 반복 심화',
    ],
  },
  {
    span: '3년',
    points: [
      'Azure·GCP 섭렵 (IaC 동반)',
      '멀티클라우드 설계·구축·운영 전 영역 자립',
    ],
  },
  {
    span: '5년',
    points: [
      '정보통신기술사 취득',
      'IT 전반 컨설팅·아키텍팅이 가능한 아키텍트 수준',
    ],
  },
]
