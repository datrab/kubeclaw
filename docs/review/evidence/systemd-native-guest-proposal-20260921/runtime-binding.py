import os,pathlib,stat,hashlib,json

def identity(p):
 s=p.lstat(); row={'mode':stat.S_IMODE(s.st_mode)}
 if p.is_symlink():row.update(type='symlink',target=os.readlink(p))
 elif p.is_dir():row['type']='directory'
 elif p.is_file():
  with p.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
  row.update(type='file',bytes=s.st_size,sha256=h)
 else:raise RuntimeError('Unsupported runtime entry: '+str(p))
 return row

def capture(root):
 root=root.resolve(); rows={'.':identity(root)};external={}
 for d,ds,fs in os.walk(root,followlinks=False):
  for n in ds+fs:
   p=pathlib.Path(d)/n;rows[str(p.relative_to(root))]=identity(p)
   if p.is_symlink() and not p.resolve(strict=False).is_relative_to(root):external[str(p.resolve(strict=False))]=None
 external[str(pathlib.Path('/lib/ld-musl-x86_64.so.1').resolve())]=None
 for name in list(external):
  p=pathlib.Path(name)
  if not p.exists():external[name]={'type':'missing'};continue
  external[name]=identity(p)
  if p.is_dir():
   for d,ds,fs in os.walk(p,followlinks=False):
    for n in ds+fs:
     f=pathlib.Path(d)/n;external[str(f)]=identity(f)
     if f.is_symlink() and f.resolve().is_file():external[str(f.resolve())]=identity(f.resolve())
 return {'resolvedRoot':str(root),'entries':rows,'externalReferents':external}

if __name__=='__main__':
 p=pathlib.Path('docs/review/evidence/systemd-native-guest-proposal-20260921')
 root=pathlib.Path('node_modules/.cache/systemd-native-vm-20260921/root')
 (p/'tool-runtime-identities.json').write_text(json.dumps(capture(root),indent=2)+'\n')
