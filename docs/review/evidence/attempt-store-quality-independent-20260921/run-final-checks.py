import pathlib,os,json,subprocess,time
r=pathlib.Path.cwd(); out=r/'docs/review/evidence/attempt-store-quality-independent-20260921'; author=r/'docs/review/evidence/attempt-store-quality-20260921'; env=os.environ.copy(); env['LD_LIBRARY_PATH']=str(r/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(r/'node_modules/.cache/native-host-tools/root/lib')
base=[str(r/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(r/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--import',str(author/'mutation-hook.mjs'),'--test','--test-concurrency=1']
results=[]
for name,pattern in [('quota','closure projection frees actual'),('generation','read-only plan and actual CLI'),('saving','no byte saving')]:
 env['OBS_STORE_MUTANT']=name; cmd=base+['--test-name-pattern',pattern,'tests/verification/reliability/attempt-closure-projection.test.mjs']; start=time.monotonic()
 with (out/('mutant-'+name+'.txt')).open('w') as log: run=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
 results.append({'name':name,'command':cmd,'exitCode':run.returncode,'seconds':time.monotonic()-start}); print(name,run.returncode,flush=True)
 (out/'final-checks.json').write_text(json.dumps(results,indent=2)+'\n')
env.pop('OBS_STORE_MUTANT',None)
source=[str(p) for p in pathlib.Path('skills/common/plugin-runtime/foundation/observability').glob('attempt-*.ts') if p.stem in ['attempt-state','attempt-evidence','attempt-results','attempt-completeness','attempt-retirement']]+['skills/common/plugin-runtime/foundation/observability/durable-attempts.ts','tests/verification/reliability/attempt-store-input-ownership.test.mjs']
for name,cmd in [('foundation',['node_modules/.bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json']),('nova',['node_modules/.bin/tsc','--noEmit','-p','skills/nova/tsconfig.json']),('lint',['node_modules/.bin/eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs']+source),('preservation',['node',str(author/'check-preservation.mjs')])]:
 start=time.monotonic()
 with (out/(name+'.txt')).open('w') as log: run=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
 results.append({'name':name,'command':cmd,'exitCode':run.returncode,'seconds':time.monotonic()-start}); print(name,run.returncode,flush=True)
 (out/'final-checks.json').write_text(json.dumps(results,indent=2)+'\n')
