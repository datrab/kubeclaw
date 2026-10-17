from pathlib import Path
import gzip, hashlib, json, os, tarfile
root=Path('/home/node/.openclaw/workspace/kubeclaw-config-c0')
prefix=Path('docs/review/evidence/config-acceptance/c0-completion-20261013')
out=root/'docs/review/evidence/config-acceptance/author/checkpoint-8'
def sha_file(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
entries=[]
for p in sorted((root/prefix).rglob('*')):
 if 'independent-case-phase-recheck-15' in p.parts or '__pycache__' in p.parts or p.suffix=='.pyc' or not (p.is_file() or p.is_symlink()): continue
 rel=str(p.relative_to(root))
 if p.is_symlink(): entries.append({'path':rel,'type':'symlink','target':os.readlink(p)})
 else: entries.append({'path':rel,'type':'file','bytes':p.stat().st_size,'sha256':sha_file(p)})
archive=Path('/tmp/c0-checkpoint8-evidence.tar.gz')
with archive.open('wb') as f, gzip.GzipFile(fileobj=f,mode='wb',mtime=0,compresslevel=6) as gz, tarfile.open(fileobj=gz,mode='w|') as tar:
 for e in entries: tar.add(root/e['path'],arcname=e['path'],recursive=False)
expected={e['path']:e for e in entries}; seen=set()
with tarfile.open(archive,mode='r|gz') as tar:
 for member in tar:
  assert member.name in expected and member.name not in seen, member.name
  seen.add(member.name); e=expected[member.name]
  if e['type']=='symlink': assert member.issym() and member.linkname==e['target']
  else:
   assert member.isfile() and member.size==e['bytes']
   h=hashlib.sha256(); stream=tar.extractfile(member)
   for b in iter(lambda:stream.read(1024*1024),b''):h.update(b)
   assert h.hexdigest()==e['sha256'], member.name
assert seen==set(expected)
parts=[]
with archive.open('rb') as f:
 i=0
 while True:
  b=f.read(50*1024*1024)
  if not b:break
  name=f'evidence.tar.gz.part-{i:03d}'; (out/name).write_bytes(b)
  parts.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}); i+=1
manifest={'schemaVersion':'c0-checkpoint-evidence-snapshot.v1','prefix':str(prefix),'sourceRevision':'0bcaf85d192d031814554c590b1bfca5b3ba81dd','archiveSha256':sha_file(archive),'archiveBytes':archive.stat().st_size,'parts':parts,'members':entries,'verifiedMembers':len(seen),'originalsRemoved':False,'globalC0Accepted':False}
(out/'snapshot-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ('archiveSha256','archiveBytes','verifiedMembers','parts')}))
