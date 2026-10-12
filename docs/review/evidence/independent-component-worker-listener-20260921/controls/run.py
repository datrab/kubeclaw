"""Independent negative-control orchestration; run only after positive block."""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time
root = pathlib.Path.cwd()
harness = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(harness))
from bind import capture, write_json
out = pathlib.Path(sys.argv[1]).resolve(); out.mkdir(parents=True, exist_ok=False); (out/'loads').mkdir()
plan = json.loads((harness/'plan.json').read_text())
component = root/'docs/review/evidence/config-component-layout-20260921/mutants'
listener = root/'docs/review/evidence/config-worker-listener-20260921'
hooks = [component/'owner-loader.mjs', listener/'mutation-hook.mjs', listener/'before/skills/prism/server/worker-config.ts']
extra = list(harness.glob('*.mjs')) + list(harness.glob('*.py')) + [pathlib.Path(__file__).resolve()] + hooks
positive = json.loads((harness/'run3/after.json').read_text())
extra += [pathlib.Path(file) for file in positive if not pathlib.Path(file).is_relative_to(root)]
before = capture(root, plan, extra); write_json(out/'before.json', before)
changed_positive = [file for file in positive if not pathlib.Path(file).is_relative_to(harness) and positive[file] != before.get(file)]
write_json(out/'positive-source-delta.json', changed_positive)
if changed_positive: raise SystemExit('NEGATIVE_CONTROL_SOURCE_MISMATCH')
old = harness/'run3'
if json.loads((old/'drift.json').read_text()): raise SystemExit('POSITIVE_SOURCE_DRIFT_UNRESOLVED')
tool = root/plan['toolRoot']
base = [str(tool/'usr/bin/proot'), '-b', f'{tool}/usr/bin/flock:/usr/bin/flock!', '-b', f'{tool}/bin/tar:/usr/bin/tar!', shutil.which('node')]
env = dict(os.environ, LD_LIBRARY_PATH=f'{tool}/usr/lib:{tool}/lib',
 COMPONENT_REVIEW_PROTECTED_SOURCES=str(old/'protected.json'),
 COMPONENT_REVIEW_WRITE_VIOLATIONS=str(out/'source-write-violations.jsonl'),
 COMPONENT_REVIEW_TRACE_DIRECTORY=str(out/'loads'),
 NODE_OPTIONS=f'--import={harness/"source-write-guard.mjs"} --import={harness/"runtime-trace.mjs"}')
component_cases = {
 'required':'tests/verification/reliability/config-component-bundle.test.mts',
 'owner':'tests/verification/reliability/config-component-bundle.test.mts',
 'legacy':'skills/prism/tests/swarm-worker-config.test.mts',
 'generation':'tests/verification/reliability/config-component-generation.test.mjs',
 'output':'skills/prism/tests/swarm-supervisor-consumers.test.mts',
 'poll':'skills/prism/tests/swarm-supervisor-consumers.test.mts',
 'close':'skills/prism/tests/swarm-supervisor-consumers.test.mts'}
results=[]
def run(name, command, environment, marker=None, mutation=None):
 started=time.monotonic()
 with (out/f'{name}.txt').open('x') as stream: result=subprocess.run(command,env=environment,stdout=stream,stderr=subprocess.STDOUT)
 text=(out/f'{name}.txt').read_text()
 semantic=result.returncode==1 and ('ERR_ASSERTION' in text or 'AssertionError' in text)
 applied=(marker in text) if marker else mutation is not None
 item={'name':name,'command':command,'exitCode':result.returncode,'semanticAssertion':semantic,'applied':applied,'mutation':mutation,'seconds':time.monotonic()-started}
 results.append(item);write_json(out/'results.json',results);print(name,result.returncode,semantic,flush=True)
 if not semantic or not applied or 'CONFIG_MUTANT_ANCHOR_CHANGED' in text or 'MUTATION_SOURCE_MISMATCH' in text: raise RuntimeError(f'NEGATIVE_CONTROL_NOT_PROVED:{name}')
 if (out/'source-write-violations.jsonl').exists(): raise RuntimeError('NEGATIVE_FIXTURE_SOURCE_WRITE_ATTEMPT')
try:
 for mode,module in component_cases.items():
  command=base+['--import',str(component/'owner-loader.mjs'),'--test','--test-concurrency=1',module]
  run('component-'+mode,command,dict(env,CONFIG_MUTANT=mode),'CONFIG_MUTANT_APPLIED:'+mode)
 for mode in ['fallback','service','probe','envoy','policy']:
  with tempfile.TemporaryDirectory(prefix='independent-worker-port-') as temp:
   private=pathlib.Path(temp);(private/'charts').mkdir()
   shutil.copytree(root/'charts/prism',private/'charts/prism',symlinks=False)
   (private/'charts/kubeclaw/files').mkdir(parents=True)
   shutil.copytree(root/'charts/kubeclaw/files/config',private/'charts/kubeclaw/files/config',symlinks=False)
   mutation=None
   if mode!='fallback':
    mapping={
     'service':('services.yaml','targetPort: {{ (include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int }}','targetPort: 8080'),
     'probe':('workloads.yaml','(int $swarm.operator.prism.worker.port)','8080'),
     'envoy':('configmap-worker-trust.yaml','port_value: {{ (include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int }}','port_value: 8080'),
     'policy':('networkpolicy.yaml','ternary 8443 ((include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int) .Values.workerTrust.spiffe.enabled','ternary 8443 8080 .Values.workerTrust.spiffe.enabled')}
    name,needle,replacement=mapping[mode];target=private/'charts/prism/templates'/name;source=root/'charts/prism/templates'/name
    assert not target.is_symlink() and target.resolve()==target
    assert (target.stat().st_dev,target.stat().st_ino)!=(source.stat().st_dev,source.stat().st_ino)
    original=target.read_text();assert needle in original;changed=original.replace(needle,replacement);target.write_text(changed)
    mutation={'privateFile':str(target),'sourceFile':str(source),'before':hashlib.sha256(original.encode()).hexdigest(),'after':hashlib.sha256(changed.encode()).hexdigest(),'occurrences':original.count(needle)}
   else:
    mutation={'sourceFile':'skills/prism/server/worker-config.ts','replacementSnapshot':str(hooks[-1]),'replacementSha256':hashlib.sha256(hooks[-1].read_bytes()).hexdigest()}
   module='skills/prism/tests/worker-listener-config.test.mts' if mode=='fallback' else 'tests/verification/deployment/prism-swarm-config.test.mjs'
   command=base+['--import',str(listener/'mutation-hook.mjs'),'--test','--test-concurrency=1','--test-name-pattern=WL',module]
   run('listener-'+mode,command,dict(env,WORKER_LISTENER_MUTATION=mode,WORKER_MUTANT_ROOT=str(private)),mutation=mutation)
finally:
 after=capture(root,plan,extra);write_json(out/'after.json',after)
 changed=[file for file in before.keys()|after.keys() if before.get(file)!=after.get(file)]
 write_json(out/'drift.json',changed)
 if changed: raise RuntimeError('NEGATIVE_CONTROL_SOURCE_DRIFT')
