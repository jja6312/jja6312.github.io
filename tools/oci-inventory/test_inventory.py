import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from model import canonical, diff_fields, finish_snapshot, resource, SCHEMA, sanitize
from safety import ACTIVE, UnsafeOperation, guard_transport, invoke, approved

TEN='ocid1.tenancy.oc1..test'
def record(raw=None):
    return resource('SecurityList',raw or {'id':'ocid1.securitylist.oc1.region.test','display_name':'web','compartment_id':TEN,'ingress_security_rules':[{'protocol':'6','source':'10.0.0.0/24','tcp_options':{'destination_port_range':{'min':443,'max':443}}}]},tenancy_id=TEN,region='test-region',compartment_id=TEN,scope='list-security',observed_at='2026-09-14T02:30:00+00:00')
def snap(rows,coverage=None):
    return {'schema':SCHEMA,'run_id':'new','tenancy':{'id':TEN,'name':'test'},'compartments':[],'resources':rows,'coverage':coverage or [],'rules':[]}

class InventoryTests(unittest.TestCase):
    def test_regional_resources_without_ocids_do_not_collide(self):
        rows=[resource('LogAnalyticsNamespace',{'namespace_name':'example'},tenancy_id=TEN,region=region,compartment_id=TEN,scope='test',observed_at='now') for region in ('region-a','region-b')]
        self.assertNotEqual(rows[0]['key'],rows[1]['key'])
    def test_attachment_and_instance_can_share_ocid(self):
        a=resource('Instance',{'id':'ocid1.instance.oc1..same'},tenancy_id=TEN,region='test',compartment_id=TEN,scope='instances',observed_at='now')
        b=resource('BootVolumeAttachment',{'id':'ocid1.instance.oc1..same'},tenancy_id=TEN,region='test',compartment_id=TEN,scope='attachments',observed_at='now')
        self.assertNotEqual(a['key'],b['key'])
    def test_reordered_rules_and_tags_no_false_change(self):
        a={'statements':['Allow A','Allow B'],'defined_tags':{'b':2,'a':1},'time_updated':'yesterday'}
        b={'statements':['Allow B','Allow A'],'defined_tags':{'a':1,'b':2},'time_updated':'today'}
        self.assertEqual(canonical(a),canonical(b))
    def test_ordered_arguments_preserve_order(self):
        self.assertNotEqual(canonical({'arguments':['a','b']}),canonical({'arguments':['b','a']}))
    def test_port_changes_are_specific(self):
        a=record(); b=copy.deepcopy(a); b['raw']['ingress_security_rules'][0]['tcp_options']['destination_port_range']['max']=8443
        diff=diff_fields(canonical(a['raw']),canonical(b['raw']))
        self.assertEqual([x['operation'] for x in diff],['REMOVE','ADD']); self.assertEqual(diff[1]['after']['tcp_options']['destination_port_range']['max'],8443)
    def test_missing_null_and_zero_differ(self):
        self.assertEqual(diff_fields({}, {'x':None})[0]['operation'],'ADD')
        self.assertEqual(diff_fields({'x':0},{'x':None})[0]['operation'],'CHANGE')
    def test_failed_scope_keeps_previous_record(self):
        old=finish_snapshot(snap([record()]),None,[])
        result=finish_snapshot(snap([],[{'scope':'list-security','status':'DENIED'}]),old,[])
        self.assertEqual(len(result['resources']),1); self.assertEqual(result['resources'][0]['freshness'],'stale'); self.assertEqual(result['changes'],[])
    def test_empty_success_is_missing_not_deleted(self):
        old=finish_snapshot(snap([record()]),None,[])
        result=finish_snapshot(snap([],[{'scope':'list-security','status':'EMPTY'}]),old,[])
        self.assertEqual(result['changes'][0]['kind'],'MISSING')
    def test_partial_detail_not_config_removal(self):
        old=finish_snapshot(snap([record()]),None,[]); r=record({'id':'ocid1.securitylist.oc1.region.test','display_name':'web'});r['detail_complete']=False
        result=finish_snapshot(snap([r]),old,[]); self.assertEqual(result['changes'],[])
        self.assertEqual(result['resources'][0]['previous_detail']['raw'],old['resources'][0]['raw'])
    def test_same_ocid_relationship_resolves_primary_instance(self):
        rows=[resource(kind,{'id':'ocid1.instance.oc1..same',**({'instance_id':'ocid1.instance.oc1..same'} if 'Attachment' in kind else {})},tenancy_id=TEN,region='test',compartment_id=TEN,scope=kind,observed_at='now') for kind in ('Instance','BootVolumeAttachment')]
        s=finish_snapshot(snap(rows),None,[])
        attachment=next(r for r in s['resources'] if r['type']=='BootVolumeAttachment')
        self.assertTrue(attachment['relations'][0]['target_key'].endswith('::Instance::ocid1.instance.oc1..same'))
    def test_transport_disables_redirects(self):
        captured=[]
        session=SimpleNamespace(request=lambda method,url,**kwargs:captured.append(kwargs))
        client=SimpleNamespace(base_client=SimpleNamespace(session=session,call_api=lambda resource_path,method:None,endpoint='https://iaas.ap-seoul-1.oraclecloud.com'))
        guard_transport('compute',client);token=ACTIVE.set(('compute','get_instance'))
        try: session.request('GET','https://iaas.ap-seoul-1.oraclecloud.com/instances',allow_redirects=True)
        finally: ACTIVE.reset(token)
        self.assertFalse(captured[0]['allow_redirects'])
    def test_deduplicate_by_resource_not_rule_count(self):
        result=finish_snapshot(snap([record(),record()]),None,[]); self.assertEqual(result['summary']['resources'],1)
    def test_sensitive_payloads_excluded_tags_preserved(self):
        self.assertEqual(sanitize({'password':'secret','freeform_tags':{'password':'user-approved-tag'},'metadata':{'user_data':'secret'}}),{'password':'[EXCLUDED: credential/payload]','freeform_tags':{'password':'user-approved-tag'},'metadata':{'user_data':'[EXCLUDED: credential/payload]'}})
    def test_no_prefix_based_permission(self):
        for service,method in [('compute','delete_instance'),('secrets','get_secret_bundle'),('network','get_ip_sec_connection_tunnel_shared_secret'),('object','get_object'),('iam','create_user')]:
            with self.assertRaises(UnsafeOperation): approved(service,method)
    def test_transport_blocks_mutations_and_unscoped_call(self):
        calls=[]
        def call_api(resource_path,method,**kwargs): calls.append(method); return method
        client=SimpleNamespace(base_client=SimpleNamespace(call_api=call_api,endpoint='https://iaas.ap-seoul-1.oraclecloud.com'))
        guard_transport('compute',client)
        with self.assertRaises(UnsafeOperation): client.base_client.call_api('/instances','GET')
        token=ACTIVE.set(('compute','get_instance'))
        try:
            self.assertEqual(client.base_client.call_api('/instances','GET'),'GET')
            for method in ('DELETE','PUT','POST','PATCH'): 
                with self.assertRaises(UnsafeOperation): client.base_client.call_api('/instances',method)
        finally: ACTIVE.reset(token)
        self.assertEqual(calls,['GET'])
    def test_search_post_explicitly_allowed(self):
        client=SimpleNamespace(base_client=SimpleNamespace(call_api=lambda resource_path,method: method,endpoint='https://query.ap-seoul-1.oraclecloud.com'))
        guard_transport('search',client); token=ACTIVE.set(('search','search_resources'))
        try: self.assertEqual(client.base_client.call_api('/resources','POST'),'POST')
        finally: ACTIVE.reset(token)
    def test_domain_ids_are_scoped(self):
        a=record({'id':'same','_identity_domain_id':'domain-a'}); b=record({'id':'same','_identity_domain_id':'domain-b'})
        self.assertNotEqual(a['key'],b['key'])

if __name__=='__main__': unittest.main()
