import pathlib,hashlib,json,subprocess,os,time
r=pathlib.Path.cwd();e=r/'docs/review/evidence/independent-config-effect-lock-ttl-20260921';author=r/'docs/review/evidence/config-effect-lock-ttl-20260921'
files=set()
for folder in ['skills','contracts','tests','charts/kubeclaw/files/config']:
 for p in (r/folder).rglob('*'):
  if p.is_file() and 'node_modules' not in p.parts: files.add(str(p.relative_to(r)))
files.update(row['path'] for row in json.loads((author/'final-source-identities.json').read_text()))
files.update(['package.json','package-lock.json'])
def snap():return {p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in sorted(files)}
b=snap();(e/'before.json').write_text(json.dumps(b,indent=2)+'\n')
tools=r/'node_modules/.cache/native-host-tools/root';env=dict(os.environ,LD_LIBRARY_PATH=f'{tools}/usr/lib:{tools}/lib');base=[str(tools/'usr/bin/proot'),'-b',f'{tools}/usr/bin/flock:/usr/bin/flock!','/usr/local/bin/node','--import',str(e/'trace.mjs')]
jobs=[('original12-persisted-oracle',base+['--import',str(e/'persisted-oracle.mjs'),'--test','--test-concurrency=1','tests/verification/reliability/effect-lock-configuration.test.mjs','tests/verification/reliability/effect-lock-lifetime.test.mts','tests/verification/reliability/forge-lock-wait.test.mts'],{}),('original-platform',base+['tests/verification/contracts/check-plugin-system-v2-platform-config.mjs'],{}),('original-capability',base+['tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs'],{}),('original-phase7',base+['tests/verification/contracts/check-plugin-system-v2-phase7.mjs'],{})]
for mode in ['runtime','constructor']:jobs.append(('mutant-'+mode,base+['--import',str(author/'restore-fallback.mjs'),'--test','--test-name-pattern=missing and invalid TTL','tests/verification/reliability/effect-lock-configuration.test.mjs'],{'EFFECT_TTL_MUTANT':mode}))
jobs.insert(0,('fixture-preservation',['node',str(author/'check-preservation.mjs')],{}))
results=[]
for name,cmd,extra in jobs:
 with (e/f'{name}.txt').open('x') as f:p=subprocess.run(cmd,env=dict(env,**extra),stdout=f,stderr=subprocess.STDOUT)
 item=dict(name=name,command=cmd,exitCode=p.returncode)
 if name.startswith('mutant'):item['semanticRejection']=p.returncode==1 and 'Missing expected exception' in (e/f'{name}.txt').read_text()
 results.append(item);(e/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(name,p.returncode,flush=True)
a=snap();(e/'after.json').write_text(json.dumps(a,indent=2)+'\n');(e/'drift.json').write_text(json.dumps([p for p in b if b[p]!=a[p]],indent=2)+'\n')
loaded={}
for p in e.glob('loaded-*.jsonl'):
 for line in p.read_text().splitlines():
  x=json.loads(line);loaded.setdefault(x['path'],set()).add(x['sha256'])
check=[p for p,hs in loaded.items() if len(hs)!=1 or hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() not in hs]
(e/'loaded-final.json').write_text(json.dumps({p:sorted(hs) for p,hs in sorted(loaded.items())},indent=2)+'\n');(e/'loaded-drift.json').write_text(json.dumps(check,indent=2)+'\n')
