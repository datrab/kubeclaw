"""Read-only immutable upstream reader acquisitions; no package/source execution."""
import pathlib,json,urllib.request,urllib.error,hashlib
out=pathlib.Path(__file__).resolve().parent;records=[]
def get(url,dest):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'delivery-c0-source-reader'}),timeout=45) as r:data=r.read();status=r.status
 except urllib.error.HTTPError as e:data=e.read();status=e.code
 dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists():assert dest.read_bytes()==data,'existing immutable snapshot differs'
 else:dest.write_bytes(data)
 record={'url':url,'status':status,'path':str(dest.relative_to(out.parents[4])),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'result':'acquired' if status==200 else 'failed'};records.append(record);return data,status
api='https://api.github.com/repos/tailscale/tailscale/git/ref/tags/v1.102.3';data,status=get(api,out/'pinned-residual-bce3f075/tailscale-tag-v1.102.3.json');assert status==200
obj=json.loads(data)['object']
if obj['type']=='tag':data,status=get(obj['url'],out/'pinned-residual-bce3f075/tailscale-annotated-tag.json');assert status==200;obj=json.loads(data)['object']
commit=obj['sha'];assert obj['type']=='commit'
for name in ['cmd/containerboot/main.go','cmd/containerboot/settings.go','cmd/tailscale/cli/up.go','cmd/tailscale/cli/up_test.go']:
 get(f'https://raw.githubusercontent.com/tailscale/tailscale/{commit}/{name}',out/'pinned-residual-bce3f075/tailscale'/name)
acq=json.loads((out/'kubernetes-source-acquisitions.json').read_text())
for tag in ['v1.35.6','v1.34.11']:
 r=next(r for r in acq['records'] if r.get('tag')==tag);name='pkg/apis/networking/validation/validation.go';get(f'https://raw.githubusercontent.com/kubernetes/kubernetes/{r["commit"]}/{name}',out/'pinned-residual-bce3f075'/tag/name)
(out/'residual-reader-acquisitions-bce3f075.json').write_text(json.dumps({'scope':'primary immutable release reader code only, not installed OCI/deployedAPI/flag state','tailscaleCommit':commit,'records':records},indent=2)+'\n');print(json.dumps({'tailscaleCommit':commit,'statuses':[r['status'] for r in records]}))
