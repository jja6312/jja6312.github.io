"""Offline SDK contract validation; never constructs a client or calls OCI."""
import inspect
import json
import re
from pathlib import Path
import oci
from specs import SPECS, CLIENTS, ALLOWLIST
from safety import approved, POST_READS

def validate():
    issues=[]; valid=0
    for service,methods in ALLOWLIST.items():
        module,name=CLIENTS[service]
        factory=getattr(getattr(oci,module,None),name,None)
        for method in sorted(methods):
            approved(service,method)
            fn=getattr(factory,method,None)
            if not fn: issues.append({'operation':f'{service}.{method}','reason':'Not in installed SDK'}); continue
            src=inspect.getsource(fn)
            verbs=re.findall(r'\bmethod\s*=\s*[\'"]([A-Z]+)',src)
            if len(verbs)!=1 or not (verbs[0]=='GET' or (verbs[0]=='POST' and (service,method) in POST_READS)):
                issues.append({'operation':f'{service}.{method}','reason':'HTTP verb not explicitly approved','verbs':verbs})
            valid+=1
    for s in SPECS:
        module,name=CLIENTS[s.client]; factory=getattr(getattr(oci,module,None),name,None); fn=getattr(factory,s.listing,None)
        if not fn: continue
        needed=[p.name for p in inspect.signature(fn).parameters.values() if p.name!='self' and p.default==p.empty and p.kind not in (p.VAR_POSITIONAL,p.VAR_KEYWORD)]
        missing=set(needed)-dict(s.bindings).keys()
        if missing: issues.append({'operation':f'{s.client}.{s.listing}','kind':s.kind,'reason':'Missing required LIST binding','parameters':sorted(missing)})
    return {'sdk':oci.__version__,'registered_types':len(SPECS),'approved_operations':valid,'issues':issues}
if __name__=='__main__':
    report=validate(); print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(1 if report['issues'] else 0)
