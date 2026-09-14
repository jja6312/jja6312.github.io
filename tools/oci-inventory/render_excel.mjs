import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Workbook, SpreadsheetFile, FileBlob } from '@oai/artifact-tool';

const [input, output, previewDir] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node render_excel.mjs snapshot.json output.xlsx [previewDir]');
const snapshot=JSON.parse(await fs.readFile(input,'utf8'));
if(snapshot.schema!=='oci-inventory/v3')throw Error('Unsupported snapshot schema');
const records=snapshot.resources;
const classes=JSON.parse(await fs.readFile(new URL('./resource_classes.json',import.meta.url),'utf8'));
const resourceClass=r=>classes.software_source.includes(r.type)?'software_source':classes.backup_history.includes(r.type)?'backup_history':'configuration';
const core=records.filter(r=>resourceClass(r)==='configuration');
const coreServices=new Map();for(const r of core)coreServices.set(r.service,(coreServices.get(r.service)??0)+1);
if(new Set(records.map(r=>r.key)).size!==records.length || snapshot.summary.resources!==records.length)throw Error('Resource count does not reconcile');
try { await fs.access(output); throw Error('Refusing to overwrite a dated workbook. Use a new run filename.'); } catch(e) { if(e.code!=='ENOENT')throw e; }
const wb=Workbook.create();
const colors={ink:'#192D45',header:'#243C59',muted:'#66768A',line:'#DFE5EB',pale:'#F1F4F7',blue:'#EDF3FA',warning:'#FFF0D5',accent:'#2D65A1'};
const col = n => {let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
const text = v => {const value=v==null?'—':typeof v==='object'?JSON.stringify(v):v;return typeof value==='string'&&value.length>30000?value.slice(0,29500)+'\n[표시 생략: 전체 자원 원문은 099_AIIndex / 098_RawChunks]':value};
const literal = v => typeof v==='string' && /^[=+@]/.test(v)?"'"+v:v;
function sheet(name,title) {
  const s=wb.worksheets.add(name);s.showGridLines=false;
  s.getRange('A1:AH4').format.font={name:'Arial',size:10,color:colors.ink};
  s.getRange('A:A').format.columnWidth=3;s.getRange('B:B').format.columnWidth=30;
  s.getRange('B2').values=[[title]];s.getRange('B2').format.font={name:'Arial',size:16,bold:true,color:colors.ink};s.getRange('2:2').format.rowHeight=28;
  s.getRange('B3').values=[[`${snapshot.tenancy.name} · ${snapshot.started_at.slice(0,10)}`]];s.getRange('B3').format.font={name:'Arial',size:10,color:colors.muted};
  s.freezePanes.freezeRows(4);return s;
}
function band(s,row,label,width=8,empty=false){const r=s.getRangeByIndexes(row-1,1,1,width);r.merge();r.values=[[label]];r.format={fill:empty?colors.pale:colors.blue,font:{name:'Arial',size:10,bold:true,color:empty?colors.muted:colors.ink},rowHeight:25};}
function table(s,row,headers,rows,widths){
  const end=col(headers.length); const range=s.getRange(`B${row}:${end}${row+rows.length}`);
  range.values=[headers,...rows.map(r=>r.map(v=>literal(text(v))))];
  range.format={font:{name:'Arial',size:10,color:colors.ink},rowHeight:29,verticalAlignment:'top'};
  const header=s.getRange(`B${row}:${end}${row}`);header.format={fill:rows.length?colors.header:'#D9DEE4',font:{name:'Arial',size:10,bold:true,color:rows.length?'#FFFFFF':colors.muted},rowHeight:30,wrapText:true,verticalAlignment:'center'};
  headers.forEach((_,i)=>{s.getRange(`${col(i+1)}:${col(i+1)}`).format.columnWidth=widths?.[i]??24});
  headers.forEach((_,i)=>{const values=rows.map(r=>r[i]).filter(v=>v!=null&&v!=='');if(values.length&&values.every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)))s.getRangeByIndexes(row,i+1,rows.length,1).setNumberFormat('yyyy-mm-dd hh:mm:ss')});
  if(rows.length){const body=s.getRange(`B${row+1}:${end}${row+rows.length}`);body.format.borders={insideHorizontal:{style:'hair',color:colors.line}};s.getRange(`B${row+1}:B${row+rows.length}`).format.wrapText=true;}
  return row+rows.length+3;
}
const overview=sheet('000_Overview','리소스 현행화');overview.freezePanes.unfreeze();overview.tabColor=colors.ink;
const changes=sheet('010_Changes','변경 이력');const deviations=sheet('020_Settings','설정 확인');const coverage=sheet('030_Coverage','수집 범위');const compartments=sheet('C00_Compartments','컴파트먼트별 구성 자원');
const serviceGroups=[...new Map(records.map(r=>[r.group,r.service])).entries()].sort((a,b)=>a[0]-b[0]);
const special=[[301,'SecurityRules','Security List / NSG 규칙'],[302,'RouteRules','라우팅 규칙'],[331,'LoadBalancerConfig','Load Balancer Listener / Backend'],[801,'PolicyStatements','IAM Policy Statements']];
const numbered=new Map([...serviceGroups.map(([g,n])=>[g,n,n]),...special].sort((a,b)=>a[0]-b[0]).map(([g,n,title])=>[g,sheet(`${String(g).padStart(3,'0')}_${n}`.slice(0,31),title)]));
const services=new Map(serviceGroups.map(([group])=>[group,numbered.get(group)]));
const rulesSheet=numbered.get(301),routesSheet=numbered.get(302),policySheet=numbered.get(801),lbSheet=numbered.get(331);
const rawIndex=sheet('099_AIIndex','AI 원본 인덱스');const rawChunks=sheet('098_RawChunks','긴 JSON 원문');const baseline=sheet('097_Baselines','설정 비교 기준');

const chunks=[];
function rawCell(key,value){const raw=JSON.stringify(value);if(raw.length<=30000)return raw;const start=chunks.length+6;for(let i=0;i<raw.length;i+=30000)chunks.push([key,Math.floor(i/30000)+1,raw.slice(i,i+30000)]);return `098_RawChunks!B${start}: 원문 ${Math.ceil(raw.length/30000)}조각을 순서대로 연결`}
const rawRows=records.map(r=>{
  return [r.key,r.compartment,r.region,r.service,r.type,r.name,r.state,r.freshness,r.detail_complete?'상세 확인':'상세 미완료',r.observed_at,r.ocid,r.parent_id,JSON.stringify(r.relations),rawCell(r.key,r.raw),r.previous_detail?rawCell(r.key+'::previous_detail',r.previous_detail):'',resourceClass(r)];
});
table(rawIndex,5,['Resource key','Compartment','Region','Service','Resource Type','Name','State','Freshness','Detail','Observed at','OCID','Parent OCID','Relations JSON','Raw JSON','Previous complete detail JSON','Inventory class'],rawRows,[24,30,22,24,24,34,18,16,18,26,36,36,60,60,60,22]);
table(rawChunks,5,['Resource key','Part','Raw JSON'],chunks,[35,8,100]);
table(baseline,5,['Rule ID','Enabled','Resource types','Field','Operator','Expected','Category','Title','Basis','Oracle source'],snapshot.rules.map(r=>[r.id,r.enabled!==false,r.types.join(', '),r.field,r.operator,r.expected,r.category,r.title,r.basis,r.source_url??'']),[24,10,35,36,20,50,18,42,65,60]);
rawIndex.getRange('K:O').format.wrapText=false;
const last=records.length+5;
overview.getRange('B5').values=[['전체 수집 항목']];overview.getRange('E5').values=[['구성 자원']];overview.getRange('H5').values=[['설정 확인']];overview.getRange('K5').values=[['수집 상태']];
overview.getRange('B6').formulas=[[records.length?`=COUNTA('099_AIIndex'!B6:B${last})`:'=0']];
overview.getRange('E6').formulas=[[records.length?`=COUNTIF('099_AIIndex'!Q6:Q${last},"configuration")`:'=0']];overview.getRange('H6').values=[[snapshot.findings.length]];
if(!records.length)overview.getRange('H6').formulas=[['=0']];
overview.getRange('K6').values=[[snapshot.status==='COMPLETE_REGISTERED_SCOPE'?'등록 범위 수집 완료':'일부 확인 필요']];
for(const cell of ['B6','E6','H6'])overview.getRange(cell).format.font={name:'Arial',size:22,bold:true,color:colors.accent};
overview.getRange('B8:M9').merge();overview.getRange('B8').values=[['구성 자원 집계와 그래프는 백업·실행 이력·소프트웨어 소스를 제외합니다. 전체 원본은 서비스별 시트에 보존합니다. 규칙 행은 자원 수에 중복 합산하지 않습니다. 수집 미완료는 030_Coverage에서 확인하세요.']];overview.getRange('B8:M9').format={wrapText:true,font:{name:'Arial',size:10,color:colors.muted},rowHeight:22};
const dist=Object.entries(snapshot.summary.by_compartment).sort(([a],[b])=>a.localeCompare(b));
table(overview,12,['컴파트먼트','구성 자원','전체 항목'],dist.map(([c])=>[c,0,0]),[40,14,14]);
for(let i=0;i<dist.length;i++){overview.getRange(`C${13+i}`).formulas=[[`=COUNTIFS('099_AIIndex'!C6:C${last},B${13+i},'099_AIIndex'!Q6:Q${last},"configuration")`]];overview.getRange(`D${13+i}`).formulas=[[`=COUNTIF('099_AIIndex'!C6:C${last},B${13+i})`]];}
const serviceStart=16+dist.length;
table(overview,serviceStart,['서비스','구성 자원','전체 항목'],serviceGroups.map(([,s])=>[s,0,0]),[40,14,14]);
for(let i=0;i<serviceGroups.length;i++){overview.getRange(`C${serviceStart+1+i}`).formulas=[[`=COUNTIFS('099_AIIndex'!E6:E${last},B${serviceStart+1+i},'099_AIIndex'!Q6:Q${last},"configuration")`]];overview.getRange(`D${serviceStart+1+i}`).formulas=[[`=COUNTIF('099_AIIndex'!E6:E${last},B${serviceStart+1+i})`]];}
overview.getRange('C6:C200').setNumberFormat('#,##0');
if(core.length&&serviceGroups.length){const top=[...serviceGroups].sort((a,b)=>(coreServices.get(b[1])??0)-(coreServices.get(a[1])??0)).filter(([,s])=>coreServices.get(s)>0).slice(0,8);overview.getRange('S12:T12').values=[['서비스','자원 수']];for(let i=0;i<top.length;i++){overview.getRange(`S${13+i}`).values=[[top[i][1]]];overview.getRange(`T${13+i}`).formulas=[[`=C${serviceStart+1+serviceGroups.findIndex(x=>x[0]===top[i][0])}`]]}const chart=overview.charts.add('bar',overview.getRange(`S12:T${12+top.length}`));chart.title='구성 자원 상위 서비스';chart.hasLegend=false;chart.titleTextStyle.typeface='Arial';chart.titleTextStyle.fontSize=12;chart.yAxis={numberFormatCode:'#,##0',numberFormatSourceLinked:false,textStyle:{typeface:'Arial',fontSize:10}};chart.xAxis={axisType:'textAxis',textStyle:{typeface:'Arial',fontSize:10}};chart.series.items[0].fill=colors.accent;chart.setPosition('F12','N31');}
const byComp=new Map();for(const r of records){if(!byComp.has(r.compartment))byComp.set(r.compartment,[]);byComp.get(r.compartment).push(r)}
let row=5;
for(const [comp,list] of byComp){const visible=list.filter(r=>resourceClass(r)==='configuration');band(compartments,row,`${comp} (${visible.length}) · 전체 ${list.length}개`,8,!visible.length);row=table(compartments,row+1,['Region','Resource Type','Name','State','핵심 설정','확인','OCID','Parent OCID','Raw JSON'],visible.map(r=>[r.region,r.type,r.name,r.state,r.properties.map(p=>`${p.label}: ${typeof p.value==='object'?JSON.stringify(p.value):p.value}`).join('\n'),r.freshness==='stale'?'이전 수집 정보':r.detail_complete?'상세 확인':'상세 미완료',r.ocid,r.parent_id,rawRows[records.indexOf(r)][13]]),[22,24,34,18,64,20,36,36,70]);}
for(const [group,s] of services){let row=5;const list=records.filter(r=>r.group===group);for(const comp of [...new Set(list.map(r=>r.compartment))]){const cr=list.filter(r=>r.compartment===comp);band(s,row,`${comp} (${cr.length})`,9);row+=2;for(const region of [...new Set(cr.map(r=>r.region))])for(const type of [...new Set(cr.filter(r=>r.region===region).map(r=>r.type))]){const tr=cr.filter(r=>r.region===region&&r.type===type);const props=[...new Map(tr.flatMap(r=>r.properties).map(p=>[p.field,p.label])).entries()];band(s,row,`${region} · ${type} (${tr.length})`,9);row=table(s,row+1,['Name','State',...props.map(([,l])=>l),'확인','OCID','Parent OCID','Raw JSON'],tr.map(r=>[r.name,r.state,...props.map(([f])=>r.properties.find(p=>p.field===f)?.value??null),r.detail_complete?'상세 확인':'상세 미완료',r.ocid,r.parent_id,rawRows[records.indexOf(r)][13]]),[32,18,...props.map(()=>30),18,36,36,70]);}}}

const security=[];const routes=[];const statements=[];const lb=[];
const ports = p => p ? p.min===p.max?String(p.min):`${p.min}-${p.max}` : 'ALL';
for(const r of records){
 for(const [field,direction] of [['ingress_security_rules','INGRESS'],['egress_security_rules','EGRESS'],['security_rules','']])for(const rule of r.raw[field]??[]){const opt=rule.tcp_options??rule.udp_options;security.push([r.compartment,r.region,r.type,r.name,rule.direction||direction,rule.is_stateless?'Stateless':'Stateful',({6:'TCP',17:'UDP',1:'ICMP',58:'ICMPv6',all:'ALL'})[rule.protocol]??rule.protocol,rule.source??rule.destination,rule.source_type??rule.destination_type,ports(opt?.source_port_range),ports(opt?.destination_port_range),rule.icmp_options,rule.description,r.ocid,JSON.stringify(rule)])}
 if(['RouteTable','DrgRouteTable'].includes(r.type))for(const rule of r.raw.route_rules??[])routes.push([r.compartment,r.region,r.name,rule.destination,rule.destination_type,rule.network_entity_id??rule.next_hop_drg_attachment_id,records.find(x=>x.ocid===(rule.network_entity_id??rule.next_hop_drg_attachment_id))?.name??'',rule.route_type,rule.description,r.ocid,JSON.stringify(rule)]);
 if(r.type==='Policy')for(const statement of r.raw.statements??[])statements.push([r.compartment,r.region,r.name,statement,r.ocid]);
 if(['LoadBalancer','NetworkLoadBalancer'].includes(r.type)){for(const [name,listener] of Object.entries(r.raw.listeners??{}))lb.push([r.compartment,r.region,r.name,'Listener',name,listener.protocol,listener.port,listener.default_backend_set_name,JSON.stringify(listener),r.ocid]);for(const [name,set] of Object.entries(r.raw.backend_sets??{}))for(const backend of set.backends??[])lb.push([r.compartment,r.region,r.name,'Backend',name,set.policy,backend.port,backend.ip_address,JSON.stringify({backend,health_checker:set.health_checker}),r.ocid])}
}
function grouped(s,headers,rows,widths){let row=5;for(const comp of [...new Set(records.map(r=>r.compartment))]){const cr=rows.filter(r=>r[0]===comp);band(s,row,`${comp} (${cr.length})`,Math.min(headers.length,9),!cr.length);row=table(s,row+1,headers,cr.length?cr:[[comp,...headers.slice(1).map((_,i)=>i===0?'수집된 항목 없음':'')]],widths);if(!cr.length)s.getRangeByIndexes(row-5,1,2,headers.length).format={fill:colors.pale,font:{name:'Arial',size:10,color:colors.muted}};}}
grouped(rulesSheet,['Compartment','Region','Type','Name','Direction','State','Protocol','Source / Destination','Address type','Source port','Destination port','ICMP','Description','OCID','Raw rule'],security,[28,22,24,30,14,14,12,26,14,16,18,22,38,36,70]);
grouped(routesSheet,['Compartment','Region','Name','Destination','Destination type','Target OCID','Target name','Route type','Description','OCID','Raw rule'],routes,[28,22,32,24,20,36,32,18,40,36,70]);
grouped(policySheet,['Compartment','Region','Policy','Statement','OCID'],statements,[28,22,32,120,36]);policySheet.getRange(`E6:E${statements.length+300}`).format.wrapText=true;
grouped(lbSheet,['Compartment','Region','Load balancer','Type','Listener / backend set','Protocol / policy','Port','Backend / IP','Settings JSON','OCID'],lb,[28,22,32,14,28,24,12,32,70,36]);
const changeRows=snapshot.changes.flatMap(c=>c.fields.length?c.fields.map(f=>[c.compartment,c.region,c.type,c.name,c.kind,f.path,f.before,f.after,c.key]):[[c.compartment,c.region,c.type,c.name,c.kind,'',c.evidence??'', '',c.key]]);
table(changes,5,['Compartment','Region','Type','Name','Change','Field','Before','After','Resource key'],changeRows,[30,22,24,32,24,42,65,65,36]);
if(!snapshot.comparison_run_id)changes.getRange('B7').values=[['첫 수집: 다음 수집부터 변경 이력을 비교합니다.']];
table(deviations,5,['Compartment','Region','Type','Name','Category','설정 확인','Field','Actual','Expected','판정 근거','Rule ID'],snapshot.findings.map(f=>[f.compartment,f.region,f.type,f.resource_name,f.category,f.title,f.field,f.actual,f.expected,f.basis,f.rule_id]),[30,22,24,32,20,46,36,70,50,70,24]);
table(coverage,5,['Status','Operation','Region','Count','Error / reason','Scope'],[...snapshot.coverage].sort((a,b)=>Number(['SUCCESS','EMPTY','NOT_APPLICABLE'].includes(a.status))-Number(['SUCCESS','EMPTY','NOT_APPLICABLE'].includes(b.status))).map(e=>[e.status,e.operation,e.region,e.count??null,e.error??e.reason??'',e.scope]),[26,50,24,12,90,65]);
if(snapshot.coverage.length)coverage.getRange(`B6:B${snapshot.coverage.length+5}`).conditionalFormats.add('containsText',{text:'FAILED',format:{fill:'#FDE3E4',font:{color:'#9C2831',bold:true}}});
// Technical data stays at the far right in visible sheets, preserving Excel-only portability.
wb.recalculate();
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!',options:{useRegex:true,maxResults:20},maxChars:2000});
if(errors.ndjson?.includes('"match"'))throw Error(`Workbook formula errors: ${errors.ndjson}`);
const summaryValues=overview.getRange('B6').values[0][0];if(summaryValues!==records.length)throw Error(`Excel resource count mismatch ${summaryValues}/${records.length}`);
if(overview.getRange('E6').values[0][0]!==core.length)throw Error('Configuration resource count does not reconcile');
await fs.mkdir(path.dirname(output),{recursive:true});
const exported=await SpreadsheetFile.exportXlsx(wb);
await fs.writeFile(output,exported.data);
if(previewDir){await fs.mkdir(previewDir,{recursive:true});for(let i=0;i<wb.worksheets.items.length;i++){const s=wb.worksheets.items[i];const p=await wb.render({sheetName:s.name,range:s===overview?'B2:N32':'B2:K16',scale:1.4,format:'png'});await fs.writeFile(path.join(previewDir,s.name+'.png'),new Uint8Array(await p.arrayBuffer()));}}
// OneDrive must retain the exported values and structure after syncing.
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const before=await fs.stat(output),beforeHash=await hash(output);await new Promise(r=>setTimeout(r,10000));const after=await fs.stat(output);if(before.size!==after.size||beforeHash!==await hash(output))throw Error('Workbook changed during sync');
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(output));
if(reopened.worksheets.getItem('000_Overview').getRange('B6').values[0][0]!==records.length)throw Error('Saved workbook summary changed');
if(reopened.worksheets.items.length!==wb.worksheets.items.length)throw Error('Saved sheet count changed');
console.log(JSON.stringify({output,resources:records.length,sheets:wb.worksheets.items.length,securityRules:security.length,routeRules:routes.length,policyStatements:statements.length,rawChunks:chunks.length}));
await fs.writeFile(output+'.verification.json',JSON.stringify({input,input_sha256:await hash(input),output,output_sha256:beforeHash,bytes:after.size,modified_at:after.mtime.toISOString(),resources:records.length,sheets:wb.worksheets.items.map(s=>s.name),reopened:true,sync_wait_seconds:10},null,2));
// Let the runtime dispose its renderer workers after successful validation.
process.exitCode=0;
