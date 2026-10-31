from pathlib import Path
import subprocess,json,hashlib,tempfile,os,shutil,datetime
R=Path('/home/node/.openclaw/workspace/kubeclaw-pr13-recovery');D=Path(__file__).parent;TMP=R.parent/'tmp';source='scripts/argocd-self-management.mjs';old=json.loads((R/'scripts/docs-api-argocd-checked-artifact-authority.json').read_text());assert json.loads((D/'ref003-argocd-check-prerequisite-verdict.json').read_text())['verdict']=='PASS_SOURCE_PREREQUISITE__CURRENT_WITNESS_REQUIRED';sha=lambda b:hashlib.sha256(b).hexdigest();env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','TZ':'UTC'};node=Path('/usr/local/bin/node').resolve(strict=True);facts=[];differences=[]
for f in old['observation']['inputsAndCheckedOutputs']:
 p=R/f['path'];assert p.is_file() and p.resolve()==p;actual=sha(p.read_bytes());facts.append({'path':f['path'],'sha256':actual});
 if actual!=f['sha256']:differences.append(f['path'])
assert differences==['package.json'];assert len(facts)==35;private=Path(tempfile.mkdtemp(prefix='argocd-current-readonly-',dir=TMP)).resolve();outside=Path(tempfile.mkdtemp(prefix='argocd-current-outside-',dir=TMP)).resolve();entry=private/source;controls=[];runs=[];started=datetime.datetime.now(datetime.timezone.utc).isoformat();P=D/'ref003-argocd-current-observer-execution.json';status={'status':'RUNNING','pid':os.getpid(),'startedAt':started,'privateRoot':str(private),'outsideProbeRoot':str(outside)};P.write_text(json.dumps(status,indent=2)+'\n');record=None
for f in facts:
 p=private/f['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((R/f['path']).read_bytes());assert sha(p.read_bytes())==f['sha256']
expected={f['path']:f['sha256'] for f in facts}
def treefacts():return {str(p.relative_to(private)):sha(p.read_bytes()) for p in private.rglob('*') if p.is_file()}
def verify():
 assert treefacts()==expected,'copied input/output/loader bytes or exact file roster changed'
 for f in old['absentPackageBoundaries']:assert not os.path.lexists(private/f),'new package boundary '+f
 for f in facts:
  p=private/f['path'];assert p.resolve()==p and p.is_file(),'noncanonical input '+f['path']
def safeenv(e):
 assert e==env and set(e)=={'PATH','LANG','TZ'},'ambient runtime/loader environment refused'
 return dict(e)
def native(args,cwd=private):
 run=subprocess.run([str(node),*args],cwd=cwd,env=safeenv(env),capture_output=True,text=True,timeout=90);runs.append({'argv':[str(node),*args],'cwd':str(cwd),'exit':run.returncode,'stdout':run.stdout,'stderr':run.stderr});return run
flags=['--permission','--allow-fs-read='+str(private)]
try:
 verify();version=native(['--version']);assert version.returncode==0;nativeNode={'path':str(node),'version':version.stdout.strip(),'sha256':sha(node.read_bytes())};assert nativeNode['version']=='v24.22.1'
 # Exact copied-byte/loader/source boundary refusals run before any producer.
 for relative in [source,'scripts/platform-services.mjs','versions.json','gitops/platform/bootstrap/argocd.yaml','package.json','node_modules/js-yaml/dist/js-yaml.mjs','node_modules/js-yaml/package.json']:
  p=private/relative;original=p.read_bytes()
  try:
   p.write_bytes(original+b'\n');rejected=False
   try:verify()
   except AssertionError:rejected=True
   assert rejected;controls.append({'name':'changed-byte-refused','path':relative,'pass':True,'producerExecuted':False})
  finally:p.write_bytes(original)
 verify();boundary=private/'scripts/package.json';boundary.write_text('{"type":"commonjs"}\n');rejected=False
 try:verify()
 except AssertionError:rejected=True
 finally:boundary.unlink()
 assert rejected;controls.append({'name':'changed-loader-package-boundary-refused','pass':True,'producerExecuted':False})
 for key in ['NODE_OPTIONS','NODE_PATH']:
  rejected=False
  try:safeenv({**env,key:'--import unreviewed-loader'})
  except AssertionError:rejected=True
  assert rejected;controls.append({'name':'ambient-loader-environment-refused','key':key,'pass':True,'producerExecuted':False})
 verify();outsideFile=outside/'owned-outside-probe.txt';outsideFile.write_text('owned finite outside-read control\n')
 probes=[('write-denied',"require('node:fs').writeFileSync(process.argv[1],'blocked')",str(private/'unpermitted-write')),('child-denied',"require('node:child_process').execFileSync(process.execPath,['-e','process.exit(0)'])",None),('worker-denied',"new (require('node:worker_threads').Worker)('0',{eval:true})",None),('outside-read-denied',"require('node:fs').readFileSync(process.argv[1],'utf8')",str(outsideFile))]
 for name,expression,argument in probes:
  code="try{"+expression+";process.exitCode=9;}catch(error){if(error.code!=='ERR_ACCESS_DENIED')throw error;console.log(error.code);process.exitCode=1;}";args=[*flags,'--input-type=commonjs','-e',code]+([argument]if argument else[]);r=native(args);assert r.returncode==1 and r.stdout.strip()=='ERR_ACCESS_DENIED',(name,r.returncode,r.stdout,r.stderr);controls.append({'name':name,'exit':r.returncode,'errorCode':'ERR_ACCESS_DENIED','pass':True,'argv':runs[-1]['argv'],'stdout':r.stdout,'stderr':r.stderr})
 verify();resolution=native([*flags,'--input-type=module','-e',"console.log(import.meta.resolve('js-yaml'))"],cwd=private/'scripts');assert resolution.returncode==0;expectedLoader=(private/'node_modules/js-yaml/dist/js-yaml.mjs').as_uri();assert resolution.stdout.strip()==expectedLoader;yamlVersion=json.loads((private/'node_modules/js-yaml/package.json').read_text())['version'];assert yamlVersion=='4.3.1'
 before=treefacts();argv=[*flags,str(entry),'--check'];original=native(argv);assert original.returncode==0,(original.returncode,original.stderr);assert treefacts()==before==expected
 # Existing output bytes are identical to the earlier separately preserved
 # parsed identities; the unchanged maintained receiver parses/checks them too.
 outputs=[]
 for out in old['observation']['outputs']:
  p=private/out['path'];assert sha(p.read_bytes())==out['outputSha256'];outputs.append(dict(out))
 assert len(outputs)==21
 for f in facts:assert sha((R/f['path']).read_bytes())==f['sha256'],'source checkout changed during observer'
 record={'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'sourceEffectReview':'ref003-argocd-check-prerequisite-verdict.json','node':nativeNode,'argv':argv,'environment':env,'loaderResolution':resolution.stdout.strip(),'loaderResolutionProbe':runs[-2],'jsYamlVersion':yamlVersion,'originalCheck':{'exit':original.returncode,'stdout':original.stdout,'stderr':original.stderr},'inputsAndCheckedOutputs':facts,'outputs':outputs,'controls':controls,'allCopiesByteIdentical':True,'allFilesUnchangedAfterCheck':True,'startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'limits':['Fresh isolated unchanged --check only, no generation/helper CLI/API apply/cluster/deployment.','Node permission mode denies writes/children/workers/outside reads; network absence is separately Source-reviewed closure property, not a claimed generic network sandbox.','Historical Node24.21 observation remains unchanged; this is separately named current Node24.22.1 evidence.','Output bytes/declared parsed API identities remain exact; maintained receiver reparsing is still required after actual witness qualification.'],'verificationScriptSha256':sha(Path(__file__).read_bytes())}
 status.update(status='PASS_CURRENT_BOUNDED_ORIGINAL_CHECK',nativeNode=nativeNode,declaredFiles=35,checkedOutputs=21)
except BaseException as error:
 status.update(status='FAILED_CURRENT_BOUNDED_ORIGINAL_CHECK',error=repr(error));raise
finally:
 # Every owned child above is synchronously terminal. Check actual open users
 # before deleting the two private trees; never touch unrelated temp/cache/WIP.
 users=[]
 for proc in Path('/proc').glob('[0-9]*'):
  try:
   for fd in (proc/'fd').iterdir():
    try:
     target=os.readlink(fd)
     if target.startswith(str(private)+'/')or target.startswith(str(outside)+'/'):users.append(str(fd))
    except OSError:pass
  except OSError:pass
 if not users:shutil.rmtree(private);shutil.rmtree(outside)
 status.update(privateTreesActiveUsers=users,privateTreesRemoved=not private.exists()and not outside.exists(),finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());P.write_text(json.dumps(status,indent=2)+'\n');(D/'ref003-argocd-current-observer-runs.json').write_text(json.dumps(runs,indent=2)+'\n')
 if record is not None:
  record['privateTreesRemoved']=status['privateTreesRemoved'];(D/'ref003-argocd-current-observation.json').write_text(json.dumps(record,indent=2)+'\n');candidate=json.loads(json.dumps(old));candidate['currentReadOnlyObservation20261031']=record;candidate['historicalObservationDisposition']='observation is unchanged historical Node24.21 evidence; currentReadOnlyObservation20261031 is the separately named fresh bounded check and requires independent qualification.';(D/'ref003-argocd-authority-candidate.json').write_text(json.dumps(candidate,indent=2)+'\n');(D/'ref003-argocd-authority-before-current.json').write_bytes((R/'scripts/docs-api-argocd-checked-artifact-authority.json').read_bytes())
