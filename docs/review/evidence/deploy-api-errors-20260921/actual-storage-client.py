"""Original teardown entrypoint, actual kubectl/Helm reads, local HTTP storage fixture.
GitOps discovery is a CLI fixture; Helm uninstall is recorded, never executed.
"""
import base64, gzip, json, os, pathlib, shutil, subprocess, tempfile, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT=pathlib.Path.cwd(); OUT=ROOT/'docs/review/evidence/deploy-api-errors-20260921'
HELM=shutil.which('helm'); KUBECTL=shutil.which('kubectl')
state={'mode':'empty','driver':'secret','calls':[]}

def records():
 mode=state['mode']; result=[]
 for revision in ([] if mode in ('empty','denied') else [1,2] if mode in ('corrupt-latest','corrupt-older','valid-history') else [1]):
  status='superseded' if revision==1 and mode=='valid-history' else 'deployed'
  release={'name':'agent-nova','namespace':'guard-test','version':revision,'info':{'status':status},'chart':{'metadata':{'name':'fixture','version':'1.0.0'}}}
  if mode=='wrong-decoded-identity': release['name']='other'
  corrupt=mode=='corrupt' or mode=='corrupt-latest' and revision==2 or mode=='corrupt-older' and revision==1
  encoded='corrupt-fixture-record' if corrupt else base64.b64encode(gzip.compress(json.dumps(release).encode())).decode()
  secret=state['driver']=='secret'; value=base64.b64encode(encoded.encode()).decode() if secret else encoded
  result.append({'kind':'Secret' if secret else 'ConfigMap','apiVersion':'v1','metadata':{'name':f'sh.helm.release.v1.agent-nova.v{revision}','namespace':'guard-test',
    'labels':{'owner':'helm','name':'agent-nova','version':str(revision),'status':status}},'type':'helm.sh/release.v1','data':{'release':value}})
 return result

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  state['calls'].append(self.path); parsed=urllib.parse.urlparse(self.path); p=parsed.path; status=200
  collection='/api/v1/namespaces/guard-test/'+('secrets' if state['driver']=='secret' else 'configmaps')
  if p=='/version': value={'major':'1','minor':'34','gitVersion':'v1.34.0'}
  elif p=='/api': value={'kind':'APIVersions','apiVersion':'v1','versions':['v1'],'serverAddressByClientCIDRs':[]}
  elif p=='/apis': value={'kind':'APIGroupList','apiVersion':'v1','groups':[]}
  elif p=='/api/v1': value={'kind':'APIResourceList','groupVersion':'v1','resources':[{'name':name,'singularName':'','namespaced':True,'kind':kind,'verbs':['get','list']} for name,kind in [('secrets','Secret'),('configmaps','ConfigMap')]]}
  elif p==collection:
   if state['mode']=='denied': status=403; value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'Forbidden','code':403,'message':'fixture credential not found'}
   else:
    selector=urllib.parse.parse_qs(parsed.query).get('labelSelector',[''])[0]
    assert 'owner=helm' in selector and 'name=' in selector, selector
    items=records() if 'name=agent-nova' in selector else []
    value={'kind':'SecretList' if state['driver']=='secret' else 'ConfigMapList','apiVersion':'v1','metadata':{'resourceVersion':'1'},'items':items}
  elif p.startswith(collection+'/'):
   value=next((item for item in records() if item['metadata']['name']==p.rsplit('/',1)[1]),None)
   if value is None: status=404; value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'NotFound','code':404}
  else: status=404; value={'kind':'Status','apiVersion':'v1','status':'Failure','reason':'NotFound','code':404}
  data=json.dumps(value).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)

server=ThreadingHTTPServer(('127.0.0.1',0),Handler); threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with tempfile.TemporaryDirectory(prefix='actual-storage-client-') as temporary:
  folder=pathlib.Path(temporary); config=folder/'config'; calls=folder/'calls'; cache=folder/'cache'
  config.write_text(json.dumps({'apiVersion':'v1','kind':'Config','clusters':[{'name':'local','cluster':{'server':f'http://127.0.0.1:{server.server_port}'}}],'contexts':[{'name':'local','context':{'cluster':'local'}}],'current-context':'local'}))
  for command in ('helm','kubectl'):
   file=folder/command
   file.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys
name=pathlib.Path(sys.argv[0]).name; a=sys.argv[1:]
with open(os.environ['FIXTURE_CALLS'],'a') as f:f.write(json.dumps([name,*a])+'\\n')
if name=='helm':
 if a[0]=='uninstall':sys.exit(0)
 if a[0]!='status':sys.exit(91)
 os.execv(os.environ['ACTUAL_HELM'],[os.environ['ACTUAL_HELM'],*a])
if a[:3]==['get','crd','applications.argoproj.io']:sys.exit(0)
if a[:2]==['get','deployments,statefulsets,cronjobs']:print('{"items":[]}');sys.exit(0)
os.execv(os.environ['ACTUAL_KUBECTL'],[os.environ['ACTUAL_KUBECTL'],'--cache-dir',os.environ['FIXTURE_CACHE'],*a])
'''); file.chmod(0o755)
  results=[]
  for driver in ('secret','configmap'):
   for mode in ('empty','valid','valid-history','denied','corrupt','corrupt-latest','corrupt-older','wrong-decoded-identity'):
    state.update(mode=mode,driver=driver,calls=[]); calls.write_text('')
    run=subprocess.run(['bash',str(ROOT/'scripts/deploy.sh'),'teardown-agents'],capture_output=True,text=True,timeout=30,
     env={**os.environ,'PATH':str(folder)+os.pathsep+os.environ['PATH'],'KUBECONFIG':str(config),'HELM_DRIVER':driver,'NAMESPACE':'guard-test',
      'ACTUAL_HELM':HELM,'ACTUAL_KUBECTL':KUBECTL,'FIXTURE_CALLS':str(calls),'FIXTURE_CACHE':str(cache)})
    commands=[json.loads(line) for line in calls.read_text().splitlines()]; mutations=[c for c in commands if c[:2]==['helm','uninstall']]
    expected=mode in ('empty','valid','valid-history')
    assert (run.returncode==0)==expected,(driver,mode,run.stdout,run.stderr)
    assert len(mutations)==(1 if mode in ('valid','valid-history') else 0),(driver,mode,mutations)
    results.append({'driver':driver,'mode':mode,'status':run.returncode,'stdout':run.stdout,'stderr':run.stderr,'commands':commands,'httpRequests':state['calls']})
    print(driver,mode,'PASS',run.returncode,'uninstalls',len(mutations))
  (OUT/'actual-storage-client.json').write_text(json.dumps(results,indent=2)+'\n')
finally:server.shutdown();server.server_close()
