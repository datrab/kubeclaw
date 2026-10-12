from pathlib import Path
import json,os,subprocess,shutil,tempfile,hashlib
base=Path('docs/review/evidence/config-worker-listener-20260921').resolve();out=base/'mutations1';out.mkdir(exist_ok=False)
results=[]
for mode in ['fallback','service','probe','envoy','policy']:
 env=dict(os.environ,WORKER_LISTENER_MUTATION=mode)
 with tempfile.TemporaryDirectory(prefix='worker-listener-mutant-') as temp:
  root=Path(temp);(root/'charts').mkdir();shutil.copytree('charts/prism',root/'charts/prism',symlinks=False)
  (root/'charts/kubeclaw/files').mkdir(parents=True);(root/'charts/kubeclaw/files/config').symlink_to(Path('charts/kubeclaw/files/config').resolve(),target_is_directory=True)
  env['WORKER_MUTANT_ROOT']=str(root)
  if mode!='fallback':
   mapping={
    'service':('services.yaml','targetPort: {{ (include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int }}','targetPort: 8080'),
    'probe':('workloads.yaml','(int $swarm.operator.prism.worker.port)','8080'),
    'envoy':('configmap-worker-trust.yaml','port_value: {{ (include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int }}','port_value: 8080'),
    'policy':('networkpolicy.yaml','ternary 8443 ((include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int) .Values.workerTrust.spiffe.enabled','ternary 8443 8080 .Values.workerTrust.spiffe.enabled')}
   name,old,new=mapping[mode];p=root/'charts/prism/templates'/name;s=p.read_text();assert old in s;p.write_text(s.replace(old,new))
  test='skills/prism/tests/worker-listener-config.test.mts' if mode=='fallback' else 'tests/verification/deployment/prism-swarm-config.test.mjs'
  command=['node','--import',str(base/'mutation-hook.mjs'),'--test','--test-concurrency=1','--test-name-pattern=WL',test]
  with (out/(mode+'.txt')).open('w') as log:r=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT)
  raw=(out/(mode+'.txt')).read_text();detected=r.returncode!=0 and ('ERR_ASSERTION' in raw or 'AssertionError' in raw)
  results.append({'mode':mode,'command':command,'exitCode':r.returncode,'detectedAssertion':detected});print(mode,r.returncode,detected,flush=True)
(out/'result.json').write_text(json.dumps(results,indent=2)+'\n');raise SystemExit(int(not all(r['detectedAssertion'] for r in results)))
