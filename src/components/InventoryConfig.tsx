import type { InventoryResource, Json } from '../lib/inventory'
import { compactValue, formatValue } from '../lib/inventory'

const object=(v:Json | undefined): v is Record<string,Json> => !!v && typeof v==='object' && !Array.isArray(v)
const ports=(v:Json | undefined) => object(v) ? v.min===v.max?String(v.min):`${v.min}–${v.max}` : 'ALL'
const protocol=(v:Json | undefined) => ({'6':'TCP','17':'UDP','1':'ICMP','58':'ICMPv6','all':'ALL'}[String(v)]??String(v??'—'))
function ConfigTable({headers,rows}:{headers:string[];rows:Json[][]}) {
  return <div className="inv-table-scroll inv-config-table"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{compactValue(v)}</td>)}</tr>)}</tbody></table></div>
}
export function InventoryRules({resource:r,resources}:{resource:InventoryResource;resources:InventoryResource[]}) {
  const security:Json[][]=[]
  for(const [field,direction] of [['ingress_security_rules','INGRESS'],['egress_security_rules','EGRESS'],['security_rules','']]){
    const rules=r.raw[field]
    if(Array.isArray(rules))for(const rule of rules)if(object(rule)){
      const opts=rule.tcp_options??rule.udp_options
      security.push([rule.direction??direction,protocol(rule.protocol),rule.source??rule.destination??'',object(opts)?ports(opts.destination_port_range):'ALL',object(opts)?ports(opts.source_port_range):'ALL',rule.is_stateless?'Stateless':'Stateful',rule.icmp_options??null])
    }
  }
  const routes=r.raw.route_rules
  const statements=r.raw.statements
  return <>
    {security.length>0&&<><h3>접근 규칙 ({security.length})</h3><ConfigTable headers={['방향','프로토콜','출발지 / 목적지','목적지 포트','출발지 포트','상태 추적','ICMP']} rows={security}/></>}
    {Array.isArray(routes)&&routes.length>0&&<><h3>라우팅 규칙 ({routes.length})</h3><ConfigTable headers={['목적지','주소 유형','연결 대상','라우트 유형']} rows={routes.filter(object).map(v=>{const target=v.network_entity_id??v.next_hop_drg_attachment_id;return [v.destination??'',v.destination_type??'',resources.find(r=>r.ocid===target)?.name??target??'',v.route_type??'']})}/></>}
    {r.type==='Policy'&&Array.isArray(statements)&&<><h3>Policy Statements ({statements.length})</h3><ol className="inv-policy-statements">{statements.map((s,i)=><li key={i}>{formatValue(s)}</li>)}</ol></>}
  </>
}
