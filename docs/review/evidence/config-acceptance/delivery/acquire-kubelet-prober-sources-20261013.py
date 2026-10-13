"""Read-only exact already pinned primary Go consumer bytes, no Go/image/API execution."""
import pathlib,json,hashlib,urllib.request,urllib.error,concurrent.futures
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];old=json.loads((out/'kubernetes-source-acquisitions.json').read_text());pins={v:next(r['commit'] for r in old['records'] if r.get('tag')==v and r.get('repository')=='kubernetes/kubernetes' and r.get('result')=='acquired') for v in ['v1.35.6','v1.34.11']};paths=['pkg/kubelet/prober/worker.go','pkg/kubelet/prober/prober.go','staging/src/k8s.io/api/core/v1/types.go']
def get(task):
 version,path=task;commit=pins[version];url='https://raw.githubusercontent.com/kubernetes/kubernetes/'+commit+'/'+path;dest=out/'pinned-kubelet-probers-20261013'/version/path;record={'repository':'kubernetes/kubernetes','version':version,'commit':commit,'path':path,'url':url,'scope':'pinned source consumer only, not actual deployed kubelet/CRI/API version'}
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'kubeclaw-c0-source-inventory'}),timeout=40) as r:data,status=r.read(),r.status
  dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists() and dest.read_bytes()!=data:raise RuntimeError('PINNED_PRIMARY_SOURCE_DRIFT')
  dest.write_bytes(data);record.update(status=status,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),localPath=str(dest.relative_to(repo)),result='acquired')
 except urllib.error.HTTPError as e:
  data=e.read();dest=out/'pinned-kubelet-probers-20261013'/version/(path+'.http-error-body');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);record.update(status=e.code,error=str(e),sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),rawErrorPath=str(dest.relative_to(repo)),result='failed')
 except Exception as e:record.update(result='failed',error=str(e))
 return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(get,[(v,p) for v in pins for p in paths]))
f=out/'kubelet-prober-source-acquisitions-20261013.json';f.write_text(json.dumps({'method':'read-onlyHTTPS exact pinned existing commit; no build/install/source execution, allfailed raw bodies retained','existingPinSource':{'path':str((out/'kubernetes-source-acquisitions.json').relative_to(repo)),'sha256':hashlib.sha256((out/'kubernetes-source-acquisitions.json').read_bytes()).hexdigest()},'records':records},indent=2)+'\n');print(json.dumps({'acquired':sum(r['result']=='acquired' for r in records),'failed':[r for r in records if r['result']!='acquired']}));raise SystemExit(any(r['result']!='acquired' for r in records))
