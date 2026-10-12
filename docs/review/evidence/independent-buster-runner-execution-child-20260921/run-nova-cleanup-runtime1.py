import pathlib,os,json,subprocess,shutil,time,importlib.util,re,hashlib
root=pathlib.Path.cwd(); here=pathlib.Path(__file__).resolve().parent; shared=root/'docs/review/evidence/independent-component-worker-listener-20260921'; author=root/'docs/review/evidence/config-buster-readiness-20260921/review-runner'
spec=importlib.util.spec_from_file_location('binding',shared/'bind.py'); b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
plan=json.loads((shared/'plan.json').read_text());plan['dependencyRoots'].append('/usr/local/lib/node_modules/npm');out=here/'nova-cleanup-runtime1';out.mkdir(exist_ok=False);(out/'trace').mkdir();node=shutil.which('node');native=root/plan['toolRoot']
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
manifest=json.loads((root/'docs/review/evidence/nova-source-cleanup-errors-20260921/integration-result.json').read_text())
for row in manifest['files']:assert hashlib.sha256((root/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
b.write_json(out/'integration-verified.json',manifest)
commands=[('original-deadline-and-new-regressions',[node,'--test','--test-concurrency=1','tests/verification/reliability/nova-source-deadline.test.mts','tests/verification/reliability/nova-source-cleanup-errors.test.mjs'])]
extra.append(here/'run-nova-cleanup-runtime1.py')
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
 after=b.capture(root,plan,extra);b.write_json(out/'after.json',after);drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];b.write_json(out/'drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
raise SystemExit(1 if drift or any(r['exitCode'] for r in results) else 0)
