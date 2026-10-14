import json,hashlib
from pathlib import Path
B=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');P=B/'security-provider-contracts-01';O=B/'security-provider-contracts-02'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def write(n,d):
 p=O/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,indent=2)+'\n')
inputs=sorted(p for d in [P,B/'independent-security-provider-contract-review-01'] for p in d.rglob('*') if p.is_file())
write('frozen-input-identities.json',{'inputs':[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}for p in inputs],'inheritedHistoricalPins':str(P/'frozen-input-identities.json')})
s=(P/'check-definition.mjs').read_text();s=s.replace("write=(p,d)=>fs.writeFileSync(`${O}/${p}`", "write=(p,d)=>fs.writeFileSync(`docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/${p}`")
insert='''// SEC-R01-01 pure source slices only: no provider body/class/constructor/invoke.
const headerRuleSource=fs.readFileSync(`${S}/src/headers.js`,'utf8');
const selectedRuleSlice=headerRuleSource.slice(headerRuleSource.indexOf('function rule('),headerRuleSource.indexOf('function deployment('));
function resolvedSelectedRules(processing){const c=vm.createContext({PROFILES:processing.presets,object,SEVERITIES});vm.runInContext(selectedRuleSlice+'\\nthis.resolve=rules;',c,{timeout:1000});return c.resolve(processing.profile,processing.rules);}
const nativeHeaderSource=fs.readFileSync('skills/buster/engine/test-gates/network-http-runtime.ts','utf8');
const nativeHeaderSlice=nativeHeaderSource.slice(nativeHeaderSource.indexOf('function responseHeaderNames('),nativeHeaderSource.indexOf('function exactPayload(')).replace('value: unknown','value').replace(': readonly string[]','');
const nativeHeaderContext=vm.createContext({});vm.runInContext(nativeHeaderSource.match(/const DENIED_HEADERS = new Set\\([^;]+;/)[0]+'\\n'+nativeHeaderSlice+'\\nthis.names=responseHeaderNames;',nativeHeaderContext,{timeout:1000});
function resolvedHeaderError(processing){try{const rules=resolvedSelectedRules(processing);nativeHeaderContext.names([...new Set(rules.map(r=>r.header))]);return null;}catch(e){return e.message;}}
'''
s=s.replace('function semanticOwnerErrors(o)',insert+'function semanticOwnerErrors(o)')
s=s.replace("const count=base.filter", "const headerError=resolvedHeaderError(h);if(headerError)errors.push(`${name}:resolved-native-header-domain:${headerError}`);const count=base.filter")
a=s.index('function entryErrors(');b=s.index('for(const f of fs.readdirSync',a)
s=s[:a]+'''const componentDocuments=Object.fromEntries(Object.entries(root.components).map(([k,p])=>[k,read(`${O}/config/${p}`)]));
function entryErrors(r,documents=componentDocuments){const errors=[];const tuples=r.pluginSelections.filter(t=>t.packageId===owner.packageId);
 if(tuples.length!==5||new Set(tuples.map(t=>t.registrationId)).size!==5)errors.push('missing-or-duplicate-registration');
 if(new Set(tuples.map(t=>t.profileId)).size!==1||new Set(tuples.map(t=>t.instanceId)).size!==1)errors.push('split-one-package-instance-profile');
 if(new Set(tuples.map(t=>t.ownerPath)).size!==1)errors.push('split-one-package-owner-path');
 if(new Set(tuples.map(t=>t.serviceInstanceId)).size!==1)errors.push('split-one-package-service-context');
 for(const t of tuples){if(t.instanceId!==owner.instanceId||t.ownerPath!=='plugins/kubeclaw.security-providers.config.json'||!owner.profiles[t.profileId]||!decls[t.registrationId.split(':')[1]]||t.kind!=='test-provider')errors.push('wrong-package-instance-profile-kind');
 const bindings=r.bindings.filter(b=>b.instanceId===t.serviceInstanceId),engines=bindings.filter(b=>b.owner==='buster-engine'),workers=bindings.filter(b=>b.owner==='worker-core');
 if(!t.serviceInstanceId||engines.length!==1||workers.length!==1) {errors.push('missing-exact-runtime-receiving-closure');continue;}
 const engine=engines[0],worker=workers[0];if(engine.role!=='buster'||worker.role!=='buster')errors.push('wrong-runtime-role');
 if(r.components['buster-engine']!==root.components['buster-engine']||r.components['worker-core']!==root.components['worker-core'])errors.push('wrong-runtime-owner-path');
 const settings=documents['buster-engine']?.profiles[engine.profileId]?.settings,ws=documents['worker-core']?.profiles[worker.profileId];
 if(!settings||!ws){errors.push('missing-runtime-resource-profile');continue;}
 if(!['security-source-A','security-https-source-A'].includes(engine.profileId)||worker.profileId!=='local-A')errors.push('wrong-captured-runtime-context');
 const network=engine.profileId==='security-https-source-A'?assoc.httpsStand:assoc.network;
 if(JSON.stringify(settings.execution.capabilityProviders.networkHttp)!==JSON.stringify(network)||JSON.stringify(settings.execution.capabilityProviders.securityScan)!==JSON.stringify(assoc.securityScan)||JSON.stringify(settings.clusterInvokers.runtimeSecurity)!==JSON.stringify(assoc.runtimeSecurity))errors.push('wrong-captured-native-resource-projection');
 const caps=decls[t.registrationId.split(':')[1]]?.requiredCapabilities??[];if(caps.some(c=>!settings.remotePlanService.allowedCapabilities.includes(c)))errors.push('missing-declared-capability-ceiling');
 }return [...new Set(errors)];}
''' + s[b:]
# Emit corrected additional checks BEFORE final observations write.
extra='''
const supplemental=read('docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/correction-controls.json');
const controlObservations=[];
for(const control of supplemental.headerControls){const o=read(control.ownerPath),p=o.profiles.A.registrations.headers.processing,rules=resolvedSelectedRules(p),names=[...new Set(rules.map(r=>r.header))],nativeError=errorOf(()=>nativeHeaderContext.names(names)),semanticErrors=semanticOwnerErrors(o),schemaAccepts=ov(o);
 record('SEC01-complete-owner-control-'+control.id,schemaAccepts&&nativeError===control.expectedNativeError&&(semanticErrors.length===0)===control.admit&&rules.length===control.expectedRules&&names.length===control.expectedUnique,{schemaAccepts,nativeError,semanticErrors,ruleCount:rules.length,uniqueRequestedHeaderNames:names.length});
 if(control.currentSourceComparable)record('SEC01-current-real-rule-resolution-'+control.id,JSON.stringify(headers.rules(p.profile,p.rules))===JSON.stringify(rules));
 controlObservations.push({id:control.id,schemaAccepts,nativeError,semanticErrors,ruleCount:rules.length,uniqueRequestedHeaderNames:names.length,returnedNames:nativeError?null:Array.from(nativeHeaderContext.names(names)),providerOrNativeInvoked:false});}
for(const control of supplemental.bindingControls){const r=read(control.entryPath),docs=control.componentsPath?read(control.componentsPath):componentDocuments,errors=entryErrors(r,docs),schemaAccepts=rv(r);record('SEC02-whole-root-control-'+control.id,(errors.length===0)===control.admit&&(!control.expectedError||errors.includes(control.expectedError)),{schemaAccepts,errors});controlObservations.push({id:control.id,schemaAccepts,errors,productiveSelectionExecuted:false});}
write('correction-control-observations.json',{qualification:'Only complete author fixture/schema/source rule and isolated native response-name argument boundary checks, no class/invoke/transport',controls:controlObservations});
'''
s=s.replace("write('definition-observations.json'",extra+"write('definition-observations.json'")
(O/'check-definition.mjs').write_text(s)
owner=read(P/'config/plugins/kubeclaw.security-providers.config.json');root=read(P/'config/pipeline.config.json');controls=[]
def rule(i,header):return {'id':f'extra-{i}','header':header,'severity':'low','kind':'present'}
variants=[('unique-32',28,lambda i:f'x-extra-{i}',None,True,32,32),('unique-33',29,lambda i:f'x-extra-{i}','HTTP_RESPONSE_HEADERS_INVALID',False,33,33),('denied-connection',1,lambda i:'connection','HTTP_RESPONSE_HEADERS_INVALID',False,5,5),('content-length-exception',1,lambda i:'content-length',None,True,5,5),('rules-64-shared-names',60,lambda i:'x-content-type-options',None,True,64,4)]
for id,n,header,error,admit,count,unique in variants:
 o=json.loads(json.dumps(owner));o['profiles']['A']['registrations']['headers']['processing']['rules']['add']=[rule(i,header(i))for i in range(n)];
 if id=='rules-64-shared-names':
  h=o['profiles']['A']['registrations']['headers']['processing'];h['presets']['api-http-v1']+=h['rules']['add'];h['rules']['add']=[]
 path=f'fixtures/owners/{id}.json';write(path,o);controls.append({'id':id,'ownerPath':str(O/path),'expectedNativeError':error,'admit':admit,'expectedRules':count,'expectedUnique':unique,'currentSourceComparable':id!='rules-64-shared-names'})
# Native denied names individually, while preserving allowed source grammar.
for name in ['host','proxy-authorization','transfer-encoding','upgrade']:
 o=json.loads(json.dumps(owner));o['profiles']['A']['registrations']['headers']['processing']['rules']['add']=[rule(0,name)];path=f'fixtures/owners/denied-{name}.json';write(path,o);controls.append({'id':'denied-'+name,'ownerPath':str(O/path),'expectedNativeError':'HTTP_RESPONSE_HEADERS_INVALID','admit':False,'expectedRules':5,'expectedUnique':5,'currentSourceComparable':True})
# Exact composition proof: removal masks an otherwise-denied replacement; selected preset participates.
for id,remove,admit in [('replace-denied',[],False),('remove-before-replace-denied',['content-security-policy'],True)]:
 o=json.loads(json.dumps(owner));h=o['profiles']['A']['registrations']['headers']['processing'];h['rules']['replace']=[{'id':'content-security-policy','header':'connection','severity':'high','kind':'present'}];h['rules']['remove']=remove;path=f'fixtures/owners/{id}.json';write(path,o);controls.append({'id':id,'ownerPath':str(O/path),'expectedNativeError':None if admit else 'HTTP_RESPONSE_HEADERS_INVALID','admit':admit,'expectedRules':3 if admit else 4,'expectedUnique':3 if admit else 4,'currentSourceComparable':True})
o=json.loads(json.dumps(owner));o['profiles']['A']['registrations']['headers']['processing']['presets']['api-http-v1'][1]['header']='connection';path='fixtures/owners/selected-preset-denied.json';write(path,o);controls.append({'id':'selected-preset-denied','ownerPath':str(O/path),'expectedNativeError':'HTTP_RESPONSE_HEADERS_INVALID','admit':False,'expectedRules':4,'expectedUnique':4,'currentSourceComparable':False})
bind=[]
def binding(id,mutate,admit,error=None):
 r=json.loads(json.dumps(root));mutate(r);path=f'fixtures/entries/{id}.json';write(path,r);bind.append({'id':id,'entryPath':str(O/path),'admit':admit,'expectedError':error})
def sec(r):return [t for t in r['pluginSelections']if t['packageId']=='kubeclaw.security-providers']
binding('same-runtime-five',lambda r:None,True)
binding('split-service',lambda r:sec(r)[2].update(serviceInstanceId='fixture.service.buster-preparation'),False,'split-one-package-service-context')
binding('missing-service',lambda r:sec(r)[2].pop('serviceInstanceId'),False,'missing-exact-runtime-receiving-closure')
binding('all-preparation-context',lambda r:[t.update(serviceInstanceId='fixture.service.buster-preparation')for t in sec(r)],False,'missing-exact-runtime-receiving-closure')
binding('wrong-role',lambda r:[b.update(role='prism')for b in r['bindings']if b['instanceId']=='fixture.service.buster-runtime' and b['owner']=='buster-engine'],False,'wrong-runtime-role')
binding('wrong-worker-role',lambda r:[b.update(role='prism')for b in r['bindings']if b['instanceId']=='fixture.service.buster-runtime' and b['owner']=='worker-core'],False,'wrong-runtime-role')
binding('wrong-native-context',lambda r:[b.update(profileId='local-A')for b in r['bindings']if b['instanceId']=='fixture.service.buster-runtime' and b['owner']=='buster-engine'],False,'wrong-captured-runtime-context')
binding('missing-worker',lambda r:r.update(bindings=[b for b in r['bindings']if not(b['instanceId']=='fixture.service.buster-runtime' and b['owner']=='worker-core')]),False,'missing-exact-runtime-receiving-closure')
binding('duplicate-runtime',lambda r:r['bindings'].append(next(b.copy()for b in r['bindings']if b['instanceId']=='fixture.service.buster-runtime' and b['owner']=='buster-engine')),False,'missing-exact-runtime-receiving-closure')
binding('split-owner',lambda r:sec(r)[2].update(ownerPath='plugins/kubeclaw.http.config.json'),False,'split-one-package-owner-path')
binding('same-TLS-runtime-five',lambda r:[b.update(profileId='security-https-source-A')for b in r['bindings']if b['instanceId']=='fixture.service.buster-runtime' and b['owner']=='buster-engine'],True)
# Full component documents mutation, exact captured resource mismatch (not an isolated operator delta).
docs={k:read(P/'config'/rel)for k,rel in root['components'].items()};docs['buster-engine']['profiles']['security-source-A']['settings']['execution']['capabilityProviders']['networkHttp']['maximumResponseBytes']-=1;write('fixtures/components/resource-mismatch.json',docs);binding('resource-projection-mismatch',lambda r:None,False,'wrong-captured-native-resource-projection');bind[-1]['componentsPath']=str(O/'fixtures/components/resource-mismatch.json')
write('correction-controls.json',{'headerControls':controls,'bindingControls':bind,'qualification':'Author-local complete fixture definitions; invalid admission controls are NOT proposed safe B profiles. Native/effect cases unchanged not-run.'})
fields=read(P/'field-definitions.json')['rows'];cases=read(P/'case-definitions.json')['cases'];headerids=['RT-611f5b01895a7c90','RT-93c925a29f21dd8d','RT-d852318fd5b15892','RT-8a73cb4fa2939ad4','RT-6ecf22c1afd37e91']
write('normative-correction-generation.json',{'generation':'security-provider-contracts-02','entryGeneration':'pipeline-entry.v5','receiverGeneration':'provider-configuration.v2','base':str(P),'supersedesOnly':['SEC-R01-01 resolved selected headers contextual admission','SEC-R01-02 same whole package runtime closure admission'],'schemasProfilesEntriesUnchanged':True,'schemaRefsRemainExactFrozen01Nodes':True,'activeFields':[{'id':f['id'],'baseFieldRef':str(P/'field-definitions.json')+'#/rows/'+str(i),'schemaBinding':f['targetSchemaBinding']}for i,f in enumerate(fields)],'originalCases':[{'id':c['id'],'baseCaseRef':str(P/'case-definitions.json')+'#/cases/'+str(i),'correctionRef':'header-and-package-correction-contracts.json','futureStatus':'not-run'}for i,c in enumerate(cases)],'implicitV6Integration':False,'freshIndependentReviewRequired':True,'globalC0Accepted':False,'implementationAuthorization':None})
write('header-and-package-correction-contracts.json',{'header':{'affectedOriginalSettingIds':headerids,'allEditableSelectedPresetsAlsoParticipate':True,'linkedOriginalCaseIds':[c['id']for c in cases if set(c['thisCutSettingIds'])&set(headerids)],'sourceResolution':'captured selected preset -> remove -> replace existing base id -> add; source rules1..64 remain supported','contextualAdmission':'After exact resolution, pass unique resolved rule.header list to pinned pure source responseHeaderNames domain: supplied list<=32; denied connection/host/proxy-authorization/transfer-encoding/upgrade reject; content-length explicitly allowed. Native adds content-type AFTER supplied-list cap: returned list can be33. Catalogue fixed/not editable.','failure':'HTTP_RESPONSE_HEADERS_INVALID before initial fetch; valid schema shape is not contextual compatibility','futureOracle':'Real future selected provider request uses same resolved names; exact32 admitted at argument guard,33/denied no initial request;64 rules with4 distinct names admitted, predicates/findings still per rule; content-length may still fail transport-body/content-length guards independently. Preserve original F-EFFECT, mutant, grant, recovery and fixed Eval observations not-run.'},'binding':{'affectedOriginalSettingIds':[f['id']for f in fields],'linkedOriginalCaseIds':[c['id']for c in cases],'closure':'all5 actual registration tuples share exact instance/profile/ownerPath/service. Exactly one buster-engine and worker-core binding on that service, role buster, complete declared component owner/profile present; captured networkHttp/securityScan/runtimeSecurity projections equal frozen original HTTP or conditional TLS stand and manifest requiredCapabilities within declared resource ceiling. Never any-Buster-owner fallback.','futureOracle':'Validate immutable root/owner/schema/package/task/profile/service/role/resource digests and whole profile identity at actual resolver->plan->runner->envelope->invocation->native receiving boundary; shared5 identities coherent at R and stored J. Split/missing service, preparation-only, wrong-role/context/native-resource projection fail before effect. B requires fresh eligible generation; stored A, recovery, uncertain effects, cleanup and fixed Eval retain original A and advancing clocks. Real grants/installed roster absent.','separateInstances':'Other authenticated instances are not globally prohibited; they require separate complete owner and captured generation/service closure, actual existing one-key registry ABI must authenticate/select one generation at registration boundary. No simultaneous same-key routing or second author invented.'},'originalState':'89 original rows and587 original canonical/native bodies unchanged;586 implementation-proposal/not-run +1 C0/not-run;25 unsupported distinct alternates remain OPEN; all grants/native/real F-EFFECT/MUT/BIND/recovery/fixed Eval requirements retained'})
print(json.dumps({'filesWritten':len(list(O.rglob('*'))),'headerControls':len(controls),'bindingControls':len(bind),'frozen01ReviewFiles':len(inputs)}))
