import hashlib,json,os,subprocess,tarfile,tempfile
from pathlib import Path,PurePosixPath
root=Path.cwd(); evidence=root/'docs/review/evidence/independent-buster-strace-20260921'
author=root/'docs/review/evidence/buster-legacy-strace-20260921'; cache=root/'node_modules/.cache/buster-legacy-strace-20260921'; runtime=cache/'runtime'
sha=lambda b:hashlib.sha256(b).hexdigest()
commands=[]
def run(args):
 p=subprocess.run([str(x) for x in args],capture_output=True,text=True,timeout=30)
 commands.append(dict(command=[str(x) for x in args],exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr));return p
archives=json.loads((author/'archives.json').read_text());compressed=regular=0;providers={};dependencies=[];payload={}
for a in archives['archives']:
 p=cache/'packages'/a['url'].rsplit('/',1)[1]; raw=p.read_bytes()
 assert sha(raw)==a['sha256'] and len(raw)==a['bytes'];compressed+=len(raw)
 assert run(['apk','verify',p]).returncode==0
 with tarfile.open(p,'r:gz',ignore_zeros=True) as t:
  metadata=t.extractfile('.PKGINFO').read().decode(); fields={}
  for line in metadata.splitlines():
   if ' = ' in line:
    k,v=line.split(' = ',1);fields.setdefault(k,[]).append(v)
  providers[fields['pkgname'][0]]=fields['pkgver'][0]
  for v in fields.get('provides',[]):
   k,_,version=v.partition('=');providers[k]=version
  dependencies.extend(fields.get('depend',[]))
  for member in t:
   name=PurePosixPath(member.name);assert not name.is_absolute() and '..' not in name.parts
   assert member.isdir() or member.isfile() or member.issym()
   if member.isfile():regular+=member.size
   if member.name.startswith('.'):continue
   target=runtime/name
   if member.isfile():assert sha(t.extractfile(member).read())==sha(target.read_bytes());payload[str(name)]=member.size
   if member.issym():
    assert not PurePosixPath(member.linkname).is_absolute()
    assert target.is_symlink() and os.readlink(target)==member.linkname and target.resolve().is_relative_to(runtime)
for d in dependencies:
 name,separator,version=d.partition('=');assert name in providers
 if separator:assert providers[name]==version
assert compressed==archives['compressedBytes']==1781557
assert regular==archives['headerRegularBytes']==3811248
manifest=json.loads((author/'runtime-identities.json').read_text());actual=[]
for directory,children,names in os.walk(runtime,followlinks=False):
 for name in sorted(children+names):
  f=Path(directory)/name; item={'path':str(f.relative_to(runtime)),'mode':f.lstat().st_mode&0o7777}
  if f.is_symlink():assert f.resolve().is_relative_to(runtime);item.update(type='symlink',target=os.readlink(f))
  elif f.is_file():item.update(type='file',bytes=f.stat().st_size,sha256=sha(f.read_bytes()))
  else:assert f.is_dir();item.update(type='directory')
  actual.append(item)
assert sorted(actual,key=lambda x:x['path'])==sorted(manifest,key=lambda x:x['path']) and len(actual)==22
probe=run([runtime/'lib/ld-musl-x86_64.so.1','--library-path',str(runtime/'lib')+':'+str(runtime/'usr/lib'),runtime/'usr/bin/strace','-V'])
assert probe.returncode==0 and 'version 6.19' in probe.stdout
with tempfile.TemporaryDirectory(prefix='strace-signature-negative-') as temporary:
 original=(cache/'packages/strace-6.19-r1.apk').read_bytes(); damaged=bytearray(original);damaged[-100]^=1
 p=Path(temporary)/'strace-corrupt.apk';p.write_bytes(damaged);assert run(['apk','verify',p]).returncode!=0
(evidence/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
identities={str(p.relative_to(root)):sha(p.read_bytes()) for p in [author/n for n in ['prepare.py','archives.json','commands.json','runtime-identities.json']]}
(evidence/'result.json').write_text(json.dumps(dict(packages=len(archives['archives']),compressedBytes=compressed,headerRegularBytes=regular,runtimeEntries=len(actual),payloadFiles=len(payload),dependencyClosure=dependencies,sourceIdentities=identities,status='bounded prerequisite accepted; no tracing or guest execution'),indent=2)+'\n')
print('PASS: 9 signed APKs, exact dependency closure/payload/22 manifest entries, private strace6.19 -V, corrupted APK rejected')
