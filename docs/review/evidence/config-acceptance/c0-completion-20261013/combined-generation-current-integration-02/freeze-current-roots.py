"""Finite final root/reference conservation only; no validator framework."""
from pathlib import Path
import json,hashlib,subprocess
R=Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');O=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/combined-generation-current-integration-02';KEY='currentCombinedDefinitionGeneration'
def h(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
receipt=read(O/'root-integration-receipt.json');end=[]
for r in receipt['roots']:
 p=R/r['path'];after=read(p);oldraw=subprocess.check_output(['git','show',receipt['headBefore']+':'+r['path']],cwd=R);old=json.loads(oldraw);assert hashlib.sha256(oldraw).hexdigest()==r['beforeSha256'];assert h(p)==r['afterSha256'];assert {k:v for k,v in after.items() if k!=KEY}=={k:v for k,v in old.items() if k!=KEY};assert after[KEY]['supersession']['previousDescriptor']==old[KEY];assert after[KEY]['integrationContract']=={'path':str((O/'adoption-contract.json').relative_to(R)),'sha256':h(O/'adoption-contract.json')};marker=b'\n  "currentCombinedDefinitionGeneration": ';idx=oldraw.rfind(marker);assert idx>=0 and oldraw[:idx]==p.read_bytes()[:idx];end.append({'path':r['path'],'rawAfterSha256':h(p),'immutableBeforeGitObject':receipt['headBefore']+':'+r['path'],'rawBeforeSha256':r['beforeSha256'],'fullNonCurrentMetadataObjectEqual':True,'originalNonMetadataRawPrefixExactlyEqual':True,'originalRowsCasesRequirementsAndCurrentProviderFieldAdoptionEqual':True,'oldDescriptorExactlyPreservedAsHistorical':True})
pins=read(O/'input-identities.json');assert all(h(p['path'])==p['sha256']==p['endSha256'] for p in pins);a=read(R/receipt['roots'][0]['path'])[KEY];b=read(R/receipt['roots'][1]['path'])[KEY];assert a==b;refs=[];history=[]
def visit(v):
 if isinstance(v,dict):
  if isinstance(v.get('path'),str) and isinstance(v.get('sha256'),str):
   if 'immutableRawBefore' in v:
    g=v['immutableRawBefore'];assert g['gitRevision']==receipt['headBefore'] and g['gitObjectRef']==g['gitRevision']+':'+v['path'];raw=subprocess.check_output(['git','show',g['gitObjectRef']],cwd=R);assert hashlib.sha256(raw).hexdigest()==v['sha256']==g['rawSha256'];history.append({'path':v['path'],'gitObjectRef':g['gitObjectRef'],'rawBeforeSha256':v['sha256']})
   else:
    p=R/v['path'];assert p.is_file() and h(p)==v['sha256'],v['path'];refs.append({'path':v['path'],'sha256':v['sha256']})
  for x in v.values():visit(x)
 elif isinstance(v,list):
  for x in v:visit(x)
visit(a);unique={r['path']:r for r in refs};head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=R).decode().strip();assert head==receipt['headBefore'];(O/'actual-root-end-conservation.json').write_text(json.dumps({'actualRoots':end,'sameDescriptor':True,'uniqueScopedFieldIds':len(a['originalFieldIds']),'uniqueScopedCaseIds':len(a['originalCaseIds']),'actualDescriptorReferenceOccurrences':len(refs),'uniqueDescriptorReferenceFiles':len(unique),'endPinnedDescriptorReferences':sorted(unique.values(),key=lambda v:v['path']),'immutableRawBeforeHistoricalRoots':history,'physicalV8SourceSchemaEntryOutputTotal':856,'unmodifiedPinnedInputs':len(pins),'headBefore':receipt['headBefore'],'headEnd':head,'nativeImplementationGlobalAccepted':False},indent=2)+'\n');print(json.dumps({'uniqueFieldIds':len(a['originalFieldIds']),'uniqueCaseIds':len(a['originalCaseIds']),'currentDescriptorReferenceOccurrences':len(refs),'uniqueReferenceFiles':len(unique),'exactHistoricalRawRoots':len(history),'pinnedInputs':len(pins)}))
