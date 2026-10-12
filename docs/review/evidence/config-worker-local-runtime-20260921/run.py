"""Serial author checks with whole relevant source/dependency/tool binding."""
import argparse, importlib.util, json, os, pathlib, shutil, subprocess, time, re
root=pathlib.Path.cwd(); here=pathlib.Path(__file__).resolve().parent
review=root/'docs/review/evidence/independent-component-worker-listener-20260921'
spec=importlib.util.spec_from_file_location('lc_bind',review/'bind.py'); binding=importlib.util.module_from_spec(spec);spec.loader.exec_module(binding)
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--phase',choices=['focus','regression','followup','final'],required=True);args=parser.parse_args()
out=here/args.output;out.mkdir(exist_ok=False)
plan=json.loads((review/'plan.json').read_text());node=shutil.which('node');native=root/plan['toolRoot']
base=[node]
protected=set()
for chart in ['prism','kubeclaw']:
 for name in ['swarm','prism-control','prism-studio','prism-worker','prism-execution','buster-engine','worker-core']:
  protected.add((root/f'charts/{chart}/files/config/{name}.config.json').resolve())
 for name in ['swarm.schema.json','swarm-components.schema.json']:protected.add((root/f'charts/{chart}/files/config/{name}').resolve())
for name in ['charts/prism/templates/_swarm-bundle.tpl','charts/prism/templates/_swarm-config.tpl','charts/prism/templates/workloads.yaml','charts/kubeclaw/templates/_swarm-config.tpl','charts/kubeclaw/templates/deployment.yaml']:protected.add((root/name).resolve())
binding.write_json(out/'protected.json',[{'path':str(p),'dev':str(p.stat().st_dev),'ino':str(p.stat().st_ino)} for p in sorted(protected)])
env=dict(os.environ,LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',COMPONENT_REVIEW_PROTECTED_SOURCES=str(out/'protected.json'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(out/'source-write-violations.jsonl'))
assert not env.get('NODE_OPTIONS');env['NODE_OPTIONS']=f'--import={review / "source-write-guard.mjs"} --import={here / "tool-paths.mjs"}'
env.update(LC_GNU_FLOCK=str(native/'usr/bin/flock'), LC_TOOL_MAPPING_LOG=str(out/'tool-mapping.jsonl'), KUBECLAW_TEST_TAR=str(native/'bin/tar'))
if args.phase=='final':
 commands=[('maintained-local-config',[shutil.which('npm'),'run','verify:worker-core:local-config']),('provider-child-lint',[node,'node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/buster/engine/test-gates/provider-child.mjs'])]
elif args.phase=='focus':
 commands=[('real-tool-effects',base+[str(here/'tool-effects.mjs')]),('core-policy',base+['--test','tests/verification/contracts/check-pipeline-worker-local-policy.mts']),('production-replay',base+['tests/verification/contracts/check-pipeline-worker-local-config.mts']),('local-types',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','tests/verification/contracts/tsconfig.worker-local-runtime.json']),('runtime-types',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json'])]
elif args.phase=='followup':
 commands=[('original-core',base+['tests/verification/contracts/check-pipeline-worker-local-runtime.mts']),('core-policy',base+['--test','tests/verification/contracts/check-pipeline-worker-local-policy.mts']),('original-deadlines',base+['--test','--test-concurrency=1','tests/verification/reliability/worker-deadline.test.mts']),('original-runner',base+['tests/verification/contracts/check-pipeline-test-plan-runner.mts']),('original-real-provider',base+['tests/verification/contracts/check-pipeline-remote-real-provider.mts']),('production-replay',base+['tests/verification/contracts/check-pipeline-worker-local-config.mts']),('local-types',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','tests/verification/contracts/tsconfig.worker-local-runtime.json']),('runtime-types',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json'])]
else:
 commands=[('original-core',base+['tests/verification/contracts/check-pipeline-worker-local-runtime.mts']),('original-deadlines',base+['--test','--test-concurrency=1','tests/verification/reliability/worker-deadline.test.mts']),('original-runner',base+['tests/verification/contracts/check-pipeline-test-plan-runner.mts']),('original-real-provider',base+['tests/verification/contracts/check-pipeline-remote-real-provider.mts']),('original-config',base+['tests/verification/contracts/check-pipeline-remote-runtime-config.mts']),('components',base[:-1]+[shutil.which('npm'),'run','verify:config:components'])]
extra=[here/'run.py',here/'tool-paths.mjs',here/'tool-effects.mjs',review/'bind.py',review/'source-write-guard.mjs']+[pathlib.Path(shutil.which(t)).resolve() for t in plan['requiredTools']]
libraries=set(); observations=[]
for executable in [node,str(native/'usr/bin/flock'),str(native/'bin/tar'),str(root/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox')]:
 observed=subprocess.run(['ldd',executable],env=env,capture_output=True,text=True); text=observed.stdout+observed.stderr;observations.append({'executable':executable,'exitCode':observed.returncode,'output':text})
 for candidate in re.findall(r'/[^\s()]+',text):
  file=pathlib.Path(candidate)
  if file.is_file():libraries.add(file.resolve())
extra.extend(sorted(libraries));binding.write_json(out/'tool-libraries.json',observations)
before=binding.capture(root,plan,extra);binding.write_json(out/'before.json',before)
with (out/'source.patch').open('w') as log:subprocess.run(['git','diff','--binary','--',*plan['sourceRoots'],*plan['rootFiles']],stdout=log,check=True)
tracked=set(subprocess.check_output(['git','ls-files','-z']).decode().split('\0'))
for file in before:
 source=pathlib.Path(file)
 try:relative=source.relative_to(root)
 except ValueError:continue
 if str(relative) in tracked or relative.parts[0] not in plan['sourceRoots'] or source.is_symlink():continue
 target=out/'new-source'/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
if args.phase in ['regression','followup']:
 lint=[row['path'] for row in json.loads((here/'staging/checkpoint-identities.json').read_text()) if row['kind']=='file' and pathlib.Path(row['path']).suffix in ['.ts','.mts','.mjs']]
 commands.append(('canonical-lint',[node,'node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs',*lint]))
results=[]
try:
 for name,command in commands:
  started=time.monotonic();print('START '+name,flush=True)
  with (out/(name+'.txt')).open('x') as log:
   try:r=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  results.append({'name':name,'command':command,'exitCode':code,'seconds':time.monotonic()-started});binding.write_json(out/'results.json',results);print('END '+name+' '+str(code),flush=True)
finally:
 after=binding.capture(root,plan,extra);binding.write_json(out/'after.json',after)
 drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];binding.write_json(out/'drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
raise SystemExit(1 if drift or any(r['exitCode'] for r in results) else 0)
