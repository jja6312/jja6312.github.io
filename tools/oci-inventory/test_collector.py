"""Local fake-response tests. No OCI client construction or cloud connection."""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from collector import Collector
from model import now
from specs import find_spec

class PageTests(unittest.TestCase):
    def test_get_compartment_uses_child_not_listing_parent(self):
        c=object.__new__(Collector)
        c.client=lambda *a:SimpleNamespace(get_compartment=lambda compartment_id:None)
        params=c.get_params(find_spec('Compartment'),{'id':'child'},{'compartment_id':'root'},'test')
        self.assertEqual(params,{'compartment_id':'child'})
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.c=object.__new__(Collector);self.c.raw_dir=Path(self.tmp.name);self.c.journal=Path(self.tmp.name)/'coverage.jsonl';self.c.coverage=[];self.c.lock=threading.RLock();self.c.resume=False;self.c.completed_scopes={}
    def bind(self,responses):
        requests=[]
        def list_instances(**kwargs):
            requests.append(kwargs);response=responses.pop(0)
            if isinstance(response,Exception):raise response
            return SimpleNamespace(data=response[0],headers=response[1])
        client=SimpleNamespace(list_instances=list_instances)
        self.c.client=lambda *a:client
        return requests
    def test_all_pages(self):
        req=self.bind([([{'id':'one'}],{'opc-next-page':'next'}),([{'id':'two'}],{})])
        rows,ok=self.c.call('compute','list_instances','test',{},'scope',listing=True)
        self.assertTrue(ok);self.assertEqual([x['id'] for x in rows],['one','two']);self.assertEqual(req[1]['page'],'next')
    def test_mid_page_failure_not_empty(self):
        self.bind([([{'id':'one'}],{'opc-next-page':'next'}),RuntimeError('timeout')])
        rows,ok=self.c.call('compute','list_instances','test',{},'scope',listing=True)
        self.assertFalse(ok);self.assertEqual(len(rows),1);self.assertEqual(self.c.coverage[-1]['status'],'FAILED');self.assertTrue(list(self.c.raw_dir.glob('*.partial.json')))
    def test_repeated_page_stops(self):
        self.bind([([{'id':'one'}],{'opc-next-page':'repeat'}),([{'id':'one'}],{'opc-next-page':'repeat'})])
        _,ok=self.c.call('compute','list_instances','test',{},'scope',listing=True);self.assertFalse(ok)
    def test_resume_reuses_completed_responses(self):
        req=self.bind([([{'id':'one'}],{})]);self.c.call('compute','list_instances','test',{},'scope',listing=True)
        self.c.resume=True;self.c.completed_scopes={'scope':self.c.coverage[-1]}
        rows,ok=self.c.call('compute','list_instances','test',{},'scope',listing=True)
        self.assertTrue(ok);self.assertEqual(len(req),1);self.assertEqual(rows,[{'id':'one'}])
    def test_scim_server_page_cap(self):
        req=[]
        def list_users(**kwargs):
            req.append(kwargs);start=kwargs['start_index'];rows=[{'id':str(i)} for i in range(start,min(start+2,4))]
            data=SimpleNamespace(resources=rows,total_results=3)
            # SDK conversion uses these documented model attributes.
            data.swagger_types={'resources':'list[dict]','total_results':'int'};data.attribute_map={'resources':'Resources','total_results':'totalResults'}
            return SimpleNamespace(data=data,headers={})
        self.c.client=lambda *a:SimpleNamespace(list_users=list_users)
        rows,ok=self.c.call('domains','list_users','test',{},'scim',listing=True,scim=True)
        self.assertTrue(ok);self.assertEqual(len(rows),3);self.assertEqual([r['start_index'] for r in req],[1,3])

if __name__=='__main__':unittest.main()
