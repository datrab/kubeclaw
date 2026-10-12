import base64,gzip,json,pathlib,subprocess,tempfile,threading,urllib.parse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
root=pathlib.Path.cwd();out=root/'docs/review/evidence/deploy-api-errors-independent-20260921'
state={'mode':'empty','calls':[]}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  state['calls'].append(self.path);p=urllib.parse.urlparse(self.path);status=200
  if p.path=='/version': value={'major':'1','minor':'34','gitVersion':'v1.34.0'}
  elif p.path=='/api': value={'kind':'APIVersions','apiVersion':'v1','versions':['v1'],'serverAddressByClientCIDRs':[]}
  elif p.path=='/apis': value={'kind':'APIGroupList','apiVersion':'v1','groups':[]}
  elif p.path=='/api/v1': value={'kind':'APIResourceList','groupVersion':'v1','resources':[{'name':'secrets','singularName':'','namespaced':True,'kind':'Secret','verbs':['get','list']}]}
  elif p.path=='/api/v1/namespaces/guard-test/secrets':
   items=[]
   if state['mode']=='denied':status=403;value={'kind':'Status','apiVersion':'v1','status':'Failure','message':'credential not found','reason':'Forbidden','code':403}
   else:
    if state['mode'] in ['valid','corrupt','corrupt-latest']:
     release={'name':'agent-nova','namespace':'guard-test','version':1,'info':{'status':'deployed'},'chart':{'metadata':{'name':'fixture','version':'1.0.0'}}}
     encoded=base64.b64encode(gzip.compress(json.dumps(release).encode())).decode() if state['mode'] in ['valid','corrupt-latest'] else 'not-valid-base64'
     items=[{'kind':'Secret','apiVersion':'v1','metadata':{'name':'sh.helm.release.v1.agent-nova.v1','namespace':'guard-test','labels':{'owner':'helm','name':'agent-nova','status':'deployed','version':'1'}},'type':'helm.sh/release.v1','data':{'release':base64.b64encode(encoded.encode()).decode()}}]
    if state['mode']=='corrupt-latest':
     bad=json.loads(json.dumps(items[0]));bad['metadata']['name']='sh.helm.release.v1.agent-nova.v2';bad['metadata']['labels'].update(version='2',status='pending-upgrade');bad['data']['release']=base64.b64encode(b'not-valid-base64').decode();items.append(bad)
    value={'kind':'SecretList','apiVersion':'v1','metadata':{'resourceVersion':'1'},'items':items}
  else: status=404;value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'NotFound','code':404,'message':'fixture path unsupported'}
  data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with tempfile.TemporaryDirectory(prefix='deploy-actual-client-') as temp:
  config=pathlib.Path(temp)/'config';config.write_text(json.dumps({'apiVersion':'v1','kind':'Config','clusters':[{'name':'local','cluster':{'server':f'http://127.0.0.1:{server.server_port}'}}],'contexts':[{'name':'local','context':{'cluster':'local'}}],'current-context':'local'}))
  results=[]
  for mode in ['empty','valid','denied','corrupt','corrupt-latest']:
   state['mode']=mode;state['calls']=[]
   cmd=['helm','--kubeconfig',str(config),'list','--all','-n','guard-test','--filter','^agent-nova$','--max','2','-o','json']
   result=subprocess.run(cmd,text=True,capture_output=True,timeout=10)
   parser=subprocess.run(['node',str(root/'scripts/deploy-observation.mjs'),'helm','release','agent-nova','guard-test'],input=result.stdout,text=True,capture_output=True)
   record={'mode':mode,'status':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'parserStatus':parser.returncode,'parserOutput':parser.stdout,'calls':state['calls']};results.append(record)
  (out/'client-probe.json').write_text(json.dumps(results,indent=2)+'\n')
  for r in results:print(r['mode'],r['status'],r['stdout'].strip(),'parser',r['parserOutput'])
finally:server.shutdown();server.server_close()
