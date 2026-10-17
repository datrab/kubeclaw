"""Exact same frozen upstream schema commit, additive missing4 sources, no substitute/skip."""
import pathlib,json,hashlib,urllib.request,urllib.error,concurrent.futures
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];commit='c8f4e61c63bc529749125ac566bccc6986e08d45';version='v1.34.11';files=['pod-v1.json','service-v1.json','serviceaccount-v1.json','deployment-apps-v1.json']
def get(f):
 path=version+'-standalone-strict/'+f;url='https://raw.githubusercontent.com/yannh/kubernetes-json-schema/'+commit+'/'+path;dest=out/'pinned-kubernetes-json-schema'/commit/path;rec={'repository':'yannh/kubernetes-json-schema','commit':commit,'path':path,'url':url,'scope':'pinned schema definition only; sourceGo+actualAPI validation distinct'}
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'kubeclaw-c0-source-inventory'}),timeout=35) as r:raw=r.read();status=r.status
  dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists() and dest.read_bytes()!=raw:raise RuntimeError('PINNED_PRIMARY_SCHEMA_DRIFT')
  dest.write_bytes(raw);rec.update(result='acquired',status=status,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),localPath=str(dest.relative_to(repo)))
 except urllib.error.HTTPError as e:
  raw=e.read();dest=out/'chart-topology-schema-failed-acquisitions-6606af9-20261013'/(f+'.http-error');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw);rec.update(result='failed',status=e.code,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),rawErrorPath=str(dest.relative_to(repo)),error=str(e))
 except Exception as e:rec.update(result='failed',error=str(e))
 return rec
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(get,files))
f=out/'chart-topology-schema-acquisitions-6606af9-20261013.json';f.write_text(json.dumps({'method':'read-only HTTPS exact already-frozen existing schema origin/commit, additive source acquisition; all failed raw bytes retained; no broad schema substitute','records':records},indent=2)+'\n');print(json.dumps({'acquired':sum(r['result']=='acquired' for r in records),'failures':[r for r in records if r['result']!='acquired']}));raise SystemExit(any(r['result']!='acquired' for r in records))
