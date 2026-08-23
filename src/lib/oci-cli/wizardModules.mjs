// CLI UI Wizard — 재사용 리소스 모듈 레지스트리(코드). network-baseline-2tier 의 손수작성 노드를
// 자원 타입별 재사용 부품으로 일반화한 것. 사용자가 캔버스에서 이 모듈들을 자유 조합하면
// wizardCompose 가 런타임 CliBlueprint 로 컴파일하고, 기존 블루프린트 엔진이 그대로 렌더/플랜/검증한다.
//
// 모든 모듈 공통(컴포저가 자동 부여): --compartment-id(context) · --display-name(name) ·
//   --freeform-tags(derived managedFreeformTags) · --defined-tags(input metadata.definedTags),
//   비교필드 lifecycleState(AVAILABLE)+managedTags(tagSubset), verify available+managed-tags,
//   rollback ownership(CREATED+blueprint-run-id), 출력 id+lifecycleState.
// 아래 레지스트리는 그 위의 "차이"만 기술한다.

/** 게이트웨이가 route rule 로 접힐 때의 목적지 규칙(route-table 의 route-target 엣지에서 사용) */
const ROUTE_TARGET = {
  'internet-gateway': { destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', desc: 'default route via internet gateway' },
  'nat-gateway': { destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', desc: 'default route via NAT gateway' },
  'service-gateway': { destinationDiscovery: ['oracleServicesNetworkAll', '/cidr-block'], destinationType: 'SERVICE_CIDR_BLOCK', desc: 'OCI services route via service gateway' },
}

export const WIZARD_MODULES = {
  vcn: {
    type: 'vcn', label: 'VCN', group: 'network', resource: 'vcn', defaultRole: 'main', dnsLabel: true,
    scalarInputs: [{ key: 'vcnCidrs', option: '--cidr-blocks', type: 'stringArray', required: true, label: 'VCN CIDR 블록', default: '["10.0.0.0/16"]', comparator: 'cidrSet', dnsLabelSource: false }],
    fixed: {},
    edgeSlots: [], // 루트 — 들어오는 엣지 없음
    extraOutputs: { defaultDhcpOptionsId: { pointer: '/data/default-dhcp-options-id', type: 'string' } },
    getIdOption: '--vcn-id', deleteIdOption: '--vcn-id',
    collect: { '/data/compartment-id': 'string', '/data/cidr-blocks': 'json', '/data/dns-label': 'string' },
    extraComparison: [
      { key: 'compartmentId', src: { context: 'compartmentId' }, actualPointer: '/data/compartment-id', comparator: 'string' },
      { key: 'cidrBlocks', src: { scalar: 'vcnCidrs' }, actualPointer: '/data/cidr-blocks', comparator: 'cidrSet' },
      { key: 'dnsLabel', src: { dnsLabel: true }, actualPointer: '/data/dns-label', comparator: 'string' },
    ],
    extraVerify: [],
  },

  'internet-gateway': {
    type: 'internet-gateway', label: 'Internet Gateway', group: 'network', resource: 'internet-gateway', defaultRole: 'main',
    scalarInputs: [], fixed: { '--is-enabled': true },
    edgeSlots: [{ slot: 'vcn', option: '--vcn-id', target: 'vcn', pointer: '/data/id', required: true }],
    getIdOption: '--ig-id', deleteIdOption: '--ig-id',
    collect: { '/data/vcn-id': 'string', '/data/is-enabled': 'boolean' },
    extraComparison: [
      { key: 'vcnId', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'string' },
      { key: 'isEnabled', src: { literal: true }, actualPointer: '/data/is-enabled', comparator: 'boolean' },
    ],
    extraVerify: [{ id: 'vcn', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'equals' }],
    asRouteTarget: true,
  },

  'nat-gateway': {
    type: 'nat-gateway', label: 'NAT Gateway', group: 'network', resource: 'nat-gateway', defaultRole: 'main',
    scalarInputs: [], fixed: {},
    edgeSlots: [{ slot: 'vcn', option: '--vcn-id', target: 'vcn', pointer: '/data/id', required: true }],
    getIdOption: '--nat-gateway-id', deleteIdOption: '--nat-gateway-id',
    collect: { '/data/vcn-id': 'string', '/data/block-traffic': 'boolean' },
    extraComparison: [
      { key: 'vcnId', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'string' },
      { key: 'blockTraffic', src: { literal: false }, actualPointer: '/data/block-traffic', comparator: 'boolean' },
    ],
    extraVerify: [{ id: 'vcn', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'equals' }],
    asRouteTarget: true,
  },

  'service-gateway': {
    type: 'service-gateway', label: 'Service Gateway', group: 'network', resource: 'service-gateway', defaultRole: 'main',
    scalarInputs: [], fixed: {},
    edgeSlots: [{ slot: 'vcn', option: '--vcn-id', target: 'vcn', pointer: '/data/id', required: true }],
    // --services 는 read-only discovery(oracleServicesNetworkAll)로 자동 — 사용자가 그리지 않음
    servicesFromDiscovery: true,
    getIdOption: '--service-gateway-id', deleteIdOption: '--service-gateway-id',
    collect: { '/data/vcn-id': 'string', '/data/services': 'json' },
    extraComparison: [
      { key: 'vcnId', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'string' },
      { key: 'services', src: { services: true }, actualPointer: '/data/services', comparator: 'jsonSet' },
    ],
    extraVerify: [{ id: 'vcn', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'equals' }],
    asRouteTarget: true,
  },

  'route-table': {
    type: 'route-table', label: 'Route Table', group: 'network', resource: 'route-table', defaultRole: 'public',
    roles: ['public', 'private'], scalarInputs: [], fixed: {},
    edgeSlots: [
      { slot: 'vcn', option: '--vcn-id', target: 'vcn', pointer: '/data/id', required: true },
      { slot: 'route-target', option: '--route-rules', target: ['internet-gateway', 'nat-gateway', 'service-gateway'], pointer: '/data/id', required: true, multiple: true, as: 'routeRules' },
    ],
    getIdOption: '--rt-id', deleteIdOption: '--rt-id',
    collect: { '/data/vcn-id': 'string', '/data/route-rules': 'json' },
    extraComparison: [
      { key: 'vcnId', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'string' },
      { key: 'routeRules', src: { routeRules: true }, actualPointer: '/data/route-rules', comparator: 'jsonSet' },
    ],
    extraVerify: [{ id: 'rules', src: { routeRules: true }, actualPointer: '/data/route-rules', comparator: 'containsSet' }],
  },

  'security-list': {
    type: 'security-list', label: 'Security List', group: 'network', resource: 'security-list', defaultRole: 'public',
    roles: ['public', 'private'],
    scalarInputs: [
      { key: 'enableSshIngress', option: null, type: 'boolean', required: false, label: 'SSH 인그레스 허용', default: 'false' },
      { key: 'sshSourceCidr', option: null, type: 'string', required: false, label: 'SSH 허용 source CIDR', default: '0.0.0.0/0', requiredIf: 'enableSshIngress' },
    ],
    fixed: {}, securityRules: true,
    edgeSlots: [{ slot: 'vcn', option: '--vcn-id', target: 'vcn', pointer: '/data/id', required: true }],
    getIdOption: '--security-list-id', deleteIdOption: '--security-list-id',
    collect: { '/data/vcn-id': 'string', '/data/ingress-security-rules': 'json', '/data/egress-security-rules': 'json' },
    extraComparison: [
      { key: 'vcnId', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'string' },
      { key: 'ingressRules', src: { ingressRules: true }, actualPointer: '/data/ingress-security-rules', comparator: 'jsonSet' },
      { key: 'egressRules', src: { egressRules: true }, actualPointer: '/data/egress-security-rules', comparator: 'jsonSet' },
    ],
    extraVerify: [],
  },

  subnet: {
    type: 'subnet', label: 'Subnet', group: 'network', resource: 'subnet', defaultRole: 'public',
    roles: ['public', 'private'], dnsLabel: true,
    scalarInputs: [{ key: 'cidr', option: '--cidr-block', type: 'string', required: true, label: '서브넷 CIDR', default: '10.0.10.0/24', comparator: 'cidrSet' }],
    // public=false / private=true 는 role 에서 결정
    prohibitPublicIpByRole: { public: false, private: true },
    edgeSlots: [
      { slot: 'vcn', option: '--vcn-id', target: 'vcn', pointer: '/data/id', required: true },
      { slot: 'route-table', option: '--route-table-id', target: 'route-table', pointer: '/data/id', required: true },
      { slot: 'security-list', option: '--security-list-ids', target: 'security-list', pointer: '/data/id', required: true, multiple: true },
    ],
    // --dhcp-options-id 는 연결된 vcn 의 default-dhcp-options-id 에서 자동
    dhcpFromVcn: true,
    getIdOption: '--subnet-id', deleteIdOption: '--subnet-id',
    collect: { '/data/compartment-id': 'string', '/data/vcn-id': 'string', '/data/cidr-block': 'string', '/data/route-table-id': 'string', '/data/security-list-ids': 'json', '/data/dhcp-options-id': 'string', '/data/prohibit-public-ip-on-vnic': 'boolean', '/data/dns-label': 'string' },
    extraComparison: [
      { key: 'compartmentId', src: { context: 'compartmentId' }, actualPointer: '/data/compartment-id', comparator: 'string' },
      { key: 'vcnId', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'string' },
      { key: 'cidrBlock', src: { scalar: 'cidr' }, actualPointer: '/data/cidr-block', comparator: 'cidrSet' },
      { key: 'routeTableId', src: { edge: 'route-table' }, actualPointer: '/data/route-table-id', comparator: 'string' },
      { key: 'securityListIds', src: { edge: 'security-list', array: true }, actualPointer: '/data/security-list-ids', comparator: 'ocidSet' },
      { key: 'dhcpOptionsId', src: { dhcpFromVcn: true }, actualPointer: '/data/dhcp-options-id', comparator: 'string' },
      { key: 'prohibitPublicIp', src: { prohibitByRole: true }, actualPointer: '/data/prohibit-public-ip-on-vnic', comparator: 'boolean' },
      { key: 'dnsLabel', src: { dnsLabel: true }, actualPointer: '/data/dns-label', comparator: 'string' },
    ],
    extraVerify: [
      { id: 'vcn', src: { edge: 'vcn' }, actualPointer: '/data/vcn-id', comparator: 'equals' },
      { id: 'rt', src: { edge: 'route-table' }, actualPointer: '/data/route-table-id', comparator: 'equals' },
    ],
  },
}

export const MODULE_LIST = Object.values(WIZARD_MODULES).map(m => ({ type: m.type, label: m.label, group: m.group, roles: m.roles || [m.defaultRole] }))
export { ROUTE_TARGET }

/** 보안 규칙(security-list) — enableSshIngress/sshSourceCidr 로 만든다. wizardCompose 와 공유. */
export function buildSecurityRules(inputs) {
  const enabled = String(inputs.enableSshIngress ?? '').toLowerCase() === 'true'
  const src = String(inputs.sshSourceCidr ?? '').trim() || '0.0.0.0/0'
  const ingress = enabled ? [{ protocol: '6', source: src, sourceType: 'CIDR_BLOCK', isStateless: false, tcpOptions: { destinationPortRange: { min: 22, max: 22 } }, description: 'wizard: SSH ingress' }] : []
  const egress = [{ protocol: 'all', destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', isStateless: false, description: 'wizard: allow all egress' }]
  return { ingress, egress }
}
