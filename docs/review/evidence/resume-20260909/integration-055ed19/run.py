import json, os, pathlib, subprocess, sys, time

root = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
env = dict(os.environ)
env['PATH'] = '/workspace/scratch/4e25cf57c177/toolchains/bin:/workspace/scratch/4e25cf57c177/toolchains/go/bin:' + env['PATH']
source = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
checks = [
 ('versions', 'npm run versions:check && node --test tests/verification/deployment/versions.test.mjs'),
 ('inventory', 'npm run plugin-system:inventory:check'),
 ('builds', 'npm run plugin-system:plugins:build && npm run plugin-system:sandbox:build'),
 ('types', 'npm run typecheck --prefix skills/nova && node node_modules/typescript/bin/tsc --noEmit -p skills/buster/engine/tsconfig.json && node node_modules/typescript/bin/tsc --noEmit -p skills/prism/tsconfig.json && npm run progress:scaffold:typecheck'),
 ('registry', 'node tests/verification/contracts/check-plugin-system-v2-registry.mjs'),
 ('operator', 'npm test --workspace @kubeclaw/plugin-operator-messaging && node --test tests/verification/reliability/discord-delivery-receipt.test.mts'),
 ('demo', 'npm test --workspace @kubeclaw/plugin-demo-handoff'),
 ('scaffold', 'node --test tests/skills/nova/project_setup/progress-scaffold.test.mjs tests/skills/nova/project_setup/scaffold-regeneration.test.mjs tests/skills/nova/project_setup/scaffold-publication.test.mjs'),
 ('readiness', 'node --test skills/prism/tests/worker-readiness.test.mts skills/prism/tests/internal-auth.test.mts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-readiness-chart.test.mts tests/verification/deployment/buster-readiness.test.mts tests/verification/e2e/capabilities.test.mjs tests/verification/e2e/check-real-e2e-capabilities.test.mjs'),
 ('remote-runtime', 'node tests/verification/contracts/check-pipeline-remote-plan-runtime.mts'),
 ('coverage', 'node --test tests/verification/e2e/fixture-coverage.test.mjs tests/verification/e2e/retired-harness-contracts.test.mjs tests/verification/e2e/production-graph-validation.test.mts tests/verification/deployment/registry-health.test.mts'),
 ('fixture-contracts', 'node tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts && node tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts && node tests/verification/e2e/check-v2-production-contracts.mts'),
 ('controller', 'go test -race ./cmd/buster-namespace-controller'),
 ('deployment', 'node tests/verification/deployment/check-deployment-truth.mjs'),
]
results=[]
for name,command in checks:
 start=time.monotonic()
 with (out/(name+'.log')).open('w') as stream:
  try:
   result=subprocess.run(command,shell=True,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=240)
   code=result.returncode
  except subprocess.TimeoutExpired:
   code=124
 results.append({'name':name,'command':command,'exit_code':code,'duration_seconds':round(time.monotonic()-start,2)})
 (out/'manifest.json').write_text(json.dumps({'source_commit':source,'checks':results},indent=2)+'\n')
 print(f'{name}: exit {code}',flush=True)
 if code: print((out/(name+'.log')).read_text()[-5000:],flush=True)
final_source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
status=subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)
(out/'source-status.txt').write_text('before='+source+'\nafter='+final_source+'\n'+status)
print('source unchanged:',source==final_source,'clean:',not status,flush=True)
sys.exit(0 if all(x['exit_code']==0 for x in results) and source==final_source and not status else 1)
