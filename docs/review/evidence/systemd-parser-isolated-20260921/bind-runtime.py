from pathlib import Path
import os,hashlib,json,stat
c=Path('node_modules/.cache/systemd-parser-20260921').resolve();e=Path('docs/review/evidence/systemd-parser-isolated-20260921');rows=[]
for rootname in ['runtime','verifier']:
 root=c/rootname
 for directory,dirs,files in os.walk(root,followlinks=False):
  for name in dirs+files:
   p=Path(directory)/name;s=p.lstat();r={'path':str(p.relative_to(c)),'mode':oct(stat.S_IMODE(s.st_mode))}
   if p.is_symlink():
    r.update(type='symlink',target=os.readlink(p));assert p.resolve(strict=False).is_relative_to(root),str(p)
   elif p.is_dir():r['type']='directory'
   elif p.is_file():r.update(type='file',bytes=s.st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
   else:raise RuntimeError(str(p))
   rows.append(r)
(e/'runtime-entry-identities.json').write_text(json.dumps(rows,indent=2)+'\n')
paths=['scripts/render-native-worker-node.mjs','scripts/native-worker-node-policy.mjs','my-values/infra/native-worker-pools.yaml','tests/verification/deployment/native-worker-node.test.mjs']
(e/'probe-source-identities.json').write_text(json.dumps([{'path':f,'sha256':hashlib.sha256(Path(f).read_bytes()).hexdigest()} for f in paths],indent=2)+'\n')
print(len(rows),'runtime entries; all symlinks contained')
