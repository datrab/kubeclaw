import pathlib,json,subprocess,hashlib,tomllib,re
out=pathlib.Path('docs/review/evidence/config-acceptance/independent-delivery-source-bce3f075')
delivery=pathlib.Path('docs/review/evidence/config-acceptance/delivery')
records=[]
def run(id,argv):
 r=subprocess.run(argv,capture_output=True,text=True);(out/(id+'.stdout')).write_text(r.stdout);(out/(id+'.stderr')).write_text(r.stderr);records.append({'id':id,'command':argv,'exit':r.returncode,'raw':[str(out/(id+'.stdout')),str(out/(id+'.stderr'))]});return r
chart=json.loads((delivery/'residual-chart-definitions-bce3f075-observer2.json').read_text());manifests={}
for old in chart['records']:
 cmd=list(old['command']);id=old['id']
 if cmd[0]=='helm' and cmd[1]=='template':
  x=run(id,cmd);f=out/(id+'.yaml');f.write_text(x.stdout);manifests[str(delivery/'residual-chart-definitions-bce3f075-observer2'/(id+'.yaml'))]=str(f)
 else:
  cmd=[manifests.get(a,a) for a in cmd]
  if cmd[0]=='helm' and cmd[1]=='package':cmd[cmd.index('--destination')+1]=str(out)
  x=run(id,cmd)
  if cmd[0]=='kubeconform':
   m=re.search(r'(?:Resources?|Files?)?:?\s*(\d+).*?Valid:\s*(\d+).*?Invalid:\s*(\d+).*?Errors:\s*(\d+).*?Skipped:\s*(\d+)',x.stdout,re.I|re.S);records[-1]['collection']=list(map(int,m.groups())) if m else None
for name in ['A','B']:
 argv=['node','scripts/render-native-worker-node.mjs',str(delivery/'native-host-definition-profiles-bce3f075'/(name+'.yaml')),str(out/('native-'+name))];x=run('native-render-'+name,argv)
 if x.returncode==0:
  folder=out/('native-'+name);a=json.loads((folder/'buster-pool.json').read_text());b=json.loads((folder/'prism-pool.json').read_text());n=json.loads((folder/'native-nri.json').read_text());s=json.loads((folder/'native-node-policy.json').read_text());records[-1]['bindingChecks']={'samePoolDigest':a['policyDigest']==b['policyDigest'],'nriBusterDigest':n['roles']['buster']['policyDigest']==a['policyDigest'],'nriPrismDigest':n['roles']['prism']['policyDigest']==b['policyDigest'],'setupBothLimits':s['pools']=={'buster':a['limits'],'prism':b['limits']}}
for p in sorted((delivery/'codex-definition-profiles-bce3f075').glob('*.toml')):
 try:tomllib.loads(p.read_text());records.append({'id':'toml-'+p.stem,'profile':str(p),'result':'passed','scope':'standard Python TOML syntax only'})
 except Exception as e:records.append({'id':'toml-'+p.stem,'result':'failed','error':str(e)})
for p in sorted((delivery/'lint-definition-profiles-bce3f075').glob('*.eslint.config.mjs')):run('eslint-'+p.stem,['node','--check',str(p)])
result={'scope':'safe independent document/render/parser controls only. No author writes/native service/image/account/API actions. Current input profiles only; not proposed loader/EFFECT acceptance.','records':records,'command':'python3 '+str(pathlib.Path(__file__)),'scriptSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'failed':sum(r.get('exit',0)!=0 or r.get('result')=='failed' or r.get('bindingChecks') is not None and not all(r['bindingChecks'].values()) for r in records)}
(out/'safe-reproductions.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'records':len(records),'failed':result['failed'],'schemaCollections':[r.get('collection') for r in records if 'collection' in r]},indent=2))
