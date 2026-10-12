from pathlib import Path
import subprocess,os,json,hashlib
r=Path.cwd(); e=r/'docs/review/evidence/junit-child-context-20260921'; env=os.environ.copy(); env['LD_LIBRARY_PATH']=str(r/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(r/'node_modules/.cache/native-host-tools/root/lib')
base=[str(r/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(r/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']; source=r/'tests/verification/contracts/check-junit-executed-required.mts'
before=hashlib.sha256(source.read_bytes()).hexdigest(); results=[]
for name,args in [('direct-after',[str(source)]),('aggregate-after',['--test',str(source)])]:
 cmd=base+args
 with (e/(name+'.txt')).open('w') as log: p=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append({'name':name,'argv':cmd,'exitCode':p.returncode})
(e/'commands-results.json').write_text(json.dumps({'LD_LIBRARY_PATH':env['LD_LIBRARY_PATH'],'source':str(source.relative_to(r)),'beforeSha256':before,'afterSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runs':results},indent=2)+'\n')
(e/'test-after.mts.snapshot').write_bytes(source.read_bytes())
assert all(item['exitCode']==0 for item in results)
