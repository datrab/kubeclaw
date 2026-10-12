"""Read-only primary source/schema acquisition; no installs/package/source execution."""
import pathlib,json,urllib.request,urllib.error,hashlib
out=pathlib.Path(__file__).resolve().parent;records=[]
def request(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'kubeclaw-c0-source-inventory'}),timeout=60) as r:return r.read(),r.status
for version in ['v1.35.6','v1.34.11']:
 base='https://api.github.com/repos/kubernetes/kubernetes/git/ref/tags/'+version
 try:
  data,status=request(base);ref=json.loads(data);obj=ref['object']
  while obj['type']=='tag':data,status=request(obj['url']);obj=json.loads(data)['object']
  commit=obj['sha']
 except Exception as e:
  records.append({'source':base,'result':'failed','error':str(e)});continue
 paths=['go.mod','pkg/apis/core/validation/validation.go','pkg/apis/batch/validation/validation.go','pkg/kubelet/kubelet_pods.go','pkg/volume/secret/secret.go','staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go','staging/src/k8s.io/apimachinery/pkg/api/validation/generic.go','staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go','pkg/apis/apps/validation/validation.go','pkg/apis/core/v1/defaults.go','pkg/kubelet/kuberuntime/kuberuntime_container_linux.go','pkg/scheduler/framework/plugins/noderesources/fit.go','pkg/util/parsers/parsers.go','pkg/controller/cronjob/cronjob_controllerv2.go']
 for path in paths:
  url='https://raw.githubusercontent.com/kubernetes/kubernetes/'+commit+'/'+path;dest=out/'pinned-kubernetes'/version/path
  try:
   data,status=request(url);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
   records.append({'repository':'kubernetes/kubernetes','tag':version,'commit':commit,'path':path,'url':url,'status':status,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'result':'acquired','localPath':str(dest.relative_to(out.parents[4]))})
  except Exception as e:records.append({'url':url,'tag':version,'commit':commit,'path':path,'result':'failed','error':str(e)})
# Exact schema input used by Nova image, not proof of deployed apiserver version.
versions=json.loads((out.parents[4]/'versions.json').read_text());commit=versions['buildArgs']['KUBERNETES_JSON_SCHEMA_COMMIT'];version=versions['buildArgs']['KUBECTL_VERSION']
for name in ['deployment-apps-v1.json','statefulset-apps-v1.json','pod-v1.json','persistentvolumeclaim-v1.json','serviceaccount-v1.json','cronjob-batch-v1.json','job-batch-v1.json','configmap-v1.json','service-v1.json','ingress-networking-v1.json','networkpolicy-networking-v1.json','role-rbac-v1.json','rolebinding-rbac-v1.json','clusterrole-rbac-v1.json','clusterrolebinding-rbac-v1.json','customresourcedefinition-apiextensions-v1.json','poddisruptionbudget-policy-v1.json']:
 path='v'+version+'-standalone-strict/'+name;url='https://raw.githubusercontent.com/yannh/kubernetes-json-schema/'+commit+'/'+path;dest=out/'pinned-kubernetes-json-schema'/commit/path
 try:
  data,status=request(url);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);records.append({'repository':'yannh/kubernetes-json-schema','commit':commit,'path':path,'url':url,'status':status,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'result':'acquired','localPath':str(dest.relative_to(out.parents[4]))})
 except Exception as e:records.append({'url':url,'commit':commit,'path':path,'result':'failed','error':str(e)})
for path in ['parser.go','spec.go']:
 url='https://raw.githubusercontent.com/robfig/cron/v3.0.1/'+path;dest=out/'pinned-robfig-cron-v3.0.1'/path
 try:
  data,status=request(url);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);records.append({'repository':'robfig/cron','tag':'v3.0.1','path':path,'url':url,'status':status,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'result':'acquired','localPath':str(dest.relative_to(out.parents[4])),'selectionReason':'exact dependency in both Kubernetes release go.mod'})
 except Exception as e:records.append({'url':url,'path':path,'result':'failed','error':str(e)})
target=out/'kubernetes-source-acquisitions.json'
if target.exists():
 prior=json.loads(target.read_text());new={r.get('url'):r for r in records}
 # Preserve prior immutable identities/failed raw acquisition observations. A
 # changed tag/source SHA is a mismatch, never silent overwrite acceptance.
 for r in prior['records']:
  if r.get('url') not in new:records.append(r)
  elif r.get('sha256') and new[r['url']].get('sha256')!=r['sha256']:raise RuntimeError('PINNED_SOURCE_IDENTITY_CHANGED '+r['url'])
target.write_text(json.dumps({'method':'stdlib HTTPS byte download, explicit GitHub tag→commit resolution, SHA256 retained; no source/package execution','applicability':'repository Go module has no Kubernetes client deps. Selected kubectl/image-schema versions are verification-reader pins, NOT deployed apiserver version. Chart.yaml has no kubeVersion constraint. Source exemplars for exact these two pinned release validators only; actual selected cluster identity/API feature gates remain live input.','records':records},indent=2)+'\n');print(json.dumps({'acquired':sum(r['result']=='acquired' for r in records),'failures':[r for r in records if r['result']=='failed']}))
