"""Fail-closed OCI transport: exact operation allowlist AND HTTP method checks."""
import contextvars
import inspect
import re
from urllib.parse import urlparse
from specs import ALLOWLIST, CLIENTS

ACTIVE = contextvars.ContextVar('inventory_operation', default=None)
POST_READS = {('search','search_resources'),('monitor','summarize_metrics_data')}
FORBIDDEN = re.compile(r'(secret_bundle|shared_secret|wallet|private_key|auth_token|api_key|credential|object_content|console_history_content|connection_string|kubeconfig|kube_config|file_content|repository_file_content|model_artifact|function_invoke)')

class UnsafeOperation(RuntimeError): pass

def approved(service, method):
    if method not in ALLOWLIST.get(service,set()) or FORBIDDEN.search(method):
        raise UnsafeOperation(f'Operation not approved: {service}.{method}')
    if not method.startswith(('get_','list_')) and (service,method) not in POST_READS:
        raise UnsafeOperation(f'Operation is not a reviewed read: {service}.{method}')

def check_endpoint(endpoint):
    parsed=urlparse(endpoint)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None,443):
        raise UnsafeOperation('Endpoint must be an Oracle HTTPS service endpoint')
    hostname=parsed.hostname or ''
    if not any(hostname.endswith('.'+suffix) for suffix in ('oraclecloud.com','oraclecloud8.com','oraclegovcloud.com','oraclegovcloud.uk','oraclecloud.eu','oci.oraclecloud.com')):
        raise UnsafeOperation('Endpoint is outside the approved Oracle domains')

def guard_transport(service, client):
    session=getattr(client.base_client,'session',None)
    if session is not None:
        original_request=session.request
        def checked_request(method,url,**kwargs):
            active=ACTIVE.get()
            if not active or active[0]!=service: raise UnsafeOperation('HTTP request outside the approved boundary')
            approved(*active)
            if method.upper()!='GET' and not (method.upper()=='POST' and active in POST_READS):
                raise UnsafeOperation('Blocked HTTP request method')
            check_endpoint(url)
            kwargs['allow_redirects']=False
            return original_request(method,url,**kwargs)
        session.request=checked_request
    original=client.base_client.call_api
    signature=inspect.signature(original)
    def guarded(*args,**kwargs):
        active=ACTIVE.get()
        if not active or active[0]!=service: raise UnsafeOperation('OCI request outside the approved call boundary')
        approved(*active)
        bound=signature.bind_partial(*args,**kwargs)
        verb=str(bound.arguments.get('method','')).upper()
        if verb != 'GET' and not (verb=='POST' and active in POST_READS):
            raise UnsafeOperation(f'Blocked HTTP {verb} for {active}')
        check_endpoint(client.base_client.endpoint)
        # The session boundary above also checks the final URL and disables redirects.
        return original(*args,**kwargs)
    client.base_client.call_api=guarded
    return client

def invoke(service, client, method, **kwargs):
    approved(service,method)
    token=ACTIVE.set((service,method))
    try: return getattr(client,method)(**kwargs)
    finally: ACTIVE.reset(token)

def create_client(oci, service, config, endpoint=None):
    module,name=CLIENTS[service]
    factory=getattr(getattr(oci,module),name)
    options={'timeout':(10,45)}
    if endpoint:
        check_endpoint(endpoint); options['service_endpoint']=endpoint
    client=factory(config,**options)
    return guard_transport(service,client)
