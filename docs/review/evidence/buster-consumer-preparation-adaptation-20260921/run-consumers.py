from pathlib import Path
import subprocess,os,json,sys
root=Path.cwd();out=root/'docs/review/evidence/buster-consumer-preparation-adaptation-20260921';tool=root/'node_modules/.cache/native-host-tools/root';env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','-b',str(tool/'bin/tar')+':/usr/bin/tar!','/usr/local/bin/node']
name=sys.argv[1];files=sys.argv[2:];cmd=node+(['--test','--test-concurrency=1'] if all(f.endswith('.test.mts') or f.endswith('.test.mjs') for f in files) else [])+files
with (out/(name+'.txt')).open('w') as log:p=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=240)
(out/(name+'.json')).write_text(json.dumps({'command':cmd,'exitCode':p.returncode},indent=2)+'\n');print(name,p.returncode)
