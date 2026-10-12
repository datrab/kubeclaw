import subprocess,json,pathlib
p=pathlib.Path(__file__).parent
commands=[('tests',['node','--test','--test-concurrency=1','tests/verification/reliability/native-process-policy.test.mts','tests/verification/reliability/native-process-launches.test.mts','tests/verification/reliability/native-process-cancellation.test.mts']),('mutation',['node','--import',str((p/'revert-projection.mjs').resolve()),'--test','tests/verification/reliability/native-process-policy.test.mts']),('types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','tests/verification/reliability/tsconfig.native-scope.json']),('lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/worker/core/worker/native-worker-process.ts','tests/verification/reliability/native-process-policy.test.mts'])]
results=[]
for name,cmd in commands:
 with (p/(name+'.txt')).open('w') as log: r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 results.append({'name':name,'command':cmd,'exitCode':r.returncode});print(name,r.returncode,flush=True)
(p/'commands.json').write_text(json.dumps(results,indent=2)+'\n')
