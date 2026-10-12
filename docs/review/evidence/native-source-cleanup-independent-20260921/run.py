import os,json,subprocess,hashlib
from pathlib import Path
root=Path.cwd();e=root/'docs/review/evidence/native-source-cleanup-independent-20260921';author=root/'docs/review/evidence/native-source-cleanup-reconciliation-20260921';manifest=json.loads((author/'core-source-identities.json').read_text())
for row in manifest:assert hashlib.sha256((root/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
(e/'reviewed-identities.json').write_text(json.dumps(manifest,indent=2)+'\n')
env={**os.environ,'LD_LIBRARY_PATH':str(root/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(root/'node_modules/.cache/native-host-tools/root/lib')}
node=[str(root/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(root/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
commands=[('originals',node+['--test','--test-concurrency=1','tests/verification/reliability/worker-native-journal.test.mts','tests/verification/reliability/worker-native-cleanup.test.mts'],0),('probes',node+['--test',str(e/'probes.mts')],0),('phase-mutant',node+['--import',str(e/'omit-disposed.mjs'),'--test','--test-name-pattern=abandoned',str(e/'probes.mts')],1),('archive-mutant',node+['--import',str(author/'omit-archive-check.mjs'),'--test','--test-name-pattern=bad-output|different-accounting','tests/verification/reliability/worker-native-cleanup.test.mts'],1),('types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json'],0),('lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/worker/core/worker/native-cleanup-reconciliation.ts','skills/worker/core/worker/native-attempt-recovery.ts','tests/verification/reliability/native-cleanup-fixture.mts','tests/verification/reliability/worker-native-cleanup.test.mts'],0)]
results=[]
for name,cmd,expected in commands:
 with (e/(name+'.txt')).open('w') as f:r=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=120)
 results.append({'name':name,'command':cmd,'exitCode':r.returncode,'expected':expected});(e/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(name,r.returncode,flush=True)
 if r.returncode!=expected:raise SystemExit(1)
for row in manifest:assert hashlib.sha256((root/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
(e/'source-stable.json').write_text(json.dumps({'allHashesUnchanged':True,'count':len(manifest)},indent=2)+'\n')
