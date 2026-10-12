from pathlib import Path
import subprocess,os,json
root=Path.cwd();out=root/'docs/review/evidence/native-aggregate-topology-20260921';host=root/'node_modules/.cache/native-host-tools/root'
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(host/'usr/lib')+':'+str(host/'lib')
node=[str(host/'usr/bin/proot'),'-b',str(host/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
sources=['ownership-children','ownership-state','ownership-store','native-hierarchy-events','native-owned-children','native-resource-scope','native-worker-ownership']
tests=['worker-native-quiescence.test.mts','worker-owned-children.test.mts','worker-native-topology-live.mts','worker-native-scope-live.mts','worker-native-launcher.test.mts','worker-observation-durability.test.mts']
commands=[('metadata-final',node+['--test','--test-concurrency=1','tests/verification/reliability/worker-owned-children.test.mts','tests/verification/reliability/worker-native-quiescence.test.mts','tests/verification/reliability/worker-ownership-store.test.mts']),('native-typecheck-final',['node_modules/.bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json']),('prism-typecheck-final',['node_modules/.bin/tsc','--noEmit','-p','skills/prism/tsconfig.json']),('lint-final',['node_modules/.bin/eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs']+['skills/worker/core/worker/'+p+'.ts' for p in sources]+['tests/verification/reliability/'+p for p in tests]),('native-gate-final',['npm','run','verify:worker-core:native-scope'])]
results=[]
for name,argv in commands:
 with (out/(name+'.txt')).open('w') as log:r=subprocess.run(argv,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
 results.append({'name':name,'argv':argv,'exitCode':r.returncode})
 (out/'final-commands.json').write_text(json.dumps(results,indent=2)+'\n')
