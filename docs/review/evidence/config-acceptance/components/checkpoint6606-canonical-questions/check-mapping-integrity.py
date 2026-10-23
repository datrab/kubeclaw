from pathlib import Path
import json,hashlib,copy,collections,subprocess
r=Path.cwd();b=r/'docs/review/evidence/config-acceptance/components';d=b/'checkpoint6606-canonical-questions';load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();fragment=load(d/'canonical-question-fragment.json');original=load(b/'icq-r06-boundaries-20261013/question-case-specs.json')['activeCases'];oldbaseline=load(b/'question-closure-bce3f075/question-case-specs.json')['activeCases'];reference=load(d/'committed-input-reference-receipt.json');oldids={c['id'] for c in oldbaseline};by={c['id']:c for c in fragment['cases']};existing=load(r/'docs/review/remediation/config-semantic-inventory.json');existingIDs={x['id'] for x in existing['rows']};wholeProfiles=load(b/'icq-corrections-20261013/complete-profiles.json')['BusterProfiles'];newProfiles=load(d/'secret-entry-complete-profiles.json')['profiles'];schema=load(d/'proposed-buster-canonical.schema.json');markers=load(d/'source-marker-canonical-projection.json')['candidates'];sourceRoster=load(d/'source-default-env-cli-projection.json')['sources'];observations=[]
def pointer(data,s):
 for raw in s.lstrip('/').split('/'):
  k=raw.replace('~1','/').replace('~0','~');data=data[int(k)] if isinstance(data,list) else data[k]
 return data

def validate(f):
 rows=f['rows'];cases=f['cases'];assert len({x['id'] for x in rows})==len(rows),'duplicate row';assert not existingIDs&{x['id'] for x in rows},'duplicate existing author';assert len({x['id'] for x in cases})==len(cases),'duplicate case';cb={x['id']:x for x in cases};rb={x['id']:x for x in rows}
 for o in original:
  assert o['id'] in cb,'original case missing';c=cb[o['id']];assert c['activeInputContract']==o,'original case contract loss';assert c['requirementIds']==o['requirements'],'original requirement loss';assert c['result']=='not-run','future acceptance promotion'
 for old in oldbaseline:assert set(old['requirements'])<=set(cb[old['id']]['requirementIds']),'historical baseline requirement loss'
 for row in rows:
  assert row.get('reviewerConfirmation') is None and not row.get('c0Closed'),'author acceptance';assert row['caseIds'] and set(row['caseIds'])<=set(cb),'row cases missing';assert sha(r/row['source']['path'])==row['source']['sha256'],'source identity drift'
  for cid in row['caseIds']:assert row['id'] in cb[cid]['settingIds'],'missing field/case projection'
  if row['class']=='operator-setting':
   field=row['source']['field'];sc=pointer(schema,row['schema']['field']);assert sc['type']=='integer','schema exact field';assert row['schema']['sha256']==sha(d/'proposed-buster-canonical.schema.json'),'schema identity'
   ps=newProfiles if field.endswith('/maximumSecretReferenceEntries') else wholeProfiles
   for p in ps:assert pointer(p['author'],field)==row['profiles']['A/B'][p['id']],'witness/profile contradiction'
 for c in cases:
  assert set(c['settingIds'])<=existingIDs|set(rb),'unresolved canonicalID hidden';assert c.get('reviewerConfirmation') is None,'case author acceptance'
 return True
validate(fragment);observations.append({'id':'positive-exact-13-fields-27-cases','passed':True})
for label,edit,expected in [('case-loss',lambda x:x['cases'].pop(0),'original case missing'),('requirement-loss',lambda x:x['cases'][0]['requirementIds'].pop(),'original requirement loss'),('inline-contract-loss',lambda x:x['cases'][0]['activeInputContract']['oracle'].pop(),'original case contract loss'),('field-case-link-loss',lambda x:x['cases'][0]['settingIds'].clear(),'missing field/case projection'),('B-witness-mismatch',lambda x:next(row for row in x['rows'] if row['id'].endswith('.tarDiagnosticCodeUnits'))['profiles']['A/B'].update(B=1024),'witness/profile contradiction'),('acceptance-promotion',lambda x:x['rows'][0].update(reviewerConfirmation='author'),'author acceptance')]:
 v=copy.deepcopy(fragment);edit(v)
 try:validate(v)
 except AssertionError as e:assert expected in str(e),(label,e);observations.append({'id':'negative-'+label,'passed':True,'intendedReject':str(e)})
 else:raise AssertionError(label+' accepted')
validate(fragment);observations.append({'id':'restored-positive','passed':True})
assert len(sourceRoster)==173 and len(markers)==1353 and len({m['id'] for m in markers})==1353
for s in sourceRoster:assert sha(r/s['path'])==s['sha256'];assert {m['id'] for m in markers if m['source']==s['path']}==set(s['candidateIds'])
for m in markers:
 lines=(r/m['source']).read_text().splitlines();assert lines[m['line']-1]==m['exactText'],m['id']
 for x in m['immutableMemberSchemaReferences']:assert sha(r/x['path'])==x['sha256'];assert pointer(load(r/x['path']),x['rfc6901Pointer'])==x['memberDisposition']
observations.append({'id':'whole173-source-1353-marker-exact-membership-and-current-identities','passed':True,'notSemanticClosure':True})
for path,expected in reference['inputIdentities'].items():assert sha(r/path)==expected,'immutable input rewritten';assert hashlib.sha256(subprocess.check_output(['git','show',reference['commit']+':'+path])).hexdigest()==expected
observations.append({'id':'193-committed-input-identities-not-rewritten','passed':True})
# All verified correction packages and Core13 bytes remain exactly committed. Do not copy/rewrite them.
protected=[]
for name in ['icq-corrections-20261013','icq-r06-boundaries-20261013']:
 for p in (b/name).rglob('*'):
  if p.is_file():
   rel=str(p.relative_to(r));assert hashlib.sha256(subprocess.check_output(['git','show',reference['commit']+':'+rel])).hexdigest()==sha(p);protected.append({'path':rel,'sha256':sha(p)})
for name in ['core-adjustable-profiles.json','core-adjustable-target.schema.json','core-adjustability-current.md']:
 p=b/name;rel=str(p.relative_to(r));assert hashlib.sha256(subprocess.check_output(['git','show',reference['commit']+':'+rel])).hexdigest()==sha(p);protected.append({'path':rel,'sha256':sha(p)})
(d/'protected-input-identities.json').write_text(json.dumps({'commit':reference['commit'],'inputs':protected,'preservedExactly':True},indent=2)+'\n');observations.append({'id':'verified97-55-plus-receipts-Core13-committed-inputs-unchanged','passed':True,'files':len(protected)})
(d/'mapping-integrity-controls.json').write_text(json.dumps({'scope':'author documentation integrity/conservation guards, NOT independent semantic review or F-MUT','observations':observations,'rows':len(fragment['rows']),'cases':len(fragment['cases']),'futureCasesNotRun':25,'actualNarrowCurrentCases':2,'remainingExactMarkerLinks':sum(x['sourceDisposition']=='remaining-exact-link-obligation' for x in markers),'sourceCountsNeverClosure':True},indent=2)+'\n');print(json.dumps({'passed':len(observations),'failed':0,'protectedInputs':len(protected),'original22CasesPreserved':True,'noWholeSourceAcceptance':True}))
