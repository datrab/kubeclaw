"""Only exact existing pinned primary Kubernetes consumer sources; no build/API/host action."""
import pathlib,json,hashlib,urllib.request,urllib.error,concurrent.futures
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];old=json.loads((out/'kubernetes-source-acquisitions.json').read_text());pins={v:next(r['commit'] for r in old['records'] if r.get('tag')==v and r.get('repository')=='kubernetes/kubernetes' and r.get('result')=='acquired') for v in ['v1.35.6','v1.34.11']};paths=['staging/src/k8s.io/apimachinery/pkg/api/validation/objectmeta.go','pkg/apis/apps/validation/validation.go','pkg/registry/core/service/storage/alloc.go','pkg/kubelet/lifecycle/handlers.go']
def get(t):
 v,p=t;commit=pins[v];url='https://raw.githubusercontent.com/kubernetes/kubernetes/'+commit+'/'+p;dest=out/'pinned-chart-topology-6606af9-20261013'/v/p;rec={'repository':'kubernetes/kubernetes','version':v,'commit':commit,'path':p,'url':url,'scope':'source reader/validator only; NOT actual installed/deployed version or feature/driver/grant/capacity identity'}
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'kubeclaw-c0-source-inventory'}),timeout=35) as r:raw=r.read();status=r.status
  dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists() and dest.read_bytes()!=raw:raise RuntimeError('PINNED_PRIMARY_SOURCE_DRIFT')
  dest.write_bytes(raw);rec.update(result='acquired',status=status,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),localPath=str(dest.relative_to(repo)))
 except urllib.error.HTTPError as e:
  raw=e.read();dest=dest.with_suffix(dest.suffix+'.http-error');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw);rec.update(result='failed',status=e.code,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),rawErrorPath=str(dest.relative_to(repo)),error=str(e))
 except Exception as e:rec.update(result='failed',error=str(e))
 return rec
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(get,[(v,p) for v in pins for p in paths]))
f=out/'chart-topology-reader-acquisitions-6606af9-20261013.json';f.write_text(json.dumps({'method':'read-only HTTPS existing exact primary commits, no source build/execution; all HTTP failures raw retained','pinIdentity':{'path':str((out/'kubernetes-source-acquisitions.json').relative_to(repo)),'sha256':hashlib.sha256((out/'kubernetes-source-acquisitions.json').read_bytes()).hexdigest()},'records':records},indent=2)+'\n');print(json.dumps({'acquired':sum(r['result']=='acquired' for r in records),'failures':[r for r in records if r['result']!='acquired']}));raise SystemExit(any(r['result']!='acquired' for r in records))
