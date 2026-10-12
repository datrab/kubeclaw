from pathlib import Path
import json,hashlib,os,stat,subprocess
base=Path('docs/review/evidence/systemd-parser-isolated-20260921'); out=Path('docs/review/evidence/independent-systemd-parser-20260921'); cache=Path('node_modules/.cache/systemd-parser-20260921').resolve()
rows=json.loads((base/'runtime-entry-identities.json').read_text()); expected={r['path']:r for r in rows}; actual=set()
for name in ['runtime','verifier']:
 root=cache/name
 for directory,dirs,files in os.walk(root,followlinks=False):
  for name in dirs+files:
   p=Path(directory)/name;key=str(p.relative_to(cache)); actual.add(key); r=expected[key]; s=p.lstat(); assert oct(stat.S_IMODE(s.st_mode))==r['mode']
   if stat.S_ISLNK(s.st_mode):assert r['type']=='symlink' and os.readlink(p)==r['target'] and p.resolve().is_relative_to(root)
   elif stat.S_ISDIR(s.st_mode):assert r['type']=='directory'
   else:assert stat.S_ISREG(s.st_mode) and r['type']=='file' and s.st_size==r['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256']
assert actual==set(expected)
for r in json.loads((base/'probe-source-identities.json').read_text()):assert hashlib.sha256(Path(r['path']).read_bytes()).hexdigest()==r['sha256']
for r in json.loads((base/'selected-packages.json').read_text()):
 p=cache/'debs'/Path(r['Filename']).name;assert p.stat().st_size==int(r['Size']) and hashlib.sha256(p.read_bytes()).hexdigest()==r['SHA256']
tool=Path('node_modules/.cache/native-host-tools/root').resolve();env=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'));results=[]
for row in json.loads((base/'parser-results.json').read_text()):
 p=subprocess.run(row['command'],capture_output=True,text=True,env=env,timeout=120);result={'command':row['command'],'status':p.returncode,'stdout':p.stdout,'stderr':p.stderr};results.append(result);assert all(result[k]==row[k] for k in ['status','stdout','stderr'])
(out/'parser-results.json').write_text(json.dumps(results,indent=2)+'\n'); print(json.dumps({'runtimeEntries':len(actual),'fullEntrySetMatches':True,'sourceBindings':True,'packageHashes':True,'parserStatuses':[r['status'] for r in results]}))
