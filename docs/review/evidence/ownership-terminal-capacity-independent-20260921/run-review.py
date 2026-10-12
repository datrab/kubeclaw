import pathlib,os,json,subprocess,time,hashlib
r=pathlib.Path.cwd(); out=r/'docs/review/evidence/ownership-terminal-capacity-independent-20260921'; env=os.environ.copy(); env['LD_LIBRARY_PATH']=str(r/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(r/'node_modules/.cache/native-host-tools/root/lib')
base=[str(r/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(r/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
tracked=['skills/worker/core/worker/'+n+'.ts' for n in ['ownership-capacity','ownership-state','ownership-store','ownership-children','native-worker-ownership']]+['tests/verification/reliability/'+n+'.mts' for n in ['worker-ownership-store.test','worker-owned-children.test','worker-native-quiescence.test','worker-terminal-capacity.test']]+['skills/prism/tests/swarm-supervisor-consumers.test.mts','tests/verification/reliability/tsconfig.native-scope.json','package.json','docs/operations/native-worker-host-pools.md','docs/review/remediation/implementation/ownership-terminal-capacity-20260921.md']
(out/'before-run-identities.json').write_text(json.dumps([{'path':p,'sha256':hashlib.sha256((r/p).read_bytes()).hexdigest()} for p in tracked],indent=2)+'\n')
results=[]
def run(name,cmd,extra={}):
 start=time.monotonic()
 with (out/(name+'.txt')).open('w') as log: p=subprocess.run(cmd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT,timeout=180)
 results.append({'name':name,'command':cmd,'environment':extra,'exitCode':p.returncode,'seconds':time.monotonic()-start});(out/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(name,p.returncode,flush=True)
run('maintained27',base+['--test','--test-concurrency=1']+[p for p in tracked if p.endswith('.test.mts')])
probe=str(out/'independent-filesystem.test.mjs')
run('independent-filesystem',base+['--test','--test-concurrency=1',probe])
for name in ['admission','observation']:
 run('mutant-'+name,base+['--import',str(out/'mutation-hook.mjs'),'--test','--test-concurrency=1','--test-name-pattern','independent escaped-identity',probe],{'OWNERSHIP_REVIEW_MUTANT':name})
run('native-scope-types',['node_modules/.bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json'])
# Prism typecheck runs separately after concurrent Control source freeze.
run('lint',['node_modules/.bin/eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs']+[p for p in tracked if p.endswith(('.ts','.mts')) and 'native-worker-ownership' not in p and 'ownership-children' not in p])
