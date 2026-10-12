from pathlib import Path
import tempfile,subprocess,json
root=Path.cwd(); out=root/'docs/review/evidence/config-discovery-readers-20260921'
with tempfile.TemporaryDirectory(prefix='config-reader-mutant-') as directory:
 private=Path(directory); (private/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
 paths=['scripts/config/environment-readers.mjs','scripts/config/tests/environment-readers.test.mjs','skills/prism/server/control-config.ts']
 for name in paths:
  p=private/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes((root/name).read_bytes())
 module=private/paths[0]; text=module.read_text(); assert text.count('!coveredByOriginal && environmentRoots')==1; module.write_text(text.replace('!coveredByOriginal && environmentRoots','coveredByOriginal && environmentRoots'))
 command=['/usr/local/bin/node','--test',str(private/paths[1])]; result=subprocess.run(command,capture_output=True,text=True,timeout=30); output=result.stdout+result.stderr
 (out/'mutant.txt').write_text(output); detected=result.returncode!=0 and 'fail 2' in output and 'pass 3' in output
 (out/'mutant-result.json').write_text(json.dumps({'command':command,'exitCode':result.returncode,'secondArgumentOmissionDetected':detected},indent=2)+'\n'); assert detected,output
