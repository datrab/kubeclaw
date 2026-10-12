import pathlib, subprocess, json, hashlib, os, time
root=pathlib.Path.cwd(); out=root/'docs/review/evidence/independent-config-worker-scope-required-20260921'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def snap():
 paths=set()
 for folder in ['skills/worker/core','skills/foundation','tests/verification/reliability','tests/fixtures','charts/kubeclaw/files/config']:
  paths.update(p for p in (root/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts)
 for name in ['package.json','package-lock.json','tsconfig.base.json','skills/prism/config/native-worker.ts','skills/buster/engine/test-gates/preparation-supervisor.ts']:
  paths.add(root/name)
 return {str(p.relative_to(root)):digest(p) for p in sorted(paths)}
before=snap(); (out/'before.json').write_text(json.dumps(before,indent=2)+'\n')
tools=root/'node_modules/.cache/native-host-tools/root'; env=dict(os.environ,LD_LIBRARY_PATH=f'{tools}/usr/lib:{tools}/lib')
base=[str(tools/'usr/bin/proot'),'-b',f'{tools}/usr/bin/flock:/usr/bin/flock!','/usr/local/bin/node']
jobs=[('ownership',base+['--test','tests/verification/reliability/worker-ownership-store.test.mts']),('quiescence',base+['--test','tests/verification/reliability/worker-native-quiescence.test.mts']),('probe',['node',str(out/'probe.mjs')]),('mutant',base+['--import',str(root/'docs/review/evidence/config-worker-scope-required-20260921/mutate.mjs'),'--test','--test-name-pattern=requires explicit valid scope capacity','tests/verification/reliability/worker-ownership-store.test.mts']),('worker-types',['node_modules/.bin/tsc','--noEmit','-p','skills/worker/core/tsconfig.json']),('native-types',['node_modules/.bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json']),('lint',['node_modules/.bin/eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/worker/core/worker/native-worker-ownership.ts','tests/verification/reliability/worker-ownership-store.test.mts','tests/verification/reliability/worker-native-quiescence.test.mts','tests/verification/reliability/worker-native-scope-live.mts','tests/verification/reliability/worker-native-topology-live.mts'])]
results=[]
for name,command in jobs:
 with (out/f'{name}.txt').open('w') as f: p=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,env=env)
 results.append(dict(name=name,command=command,exitCode=p.returncode)); (out/'results.json').write_text(json.dumps(results,indent=2)+'\n'); print(name,p.returncode,flush=True)
after=snap(); (out/'after.json').write_text(json.dumps(after,indent=2)+'\n'); (out/'drift.json').write_text(json.dumps([p for p in before.keys()|after.keys() if before.get(p)!=after.get(p)],indent=2)+'\n')
