from pathlib import Path
import json,hashlib,sys
O=Path('docs/review/evidence/config-acceptance/components/question-closure-bce3f075');H=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
path=Path(sys.argv[sys.argv.index('--definitions')+1]) if '--definitions'in sys.argv else O/'question-definitions.json'
try:
 baseline=json.load(open(O/'baseline-identities.json'))
 for group in ['frozenSourceInputs','protectedCorrections']:
  for p,h in baseline[group].items():assert H(p)==h,'PROTECTED_INPUT_DRIFT:'+p
 d=json.load(open(path));cases=json.load(open(O/'question-case-specs.json'))['activeCases'];q=d['questions'];ids=[r['id'] for r in q];assert len(ids)==len(set(ids)),'DUPLICATE_QUESTION_ID'
 old=json.load(open(O.parent/'source-candidates-bce3f075/source-open-obligations.json'))['questions'];assert set(ids)=={r['id'] for r in old},'ORIGINAL_REQUIREMENT_SET_CHANGED'
 ci=[r['id'] for r in cases];assert len(ci)==len(set(ci)),'DUPLICATE_ACTIVE_CASE_ID';index={r['id']:r for r in cases}
 for r in q:
  assert r['lifecycle']['requirementsPreserved'] is True,'REQUIREMENT_LIFECYCLE_NOT_PRESERVED'
  if 'supportedDomain'in r:
   assert r['soleAuthor'] and r['sourceEvidence'] and r['definition'] and r['caseIds'],'OWNED_DEFINITION_MISSING_CONTRACT'
   for cid in r['caseIds']:assert cid in index and index[cid]['questionId']==r['id'],'CASE_QUESTION_LINK_INVALID'
 for c in cases:
  assert c['questionId']in ids and c['id']in next(r for r in q if r['id']==c['questionId'])['caseIds'],'ACTIVE_CASE_UNLINKED'
  for key in ['boundary','input','oracle','requirements','environment','priorState','generationContract']:assert c[key],'CASE_BOUNDARY_OR_ORACLE_MISSING:'+c['id']
  assert c['implementationStatus']=='not-implemented/not-run','FUTURE_CASE_FALSE_PROMOTION'
  assert c['invocation']['argv'][1]=='--case' and c['invocation']['argv'][2]==c['id'] and c['invocation']['argv'][3]=='--profiles','EXACT_PROPOSED_ARGV_INVALID'
  assert c['stage']=='C0-proposed-definition','CASE_LIFECYCLE_PROMOTED'
 source=json.load(open(O/'question-source-identities.json'))
 for p,h in source.items():assert H(p)==h,'QUESTION_SOURCE_DRIFT:'+p
 latest=json.load(open(O/'proposed-definition-controls-attempt5.log'));assert latest['failed']==0 and latest['passed']==33,'LATEST_PROFILE_DEFINITION_NOT_PASSED'
 for p,h in latest['identities'].items():assert H(p)==h,'LATEST_PROFILE_INPUT_DRIFT:'+p
 for n in ['current-reader-controls-attempt1.log','current-formatter-control-attempt1.log','kernel-projection-controls-attempt1.log']:
  log=json.load(open(O/n));assert log['failed']==0,'CURRENT_SOURCE_CONTROL_FAILURE:'+n
  for p,h in log.get('identities',{}).items():assert H(p)==h,'ACTUAL_CONTROL_SOURCE_DRIFT:'+p
 print(json.dumps({'result':'passed','originalQuestionsRetained':len(q),'activeProposedCases':len(cases),'sourceFilesIdentityChecked':len(source),'scope':'Document/link/identity integrity only; NOT semantic/implementation/F-MUT/acceptance','definitionPath':str(path),'definitionSHA256':H(path)}))
except Exception as e:
 print(json.dumps({'result':'failed','error':str(e),'definitionPath':str(path),'scope':'Document integrity only'}));sys.exit(1)
