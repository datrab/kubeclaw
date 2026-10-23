"""New current C0 complete Helm/profile/schema witnesses, never native/API effects."""
import pathlib,json,hashlib,subprocess,copy,re,sys
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];dest=out/'residual-chart-definitions-bce3f075';dest.mkdir(exist_ok=False);records=[];witnesses=[];sources={}
def digest(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def record(id,cmd,expect=0):
 result=subprocess.run(cmd,cwd=repo,text=True,capture_output=True);stdout=dest/(id+'.stdout');stderr=dest/(id+'.stderr');stdout.write_text(result.stdout);stderr.write_text(result.stderr);r={'id':id,'command':cmd,'exit':result.returncode,'expectedExit':expect,'rawEvidencePaths':[str(f.relative_to(repo)) for f in [stdout,stderr]],'result':'passed' if result.returncode==expect else 'failed'};records.append(r);return result,r
schema=out/'pinned-kubernetes-json-schema/c8f4e61c63bc529749125ac566bccc6986e08d45/v1.35.6-standalone-strict/{{.ResourceKind}}{{.KindSuffix}}.json';aliases=out/'pinned-schema-aliases/{{.ResourceKind}}{{.KindSuffix}}.json'
# Definition-only profiles inherit ALL previously observed correlated native guards.
for role,chart,old in [('NOVA','kubeclaw','profile-kubeclaw'),('BUSTER','kubeclaw','profile-kubeclaw-buster'),('PRISM','prism','profile-prism')]:
 for name,n in [('A',1),('B',2)]:
  v=json.loads((out/'kubernetes-boundary-definition'/f'{old}-{name}.json').read_text())
  if chart=='kubeclaw':
   v['agentRole']='nova' if role=='NOVA' else 'buster';v.setdefault('agent',{}).setdefault('model',{}).update(primary='openai/gpt-5.6-sol' if n==1 else 'openai/gpt-5.5',fallbacks=['openai/gpt-5.5'] if n==1 else ['openai/gpt-5.6-sol'])
   v.setdefault('gateway',{}).update(port=18780+n,bridgePort=18790+n,url=f'http://127.0.0.1:{18780+n}')
   v['service']={'type':'ClusterIP','gatewayPort':18780+n,'gatewayTargetPort':18780+n,'bridgeEnabled':False,'bridgePort':18790+n,'nodePort':0,'bridgeNodePort':0,'extraPorts':[]}
   v['probes']={'startup':{'enabled':True,'initialDelaySeconds':n,'periodSeconds':5+n,'timeoutSeconds':3+n,'failureThreshold':20+n},'readiness':{'enabled':True,'initialDelaySeconds':n,'periodSeconds':6+n,'timeoutSeconds':4+n,'failureThreshold':3+n},'dependencies':{'gateway':{'enabled':True},'redis':{'enabled':True},'redisStream':{'enabled':True,'stream':f'dlv:health:{name.lower()}','maxLen':500*n},'litellm':{'enabled':False},'registries':{'enabled':True,'endpoints':[f'https://registry-{name.lower()}.delivery.invalid']}}}
   v['shutdown']={'terminationGracePeriodSeconds':180+10*n,'preStopDrainSeconds':5+n,'drainFile':f'/tmp/dlv-{name.lower()}-draining'}
   v['workspace']={'enabled':True,'overrideOnRestart':False,'soul':f'Delivery definition {name}','agents':'','user':'','tools':'','memory':'','identity':'','bootstrap':''}
   v['pluginSeed']={'installMode':'external-official','specs':['npm:@openclaw/acpx@2026.9.5','npm:@openclaw/discord@2026.9.5']}
   for field,value in [('agent.model.primary',v['agent']['model']['primary']),('gateway.port',18780+n),('gateway.url',v['gateway']['url']),('shutdown.drainFile',v['shutdown']['drainFile']),('workspace.soul',v['workspace']['soul'])]:witnesses.append({'profile':role+'-'+name,'field':field,'expected':value,'scope':'definition input; output observer below'})
  else:
   v['studio']['replicas']=n # current opaque Chart object permits2; source/API/runtime topology not claimed safe
   v['workerTrust']['spiffe'].update(trustDomain='delivery.invalid',novaNamespace='dlv-nova-'+name.lower(),novaServiceAccount='nova',agentNamespace='dlv-agent-'+name.lower(),agentServiceAccount='agent')
   v['control']['productDecisions']['authorityRevision']='dlv-unused-'+name.lower()
   witnesses.append({'profile':role+'-'+name,'field':'studio.replicas','expected':n,'scope':'current definition permissive shape, NOT accepted runtime exclusivity'})
  profile=dest/f'{role}-{name}.json';profile.write_text(json.dumps(v,indent=2)+'\n');sources[str(profile.relative_to(repo))]=digest(profile)
  id=f'DLV-C0-BCE3-RENDER-{role}-{name}';result,r=record(id,['helm','template','delivery-'+role.lower(),'charts/'+chart,'--namespace','default','-f',str(profile.relative_to(repo))]);manifest=dest/(id+'.yaml');manifest.write_text(result.stdout);sources[str(manifest.relative_to(repo))]=digest(manifest)
  if r['result']=='passed':
   result,s=record(f'DLV-C0-BCE3-SCHEMA-{role}-{name}',['kubeconform','-strict','-summary','-kubernetes-version','1.35.6','-schema-location',str(schema),'-schema-location',str(aliases),str(manifest.relative_to(repo))]);m=re.search(r'(?:Resources?|Files?)?:?\s*(\d+).*?Valid:\s*(\d+).*?Invalid:\s*(\d+).*?Errors:\s*(\d+).*?Skipped:\s*(\d+)',result.stdout,re.I|re.S)
   if m:s['collection']={k:int(x) for k,x in zip(['collected','valid','invalid','errors','skipped'],m.groups())}
   s['result']='passed' if s['exit']==0 and m and int(m[1])>0 and int(m[1])==int(m[2]) and all(int(m[i])==0 for i in [3,4,5]) else 'failed'
  if chart=='kubeclaw' and r['result']=='passed':
   # Real rendered ConfigMap parsed with repository YAML library; no OpenClaw process.
   node="const fs=require('fs'),yaml=require('js-yaml'); const docs=yaml.loadAll(fs.readFileSync(process.argv[1],'utf8'));const c=docs.find(x=>x?.kind==='ConfigMap'&&x.data?.['openclaw.json']);const j=JSON.parse(c.data['openclaw.json']);const d=docs.find(x=>x?.kind==='Deployment'&&x.metadata.name==='kubeclaw-'+process.argv[2]);const main=d.spec.template.spec.containers.find(x=>x.name==='kubeclaw'); console.log(JSON.stringify({model:j.agents.defaults.model,gatewayPort:j.gateway.port,env:Object.fromEntries(main.env.filter(x=>x.value!==undefined).map(x=>[x.name,x.value]))}));"
   result,q=record(f'DLV-C0-BCE3-OUTPUT-{role}-{name}',['node','-e',node,str(manifest.relative_to(repo)),role.lower()])
   if q['result']=='passed':
    actual=json.loads(result.stdout);q['fieldWitnesses']={'agent.model.primary':actual['model']['primary'],'agent.model.fallbacks':actual['model']['fallbacks'],'gateway.port':actual['gatewayPort'],'gateway.url':actual['env']['OPENCLAW_GATEWAY_URL'],'shutdown.drainFile':actual['env']['KUBECLAW_DRAIN_FILE'],'probes.dependencies.redisStream.maxLen':actual['env']['KUBECLAW_HEALTH_REDIS_STREAM_MAX_LEN']}
    q['result']='passed' if actual['model']['primary']==v['agent']['model']['primary'] and actual['gatewayPort']==v['gateway']['port'] and actual['env']['OPENCLAW_GATEWAY_URL']==v['gateway']['url'] and actual['env']['KUBECLAW_DRAIN_FILE']==v['shutdown']['drainFile'] else 'failed'
# Same current package bytes, not delivery/native install. Preserve raw helm output.
for chart in ['kubeclaw','prism']:record('DLV-C0-BCE3-PACKAGE-'+chart.upper(),['helm','package','charts/'+chart,'--destination',str(dest.relative_to(repo))])
for chart in ['kubeclaw','prism']:
 for f in sorted((repo/'charts'/chart).rglob('*')):
  if f.is_file():sources[str(f.relative_to(repo))]=digest(f)
for f in [pathlib.Path(__file__),out/'pinned-schema-aliases.json',out/'pinned-schema-aliases/customresourcedefinition-apiextensions-v1.json']:
 sources[str(f.relative_to(repo))]=digest(f)
for f in (out/'pinned-kubernetes-json-schema/c8f4e61c63bc529749125ac566bccc6986e08d45/v1.35.6-standalone-strict').glob('*.json'):sources[str(f.relative_to(repo))]=digest(f)
for f in dest.glob('*.tgz'):sources[str(f.relative_to(repo))]=digest(f)
output={'scope':'actual current local Helm/JSON/output/package/exact primary offline structural schema only; no deployed API/native image/tool/model/Secret/CNI/runtime effects','records':records,'sourceDigests':sources,'inputDefinitionWitnesses':witnesses,'tools':{'helm':subprocess.check_output(['helm','version','--short'],text=True).strip(),'kubeconform':subprocess.check_output(['kubeconform','-v'],text=True).strip(),'node':subprocess.check_output(['node','--version'],text=True).strip()},'resultCounts':{kind:sum(r['result']==kind for r in records) for kind in ['passed','failed']},'limit':'Prism Studio2 is actual permissive current definition, not concurrency/exclusivity approval. New model strings pass current generation/JSON shape, no model capability or native runtime acceptance. Existing historical29/132 observations unchanged.'};(out/'residual-chart-definitions-bce3f075.json').write_text(json.dumps(output,indent=2)+'\n');print(json.dumps(output['resultCounts']));sys.exit(any(r['result']=='failed' for r in records))
