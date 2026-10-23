"""Exact official selected Codex release parser sources; no native execution."""
import pathlib,json,hashlib,urllib.request,urllib.error
out=pathlib.Path(__file__).resolve().parent;records=[]
def get(url,name):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'delivery-c0'}),timeout=45) as r:data=r.read();status=r.status
 except urllib.error.HTTPError as e:data=e.read();status=e.code
 f=out/'pinned-codex-reader-bce3f075'/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data);records.append({'url':url,'status':status,'path':str(f.relative_to(out.parents[4])),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'result':'acquired' if status==200 else 'failed'});(out/'codex-reader-acquisitions-bce3f075.json').write_text(json.dumps({'scope':'official parser source pin, not OCI/binary equality or actual account/pairing','records':records},indent=2)+'\n');return data,status
raw,status=get('https://api.github.com/repos/openai/codex/git/ref/tags/rust-v0.153.4','tag.json')
if status==200:
 obj=json.loads(raw)['object']
 if obj['type']=='tag':raw,status=get(obj['url'],'annotated-tag.json');obj=json.loads(raw)['object']
 commit=obj['sha']
 for name in ['codex-rs/core/src/config/mod.rs','codex-rs/core/src/config/types.rs','codex-rs/protocol/src/config_types.rs','codex-rs/core/src/mcp_connection_manager.rs','codex-rs/core/src/auth.rs']:
  get(f'https://raw.githubusercontent.com/openai/codex/{commit}/{name}',name)
 print('Selected official Codex parser source acquisition',commit,[r['status'] for r in records])
else:print('Exact official Codex tag unavailable; failed primary snapshot retained',status)
