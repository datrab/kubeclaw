import json,subprocess,time,os,hashlib,stat
from pathlib import Path
root=Path.cwd();out=Path(__file__).resolve().parent;tool=root/'node_modules/.cache/native-host-tools/root'
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(tool/'usr/lib')+':'+str(tool/'lib')
base=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','-b',str(tool/'bin/tar')+':/usr/bin/tar!','/usr/local/bin/node']
commands=[('delivery-controls',base+['--test','--test-concurrency=1','tests/verification/deployment/config-component-packaging.test.mjs','tests/verification/reliability/config-component-bundle.test.mts']),('deployment-originals',base+['--test','--test-concurrency=1','tests/verification/deployment/deployment-release.test.mjs']),('deployment-truth',['node','tests/verification/deployment/check-deployment-truth.mjs'])]
owned=json.loads((out.parent/'integration1/identities.json').read_text())
lintfiles=[row['path'] for row in owned if Path(row['path']).suffix in ['.ts','.mts','.mjs','.js'] and Path(row['path']).is_file()]
for name in ['skills/prism/tests/fixtures/native-process-boundary.mts','tests/verification/reliability/config-component-generation.test.mjs','skills/prism/tests/swarm-supervisor-consumers.test.mts']:
 if name not in lintfiles:lintfiles.append(name)
commands.append(('canonical-lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs']+lintfiles))
def snapshot():
 result={}
 for prefix in ['skills','tests','charts','scripts','docker','contracts']:
  for path in (root/prefix).rglob('*'):
   info=path.lstat()
   if path.is_symlink(): result[str(path.relative_to(root))]={'link':os.readlink(path)}
   elif path.is_file(): result[str(path.relative_to(root))]={'mode':stat.S_IMODE(info.st_mode),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 for name in ['package.json','package-lock.json','tsconfig.base.json']:
  path=root/name
  if path.exists():result[name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 return result
before=snapshot();(out/'sources-before.json').write_text(json.dumps(before,indent=2))
results=[]
for name,command in commands:
 start=time.monotonic()
 with (out/(name+'.txt')).open('x') as log:result=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=360)
 results.append(dict(name=name,command=command,exitCode=result.returncode,seconds=round(time.monotonic()-start,3)));(out/'results.json').write_text(json.dumps(results,indent=2));print(name,result.returncode,flush=True)

after=snapshot();(out/"sources-after.json").write_text(json.dumps(after,indent=2));(out/"source-drift.json").write_text(json.dumps([k for k in before.keys()|after.keys() if before.get(k)!=after.get(k)],indent=2))

altered=env.copy();altered['CONFIG_MUTANT']='owner'
command=base+['--import',str(out.parent/'mutants/owner-loader.mjs'),'--test','tests/verification/reliability/config-component-bundle.test.mts']
with (out/'owner-mutant.txt').open('x') as log:r=subprocess.run(command,env=altered,stdout=log,stderr=subprocess.STDOUT,timeout=60)
(out/'owner-mutant.json').write_text(json.dumps({'command':command,'exitCode':r.returncode},indent=2));print('owner-mutant',r.returncode,flush=True)
