import concurrent.futures,hashlib,json,os,shutil,subprocess,sys,time
from pathlib import Path
root=Path.cwd(); out=root/'docs/review/evidence/config-acceptance/c0-completion-20261013/independent-case-phase-recheck-15'
base=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/active-definition-generation-01')
author=Path('docs/review/evidence/config-acceptance/author')
files=list((root/author).glob('*.py'))+list((root/base/'baseline').rglob('*'))
files=[p for p in files if p.is_file()]
files += [root/base/name for name in ('check-generation.py','check-case-contract.py','check-baseline.py','generation.schema.json','root-structural-alias.stdout','root-structural-alias.stderr')]
files += [out/'recheck.py',root/'docs/review/remediation/OPENCLAW-CONFIG-GOAL.md']
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
initial={str(p.relative_to(root)):hashfile(p) for p in files}
frozen=out/'inputs'
for p in files:
 dest=frozen/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
assert all(hashfile(frozen/path)==digest and hashfile(root/path)==digest for path,digest in initial.items()),'Input changed during snapshot'
(out/'input-hashes.json').write_text(json.dumps(initial,indent=2,sort_keys=True)+'\n')
commands=[[sys.executable,str(base/name)] for name in ('check-generation.py','check-case-contract.py','check-baseline.py')]
commands.append([sys.executable,str((out/'recheck.py').relative_to(root))])
def execute(command):
 name=Path(command[-1]).stem;started=time.time()
 result=subprocess.run(command,cwd=frozen,capture_output=True)
 (out/(name+'.stdout')).write_bytes(result.stdout);(out/(name+'.stderr')).write_bytes(result.stderr)
 return {'command':command,'cwd':str(frozen),'exitCode':result.returncode,'seconds':round(time.time()-started,3),'stdoutSha256':hashlib.sha256(result.stdout).hexdigest(),'stderrSha256':hashlib.sha256(result.stderr).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor: results=list(executor.map(execute,commands))
identity={'reviewerTask':'/root/case_phase_independent_15','python':sys.version,'gitHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'gitTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'commands':results,'frozenEndHashesUnchanged':all(hashfile(frozen/path)==digest for path,digest in initial.items()),'liveEndHashesUnchanged':all(hashfile(root/path)==digest for path,digest in initial.items())}
(out/'run-manifest.json').write_text(json.dumps(identity,indent=2)+'\n')
print(json.dumps(identity,indent=2)); assert all(v['exitCode']==0 for v in results)
