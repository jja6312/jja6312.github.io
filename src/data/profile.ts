// 프로필 정본 — 자격증·커리어 방향은 cc9(indivisual) cover-letter/profile.md 기준(2026-08 반영)
// 갱신 시 이 파일만 수정. 개조식·이모지 금지.

export const PROFILE = {
  name: '정지안',
  role: 'Oracle Cloud SA · 클라우드 MSP 엔지니어',
  company: '위즈베이스(Wizbase) OCI사업부',
  hireDate: '2025-02-17',   // 근속 자동계산 기준 (표시 문구는 ProfilePage 에서 오늘 날짜로 계산)
  tagline: 'OCI 깊이를 기반으로 멀티클라우드를 이해하는 엔지니어',
  github: 'https://github.com/jja6312',
}

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
