import json,copy,hashlib
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-01');read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();digest=lambda d:hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def write(name,x):
 p=O/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2)+'\n')
owner=read(O/'config/plugins/kubeclaw.security-providers.config.json');fields=read(O/'field-definitions.json');index=read(O/'profile-task-pair-index.json');by={f['id']:f for f in fields['rows']};write('history/pre-oracle-refinement-package-profiles.json',owner)
prefixes={'dependency-trivy':'dependency:CVE-2021-23337:lodash:'+str(O/'task-fixtures/repository/vulnerable/package-lock.json'),'image-trivy':'image:CVE-2021-23337:lodash:application-packages','kubernetes-policy':'kubernetes-policy:KSV-0001:'+str(O/'task-fixtures/repository/checked-manifest.yaml')+':1','kubernetes-runtime':'kubernetes-runtime:fixture-rule'}
# Explicit whole-profile corrections, not an unsafe isolated source-delta transplant.
for name,p in owner['profiles'].items():
 for rid,body in p['registrations'].items():
  for waiver in body['processing']['policy']['acceptances']:
   if rid in prefixes and waiver['findingId'] in ['case-finding','other-finding']:waiver['findingId']=prefixes[rid] if waiver['findingId']=='case-finding' else prefixes[rid]+'.other'
for field in fields['rows']:
 rid=field['provider'];name=field['field'];a,b=field['wholeProfiles']['A'],field['wholeProfiles']['B']
 if rid=='headers' and name.startswith('rules.') and not name.endswith('.id'):
  for key in [a,b]:
   if key:owner['profiles'][key]['registrations']['headers']['processing']['policy']['acceptances']=[]
  field['notes'].append('Explicit corrected complete pair removes generic waiver mask on BOTH sides for rule comparison; old complete source/owned profiles preserved as history, not silently adopted.')
 if rid=='headers' and name=='rules.replace[].id':
  for key,target in [(a,'content-type-nosniff'),(b,'referrer-policy')]:
   p=owner['profiles'][key]['registrations']['headers']['processing'];p['rules']['replace']=[{'id':target,'header':'x-custom','severity':'high','kind':'equals','value':'a'}];p['policy']['acceptances']=[]
  field['notes'].append('New explicitly authored full replacement-ID pair holds header/severity/kind/value fixed, varies actual existing base rule ID only; source dictionary missing x-content-type-options exposes different replaced base rule. Prior coupled replacement record is retained history.')
 if 'policy' in name and rid!='headers':field['notes'].append('Corrected A/B waiver IDs have the real mapper prefix/format, not unreachable bare case-finding. Matching source shape does NOT prove an observed scan finding: image/runtime/policy/dependency identity must equal authentic native receipt before any verdict-effect claim. Unmatched waivers remain visible valid audit controls.')
 if name.startswith('evidenceDefaults.'):
  field['notes'].append('Source providers never context.log and return evidenceFiles/reports[]. runner-log-capture.write returns null when no chunks. Mandatory log is retention selection baseline, NOT guarantee of actual produced artifact; original native production/effect obligation remains OPEN.')
write('config/plugins/kubeclaw.security-providers.config.json',owner)
# Actual local task roots, not nonexistent generic nested directory recipes.
clean=str(O/'task-fixtures/repository/clean');vulnerable=str(O/'task-fixtures/repository/vulnerable');write('task-fixtures/config/dependency-trivy.task.json',{'projectDirectory':clean})
for item in index:
 f=by[item['settingId']]
 if f['field']=='projectDirectory':
  write(item['taskA'],{'projectDirectory':clean});write(item['taskB'],{'projectDirectory':vulnerable})
 elif f['provider']=='dependency-trivy':
  for key in ['taskA','taskB']:write(item[key],{'projectDirectory':clean})
base=read(O/'fixtures/header-response-headers.json');oracles=[]
for item in index:
 f=by[item['settingId']];name=f['field'];rid=f['provider'];o={'settingId':f['id'],'registrationId':f['registrationId'],'profiles':f['wholeProfiles'],'entries':item['entries'],'tasks':f['taskPair'],'originalCaseIds':f['originalCaseIds'],'nativeResult':'not-run','restoredPositive':'same authenticated original A/task/native/source/grant/clock closure after each negative; no reset/fill from B','mutation':'ignore selected policy/rules/preset/waiver/timeout/receiver binding, use literal fallback, wrong package/instance/profile or clock-reset mutant must fail ORIGINAL actual-consumer cases; pure helper check is not native mutant proof'}
 if f['unsupportedAlternateObligation']:o['disposition']='unsupported distinct safe alternate; exact original obligations OPEN/unwaived';o['obligation']=f['unsupportedAlternateObligation']
 elif rid=='headers' and (name=='profile' or name.startswith('rules')):
  hdr=copy.deepcopy(base)
  if name=='profile':hdr.pop('strict-transport-security');hdr.pop('x-frame-options')
  elif name in ['rules','rules.add[].id']:hdr.pop('x-custom')
  elif name.endswith('.severity'):
   hdr.pop('x-custom' if '.add' in name else 'x-content-type-options')
  elif name.endswith('.kind'):hdr['x-custom' if '.add' in name else 'x-content-type-options']='prefix-'+('a' if '.add' in name else 'nosniff')
  elif name.endswith('.value'):hdr['x-custom' if '.add' in name else 'x-content-type-options']='b'
  elif name=='rules.replace[].id':hdr.pop('x-content-type-options')
  elif name.startswith('rules.remove'):hdr.pop('referrer-policy')
  file=f'fixtures/header-oracles/{f["id"]}.json';write(file,{'status':200,'headers':hdr,'qualification':'Concrete endpoint response definition for SOURCE predicate assessment/future authenticated HTTP fixture; no served/observed response claimed'})
  o.update(disposition='meaningful same-boundary actual rule/preset/waiver source contrast',responseDefinition=file,observer='real provider resolvedRules/requested responseHeaders, visible findings/severity/IDs/counts/accepted/unused waiver info and real native request/effect receipt; no generic quota/mock substitute',boundary='native HTTP response first, then exact header predicates and common.result waiver/OR verdict; all response bytes charged even if header checks fail')
 elif name in ['paths','paths[]','projectDirectory']:o.update(disposition='actual task intent A/B, complete owner constant',observer='same real provider native canonical URL/path list or contained project directory/argv/source snapshot, exact response/scan result; task data never CONFIG',boundary='path/schema/repository containment before native; real endpoint/target effects afterward')
 elif name in ['timeoutMs','requestTimeoutMs']:o.update(disposition='real provider processing timeout/command cap contrast; actual timed effect remains future',observer='headers native payload20/40 under unchanged network120000; real fixed delayed endpoint if authenticated. Scan1000/2000 yields actual native ceil timeout argv1s/2s under unchanged scanner900000; runtime inspect deadline1000/2000 under runtime300000. Real timing/cleanup/remaining-clock receipt required, no fake sleep executable.',boundary='current provider forwards; HTTP native rejects excess; security.scan/runtime min with selected native cap; invocation signal/original claim deadline independently cancels. NO assumed provider min(invocation.timeoutMs).')
 elif name.startswith('policy'):
  o.update(disposition='waiver identity/reason/absolute expiry/source verdict and visible audit contrast',observer='same real provider/authenticated finding ID, visible finding retained, accepted/expired/unused lists and blocking counts; reason affects metadata not verdict; unmatched IDs valid unused controls',boundary='after genuine scan/native/header mapping; real Date.now expires<=now even during replay. Pure mapped fixture cannot prove native finding exists.',nativeEligibility='Header custom:/a response dictionary can define exact genuine header finding. Scanner/runtime waiver match requires exact authenticated mapped finding receipt under declared actual task; absent/mismatched receipt keeps original F-EFFECT open.')
 elif name.startswith('evidenceDefaults'):o.update(disposition='mandatory log retention selection only; distinct safe type B unavailable',observer='actual runner log capture/artifact, if genuine chunks exist; absence remains source production obligation, no fake report/log',boundary='selected evidence after real outcome; quiet source capture may return null')
 elif name=='retrySafe':o.update(disposition='safe true→false conservative default retry decision',observer='actual resolver default retry count/attempt receipts with no explicit requested unsafe retry; package retrySafe immutable true; explicit acceptUnsafeRetry task meaning not silently removed',boundary='eligible resolved plan before attempt; actual retries obey original node/source/claim clocks and effect idempotency')
 else:o.update(disposition='isolated owned common business OR-arm contract',observer='genuine mapped finding same source/provider/task: severity high statusunknown fixedversionpresent for severity arm; low affected nonvulnerability for active arm; low statusunknown vulnerability no fix for missing-fix arm; other OR arms disabled in BOTH full profiles. Findings remain visible.',boundary='real provider common.result after native; current common.policy rejects owned flags, proposed receiver migration required. Direct pure result arithmetic is SOURCE assessment only.')
 oracles.append(o)
write('original-member-oracle-contracts.json',{'entries':oracles,'qualification':'Exact89 original members and real application/observer/negative/mutant/restored-positive obligations; no native effect proof or canonical ID mutation'})
# Raw whole-profile/binding identities after every explicit correction.
for f in fields['rows']:
 f['wholeProfileHashes']={s:'sha256:'+digest(owner['profiles'][key]) for s,key in f['wholeProfiles'].items() if key};f['sourceOracleRef']='original-member-oracle-contracts.json#'+f['id']
write('field-definitions.json',fields)
for g in read(O/'generated-view-index.json'):
 d=read(O/g['path']);rid=g['registrationId'].split(':')[1];p=owner['profiles']['A'];d['selectedPolicy']['binding'].update(ownerDigest='sha256:'+sha(O/'config/plugins/kubeclaw.security-providers.config.json'),profileDigest='sha256:'+digest(p['registrations'][rid]),wholePackageProfileDigest='sha256:'+digest(p));d['values']=read(O/f'task-fixtures/config/{rid}.task.json');write(g['path'],d)
print(json.dumps({'originalMemberOracles':len(oracles),'completeProfiles':len(owner['profiles']),'explicitReplacementIDPair':'actual base IDs, fixed rule body; no waiver mask','nativeEffectCasesExecuted':0}))
