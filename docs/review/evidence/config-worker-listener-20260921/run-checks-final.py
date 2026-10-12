from pathlib import Path
import json,subprocess,hashlib,time
base=Path('docs/review/evidence/config-worker-listener-20260921');out=base/'checks2';out.mkdir(exist_ok=False)
paths=[r['physicalAuthor'] for r in json.loads((base/'integration-result.json').read_text())['files']]
paths+=['skills/prism/server/worker.ts','tests/fixtures/config/swarm-bundle.mjs','scripts/check-built-runtime-image.sh','skills/prism/tsconfig.json','package.json','skills/prism/tests/worker-readiness-chart.test.mts']
def capture():return {p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in sorted(set(paths))}
before=capture();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n')
modules=['skills/prism/tests/'+n+'.test.mts' for n in ['worker-listener-config','swarm-worker-config','control-image-environment','control-listener','swarm-worker-behavior','worker-readiness-chart']]+['tests/verification/deployment/prism-swarm-config.test.mjs']
commands=[('tests',['node','--test','--test-concurrency=1',*modules]),('types',['node_modules/.bin/tsc','--noEmit','-p','skills/prism/tsconfig.json']),('lint',['node_modules/.bin/eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs',*[p for p in sorted(set(paths)) if p.endswith(('.ts','.mts','.mjs'))]])]
results=[]
for name,command in commands:
 start=time.time()
 with (out/(name+'.txt')).open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 results.append({'name':name,'command':command,'exitCode':r.returncode,'seconds':time.time()-start});print(name,r.returncode,flush=True)
after=capture();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n');drift=[p for p in before if before[p]!=after[p]];(out/'result.json').write_text(json.dumps({'commands':results,'drift':drift},indent=2)+'\n');raise SystemExit(int(bool(drift) or any(r['exitCode'] for r in results)))
