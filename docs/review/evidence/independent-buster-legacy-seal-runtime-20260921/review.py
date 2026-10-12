import hashlib,json,os,stat,subprocess
from pathlib import Path
repo=Path.cwd(); evidence=repo/'docs/review/evidence/buster-legacy-seal-vm-20260921'; out=repo/'docs/review/evidence/independent-buster-legacy-seal-runtime-20260921'; guest=repo/'node_modules/.cache/buster-legacy-seal-vm-20260921/guest-root'
def identity(p):
 st=p.lstat();row={'mode':stat.S_IMODE(st.st_mode)}
 if stat.S_ISLNK(st.st_mode):row.update(type='symlink',target=os.readlink(p));assert p.resolve().is_relative_to(guest)
 elif stat.S_ISDIR(st.st_mode):row.update(type='directory')
 else:
  assert stat.S_ISREG(st.st_mode) and st.st_nlink==1
  row.update(type='file',bytes=st.st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
 return row
expected=json.loads((evidence/'runtime-identities.json').read_text())
def scan():
 actual={'.':identity(guest)}
 for parent,dirs,files in os.walk(guest,followlinks=False):
  for name in dirs+files:
   p=Path(parent)/name;actual[str(p.relative_to(guest))]=identity(p)
 assert actual==expected
 return actual
actual=scan();sources=json.loads((evidence/'runtime-sources.json').read_text())
for row in sources:
 p=repo/row['source'];name=row['source'].split('/runtime/',1)[-1] if '/runtime/' in row['source'] else row['source'].split('/root/',1)[1]
 st=p.lstat();want={k:v for k,v in row.items() if k!='source'};assert actual[name]==want
 assert stat.S_IMODE(st.st_mode)==row['mode']
 if row['type']=='symlink':assert stat.S_ISLNK(st.st_mode) and os.readlink(p)==row['target']
 if row['type']=='directory':assert stat.S_ISDIR(st.st_mode)
 if row['type']=='file':
  assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
  assert (st.st_dev,st.st_ino)!=( (guest/name).stat().st_dev,(guest/name).stat().st_ino)
loader=guest/'lib/ld-musl-x86_64.so.1';prefix=[str(loader),'--library-path',str(guest/'lib')+':'+str(guest/'usr/lib')];results=[]
program="import sys,ctypes,fcntl,json; from pathlib import Path; print(json.dumps({'prefix':sys.prefix,'fcntl':fcntl.__file__,'ctypes':ctypes.__file__,'maps':[line.split()[-1] for line in Path('/proc/self/maps').read_text().splitlines() if '/' in line]}))"
for executable,args in [('usr/bin/python3',['-I','-B','-c',program]),('usr/bin/strace',['-V']),('usr/bin/unshare',['--help']),('bin/busybox',['mount','--help'])]:
 cmd=prefix+[str(guest/executable)]+args;r=subprocess.run(cmd,capture_output=True,text=True,timeout=10);assert r.returncode==0
 results.append({'command':cmd,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 if executable=='usr/bin/python3':
  probe=json.loads(r.stdout);assert Path(probe['prefix']).is_relative_to(guest)
  assert all(Path(probe[key]).is_relative_to(guest) for key in ('fcntl','ctypes'))
  assert all(Path(p).is_relative_to(guest) for p in probe['maps'])
# Resolve every copied ELF's DT_NEEDED set via its actual private musl loader.
closure=[]
for name,row in actual.items():
 if row['type']!='file':continue
 file=guest/name
 with file.open('rb') as stream:magic=stream.read(4)
 if magic!=b'\x7fELF':continue
 cmd=prefix+['--list',str(file)];r=subprocess.run(cmd,capture_output=True,text=True,timeout=10)
 # Python extension symbols are supplied by the interpreter; --list only must
 # resolve library paths, and unresolved Python symbols are retained separately.
 paths=[]
 for line in r.stdout.splitlines():
  if ' => ' in line:
   target=line.split(' => ',1)[1].split(' (',1)[0].strip()
   if target.startswith('/'):
    assert Path(target).is_relative_to(guest) or target=='/lib/ld-musl-x86_64.so.1'
    paths.append(target)
 assert 'Error loading shared library' not in r.stderr
 closure.append({'path':name,'exitCode':r.returncode,'resolvedPaths':paths,'stderr':r.stderr})
scan()
(out/'probes.json').write_text(json.dumps(results,indent=2)+'\n');(out/'elf-closure.json').write_text(json.dumps(closure,indent=2)+'\n')
result={'entries':len(actual),'regularBytes':sum(row.get('bytes',0) for row in actual.values()),'links':sum(row['type']=='symlink' for row in actual.values()),'sourceRows':len(sources),'elfFiles':len(closure),'fullPrePostMatch':True,'independentCopies':True,'noRegularHardlinks':True,'uid':os.getuid(),'privilegedActions':False}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
