from pathlib import Path
import hashlib,json,os,subprocess
root=Path.cwd();out=root/'docs/review/evidence/wait-value-retirement-20260921';tool=root/'node_modules/.cache/native-host-tools/root'
env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
files=[row['path'] for row in json.loads((out/'tests-run2-identities.json').read_text())]
files+=['skills/common/plugin-runtime/foundation/observability/durable-record-dependency.ts','skills/nova/core/state/wait-projection-source.ts']
files+=['tests/verification/reliability/wait-resolver-audience.test.mjs','tests/verification/reliability/record-retained-transition.test.mjs']
files+=['skills/common/plugin-runtime/foundation/config/swarm.ts','skills/common/plugin-runtime/foundation/config/swarm.schema.json','charts/kubeclaw/files/config/swarm.config.json']
files+=['skills/common/plugins/operator-messaging/src/delivery-projection.ts','package.json']
files+=['skills/common/plugin-runtime/foundation/observability/durable-blobs.ts','skills/common/plugin-runtime/foundation/package.json','tests/verification/reliability/blob-budget.test.mts','tests/verification/reliability/blob-read-boundary.test.mjs','tests/verification/reliability/blob-read-independent.test.mjs']
files+=['tests/verification/reliability/record-transition-authority-independent.test.mjs','tests/verification/reliability/record-fenced-read-independent.test.mjs']
files+=['tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs']
rows=[]
for file in dict.fromkeys(files):
 p=root/file;dest=out/'run5-source'/file;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes());rows.append({'path':file,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'snapshot':str(dest.relative_to(root))})
(out/'tests-run5-identities.json').write_text(json.dumps(rows,indent=2)+'\n')
commands=[('original-wait-live',node+['tests/live-function.test.ts'],root/'skills/common/plugins/wait-store'),('original-wait-boundary',node+['tests/package-boundary.test.mjs'],root/'skills/common/plugins/wait-store'),('original-operator-and-wait',node+['--test','--test-concurrency=1','tests/verification/reliability/wait-value-projection.test.mjs','tests/verification/reliability/wait-resolver-audience.test.mjs','tests/verification/reliability/operator-request-projection.test.mjs','tests/verification/reliability/operator-projection-independent.test.mjs'],root),('foundation-types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json'],root)]
commands.append(('original-blob-and-foundation',node+['--test','--test-concurrency=1','tests/verification/reliability/blob-budget.test.mts','tests/verification/reliability/blob-read-boundary.test.mjs','tests/verification/reliability/blob-read-independent.test.mjs','tests/verification/reliability/record-transition-authority-independent.test.mjs','tests/verification/reliability/record-fenced-read-independent.test.mjs','tests/verification/reliability/record-retained-transition.test.mjs'],root))
commands.append(('original-durable-cutover',node+['tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs'],root))
commands.append(('nova-types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','skills/nova/tsconfig.json'],root))
lintfiles=[file for file in files if file.endswith(('.ts','.mjs')) and not file.startswith('tests/') and file not in ['skills/common/plugin-runtime/foundation/config/swarm.ts','skills/nova/core/state/read-run-evidence.ts'] and '/tests/' not in file]
commands.append(('scoped-lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs',*dict.fromkeys(lintfiles)],root))
results=[]
for name,command,cwd in commands:
 with (out/(name+'-run5.txt')).open('w') as log:
  process=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=480)
 results.append({'name':name,'command':command,'cwd':str(cwd),'exitCode':process.returncode})
 (out/'commands-run5.json').write_text(json.dumps(results,indent=2)+'\n')
 print(name,process.returncode,flush=True)
 if process.returncode:break
changed=[row['path'] for row in rows if hashlib.sha256((root/row['path']).read_bytes()).hexdigest()!=row['sha256']]
(out/'source-drift-run5.json').write_text(json.dumps(changed,indent=2)+'\n')
raise SystemExit(1 if changed or any(row['exitCode'] for row in results) else 0)
