import pathlib,os,json,subprocess
r=pathlib.Path.cwd();out=r/'docs/review/evidence/attempt-store-quality-20260921';env=os.environ.copy();env['LD_LIBRARY_PATH']=str(r/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(r/'node_modules/.cache/native-host-tools/root/lib')
base=[str(r/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(r/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--import',str(out/'mutation-hook.mjs'),'--test','--test-concurrency=1']
results=[]
for name,pattern in [('quota','closure projection frees actual'),('generation','read-only plan and actual CLI'),('saving','no byte saving')]:
 env['OBS_STORE_MUTANT']=name
 with (out/('mutant-'+name+'.txt')).open('w') as log:
  run=subprocess.run(base+['--test-name-pattern',pattern,'tests/verification/reliability/attempt-closure-projection.test.mjs'],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
 results.append({'mutation':name,'exitCode':run.returncode})
(out/'mutants.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(x['exitCode']!=0 for x in results)
