import hashlib,json,os,pathlib,stat,subprocess
base=pathlib.Path('docs/review/evidence/buster-legacy-python-20260921'); cache=pathlib.Path('node_modules/.cache/buster-legacy-python-20260921'); root=(cache/'runtime').resolve()
hashfile=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks=[]
for row in json.loads((base/'download.json').read_text())['archives']:
 p=cache/'packages'/row['name']; assert p.stat().st_size==row['bytes'] and hashfile(p)==row['sha256']
 result=subprocess.run(['apk','verify',str(p)],capture_output=True,text=True); assert result.returncode==0
 checks.append(dict(name=row['name'],exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr))
expected=json.loads((base/'runtime-identities.json').read_text()); actual=[]
for directory,dirs,files in os.walk(root,followlinks=False):
 for name in dirs+files:
  p=pathlib.Path(directory)/name; st=p.lstat(); row=dict(path=str(p.relative_to(root)),mode=oct(stat.S_IMODE(st.st_mode)))
  if p.is_symlink():
   row.update(type='symlink',target=os.readlink(p)); assert p.resolve().is_relative_to(root),str(p)
  elif p.is_dir(): row['type']='directory'
  else:
   assert stat.S_ISREG(st.st_mode); row.update(type='file',bytes=st.st_size,sha256=hashfile(p))
  actual.append(row)
assert sorted(actual,key=lambda r:r['path'])==sorted(expected,key=lambda r:r['path'])
for key in json.loads((base/'trusted-public-keys.json').read_text()): assert hashfile(pathlib.Path(key['path']))==key['sha256']
probe=json.loads((base/'runtime-probe.json').read_text()); result=subprocess.run(probe['command'],capture_output=True,text=True); assert result.returncode==0
value=json.loads(result.stdout); assert value['prefix']==str(root/'usr') and value['fcntl'].startswith(str(root)) and value['ctypes'].startswith(str(root))
output=dict(signatures=checks,entryCount=len(actual),regularBytes=sum(r.get('bytes',0) for r in actual),symlinks=sum(r['type']=='symlink' for r in actual),manifestMatches=True,allLinksContained=True,probe=dict(command=probe['command'],exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr))
pathlib.Path('docs/review/evidence/buster-legacy-python-independent-20260921/result.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({k:v for k,v in output.items() if k not in ['signatures','probe']}))
