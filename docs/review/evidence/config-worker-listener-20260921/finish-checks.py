from pathlib import Path
import json,subprocess,hashlib,time
base=Path('docs/review/evidence/config-worker-listener-20260921');out=base/'checks3';out.mkdir(exist_ok=False)
paths=list(json.loads((base/'checks2/before.json').read_text()))
def capture():return {p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
before=capture();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n')
commands=[('foundation-types',['node_modules/.bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json']),('readiness-chart',['node','--test','skills/prism/tests/worker-readiness-chart.test.mts']),('mutants',['python3',str(base/'run-mutations.py')]),('lint',['node_modules/.bin/eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/prism/tests/worker-readiness-chart.test.mts','tests/verification/deployment/prism-swarm-config.test.mjs'])]
results=[]
for name,command in commands:
 start=time.time()
 with (out/(name+'.txt')).open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 results.append({'name':name,'command':command,'exitCode':r.returncode,'seconds':time.time()-start});print(name,r.returncode,flush=True)
after=capture();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n');drift=[p for p in paths if before[p]!=after[p]];(out/'result.json').write_text(json.dumps({'commands':results,'drift':drift},indent=2)+'\n');raise SystemExit(int(bool(drift) or any(r['exitCode'] for r in results)))
