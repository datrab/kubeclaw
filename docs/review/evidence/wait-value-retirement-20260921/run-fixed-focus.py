from pathlib import Path
import os,subprocess,json,hashlib
r=Path.cwd();o=r/'docs/review/evidence/wait-value-retirement-20260921';t=r/'node_modules/.cache/native-host-tools/root'
c=[str(t/'usr/bin/proot'),'-b',str(t/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--test','--test-concurrency=1','--test-name-pattern=Core exposes retained|wrong source/receipt identities|existing operator projection receipt','tests/verification/reliability/wait-resolver-audience.test.mjs','tests/verification/reliability/wait-value-projection.test.mjs']
files=['scripts/retire-wait-value.mjs','skills/common/plugins/operator-messaging/src/delivery-projection.ts','tests/verification/reliability/wait-value-projection.test.mjs','tests/verification/reliability/wait-resolver-audience.test.mjs']
identities=[{'path':f,'sha256':hashlib.sha256((r/f).read_bytes()).hexdigest()} for f in files]
with (o/'wp5-fixed-focus.txt').open('w') as f:p=subprocess.run(c,env=dict(os.environ,LD_LIBRARY_PATH=str(t/'usr/lib')+':'+str(t/'lib')),stdout=f,stderr=subprocess.STDOUT,timeout=180)
changed=[f['path'] for f in identities if hashlib.sha256((r/f['path']).read_bytes()).hexdigest()!=f['sha256']]
(o/'wp5-fixed-focus.json').write_text(json.dumps({'command':c,'exitCode':p.returncode,'sources':identities,'sourceDrift':changed},indent=2)+'\n');print(p.returncode);raise SystemExit(1 if p.returncode or changed else 0)
