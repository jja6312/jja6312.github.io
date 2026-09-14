import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSnapshot, validateRules, evaluateRules } from '../src/lib/inventory.ts';

const tenancy='ocid1.tenancy.oc1..synthetic';
const rule={id:'public',types:['Bucket'],field:'public_access_type',operator:'not_equal',expected:'NoPublicAccess',category:'nondefault',title:'Public bucket',basis:'Synthetic test'};
const resource={key:tenancy+'::bucket',ocid:'ocid1.bucket.oc1..synthetic',name:'synthetic bucket',type:'Bucket',group:210,service:'ObjectStorage',tenancy_id:tenancy,region:'test-region',compartment_id:tenancy,compartment:'Root',parent_id:'',state:'',scope:'test',observed_at:'2026-09-14T02:30:00Z',detail_observed_at:'2026-09-14T02:30:00Z',detail_complete:true,freshness:'current',source:'native',raw:{public_access_type:'ObjectRead',freeform_tags:{Owner:'example'}},properties:[{field:'public_access_type',label:'Public access',value:'ObjectRead'}],relations:[],findings:[]};
const snapshot={schema:'oci-inventory/v3',run_id:'test',profile:'TEST',started_at:'2026-09-14T02:30:00Z',completed_at:'2026-09-14T02:31:00Z',status:'COMPLETE_REGISTERED_SCOPE',tenancy:{id:tenancy,name:'Synthetic'},regions:['test-region'],resources:[resource],coverage:[],changes:[],findings:[],rules:[rule],comparison_run_id:null,summary:{resources:1,current:1,stale:0,detailed:1,changes:0,findings:0,by_service:{ObjectStorage:1},by_compartment:{Root:1}}};
assert.equal(validateSnapshot(snapshot),snapshot);
assert.throws(()=>validateSnapshot({...snapshot,resources:[resource,resource]}),/중복/);
assert.throws(()=>validateSnapshot({...snapshot,resources:[{...resource,tenancy_id:'other'}]}),/테넌시/);
assert.throws(()=>validateSnapshot({...snapshot,summary:{...snapshot.summary,resources:2}}),/자원 수/);
assert.throws(()=>validateSnapshot({...snapshot,schema:'legacy'}),/지원/);
assert.throws(()=>validateRules([{...rule,field:'__proto__.polluted'}]),/허용/);
assert.throws(()=>validateRules([rule,rule]),/기준/);
assert.equal(evaluateRules([resource],[rule]).length,1);
assert.equal(evaluateRules([{...resource,freshness:'stale'}],[rule]).length,0);
assert.equal(evaluateRules([{...resource,detail_complete:false}],[rule]).length,0);
assert.equal(evaluateRules([{...resource,raw:{}}],[rule]).length,0);
assert.equal(evaluateRules([{...resource,raw:{public_access_type:'NoPublicAccess'}}],[rule]).length,0);
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
assert.match(read('src/lib/auth.ts'),/prefix: '\/knowledge\/inventory', level: 3/);
assert.match(read('src/pages/KnowledgePage.tsx'),/active === 'inventory' && <InventoryPage/);
assert.match(read('src/components/Header.tsx'),/\/knowledge\/inventory/);
assert.match(read('src/lib/inventory.ts'),/indexedDB.open/);
assert.doesNotMatch(read('src/pages/InventoryPage.tsx'),/dangerouslySetInnerHTML|eval\(/);
if(process.argv[2]) {const actual=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));validateSnapshot(actual);console.log(`Imported contract: ${actual.resources.length} unique resources`)}
console.log('Inventory: 17 import/rule/security/navigation checks passed');
