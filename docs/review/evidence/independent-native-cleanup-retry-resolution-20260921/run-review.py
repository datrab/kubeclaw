from pathlib import Path
import subprocess,os,json,hashlib
root=Path.cwd(); out=root/'docs/review/evidence/independent-native-cleanup-retry-resolution-20260921';tool=root/'node_modules/.cache/native-host-tools/root'
env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
commands=[('original-and-author-tests',node+['--test','--test-concurrency=1','tests/verification/reliability/worker-native-cleanup.test.mts','tests/verification/reliability/worker-native-cleanup-retry.test.mts']),('independent-probes',node+['--test','--test-concurrency=1',str(out/'probes.mts')]),('effects-mutant',node+['--import',str(out/'mutant.mjs'),'--test','--test-concurrency=1','--test-name-pattern=fresh coherent retry',str(out/'probes.mts')])]
rows=[]
for name,command in commands:
 with (out/(name+'.txt')).open('w') as log:p=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=120)
 rows.append({'name':name,'command':command,'exitCode':p.returncode});(out/'commands.json').write_text(json.dumps(rows,indent=2)+'\n');print(name,p.returncode,flush=True)
 if name!='effects-mutant' and p.returncode:break
files=['skills/worker/core/worker/native-attempt-recovery.ts','skills/worker/core/worker/native-cleanup-reconciliation.ts','tests/verification/reliability/worker-native-cleanup.test.mts','tests/verification/reliability/worker-native-cleanup-retry.test.mts','tests/verification/reliability/native-cleanup-fixture.mts']
(out/'tested-identities.json').write_text(json.dumps([{'path':f,'sha256':hashlib.sha256(Path(f).read_bytes()).hexdigest()} for f in files],indent=2)+'\n')
