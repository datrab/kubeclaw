"""Compare unchanged original adapter tests with only runner source switched in private copies."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,tempfile
root=Path.cwd();out=root/'docs/review/evidence/buster-specialist-independent-20260921'
old=subprocess.check_output(['git','show','HEAD:skills/buster/engine/test-gates/runner.ts'])
(out/'pre-extraction-runner.ts.snapshot').write_bytes(old)
tests=['tests/verification/contracts/check-pipeline-junit-report-adapter.mts','tests/verification/contracts/check-pipeline-report-adapter-runtime.mts']
native=root/'node_modules/.cache/native-host-tools/root'
results=[]
with tempfile.TemporaryDirectory(prefix='buster-adapter-parity-') as tmp:
 repo=Path(tmp)
 def branch(relative,excluded):
  destination=repo/relative;destination.mkdir(parents=True,exist_ok=True)
  for entry in (root/relative).iterdir():
   if entry.name not in excluded:(destination/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
 branch(Path('.'),['skills','tests']);branch(Path('skills'),['buster']);branch(Path('skills/buster'),['engine']);shutil.copytree(root/'skills/buster/engine',repo/'skills/buster/engine',symlinks=True)
 branch(Path('tests'),['verification']);branch(Path('tests/verification'),['contracts']);branch(Path('tests/verification/contracts'),[Path(p).name for p in tests])
 for test in tests:shutil.copyfile(root/test,repo/test)
 # Pin the runtime bytes used by the completed comparison, so later timeout fixes
 # cannot silently change a replay of these before/after observations.
 for record in json.loads((out/'adapter-runtime-identities.json').read_text()):
  if 'snapshot' in record:(repo/record['source']).write_bytes((out/record['snapshot']).read_bytes())
 runner=repo/'skills/buster/engine/test-gates/runner.ts';current=runner.read_bytes()
 for mode in ['plain','proot']:
  for version,content in [('before',old),('after',current)]:
   runner.write_bytes(content)
   environment=dict(os.environ)
   command=['/usr/local/bin/node','--test',*tests]
   if mode=='proot':
    environment['LD_LIBRARY_PATH']=str(native/'usr/lib')+':'+str(native/'lib')
    command=[str(native/'usr/bin/proot'),'-b',str(native/'usr/bin/flock')+':/usr/bin/flock!','-b',str(native/'bin/tar')+':/usr/bin/tar!',*command]
   result=subprocess.run(command,cwd=repo,env=environment,capture_output=True,text=True,timeout=90)
   name=f'adapters-{mode}-{version}.txt';(out/name).write_text(result.stdout+result.stderr)
   results.append({'mode':mode,'version':version,'status':result.returncode,'runnerSha256':hashlib.sha256(content).hexdigest(),'testsSha256':{test:hashlib.sha256((repo/test).read_bytes()).hexdigest() for test in tests},'log':name})
   print(mode,version,result.returncode,flush=True)
(out/'adapter-comparison.json').write_text(json.dumps(results,indent=2)+'\n')
