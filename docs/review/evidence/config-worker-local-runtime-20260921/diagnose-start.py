import pathlib,subprocess,shutil,os,json,hashlib
r=pathlib.Path.cwd();e=r/'docs/review/evidence/config-worker-local-runtime-20260921';out=e/'start-diagnosis';out.mkdir(exist_ok=False)
native=r/'node_modules/.cache/native-host-tools/root';sandbox=r/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox';node=shutil.which('node')
base=[str(native/'usr/bin/proot'),'-b',f'{native}/usr/bin/flock:/usr/bin/flock!','-b',f'{native}/bin/tar:/usr/bin/tar!']
commands=[('direct-page',[str(sandbox),'--page-size']),('proot-page',base+[str(sandbox),'--page-size']),('direct-node',[str(sandbox),'536870912','10','64',node,'--max-old-space-size=358','-e','console.log("started")']),('proot-node',base+[str(sandbox),'536870912','10','64',node,'--max-old-space-size=358','-e','console.log("started")']),('original-provider',base+[node,'tests/verification/contracts/check-pipeline-remote-real-provider.mts'])]
results=[]
for name,command in commands:
 print('START '+name,flush=True)
 with (out/(name+'.txt')).open('w') as f:
  try:p=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,env=dict(os.environ,LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib'),timeout=90);code=p.returncode
  except subprocess.TimeoutExpired:code=124
 results.append({'name':name,'command':command,'exitCode':code});print(name+' '+str(code),flush=True)
(out/'result.json').write_text(json.dumps({'results':results,'identities':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [sandbox,sandbox.with_name('sandbox.c'),pathlib.Path(node)]}},indent=2)+'\n')
