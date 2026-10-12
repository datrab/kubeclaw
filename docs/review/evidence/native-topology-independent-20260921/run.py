from pathlib import Path
import subprocess, os, json, hashlib
root=Path.cwd(); out=root/'docs/review/evidence/native-topology-independent-20260921'; host=root/'node_modules/.cache/native-host-tools/root'
env=os.environ.copy(); env['LD_LIBRARY_PATH']=str(host/'usr/lib')+':'+str(host/'lib')
env['PATH']=str(root/'docs/review/evidence/native-aggregate-topology-20260921/compiler-bin')+':'+str(host/'usr/bin')+':'+env['PATH']
node=[str(host/'usr/bin/proot'),'-b',str(host/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
results=[]
def run(name,argv,extra=None):
  local=env.copy();local.update(extra or {})
  with (out/(name+'.txt')).open('w') as log:r=subprocess.run(argv,env=local,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  results.append({'name':name,'argv':argv,'environmentOverrides':extra or {},'exitCode':r.returncode})
  (out/'commands.json').write_text(json.dumps(results,indent=2)+'\n')
  print(name,r.returncode,flush=True)
run('probes',node+['--test','--test-concurrency=1',str(out/'probes.mts')])
for mutation in ['post-bind-fence','helper-serialization','child-cas','local-event-mount']:
  test='tests/verification/reliability/worker-owned-children.test.mts' if mutation=='local-event-mount' else str(out/'probes.mts')
  run('mutant-'+mutation,node+['--import',str(out/'mutate.mjs'),'--test','--test-concurrency=1',test],{'REVIEW_MUTATION':mutation})
run('original-node-pools',node+['/usr/local/lib/node_modules/npm/bin/npm-cli.js','run','verify:worker-core:node-pools'])
run('original-ownership-cancellation-observation',node+['--test','--test-concurrency=1','tests/verification/reliability/worker-ownership-store.test.mts','tests/verification/reliability/worker-observation-durability.test.mts','tests/verification/reliability/worker-native-observation.test.mts','tests/verification/reliability/native-process-cancellation.test.mts','tests/verification/reliability/native-process-launches.test.mts','tests/verification/reliability/worker-native-launcher.test.mts'])
run('original-native-scope',['npm','run','verify:worker-core:native-scope'])
