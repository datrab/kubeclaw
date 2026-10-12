from pathlib import Path
import os,json,hashlib,stat,subprocess,time,tarfile
root=Path.cwd(); out=root/'docs/review/evidence/buster-atomic-cancellation-independent-20260921'; author=root/'docs/review/evidence/buster-atomic-cancellation-20260921';tool=root/'node_modules/.cache/native-host-tools/root'
env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
roots=['skills','contracts','scripts','tests','charts','node_modules','node_modules/.cache/native-host-tools/root']
explicit=[p for p in root.iterdir() if p.is_file() and p.suffix in ['.json','.mjs','.js','.yaml','.yml']]+[Path('/usr/local/bin/node'),Path('/usr/bin/python3').resolve(),Path(__file__).resolve(),author/'restore-split-cancel.mjs']
explicit += [Path('/bin/sh'),Path('/bin/cat'),Path('/bin/busybox'),Path('/bin/bash'),Path('/usr/bin/mkfifo'),Path('/usr/bin/git'),Path('/bin/tar'),Path('/lib/ld-musl-x86_64.so.1'),Path('/usr/lib/libstdc++.so.6'),Path('/usr/lib/libgcc_s.so.1')]
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
commands=[]
for name in ['cancellation-run2','original-shutdown-admission','original-remote-runtime','types-final','lint-final','split-path-mutant']:
 command=json.loads((author/(name+'.json')).read_text())['command'];commands.append((name,command))
results=[]
try:
 for name,command in commands:
  start=time.monotonic()
  with (out/(name+'.txt')).open('xb') as f:p=subprocess.run(command,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=180)
  row={'name':name,'command':command,'exitCode':p.returncode,'seconds':time.monotonic()-start}
  if name=='split-path-mutant':
   text=(out/(name+'.txt')).read_text();row['detected']=p.returncode!=0 and 'BUSTER_COMPACTED_JOB_TERMINAL' in text and 'a terminal winner must not cause cancellation to reject' in text
  results.append(row);(out/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(name,p.returncode,flush=True)
finally:
 after=identity();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n')
 drift=[k for k in sorted(before.keys()|after.keys()) if before.get(k)!=after.get(k)]
 (out/'result.json').write_text(json.dumps({'identityCount':len(before),'sourceDrift':drift,'results':results},indent=2)+'\n');print('DRIFT',len(drift),flush=True)
raise SystemExit(0 if not drift and len(results)==6 and all(r.get('detected',r['exitCode']==0) for r in results) else 1)
