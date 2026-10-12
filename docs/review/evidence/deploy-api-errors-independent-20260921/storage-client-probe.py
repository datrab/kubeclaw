import base64,gzip,json,os,pathlib,subprocess,tempfile,threading,urllib.parse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
root=pathlib.Path.cwd();out=root/'docs/review/evidence/deploy-api-errors-independent-20260921'
state={'mode':'empty','backend':'secret','calls':[]}
marker='NEVER_PRINT_REVIEW_RELEASE_SECRET'
def records():
 mode=state['mode'];backend=state['backend'];items=[]
 if mode=='empty':return items
 revisions=[1,2] if mode in ['corrupt-latest','corrupt-old','two-valid'] else [1]
 for revision in revisions:
  corrupt=mode=='corrupt-only' or (mode=='corrupt-latest' and revision==2) or (mode=='corrupt-old' and revision==1)
  status='pending-upgrade' if mode=='pending' or (mode=='corrupt-latest' and revision==2) else 'deployed'
  release={'name':'wrong' if mode=='wrong-decoded-name' else 'agent-nova','namespace':'guard-test','version':revision,'info':{'status':status,'notes':marker},'chart':{'metadata':{'name':'fixture','version':'1.0.0'}}}
  encoded=base64.b64encode(gzip.compress(json.dumps(release).encode())).decode() if not corrupt else 'not-valid-base64'
  if backend=='secret':encoded=base64.b64encode(encoded.encode()).decode()
  item={'kind':'Secret' if backend=='secret' else 'ConfigMap','apiVersion':'v1','metadata':{'name':f'sh.helm.release.v1.agent-nova.v{revision}','namespace':'guard-test','labels':{'owner':'helm','name':'agent-nova','status':status,'version':str(revision)}},'data':{'release':encoded}}
  if backend=='secret':item['type']='helm.sh/release.v1'
  items.append(item)
 return items
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  state['calls'].append(self.path);p=urllib.parse.urlparse(self.path);status=200;collection=f"/api/v1/namespaces/guard-test/{state['backend']}s"
  if p.path=='/version':value={'major':'1','minor':'34','gitVersion':'v1.34.0'}
  elif p.path=='/api':value={'kind':'APIVersions','apiVersion':'v1','versions':['v1'],'serverAddressByClientCIDRs':[]}
  elif p.path=='/apis':value={'kind':'APIGroupList','apiVersion':'v1','groups':[]}
  elif p.path=='/api/v1':value={'kind':'APIResourceList','groupVersion':'v1','resources':[{'name':name+'s','singularName':'','namespaced':True,'kind':kind,'verbs':['get','list']} for name,kind in [('secret','Secret'),('configmap','ConfigMap')]]}
  elif p.path==collection:value={'kind':'SecretList' if state['backend']=='secret' else 'ConfigMapList','apiVersion':'v1','metadata':{'resourceVersion':'1'},'items':records()}
  elif p.path.startswith(collection+'/'):
   found=[record for record in records() if record['metadata']['name']==p.path.rsplit('/',1)[1]]
   if found:value=found[0]
   else:status=404;value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'NotFound','code':404}
  else:status=404;value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'NotFound','code':404,'message':'fixture path unsupported'}
  if state['mode']=='denied' and p.path==collection:status=403;value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'Forbidden','code':403,'message':'fixture credentials not found'}
  data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with tempfile.TemporaryDirectory(prefix='deploy-storage-actual-') as temp:
  config=pathlib.Path(temp)/'config';config.write_text(json.dumps({'apiVersion':'v1','kind':'Config','clusters':[{'name':'local','cluster':{'server':f'http://127.0.0.1:{server.server_port}'}}],'contexts':[{'name':'local','context':{'cluster':'local'}}],'current-context':'local'}))
  source=(root/'scripts/deploy.sh').read_text();start=source.index('require_shared_helm_connection() {');end=source.index('\nobserve_exact_resource()',start)
  function=source[start:end];assert 'helm status' in function
  if os.environ.get('REVIEW_MUTANT_LATEST_ONLY')=='1':
   old='  if [[ -n $records ]]; then';assert function.count(old)==1
   function=function.replace(old,'  records=$(printf \'%s\\n\' \"$records\" | tail -n 1)\n'+old)
  script=pathlib.Path(temp)/'observe.sh';script.write_text('set -euo pipefail\nerr() { printf "%s\\n" "$*" >&2; }\n'+function+'\nobserve_helm_release agent-nova guard-test\n')
  results=[]
  for backend in ['secret','configmap']:
   for mode in ['empty','valid','pending','denied','corrupt-only','corrupt-latest','corrupt-old','two-valid','wrong-decoded-name']:
    state.update(mode=mode,backend=backend,calls=[])
    result=subprocess.run(['bash',str(script)],text=True,capture_output=True,timeout=15,env={**os.environ,'HELM_DRIVER':backend,'KUBECONFIG':str(config),'SCRIPT_DIR':str(root/'scripts')})
    good=mode in ['empty','valid','two-valid','pending'];want='absent' if mode=='empty' else 'pending-upgrade' if mode=='pending' else 'deployed'
    record={'backend':backend,'mode':mode,'status':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'calls':state['calls']};results.append(record)
    (out/('storage-client-latest-only-mutant.json' if os.environ.get('REVIEW_MUTANT_LATEST_ONLY')=='1' else 'storage-client-probe.json')).write_text(json.dumps(results,indent=2)+'\n')
    assert marker not in result.stdout+result.stderr,record
    assert (result.returncode==0)==good,record
    if good:assert result.stdout==want,record
    if mode=='two-valid':assert all(any(url.endswith(f'.v{revision}') for url in state['calls']) for revision in [1,2]),record
    print('PASS',backend,mode,result.returncode,result.stdout)
finally:server.shutdown();server.server_close()
