from pathlib import Path
import subprocess,os,json
root=Path.cwd();out=Path(__file__).parent
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(root/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(root/'node_modules/.cache/native-host-tools/root/lib')
node=[str(root/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(root/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
commands=[('tests',node+['--test','--test-concurrency=1','tests/verification/reliability/worker-native-journal.test.mts','tests/verification/reliability/worker-native-journal-capacity.test.mts',str(out/'probes.mts')]),('mutant',node+['--import',str((out/'revert-admission.mjs').resolve()),'--test','--test-name-pattern=independent seven-way',str(out/'probes.mts')]),('types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json']),('lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/worker/core/worker/native-attempt-journal.ts','skills/worker/core/worker/native-journal-capacity.ts','skills/worker/core/worker/native-journal-state.ts','tests/verification/reliability/native-journal-capacity-fixture.mts','tests/verification/reliability/worker-native-journal-capacity.test.mts'])]
results=[]
for name,cmd in commands:
 with (out/(name+'.txt')).open('w') as f:r=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
 results.append({'name':name,'command':cmd,'exitCode':r.returncode});(out/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(name,r.returncode,flush=True)
