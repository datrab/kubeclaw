"""Serial author checks with whole relevant source/dependency/tool binding."""
import argparse, importlib.util, json, os, pathlib, shutil, subprocess, time, re
root=pathlib.Path.cwd(); here=pathlib.Path(__file__).resolve().parent
review=root/'docs/review/evidence/independent-component-worker-listener-20260921'
spec=importlib.util.spec_from_file_location('lc_bind',review/'bind.py'); binding=importlib.util.module_from_spec(spec);spec.loader.exec_module(binding)
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--authorized-integration',action='store_true',required=True);args=parser.parse_args()
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
command_specs=json.loads((here/'followup-commands.json').read_text())
commands=[(row['name'],[node if x=='node' else shutil.which('npm') if x=='npm' else x for x in row['command']],row) for row in command_specs]
extra=[review/'plan.json',here.parent/'staging/planned-checks.json',here.parent/'staging/original-preservation.json',root/'docs/review/remediation/implementation/config-buster-readiness-20260921.md',root/'docs/operations/operator-configuration.md',here/'followup-commands.json',here.parent/'integration-candidate/manifest.json',here/'run-followup.py',here/'tool-paths.mjs',here/'tool-effects.mjs',review/'bind.py',review/'source-write-guard.mjs']+[pathlib.Path(shutil.which(t)).resolve() for t in plan['requiredTools']]
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
results=[]
try:
 for name,command,row in commands:
  started=time.monotonic();print('START '+name,flush=True)
  with (out/(name+'.txt')).open('x') as log:
   try:r=subprocess.run(command,env=dict(env,**row["env"]),stdout=log,stderr=subprocess.STDOUT,timeout=900);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  raw=(out/(name+'.txt')).read_text(); expected=(code==1 and bool(re.search(r'AssertionError|ERR_ASSERTION|failureType: .testCodeFailure',raw))) if row['mutation'] else code==0
  results.append({'name':name,'command':command,'environmentDelta':row['env'],'mutation':row['mutation'],'exitCode':code,'expectedExitAndAssertionObserved':expected,'requiresSemanticMutationReview':row['mutation'],'seconds':time.monotonic()-started});binding.write_json(out/'results.json',results);print('END '+name+' '+str(code),flush=True)
finally:
 after=binding.capture(root,plan,extra);binding.write_json(out/'after.json',after)
 drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];binding.write_json(out/'drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
raise SystemExit(1 if drift or any(not r['expectedExitAndAssertionObserved'] for r in results) else 0)
