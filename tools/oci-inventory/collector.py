"""Daily read-only OCI inventory, checkpointed per scope and per resource."""
from __future__ import annotations
import argparse
import concurrent.futures
import configparser
from contextlib import nullcontext
import inspect
import itertools
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone, timedelta
import oci
from model import SCHEMA, atomic_json, canonical, digest, finish_snapshot, now, read_json, resource, sanitize
from specs import SPECS, CLIENTS, ALLOWLIST, find_spec, CHILDREN
from safety import create_client, invoke, UnsafeOperation

HERE=Path(__file__).resolve().parent
RETRY=oci.retry.RetryStrategyBuilder(max_attempts_check=True,max_attempts=3,total_elapsed_time_check=True,total_elapsed_time_seconds=65).get_retry_strategy()

def items(data):
    if isinstance(data,list): return data
    if isinstance(data,dict): return data.get('items',data.get('resources',[]))
    for field in ('items','resources','objects'):
        rows=getattr(data,field,None)
        if isinstance(rows,list): return rows
    return []

def profiles(config_file):
    parser=configparser.ConfigParser(interpolation=None); parser.read(config_file,encoding='utf-8-sig')
    names=['DEFAULT',*parser.sections()]
    return [n for n in names if parser[n].get('tenancy')]

def required(method):
    return [p.name for p in inspect.signature(method).parameters.values() if p.name!='self' and p.default==inspect.Parameter.empty and p.kind not in (p.VAR_KEYWORD,p.VAR_POSITIONAL)]

class Collector:
    def __init__(self, profile, config_file, output, run_id, workers=6, force=False, resume=False):
        self.profile=profile; self.config=oci.config.from_file(str(config_file),profile)
        self.tenancy_id=self.config['tenancy']; self.started=now(); self.workers=workers; self.force=force
        self.config.pop('additional_user_agent',None)
        self.lock=threading.RLock(); self.local=threading.local(); self.records={}; self.coverage=[]
        self.request_slots=threading.BoundedSemaphore(max(1,workers))
        self.output=Path(output); self.folder=self.output/'snapshots'/self.tenancy_id/run_id
        self.folder.mkdir(parents=True,exist_ok=True)
        if (self.folder/'snapshot.json').exists():
            raise RuntimeError('This run already has a completed snapshot. Use a new run; completed history is immutable.')
        metadata=read_json(self.folder/'collection.json',{})
        if metadata.get('profile',profile)!=profile:
            raise RuntimeError('Resume profile does not match the original collection')
        if metadata.get('started_at'): self.started=metadata['started_at']
        elif resume:
            try: self.started=datetime.strptime(run_id,'%Y-%m-%d_%H%M%S_%fZ').replace(tzinfo=timezone.utc).isoformat()
            except ValueError: pass
        atomic_json(self.folder/'collection.json',{'run_id':run_id,'profile':profile,'tenancy_id':self.tenancy_id,'started_at':self.started})
        self.raw_dir=self.folder/'raw'; self.raw_dir.mkdir(exist_ok=True)
        self.journal=self.folder/'coverage.jsonl'
        self.previous_path=read_json(self.output/'latest'/f'{self.tenancy_id}.json',{}).get('path')
        self.previous=read_json(self.previous_path) if self.previous_path else None
        self.previous_records={r['key']:r for r in (self.previous or {}).get('resources',[])}
        self.resume=resume; self.completed_scopes={}
        if resume and self.journal.exists():
            for line in self.journal.read_text(encoding='utf-8').splitlines():
                try: event=json.loads(line)
                except json.JSONDecodeError: continue
                if event.get('status') in ('SUCCESS','EMPTY'):
                    self.completed_scopes[event['scope']]=event
        self.run_id=run_id

    def client(self,service,region,endpoint=None):
        clients=getattr(self.local,'clients',None)
        if clients is None: self.local.clients=clients={}
        key=(service,region,endpoint)
        if key not in clients:
            cfg=dict(self.config); cfg['region']=region
            clients[key]=create_client(oci,service,cfg,endpoint)
        return clients[key]

    def event(self,scope,operation,status,**extra):
        row={'scope':scope,'operation':operation,'status':status,'observed_at':now(),**extra}
        with self.lock:
            self.coverage.append(row)
            with self.journal.open('a',encoding='utf-8') as f: f.write(json.dumps(row,ensure_ascii=False)+'\n')
        return row

    def call(self,service,method,region,kwargs,scope,*,listing=False,endpoint=None,scim=False):
        raw_path=self.raw_dir/(digest([scope,service,method,kwargs])+'.json')
        if self.resume and scope in self.completed_scopes and raw_path.exists():
            cached=read_json(raw_path); self.coverage.append(self.completed_scopes[scope]); return cached['data'],True
        rows=[]; pages=0
        try:
            client=self.client(service,region,endpoint)
            missing=[p for p in required(getattr(client,method)) if p not in kwargs]
            if missing: raise TypeError(f'Unresolved required parameters: {missing}')
            page=None; start_index=1; seen_pages=set()
            while True:
                args=dict(kwargs); args['retry_strategy']=RETRY
                if page: args['page']=page
                if scim: args.update(start_index=start_index,count=1000)
                with getattr(self,'request_slots',None) or nullcontext():
                    response=invoke(service,client,method,**args)
                pages+=1; data=oci.util.to_dict(response.data)
                if listing:
                    batch=items(response.data); rows.extend(oci.util.to_dict(x) for x in batch)
                else: rows=data
                if scim:
                    total=getattr(response.data,'total_results',None)
                    if not batch:
                        if total is not None and len(rows)<total: raise RuntimeError('SCIM empty page before total_results')
                        break
                    if total is not None and len(rows)>=total: break
                    if total is None and len(batch)<1000: break
                    start_index+=len(batch)
                else:
                    page=response.headers.get('opc-next-page')
                    if not listing or not page: break
                    if page in seen_pages: raise RuntimeError('Pagination repeated a page token')
                    seen_pages.add(page)
                if pages>=10000: raise RuntimeError('Pagination safety limit exceeded')
            safe=sanitize(rows)
            atomic_json(raw_path,{'operation':f'{service}.{method}','scope':scope,'region':region,'observed_at':now(),'pages':pages,'data':safe})
            self.event(scope,f'{service}.{method}','EMPTY' if listing and not safe else 'SUCCESS',count=len(safe) if listing else 1,region=region,pages=pages)
            return safe,True
        except Exception as exc:
            status=getattr(exc,'status',None)
            # Only this documented service-specific code proves optional absence.
            # Generic 404/NotAuthorizedOrNotFound remains an incomplete read.
            if service=='object' and method=='get_object_lifecycle_policy' and status==404 and getattr(exc,'code',None)=='LifecyclePolicyNotFound':
                atomic_json(raw_path,{'operation':f'{service}.{method}','scope':scope,'region':region,'observed_at':now(),'pages':pages,'data':None,'optional_absence':'LifecyclePolicyNotFound'})
                self.event(scope,f'{service}.{method}','SUCCESS',count=0,region=region,reason='No lifecycle policy configured (LifecyclePolicyNotFound)')
                return None,True
            category='DENIED' if status in (401,403) else 'DENIED_OR_NOT_FOUND' if status==404 else 'UNSUPPORTED' if isinstance(exc,(AttributeError,TypeError)) else 'UNSAFE_BLOCKED' if isinstance(exc,UnsafeOperation) else 'FAILED'
            self.event(scope,f'{service}.{method}',category,region=region,http_status=status,error_code=getattr(exc,'code',None),error=str(getattr(exc,'message',None) or exc)[:600],partial_count=len(rows) if isinstance(rows,list) else 0)
            if rows: atomic_json(raw_path.with_suffix('.partial.json'),{'data':sanitize(rows),'complete':False})
            return sanitize(rows),False

    def put(self,r):
        with self.lock:
            old=self.records.get(r['key'])
            if old and old['source']=='native' and r['source']=='scim':
                r={**r,'raw':{**old['raw'],**r['raw'],'_iam_metadata':old['raw']}}
                r['config_hash']=digest(canonical(r['raw']))
                self.records[r['key']]=r
                return
            if not old or (r['source']=='native' and old['source']!='native') or (r['detail_complete'] and not old['detail_complete']): self.records[r['key']]=r

    def get_params(self, spec, row, listing_args, region, endpoint=None):
        client=self.client(spec.client,region,endpoint)
        params=required(getattr(client,spec.get)); kwargs={}
        for name in params:
            if spec.kind=='Compartment' and name=='compartment_id': kwargs[name]=row.get('id')
            elif name in listing_args: kwargs[name]=listing_args[name]
            elif name in row: kwargs[name]=row[name]
            elif name in ('bucket_name','addon_name','tag_name'): kwargs[name]=row.get('name')
            elif name=='namespace_name': kwargs[name]=row.get('namespace_name') or row.get('namespace')
            elif name in ('ipsc_id','log_group_id','budget_id'): kwargs[name]=row.get(name)
            elif name.endswith('_id') or name in ('zone_name_or_id','view_id','resolver_id'): kwargs[name]=row.get('id') or row.get('identifier')
            else: kwargs[name]=None
        if any(v is None for v in kwargs.values()): raise TypeError(f'GET binding missing: {list(kwargs)}')
        return kwargs

    def enrich(self,spec,row,region,compartment,scope,args,parent='',endpoint=None):
        rid=row.get('id') or row.get('identifier') or row.get('name') or digest(row)
        base=resource(spec.kind,row,tenancy_id=self.tenancy_id,region=region,compartment_id=compartment,scope=scope,observed_at=now(),detail_complete=False,parent_id=parent)
        old=self.previous_records.get(base['key'])
        details=row; complete=not spec.get; freshness='current'; observed=now()
        # Only Image details are reused: lifecycle must be stable and LIST hash equal.
        cache_ok=False
        if old and spec.immutable and not self.force and old.get('detail_complete') and old.get('list_hash')==digest(canonical(row)) and row.get('lifecycle_state')=='AVAILABLE':
            try: cache_ok=datetime.fromisoformat(old['detail_observed_at'])>datetime.now(timezone.utc)-timedelta(days=7)
            except (ValueError,TypeError): pass
        if cache_ok:
            details=old['raw']; complete=True; freshness='cached'; observed=old['detail_observed_at']
        elif spec.get:
            try:
                kwargs=self.get_params(spec,row,args,region,endpoint)
                detail,complete=self.call(spec.client,spec.get,region,kwargs,scope+'::get::'+str(rid),endpoint=endpoint)
                if complete and isinstance(detail,dict) and row.get('id') and detail.get('id') and row['id']!=detail['id']:
                    complete=False
                    self.event(scope+'::get::'+str(rid),f'{spec.client}.{spec.get}','INVALID_DETAIL',region=region,error='GET returned a different resource ID; LIST metadata retained')
                if complete: details=detail
            except Exception as exc:
                self.event(scope+'::get::'+str(rid),f'{spec.client}.{spec.get}','UNSUPPORTED',region=region,error=str(exc))
        for service,method,param,field in CHILDREN.get(spec.kind,[]):
            child,ok=self.call(service,method,region,{param:rid},scope+'::children::'+str(rid)+'::'+method,listing=True)
            if ok: details={**details,field:child}
            complete=complete and ok
        if spec.kind=='VnicAttachment' and row.get('vnic_id'):
            vnic,ok=self.call('network','get_vnic',region,{'vnic_id':row['vnic_id']},scope+'::vnic::'+row['vnic_id'])
            if ok:
                self.put(resource('Vnic',vnic,tenancy_id=self.tenancy_id,region=region,compartment_id=compartment,scope=scope,observed_at=now(),parent_id=row.get('instance_id','')))
        if spec.kind=='Bucket':
            for method,field,listing in [('get_object_lifecycle_policy','object_lifecycle_policy',False),('list_retention_rules','retention_rules',True),('list_replication_policies','replication_policies',True)]:
                child,ok=self.call('object',method,region,{'namespace_name':args['namespace_name'],'bucket_name':row['name']},scope+'::bucket::'+str(rid)+'::'+method,listing=listing)
                if ok: details={**details,field:child}
                # Missing lifecycle policy is ambiguous; retain the failure evidence.
                complete=complete and ok
        result=resource(spec.kind,details,tenancy_id=self.tenancy_id,region=region,compartment_id=compartment,scope=scope,observed_at=now(),detail_complete=complete,parent_id=parent)
        result['list_hash']=digest(canonical(row)); result['detail_observed_at']=observed if complete else None; result['freshness']=freshness
        self.put(result)

    def contexts(self,spec):
        bindings=dict(spec.bindings)
        parent_binding=next(((param,value) for param,value in bindings.items() if '.' in value and not value.startswith('#')),None)
        if parent_binding:
            param,value=parent_binding; kind,field=value.split('.',1)
            parents=[r for r in self.records.values() if r['type']==kind and r['freshness']!='stale']
            for r in parents:
                val=r['raw'].get(field)
                if not val: continue
                args={}; endpoint=None
                for key,ref in bindings.items():
                    if key==param:
                        if key=='_endpoint': endpoint=val
                        else: args[key]=val
                    elif ref=='compartment': args[key]=r['compartment_id']
                    elif ref=='all_compartments': pass
                    elif ref=='tenancy': args[key]=self.tenancy_id
                    elif ref.startswith('#'): args[key]=ref[1:]
                    else: raise TypeError(f'Unsupported parent binding {ref}')
                if 'all_compartments' in bindings.values():
                    for comp in self.compartment_ids:
                        yield r['region'],comp,{**args,**{key:comp for key,ref in bindings.items() if ref=='all_compartments'}},r['ocid'],endpoint
                else:
                    yield r['region'],r['compartment_id'],args,r['ocid'],endpoint
        else:
            regions=[self.home] if spec.home else self.regions
            comps=self.compartment_ids if 'compartment' in bindings.values() else [self.tenancy_id]
            for region,comp in itertools.product(regions,comps):
                ads=self.ads.get(region,[]) if 'ad' in bindings.values() else [None]
                for ad in ads:
                    values={'compartment':comp,'tenancy':self.tenancy_id,'namespace':self.namespace,'ad':ad}
                    args={k:(v[1:] if v.startswith('#') else values[v]) for k,v in bindings.items()}
                    if any(v is None for v in args.values()): continue
                    yield region,comp,args,'',None

    def sweep(self,spec,context):
        region,comp,args,parent,endpoint=context
        if spec.kind=='Compartment':
            args={**args,'compartment_id_in_subtree':True,'access_level':'ACCESSIBLE'}
        scope=f'{spec.kind}::{region}::{comp}::{parent}::{args.get("availability_domain","")}'
        # Images returned by LIST may include the platform catalog, which is not customer-owned.
        rows,ok=self.call(spec.client,spec.listing,region,args,scope,listing=True,endpoint=endpoint)
        if not ok:
            for row in rows:
                self.put(resource(spec.kind,row,tenancy_id=self.tenancy_id,region=region,compartment_id=comp,scope=scope,observed_at=now(),detail_complete=False,parent_id=parent))
            return
        valid=[row for row in rows if spec.kind!='Image' or row.get('compartment_id')==comp]
        # A compartment with hundreds of backups must not serialize all GETs.
        # A separate detail pool avoids nesting tasks in the same executor;
        # request_slots bounds actual HTTP concurrency across both pools.
        futures=[self.details_pool.submit(self.enrich,spec,row,region,comp,scope,args,parent,endpoint) for row in valid]
        for future in futures: future.result()

    def run(self,rules,only_kinds=None):
        cfgregion=self.config['region']
        tenancy,ok=self.call('iam','get_tenancy',cfgregion,{'tenancy_id':self.tenancy_id},'tenancy')
        if not ok: raise RuntimeError('Tenancy lookup failed; see coverage.jsonl')
        subs,ok=self.call('iam','list_region_subscriptions',cfgregion,{'tenancy_id':self.tenancy_id},'regions',listing=True)
        if not ok: raise RuntimeError('Region subscription lookup failed')
        self.home=next((x['region_name'] for x in subs if x.get('is_home_region')),cfgregion)
        self.regions=[x['region_name'] for x in subs if x.get('status')=='READY']
        if not self.regions: raise RuntimeError('No READY regions')
        comps,ok=self.call('iam','list_compartments',self.home,{'compartment_id':self.tenancy_id,'compartment_id_in_subtree':True,'access_level':'ACCESSIBLE'},'compartments',listing=True)
        if not ok: raise RuntimeError('Compartment discovery incomplete')
        self.compartment_ids=[self.tenancy_id,*[x['id'] for x in comps if x.get('lifecycle_state')=='ACTIVE']]
        self.ads={}
        for region in self.regions:
            ads,ok=self.call('iam','list_availability_domains',region,{'compartment_id':self.tenancy_id},'ads::'+region,listing=True)
            self.ads[region]=[x['name'] for x in ads] if ok else []
        namespace,ok=self.call('object','get_namespace',self.home,{'compartment_id':self.tenancy_id},'namespace')
        self.namespace=namespace if ok else None
        print(f'[{self.profile}] {tenancy["name"]}: {len(self.regions)} regions, {len(self.compartment_ids)} compartments',flush=True)
        search_types,_=self.call('search','list_resource_types',self.home,{},'search_types',listing=True)
        discovered=[]
        for region in self.regions:
            query=oci.resource_search.models.StructuredSearchDetails(query='query all resources')
            rows,ok=self.call('search','search_resources',region,{'search_details':query,'limit':1000},'search::'+region,listing=True)
            for row in rows: discovered.append((region,row))
        chosen=[s for s in SPECS if not only_kinds or s.kind in only_kinds]
        # Parent order is explicitly modeled and iterated to resolve cross-service references.
        pending=list(chosen); done=set()
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as pool, concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as detail_pool:
            self.details_pool=detail_pool
            while pending:
                ready=[s for s in pending if all(v.split('.')[0] in done for _,v in s.bindings if '.' in v and not v.startswith('#'))]
                if not ready:
                    for spec in pending: self.event(spec.kind,'registry','UNSUPPORTED',error='Parent collector unavailable or dependency cycle')
                    break
                for spec in ready:
                    contexts=list(self.contexts(spec))
                    if not contexts: self.event(spec.kind,'registry','NOT_APPLICABLE',count=0,reason='No discovered parent/context; not a proof of absence if parent collection failed')
                    for f in [pool.submit(self.sweep,spec,c) for c in contexts]: f.result()
                    done.add(spec.kind); pending.remove(spec)
                    print(f'[{self.profile}] {spec.kind}: {len(self.records)} resources',flush=True)
        for region,row in discovered:
            kind=row.get('resource_type','Unknown'); spec=find_spec(kind)
            domain=(row.get('identity_context') or {}).get('domainOcid')
            if domain:
                row={**row,'_identity_domain_id':domain}
                kind={'user':'DomainUser','group':'DomainGroup','app':'DomainApp'}.get(kind.lower(),kind)
            record=resource(kind,row,tenancy_id=self.tenancy_id,region=self.home if spec and spec.home else region,compartment_id=row.get('compartment_id') or self.tenancy_id,scope='search::'+region,observed_at=now(),detail_complete=False,source='search')
            if record['key'] not in self.records:
                if spec and spec.get and not domain:
                    self.enrich(spec,{**row,'id':row.get('identifier'),'name':row.get('display_name')},record['region'],record['compartment_id'],record['scope'],{'namespace_name':self.namespace} if spec.client=='object' else {})
                    if record['key'] in self.records and self.records[record['key']]['detail_complete']: continue
                # Search is retained even when no service-native adapter exists.
                self.put(record)
                self.event(record['key'],'search.native_coverage','DISCOVERED_ONLY',type=record['type'],region=region)
        if not only_kinds or 'Domain' in only_kinds: self.collect_domains()
        snapshot={'schema':SCHEMA,'run_id':self.run_id,'started_at':self.started,'profile':self.profile,'tenancy':tenancy,'regions':self.regions,'compartments':comps,'resources':list(self.records.values()),'coverage':self.coverage,'registered_types':[s.kind for s in chosen],'search_types':search_types,'sdk_version':oci.__version__}
        snapshot=finish_snapshot(snapshot,self.previous,rules)
        target=self.folder/'snapshot.json'; atomic_json(target,snapshot)
        # A separate pointer preserves the last entirely successful registered-scope run.
        pointer={'path':str(target),'run_id':self.run_id,'tenancy':tenancy['name'],'status':snapshot['status']}
        atomic_json(self.output/'latest'/f'{self.tenancy_id}.json',pointer)
        if snapshot['status']=='COMPLETE_REGISTERED_SCOPE': atomic_json(self.output/'latest-complete'/f'{self.tenancy_id}.json',pointer)
        atomic_json(self.output/'web'/tenancy['name']/(self.run_id+'.json'),snapshot)
        return target,snapshot

    def collect_domains(self):
        for domain in [r for r in self.records.values() if r['type']=='Domain' and r['detail_complete']]:
            raw=domain['raw']; endpoint=raw.get('url'); region=raw.get('home_region') or self.home
            if not endpoint: continue
            for kind,method in [('DomainUser','list_users'),('DomainGroup','list_groups'),('DomainApp','list_apps'),('DomainPolicy','list_policies'),('DomainRule','list_rules'),('DomainIdentityProvider','list_identity_providers'),('DomainPasswordPolicy','list_password_policies'),('DomainAuthenticationFactorSettings','list_authentication_factor_settings'),('DomainDynamicResourceGroup','list_dynamic_resource_groups'),('DomainAppRole','list_app_roles')]:
                scope=f'{kind}::{domain["ocid"]}'
                rows,ok=self.call('domains',method,region,{},scope,listing=True,endpoint=endpoint,scim=True)
                for row in rows:
                    get_method={'DomainUser':'get_user','DomainGroup':'get_group','DomainApp':'get_app','DomainPolicy':'get_policy','DomainRule':'get_rule','DomainIdentityProvider':'get_identity_provider','DomainPasswordPolicy':'get_password_policy'}.get(kind)
                    complete=ok
                    if get_method and row.get('id'):
                        params=required(getattr(self.client('domains',region,endpoint),get_method))
                        detail,complete=self.call('domains',get_method,region,{params[0]:row['id']},scope+'::get::'+row['id'],endpoint=endpoint)
                        if complete: row=detail
                    row['_identity_domain_id']=domain['ocid']
                    result=resource(kind,row,tenancy_id=self.tenancy_id,region=region,compartment_id=domain['compartment_id'],scope=scope,observed_at=now(),detail_complete=complete,source='scim',parent_id=domain['ocid'])
                    result['detail_level']='SCIM_GET' if get_method and complete else 'SCIM_LIST'
                    self.put(result)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',default=str(Path.home()/'.oci'/'config'))
    parser.add_argument('--output',required=True); parser.add_argument('--profile',action='append')
    parser.add_argument('--workers',type=int,default=6); parser.add_argument('--profile-workers',type=int,default=2)
    parser.add_argument('--full',action='store_true'); parser.add_argument('--resume',metavar='RUN_ID')
    parser.add_argument('--kinds',help='Comma-separated live validation subset; omissions are declared')
    parser.add_argument('--rules',default=str(HERE/'baselines.json'))
    parser.add_argument('--node'); parser.add_argument('--no-excel',action='store_true')
    parser.add_argument('--if-due',action='store_true')
    args=parser.parse_args(); out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    # Process lock is automatically released on crash; a stale sentinel cannot block tomorrow.
    lockfile=(out/'collector.lock').open('a+b')
    if os.name=='nt':
        import msvcrt
        lockfile.seek(0)
        try: msvcrt.locking(lockfile.fileno(),msvcrt.LK_NBLCK,1)
        except OSError: print('Another inventory run is active',flush=True); return 0
    last=read_json(out/'last_attempt.json',{})
    local=datetime.now(); today=local.date().isoformat()
    due_date=(local.date() if (local.hour,local.minute)>=(11,30) else (local-timedelta(days=1)).date()).isoformat()
    if args.if_due and last.get('due_date',last.get('date',''))>=due_date: return 0
    run_id=args.resume or datetime.now(timezone.utc).strftime('%Y-%m-%d_%H%M%S_%fZ')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',run_id): raise ValueError('Invalid resume run identifier')
    names=args.profile or profiles(args.config); rules=read_json(args.rules)
    if not names: raise ValueError('No tenancy profiles found in the OCI config')
    report={'run_id':run_id,'started_at':now(),'profiles':names,'results':[]}
    report_path=out/'runs'/(run_id+'.json')
    atomic_json(report_path,report)
    seen=set(); jobs=[]
    for name in names:
        try:
            cfg=oci.config.from_file(args.config,name); key=cfg['tenancy']
            if key in seen:
                report['results'].append({'profile':name,'status':'DUPLICATE_TENANCY','tenancy_id':key}); continue
            seen.add(key); jobs.append(name)
        except Exception as exc: report['results'].append({'profile':name,'status':'CONFIG_FAILED','error':str(exc)[:500]})
    def one(name):
        try:
            c=Collector(name,args.config,out,run_id,max(1,args.workers),args.full,bool(args.resume))
            path,snapshot=c.run(rules,set(args.kinds.split(',')) if args.kinds else None)
            result={'profile':name,'tenancy':snapshot['tenancy']['name'],'status':snapshot['status'],'path':str(path),'summary':snapshot['summary']}
            if not args.no_excel:
                if not args.node: raise RuntimeError('--node is required for Excel rendering')
                excel=out/'excel'/snapshot['tenancy']['name']/today/(run_id+'.xlsx'); excel.parent.mkdir(parents=True,exist_ok=True)
                subprocess.run([args.node,str(HERE/'render_excel.mjs'),str(path),str(excel)],check=True,timeout=900)
                result['excel']=str(excel)
            return result
        except Exception as exc: return {'profile':name,'status':'FAILED','error':str(exc)[:1000]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,args.profile_workers)) as pool:
        pending=[pool.submit(one,name) for name in jobs]
        for task in concurrent.futures.as_completed(pending):
            result=task.result()
            report['results'].append(result); atomic_json(report_path,report)
            print(json.dumps(result,ensure_ascii=False),flush=True)
    report['completed_at']=now(); atomic_json(report_path,report)
    if not args.profile and not args.kinds:
        atomic_json(out/'last_attempt.json',{'date':today,'due_date':due_date,'run_id':run_id,'report':str(report_path)})
    return 2 if any(x['status'] in ('FAILED','CONFIG_FAILED') for x in report['results']) else 0

if __name__=='__main__': sys.exit(main())
