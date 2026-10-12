import os,json,subprocess,time
from pathlib import Path
root=Path.cwd(); out=Path(__file__).resolve().parent; tool=root/'node_modules/.cache/native-host-tools/root'
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(tool/'usr/lib')+':'+str(tool/'lib')
base=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','-b',str(tool/'bin/tar')+':/usr/bin/tar!','/usr/local/bin/node','--import',str(out/'mutation-loader.mjs'),'--test','--test-concurrency=1']
cases={'required':'tests/verification/reliability/config-component-bundle.test.mts','legacy':'skills/prism/tests/swarm-worker-config.test.mts','generation':'tests/verification/reliability/config-component-generation.test.mjs',**{k:'skills/prism/tests/swarm-supervisor-consumers.test.mts' for k in ['output','poll','close']}}
results=[]
for name,test in cases.items():
 start=time.monotonic(); altered=env.copy();altered['CONFIG_MUTANT']=name
 with (out/(name+'.txt')).open('x') as log: result=subprocess.run(base+[test],env=altered,stdout=log,stderr=subprocess.STDOUT,timeout=150)
 text=(out/(name+'.txt')).read_text();results.append(dict(name=name,command=base+[test],exitCode=result.returncode,seconds=round(time.monotonic()-start,3),applied='CONFIG_MUTANT_APPLIED:'+name in text,anchorFailure='CONFIG_MUTANT_ANCHOR_CHANGED' in text))
 (out/'results.json').write_text(json.dumps(results,indent=2));print(name,result.returncode,flush=True)
