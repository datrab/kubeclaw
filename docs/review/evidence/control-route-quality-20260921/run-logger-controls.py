import pathlib,subprocess,os,json
root=pathlib.Path.cwd();ev=root/'docs/review/evidence/control-route-quality-20260921';results=[]
for mode in ['original','regressed']:
 env=os.environ.copy();env['CONTROL_LOGGER_REFERENCE']=mode;env['NODE_OPTIONS']='--import '+str(ev/'logger-control-hook.mjs');command=['node','--test','--test-name-pattern=diagnostic sink fails','skills/prism/tests/control-listener.test.mts']
 with (ev/f'logger-{mode}.txt').open('w') as out:r=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT,timeout=20)
 text=(ev/f'logger-{mode}.txt').read_text();results.append({'mode':mode,'command':command,'exitCode':r.returncode,'expected':r.returncode==0 if mode=='original' else r.returncode!=0 and ('ECONNRESET' in text or 'fetch failed' in text)})
(ev/'logger-controls.json').write_text(json.dumps(results,indent=2)+'\n');assert all(row['expected'] for row in results)
