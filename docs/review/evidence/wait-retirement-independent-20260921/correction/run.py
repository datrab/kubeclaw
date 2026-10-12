from pathlib import Path
import os,json,hashlib,stat,subprocess,time,tarfile
root=Path.cwd(); out=root/'docs/review/evidence/wait-retirement-independent-20260921/correction'; author=root/'docs/review/evidence/wait-value-retirement-20260921';tool=root/'node_modules/.cache/native-host-tools/root'
env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
roots=['skills','contracts','scripts','tests','charts','node_modules','node_modules/.cache/native-host-tools/root']
explicit=[p for p in root.iterdir() if p.is_file() and p.suffix in ['.json','.mjs','.js','.yaml','.yml']]+[Path('/usr/local/bin/node'),Path('/usr/bin/python3').resolve(),Path(__file__).resolve(),out/'counterprobes.mjs',author/'mutant.mjs',author/'run-final-checks.py']
explicit += [Path('/bin/sh'),Path('/bin/cat'),Path('/bin/busybox'),Path('/bin/bash'),Path('/usr/bin/mkfifo'),Path('/usr/bin/git'),Path('/bin/tar'),Path('/lib/ld-musl-x86_64.so.1'),Path('/usr/lib/libstdc++.so.6'),Path('/usr/lib/libgcc_s.so.1'),author/'independent-commands.json']
def identity():
 paths=set(explicit)
 for name in roots:
  base=root/name; paths.add(base)
  for directory,dirs,names in os.walk(base,followlinks=False):
   dirs[:]=[d for d in dirs if d not in ['.git','.cache']]
   paths.update(Path(directory)/n for n in dirs+names)
 # Bind every symlink referent too, including external runtime referents.
 for p in list(paths):
  if p.is_symlink() and p.resolve().is_file(): paths.add(p.resolve())
 result={}
 for p in sorted(paths):
  s=p.lstat(); row={'mode':oct(stat.S_IMODE(s.st_mode))}
  if stat.S_ISLNK(s.st_mode): row.update(type='symlink',target=os.readlink(p))
  elif stat.S_ISDIR(s.st_mode):row.update(type='directory')
  elif stat.S_ISREG(s.st_mode):
   h=hashlib.sha256()
   with p.open('rb') as f:
    while chunk:=f.read(1024*1024):h.update(chunk)
   row.update(type='file',size=s.st_size,sha256=h.hexdigest())
  else:raise RuntimeError('Unexpected entry '+str(p))
  result[str(p.relative_to(root)) if p.is_relative_to(root) else str(p)]=row
 return result
before=identity();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n')
with tarfile.open(out/'source-before.tar.gz','x:gz') as archive:
 for name in roots[:5]:archive.add(root/name,arcname=name)
 for p in explicit:
  if p.is_relative_to(root):archive.add(p,arcname=str(p.relative_to(root)))
with (out/'tracked-before.patch').open('xb') as f:subprocess.run(['git','diff','--binary','HEAD','--',*roots[:5],'package.json','package-lock.json'],stdout=f,check=True)
files=[row['path'] for row in json.loads((author/'tests-run5-identities.json').read_text())]
commands=[('original-wait-live',node+['tests/live-function.test.ts'],root/'skills/common/plugins/wait-store'),('original-wait-boundary',node+['tests/package-boundary.test.mjs'],root/'skills/common/plugins/wait-store'),('original-operator-and-wait',node+['--test','--test-concurrency=1',str(out/'counterprobes.mjs'),'tests/verification/reliability/wait-resolver-audience.test.mjs','tests/verification/reliability/operator-request-projection.test.mjs','tests/verification/reliability/operator-projection-independent.test.mjs'],root),('foundation-types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','skills/common/plugin-runtime/tsconfig.json'],root)]
commands.append(('original-blob-and-foundation',node+['--test','--test-concurrency=1','tests/verification/reliability/blob-budget.test.mts','tests/verification/reliability/blob-read-boundary.test.mjs','tests/verification/reliability/blob-read-independent.test.mjs','tests/verification/reliability/record-transition-authority-independent.test.mjs','tests/verification/reliability/record-fenced-read-independent.test.mjs','tests/verification/reliability/record-retained-transition.test.mjs'],root))
commands.append(('original-durable-cutover',node+['tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs'],root))
commands.append(('nova-types',['node','node_modules/typescript/bin/tsc','--noEmit','-p','skills/nova/tsconfig.json'],root))
lintfiles=[file for file in files if file.endswith(('.ts','.mjs')) and not file.startswith('tests/') and file not in ['skills/common/plugin-runtime/foundation/config/swarm.ts','skills/nova/core/state/read-run-evidence.ts'] and '/tests/' not in file]
commands.append(('scoped-lint',['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs',*dict.fromkeys(lintfiles)],root))
commands = []
commands.append(('corrected-counterprobes', node+['--test','--test-name-pattern=corrected independent: validly hashed',str(out/'counterprobes.mjs')],root))
results=[]
try:
 for name,command,cwd in commands:
  started=time.monotonic()
  with (out/(name+'.txt')).open('xb') as log:
   process=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=480)
  results.append({'name':name,'command':command,'cwd':str(cwd),'exitCode':process.returncode,'seconds':time.monotonic()-started})
  (out/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(name,process.returncode,flush=True)
  if process.returncode:break
 if all(r['exitCode']==0 for r in results):
  for mode,pattern,diagnostic in [('events-prefix','retained original prefix mutation','Missing expected rejection'),('receipt-authority','wrong source/receipt identities','Missing expected rejection'),('original-wait-digest','existing operator projection receipt','OPERATOR_PROJECTION_AUTHORITY_REQUIRED'),('selected-audience','Core exposes retained','Expected values to be strictly equal')]:
   command=node+['--import',str(author/'mutant.mjs'),'--test','--test-concurrency=1','--test-name-pattern='+pattern,('tests/verification/reliability/wait-resolver-audience.test.mjs' if mode=='selected-audience' else 'tests/verification/reliability/wait-value-projection.test.mjs')]
   logfile=out/('mutant-'+mode+'.txt')
   with logfile.open('xb') as log:process=subprocess.run(command,env=dict(env,WAIT_PROJECTION_MUTANT=mode),stdout=log,stderr=subprocess.STDOUT,timeout=120)
   text=logfile.read_text();detected=process.returncode!=0 and 'SEMANTIC_MUTANT_APPLIED:'+mode in text and diagnostic in text
   results.append({'name':'mutant-'+mode,'command':command,'exitCode':process.returncode,'semanticFailureDetected':detected,'expectedDiagnostic':diagnostic})
   (out/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(mode,detected,flush=True)
   if not detected:break
finally:
 after=identity();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n')
 drift=[k for k in sorted(before.keys()|after.keys()) if before.get(k)!=after.get(k)]
 (out/'result.json').write_text(json.dumps({'sourceDrift':drift,'identityCount':len(before),'results':results},indent=2)+'\n')
 print('DRIFT',len(drift),flush=True)
raise SystemExit(0 if not drift and len(results)==5 and all(r.get('semanticFailureDetected',r['exitCode']==0) for r in results) else 1)
