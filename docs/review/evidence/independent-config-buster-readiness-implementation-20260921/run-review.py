import pathlib,os,json,subprocess,shutil,time,importlib.util,re,hashlib
root=pathlib.Path.cwd(); here=pathlib.Path(__file__).resolve().parent; shared=root/'docs/review/evidence/independent-component-worker-listener-20260921'; author=root/'docs/review/evidence/config-buster-readiness-20260921/review-runner'
spec=importlib.util.spec_from_file_location('binding',shared/'bind.py'); b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
plan=json.loads((shared/'plan.json').read_text());plan['dependencyRoots'].append('/usr/local/lib/node_modules/npm');out=here/'run1';out.mkdir(exist_ok=False);(out/'trace').mkdir();node=shutil.which('node');native=root/plan['toolRoot']
protected=[]
for chart in ['prism','kubeclaw']:
 for p in (root/f'charts/{chart}/files/config').glob('*.json'):
  p=p.resolve();s=p.stat();protected.append({'path':str(p),'dev':str(s.st_dev),'ino':str(s.st_ino)})
b.write_json(out/'protected.json',protected)
env=dict(os.environ,LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',LC_GNU_FLOCK=str(native/'usr/bin/flock'),LC_TOOL_MAPPING_LOG=str(out/'tools.jsonl'),KUBECLAW_TEST_TAR=str(native/'bin/tar'),COMPONENT_REVIEW_TRACE_DIRECTORY=str(out/'trace'),COMPONENT_REVIEW_PROTECTED_SOURCES=str(out/'protected.json'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(out/'violations.jsonl'))
assert not env.get('NODE_OPTIONS');env['NODE_OPTIONS']=f'--import={shared / "source-write-guard.mjs"} --import={shared / "runtime-trace.mjs"} --import={author / "tool-paths.mjs"}'
extra=[here/'run-review.py',shared/'bind.py',shared/'runtime-trace.mjs',shared/'source-write-guard.mjs',author/'tool-paths.mjs',author/'tool-effects.mjs']+[pathlib.Path(shutil.which(t)).resolve() for t in plan['requiredTools']]
libs=[]
for exe in [node,str(native/'usr/bin/flock'),str(native/'bin/tar'),str(root/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox')]:
 r=subprocess.run(['ldd',exe],env=env,capture_output=True,text=True); text=r.stdout+r.stderr;libs.append({'executable':exe,'code':r.returncode,'output':text})
 for name in re.findall(r'/[^\s()]+',text):
  p=pathlib.Path(name)
  if p.is_file():extra.append(p.resolve())
b.write_json(out/'libraries.json',libs)
final=json.loads((author.parent/'author-freeze-identities.json').read_text())['files'];assert all(hashlib.sha256((root/r['path']).read_bytes()).hexdigest()==r['sha256'] for r in final)
b.write_json(out/'handoff-verified.json',final)
commands=[('real-tools',[node,str(author/'tool-effects.mjs')]),('maintained-readiness',[shutil.which('npm'),'run','verify:buster:readiness-config']),('admission',[node,'--test','--test-concurrency=1','tests/verification/reliability/buster-admission-config.test.mts','tests/verification/reliability/buster-admission-cli.test.mjs','tests/verification/deployment/buster-admission-render.test.mjs']),('remote-runtime',[node,'tests/verification/contracts/check-pipeline-remote-plan-runtime.mts']),('remote-config',[node,'tests/verification/contracts/check-pipeline-remote-runtime-config.mts']),('production-replay',[node,'tests/verification/contracts/check-pipeline-worker-local-config.mts']),('real-provider',[node,'tests/verification/contracts/check-pipeline-remote-real-provider.mts']),('local-callers',[node,'--test','--test-concurrency=1','tests/verification/reliability/buster-shutdown-storage.test.mts','tests/verification/reliability/coverage-remote.test.mts','tests/verification/reliability/nova-dispatch-projection.test.mjs']),('deployment-truth',[node,'tests/verification/deployment/check-deployment-truth.mjs']),('packaging',[node,'--test','tests/verification/deployment/config-component-packaging.test.mjs'])]
for name,project in [('readiness-types','tests/verification/reliability/tsconfig.buster-readiness.json'),('foundation-types','skills/common/plugin-runtime/tsconfig.json'),('engine-types','skills/buster/engine/tsconfig.json')]:commands.append((name,[node,'node_modules/typescript/bin/tsc','--noEmit','-p',project]))
# Canonical scope matches actual frozen touched maintained sources, independently reviewed before execution.
lint=[r['path'] for r in final if pathlib.Path(r['path']).suffix in ['.ts','.mts','.mjs']]
commands.append(('canonical-lint',[node,'node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs',*lint]))
before=b.capture(root,plan,extra);b.write_json(out/'before.json',before);results=[]
with (out/'source.patch').open('w') as f:subprocess.run(['git','diff','--binary','--',*plan['sourceRoots'],*plan['rootFiles']],stdout=f,check=True)
try:
 for name,cmd in commands:
  print('START '+name,flush=True);start=time.monotonic()
  with (out/(name+'.txt')).open('w') as log:
   try:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  results.append({'name':name,'command':cmd,'exitCode':code,'seconds':time.monotonic()-start});b.write_json(out/'results.json',results);print('END '+name+' '+str(code),flush=True)
finally:
 after=b.capture(root,plan,extra);b.write_json(out/'after.json',after);drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];b.write_json(out/'drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
raise SystemExit(1 if drift or any(r['exitCode'] for r in results) else 0)
