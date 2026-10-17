"""Immutable already-selected Kubernetes source reader bytes only; no client/API execution."""
import pathlib,json,urllib.request,urllib.error,hashlib,concurrent.futures
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];commit='fc0e7a6ca50f7ce368f9a5516e1716b473ed3a26';paths=['staging/src/k8s.io/client-go/tools/clientcmd/loader.go','staging/src/k8s.io/client-go/tools/clientcmd/client_config.go','staging/src/k8s.io/client-go/rest/config.go','staging/src/k8s.io/client-go/transport/token_source.go','staging/src/k8s.io/client-go/transport/round_trippers.go']
def acquire(path):
 url='https://raw.githubusercontent.com/kubernetes/kubernetes/'+commit+'/'+path;file=out/'pinned-buster-kubeclient-20261013'/path;file.parent.mkdir(parents=True,exist_ok=True)
 try:
  with urllib.request.urlopen(url,timeout=30) as response:body=response.read();status=response.status
 except urllib.error.HTTPError as e:body=e.read();status=e.code
 except Exception as e:body=str(e).encode();status='transport-error'
 file.write_bytes(body);return {'repository':'kubernetes/kubernetes','release':'v1.35.6','commit':commit,'sourcePath':path,'url':url,'status':status,'localPath':str(file.relative_to(repo)),'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'result':'acquired' if status==200 else 'failed'}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:records=list(executor.map(acquire,paths))
(out/'buster-kubeclient-reader-acquisitions-20261013.json').write_text(json.dumps({'scope':'immutable source-reader pin matches selected kubectl version; not installed binary/deployed API proof','records':records},indent=2)+'\n');print(json.dumps([{'path':r['sourcePath'],'status':r['status']} for r in records]))
