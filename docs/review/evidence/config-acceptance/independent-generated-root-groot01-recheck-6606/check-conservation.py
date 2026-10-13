from pathlib import Path
import json,sys,hashlib,copy
root=Path.cwd();out=Path(__file__).parent;load=lambda path:json.loads((root/path).read_text());i=load('docs/review/remediation/config-semantic-inventory.json');m=load('docs/review/remediation/config-acceptance-matrix.json');native=load('docs/review/evidence/config-acceptance/runtime/case-proposals.json');pkg=m['nativeCasePackages'][0];source='docs/review/evidence/config-acceptance/runtime/case-proposals.json';assert pkg['caseSpecifications']==native;assert hashlib.sha256((root/source).read_bytes()).hexdigest()==pkg['sourceSha256'];ns={};exec(compile((root/'docs/review/evidence/config-acceptance/author/historical_mapping.py').read_bytes(),'actual-frozen-helper','exec'),ns);h=ns['load_reviewed'](root,native,load('docs/review/evidence/config-acceptance/runtime/inventory-fragment.json')['rows'],load('docs/review/evidence/config-acceptance/runtime/runtime-case-dispositions.json')['cases'],{x['id'] for x in m['cases']});links={x['nativeCaseId']:x for x in pkg['canonicalCaseMapping']};by={x['id']:x for x in native};canonical={x['id']:x for x in m['cases']};assert len(links)==len(native)==6201
for cid,link in links.items():
 assert link['requirementIds']==by[cid]['requirements'];assert link['settingIds']==by[cid]['settings'];assert link['mappingReview'] is None
 if cid in h:assert link['canonicalCaseId'] is None and cid not in canonical and link['historicalMapping']==h[cid]
 else:assert link['canonicalCaseId']==cid and set(by[cid]['requirements'])<=set(canonical[cid]['requirementIds'])
assert pkg['reviewerConfirmation'] is None;assert all(x['reviewerConfirmation'] is None for x in i['rows']);assert all(x.get('reviewerConfirmation') is None for x in m['cases'])
f=load('docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions/canonical-question-fragment.json');rows={x['id']:x for x in i['rows']};dr=[]
for row in f['rows']:
 for k,v in row.items():
  if k=='reviewerConfirmation':v=None
  if rows[row['id']].get(k)!=v:dr.append({'kind':'row','id':row['id'],'key':k})
for case in f['cases']:
 for k,v in case.items():
  if k=='reviewerConfirmation':v=None
  if canonical[case['id']].get(k)!=v:dr.append({'kind':'case','id':case['id'],'key':k})
assert not dr,dr
sourceLinks=load('docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions/question-canonical-field-case-links.json')['canonicalFieldCaseLinks'];cp=next(x for x in i['supplementalDefinitionPackages'] if x['id']=='CORE-ICQ-DEFINITION-CORRECTIONS-20261013');assert cp['canonicalFieldCaseLinks']==sourceLinks;assert {x['id'] for x in cp['questions']}==set(sourceLinks);assert cp['reviewerConfirmation'] is None;aliases=sum(len(x['unresolvedAliases']) for x in sourceLinks.values());assert aliases==60
for cid,reqs in cp['caseRequirementBaseline']['requirementsByCaseId'].items():assert set(reqs)<=set(canonical[cid]['requirementIds'])
pure=m['definitionObservationPackages'][0];actual=load(pure['sourcePath']);assert pure['observations']==actual and len(actual)==105;assert pure['reviewerConfirmation'] is None;assert hashlib.sha256((root/pure['sourcePath']).read_bytes()).hexdigest()==pure['sourceSha256'];assert all(x['id'] not in canonical for x in actual)
reqs={x['id']:x for x in m['requirements']};assert 'F-RECOVERY' in reqs;originalRec=sum('F-RECOVERY' in x['requirements'] for x in native);assert all('F-RECOVERY' in canonical[x['id']]['requirementIds'] for x in native if 'F-RECOVERY' in x['requirements'] and x['id'] in canonical)
summary={'scope':'Projection identity/body conservation only; no substantive own Core definition review','nativeBodiesExact':6201,'directLinks':5932,'inactiveHistories':269,'historySuccessors':356,'unresolvedNativeMappingCount':0,'CoreOriginalRowPropertiesPreserved':13,'CoreOriginalCasePropertiesPreserved':27,'CoreLinkQuestionsExact':14,'CoreUnresolvedAliasesPreserved':aliases,'old22CaseBaselineRequirementsPreserved':len(cp['caseRequirementBaseline']['requirementsByCaseId']),'pureObservationBodiesSeparateExact':105,'pureObservationsNotPromotedToCanonicalBodies':True,'reviewerConfirmationsRemainNone':True,'nativeFRecoveryTaggedCasesPreserved':originalRec,'projectionDrift':dr};(out/'conservation-observations.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
