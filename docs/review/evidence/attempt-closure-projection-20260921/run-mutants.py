import json,os,subprocess,pathlib
root=pathlib.Path.cwd();evidence=root/'docs/review/evidence/attempt-closure-projection-20260921'
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(root/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(root/'node_modules/.cache/native-host-tools/root/lib')
base=[str(root/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(root/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--import',str(evidence/'mutation-hook.mjs'),'--test']
results=[]
for name,pattern in [('quota','closure projection frees actual'),('generation','read-only plan and actual CLI'),('saving','no byte saving')]:
 env['OBS_CLOSURE_MUTANT']=name
 with (evidence/('mutant-'+name+'.txt')).open('w') as log:
  result=subprocess.run(base+['--test-name-pattern',pattern,'tests/verification/reliability/attempt-closure-projection.test.mjs'],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
 results.append({'mutation':name,'exitCode':result.returncode})
(evidence/'mutants.json').write_text(json.dumps(results,indent=2)+'\n')
if any(item['exitCode']==0 for item in results):raise SystemExit('undetected mutant')
