import pathlib,tempfile,subprocess,shutil,json
root=pathlib.Path.cwd();ev=root/'docs/review/evidence/config-control-listener-20260921'
with tempfile.TemporaryDirectory(prefix='control-image-mutant-') as temporary:
 private=pathlib.Path(temporary);(private/'skills/prism/tests').mkdir(parents=True);(private/'docker').mkdir();(private/'tests/verification/deployment').mkdir(parents=True)
 for relative in ['node_modules','skills/prism/server','skills/prism/tests/fixtures']:(private/relative).symlink_to(root/relative,target_is_directory=True)
 for relative in ['skills/prism/tests/control-image-environment.test.mts','tests/verification/deployment/prism-swarm-image.mjs']:shutil.copyfile(root/relative,private/relative)
 original=(root/'docker/Dockerfile.prism-control').read_text();assert 'ENV NODE_ENV=production\n' in original;(private/'docker/Dockerfile.prism-control').write_text(original.replace('ENV NODE_ENV=production\n','ENV NODE_ENV=production PORT=8080\n'))
 command=['node','--test','--test-name-pattern=actual Control image declarations',str(private/'skills/prism/tests/control-image-environment.test.mts')]
 with (ev/'mutant-image.txt').open('w') as out:r=subprocess.run(command,stdout=out,stderr=subprocess.STDOUT,timeout=30)
 text=(ev/'mutant-image.txt').read_text();detected=r.returncode!=0 and 'SWARM_CONFIG_LEGACY_OVERRIDE:PORT' in text
 (ev/'mutant-image.json').write_text(json.dumps({'command':command,'exitCode':r.returncode,'detected':detected,'scope':'private old Dockerfile ENV parsed by unchanged original image-boundary test; no Docker execution'},indent=2)+'\n');assert detected
