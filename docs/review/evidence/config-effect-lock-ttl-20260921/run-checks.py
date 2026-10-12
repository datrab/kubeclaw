from pathlib import Path
import hashlib,json,os,subprocess,time
root=Path.cwd();out=root/'docs/review/evidence/config-effect-lock-ttl-20260921';tool=root/'node_modules/.cache/native-host-tools/root'
env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
files=[r['path'] for r in json.loads((out/'inventory-before.json').read_text())['rows']]
files+=['package.json','tests/verification/reliability/effect-lock-configuration.test.mjs','skills/nova/core/effects/README.md','skills/common/plugin-runtime/foundation/config/README.md',str(Path(__file__).relative_to(root)),str((out/'restore-fallback.mjs').relative_to(root))]
def identities():return [{'path':f,'sha256':hashlib.sha256((root/f).read_bytes()).hexdigest()} for f in sorted(set(files))]
run=out/'checks1';run.mkdir()
before=identities();(run/'before.json').write_text(json.dumps(before,indent=2)+'\n')
commands=[('nova-types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','skills/nova/tsconfig.json']),('foundation-types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json']),('ttl-and-original-locks',node+['--test','--test-concurrency=1','tests/verification/reliability/effect-lock-configuration.test.mjs','tests/verification/reliability/effect-lock-lifetime.test.mts','tests/verification/reliability/forge-lock-wait.test.mts']),('original-platform',node+['tests/verification/contracts/check-plugin-system-v2-platform-config.mjs']),('original-capability',node+['tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs']),('original-phase7',node+['tests/verification/contracts/check-plugin-system-v2-phase7.mjs']),('lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/nova/core/effects/coordinator.ts','skills/nova/core/execution/engine-runtime.ts','skills/common/plugin-runtime/foundation/config/platform.ts','tests/verification/reliability/effect-lock-configuration.test.mjs'])]
results=[]
try:
 for name,command in commands:
  start=time.monotonic()
  with (run/(name+'.txt')).open('xb') as log:p=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  results.append({'name':name,'command':command,'exitCode':p.returncode,'seconds':time.monotonic()-start});(run/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(name,p.returncode,flush=True)
 for mode in ['runtime','constructor']:
  command=node+['--import',str(out/'restore-fallback.mjs'),'--test','--test-name-pattern=missing and invalid TTL','tests/verification/reliability/effect-lock-configuration.test.mjs']
  logfile=run/('mutant-'+mode+'.txt')
  with logfile.open('xb') as log:p=subprocess.run(command,env=dict(env,EFFECT_TTL_MUTANT=mode),stdout=log,stderr=subprocess.STDOUT,timeout=90)
  text=logfile.read_text();detected=p.returncode==1 and 'EFFECT_TTL_FALLBACK_RESTORED:'+mode in text and 'Missing expected exception' in text
  results.append({'name':'mutant-'+mode,'command':command,'exitCode':p.returncode,'detected':detected});(run/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(mode,detected,flush=True)
finally:
 after=identities();(run/'after.json').write_text(json.dumps(after,indent=2)+'\n');drift=[a['path'] for a,b in zip(before,after) if a!=b];(run/'drift.json').write_text(json.dumps(drift)+'\n');print('drift',drift,flush=True)
raise SystemExit(0 if not drift and all(r.get('detected',r['exitCode']==0) for r in results) else 1)
