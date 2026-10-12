import pathlib,json,os,subprocess,shutil,importlib.util,re
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;lc=root/'docs/review/evidence/config-worker-local-runtime-20260921';review=root/'docs/review/evidence/independent-component-worker-listener-20260921'
spec=importlib.util.spec_from_file_location('binding',review/'bind.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
out=here/'control1';out.mkdir(exist_ok=False)
child=root/'skills/buster/engine/test-gates/provider-child.mjs';source=child.read_text();needle="process.on('SIGTERM', () => contextController.abort(new Error('TEST_PROVIDER_TERMINATED')));"
assert source.count(needle)==1
mutant=out/'provider-child.mjs';mutant.write_text(source.replace(needle,''));(out/'original.mjs').write_text(source)
plan=json.loads((review/'plan.json').read_text());node=shutil.which('node');native=root/plan['toolRoot'];extras=[child,here/'control.py',here/'child-path-control.mjs',mutant,lc/'tool-paths.mjs',review/'bind.py',review/'source-write-guard.mjs',pathlib.Path(node).resolve()]
for row in json.loads((lc/'run9/tool-libraries.json').read_text()):
 for value in re.findall(r'/[^\s()]+',row['output']):
  p=pathlib.Path(value)
  if p.is_file():extras.append(p.resolve())
before=b.capture(root,plan,extras);b.write_json(out/'before.json',before)
env=dict(os.environ,PC_CONTROL_CHILD=str(mutant),PC_CONTROL_LOG=str(out/'launches.jsonl'),LC_GNU_FLOCK=str(native/'usr/bin/flock'),LC_TOOL_MAPPING_LOG=str(out/'tool-mapping.jsonl'),KUBECLAW_TEST_TAR=str(native/'bin/tar'),LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',COMPONENT_REVIEW_PROTECTED_SOURCES=str(lc/'run9/protected.json'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(out/'source-write-violations.jsonl'))
env['NODE_OPTIONS']=f'--import={review / "source-write-guard.mjs"} --import={lc / "tool-paths.mjs"} --import={here / "child-path-control.mjs"}'
command=[node,'tests/verification/contracts/check-pipeline-test-plan-runner.mts']
try:
 with (out/'output.txt').open('w') as log:p=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
 text=(out/'output.txt').read_text();detected=p.returncode!=0 and 'cancellation reaches the provider context signal before forced termination' in text and (out/'launches.jsonl').exists()
 b.write_json(out/'result.json',{'command':command,'exitCode':p.returncode,'cooperativeAssertionDetected':detected})
finally:
 after=b.capture(root,plan,extras);b.write_json(out/'after.json',after);drift=[f for f in set(before)|set(after) if before.get(f)!=after.get(f)];b.write_json(out/'drift.json',drift)
print(json.dumps({'exitCode':p.returncode,'cooperativeAssertionDetected':detected,'drift':drift}))
raise SystemExit(0 if detected and not drift else 1)
