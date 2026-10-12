import os,json,subprocess,time,hashlib
from pathlib import Path
root=Path.cwd(); out=root/'docs/review/evidence/config-component-layout-20260921/integration3'; tool=root/'node_modules/.cache/native-host-tools/root'
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(tool/'usr/lib')+':'+str(tool/'lib')
base=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!']
full=base+['-b',str(tool/'bin/tar')+':/usr/bin/tar!']
def snapshot():
 result={}
 for prefix in ['skills','tests','charts','scripts','docker','contracts']:
  for path in (root/prefix).rglob('*'):
   if path.is_file() and not path.is_symlink(): result[str(path.relative_to(root))]=hashlib.sha256(path.read_bytes()).hexdigest()
 for name in ['package.json','package-lock.json','tsconfig.base.json']:
  path=root/name
  if path.exists():result[name]=hashlib.sha256(path.read_bytes()).hexdigest()
 return result
before=snapshot();(out/'sources-before.json').write_text(json.dumps(before,indent=2))
old=json.loads((out.parent/'integration2/results.json').read_text())
commands=[('missing-tar-diagnosis',base+['/usr/local/bin/node',str(out.parent/'admission-diagnosis/persisted-error.mts')]),('maintained',full+['/usr/local/bin/node','/usr/local/lib/node_modules/npm/bin/npm-cli.js','run','verify:config:components']),('buster',full+['/usr/local/bin/node']+old[2]['command'][4:]),('prism-types',old[3]['command'])]
results=[]
for name,command in commands:
 start=time.monotonic()
 with (out/(name+'.txt')).open('w') as log:
  process=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=420)
 results.append(dict(name=name,command=command,exitCode=process.returncode,seconds=round(time.monotonic()-start,3)))
 (out/'results.json').write_text(json.dumps(results,indent=2));print(name,process.returncode,flush=True)
after=snapshot();(out/'sources-after.json').write_text(json.dumps(after,indent=2));(out/'source-drift.json').write_text(json.dumps([k for k in before.keys()|after.keys() if before.get(k)!=after.get(k)],indent=2))
