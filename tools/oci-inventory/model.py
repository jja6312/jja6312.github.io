"""Portable snapshot contract shared by the workbook and local browser viewer."""
from __future__ import annotations
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from specs import find_spec, GROUPS

SCHEMA = 'oci-inventory/v3'
VOLATILE = {'time_updated','etag','opc_request_id','last_login_time','last_successful_login_date','time_last_login','time_last_accessed','approximate_count','approximate_size'}
UNORDERED = {'statements','ingress_security_rules','egress_security_rules','security_rules','route_rules','nsg_ids','security_list_ids','subnet_ids','network_security_group_ids','defined_tags','freeform_tags','fault_domains','cidr_blocks','members','schemas'}
SECRET_KEYS = {'password','adminpassword','clientsecret','externalclientsecret','accesstoken','refreshtoken','privatekey','secretcontent','secretvalue','credential','credentials','authorization','authtoken','user_data','userdata','extendedmetadata'}

def now(): return datetime.now(timezone.utc).isoformat()
def dumps(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',',':'), default=str)
def digest(value): return hashlib.sha256(dumps(value).encode()).hexdigest()
def atomic_json(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(dumps(value), encoding='utf-8'); tmp.replace(path)
def read_json(path, default=None):
    return json.loads(Path(path).read_text(encoding='utf-8-sig')) if Path(path).exists() else default

def sanitize(value, path=''):
    if isinstance(value, dict):
        result = {}
        for k,v in value.items():
            n = re.sub('[^a-z0-9]','',k.lower())
            # Tags are user-approved inventory metadata and retain their actual values.
            if k in ('defined_tags','freeform_tags'): result[k] = v
            elif n in SECRET_KEYS or n.endswith('password') or n.endswith('privatekey'): result[k] = '[EXCLUDED: credential/payload]'
            elif k in ('config','environment_variables') and isinstance(v, dict): result[k] = {name:'[EXCLUDED: application value]' for name in v}
            else: result[k] = sanitize(v, path+'.'+k)
        return result
    if isinstance(value,list): return [sanitize(v,path) for v in value]
    return value

def canonical(value, field=''):
    if isinstance(value,dict): return {k:canonical(v,k) for k,v in sorted(value.items()) if k not in VOLATILE and not k.startswith('_')}
    if isinstance(value,list):
        rows=[canonical(v,field) for v in value]
        return sorted(rows,key=dumps) if field in UNORDERED else rows
    return value

def diff_fields(before, after, path=''):
    changes=[]
    if isinstance(before,dict) and isinstance(after,dict):
        for key in sorted(before.keys() | after.keys()):
            p=f'{path}.{key}' if path else key
            if key not in before: changes.append({'path':p,'before':None,'after':after[key],'operation':'ADD'})
            elif key not in after: changes.append({'path':p,'before':before[key],'after':None,'operation':'REMOVE'})
            else: changes.extend(diff_fields(before[key],after[key],p))
    elif isinstance(before,list) and isinstance(after,list) and path.rsplit('.',1)[-1] in UNORDERED:
        b,a=Counter(map(dumps,before)),Counter(map(dumps,after))
        for item,n in (b-a).items():
            changes.extend({'path':path,'before':json.loads(item),'after':None,'operation':'REMOVE'} for _ in range(n))
        for item,n in (a-b).items():
            changes.extend({'path':path,'before':None,'after':json.loads(item),'operation':'ADD'} for _ in range(n))
    elif before != after: changes.append({'path':path,'before':before,'after':after,'operation':'CHANGE'})
    return changes

def at(data,path):
    for part in path.split('.'):
        if not isinstance(data,dict) or part not in data: return None
        data=data[part]
    return data

FIELDS = {
 'Instance': [('shape','Shape'),('shape_config.ocpus','OCPU'),('shape_config.memory_in_gbs','Memory GiB'),('shape_config.networking_bandwidth_in_gbps','Network Gbps'),('availability_domain','AD'),('fault_domain','FD'),('source_details','Boot source'),('launch_options','Launch options'),('platform_config','Security'),('agent_config','Agent'),('availability_config','Recovery'),('instance_options','Instance options')],
 'Vcn': [('cidr_blocks','CIDR'),('ipv6_cidr_blocks','IPv6'),('dns_label','DNS label'),('vcn_domain_name','DNS domain'),('default_dhcp_options_id','DHCP'),('default_route_table_id','Default routes'),('default_security_list_id','Default security list')],
 'Subnet': [('cidr_block','CIDR'),('ipv6_cidr_blocks','IPv6'),('prohibit_public_ip_on_vnic','Private subnet'),('dns_label','DNS label'),('subnet_domain_name','DNS domain'),('dhcp_options_id','DHCP'),('route_table_id','Route table'),('security_list_ids','Security lists')],
 'DhcpOptions': [('options','DNS / DHCP options')],
 'SecurityList': [('ingress_security_rules','Ingress'),('egress_security_rules','Egress')],
 'NetworkSecurityGroup': [('security_rules','Security rules'),('vnics','Attached VNICs')],
 'RouteTable': [('route_rules','Route rules')], 'DrgRouteTable':[('route_rules','Route rules'),('import_drg_route_distribution_id','Import distribution')],
 'Policy': [('statements','Statements'),('version_date','Policy version')],
 'Domain': [('home_region','Home region'),('url','Domain URL'),('type','Domain type'),('replica_regions','Replica regions'),('is_hidden_on_login','Hidden on login')],
 'Cluster': [('type','Cluster type'),('kubernetes_version','Kubernetes'),('endpoint_config','API endpoint'),('cluster_pod_network_options','Pod networking'),('options','Cluster options'),('image_policy_config','Image policy'),('kms_key_id','Encryption key')],
 'NodePool': [('kubernetes_version','Kubernetes'),('node_shape','Shape'),('node_shape_config','OCPU / Memory'),('node_config_details','Placement / size / encryption / networking'),('node_source_details','Image'),('initial_node_labels','Labels'),('node_eviction_node_pool_settings','Eviction'),('node_pool_cycling_details','Cycling')],
 'VirtualNodePool': [('size','Size'),('pod_configuration','Pod config'),('placement_configurations','Placement'),('nsg_ids','NSGs'),('initial_virtual_node_labels','Labels')],
 'LoadBalancer': [('is_private','Private'),('ip_addresses','IP'),('shape_name','Shape'),('shape_details','Bandwidth'),('subnet_ids','Subnets'),('network_security_group_ids','NSGs'),('listeners','Listeners'),('backend_sets','Backend sets'),('routing_policies','Routing'),('rule_sets','Rules')],
 'NetworkLoadBalancer': [('is_private','Private'),('ip_addresses','IP'),('listeners','Listeners'),('backend_sets','Backends'),('is_preserve_source_destination','Preserve source/destination')],
 'Bucket': [('namespace','Namespace'),('storage_tier','Tier'),('public_access_type','Public access'),('versioning','Versioning'),('auto_tiering','Auto tiering'),('kms_key_id','KMS'),('object_lifecycle_policy','Lifecycle'),('retention_rules','Retention'),('replication_policies','Replication')],
 'Volume': [('size_in_gbs','Size GiB'),('vpus_per_gb','VPUs/GB'),('autotune_policies','Autotune'),('is_hydrated','Hydrated'),('kms_key_id','KMS'),('block_volume_replicas','Replicas')],
 'BootVolume': [('size_in_gbs','Size GiB'),('vpus_per_gb','VPUs/GB'),('autotune_policies','Autotune'),('kms_key_id','KMS'),('boot_volume_replicas','Replicas')],
 'DbSystem': [('shape','Shape'),('cpu_core_count','OCPU'),('database_edition','Edition'),('version','Version'),('data_storage_size_in_gbs','Storage GiB'),('backup_subnet_id','Backup subnet'),('db_system_options','Storage management'),('maintenance_window','Maintenance')],
 'Database': [('db_name','DB name'),('db_workload','Workload'),('db_backup_config','Backup config'),('character_set','Character set'),('ncharacter_set','NCHAR'),('is_cdb','CDB'),('db_unique_name','Unique name')],
 'AutonomousDatabase': [('db_workload','Workload'),('compute_model','Compute model'),('compute_count','Compute count'),('cpu_core_count','OCPU'),('data_storage_size_in_tbs','Storage TiB'),('is_auto_scaling_enabled','Compute autoscaling'),('is_auto_scaling_for_storage_enabled','Storage autoscaling'),('is_dedicated','Dedicated'),('whitelisted_ips','Allowed IPs'),('private_endpoint','Private endpoint'),('backup_retention_period_in_days','Backup retention days')],
 'Alarm': [('namespace','Namespace'),('query','MQL'),('severity','Severity'),('is_enabled','Enabled'),('pending_duration','Pending'),('destinations','Destinations'),('repeat_notification_duration','Repeat interval')],
 'DnsResolver': [('attached_views','Private views'),('endpoints','Endpoints'),('rules','Forwarding rules')],
 'Export': [('path','Export path'),('export_options','Client access / squash')],
 'FileSystem': [('availability_domain','AD'),('metered_bytes','Bytes'),('kms_key_id','KMS'),('filesystem_snapshot_policy_id','Snapshot policy')],
 'VaultSecret': [('secret_name','Secret name'),('vault_id','Vault'),('key_id','Key'),('current_version_number','Version'),('secret_rules','Rules'),('rotation_config','Rotation')],
}
GENERIC_HIDE={'id','identifier','display_name','name','compartment_id','time_created','time_updated','defined_tags','freeform_tags','lifecycle_state','resource_type','identity_context','etag','time_last_modified'}
def properties(kind, raw):
    configured=FIELDS.get(kind,[])
    if not configured:
        configured=[(k,k.replace('_',' ')) for k,v in raw.items() if k not in GENERIC_HIDE and not k.startswith('_') and v not in (None,[],{})]
    return [{'field':p,'label':label,'value':at(raw,p)} for p,label in configured if at(raw,p) is not None]

def relations(raw, source):
    result=[]
    def walk(value,path):
        if isinstance(value,dict):
            for k,v in value.items():
                if k in ('defined_tags','freeform_tags','metadata'): continue
                walk(v,f'{path}.{k}' if path else k)
        elif isinstance(value,list):
            for v in value: walk(v,path)
        elif isinstance(value,str) and value.startswith('ocid1.') and path not in ('id','identifier','ocid'):
            result.append({'target':value,'field':path})
    walk(raw,'')
    return [dict(t) for t in sorted({tuple(r.items()) for r in result})]

def resource(kind, raw, *, tenancy_id, region, compartment_id, scope, observed_at, detail_complete=True, source='native', parent_id=''):
    raw=sanitize(raw)
    spec=find_spec(kind)
    if spec: kind=spec.kind
    ocid=raw.get('ocid') or raw.get('id') or raw.get('identifier') or raw.get('topic_id')
    name=raw.get('display_name') or raw.get('name') or raw.get('user_name') or raw.get('db_name') or raw.get('hostname') or raw.get('namespace_name') or ''
    if not ocid:
        ocid=f'{parent_id or compartment_id}::{region}::{kind}::{name or digest(raw)}'
    domain=raw.get('_identity_domain_id')
    identity=f'{domain}::{ocid}' if domain and not ocid.startswith('ocid1.') else ocid
    group=spec.group if spec else (800 if domain else 9900)
    key_kind={'DomainUser':'User','DomainGroup':'Group','DomainApp':'App'}.get(kind,kind)
    return {'key':f'{tenancy_id}::{key_kind}::{identity}','ocid':ocid,'name':name or ocid,'type':kind,'group':group,'service':GROUPS[group], 'tenancy_id':tenancy_id,'region':region,'compartment_id':raw.get('compartment_id') or compartment_id,'parent_id':parent_id or domain or '', 'state':raw.get('lifecycle_state') or ('ACTIVE' if raw.get('active') is True else ''),'scope':scope,'observed_at':observed_at,'detail_observed_at':observed_at if detail_complete else None,'detail_complete':detail_complete,'freshness':'current','source':source,'raw':raw,'properties':properties(kind,raw),'relations':relations(raw,ocid),'config_hash':digest(canonical(raw))}

def compartment_paths(compartments, tenancy):
    rows={x['id']:x for x in compartments}
    def path(cid,visited):
        if cid == tenancy['id']: return 'Root'
        if cid in visited: return '[Cycle]'
        row=rows.get(cid)
        if not row: return '[Unknown compartment]'
        return path(row.get('compartment_id'),visited|{cid})+'/'+row.get('name',cid)
    return {cid:path(cid,set()) for cid in {tenancy['id'],*rows}}

def apply_rules(records, rules):
    findings=[]
    for r in records:
        r['findings']=[]
        for rule in rules:
            if not rule.get('enabled',True) or r['type'] not in rule['types'] or not r['detail_complete'] or r['freshness']=='stale': continue
            actual=at(r['raw'],rule['field'])
            if actual is None: continue
            op=rule['operator']; expected=rule.get('expected')
            match=(actual!=expected if op=='not_equal' else actual==expected if op=='equal' else False)
            if op=='public_ingress':
                match=any(x.get('source') in ('0.0.0.0/0','::/0') for x in actual if isinstance(x,dict)) if isinstance(actual,list) else False
            if match:
                finding={'resource_key':r['key'],'resource_name':r['name'],'type':r['type'],'compartment':r.get('compartment',''),'region':r['region'],'rule_id':rule['id'],'title':rule['title'],'category':rule['category'],'field':rule['field'],'actual':actual,'expected':expected,'basis':rule['basis'],'source_url':rule.get('source_url','')}
                findings.append(finding); r['findings'].append(finding)
    return findings

def finish_snapshot(snapshot, previous, rules):
    paths=compartment_paths(snapshot['compartments'],snapshot['tenancy'])
    rows={r['key']:r for r in snapshot['resources']}
    events={e['scope']:e for e in snapshot['coverage'] if e.get('scope')}
    changes=[]
    if previous:
        for old in previous['resources']:
            new=rows.get(old['key'])
            if new is None:
                event=events.get(old['scope'],{})
                # A successful LIST proves absence from that scope, not deletion in OCI.
                if event.get('status') in ('SUCCESS','EMPTY') and old.get('source') in ('native','scim'):
                    changes.append({'kind':'MISSING','key':old['key'],'name':old['name'],'type':old['type'],'compartment':old.get('compartment',''),'region':old['region'],'fields':[],'evidence':'Absent from successful complete LIST; deletion or move requires confirmation.'})
                else:
                    stale=dict(old); stale['freshness']='stale'; rows[old['key']]=stale
                continue
            if not new['detail_complete'] and old.get('detail_complete'):
                new['previous_detail']={'observed_at':old['detail_observed_at'],'raw':old['raw'],'properties':old['properties']}
            elif not new['detail_complete'] and old.get('previous_detail'):
                new['previous_detail']=old['previous_detail']
            if not (new['detail_complete'] and old['detail_complete']) or new['freshness']=='stale': continue
            fields=diff_fields(canonical(old['raw']),canonical(new['raw']))
            if fields:
                category='CONFIG_CHANGED'
                if all(f['path'] in ('display_name','name') for f in fields): category='RENAMED'
                elif all(f['path']=='compartment_id' for f in fields): category='MOVED'
                elif all(f['path']=='lifecycle_state' for f in fields): category='STATE_CHANGED'
                changes.append({'kind':category,'key':new['key'],'name':new['name'],'type':new['type'],'compartment':paths.get(new['compartment_id'],'[Unknown compartment]'),'region':new['region'],'fields':fields})
        prevkeys={r['key'] for r in previous['resources']}
        changes += [{'kind':'ADDED','key':r['key'],'name':r['name'],'type':r['type'],'compartment':paths.get(r['compartment_id'],'[Unknown compartment]'),'region':r['region'],'fields':[]} for k,r in rows.items() if k not in prevkeys and r['freshness']=='current']
    for r in rows.values():
        r['compartment']=paths.get(r['compartment_id'],'[Unknown compartment]')
        r['properties']=properties(r['type'],r['raw'])
        r['relations']=relations(r['raw'],r['ocid'])
        if r.get('parent_id') and not any(x['target']==r['parent_id'] for x in r['relations']):
            r['relations'].append({'field':'parent_id','target':r['parent_id']})
    # OCI can reuse an Instance OCID for a BootVolumeAttachment. Prefer the
    # primary object as a relationship target; never collapse the two records.
    by_id={}
    for r in sorted(rows.values(),key=lambda r:('Attachment' in r['type'],r['key'])):
        by_id.setdefault(r['ocid'],r)
    for r in rows.values():
        for relation in r['relations']:
            if relation['target'] in by_id:
                relation['target_key']=by_id[relation['target']]['key']
        if r['type'] in ('Vcn','Subnet'):
            did=r['raw'].get('dhcp_options_id') or r['raw'].get('default_dhcp_options_id')
            dhcp=by_id.get(did)
            if dhcp and dhcp['detail_complete']:
                r['properties'].append({'field':'resolved.dhcp_options','label':'연결된 DHCP / DNS 설정','value':dhcp['raw'].get('options',[])})
        for prop in r['properties']:
            val=prop['value']
            if isinstance(val,str) and val.startswith('ocid1.') and val in by_id:
                prop['value']={'name':by_id[val]['name'],'ocid':val}
    snapshot['resources']=sorted(rows.values(),key=lambda r:(r['compartment'],r['region'],r['type'],r['name'].casefold(),r['key']))
    snapshot['changes']=changes; snapshot['comparison_run_id']=previous.get('run_id') if previous else None
    snapshot['rules']=rules; snapshot['findings']=apply_rules(snapshot['resources'],rules)
    snapshot['summary']={'resources':len(rows),'current':sum(r['freshness']=='current' for r in rows.values()),'stale':sum(r['freshness']=='stale' for r in rows.values()),'detailed':sum(r['detail_complete'] for r in rows.values()),'changes':len(changes),'findings':len(snapshot['findings']),'by_service':dict(Counter(r['service'] for r in rows.values())),'by_compartment':dict(Counter(r['compartment'] for r in rows.values()))}
    issues=[e for e in snapshot['coverage'] if e['status'] not in ('SUCCESS','EMPTY','CACHED','NOT_APPLICABLE')]
    snapshot['status']='PARTIAL' if issues or snapshot['summary']['stale'] else 'COMPLETE_REGISTERED_SCOPE'
    snapshot['coverage_note']='Status covers registered collectors only. Search has service-specific indexing limits; inaccessible/unregistered resources are not proven absent.'
    snapshot['completed_at']=now()
    return snapshot
