import pathlib,shutil,subprocess,json,os,tempfile
repo=pathlib.Path.cwd();target=pathlib.Path(tempfile.mkdtemp(prefix='native-cleanup-retry-mutant-'));(target/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
worker=target/'worker';shutil.copytree(repo/'skills/worker/core/worker',worker,dirs_exist_ok=True)
p=worker/'native-cleanup-reconciliation.ts';s=p.read_text();old='failed.operation.values.effectsDigest !== successfulCleanup.operation.values.effectsDigest';assert s.count(old)==1;s=s.replace(old,'false');p.write_text(s)
test=repo/'tests/verification/reliability/worker-native-cleanup-retry.test.mts';source=test.read_text()
import re
def redirect(m):
 value=m.group(1)
 resolved=(test.parent/value).resolve()
 if value.endswith('native-attempt-recovery.ts'):resolved=worker/'native-attempt-recovery.ts'
 return "from '"+resolved.as_uri()+"'"
source=re.sub(r"from '(\.[^']+)'",redirect,source)
probe=target/'retry.test.mts';probe.write_text(source)
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(repo/'node_modules/.cache/native-host-tools/root/usr/lib')
cmd=[str(repo/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(repo/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--test','--test-concurrency=1',str(probe)]
r=subprocess.run(cmd,env=env,capture_output=True,text=True)
out=repo/'docs/review/evidence/native-cleanup-retry-resolution-20260921';(out/'mutant.txt').write_text(r.stdout+r.stderr)
text=r.stdout+r.stderr
result={'mutation':old+' -> false','exitCode':r.returncode,'detected':r.returncode!=0 and 'wrong-effect' in text and 'Missing expected rejection' in text,'command':cmd}
(out/'mutant.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));assert result['detected']
