// 공개 학습글 번들 (blog-db learning/linux-basics 의 public 분).
// Phase 2 에서 blog-db PAT 연동으로 대체 — 지금은 빌드 시 정적 포함.
import type { Curriculum, Sheet } from '../types'

export const linuxBasics: Curriculum = {
  id: 'linux-basics',
  title: '리눅스 기본',
  description: 'OCI 인스턴스 운영에 필요한 리눅스 핵심을 5일로 압축. 개념→시나리오→채점.',
  difficulty: 1,
  public: true,
  tags: ['linux', 'os', 'oci'],
  created: '2026-08-02',
  days: [
    { day: 1, sheet: 'day01-boot-and-systemd', title: '부팅 과정과 systemd 서비스', goal: '부팅 5단계를 순서대로 말할 수 있고, 서비스 장애 시 systemctl/journalctl로 첫 진입을 한다', estimated_minutes: 50 },
    { day: 2, sheet: 'day02-storage-and-lvm', title: '파일시스템과 LVM', goal: '블록 디바이스→PV→VG→LV→fs 체인을 그릴 수 있고, 디스크 증설을 무중단으로 수행한다', estimated_minutes: 60 },
    { day: 3, sheet: 'day03-host-networking', title: '호스트 네트워킹', goal: "ip/ss/firewalld로 '어디서 막혔나'를 3분 안에 좁힌다", estimated_minutes: 50 },
    { day: 4, sheet: 'day04-users-and-permissions', title: '사용자·권한·보안', goal: 'sudo/소유권/모드/SELinux 컨텍스트 문제를 구분해서 진단한다', estimated_minutes: 45 },
    { day: 5, sheet: 'day05-logs-and-troubleshooting', title: '로그와 트러블슈팅', goal: 'journald/rsyslog 구조를 알고, 장애 접수 시 로그 우선 원칙으로 원인을 좁힌다', estimated_minutes: 55 },
  ],
}

const svgBoot = `
<svg viewBox="0 0 660 150" font-family="Pretendard,sans-serif">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)"/></marker></defs>
  <g text-anchor="middle" font-size="12.5">
    <rect x="8" y="34" width="110" height="46" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="63" y="54" fill="var(--text)" font-weight="600">펌웨어</text><text x="63" y="70" fill="var(--text-dim)" font-size="10.5">BIOS / UEFI</text>
    <rect x="142" y="34" width="110" height="46" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="197" y="54" fill="var(--text)" font-weight="600">부트로더</text><text x="197" y="70" fill="var(--text-dim)" font-size="10.5">GRUB2</text>
    <rect x="276" y="34" width="110" height="46" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="331" y="54" fill="var(--text)" font-weight="600">커널</text><text x="331" y="70" fill="var(--text-dim)" font-size="10.5">루트 fs 마운트</text>
    <rect x="410" y="34" width="110" height="46" rx="9" fill="var(--accent-glow)" stroke="var(--accent)"/>
    <text x="465" y="54" fill="var(--accent)" font-weight="700">systemd</text><text x="465" y="70" fill="var(--text-dim)" font-size="10.5">PID 1</text>
    <rect x="544" y="34" width="110" height="46" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="599" y="54" fill="var(--text)" font-weight="600">target 도달</text><text x="599" y="70" fill="var(--text-dim)" font-size="10.5">multi-user</text>
  </g>
  <g stroke="var(--text-faint)" stroke-width="1.6" marker-end="url(#ar)">
    <line x1="118" y1="57" x2="138" y2="57"/><line x1="252" y1="57" x2="272" y2="57"/>
    <line x1="386" y1="57" x2="406" y2="57"/><line x1="520" y1="57" x2="540" y2="57"/>
  </g>
  <g text-anchor="middle" font-size="10" fill="var(--text-faint)">
    <text x="63" y="105">HW 점검·부트 디바이스</text><text x="197" y="105">커널+initramfs 로드</text>
    <text x="331" y="105">HW 초기화</text><text x="465" y="105">모든 프로세스의 조상</text><text x="599" y="105">유닛 병렬 기동</text>
  </g>
  <text x="330" y="140" text-anchor="middle" font-size="10.5" fill="var(--text-dim)">systemd 이후는 순차가 아니라 병렬 — 하나가 늦어도 나머지는 뜬다</text>
</svg>`

const svgUnits = `
<svg viewBox="0 0 660 240" font-family="Pretendard,sans-serif">
  <defs>
    <marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker>
    <marker id="ar3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--pixel)"/></marker>
  </defs>
  <rect x="10" y="14" width="450" height="196" rx="14" fill="none" stroke="var(--accent)" stroke-dasharray="7 5" stroke-width="1.6"/>
  <text x="28" y="40" font-size="13" fill="var(--accent)" font-weight="700">multi-user.target</text>
  <text x="160" y="40" font-size="10.5" fill="var(--text-faint)">= 유닛 묶음 (과거 runlevel의 후계)</text>
  <g font-size="12" text-anchor="middle">
    <rect x="40" y="70" width="130" height="40" rx="8" fill="var(--bg-card)" stroke="var(--line)"/><text x="105" y="94" fill="var(--text)">nginx.service</text>
    <rect x="40" y="150" width="130" height="40" rx="8" fill="var(--bg-card)" stroke="var(--line)"/><text x="105" y="174" fill="var(--text)">sshd.service</text>
    <rect x="290" y="70" width="140" height="40" rx="8" fill="var(--bg-card)" stroke="var(--line)"/><text x="360" y="94" fill="var(--text)">network.target</text>
    <rect x="290" y="150" width="140" height="40" rx="8" fill="var(--bg-card)" stroke="var(--line)"/><text x="360" y="174" fill="var(--text)">app.service</text>
  </g>
  <g font-size="10" font-family="Consolas,monospace">
    <line x1="170" y1="85" x2="286" y2="85" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#ar2)"/>
    <text x="228" y="78" text-anchor="middle" fill="var(--accent)">Requires=</text>
    <line x1="290" y1="165" x2="174" y2="165" stroke="var(--pixel)" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#ar3)"/>
    <text x="232" y="158" text-anchor="middle" fill="var(--pixel)">After=</text>
    <text x="232" y="184" text-anchor="middle" fill="var(--text-faint)" font-family="Pretendard">(순서만!)</text>
  </g>
  <g font-size="11">
    <rect x="480" y="60" width="170" height="120" rx="10" fill="var(--bg-card)" stroke="var(--line-soft)"/>
    <text x="495" y="84" fill="var(--text)" font-weight="700" font-size="11">의존성 3형제</text>
    <line x1="495" y1="100" x2="520" y2="100" stroke="var(--text-dim)" stroke-width="1.6"/><text x="527" y="104" fill="var(--text-dim)">Wants= 약한 의존</text>
    <line x1="495" y1="124" x2="520" y2="124" stroke="var(--accent)" stroke-width="1.6"/><text x="527" y="128" fill="var(--text-dim)">Requires= 강한 의존</text>
    <line x1="495" y1="148" x2="520" y2="148" stroke="var(--pixel)" stroke-width="1.6" stroke-dasharray="5 4"/><text x="527" y="152" fill="var(--text-dim)">After= 순서만</text>
  </g>
  <text x="330" y="232" text-anchor="middle" font-size="10.5" fill="var(--wrong)">⚠ After=는 의존이 아니라 순서 — 없어도 시작된다 (자주 틀리는 지점)</text>
</svg>`

const svgDiag = `
<svg viewBox="0 0 660 210" font-family="Pretendard,sans-serif">
  <defs><marker id="ar4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)"/></marker></defs>
  <g text-anchor="middle">
    <rect x="10" y="60" width="110" height="44" rx="22" fill="var(--wrong)" opacity="0.15" stroke="var(--wrong)"/>
    <text x="65" y="86" font-size="12.5" fill="var(--wrong)" font-weight="700">장애 접수</text>
    <rect x="170" y="60" width="150" height="44" rx="9" fill="var(--accent-glow)" stroke="var(--accent)"/>
    <text x="245" y="79" font-size="11.5" fill="var(--accent)" font-family="Consolas,monospace">systemctl status</text>
    <text x="245" y="95" font-size="10" fill="var(--text-dim)">상태 + 최근 로그 (첫 진입)</text>
    <rect x="370" y="14" width="150" height="44" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="445" y="33" font-size="11.5" fill="var(--text)" font-family="Consolas,monospace">journalctl -u -e</text>
    <text x="445" y="49" font-size="10" fill="var(--text-dim)">유닛 로그 전체 (원인 탐색)</text>
    <rect x="370" y="106" width="150" height="44" rx="9" fill="var(--bg-card)" stroke="var(--line)"/>
    <text x="445" y="125" font-size="11.5" fill="var(--text)" font-family="Consolas,monospace">list-dependencies</text>
    <text x="445" y="141" font-size="10" fill="var(--text-dim)">의존 체인 (연쇄 실패)</text>
  </g>
  <g stroke="var(--text-faint)" stroke-width="1.6" fill="none" marker-end="url(#ar4)">
    <line x1="120" y1="82" x2="166" y2="82"/>
    <path d="M320 74 C 345 60, 345 45, 366 38"/>
    <path d="M320 92 C 345 105, 345 120, 366 126"/>
  </g>
  <g font-size="10" fill="var(--text-faint)"><text x="333" y="42">원인 안 보임</text><text x="333" y="128">의존 의심</text></g>
  <g font-size="11">
    <rect x="10" y="160" width="310" height="40" rx="9" fill="var(--bg-card)" stroke="var(--line-soft)"/>
    <text x="24" y="178" fill="var(--pixel)" font-weight="700" font-size="10.5">enabled ≠ active</text>
    <text x="24" y="193" fill="var(--text-dim)" font-size="10.5">enabled=부팅 자동시작 / active=지금 실행 중 — 서로 독립</text>
  </g>
</svg>`

export const day01: Sheet = {
  curriculum: 'linux-basics',
  day: 1,
  sheet: 'day01-boot-and-systemd',
  title: '부팅 과정과 systemd 서비스',
  tags: ['linux', 'systemd', 'boot'],
  difficulty: 1,
  estimated_minutes: 50,
  goal: '부팅 5단계 + systemctl/journalctl 첫 진입',
  concepts: [
    { id: 'c1', title: '개념 1. 부팅 5단계', diagram: svgBoot, body: '' },
    {
      id: 'c2', title: '개념 2. 유닛과 target', diagram: svgUnits,
      body: `<ul><li>유닛(unit) = systemd가 관리하는 최소 단위. <code>*.service</code>(프로세스), <code>*.target</code>(그룹), <code>*.mount</code>, <code>*.timer</code> 등</li><li>서버 기본 target은 <code>multi-user.target</code></li></ul>`,
    },
    {
      id: 'c3', title: '개념 3. 서비스 상태 진단 3종', diagram: svgDiag,
      body: `<pre>systemctl status &lt;svc&gt;              ← 현재 상태 + 최근 로그 몇 줄 (첫 진입점)
journalctl -u &lt;svc&gt; -e              ← 해당 유닛 로그 전체 (원인 탐색)
systemctl list-dependencies &lt;svc&gt;   ← 의존 체인 (연쇄 실패 추적)</pre>`,
    },
  ],
  sources: [
    { label: 'Oracle Linux 9 — systemd 가이드', url: 'https://docs.oracle.com/en/operating-systems/oracle-linux/9/systemd/' },
    { label: 'systemd.unit(5) — freedesktop.org', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html' },
  ],
  scenarios: [
    {
      id: 's1', type: 'ox',
      situation: "동료가 'After=network.target 을 넣었으니 network이 없으면 이 서비스는 시작 안 된다'고 말한다.",
      question: '이 말은 맞다 (O/X)',
      answers: ['X'],
      explanation: 'After=는 <b>순서만</b> 지정한다. 의존(없으면 실패)을 원하면 Requires= 를 함께 써야 한다.',
      concept_anchor: 'c2', xp: 10,
    },
    {
      id: 's2', type: 'choice',
      situation: 'OCI VM 재부팅 후 웹 서비스가 안 떠 있다. systemctl status nginx 결과: inactive (dead), 유닛 파일 라인에 disabled.',
      question: '재부팅 때마다 자동으로 뜨게 하면서 지금 즉시 기동도 하는 가장 간결한 명령은?',
      choices: ['systemctl start nginx', 'systemctl enable nginx', 'systemctl enable --now nginx', 'systemctl restart nginx'],
      answers: ['3'],
      explanation: '<code>enable --now</code> = enable(부팅 자동시작) + start(즉시 기동) 동시 수행. start/restart만으로는 재부팅 시 또 안 뜬다.',
      concept_anchor: 'c3', xp: 10,
    },
    {
      id: 's3', type: 'command',
      situation: '고객 VM에서 sshd가 몇 분 전부터 접속 불가. 콘솔 접속은 된다.',
      question: 'sshd 유닛의 로그를 최신부터 확인하는 명령 한 줄은?',
      answers: ['journalctl -u sshd -e', 'journalctl -eu sshd', 'journalctl -u sshd.service -e', 'journalctl -u sshd --reverse', 'journalctl -r -u sshd'],
      match: 'normalize-flags',
      explanation: '<code>journalctl -u &lt;unit&gt;</code> 이 핵심. -e(끝으로 점프) 또는 -r(역순)로 최신 로그부터 본다.',
      concept_anchor: 'c3', xp: 10,
    },
    {
      id: 's4', type: 'command',
      situation: '부팅이 평소보다 오래 걸린다는 보고. 어떤 유닛이 병목인지 수치로 확인하고 싶다.',
      question: '유닛별 기동 소요 시간을 오래 걸린 순으로 보여주는 명령은?',
      answers: ['systemd-analyze blame'],
      match: 'exact-trim',
      explanation: '<code>systemd-analyze blame</code> 이 유닛별 소요시간 내림차순 목록. critical-chain 은 의존 경로상 병목만 보여준다.',
      concept_anchor: 'c1', xp: 10,
    },
    {
      id: 's5', type: 'essay',
      situation: '재부팅 후 앱 서비스가 죽어 있었는데 systemctl start 로는 정상 기동됐다. 고객이 원인을 묻는다.',
      question: '가장 먼저 확인할 두 가지와 그 이유를 서술하라.',
      answers: [],
      rubric: '① enabled 여부 (disabled면 부팅 자동시작 자체가 안 됨) ② journalctl -b -u <svc> 로 부팅 당시 실패 로그 (의존 유닛 미기동·타임아웃 등). 두 가지 모두 언급 시 O, 하나만 △.',
      explanation: "start가 되는데 부팅 후 죽어 있다 = '실행 능력'이 아니라 '자동 시작 경로'의 문제. enabled 상태와 부팅 시점 로그가 첫 갈림길.",
      concept_anchor: 'c3', xp: 10,
    },
  ],
}

export const sheets: Record<string, Sheet> = { 'day01-boot-and-systemd': day01 }
