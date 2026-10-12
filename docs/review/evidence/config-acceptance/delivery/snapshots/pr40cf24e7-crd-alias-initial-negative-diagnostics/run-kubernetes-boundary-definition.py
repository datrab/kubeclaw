"""Actual C0 current Helm+selected local strict schema observations, not API/live proof."""
import pathlib,json,subprocess,hashlib,copy,collections,re
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];dest=out/'kubernetes-boundary-definition';dest.mkdir(exist_ok=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def resources(n):return {'requests':{'cpu':str(100*n)+'m','memory':str(128*n)+'Mi'},'limits':{'cpu':str(n),'memory':str(n)+'Gi'}}
def setfield(d,p,value):
 for k in p[:-1]:d=d.setdefault(k,{})
 d[p[-1]]=value
profiles={}
for chart in ['prism','ops-pod','kubeclaw','kubeclaw-buster']:
 for label,n in [('A',1),('B',2)]:
  if chart=='prism':
   d=json.load(open(out/'prism-chart-definition/profile-B.json'));d['tailscale']={'enabled':True};d['workerTrust']={'spiffe':{'enabled':True,'envoy':{'resources':resources(n)}}}
   for role in ['control','studio','worker','ingestion','backup','postgresql']:d.setdefault(role,{})['resources']=resources(n)
   d['imagePullSecrets']=[{'name':'delivery-pull-'+label.lower()}];d['secrets']={'runtime':'delivery-runtime-'+label.lower(),'database':'delivery-database-'+label.lower()};d['postgresql'].update({'existingSecret':'delivery-pg-'+label.lower(),'storage':str(n*100)+'Gi','storageClass':'delivery-storage-'+label.lower()});d['artifactStorage']={'storage':str(n*100)+'Gi','storageClass':'delivery-storage-'+label.lower()}
   d['backup'].update({'schedule':'0 '+str(n)+' * * *','verificationSchedule':'0 '+str(n+1)+' * * 0','databaseProofSchedule':'0 '+str(n+2)+' * * 0'})
   d['control']['productDecisions']={'enabled':True,'issuer':'delivery-human-'+label.lower(),'operators':['delivery-operator'],'origin':'https://delivery.example.test','authorityRevision':'delivery-authority-'+label.lower(),'signingSecretName':'delivery-signing-'+label.lower(),'signingSecretKey':'private-key.pem','controllerUrl':'https://delivery-controller.example.test:8443','controllerNamespace':'default','controllerRelease':'delivery-controller','controllerCaSecretName':'delivery-ca-'+label.lower(),'controllerCaSecretKey':'ca.crt','tokenAudience':'delivery-ready','tokenExpirationSeconds':600*n}
  elif chart=='ops-pod':
   d={'codexImage':'ghcr.io/datrab/kubeclaw-ops-codex@sha256:'+label.lower()*64,'mcpImage':'ghcr.io/datrab/kubeclaw-ops-mcp@sha256:'+label.lower()*64,'imagePullSecrets':[{'name':'delivery-pull-'+label.lower()}],'bearerSecret':'delivery-bearer-'+label.lower(),'githubSecret':'delivery-github-'+label.lower(),'defaultNamespace':'default','argoNamespace':'argocd','rbac':{'namespaces':['default','argocd'],'execNamespaces':['default']},'networkPolicy':{'apiServerCIDRs':['192.0.2.10/32'],'apiServerPort':6443},'persistence':{'size':str(n*20)+'Gi','storageClass':'delivery-storage-'+label.lower()},'resources':{'codex':resources(n),'mcp':resources(n)},'tailscale':{'enabled':True,'authSecret':'delivery-tailnet-'+label.lower(),'resources':resources(n)}}
  else:
   d={'image':{'digest':'sha256:'+label.lower()*64},'imagePullSecrets':[{'name':'delivery-pull-'+label.lower()}],'auth':{'existingSecret':'delivery-auth-'+label.lower(),'existingSecretKey':'gateway-token'},'litellm':{'existingSecret':'delivery-litellm-'+label.lower(),'existingSecretKey':'api-key'},'discord':{'enabled':True,'existingSecret':'delivery-discord-'+label.lower(),'existingSecretKey':'discord-token'},'agent':{'git':{'enabled':False}},'gateway':{'startupDoctor':{'resources':resources(n)}},'initSetup':{'resources':resources(n)},'resources':resources(n),'workerTrust':{'spiffe':{'enabled':True,'envoy':{'resources':resources(n)}}},'persistence':{'config':{'enabled':True,'size':str(n*10)+'Gi','storageClass':'delivery-storage-'+label.lower(),'accessModes':['ReadWriteOnce']},'workspace':{'enabled':True,'size':str(n*20)+'Gi','storageClass':'delivery-storage-'+label.lower(),'accessModes':['ReadWriteOnce']}}}
   d['serviceAccount']={'create':True}
   if chart=='kubeclaw-buster':
    d['gateway']['resources']=resources(n);d['gateway']['resources']['requests']['ephemeral-storage']=str(n)+'Gi';d['gateway']['resources']['limits']['ephemeral-storage']=str(2*n)+'Gi'
    d.update({'agentRole':'buster','busterNative':{'nodeName':'delivery-node','namespace':'default','policyDigest':label.lower()*64},'busterNamespaceBroker':{'enabled':True,'controller':{'resources':resources(n)}},'extraContainers':[{'name':'buster-v2-runtime','image':'ghcr.io/datrab/kubeclaw-buster-runtime@sha256:'+label.lower()*64,'resources':resources(n)}],'runtimeInfrastructure':{'registry':{'endpoint':'https://registry.example.test','transport':'https','authSecretName':'delivery-registry-'+label.lower()}}})
  profiles[(chart,label)]=d
records=[]
def run(id,args,expected=0,diagnostic=None):
 p=subprocess.run(args,cwd=repo,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 (dest/(id+'.stdout')).write_text(p.stdout);(dest/(id+'.stderr')).write_text(p.stderr)
 okay=p.returncode==expected and (diagnostic is None or diagnostic in p.stderr+p.stdout)
 r={'id':id,'command':args,'exit':p.returncode,'expectedExit':expected,'expectedDiagnostic':diagnostic,'result':'passed' if okay else 'failed','rawEvidencePaths':[str((dest/(id+'.stdout')).relative_to(repo)),str((dest/(id+'.stderr')).relative_to(repo))]};records.append(r);return p
schemaAcq=json.load(open(out/'kubernetes-source-acquisitions.json'));schemaRecord=next(r for r in schemaAcq['records'] if r.get('repository')=='yannh/kubernetes-json-schema' and r['result']=='acquired');directory=(repo/schemaRecord['localPath']).parent
witnesses={}
parse="import fs from 'node:fs';import yaml from 'js-yaml';console.log(JSON.stringify(yaml.loadAll(fs.readFileSync(process.argv[1],'utf8')).filter(Boolean)));"
for (chart,label),profile in profiles.items():
 f=dest/('profile-'+chart+'-'+label+'.json');f.write_text(json.dumps(profile,indent=2)+'\n');id='DLV-C0-BOUNDARY-RENDER-'+chart.upper()+'-'+label
 p=run(id,['helm','template','delivery-'+chart,'charts/'+chart.replace('-buster',''),'--namespace','default','-f',str(f.relative_to(repo))])
 if p.returncode:continue
 manifest=dest/(id+'.yaml');manifest.write_text(p.stdout)
 schemaArgs=['kubeconform','-strict','-summary','-kubernetes-version','1.35.6','-schema-location',str(directory/'{{.ResourceKind}}{{.KindSuffix}}.json')]
 if (out/'pinned-schema-aliases.json').exists():schemaArgs+=['-schema-location',str(out/'pinned-schema-aliases/{{.ResourceKind}}{{.KindSuffix}}.json')]
 schemaResult=run('DLV-C0-BOUNDARY-SCHEMA-'+chart.upper()+'-'+label,schemaArgs+[str(manifest.relative_to(repo))])
 summary=re.search(r'Summary: (\d+) resources? found in (\d+) files? - Valid: (\d+), Invalid: (\d+), Errors: (\d+), Skipped: (\d+)',schemaResult.stdout)
 records[-1]['collection']=list(map(int,summary.groups())) if summary else None
 if not summary or int(summary[1])==0 or int(summary[1])!=int(summary[3]) or any(int(summary[i]) for i in [4,5,6]):records[-1]['result']='failed';records[-1]['reason']='nonempty complete collection, all-valid and zero invalid/errors/skips required; exit0 alone cannot pass'
 ds=json.loads(subprocess.check_output(['node','--input-type=module','-e',parse,str(manifest)],cwd=repo,text=True));w=[]
 for doc in ds:
  kind=doc['kind'];name=doc['metadata']['name'];spec=doc.get('spec',{})
  pod=spec.get('template',{}).get('spec')
  if kind=='CronJob':pod=spec['jobTemplate']['spec']['template']['spec'];w.append({'kind':kind,'name':name,'schedule':spec['schedule'],'jobDeadline':spec['jobTemplate']['spec'].get('activeDeadlineSeconds'),'timeZone':spec.get('timeZone','absent')})
  if pod:w.append({'kind':kind,'name':name,'containerResources':{c['name']:c.get('resources') for c in pod.get('containers',[])+pod.get('initContainers',[])},'imagePullSecrets':pod.get('imagePullSecrets'),'envSecretRefs':{c['name']:[{'env':e['name'],'ref':e['valueFrom']['secretKeyRef']} for e in c.get('env',[]) if 'secretKeyRef' in e.get('valueFrom',{})] for c in pod.get('containers',[])+pod.get('initContainers',[])},'secretVolumes':[vol for vol in pod.get('volumes',[]) if 'secret' in vol or 'projected' in vol],'volumes':pod.get('volumes'),'volumeClaimTemplates':spec.get('volumeClaimTemplates')})
  if kind=='PersistentVolumeClaim':w.append({'kind':kind,'name':name,'spec':spec})
  witnesses[chart+'-'+label]=w
# Exact per-field current resource projection comparisons. Different owner and
# conditional container paths are enumerated; API/runtime effects remain absent.
resourceComparisons=[]
fragment=json.loads((out/'inventory-fragment.json').read_text())
for row in fragment['rows']:
 if 'DLV-CASE-KUBERNETES-RESOURCE-ENVELOPES' not in row['caseIds']:continue
 field=row['source']['field'];owner=row['owner'];prefix=field.rsplit('.resources.',1)[0] if '.resources.' in field else 'resources';side,unit=field.split('.')[-2:]
 if owner=='chart-prism':chart='prism';containers=['worker-trust-proxy'] if prefix=='workerTrust.spiffe.envoy' else ['proof','verify','restore-proof'] if prefix=='backup' else [prefix]
 elif owner=='chart-ops-pod':chart='ops-pod';prefix='resources.'+field.split('.')[1] if field.startswith('resources.') else prefix;containers=[('ops-mcp' if field.split('.')[1]=='mcp' else field.split('.')[1])] if field.startswith('resources.') else ['tailscale']
 else:
  chart='kubeclaw-buster' if prefix in ['busterNamespaceBroker.controller','gateway'] else 'kubeclaw';containers={'gateway.startupDoctor':['openclaw-state-migration'],'initSetup':['init-setup'],'resources':['kubeclaw'],'gateway':['kubeclaw'],'workerTrust.spiffe.envoy':['worker-trust-proxy'],'busterNamespaceBroker.controller':['controller']}[prefix]
 for label in ['A','B']:
  actual=[d['containerResources'][name].get(side,{}).get(unit) for d in witnesses.get(chart+'-'+label,[]) for name in containers if name in d.get('containerResources',{})]
  p=profiles[(chart,label)]
  if prefix=='resources':expected=p['resources'][side][unit]
  elif prefix.startswith('resources.'):expected=p['resources'][prefix.split('.')[1]][side][unit]
  else:
   for key in prefix.split('.'):p=p[key]
   expected=p['resources'][side][unit]
  resourceComparisons.append({'settingId':row['id'],'profile':chart+'-'+label,'containers':containers,'expected':expected,'actual':actual,'result':'passed' if actual and all(value==expected for value in actual) else 'failed'})
comparisonPath=dest/'resource-projection-comparisons.json';comparisonPath.write_text(json.dumps(resourceComparisons,indent=2)+'\n')
if resourceComparisons:records.append({'id':'DLV-C0-BOUNDARY-RESOURCE-PROJECTION-COMPARISONS','command':['python3',str(pathlib.Path(__file__).relative_to(repo))],'exit':0,'expectedExit':0,'expectedDiagnostic':None,'result':'passed' if all(r['result']=='passed' for r in resourceComparisons) else 'failed','rawEvidencePaths':[str(comparisonPath.relative_to(repo))],'reason':'exact enumerated current field/container A/B values, not API or scheduler/CRI effects'})
# Ref-only alias must retain the exact strict primary definition's required/type
# and unknown-property behavior, not merely permit a complete CRD document.
if (out/'pinned-schema-aliases.json').exists():
 buster=dest/'DLV-C0-BOUNDARY-RENDER-KUBECLAW-BUSTER-A.yaml'
 if buster.exists():
  documents=json.loads(subprocess.check_output(['node','--input-type=module','-e',parse,str(buster)],cwd=repo,text=True));crd=next(d for d in documents if d['kind']=='CustomResourceDefinition')
  for name in ['UNKNOWN','WRONG-TYPE','MISSING-SPEC']:
   bad=copy.deepcopy(crd)
   if name=='UNKNOWN':bad['deliveryUnexpectedField']=True;diagnostic='deliveryUnexpectedField'
   elif name=='WRONG-TYPE':bad['spec']['group']=42;diagnostic='spec.group'
   else:del bad['spec'];diagnostic='spec'
   fixture=dest/('crd-alias-negative-'+name+'.yaml');fixture.write_text(json.dumps(bad,indent=2)+'\n')
   p=run('DLV-C0-PINNED-CRD-ALIAS-'+name,schemaArgs+[str(fixture.relative_to(repo))],1,diagnostic)
   summary=re.search(r'Summary: (\d+) resources? found in (\d+) files? - Valid: (\d+), Invalid: (\d+), Errors: (\d+), Skipped: (\d+)',p.stdout)
   records[-1]['collection']=list(map(int,summary.groups())) if summary else None
   if not summary or list(map(int,summary.groups())) != [1,1,0,1,0,0]:records[-1]['result']='failed';records[-1]['reason']='negative must collect one CRD and reject via intended canonical schema, not setup/error/skip'
# Exact current Chart versus API/source-only negatives. No kube-apiserver effects.
base=lambda chart,label='A':['helm','template','delivery-'+chart,'charts/'+chart,'--namespace','default','-f',str((dest/('profile-'+chart+'-'+label+'.json')).relative_to(repo))]
for id,chart,args,exit,diag in [('PRISM-NEGATIVE-INGESTION-QUANTITY','prism',['--set-string','ingestion.resources.requests.cpu=bad'],1,'ingestion.resources.requests.cpu'),('PRISM-NEGATIVE-TOKEN-EXPIRY','prism',['--set','control.productDecisions.tokenExpirationSeconds=599'],1,'control.productDecisions.tokenExpirationSeconds'),('OPS-MALFORMED-QUANTITY-PERMITTED','ops-pod',['--set-string','resources.codex.requests.cpu=bad'],0,None),('OPS-REQUEST-EXCEEDS-LIMIT-PERMITTED','ops-pod',['--set-string','resources.codex.requests.cpu=2'],0,None),('PRISM-BAD-CRON-PERMITTED','prism',['--set-string','backup.schedule=not-a-cron'],0,None),('OPS-MISSING-SECRET-REFERENCE-PERMITTED','ops-pod',['--set-string','githubSecret=delivery-nonexistent-secret'],0,None),('OPS-PULL-EMPTY-NAME-PERMITTED','ops-pod',['--set-string','imagePullSecrets[0].name='],0,None),('OPS-NEGATIVE-PVC-SIZE-PERMITTED','ops-pod',['--set-string','persistence.size=-1Gi'],0,None)]:run('DLV-C0-BOUNDARY-'+id,base(chart)+args,exit,diag)
# Persist source/test/tool/config identity for every observation; no hidden schema network.
sourcefiles=[repo/'charts'/chart/'values.yaml' for chart in ['prism','ops-pod','kubeclaw']]+list((repo/'charts/prism/templates').glob('*'))+list((repo/'charts/ops-pod/templates').glob('*'))+list((repo/'charts/kubeclaw/templates').glob('*'))+[repo/'charts/prism/values.schema.json',pathlib.Path(__file__)]
sourcefiles += [repo/r['localPath'] for r in schemaAcq['records'] if r['result']=='acquired']
sourcefiles += list((out/'pinned-schema-aliases').glob('*.json')) if (out/'pinned-schema-aliases').exists() else []
v={'scope':'actual local current Helm and exact selected Nova offline schema boundary only; NOT Go API validator execution, deployed Kubernetes, runtime admission/resources/Secrets/cron acceptance','records':records,'resourceProjectionComparisons':resourceComparisons,'tools':{'helm':subprocess.check_output(['helm','version','--short'],text=True).strip(),'kubeconform':subprocess.check_output(['kubeconform','-v'],text=True).strip(),'node':subprocess.check_output(['node','--version'],text=True).strip()},'sourceAndCommandDigests':{str(p.relative_to(repo)):digest(p) for p in sourcefiles if p.is_file()},'profileDigests':{f.name:digest(f) for f in dest.glob('profile-*.json')},'fieldWitnesses':witnesses,'resultCounts':dict(collections.Counter(r['result'] for r in records)),'implementationCases':'remain not-run; live selected apiserver/version/feature gates/Secret revisions/CSI/node admission prerequisites pending; no credential values generated or logged'}
(out/'kubernetes-boundary-definition.json').write_text(json.dumps(v,indent=2)+'\n');print(json.dumps(v['resultCounts']));print(json.dumps([r for r in records if r['result']!='passed'],indent=2)[:2200])
