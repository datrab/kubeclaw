exec(open('docs/review/evidence/independent-config-effect-lock-ttl-20260921/run.py').read().split('b=snap();')[0])
files.update(str(p.relative_to(r)) for p in e.glob('*.mjs'));b=snap();(e/'followup-before.json').write_text(json.dumps(b,indent=2)+'\n')
tools=r/'node_modules/.cache/native-host-tools/root';env=dict(os.environ,LD_LIBRARY_PATH=f'{tools}/usr/lib:{tools}/lib');cmd=[str(tools/'usr/bin/proot'),'-b',f'{tools}/usr/bin/flock:/usr/bin/flock!','/usr/local/bin/node','--import',str(e/'trace.mjs'),'--import',str(e/'persisted-oracle.mjs'),'--test','--test-concurrency=1','tests/verification/reliability/effect-lock-configuration.test.mjs']
with (e/'followup.txt').open('x') as f:p=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
a=snap();(e/'followup-after.json').write_text(json.dumps(a,indent=2)+'\n');(e/'followup-results.json').write_text(json.dumps({'command':cmd,'exitCode':p.returncode,'drift':[p for p in b if b[p]!=a[p]]},indent=2)+'\n');print(p.returncode,flush=True)
