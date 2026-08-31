// CLI UI Wizard — 실무 composition 시작 템플릿(스타터 그래프) 레지스트리.
// 각 템플릿은 WizardGraph 이며, 로드 즉시 composeBlueprint 로 검증된 bash 를 생성한다.
// 현재는 검증된 네트워크 7모듈(vcn/igw/nat/sgw/route-table/security-list/subnet)로 구성.
// compute/LB/DB 를 담는 상위 스택은 모듈 + blueprint 응답계약 확장 후 추가(로드맵).

// x/y 는 VCN·floating 노드에만 의미가 있고 자식은 layoutGraph 가 재계산한다. 단, 드래그
// 기준선(n.x ?? 0)과 렌더 기본값(vcn.x ?? 40)이 어긋나면 첫 드래그에 ~40px 점프가 생기므로
// VCN 노드는 렌더 기본값과 같은 좌표를 명시해 "모든 노드가 좌표를 가진다" 불변식을 지킨다.
const N = (id, moduleType, role, inputs = {}, x, y) => ({
  id, moduleType, role, label: id, inputs,
  ...(x != null ? { x, y } : {}),
})
const E = (from, to, slot) => ({ id: `${from}->${to}:${slot}`, from, to, slot })

/** 공통 실행/명명 헤더. customer/workload 만 템플릿별로 채우고 나머지는 사용자가 조정. */
function base(id, label, workload) {
  return {
    schemaVersion: 1, id, label, namingPolicyId: 'msp-standard',
    execution: { region: 'ap-seoul-1', compartment: '', profile: 'DEFAULT', compartmentMode: 'OCID' },
    naming: { customer: '', workload, environment: 'prd', regionAlias: 'icn', sequence: '01' },
  }
}

// ① 인터넷 대면 단일 서브넷 — 웹/API 앞단 최소 구성
function publicSingle() {
  return {
    ...base('wiz-public-single', '인터넷 대면 단일 서브넷', 'web'),
    nodes: [
      N('vcn', 'vcn', 'main', { vcnCidrs: '["10.0.0.0/16"]' }, 40, 40),
      N('igw', 'internet-gateway', 'main'),
      N('rtpub', 'route-table', 'public'),
      N('slpub', 'security-list', 'public', { enableSshIngress: 'true', sshSourceCidr: '0.0.0.0/0' }),
      N('subpub', 'subnet', 'public', { cidr: '10.0.10.0/24' }),
    ],
    edges: [
      E('vcn', 'igw', 'vcn'),
      E('vcn', 'rtpub', 'vcn'), E('igw', 'rtpub', 'route-target'),
      E('vcn', 'slpub', 'vcn'),
      E('vcn', 'subpub', 'vcn'), E('rtpub', 'subpub', 'route-table'), E('slpub', 'subpub', 'security-list'),
    ],
  }
}

// ② 아웃바운드 전용 단일 서브넷 — 인터넷에 안 보이되 패치/OCI서비스는 사용
function privateSingle() {
  return {
    ...base('wiz-private-single', '아웃바운드 전용 단일 서브넷', 'app'),
    nodes: [
      N('vcn', 'vcn', 'main', { vcnCidrs: '["10.0.0.0/16"]' }, 40, 40),
      N('nat', 'nat-gateway', 'main'),
      N('sgw', 'service-gateway', 'main'),
      N('rtpriv', 'route-table', 'private'),
      N('slpriv', 'security-list', 'private', { enableSshIngress: 'false' }),
      N('subpriv', 'subnet', 'private', { cidr: '10.0.20.0/24' }),
    ],
    edges: [
      E('vcn', 'nat', 'vcn'), E('vcn', 'sgw', 'vcn'),
      E('vcn', 'rtpriv', 'vcn'), E('nat', 'rtpriv', 'route-target'), E('sgw', 'rtpriv', 'route-target'),
      E('vcn', 'slpriv', 'vcn'),
      E('vcn', 'subpriv', 'vcn'), E('rtpriv', 'subpriv', 'route-table'), E('slpriv', 'subpriv', 'security-list'),
    ],
  }
}

// ③ Public/Private 2-Tier — MSP 온보딩 기본 네트워크 기준선(10 노드)
function twoTier() {
  return {
    ...base('wiz-two-tier', 'Public/Private 2-Tier 네트워크', 'web'),
    naming: { customer: '', workload: 'web', environment: 'prd', regionAlias: 'icn', sequence: '01' },
    nodes: [
      N('vcn', 'vcn', 'main', { vcnCidrs: '["10.0.0.0/16"]' }, 40, 40),
      N('igw', 'internet-gateway', 'main'), N('nat', 'nat-gateway', 'main'), N('sgw', 'service-gateway', 'main'),
      N('rtpub', 'route-table', 'public'), N('rtpriv', 'route-table', 'private'),
      N('slpub', 'security-list', 'public', { enableSshIngress: 'true', sshSourceCidr: '0.0.0.0/0' }),
      N('slpriv', 'security-list', 'private', { enableSshIngress: 'false' }),
      N('subpub', 'subnet', 'public', { cidr: '10.0.10.0/24' }),
      N('subpriv', 'subnet', 'private', { cidr: '10.0.20.0/24' }),
    ],
    edges: [
      E('vcn', 'igw', 'vcn'), E('vcn', 'nat', 'vcn'), E('vcn', 'sgw', 'vcn'),
      E('vcn', 'rtpub', 'vcn'), E('igw', 'rtpub', 'route-target'),
      E('vcn', 'rtpriv', 'vcn'), E('nat', 'rtpriv', 'route-target'), E('sgw', 'rtpriv', 'route-target'),
      E('vcn', 'slpub', 'vcn'), E('vcn', 'slpriv', 'vcn'),
      E('vcn', 'subpub', 'vcn'), E('rtpub', 'subpub', 'route-table'), E('slpub', 'subpub', 'security-list'),
      E('vcn', 'subpriv', 'vcn'), E('rtpriv', 'subpriv', 'route-table'), E('slpriv', 'subpriv', 'security-list'),
    ],
  }
}

// ④ 게이트웨이 허브 — VCN + IGW/NAT/SGW 만 먼저. 서브넷은 이후 팔레트로 추가
function gatewayHub() {
  return {
    ...base('wiz-gateway-hub', '게이트웨이 허브(서브넷 이후 추가)', 'net'),
    nodes: [
      N('vcn', 'vcn', 'main', { vcnCidrs: '["10.0.0.0/16"]' }, 40, 40),
      N('igw', 'internet-gateway', 'main'), N('nat', 'nat-gateway', 'main'), N('sgw', 'service-gateway', 'main'),
    ],
    edges: [E('vcn', 'igw', 'vcn'), E('vcn', 'nat', 'vcn'), E('vcn', 'sgw', 'vcn')],
  }
}

/**
 * 템플릿 레지스트리. label/description 는 갤러리 표시용, graph 는 로드 대상.
 * @type {{ id: string, label: string, description: string, tags: string[], build: () => import('./wizardCompose.d.mts').WizardGraph }[]}
 */
export const WIZARD_TEMPLATES = [
  { id: 'public-single', label: '인터넷 대면 단일 서브넷', tags: ['네트워크', '웹'],
    description: 'VCN·IGW·퍼블릭 라우트/시큐리티리스트·퍼블릭 서브넷. 인터넷에 바로 노출되는 최소 구성.', build: publicSingle },
  { id: 'private-single', label: '아웃바운드 전용 단일 서브넷', tags: ['네트워크', '내부'],
    description: 'VCN·NAT·Service Gateway·프라이빗 라우트/시큐리티리스트·프라이빗 서브넷. 인터넷 비노출 + 패치/OCI서비스 아웃바운드.', build: privateSingle },
  { id: 'two-tier', label: 'Public/Private 2-Tier', tags: ['네트워크', '기준선'],
    description: 'IGW·NAT·SGW + 퍼블릭/프라이빗 2계층. MSP 신규 온보딩의 표준 네트워크 기준선(10 노드).', build: twoTier },
  { id: 'gateway-hub', label: '게이트웨이 허브', tags: ['네트워크', '시작점'],
    description: 'VCN + IGW/NAT/SGW 만 먼저 깔고 서브넷은 이후 추가. 연결 기반부터 잡을 때.', build: gatewayHub },
]
