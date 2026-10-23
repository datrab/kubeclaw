from pathlib import Path
import json,hashlib,copy
b=Path(__file__).parent;rel=Path('docs/review/evidence/config-acceptance/components/icq-corrections-20261013');o=b.parent/'question-closure-bce3f075';load=lambda n:json.loads((b/n).read_text());canon=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False);digest=lambda x:'sha256:'+hashlib.sha256(canon(x).encode()).hexdigest();sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def out(n,x):(b/n).write_text(json.dumps(x,indent=2)+'\n')
p=load('complete-profiles.json');srcs=load('historical-input-identities.json')['protectedOriginalBaseline']['frozenSourceInputs'];sourceIdentity={'sourceCheckpoint':'bce3f075156a86be345821499c04628cb35c2762','exactRosterDigest':sha(o/'question-source-identities.json')};refs=[]
for owner,profiles,schema in [('buster-engine',p['BusterProfiles'],'proposed-buster-component.schema.json'),('nova-platform',p['NovaProfiles']['completeDefinitionFixtures'],'proposed-nova-platform.schema.json')]:
 for x in profiles:
  author=x['author'];policy=author['settings']['execution']['stores'] if owner=='buster-engine' else author['observability'];sh='sha256:'+sha(b/schema);manifest={'owner':owner,'profileDigest':digest(author),'policyDigest':digest(policy),'schemaDigest':sh,'sourceDigest':digest(sourceIdentity),'profileId':x['id']};binding={'schemaVersion':'admission-binding.v1','owner':owner,'generationDigest':digest(manifest),**{k:manifest[k] for k in ['profileDigest','policyDigest','schemaDigest','sourceDigest']}};x['bindingEnvelope']=binding;refs.append({'id':owner+':'+x['id'],'binding':binding,'fullProfile':author,'policy':policy,'generationManifest':manifest,'sourceManifest':sourceIdentity,'schema':{'path':str(rel/schema),'sha256':sha(b/schema)},'proofScope':'Hashesderived from actual complete synthetic author documents; fixture authorization only. Not authenticated deployed historicalprofile, installedcode or real originalmigrationapproval.'})
out('complete-profiles.json',p);out('immutable-owner-reference-specimens.json',{'refResolution':refs,'resolver':'original digest -> exact frozen canonical document from this immutable fixturemap; no owner/profile-name latest lookup; missing/drift wrongowner rejects','sameQuota':'actual full referenced profile/source/schema documents and inlineheader must be charged to existing capturedmetadata/totalceilings atmaterialization; fixture docs on disk are definitionevidence not claimedregistered runtimeauthor'})
# Update target state headers to resolvable synthetic BusterA references, fixed serialized width retained.
binding=refs[0]['binding']
for state in b.glob('admission-*-bound-target-state.json'):
 v=json.loads(state.read_text());v['binding']=binding;state.write_text(canon(v))
# Exact per-method boundary authors retain distinct complete selections; future harness derives their own binding using samecanonicalalgorithm.
a=load('admission-method-fixtures.json');a['bindingReferenceSpecimens']={'path':str(rel/'immutable-owner-reference-specimens.json'),'sha256':sha(b/'immutable-owner-reference-specimens.json')};a['boundaryBindingRule']='Each complete methodboundaryauthor has its own canonicalgeneration/profile/policy digests computed exactlyasimmutable-owner-reference-specimens. Supplied priorstate binding must be that originalselectedboundaryprofile (not copiedlatest/global A); binding values have same fixedwidth525. Existingdata bytes unaffected except their explicit proposedbindingheader.';out('admission-method-fixtures.json',a)
# Crossauthor activequestionlinks, preserving original14 records not selfclosing.
q=load('question-definitions.json');handoff=load('crossauthor-handoffs.json')
for x in q['questions']:
 if x['id'] in handoff['questions']:
  x['exactExternalHandoff']=handoff['questions'][x['id']];x['handoffSnapshot']='crossauthor-handoffs.json';x['lifecycle']['active']='external-owner-proposed-definition-independent-review-pending; not Coreclosure'
out('question-definitions.json',q)
# Refresh only current newbatch file refs; historical/source/otherauthor references untouched.
def refresh(x):
 if isinstance(x,dict):
  if isinstance(x.get('path'),str) and 'icq-corrections-20261013' in x['path'] and 'sha256' in x and Path(x['path']).is_file():
   raw=Path(x['path']).read_bytes();x['sha256']=hashlib.sha256(raw).hexdigest()
   if 'sizeBytes' in x:x['sizeBytes']=len(raw)
  for y in x.values():refresh(y)
 elif isinstance(x,list):
  for y in x:refresh(y)
for name in ['admission-method-fixtures.json','overflow-full-current-control.json','question-case-specs.json','lock-caller-contracts.json','retirement-method-fixtures.json']:
 v=load(name);refresh(v);out(name,v)
cases=load('question-case-specs.json')
# exactoriginal retirement source metadata versus targetrole distinctions are mandatorycase inputs, never currentcapture proof.
for c in cases['activeCases']:
 if c['id']=='QC-ADMISSION-METADATA-RESERVE-ALL-WRITES':c['input']={'methods':{'path':str(rel/'admission-method-fixtures.json'),'sha256':sha(b/'admission-method-fixtures.json')},'retirement':{'path':str(rel/'retirement-method-fixtures.json'),'sha256':sha(b/'retirement-method-fixtures.json')}}
 if c['id']=='QC-FOUNDATION-FLOCK-WAIT-HISTORY':c['input']['contract']={'path':str(rel/'lock-caller-contracts.json'),'sha256':sha(b/'lock-caller-contracts.json')}
 c['lifecycle']={'status':'active-superseding-proposed-not-run','originalRequirementsPreserved':True,'historicalOriginalCase':{'path':str(Path('docs/review/evidence/config-acceptance/components/question-closure-bce3f075/question-case-specs.json')),'sha256':sha(o/'question-case-specs.json'),'id':c['id']}}
 c['invocation']['argv'][-1]=str(rel/'case-input-contracts.json')
out('question-case-specs.json',cases);out('case-input-contracts.json',{'activeCases':cases['activeCases'],'requirementsPreserved':True,'implementation':'Future exactcommand contract, harness intentionally absent untilC1 approval; no case markedpassed; actual current/read/doccontrols separate.'})
# New append-only correction ledger, no author acceptance promotion.
changes={
'ICQ-01':['tar-correlated-profiles.json','complete-profiles.json','QC-BUSTER-TAR-LOCATOR-UNUSED-PAIRED-PROVISION'],
'ICQ-02':['reserve-boundary-fixtures.json','serialization-envelope-contract.json','question-definitions.json','QC-ADMISSION-METADATA-RESERVE-VAL'],
'ICQ-03':['retirement-binding-contract.json','retirement-method-fixtures.json','immutable-owner-reference-specimens.json','QC-FOUNDATION-FLOCK-WAIT-HISTORY','QC-ADMISSION-REASON-LIMITS-HISTORY'],
'ICQ-04':['outbox-method-fixtures.json','outbox-pending-state.json','outbox-acknowledged-state.json','outbox-oversized-2049.bytes','QC-OUTBOX-UNBOUNDED-READ-FOUR-METHODS','QC-OUTBOX-UNBOUNDED-READ-REPLAY'],
'ICQ-05':['computed-environment-supersession.json'],
'ICQ-06':['admission-method-fixtures.json','admission-*-bound-target-state.json','retirement-method-fixtures.json','lock-caller-contracts.json','provider-provenance.schema.json','provider-provenance-contract.json','provider-provenance-specimens.json','provider-serialization-bound-controls.json','QC-ADMISSION-METADATA-RESERVE-ALL-WRITES','QC-BUSTER-PROVIDER-MEASUREMENT-FALLBACKS-REAL-PROVENANCE','QC-BUSTER-PROVIDER-MEASUREMENT-FALLBACKS-RECOVERY-EVAL']}
out('correction-ledger.json',{'sourceFindings':{'path':'docs/review/evidence/config-acceptance/independent-core-source-question-bce3f075-20261013/findings.json','sha256':sha('docs/review/evidence/config-acceptance/independent-core-source-question-bce3f075-20261013/findings.json')},'findings':[{'id':i,'authorDisposition':'material superseding proposal for independent challenge, NOT authorverified/accepted','changes':v,'originalScopeAndRequirementsPreserved':True} for i,v in changes.items()],'historicalInputs':'historical-input-identities.json all145oldbatch/sourcefiles + exactprotectedCore13baseline unchanged','newFailuresRetained':['build-corrections-syntax-attempt1.py.snapshot','build-corrections-syntax-attempt1.log','freeze-method-fixtures-attempt1.mjs.snapshot','safe-current-method-controls-attempt1.log','corrected-definition-controls-attempt1.receipt.json','corrected-definition-controls-attempt2.receipt.json'],'additionalSerializationCorrection':'exactbinding field makes525growth; conceptualinlineBinding persistedfield would531, failure retained andrepaired underfixedv1bindingname, no silent universalclaim','acceptance':False})
