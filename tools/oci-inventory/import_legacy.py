"""Convert existing Explorer archives offline; retain their original collection date."""
import argparse
from pathlib import Path
from model import SCHEMA, atomic_json, finish_snapshot, read_json, resource

def convert(folder, output):
    folder=Path(folder); manifest=read_json(folder/'manifest.json')
    if not manifest: raise ValueError('Archive has no manifest; an interrupted collection is not a complete snapshot')
    tenancy=manifest['tenancy']; records={}; started=manifest['started_at']; home=manifest['home_region']
    def put(kind,raw,source='native',complete=True,scope='legacy'):
        region=raw.get('_region') or raw.get('_queried_region') or raw.get('_identity_domain_home_region') or home
        raw=dict(raw)
        if '_security_rules' in raw: raw['security_rules']=raw.pop('_security_rules')
        r=resource(kind,raw,tenancy_id=tenancy['id'],region=region,compartment_id=raw.get('compartment_id') or raw.get('_source_compartment_id') or tenancy['id'],scope=scope,observed_at=started,source=source,detail_complete=complete)
        old=records.get(r['key'])
        if not old or complete and not old['detail_complete']: records[r['key']]=r
    for kind,rows in read_json(folder/'native_details.json',{}).items():
        for row in rows: put(kind,row)
    for row in read_json(folder/'identity_domains.json',[]): put('Domain',row)
    mapping={'clusters':'Cluster','node_pools':'NodePool','virtual_node_pools':'VirtualNodePool','addons':'OkeAddon'}
    for kind,rows in read_json(folder/'oke.json',{}).items():
        for row in rows: put(mapping.get(kind,kind),row)
    domains=read_json(folder/'identity_domain_objects.json',{})
    for kind,rows in domains.items():
        for row in rows: put({'users':'DomainUser','groups':'DomainGroup','apps':'DomainApp'}.get(kind,kind),row,'scim')
    discovered=read_json(folder/'discovery.json',[])
    if isinstance(discovered,dict): discovered=discovered.get('resources',discovered.get('items',[]))
    for row in discovered:
        kind=row.get('resource_type','Unknown'); domain=(row.get('identity_context') or {}).get('domainOcid')
        if domain:
            row={**row,'_identity_domain_id':domain};kind={'user':'DomainUser','group':'DomainGroup','app':'DomainApp'}.get(kind.lower(),kind)
        put(kind,row,'search',False,'legacy_search')
    cov=read_json(folder/'coverage.json',{})
    coverage=[{**e,'scope':e.get('operation','legacy')+'::'+str(i)} for i,e in enumerate(cov.get('events',[]))]
    coverage.append({'scope':'legacy_archive','operation':'legacy.import','status':'UNVERIFIED_LEGACY','reason':'Original archive retained. Legacy collector did not prove native LIST completeness.'})
    run_id='legacy_'+folder.name.removeprefix('explorer_')
    snapshot={'schema':SCHEMA,'run_id':run_id,'profile':manifest['profile'],'tenancy':tenancy,'started_at':started,'completed_at':manifest['completed_at'],'regions':[x['region_name'] for x in manifest.get('region_subscriptions',[]) if x.get('status')=='READY'],'compartments':manifest.get('compartments',[]),'resources':list(records.values()),'coverage':coverage,'registered_types':[],'source_archive':str(folder)}
    snapshot=finish_snapshot(snapshot,None,read_json(Path(__file__).parent/'baselines.json'))
    snapshot['completed_at']=manifest['completed_at']; target=Path(output)/'legacy'/tenancy['name']/(run_id+'.json')
    atomic_json(target,snapshot); return target,snapshot

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder');p.add_argument('--output',required=True);a=p.parse_args()
    path,s=convert(a.folder,a.output); print(f'{path}\n{s["summary"]}')
