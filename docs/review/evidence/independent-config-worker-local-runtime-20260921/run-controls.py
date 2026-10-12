import pathlib,json,os,subprocess,shutil,time,hashlib,importlib.util
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;shared=root/'docs/review/evidence/independent-component-worker-listener-20260921';author=root/'docs/review/evidence/config-worker-local-runtime-20260921';pc=root/'docs/review/evidence/buster-provider-cancellation-20260921'
spec=importlib.util.spec_from_file_location('binding',shared/'bind.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
plan=json.loads((shared/'plan.json').read_text());out=here/'controls1';out.mkdir(exist_ok=False);node=shutil.which('node');native=root/plan['toolRoot']
extra=[here/'run-controls.py',shared/'bind.py',shared/'source-write-guard.mjs',author/'mutant-loader.mjs',author/'tool-paths.mjs',pc/'child-path-control.mjs']
# Same explicitly observed external binary/library closure as the positive run.
positive=json.loads((here/'run1/before.json').read_text())
extra.extend(pathlib.Path(p) for p in positive if not pathlib.Path(p).is_relative_to(root))
items=json.loads((author/'planned-checks.json').read_text())['mutants'];prepared=[]
for item in items:
 folder=out/item['name'];folder.mkdir();file=root/item['path'];raw=file.read_text();assert raw.count(item['from'])==1
 (folder/'before.txt').write_text(raw);(folder/'mutant.txt').write_text(raw.replace(item['from'],item['to']))
 b.write_json(folder/'spec.json',{'file':str(file),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'from':item['from'],'to':item['to'],'log':str(folder/'applied.jsonl')});prepared.append((item,folder));extra.extend([folder/'spec.json',folder/'before.txt',folder/'mutant.txt'])
folder=out/'removed-term-handler';folder.mkdir();child=root/'skills/buster/engine/test-gates/provider-child.mjs';raw=child.read_text();needle="process.on('SIGTERM', () => contextController.abort(new Error('TEST_PROVIDER_TERMINATED')));";assert raw.count(needle)==1
(folder/'provider-child.mjs').write_text(raw.replace(needle,''));(folder/'before.mjs').write_text(raw);extra.extend([folder/'provider-child.mjs',folder/'before.mjs'])
before=b.capture(root,plan,extra);b.write_json(out/'before.json',before);results=[]
baseenv=dict(os.environ,LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',LC_GNU_FLOCK=str(native/'usr/bin/flock'),KUBECLAW_TEST_TAR=str(native/'bin/tar'),COMPONENT_REVIEW_PROTECTED_SOURCES=str(here/'run1/protected.json'))
try:
 for item,folder in prepared+[(None,folder)]:
  name=item['name'] if item else 'removed-term-handler';env=dict(baseenv,LC_TOOL_MAPPING_LOG=str(folder/'tools.jsonl'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(folder/'violations.jsonl'))
  hooks=f'--import={shared / "source-write-guard.mjs"} --import={author / "tool-paths.mjs"}'
  if item:
   env['LC_MUTANT_SPEC']=str(folder/'spec.json');env['NODE_OPTIONS']=hooks+f' --import={author / "mutant-loader.mjs"}';cmd=[node,*item['command'].split()[1:]]
  else:
   env.update(PC_CONTROL_CHILD=str(folder/'provider-child.mjs'),PC_CONTROL_LOG=str(folder/'applied.jsonl'));env['NODE_OPTIONS']=hooks+f' --import={pc / "child-path-control.mjs"}';cmd=[node,'tests/verification/contracts/check-pipeline-test-plan-runner.mts']
  print('START '+name,flush=True);start=time.monotonic()
  with (folder/'output.txt').open('w') as log:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
  text=(folder/'output.txt').read_text();applied=(folder/'applied.jsonl').exists();needle='cancellation reaches the provider context signal before forced termination' if not item else ('Missing expected exception' if name!='lost-production-replay' else 'AssertionError')
  detected=r.returncode!=0 and 'AssertionError' in text and needle in text and applied
  row={'name':name,'command':cmd,'exitCode':r.returncode,'applied':applied,'semanticDetection':detected,'seconds':time.monotonic()-start};results.append(row);b.write_json(out/'results.json',results);print(json.dumps(row),flush=True)
finally:
 after=b.capture(root,plan,extra);b.write_json(out/'after.json',after);drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];b.write_json(out/'drift.json',drift)
raise SystemExit(0 if not drift and len(results)==5 and all(r['semanticDetection'] for r in results) else 1)
