#!/usr/bin/env python3
"""Append-only batch integrity/identity, not acceptance."""
from pathlib import Path
import json,subprocess,hashlib,collections,datetime
P=Path('docs/review/evidence/config-acceptance/runtime');B=P/'batches/bce3f075-browser-04';I=json.loads((P/'inventory-fragment.json').read_text());C=json.loads((P/'case-proposals.json').read_text());L=json.loads((P/'runtime-case-dispositions.json').read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();cmd=lambda a:subprocess.check_output(a,text=True).strip();errors=[]
for typ,data in [('rows',I['rows']),('cases',C)]:
 errors += [{'duplicate':typ,'id':id}for id,n in collections.Counter(x['id']for x in data).items()if n>1]
rowids={r['id']for r in I['rows']};cases={c['id']:c for c in C};dispositions={d['id']:d for d in L['cases']}
for r in I['rows']:
 if r.get('c0Closed'):errors.append({'closedWithoutAcceptance':r['id']})
 for id in r['cases']:
  if id not in cases:errors.append({'missingCase':id,'setting':r['id']})
for c in C:
 for id in c.get('settings',[]):
  if id not in rowids:errors.append({'danglingSetting':id,'case':c['id']})
 if c['id']not in dispositions:errors.append({'missingDisposition':c['id']})
 elif c.get('requirements',[])!=dispositions[c['id']]['originalRequirementsPreserved']:errors.append({'requirementsChanged':c['id']})
 if c.get('result')=='passed':
  for field in ['sourceDigests','testDigests','inputDigests']:
   for p,digest in c.get(field,{}).items():
    if not Path(p).is_file()or sha(p)!=digest:errors.append({'case':c['id'],'digestMismatch':p,'kind':field})
  for raw in c['rawEvidence']if isinstance(c['rawEvidence'],list)else[c['rawEvidence']]:
   if not raw or not Path(raw).is_file()or Path(raw).stat().st_size==0:errors.append({'missingRaw':c['id'],'path':raw})
actualLinks={c['id']:[r['id']for r in I['rows']if c['id']in r['cases']]for c in C}
for d in L['cases']:
 if d['id']in actualLinks and set(d.get('activeSettingLinks',[]))!=set(actualLinks[d['id']]):errors.append({'activeLinkMismatch':d['id']})
 if d['disposition']=='superseded':
  for id in d['supersededBy']:
   if id not in cases or id==d['id']or not set(d['originalRequirementsPreserved']).issubset(cases[id].get('requirements',[])):errors.append({'invalidSupersession':d['id'],'replacement':id})
for name in ['inventory-fragment.json','case-proposals.json','runtime-case-dispositions.json']:
 f=B/('input-'+name)
 if not f.exists():f.write_bytes(subprocess.check_output(['git','show','HEAD:'+str(P/name)]))
dis=json.loads((B/'candidate-dispositions.json').read_text());combined=json.loads((B/'combined-candidate-dispositions.json').read_text())['records'];summary={'status':'not-accepted; actual current browser provider/file/owning schema with explicitly substituted capturetransport and separate true native PNG math/prelaunch invalid AXE input only; proposed strict owner definition not implemented; no real renderer/role/effect acceptance, future cases notrun','rows':len(I['rows']),'cases':len(C),'results':dict(collections.Counter(c.get('result')for c in C)),'browser04SchemaRows':65,'browser04NewBuiltinPolicyRows':20,'browser04CurrentDefinitions':86,'browser04FutureCases':340,'allC0ClosedFalse':all(not r.get('c0Closed')for r in I['rows']),'remainingConsumerReviewRows':sum(r.get('semanticStatus')=='consumer-review-required'for r in I['rows']),'remainingSupplementalSourceTracedRows':sum(r.get('semanticStatus')=='source-traced; independent reviewer and exact approved author location pending'for r in I['rows']),'originalCandidates':dis['originalCount'],'manualCandidateRecordsThisBatch':dis['thisBatchCount'],'manualCandidateRecordsCombined':len(combined),'remainingUnreviewedCandidates':dis['remainingUnreviewed'],'explicitOpenCandidateGuards':sum(x['status'].startswith(('open','precise open'))for x in combined),'unmatchedGuardBusinessDefaultsNotInOriginalSyntaxRoster':dis['unmatchedGuardBusinessDefaultsNotInOriginalSyntaxRoster'],'integrityErrors':errors,'remaining':'156 schema consumers,197 original supplemental source-traced rows,4347 unreviewed candidates plus explicit open guard/trust/runtime-owner and absent-syntax obligations. Browser65 schema rows+20 AXE builtin leaves refined; actual renderer/version/role/full project/approved baseline/grant fixtures and original full coverage/mutation/recovery acceptance remain unresolved. Proposed Lighthouse complete4metric/mandatoryperformancebudget target stronger/unapproved; taskpurpose correction preserved in history. Browser quota/sourcefile/Playwright executable configuration policies require exact per-source dispositions. Existing codec/context/A6 scope and historical case requirements retained.'}
(B/'integrity.log').write_text(json.dumps(summary,indent=2)+'\n');patch=subprocess.check_output(['git','diff','--binary','--',str(P)]);(B/'runtime-dirty.patch').write_bytes(patch);untracked=cmd(['git','ls-files','--others','--exclude-standard','--',str(P)]).splitlines();identity={'sourceCommit':cmd(['git','rev-parse','HEAD']),'sourceTree':cmd(['git','rev-parse','HEAD^{tree}']),'branch':cmd(['git','branch','--show-current']),'timeUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':cmd(['node','--version']),'packageLockSha256':sha('package-lock.json'),'trackedRuntimePatch':str(B/'runtime-dirty.patch'),'trackedRuntimePatchSha256':sha(B/'runtime-dirty.patch'),'untrackedRuntimeInputs':{p:sha(p)for p in untracked if Path(p).is_file()and p not in [str(B/'identities.json'),str(B/'summary.json')]} ,'scope':'runtime-only exact dirty evidence; parent must freeze full simultaneous repo dirty state before global review. source controls do not execute future behavior.'};(B/'identities.json').write_text(json.dumps(identity,indent=2)+'\n');(B/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items()if k not in ['unmatchedGuardBusinessDefaultsNotInOriginalSyntaxRoster','remaining']},indent=2));assert not errors
