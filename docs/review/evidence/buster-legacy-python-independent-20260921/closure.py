import json,pathlib,re,subprocess,tarfile
cache=pathlib.Path('node_modules/.cache/buster-legacy-python-20260921'); packages=[]; provided={}
for p in sorted((cache/'packages').glob('*.apk')):
 with tarfile.open(p) as archive: text=archive.extractfile('.PKGINFO').read().decode()
 fields={}
 for line in text.splitlines():
  if ' = ' in line:
   k,v=line.split(' = ',1); fields.setdefault(k,[]).append(v)
 name=fields['pkgname'][0]; version=fields['pkgver'][0]; provided[name]=version
 for value in fields.get('provides',[]):
  k,_,v=value.partition('='); provided[k]=v
 packages.append(dict(name=name,version=version,dependencies=fields.get('depend',[])))
checked=[]
for package in packages:
 for dep in package['dependencies']:
  match=re.fullmatch(r'([^<>=~]+)([<>=~]+)?(.*)',dep); name,op,version=match.groups(); assert name in provided,(package,dep)
  if op:
   result=subprocess.run(['apk','version','--test',provided[name],version],capture_output=True,text=True); assert result.returncode==0
   assert result.stdout.strip() in {'=':['='],'>=':['>','='],'>':['>'],'<=':['<','='],'<':['<']}[op],dep
  checked.append(dict(package=package['name'],dependency=dep,resolvedVersion=provided[name]))
pathlib.Path('docs/review/evidence/buster-legacy-python-independent-20260921/closure.json').write_text(json.dumps(dict(packages=packages,checked=checked),indent=2)+'\n')
print(len(packages),len(checked))
