import ast,hashlib,json,os,runpy,stat,uuid
from pathlib import Path
R=Path.cwd(); E=R/'docs/review/evidence/buster-legacy-seal-vm-20260921/generation6'; C=R/'node_modules/.cache/buster-legacy-seal-vm-20260921/generation6'
def load(p): return json.loads(p.read_text())
def stamp(s): return (s.st_dev,s.st_ino,s.st_mode,s.st_size,s.st_nlink,s.st_uid,s.st_mtime_ns,s.st_ctime_ns)
def identity(p,hint=False):
 s=p.lstat(); assert p.resolve()==p
 if stat.S_ISDIR(s.st_mode): return {'mode':stat.S_IMODE(s.st_mode),'type':'directory'}
 assert stat.S_ISREG(s.st_mode)
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
 with os.fdopen(fd,'rb') as f:
  assert stamp(os.fstat(f.fileno()))==stamp(s)
  h=hashlib.file_digest(f,'sha256').hexdigest()
  assert stamp(os.fstat(f.fileno()))==stamp(s)==stamp(p.lstat())
  if hint:
   assert p.parent==C and p.name in ['guest-root.ext4','second.ext4'] and s.st_uid==1000 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o644
   os.posix_fadvise(f.fileno(),0,0,os.POSIX_FADV_DONTNEED)
 return {'mode':stat.S_IMODE(s.st_mode),'type':'file','bytes':s.st_size,'sha256':h}
manifest=load(E/'artifact-manifest-smaller-as.json');assert len(manifest['files'])==19
for row in manifest['files']:
 p=R/row['path']; actual=identity(p,p.parent==C and p.suffix=='.ext4')
 assert all(actual[k]==row[k] for k in ['mode','bytes','sha256']),row['path']
export=C/'repo-snapshot'; expected=load(E/'source-export-identities.json'); actual={'.':identity(export)}
for p in export.rglob('*'): actual[str(p.relative_to(export))]=identity(p)
assert actual==expected
assert {row['path']:{k:v for k,v in row.items() if k!='path'} for row in load(C/'repo-snapshot-manifest.json')}==actual
sources=load(E/'driver-source-identities.json'); assert len(sources)==7
for row in sources: assert actual[row['path']]['sha256']==row['sha256']
closure=load(export/'association-manifest.json');assert set(closure)=={'buster_legacy_stop_'+name for name in ['policy','files','runtime','transaction']}
for name,row in closure.items(): assert row['path']=='/repo/scripts/'+name+'.py' and actual['scripts/'+name+'.py']['sha256']==row['sha256']
runner=ast.parse((export/'run.py').read_text());command=ast.literal_eval(runner.body[1].value)
assert command[:2]==['/usr/bin/python3','-I'] and '--case' not in command
assert command[command.index('--association-manifest')+1]=='/repo/association-manifest.json'
assert command[command.index('--association-manifest-sha256')+1]==actual['association-manifest.json']['sha256']
assert command[command.index('--driver-sha256')+1]=='c614f05cb58f987d2e962d733724e366bf6cde760b39a3289c12c37cf833f611'
binding=runpy.run_path(str(E/'runtime-binding.py'))
tools=binding['capture'](R/'node_modules/.cache/systemd-native-vm-20260921/root');assert tools==load(E/'tool-runtime-identities.json')
payload=load(E/'guest-payload-identities.json'); root=C/'guest-root'; observed={'.':binding['identity'](root)}
for d,ds,fs in os.walk(root,followlinks=False):
 for n in ds+fs:
  p=Path(d)/n;observed[str(p.relative_to(root))]=binding['identity'](p)
assert observed==payload
build=load(E/'image-build.json');assert len(build)==2 and all(r['exitCode']==0 for r in build)
assert len({r['filesystemUuid'] for r in build})==2
for row in build:
 p=Path(row['command'][-1]);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:data=os.pread(fd,1024,1024)
 finally:os.close(fd)
 assert data[56:58]==b'\x53\xef' and str(uuid.UUID(bytes=data[104:120]))==row['filesystemUuid']
assert all(row['exitCode']==0 for row in load(E/'runtime-probes.json'))
for name in ['guest-init.sh','launch-smaller-as.py','prepare-runtime.py','runtime-binding.py']:
 assert (E.parent/'generation5'/name).read_text().replace('generation5','generation6')==(E/name).read_text()
result={'artifactsVerified':19,'exportEntriesVerified':len(actual),'productionAndFixtureSources':7,'toolEntriesVerified':len(tools['entries']),'guestPayloadEntriesVerified':len(payload),'bothExt4UuidsVerified':True,'allPreparationExitsZero':True,'sameLimits':True,'vmBootedByReviewer':False,'diskHintsOnlyExactOwnHeldDescriptors':True,'artifactManifestSha256':hashlib.sha256((E/'artifact-manifest-smaller-as.json').read_bytes()).hexdigest()}
(R/'docs/review/evidence/buster-legacy-generation6-independent-20260921/artifact-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
