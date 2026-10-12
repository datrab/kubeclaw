import pathlib,os,json,hashlib,subprocess,shutil,importlib.util,time,re
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;review=root/'docs/review/evidence/independent-component-worker-listener-20260921'
spec=importlib.util.spec_from_file_location('binding',review/'bind.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
out=here/'mutants2';out.mkdir(exist_ok=False);plan=json.loads((review/'plan.json').read_text());node=shutil.which('node');native=root/plan['toolRoot']
extras=[pathlib.Path(node).resolve(),here/'mutants.py',here/'mutant-loader.mjs',here/'tool-paths.mjs',review/'bind.py',review/'source-write-guard.mjs']
libs=json.loads((here/'run5/tool-libraries.json').read_text())
for row in libs:
 for value in re.findall(r'/[^\s()]+',row['output']):
  p=pathlib.Path(value)
  if p.is_file():extras.append(p.resolve())
before=b.capture(root,plan,extras);b.write_json(out/'before.json',before);results=[]
try:
 for item in json.loads((here/'planned-checks.json').read_text())['mutants']:
  file=root/item['path'];raw=file.read_bytes();folder=out/item['name'];folder.mkdir()
  mutation={'file':str(file),'sha256':hashlib.sha256(raw).hexdigest(),'from':item['from'],'to':item['to'],'log':str(folder/'loads.jsonl')}
  b.write_json(folder/'spec.json',mutation);(folder/'original.txt').write_bytes(raw);(folder/'mutant.txt').write_text(raw.decode().replace(item['from'],item['to']))
  env=dict(os.environ,LC_MUTANT_SPEC=str(folder/'spec.json'),LC_GNU_FLOCK=str(native/'usr/bin/flock'),LC_TOOL_MAPPING_LOG=str(folder/'tool-mapping.jsonl'),KUBECLAW_TEST_TAR=str(native/'bin/tar'),LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',COMPONENT_REVIEW_PROTECTED_SOURCES=str(here/'run5/protected.json'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(folder/'source-write-violations.jsonl'))
  env['NODE_OPTIONS']=f'--import={review / "source-write-guard.mjs"} --import={here / "tool-paths.mjs"} --import={here / "mutant-loader.mjs"}'
  command=[node,*item['command'].split()[1:]];print('START '+item['name'],flush=True);started=time.monotonic()
  with (folder/'output.txt').open('w') as log:p=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  text=(folder/'output.txt').read_text();detected=p.returncode!=0 and 'AssertionError' in text and (folder/'loads.jsonl').exists()
  results.append({'name':item['name'],'command':command,'exitCode':p.returncode,'assertionDetected':detected,'seconds':time.monotonic()-started});b.write_json(out/'results.json',results);print(item['name']+' '+str(p.returncode)+' assertion='+str(detected),flush=True)
finally:
 after=b.capture(root,plan,extras);b.write_json(out/'after.json',after);drift=[f for f in set(before)|set(after) if before.get(f)!=after.get(f)];b.write_json(out/'drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
raise SystemExit(0 if not drift and len(results)==4 and all(row['assertionDetected'] for row in results) else 1)
