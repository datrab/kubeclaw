from pathlib import Path
import json
P=Path('docs/review/evidence/config-acceptance/runtime');B=P/'batches/bce3f075-network-05';O=json.loads((B/'owned-observations.json').read_text());I=json.loads((P/'inventory-fragment.json').read_text());C=json.loads((P/'case-proposals.json').read_text());L=json.loads((P/'runtime-case-dispositions.json').read_text());ids=[o['setting']for o in O['observations']];id=O['caseId'];case={'id':id,'settings':ids,'requirements':['C0-A','C0-B','C0-C'],'productiveCaller':'actual production referenced-schema compiler on proposed explicit owning policy schemas, no owningtargetproductive loader','inputProfile':str(B/'owned-policy-controls.json'),'expectedEffectOrRejectingBoundary':O['observations'],'observer':O['scope'],'command':O['command'],'sourceDigests':O['sourceDigests'],'testDigests':O['testDigests'],'inputDigests':O['inputDigests'],'toolDependencyImageConfigIdentities':{'node':O['node'],'status':'targetdomainproposal unapproved'},'result':'passed','rawEvidence':str(B/'check-owned.log'),'reviewerConfirmation':'pending'}
C=[c for c in C if c['id']!=id]+[case]
for r in I['rows']:
 if r['id']in ids:r['cases']=list(dict.fromkeys(r['cases']+[id]))
if not any(d['id']==id for d in L['cases']):L['cases'].append({'id':id,'disposition':'active','evidenceResultPreserved':'passed','originalRequirementsPreserved':case['requirements'],'activeSettingLinks':ids,'supersededBy':[],'countsTowardAcceptance':False,'reason':O['scope']})
for d in L['cases']:d['activeSettingLinks']=[r['id']for r in I['rows']if d['id']in r['cases']]
for name,data in [('inventory-fragment.json',I),('case-proposals.json',C),('runtime-case-dispositions.json',L)]: (P/name).write_text(json.dumps(data,indent=2)+'\n')
print('actual owning definition case',id,'scoped settings',len(ids))
