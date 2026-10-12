import pathlib,subprocess,tempfile,os,json,shutil,socket
root=pathlib.Path.cwd();ev=root/'docs/review/evidence/control-listener-quality-independent-20260921';results=[]
reservation=socket.socket();reservation.bind(('127.0.0.1',0));port=reservation.getsockname()[1];reservation.close()
env=os.environ.copy();env['MUTANT_CONTROL_PORT']=str(port);env['NODE_OPTIONS']='--import '+str(ev/'listener-mutant-hook.mjs')
cmd=['node','--test','--test-concurrency=1','--test-name-pattern=original production entrypoint','skills/prism/tests/control-listener.test.mts']
with (ev/'mutant-listener.txt').open('w') as out:r=subprocess.run(cmd,env=env,stdout=out,stderr=subprocess.STDOUT,timeout=45)
text=(ev/'mutant-listener.txt').read_text();results.append({'name':'fixed unrelated startup listener','command':cmd,'exitCode':r.returncode,'detected':r.returncode!=0 and 'authored listener did not serve health' in text})
with tempfile.TemporaryDirectory(prefix='control-chart-mutant-') as temporary:
 private=pathlib.Path(temporary);(private/'charts').mkdir();(private/'tests/verification/deployment').mkdir(parents=True)
 (private/'node_modules').symlink_to(root/'node_modules',target_is_directory=True);(private/'skills').symlink_to(root/'skills',target_is_directory=True);(private/'charts/kubeclaw').symlink_to(root/'charts/kubeclaw',target_is_directory=True)
 shutil.copytree(root/'charts/prism',private/'charts/prism',symlinks=False)
 target=private/'charts/prism/templates/services.yaml';source=target.read_text();assert 'targetPort: {{ $controlPort }}' in source;target.write_text(source.replace('targetPort: {{ $controlPort }}','targetPort: 8080'))
 test=private/'tests/verification/deployment/prism-swarm-config.test.mjs';shutil.copyfile(root/'tests/verification/deployment/prism-swarm-config.test.mjs',test)
 cmd=['node','--test','--test-concurrency=1','--test-name-pattern=CL chart listener',str(test)]
 with (ev/'mutant-chart.txt').open('w') as out:r=subprocess.run(cmd,stdout=out,stderr=subprocess.STDOUT,timeout=45)
 text=(ev/'mutant-chart.txt').read_text();results.append({'name':'stale Service target8080','command':cmd,'exitCode':r.returncode,'detected':r.returncode!=0 and 'targetPort: 8080' in text and '23456' in text})
(ev/'mutants.json').write_text(json.dumps(results,indent=2)+'\n');assert all(r['detected'] for r in results),results
