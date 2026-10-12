from pathlib import Path
import tempfile,subprocess,json
root=Path.cwd(); out=root/'docs/review/evidence/control-image-environment-independent-20260921'; before=root/'docs/review/evidence/control-image-environment-20260921'; results=[]
for name in ['retired-image-env','synthetic-proof-env']:
 with tempfile.TemporaryDirectory(prefix='control-image-mutant-') as directory:
  private=Path(directory); (private/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
  names=['docker/Dockerfile.prism-control','tests/verification/deployment/prism-swarm-image.mjs','skills/prism/tests/control-image-environment.test.mts']
  for source in names:
   target=private/source; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes((root/source).read_bytes())
  (private/'skills/prism/server').symlink_to(root/'skills/prism/server',target_is_directory=True)
  fixtures=private/'skills/prism/tests/fixtures'; fixtures.mkdir()
  for fixture in ['control-policy.mts','image-source-loader.mjs']: (fixtures/fixture).symlink_to(root/'skills/prism/tests/fixtures'/fixture)
  if name=='retired-image-env': (private/names[0]).write_bytes((before/'Dockerfile.before').read_bytes())
  else: (private/names[1]).write_bytes((before/'image-proof.before.mjs.snapshot').read_bytes())
  command=['/usr/local/bin/node','--test',str(private/names[2])]; result=subprocess.run(command,capture_output=True,text=True,timeout=30); output=result.stdout+result.stderr; (out/(name+'.txt')).write_text(output)
  expected='SWARM_CONFIG_LEGACY_OVERRIDE:ARTIFACT_ROOT' if name=='retired-image-env' else 'notStrictEqual'
  detected=result.returncode!=0 and 'fail 2' in output and 'pass 0' in output and expected in output
  results.append({'name':name,'argv':command,'exitCode':result.returncode,'detected':detected})
(out/'mutants.json').write_text(json.dumps(results,indent=2)+'\n'); assert all(result['detected'] for result in results),results
