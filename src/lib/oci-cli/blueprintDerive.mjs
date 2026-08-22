// 엔진이 소유하는 파생값(고정 union 10키). 값 안의 OCID/실행값은 __ref 토큰으로 남겨
// compare 단계(→ discovery OCID)와 render 단계(→ bash 변수)가 같은 구조를 서로 다르게 해석한다.
//
// ⚠ 보안 기본값(security list): egress=전체 허용(아웃바운드), ingress=기본 전면 거부.
// SSH(22/tcp) 인그레스는 topology.enableSshIngress=true 이고 address.sshSourceCidr 가 있을 때만 추가한다.
// 앱 포트(80/443 등)는 baseline 에 열지 않는다 — 사용자가 이후 명시적으로 추가한다.

const ref = (node, path) => ({ __ref: 'node', node, path })
const runIdRef = () => ({ __ref: 'runId' })
const discoveryRef = (key, path) => ({ __ref: 'discovery', key, path })

function sshIngressRules(inputs) {
  const enabled = String(inputs['topology.enableSshIngress'] ?? '').toLowerCase() === 'true'
  const src = (inputs['address.sshSourceCidr'] || '').trim()
  if (!enabled || !src) return []
  return [{
    protocol: '6', // TCP
    source: src,
    sourceType: 'CIDR_BLOCK',
    isStateless: false,
    tcpOptions: { destinationPortRange: { min: 22, max: 22 } },
    description: 'blueprint: SSH ingress (enableSshIngress)',
  }]
}

const egressAll = () => ([{
  protocol: 'all',
  destination: '0.0.0.0/0',
  destinationType: 'CIDR_BLOCK',
  isStateless: false,
  description: 'blueprint: allow all egress',
}])

/**
 * @param {string} key
 * @param {{ blueprint:any, inputs:Record<string,string>, naming:any }} ctx
 * @returns {unknown}
 */
export function deriveValue(key, ctx) {
  const { inputs, naming } = ctx
  switch (key) {
    case 'vcnDnsLabel': return naming.names['vcn']?.dnsLabel ?? ''
    case 'publicSubnetDnsLabel': return naming.names['public-subnet']?.dnsLabel ?? ''
    case 'privateSubnetDnsLabel': return naming.names['private-subnet']?.dnsLabel ?? ''

    case 'managedFreeformTags':
      return { ...naming.staticTags, 'blueprint-run-id': runIdRef() }

    case 'publicRouteRules':
      return [{
        destination: '0.0.0.0/0',
        destinationType: 'CIDR_BLOCK',
        networkEntityId: ref('internet-gateway', '/data/id'),
        description: 'blueprint: default route via internet gateway',
      }]

    case 'privateRouteRules':
      return [
        {
          destination: '0.0.0.0/0',
          destinationType: 'CIDR_BLOCK',
          networkEntityId: ref('nat-gateway', '/data/id'),
          description: 'blueprint: default route via NAT gateway',
        },
        {
          destination: discoveryRef('oracleServicesNetworkAll', '/cidr-block'),
          destinationType: 'SERVICE_CIDR_BLOCK',
          networkEntityId: ref('service-gateway', '/data/id'),
          description: 'blueprint: OCI services route via service gateway',
        },
      ]

    case 'publicIngressRules': return sshIngressRules(inputs)
    case 'privateIngressRules': return sshIngressRules(inputs)
    case 'publicEgressRules': return egressAll()
    case 'privateEgressRules': return egressAll()

    default:
      throw new Error(`알 수 없는 derived key: ${key}`)
  }
}

export const DERIVED_KEYS = [
  'vcnDnsLabel', 'publicSubnetDnsLabel', 'privateSubnetDnsLabel', 'managedFreeformTags',
  'publicRouteRules', 'privateRouteRules',
  'publicIngressRules', 'publicEgressRules', 'privateIngressRules', 'privateEgressRules',
]

/** __ref 토큰을 resolver 로 치환한 순수 값을 만든다(재귀). resolver 는 토큰→값(문자열). */
export function materialize(value, resolver) {
  if (Array.isArray(value)) return value.map(v => materialize(v, resolver))
  if (value && typeof value === 'object') {
    if (value.__ref) return resolver(value)
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = materialize(v, resolver)
    return out
  }
  return value
}
