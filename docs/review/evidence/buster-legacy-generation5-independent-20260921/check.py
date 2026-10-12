import pathlib,json,hashlib,stat,os,runpy,subprocess,gzip
R=pathlib.Path.cwd(); E=R/'docs/review/evidence/buster-legacy-seal-vm-20260921/generation5'; O=R/'docs/review/evidence/buster-legacy-generation5-independent-20260921'; C=R/'node_modules/.cache/buster-legacy-seal-vm-20260921/generation5'; T=R/'node_modules/.cache/systemd-native-vm-20260921/root'
def sha(p):
 if p not in diskHashes:
  with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
 with os.fdopen(fd,'rb') as f:
  before=os.fstat(fd); expected=diskHashes[p]
  stamp=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  assert p.resolve()==p and stat.S_ISREG(before.st_mode) and before.st_uid==1000 and before.st_nlink==1
  assert stat.S_IMODE(before.st_mode)==expected['mode'] and before.st_size==expected['bytes']
  digest=hashlib.file_digest(f,'sha256').hexdigest();assert digest==expected['sha256']
  assert stamp(os.fstat(fd))==stamp(before)==stamp(p.lstat())
  os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)
  assert stamp(os.fstat(fd))==stamp(before)==stamp(p.lstat())
  return digest
manifest=json.loads((E/'artifact-manifest-smaller-as.json').read_text()); checked=[]; diskHashes={R/r['path']:r for r in manifest['files'] if r['path'].endswith('.ext4')}; assert set(diskHashes)=={C/'guest-root.ext4',C/'second.ext4'}
for row in manifest['files']:
 p=R/row['path']; s=p.lstat(); assert stat.S_ISREG(s.st_mode); assert s.st_size==row['bytes'] and stat.S_IMODE(s.st_mode)==row['mode'] and sha(p)==row['sha256']; checked.append(row['path'])
binding=runpy.run_path(str(E/'runtime-binding.py')); assert binding['capture'](T)==json.loads((E/'tool-runtime-identities.json').read_text())
for dirname,manifestname in [('repo-snapshot','source-export-identities.json'),('guest-root','guest-payload-identities.json')]:
 base=C/dirname; expected=json.loads((E/manifestname).read_text()); actual={'.':None}
 for directory,dirs,files in os.walk(base,followlinks=False):
  for n in dirs+files: actual[str((pathlib.Path(directory)/n).relative_to(base))]=None
 assert set(actual)==set(expected)
 for rel,row in expected.items():
  p=base/rel;s=p.lstat();assert stat.S_IMODE(s.st_mode)==row['mode']
  if row['type']=='file': assert stat.S_ISREG(s.st_mode) and s.st_size==row['bytes'] and sha(p)==row['sha256']
  elif row['type']=='directory': assert stat.S_ISDIR(s.st_mode)
  else:
   assert stat.S_ISLNK(s.st_mode) and os.readlink(p)==row.get('symlink',row.get('target'))
for rel in ['scripts/buster-legacy-store-verify.py','tests/fixtures/test-gate/legacy-seal-guest.py','tests/fixtures/test-gate/legacy-seal-capabilities.py']:
 assert sha(C/'repo-snapshot'/rel)==sha(R/rel); assert (C/'repo-snapshot'/rel).stat().st_ino!=(R/rel).stat().st_ino
b=gzip.decompress((C/'initrd.cpio.gz').read_bytes()); pos=0; init=None; names=[]
while pos+110<=len(b):
 h=b[pos:pos+110]; assert h[:6] in (b'070701',b'070702'); size=int(h[54:62],16); ns=int(h[94:102],16); name=b[pos+110:pos+110+ns-1].decode(); d=(pos+110+ns+3)&~3; names.append(name)
 if name=='init': init=b[d:d+size].decode()
 pos=(d+size+3)&~3
 if name=='TRAILER!!!': break
assert init and 'switch_root /newroot /guest-init' in init
(O/'initrd-init.txt').write_text(init)
import uuid,struct
commands=[]
for disk, row in zip(['guest-root.ext4','second.ext4'],json.loads((E/'image-build.json').read_text())):
 with (C/disk).open('rb') as f: f.seek(1024); sb=f.read(1024)
 assert struct.unpack_from('<H',sb,56)[0]==0xef53
 actualUuid=str(uuid.UUID(bytes=sb[104:120])); assert actualUuid==row['filesystemUuid']
 commands.append({'disk':disk,'superblockUuid':actualUuid,'logicalBytes':(C/disk).stat().st_size})
assert commands[0]['superblockUuid']!=commands[1]['superblockUuid']
p=subprocess.run(['python3',str(E/'launch-smaller-as.py')],capture_output=True,text=True,timeout=10); assert p.returncode==0; assert json.loads(p.stdout)==json.loads((E/'launch-command-smaller-as.json').read_text())
result={'artifactCount':len(checked),'artifacts':checked,'toolClosureEqual':True,'payloadAndExportExact':True,'originalThreeSourcesEqualIndependentInodes':True,'initrdModules': [n for n in names if n.endswith('.ko')],'readOnlyImageProbes':commands,'diskInitInspection':'Unavailable: cached dumpe2fs/debugfs absent; mke2fs -d evidence and exact preimage manifest inspected, no mount performed.','concreteCommandExact':True,'vmBooted':False,'artifactManifestSha256':sha(E/'artifact-manifest-smaller-as.json')};(O/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
