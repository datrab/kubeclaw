from pathlib import Path
import json,hashlib,subprocess
r=Path.cwd();b=r/'docs/review/evidence/config-acceptance/components';d=b/'checkpoint6606-canonical-questions';load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();dump=lambda p,x:Path(p).write_text(json.dumps(x,indent=2)+'\n');commit='6606af9e590032f328f330ecb3d953b1eef027e3';invpath=r/'docs/review/remediation/config-semantic-inventory.json';inv=load(invpath);by={x['id']:x for x in inv['rows']};matrix=load(r/'docs/review/remediation/config-acceptance-matrix.json');rootCases={c['id'] for c in matrix['cases']};assert sha(invpath)==hashlib.sha256(subprocess.check_output(['git','show',commit+':'+str(invpath.relative_to(r))])).hexdigest()
p=d/'question-canonical-field-case-links.json';x=load(p);qby={q['questionId']:q for q in x['questions']};links=x['canonicalFieldCaseLinks'];mapping={'CMP-SOURCE-PRISM-DESIGN-CARDINALITY':['AUTH-PRISM-DESIGN-CARDINALITY'],'CMP-SOURCE-PRISM-DEVELOPMENT-IDENTITY':['AUTH-PRISM-ENGINE-DEVELOPMENT-IDENTITY','DLV-NATIVE-PRISM-ENGINE-DIGEST-PROJECTION'],'CMP-SOURCE-BUSTER-KUBE-CREDENTIAL-ENV':['DLV-BUSTER-KUBERNETES-CAPTURE-PATH','DLV-BUSTER-KUBERNETES-CAPTURE-KUBECONFIG','DLV-BUSTER-KUBERNETES-CAPTURE-KUBERNETES-SERVICE-HOST','DLV-BUSTER-KUBERNETES-CAPTURE-KUBERNETES-SERVICE-PORT'],'CMP-SOURCE-GENERATED-HOST-SOURCE-PROVENANCE':['CMP-WCORE-HOST-LIMITS-CPUPERIODMICROSECONDS','DLV-NATIVE-SETUP-POLICY-DOCUMENT-BYTES','DLV-NATIVE-SETUP-RUNTIME-IDENTITY-BYTES','DLV-NATIVE-HOST-POOL-CPU-PERIOD-PROJECTION']};handoffs=[]
for q,ids in mapping.items():
 linkedCases=[]
 for sid in ids:
  row=by[sid];index=inv['rows'].index(row);assert set(row['caseIds'])<=rootCases;linkedCases+=row['caseIds'];handoffs.append({'questionId':q,'canonicalId':sid,'owner':row['owner'],'field':row['source'],'canonicalRowReference':{'commit':commit,'path':str(invpath.relative_to(r)),'sha256':sha(invpath),'rfc6901Pointer':'/rows/'+str(index)},'caseIds':row['caseIds'],'status':'legitimate frozen existing owner reference ONLY; unresolved author/runtime/physical and wholecarrier prerequisites retained','noNewAuthor':True})
 qby[q]['existingCanonicalIds']=list(dict.fromkeys(qby[q]['existingCanonicalIds']+ids));qby[q]['caseIds']=list(dict.fromkeys(qby[q]['caseIds']+linkedCases));links[q]['settingIds']=qby[q]['newCanonicalIds']+qby[q]['existingCanonicalIds'];links[q]['caseIds']=qby[q]['caseIds'];links[q]['noClosureFromHandoff']=True
# Exact previously declared tar locator and inherited storage quotas are existing author links, not new aliases by equal values.
for q in ['CMP-SOURCE-BUSTER-TAR-LOCATOR-UNUSED','CMP-SOURCE-FIXTURE-STORAGE-EXPONENT','CMP-SOURCE-FIXTURE-SECRET-REFERENCE-CARDINALITY']:
 for sid in qby[q]['existingCanonicalIds']:
  row=by[sid];handoffs.append({'questionId':q,'canonicalId':sid,'owner':row['owner'],'field':row['source'],'caseIds':qby[q]['caseIds'],'status':'exact declared writer/inherited budget same contract source identified in frozen question; current reader repair/actual targetcases notrun','noNewAuthor':True})
dump(p,x);dump(d/'frozen-crossauthor-canonical-handoffs.json',{'baseline':{'commit':commit,'inventorySha256':sha(invpath)},'handoffs':handoffs,'notIndependentSemanticReview':True,'wholeMJRStillOpen':True})
# Historical existingMemberSchemaReferences are expanded as immutable exact pointers, rather than dropping API/schema obligations for lack of an operator-setting ID.
p=d/'source-marker-canonical-projection.json';x=load(p);count=0
for c in x['candidates']:
 refs=[]
 for old in c.get('existingMemberSchemaReferences',[]):
  raw=old['artifactPointer'];path,pointer=raw.split('#',1);path=Path(path);path=path if path.is_absolute() else r/path;data=load(path)
  for token in pointer.lstrip('/').split('/'):
   token=token.replace('~1','/').replace('~0','~');data=data[int(token)] if isinstance(data,list) else data[token]
  refs.append({'commit':commit,'path':str(path.relative_to(r)),'sha256':sha(path),'rfc6901Pointer':pointer,'memberDisposition':data,'kind':old['kind'],'currentAuthorityReason':old['currentAuthorityReason']});count+=1
 c['immutableMemberSchemaReferences']=refs
 if c.get('questionId') in qby:
  q=qby[c['questionId']];c['canonicalSettingIds']=list(dict.fromkeys(c['canonicalSettingIds']+q['existingCanonicalIds']));c['questionCaseIds']=q['caseIds']
dump(p,x);print(json.dumps({'crossauthorFieldReferences':len(handoffs),'exactAPI/schemaReferencesPreserved':count,'crossauthorAcceptance':False}))
