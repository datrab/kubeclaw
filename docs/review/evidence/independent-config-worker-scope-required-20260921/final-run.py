import pathlib,hashlib,json,subprocess,os
r=pathlib.Path.cwd();e=r/'docs/review/evidence/independent-config-worker-scope-required-20260921'
paths=set(json.loads((e/'before.json').read_text()))
paths.update(str(pathlib.Path(p).relative_to(r)) for p in json.loads((e/'loaded-runtime.json').read_text()))
for folder in ['contracts/pipeline-worker-core','node_modules/ajv','node_modules/ajv-formats']:
 paths.update(str(p.relative_to(r)) for p in (r/folder).rglob('*') if p.is_file())
paths.update(['docs/review/evidence/config-worker-scope-required-20260921/mutate.mjs','docs/review/evidence/independent-config-worker-scope-required-20260921/probe.mjs'])
def snap():return {p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in sorted(paths)}
b=snap();(e/'final-before.json').write_text(json.dumps(b,indent=2)+'\n')
tools=r/'node_modules/.cache/native-host-tools/root';env=dict(os.environ,LD_LIBRARY_PATH=f'{tools}/usr/lib:{tools}/lib');base=[str(tools/'usr/bin/proot'),'-b',f'{tools}/usr/bin/flock:/usr/bin/flock!','/usr/local/bin/node']
jobs=[('ownership',base+['--test','tests/verification/reliability/worker-ownership-store.test.mts']),('quiescence',base+['--test','tests/verification/reliability/worker-native-quiescence.test.mts']),('probe',['node',str(e/'probe.mjs')]),('native-types',['node_modules/.bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json'])]
results=[]
for name,cmd in jobs:
 with (e/f'final-{name}.txt').open('w') as f:p=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,env=env)
 results.append({'name':name,'command':cmd,'exitCode':p.returncode});print(name,p.returncode,flush=True)
(e/'final-results.json').write_text(json.dumps(results,indent=2)+'\n');a=snap();(e/'final-after.json').write_text(json.dumps(a,indent=2)+'\n');(e/'final-drift.json').write_text(json.dumps([p for p in b if b[p]!=a[p]],indent=2)+'\n')
