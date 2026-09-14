"""Optional localhost-only JSON inbox for Postman and the static website.

No OCI credentials, OCI APIs, remote writes, arbitrary paths or remote fetches.
"""
import argparse
import hmac
import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from model import SCHEMA, atomic_json, digest, read_json

ORIGINS={'https://jja6312.github.io','http://localhost:5173','http://127.0.0.1:5173'}
MAX_BYTES=200*1024*1024
def validate(data):
    if not isinstance(data,dict) or data.get('schema')!=SCHEMA or not isinstance(data.get('resources'),list): raise ValueError('Expected oci-inventory/v3 snapshot')
    tid=data.get('tenancy',{}).get('id','')
    if not isinstance(tid,str) or not tid.startswith('ocid1.tenancy.') or not isinstance(data.get('run_id'),str) or not isinstance(data.get('started_at'),str) or not isinstance(data.get('tenancy',{}).get('name'),str): raise ValueError('Tenancy / run_id / started_at missing')
    keys=set()
    for row in data['resources']:
        if not isinstance(row,dict) or row.get('tenancy_id')!=tid or not isinstance(row.get('key'),str) or row['key'] in keys: raise ValueError('Cross-tenancy or duplicate resource')
        keys.add(row['key'])
    return data

def server(root, token, port=8766):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    write_lock=threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,fmt,*args): pass
        def respond(self,status,data):
            payload=json.dumps(data,ensure_ascii=False).encode();self.send_response(status)
            origin=self.headers.get('Origin')
            if origin in ORIGINS: self.send_header('Access-Control-Allow-Origin',origin);self.send_header('Vary','Origin')
            self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        def authorized(self):
            origin=self.headers.get('Origin')
            if origin and origin not in ORIGINS: self.respond(403,{'error':'Origin not allowed'});return False
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'): self.respond(403,{'error':'Invalid local Host'});return False
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):self.respond(401,{'error':'Local token required'});return False
            return True
        def do_OPTIONS(self):
            origin=self.headers.get('Origin')
            if origin not in ORIGINS:self.respond(403,{'error':'Origin not allowed'});return
            self.send_response(204);self.send_header('Access-Control-Allow-Origin',origin);self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type');self.send_header('Access-Control-Allow-Private-Network','true');self.end_headers()
        def do_POST(self):
            if not self.authorized(): return
            if self.path!='/imports':self.respond(404,{'error':'Not found'});return
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<1 or length>MAX_BYTES:self.respond(413,{'error':'JSON must be 1 byte to 200 MB'});return
                data=validate(json.loads(self.rfile.read(length)))
                key=digest([data['tenancy']['id'],data['run_id']]);target=root/(key+'.json')
                with write_lock:
                    if target.exists() and read_json(target)!=data:self.respond(409,{'error':'Different data already exists for this run. Use a new run_id.'});return
                    atomic_json(target,data)
                self.respond(201,{'id':key,'tenancy':data['tenancy']['name'],'resources':len(data['resources'])})
            except (ValueError,KeyError,TypeError) as exc:self.respond(400,{'error':str(exc)})
        def do_GET(self):
            if not self.authorized(): return
            if self.path=='/imports':
                rows=[]
                for p in root.glob('*.json'):
                    data=read_json(p);rows.append({'id':p.stem,'name':data['run_id'],'tenancy':data['tenancy']['name'],'at':data['started_at']})
                self.respond(200,sorted(rows,key=lambda r:r['at'],reverse=True));return
            key=self.path.removeprefix('/imports/')
            if self.path.startswith('/imports/') and len(key)==64 and all(c in '0123456789abcdef' for c in key):
                target=root/(key+'.json')
                if target.exists():self.respond(200,read_json(target));return
            self.respond(404,{'error':'Not found'})
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--inbox',required=True);p.add_argument('--token-file',required=True);a=p.parse_args()
    tf=Path(a.token_file)
    if not tf.exists():atomic_json(tf,{'token':secrets.token_urlsafe(32)})
    token=read_json(tf)['token']
    print('Local inbox: http://127.0.0.1:8766/imports\nToken is in the specified private token file. Ctrl+C stops the bridge.',flush=True)
    server(a.inbox,token).serve_forever()
