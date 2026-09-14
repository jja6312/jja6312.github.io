import http.client
import json
import tempfile
import threading
import unittest
from bridge import server

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.http=server(self.tmp.name,'test-only-token',port=0)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.tmp.cleanup);self.addCleanup(self.http.server_close);self.addCleanup(self.http.shutdown)
        self.data={'schema':'oci-inventory/v3','run_id':'test','started_at':'2026-09-14T00:00:00Z','tenancy':{'id':'ocid1.tenancy.oc1..test','name':'Example'},'resources':[]}
    def request(self,method,url,data=None,**headers):
        c=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=5)
        c.request(method,url,json.dumps(data) if data is not None else None,headers)
        r=c.getresponse();body=json.loads(r.read());c.close();return r.status,body
    def test_local_import_and_conflict(self):
        auth={'Authorization':'Bearer test-only-token'}
        status,row=self.request('POST','/imports',self.data,**auth);self.assertEqual(status,201)
        self.assertEqual(self.request('GET','/imports/'+row['id'],**auth)[1],self.data)
        self.assertEqual(self.request('POST','/imports',{**self.data,'started_at':'different'},**auth)[0],409)
        self.assertEqual(self.request('GET','/imports/'+row['id'],**auth)[1],self.data)
    def test_requires_token_and_approved_origin(self):
        self.assertEqual(self.request('GET','/imports')[0],401)
        self.assertEqual(self.request('GET','/imports',Authorization='Bearer test-only-token',Origin='https://untrusted.example')[0],403)
    def test_rejects_invalid_resource(self):
        self.assertEqual(self.request('POST','/imports',{**self.data,'resources':[1]},Authorization='Bearer test-only-token')[0],400)

if __name__=='__main__': unittest.main()
