import pathlib,json,hashlib,os,subprocess,time,signal,selectors
repo=pathlib.Path.cwd(); evidence=repo/'docs/review/evidence/native-node-pools-environment-matrix-20260921'
matrix=json.loads((evidence/'module-matrix.json').read_text())
modules=[r['path'] for r in matrix['modules'] if r['environment']=='native-host-node-with-real-GNU-flock']
assert len(modules)==9 and os.geteuid()==1000
for row in matrix['modules']:
 assert hashlib.sha256((repo/row['path']).read_bytes()).hexdigest()==row['sha256']
roots=['skills/worker/core','contracts','skills/common/plugin-runtime/foundation/observability','node_modules/ajv/dist']
files={repo/name for name in modules+['package.json','package-lock.json','skills/prism/engine/worker-envelope.ts','skills/prism/tests/native/resource-policy.mts']}
for root in roots:
 for directory,dirs,names in os.walk(repo/root):
  dirs[:]=[d for d in dirs if d not in ['node_modules','.cache','dist'] or pathlib.Path(directory)==repo/'node_modules/ajv']
  for name in names:
   p=pathlib.Path(directory)/name
   if p.suffix in ['.ts','.mts','.js','.mjs','.json','.c','.h','.go']:files.add(p)
for pattern in ['tests/verification/reliability/native-*','tests/verification/reliability/worker-*','tests/fixtures/worker-*']:
 files.update(p for p in repo.glob(pattern) if p.is_file())
identity=lambda:{str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
before=identity();(evidence/'host-source-identities.json').write_text(json.dumps(before,indent=2)+'\n')
tools=repo/'node_modules/.cache/native-host-tools/root'
command=[str(tools/'usr/bin/proot'),'-b',str(tools/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--test',*modules]
environment=dict(os.environ,LD_LIBRARY_PATH=str(tools/'usr/lib')+':'+str(tools/'lib'))
versions=[]
for args in [['/usr/local/bin/node','--version'],[str(tools/'usr/bin/flock'),'--version']]:
 p=subprocess.run(args,env=environment,capture_output=True,text=True);assert p.returncode==0;versions.append({'command':args,'stdout':p.stdout})
start=time.monotonic();reason=None;outputBytes=0
with (evidence/'host-tests.txt').open('xb') as output:
 process=subprocess.Popen(command,env=environment,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
 selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
 while process.poll() is None:
  for key,mask in selector.select(timeout=.25):
   chunk=os.read(key.fd,65536);output.write(chunk);output.flush();outputBytes+=len(chunk)
  if time.monotonic()-start>180:reason='outer 180-second process watchdog'
  if outputBytes>8*1024**2:reason='8-MiB console bound'
  if reason:os.killpg(process.pid,signal.SIGKILL);break
 code=process.wait()
 while chunk:=process.stdout.read(65536):output.write(chunk);outputBytes+=len(chunk)
 selector.close()
after=identity();drift=[name for name,digest in before.items() if after.get(name)!=digest]
result={'command':command,'versions':versions,'exitCode':code,'elapsedSeconds':time.monotonic()-start,'stoppedReason':reason,'sourceDrift':drift,'sourceFiles':len(before),'effectiveUid':os.geteuid(),'kernelRootProof':False}
(evidence/'host-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));raise SystemExit(0 if code==0 and reason is None and not drift else 1)
