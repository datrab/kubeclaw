import pathlib
b=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0/docs/review/evidence/config-acceptance/c0-completion-20261013/gateway-openclaw-profile-02');p=b/'check-gateway-definition.mjs';s=p.read_text()
s=s.replace("function validate(p,context){", "function validate(p,capture=contextCapture,expected={}){const context=resolveContext(p.readonlyBindings.bootstrapContextRef,capture,{...expected,receivingProfileId:p.profileId,role:p.role,instanceId:p.instanceId});")
a=s.index('const duration=m.agents.defaults.contextPruning.ttl.match');z=s.index('return {profileId:p.profileId',a)
s=s[:a]+"const ttl=parseDurationMs(m.agents.defaults.contextPruning.ttl,{defaultUnit:'m'});assert(Number.isSafeInteger(ttl)&&ttl>=0,'TTL_EXACT_NONNEGATIVE_SAFE_INTEGER');"+s[z:]
a=s.index('function resolve(o,request');z=s.index('const selection=',a)
s=s[:a]+'''function resolve(o,request,selection,ambient={},capture=contextCapture){assert(validOwner(o),'OWNER_SCHEMA:'+JSON.stringify(validOwner.errors));for(const [pid,p] of Object.entries(o.profiles)){const context=resolveContext(p.readonlyBindings.bootstrapContextRef,capture,{ownerProfileId:pid,ownerPath:'charts/kubeclaw/values.yaml',role:p.role,instanceId:p.instanceId});const m=structuredClone(p.settings.gatewayOpenClaw);m.memory.search.remote.baseUrl=p.settings.litellm.endpoint;const projection={schemaVersion:'gateway-openclaw-profile.v1-proposal',profileId:context.association.receivingProfileId,role:p.role,instanceId:p.instanceId,managedOpenClaw:m,readonlyBindings:p.readonlyBindings};assert(eq(p.settings.agent.model,{primary:p.readonlyBindings.modelRoute.primary,fallbacks:p.readonlyBindings.modelRoute.fallbacks}),'AGENT_MODEL_SOLE_SOURCE_MISMATCH');validate(projection,capture,{ownerProfileId:pid,ownerPath:'charts/kubeclaw/values.yaml'});}assert(eq(request,{role:selection.role,deploymentInstanceId:selection.deploymentInstanceId,consumer:'openclaw-gateway',serviceInstanceId:selection.serviceInstanceId}),'WRONG_ROLE_ORIGINAL_CALLER');assert(selection.ownerPath==='charts/kubeclaw/values.yaml','WRONG_OWNER_PATH');const chosen=o.profiles[selection.profileId];assert(chosen,'MISSING_PROFILE');assert(chosen.role===selection.role&&chosen.instanceId===selection.serviceInstanceId,'SELECTION_SOURCE_IDENTITY');assert(!Object.keys(ambient).length,'OLD_ENV_CLI_PVC_EQUAL_OVERRIDE_REJECTED');return chosen;}
''' +s[z:]
s=s.replace(',contexts[label])',')').replace(',contexts.A)',')')
s=s.replace("['embedded TTL exceeds timer-safe source domain',p=>p.managedOpenClaw.agents.defaults.contextPruning.ttl='100000d'],","['embedded TTL overflows safe integer source domain',p=>p.managedOpenClaw.agents.defaults.contextPruning.ttl='999999999999999999999999999999999999d'],")
insert='''
// Inspected exact source helpers only: no native entrypoint/import, file/network/process access inside VM.
const msModule={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(base,'duration-source/ms/index.js'),'utf8'),{module:msModule},{timeout:1000});
const stringSource=fs.readFileSync(path.join(base,'duration-source/dist/string-coerce-CIXf7egm.mjs'),'utf8').replace(/export \\{[\\s\\S]*$/,'');
const durationSource=fs.readFileSync(path.join(base,'duration-source/dist/parse-duration-DBWI377R.mjs'),'utf8');
assert(durationSource.startsWith('import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.mjs";\\nimport milliseconds from "ms";'),'EXACT_DURATION_IMPORTS');
const pureDuration=durationSource.slice(durationSource.indexOf('//#region')).replace(/export \\{[\\s\\S]*$/,'');
const durationVm={milliseconds:msModule.exports};vm.runInNewContext(stringSource+'\\n'+pureDuration+'\\nthis.parseDurationMs=parseDurationMs;',durationVm,{timeout:1000});const parseDurationMs=durationVm.parseDurationMs;
const contextCapture=read(path.join(base,'managed-bootstrap-context.json')),recipes=read(path.join(base,'readonly-context-source-recipes.json')).recipes;
const contextSha=d=>crypto.createHash('sha256').update(JSON.stringify(d,null,2)+'\\n').digest('hex');
assert(contextSha(contextCapture)===sha(path.join(base,'managed-bootstrap-context.json')),'CONTEXT_CANONICAL_RAW_CODEC');
const sourceInputs=contextCapture.contexts.A.association.sourceInputs;
const associationSchema={type:'object',additionalProperties:false,required:['ownerPath','ownerProfileId','receivingProfileId','role','instanceId','sourceRecipeId','sourceInputs'],properties:{ownerPath:{const:'charts/kubeclaw/values.yaml'},ownerProfileId:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'},receivingProfileId:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'},role:{const:'buster'},instanceId:{const:'agent-buster-gateway'},sourceRecipeId:{enum:['A','B']},sourceInputs:{const:sourceInputs}}};
const validAssociation=ajv.compile(associationSchema),validContextRef=ajv.compile(read(path.join(base,'gateway-profile.schema.json')).properties.readonlyBindings.properties.bootstrapContextRef);
function resolveContext(ref,capture,expected){assert(validContextRef(ref),'CONTEXT_REF_CLOSED_SCHEMA:'+JSON.stringify(validContextRef.errors));assert(ref.path==='managed-bootstrap-context.json','CONTEXT_WRONG_PATH');assert(contextSha(capture)===ref.sha256,'CONTEXT_SOURCE_SHA');assert(eq(Object.keys(capture).sort(),['contexts','nativeFullSchema']),'CONTEXT_CAPTURE_CLOSED');const c=pointer(capture,ref.pointer);assert(validAssociation(c.association),'CONTEXT_ASSOCIATION_SCHEMA:'+JSON.stringify(validAssociation.errors));for(const [key,value]of Object.entries(expected))assert(c.association[key]===value,'CONTEXT_ASSOCIATION_'+key);assert(c.agentRole===c.association.role,'CONTEXT_RECIPE_ROLE');const recipe=structuredClone(c);delete recipe.association;assert(eq(recipe,recipes[c.association.sourceRecipeId]),'CONTEXT_READONLY_SOURCE_RECIPE');return c;}
'''
s=s.replace('function validate(p,',insert+'\nfunction validate(p,',1)
s=s.replace("const m=p.managedOpenClaw,b=p.readonlyBindings;", "const m=p.managedOpenClaw,b=p.readonlyBindings;assert(eq(context.agentModel,b.modelRoute),'CONTEXT_MODEL_SOURCE_PROFILE');")
# Declare reference/schema/body check evidence plus positive/negative duration and association controls.
extra='''
for(const [raw,want]of [['1h30m',5400000],[' 2H ',7200000],['1.5',90000],['0',0],['2147483648ms',2147483648],['100000d',8640000000000],['9007199254740991ms',9007199254740991],['0.4ms',0]])check('exact archived pure duration '+raw,()=>assert(parseDurationMs(raw,{defaultUnit:'m'})===want,'DURATION_VALUE'));
for(const raw of ['','invalid','-1m','1h 30m','1w','1e3ms','9007199254740992ms','999999999999999999999999999d'])check('exact archived malformed/overflow duration '+raw,()=>parseDurationMs(raw,{defaultUnit:'m'}),true);
for(const raw of ['0','100000d','1h30m'])check('whole proposed profile supported duration '+raw,()=>{const p=structuredClone(profiles.A);p.managedOpenClaw.agents.defaults.contextPruning.ttl=raw;return validate(p);});
function expiredAdmission({now,lastTouch,ttlMs,pruneNewRounds=true,mode='cache-ttl',eligible=true}){assert(Number.isSafeInteger(ttlMs)&&ttlMs>=0,'PARSED_DURATION_DOMAIN');assert(Number.isInteger(now)&&Number.isInteger(lastTouch)&&Math.abs(now)<=8640000000000000&&Math.abs(lastTouch)<=8640000000000000,'TIMESTAMP_REPRESENTABILITY');const age=now-lastTouch;assert(Number.isSafeInteger(age),'ELAPSED_SUBTRACTION_NOT_REPRESENTABLE');return mode==='cache-ttl'&&eligible&&pruneNewRounds&&!!lastTouch&&ttlMs>0&&!(age<ttlMs);}
for(const [name,input,want]of [
 ['beyond2^31 age below',{now:3000000001,lastTouch:1,ttlMs:4000000000},false],
 ['beyond2^31 exact threshold',{now:4000000001,lastTouch:1,ttlMs:4000000000},true],
 ['zero disables',{now:100,lastTouch:1,ttlMs:0},false],
 ['no last touch zero sentinel',{now:100,lastTouch:0,ttlMs:1},false],
 ['off mode',{now:100,lastTouch:1,ttlMs:1,mode:'off'},false],
 ['ineligible no guard',{now:100,lastTouch:1,ttlMs:1,eligible:false},false],
 ['no new rounds',{now:100,lastTouch:1,ttlMs:1,pruneNewRounds:false},false],
 ['clock regression native not expired',{now:1,lastTouch:100,ttlMs:1},false],
 ['safe duration beyond Date maximum comparison not timer',{now:100,lastTouch:1,ttlMs:9007199254740991},false]
])check('consumer elapsed admission '+name,()=>assert(expiredAdmission(input)===want,'ELAPSED_SEMANTIC'));
for(const [name,input]of [['nonfinite now',{now:Infinity,lastTouch:1,ttlMs:1}],['Date overflow',{now:8640000000000001,lastTouch:1,ttlMs:1}],['subtraction precision overflow',{now:8640000000000000,lastTouch:-8640000000000000,ttlMs:1}],['negative parsed duration',{now:100,lastTouch:1,ttlMs:-1}]])check('consumer timestamp/duration rejection '+name,()=>expiredAdmission(input),true);
check('actual cache source no timer and malformed native fallback remains counterexample',()=>{const source=fs.readFileSync(path.join(root,'docs/review/evidence/config-acceptance/delivery/pinned-openclaw-2026.9.5/dist/tool-result-truncation-CS-9YGQx.mjs'),'utf8');assert(source.includes('settings.ttlMs <= 0 || params.now - params.lastCacheTouchAt < settings.ttlMs'),'ACTUAL_ELAPSED_GUARD');const start=source.indexOf('function resolveCacheTtlPruningSettings('),end=source.indexOf('function cacheTtlText(',start),cut=source.slice(start,end);assert(cut.includes('let ttlMs = 3e5;')&&cut.includes('} catch {}')&&!cut.includes('setTimeout'),'ACTUAL_FALLBACK_NOT_TIMER');return 'target exact parse rejects before native fallback; elapsed guard proof only, provider/transcript/native effects unrun';});
for(const pid of ['local-A','local-B'])for(const [name,mutate]of [
 ['missingref',p=>delete p.readonlyBindings.bootstrapContextRef],
 ['unknowncontext',p=>p.readonlyBindings.bootstrapContextRef.pointer='/contexts/missing'],
 ['wrongsource',p=>p.readonlyBindings.bootstrapContextRef.sha256='0'.repeat(64)],
 ['wrongprofile',p=>p.readonlyBindings.bootstrapContextRef.pointer=pid==='local-A'?'/contexts/B':'/contexts/A'],
 ['escape',p=>p.readonlyBindings.bootstrapContextRef.path='../managed-bootstrap-context.json'],
 ['unknownrefkey',p=>p.readonlyBindings.bootstrapContextRef.extra='fallback']
])check('all declared selected/unselected context '+pid+'/'+name,()=>{const o=structuredClone(owner);mutate(o.profiles[pid]);return resolve(o,caller,selection);},true);
for(const pid of ['local-A','local-B'])for(const [name,mutate]of [
 ['wrongrole',c=>c.association.role='nova'],['wrongsourceinputs',c=>c.association.sourceInputs[0].sha256='0'.repeat(64)],['wrongownerprofile',c=>c.association.ownerProfileId='other'],['wrongreceivingprofile',c=>c.association.receivingProfileId='other'],['changedreadonlyrecipe',c=>c.installedPluginAllow=[]],['unknownassociationkey',c=>c.association.installedGrant='fake']
])check('all declared association '+pid+'/'+name,()=>{const o=structuredClone(owner),d=structuredClone(contextCapture);const key=pid==='local-A'?'A':'B';mutate(d.contexts[key]);for(const p of Object.values(o.profiles))p.readonlyBindings.bootstrapContextRef.sha256=contextSha(d);return resolve(o,caller,selection,{},d);},true);
// Existing arbitrary valid profile-key domain retained. Explicit own context, not B fallback.
const cOwner=structuredClone(owner),cCapture=structuredClone(contextCapture);cOwner.profiles['new-C']=structuredClone(cOwner.profiles['local-B']);cCapture.contexts.C=structuredClone(cCapture.contexts.B);cCapture.contexts.C.association.ownerProfileId='new-C';cCapture.contexts.C.association.receivingProfileId='C';cOwner.profiles['new-C'].readonlyBindings.bootstrapContextRef.pointer='/contexts/C';for(const p of Object.values(cOwner.profiles))p.readonlyBindings.bootstrapContextRef.sha256=contextSha(cCapture);
check('new schema-valid named profile with own exact explicit context',()=>resolve(cOwner,caller,{...selection,profileId:'new-C'},{},cCapture));
check('new named profile borrowed B context rejected',()=>{const o=structuredClone(cOwner);o.profiles['new-C'].readonlyBindings.bootstrapContextRef.pointer='/contexts/B';return resolve(o,caller,{...selection,profileId:'new-C'},{},cCapture);},true);
check('explicit receiving profile bad context ref rejected independently of owner selection',()=>{const p=structuredClone(profiles.A);p.readonlyBindings.bootstrapContextRef.pointer='/contexts/B';return validate(p);},true);
'''
s=s.replace('const failures=observations.filter',extra+'\nconst failures=observations.filter')
p.write_text(s)
