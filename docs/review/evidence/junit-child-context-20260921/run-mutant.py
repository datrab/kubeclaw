from pathlib import Path
import os,subprocess,tempfile,json
r=Path.cwd(); e=r/'docs/review/evidence/junit-child-context-20260921'; original=r/'tests/verification/contracts/check-junit-executed-required.mts'
source=original.read_text(); target=', { env: childEnvironment });'; assert source.count(target)==1
fd,name=tempfile.mkstemp(prefix='.junit-context-mutant-',suffix='.mts',dir=original.parent); os.close(fd); mutant=Path(name)
try:
 mutant.write_text(source.replace(target,');'))
 env=os.environ.copy(); env['LD_LIBRARY_PATH']=str(r/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(r/'node_modules/.cache/native-host-tools/root/lib')
 cmd=[str(r/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(r/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--test',str(mutant)]
 result=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=30); output=result.stdout+result.stderr; (e/'mutant.txt').write_text(output)
 detected=result.returncode!=0 and 'ENOENT' in output and 'all-skipped.xml' in output and 'fail 1' in output
 (e/'mutant-result.json').write_text(json.dumps({'argv':cmd,'exitCode':result.returncode,'detectedMissingRealReporterOutput':detected},indent=2)+'\n'); assert detected,output
finally: mutant.unlink()
