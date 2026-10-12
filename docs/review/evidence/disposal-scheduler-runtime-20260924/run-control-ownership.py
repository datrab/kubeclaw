import pathlib,os,json,subprocess,shutil,time,importlib.util,re,hashlib
root=pathlib.Path.cwd(); here=root/'docs/review/evidence/independent-buster-runner-execution-child-20260921'; shared=root/'docs/review/evidence/independent-component-worker-listener-20260921'; author=root/'docs/review/evidence/config-buster-readiness-20260921/review-runner'
spec=importlib.util.spec_from_file_location('binding',shared/'bind.py'); b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
plan=json.loads((shared/'plan.json').read_text());plan['dependencyRoots'].append('/usr/local/lib/node_modules/npm');out=root/'docs/review/evidence/disposal-scheduler-runtime-20260924/run4';out.mkdir(exist_ok=False);(out/'trace').mkdir();node=shutil.which('node');native=root/plan['toolRoot']
protected=[]
for chart in ['prism','kubeclaw']:
 for p in (root/f'charts/{chart}/files/config').glob('*.json'):
  p=p.resolve();s=p.stat();protected.append({'path':str(p),'dev':str(s.st_dev),'ino':str(s.st_ino)})
b.write_json(out/'protected.json',protected)
env=dict(os.environ,LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',LC_GNU_FLOCK=str(native/'usr/bin/flock'),LC_TOOL_MAPPING_LOG=str(out/'tools.jsonl'),KUBECLAW_TEST_TAR=str(native/'bin/tar'),COMPONENT_REVIEW_TRACE_DIRECTORY=str(out/'trace'),COMPONENT_REVIEW_PROTECTED_SOURCES=str(out/'protected.json'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(out/'violations.jsonl'))
env['PATH']=str(root/'node_modules/.bin')+os.pathsep+env.get('PATH','')
assert not env.get('NODE_OPTIONS');env['NODE_OPTIONS']=f'--import={shared / "source-write-guard.mjs"} --import={shared / "runtime-trace.mjs"} --import={author / "tool-paths.mjs"}'
extra=[here/'run-fast.py',shared/'bind.py',shared/'runtime-trace.mjs',shared/'source-write-guard.mjs',author/'tool-paths.mjs',author/'tool-effects.mjs']+[pathlib.Path(shutil.which(t)).resolve() for t in plan['requiredTools']]
libs=[]
for exe in [node,str(native/'usr/bin/flock'),str(native/'bin/tar'),str(root/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox')]:
 r=subprocess.run(['ldd',exe],env=env,capture_output=True,text=True); text=r.stdout+r.stderr;libs.append({'executable':exe,'code':r.returncode,'output':text})
 for name in re.findall(r'/[^\s()]+',text):
  p=pathlib.Path(name)
  if p.is_file():extra.append(p.resolve())
b.write_json(out/'libraries.json',libs)
final=json.loads((root/'docs/review/evidence/buster-runner-quality-20260921/integration-result.json').read_text())['files'];final=[dict(r,sha256=hashlib.sha256((root/r['path']).read_bytes()).hexdigest()) for r in final if (root/r['path']).exists()]
b.write_json(out/'handoff-verified.json',final)
checks=[['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint-config.mjs','tests/verification/contracts/provider-disposal-recovery.test.mjs','tests/verification/contracts/provider-disposal-unconfirmed.test.mjs'],['npm','run','verify:buster:kubernetes-cleanup']]
commands=[('combined-runtime-'+str(i+1),[node if a=='node' else a for a in cmd]) for i,cmd in enumerate(checks)]
extra.append(pathlib.Path(__file__).resolve())
extra.extend([root/'docs/architecture/buster-runner-failure-drain.md',root/'docs/review/remediation/implementation/runner-scheduler-drain-20260921.md',root/'docs/review/remediation/implementation/provider-disposal-confirmation-20260921.md'])
compiler=root/'docs/review/evidence/native-aggregate-topology-20260921/compiler-bin/cc';extra.append(compiler);env['PATH']=str(compiler.parent)+os.pathsep+env['PATH']
compiler_details=subprocess.run([str(compiler),'-v'],env=env,capture_output=True,text=True);b.write_json(out/'compiler.json',{'path':str(compiler),'version':compiler_details.stdout+compiler_details.stderr})
extra.extend([root/'docs/architecture/buster-fixture-cleanup.md',root/'docs/architecture/buster-v2-runtime.md',root/'docs/review/remediation/implementation/kubernetes-cleanup-disposition-20260921.md',root/'skills/buster/plugins/kubernetes-fixture/README.md'])
before=b.capture(root,plan,extra);b.write_json(out/'before.json',before);results=[]
with (out/'source.patch').open('w') as f:subprocess.run(['git','diff','--binary','--',*plan['sourceRoots'],*plan['rootFiles']],stdout=f,check=True)
try:
 for name,cmd in commands:
  print('START '+name,flush=True);start=time.monotonic()
  with (out/(name+'.txt')).open('w') as log:
   try:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  results.append({'name':name,'command':cmd,'exitCode':code,'seconds':time.monotonic()-start});b.write_json(out/'results.json',results);print('END '+name+' '+str(code),flush=True)
  if code and (name.startswith('types-') or name=='canonical-lint'): break
finally:
 after=b.capture(root,plan,extra);b.write_json(out/'after.json',after);drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];b.write_json(out/'drift.json',drift);allowed=str(root/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');buildDelta={p:{'before':before.get(p),'after':after.get(p)} for p in drift if p==allowed};b.write_json(out/'sandbox-build-delta.json',buildDelta);drift=[p for p in drift if p!=allowed];b.write_json(out/'unexpected-drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
raise SystemExit(1 if drift or any(r['exitCode'] for r in results) else 0)
