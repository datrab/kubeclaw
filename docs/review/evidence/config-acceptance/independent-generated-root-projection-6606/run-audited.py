import sys,runpy,json,hashlib
from pathlib import Path
root=Path.cwd();out=Path(__file__).parent;label=sys.argv[1];script=Path(sys.argv[2]);argv=sys.argv[2:];seen={};busy=False
# Capture dependency identity before actual checker opens it. Read-only hash, no copies/source edits.
def hook(event,args):
 global busy
 if event!='open' or busy or not isinstance(args[0],(str,bytes)):return
 q=Path(args[0]).resolve()
 if not q.is_relative_to(root) or q.is_relative_to(out) or str(q) in seen or not q.is_file():return
 busy=True
 try:
  b=q.read_bytes();seen[str(q)]={'path':str(q.relative_to(root)),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 finally:busy=False
sys.addaudithook(hook);sys.path.insert(0,str(script.parent));sys.argv=argv
try:runpy.run_path(str(script),run_name='__main__')
finally:(out/(label+'-opened-inputs.json')).write_text(json.dumps({'scope':'exact actual checker first-open input hashes; no dependency stub','inputs':sorted(seen.values(),key=lambda x:x['path'])},indent=2)+'\n')
