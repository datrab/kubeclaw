from pathlib import Path
import subprocess,os,json
root=Path.cwd();out=root/'docs/review/evidence/native-journal-terminal-capacity-20260921'
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(root/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(root/'node_modules/.cache/native-host-tools/root/lib')
node=[str(root/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(root/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
files=['skills/worker/core/worker/native-attempt-journal.ts','skills/worker/core/worker/native-journal-capacity.ts','skills/worker/core/worker/native-journal-state.ts','tests/verification/reliability/native-journal-capacity-fixture.mts','tests/verification/reliability/worker-native-journal-capacity.test.mts']
tests=['tests/verification/reliability/worker-native-journal.test.mts','tests/verification/reliability/worker-native-journal-capacity.test.mts']
commands=[('tests-final',node+['--test','--test-concurrency=1']+tests,{}),('types-final',['node','node_modules/typescript/bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json'],{}),('lint-final',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs']+files,{})]
for field in ['signal','fault']:
 commands.append(('mutant-'+field,node+['--import',str(out/'mutant-loader.mjs'),'--test','--test-name-pattern=exact future metadata fit',tests[1]],{'JOURNAL_CAPACITY_MUTANT':field}))
results=[]
for name,cmd,extra in commands:
 with (out/(name+'.txt')).open('w') as f: result=subprocess.run(cmd,env={**env,**extra},stdout=f,stderr=subprocess.STDOUT)
 results.append({'name':name,'command':cmd,'environmentOverrides':extra,'exitCode':result.returncode});(out/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(name,result.returncode,flush=True)
