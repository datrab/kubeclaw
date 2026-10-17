"""C0 current-source render/package observations; no test/production edits/effects."""
import pathlib,json,subprocess,hashlib,tarfile,collections
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];dest=out/'prism-chart-definition';dest.mkdir(exist_ok=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
def run(id,args,expect,diagnostic=None):
 p=subprocess.run(args,cwd=repo,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 (dest/(id+'.stdout')).write_text(p.stdout);(dest/(id+'.stderr')).write_text(p.stderr)
 okay=(p.returncode==0) if expect=='accept' else (p.returncode!=0 and diagnostic in p.stderr)
 r={'id':id,'command':args,'exit':p.returncode,'expectation':expect,'diagnostic':diagnostic,'result':'passed' if okay else 'failed','rawEvidencePaths':[str((dest/(id+'.stdout')).relative_to(repo)),str((dest/(id+'.stderr')).relative_to(repo))]};records.append(r);return p
# Exact synthetic chart profiles; no real credentials/host capacity/image pull claimed.
a={'images':{name:{'digest':'sha256:'+'a'*64} for name in ['control','studio','worker','ingestion']},'postgresql':{'existingSecret':'prism-postgresql-auth'},'worker':{'native':{'nodeName':'native-render-test','namespace':'default','policyDigest':'a'*64}}}
b=json.loads(json.dumps(a));b.update({'studio':{'replicas':2},'ingestion':{'enabled':True,'replicas':2,'quarantineTtlMs':120000,'resources':{'requests':{'cpu':'250m','memory':'256Mi'},'limits':{'cpu':'1','memory':'1Gi'}}},'backup':{'schedule':'0 1 * * *','verificationSchedule':'0 2 * * 0','databaseProofSchedule':'0 3 * * 0','maximumBytes':'42949672960','maximumRetainedBytes':'53687091200','maximumDurationSeconds':1800},'artifactStorage':{'storage':'200Gi','storageClass':'delivery-test'},'tailscale':{'enabled':False}})
for name in b['images']:b['images'][name]['digest']='sha256:'+'b'*64
for name,value in [('A',a),('B',b)]:
 f=dest/('profile-'+name+'.json');f.write_text(json.dumps(value,indent=2)+'\n');run('DLV-C0-PRISM-RENDER-'+name,['helm','template','prism','charts/prism','--namespace','default','-f',str(f.relative_to(repo))],'accept')
base=['helm','template','prism','charts/prism','--namespace','default','-f',str((dest/'profile-A.json').relative_to(repo))]
for id,arg,diagnostic in [('CONTROL-REPLICAS','control.replicas=2','control.replicas must be 1'),('WORKER-REPLICAS','worker.replicas=2','worker.replicas does not match: 1'),('NATIVE-NAMESPACE','worker.native.namespace=wrong','native Prism requires one worker'),('NATIVE-DIGEST','worker.native.policyDigest=bad',"worker.native.policyDigest: Does not match pattern"),('IMAGE-DIGEST','images.control.digest=bad',"images.control.digest: Does not match pattern"),('INGESTION-MISSING-SIZE','ingestion.enabled=true','ingestion.resources.requests.cpu:'),('WORKER-GRACE','worker.terminationGracePeriodSeconds=1','worker shutdown must cover native close')]:run('DLV-C0-PRISM-REJECT-'+id,base+['--set',arg],'reject',diagnostic)
# Schema first rejects before template/disabled-feature effects. Initial wrong
# diagnostic/no-schema expectations and all raw failures are archived verbatim.
for id,arg,diagnostic in [('UNKNOWN-KEY','deliveryUnknownField=true','Additional property deliveryUnknownField is not allowed'),('INGESTION-TTL-STRING','ingestion.quarantineTtlMs=bad','ingestion.quarantineTtlMs: Invalid type. Expected: integer, given: string')]:run('DLV-C0-PRISM-REJECT-'+id,base+['--set-string',arg],'reject',diagnostic)
# Fresh package artifact contains complete bytes; this doesn't prove .dockerignore/image closure.
p=run('DLV-C0-PRISM-PACKAGE',['helm','package','charts/prism','--destination',str(dest.relative_to(repo))],'accept')
archives=list(dest.glob('prism-*.tgz'));package=[]
if len(archives)==1:
 archive=archives[0]
 with tarfile.open(archive) as tf:
  for name in ['swarm.config.json','prism-control.config.json','prism-studio.config.json','prism-worker.config.json','prism-execution.config.json','buster-engine.config.json','worker-core.config.json','swarm.schema.json','swarm-components.schema.json']:
   member='prism/files/config/'+name;data=tf.extractfile(member).read();source=repo/'charts/prism/files/config'/name
   package.append({'member':member,'actualSha256':hashlib.sha256(data).hexdigest(),'sourcePath':str(source.relative_to(repo)),'sourceSha256':digest(source),'bytesEqual':data==source.read_bytes()})
 for r in records:
  if r['id']=='DLV-C0-PRISM-PACKAGE':r['result']='passed' if r['result']=='passed' and all(x['bytesEqual'] for x in package) else 'failed'
# Parse full manifests only with existing js-yaml, which does not execute their contents.
parser="import fs from 'node:fs';import yaml from 'js-yaml';let d=yaml.loadAll(fs.readFileSync(process.argv[1],'utf8')).filter(Boolean);console.log(JSON.stringify(d));"
def documents(name):return json.loads(subprocess.check_output(['node','--input-type=module','-e',parser,str(dest/('DLV-C0-PRISM-RENDER-'+name+'.stdout'))],cwd=repo,text=True))
try:
 docs={name:documents(name) for name in ['A','B']};witnesses={}
 for name,ds in docs.items():
  deployment={d['metadata']['name']:d for d in ds if d['kind']=='Deployment'};cron={d['metadata']['name']:d for d in ds if d['kind']=='CronJob'};pvc={d['metadata']['name']:d for d in ds if d['kind']=='PersistentVolumeClaim'}
  witnesses[name]={'studioReplicas':deployment['prism-studio']['spec']['replicas'],'controlImage':deployment['prism-control']['spec']['template']['spec']['containers'][0]['image'],'ingestionPresent':'prism-ingestion' in deployment,'cron':{n:{'schedule':d['spec']['schedule'],'activeDeadlineSeconds':d['spec']['jobTemplate']['spec']['activeDeadlineSeconds'],'env':d['spec']['jobTemplate']['spec']['template']['spec']['containers'][0]['env']} for n,d in cron.items()},'artifacts':pvc['prism-artifacts']['spec'],'tailscaleIngressPresent':any(d['kind']=='Ingress' for d in ds)}
  if 'prism-ingestion' in deployment:witnesses[name]['ingestion']={'replicas':deployment['prism-ingestion']['spec']['replicas'],'resources':deployment['prism-ingestion']['spec']['template']['spec']['containers'][0]['resources'],'env':deployment['prism-ingestion']['spec']['template']['spec']['containers'][0]['env']}
except Exception as e:witnesses={'parserFailure':str(e)}
files={str(f.relative_to(repo)):digest(f) for f in [repo/'charts/prism/values.yaml',repo/'charts/prism/values.schema.json',repo/'charts/prism/ci-values.yaml']+list((repo/'charts/prism/templates').glob('*'))+[repo/'charts/prism/files/prism-backup.sh',pathlib.Path(__file__)] if f.is_file()}
identity={'helm':subprocess.check_output(['helm','version','--short'],text=True).strip(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'jsYaml':subprocess.check_output(['node','-p',"require('js-yaml/package.json').version"],cwd=repo,text=True).strip()}
result={'scope':'actual C0 current Chart full-profile render/package/source-definition observation only; no Kubernetes admission/image pull/runtime/config migration acceptance','records':records,'tools':identity,'sourceAndCommandDigests':files,'profileDigests':{name:digest(dest/('profile-'+name+'.json')) for name in ['A','B']},'packageMembers':package,'packageSha256':digest(archives[0]) if len(archives)==1 else None,'fieldWitnesses':witnesses,'resultCounts':dict(collections.Counter(r['result'] for r in records)),'implementationCases':'all existing proposed DLV-CASE/DLV-GW-FIELD cases remain not-run; fresh review pending'}
(out/'prism-chart-definition.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['resultCounts']));print(json.dumps({'packageCompleteByteEquality':all(x['bytesEqual'] for x in package),'witnesses':witnesses},indent=2)[:1600])
