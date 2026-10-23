import json,hashlib,copy,shutil,re,zlib,struct
from pathlib import Path
B=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');O=B/'browser-provider-contracts-01';P=B/'same-entry-deployment-binding-02';L=Path('docs/review/evidence/config-acceptance/runtime/batches/bce3f075-browser-04');R=B/'runtime-provider-contracts-03';S=Path('skills/buster/plugins')
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest();clone=copy.deepcopy
def write(p,x):
 p=O/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2)+'\n')
def obj(p,required=None):return {'type':'object','additionalProperties':False,'properties':p,'required':list(p)if required is None else required}
def strip(x):
 if isinstance(x,dict):return {k:strip(v)for k,v in x.items()if k not in ['default','$schema','description']}
 if isinstance(x,list):return [strip(v)for v in x]
 return x
name={'type':'string','minLength':1,'maxLength':64,'pattern':'^[A-Za-z0-9][A-Za-z0-9._-]*$'}
groups=read(B/'independent-whole-c0-readiness-review-01/runtime-residual-contract-groups.json')['groups'];selected={k:v for k,v in groups.items()if any(x in k.lower()for x in ['axe','lighthouse','playwright','visual'])};members=[(k,m)for k,v in selected.items()for m in v];assert len(members)==105
inv={x['id']:x for x in read('docs/review/remediation/config-semantic-inventory.json')['rows']};matrix={x['id']:x for x in read('docs/review/remediation/config-acceptance-matrix.json')['cases']};native=read('docs/review/evidence/config-acceptance/runtime/case-proposals.json');native=native.get('cases',native)if isinstance(native,dict)else native;native={x['id']:x for x in native};legacy={x['setting']:x for x in read(L/'contracts.json')['entries']}
providers=['axe','lighthouse','playwright','visual'];manifests={p:read(S/p/'plugin.json')for p in providers};schemas={p:read(S/p/'schemas/config.schema.json')for p in providers};ownedlegacy={p:strip(read(L/f'{p}-owned.schema.json'))for p in providers}
# Entire frozen reviewed stand, unchanged six owners/four prior package policies/controller/recovery.
shutil.copytree(P/'stand',O/'stand',dirs_exist_ok=True)
root=read(P/'stand/config/pipeline.config.json');bs=read(O/'stand/config/components/buster-engine.config.json');baseline=clone(bs['profiles']['provider-network-A']);baseline['settings']['execution']['capabilityProviders']['browserAccess']['allowedOrigins']=['http://127.0.0.1:18080','http://127.0.0.1:18081'];baseline['settings']['execution']['capabilityProviders']['browserPlaywright']['allowedTargetPorts']=[18080,18081];bs['profiles']['browser-source-A']=baseline;write('stand/config/components/buster-engine.config.json',bs)
next(b for b in root['bindings']if b['owner']=='buster-engine'and b['instanceId']=='fixture.service.buster-runtime')['profileId']='browser-source-A'
for p in providers:root['pluginSelections'].append({'kind':'test-provider','packageId':f'kubeclaw.{p}','registrationId':f'kubeclaw.{p}:{p}','instanceId':f'fixture.{p}','ownerPath':f'plugins/kubeclaw.{p}.config.json','profileId':'A','serviceInstanceId':'fixture.service.buster-runtime'})
write('stand/config/pipeline.config.json',root)
rs=read(P/'schemas/pipeline-entry.schema.json');tp=rs['properties']['pluginSelections']['items']['properties']
for p in providers:
 tp['packageId']['enum'].append(f'kubeclaw.{p}');tp['registrationId']['enum'].append(f'kubeclaw.{p}:{p}');tp['ownerPath']['enum'].append(f'plugins/kubeclaw.{p}.config.json')
write('schemas/pipeline-entry.schema.json',rs)
# Native profile baseline is actual source business preset, never executable/version/grant identity.
bp=lambda w,h,t=False:{'browser':'chromium','viewport':{'width':w,'height':h},'colorScheme':'light','reducedMotion':'no-preference','locale':'en-US','timezoneId':'UTC','hasTouch':t,'isMobile':t,'deviceScaleFactor':1}
axe={'profiles':{'desktop':bp(1440,900),'mobile':bp(390,844,True)},'selectedProfiles':['desktop','mobile'],'tags':['wcag2a','wcag2aa'],'exclude':[],'acceptances':[],'timeoutMs':30000}
lhp=lambda mobile:{'formFactor':'mobile'if mobile else 'desktop','screen':{'width':390 if mobile else 1440,'height':844 if mobile else 900,'deviceScaleFactor':1,'mobile':mobile},'throttling':{'rttMs':0,'throughputKbps':100000,'cpuSlowdownMultiplier':1}}
lh={'settings':{'schemaVersion':'kubeclaw.lighthouse-settings.v1','profiles':{'desktop':lhp(False),'mobile':lhp(True)},'budgets':{'relaxed':{'minimumScore':80,'maximumLcpMs':3000,'maximumCls':1,'maximumTbtMs':1000},'strict':{'minimumScore':90,'maximumLcpMs':3000,'maximumCls':1,'maximumTbtMs':1000}}},'byPurpose':{p:{'runs':3 if p=='performance'else 1,'timeoutMs':120000,'selectedProfile':'desktop','selectedBudget':'relaxed'if p=='performance'else None,'acceptances':[]}for p in ['performance','seo','best-practices']}}
pw={'workers':1,'timeoutMs':600000,'minimumExecutedTests':2,'requiredTests':['home.spec.ts > project-owned assertion > real-chromium']}
visual={'profiles':{'desktop':bp(640,480),'mobile':bp(390,844,True)},'comparisonProfiles':{'strict-v1':{'maximumDifferencePercent':0,'pixelThreshold':.1,'uncertaintyMarginPercent':0},'balanced-v1':{'maximumDifferencePercent':.5,'pixelThreshold':.1,'uncertaintyMarginPercent':.25}},'selectedComparisonProfile':'strict-v1','overrides':{},'masks':[],'timeoutMs':30000}
processing={'axe':axe,'lighthouse':lh,'playwright':pw,'visual':visual};owner={};profileSchemas={};taskSchemas={}
for p in providers:
 d=manifests[p]['testProviders'][0];declarations={'retrySafe':d['retrySafe'],'matrixFields':[],'evidenceDefaults':clone(d['evidenceDefaults'])};owner[p]={'schemaVersion':'pipeline-package-policy.v1','packageId':f'kubeclaw.{p}','instanceId':f'fixture.{p}','profiles':{'A':{'processing':clone(processing[p]),'declarations':declarations}}}
 ps=clone(ownedlegacy[p])
 if p=='lighthouse':
  # Preserve supported partial/no-budget domain; all configured values explicit, no invented mandatory four metrics.
  budget=ps['properties']['settings']['properties']['budgets']['additionalProperties'];budget['required']=[];budget['minProperties']=1
  for key,pr in ps['properties']['byPurpose']['properties'].items():
   if key=='performance':pr['properties']['selectedBudget']={'anyOf':[clone(name),{'type':'null'}]}
   pr['properties']['acceptances']=strip(schemas[p]['properties']['acceptances'])
 elif p=='visual':
  cmp=ps['properties'].pop('comparison');ps['properties']['comparisonProfiles']=obj({k:clone(cmp)for k in ['strict-v1','balanced-v1']});ps['properties']['selectedComparisonProfile']={'enum':['strict-v1','balanced-v1']};ps['properties']['overrides']=strip(schemas[p]['properties']['overrides']);ps['required']=list(ps['properties'])
 declschema=obj({'retrySafe':{'enum':[True,False]if d['retrySafe']else [False]},'matrixFields':{'type':'array','maxItems':0,'items':{'type':'string'}},'evidenceDefaults':obj({k:{'type':'array','minItems':len(v),'maxItems':len(d['evidenceTypes']),'uniqueItems':True,'items':{'enum':d['evidenceTypes']},'allOf':[{'contains':{'const':typ}}for typ in v]}for k,v in d['evidenceDefaults'].items()})})
 profileSchemas[p]=obj({'processing':ps,'declarations':declschema});os=obj({'schemaVersion':{'const':'pipeline-package-policy.v1'},'packageId':{'const':f'kubeclaw.{p}'},'instanceId':{'type':'string','minLength':1,'maxLength':128,'pattern':'^[a-zA-Z0-9][a-zA-Z0-9._-]*$'},'profiles':{'type':'object','minProperties':1,'additionalProperties':profileSchemas[p]}});write(f'schemas/kubeclaw.{p}.schema.json',os)
 taskkeys={'axe':['url','endpointName','routes'],'lighthouse':['purpose','url','endpointName','routes'],'playwright':['url','endpointName','projectDirectory','configFile'],'visual':['url','endpointName','manifestFile','targets']}[p]
 ts=obj({k:strip(schemas[p]['properties'][k])for k in taskkeys},[k for k in schemas[p]['required']if k in taskkeys]);taskSchemas[p]=ts;write(f'schemas/{p}.task.schema.json',ts)
# Genuine repository source fixtures, copied not executed. Explicit task source variants, not CONFIG policy migration.
project=O/'task-fixtures/repository/playwright';shutil.copytree(S/'playwright/tests/fixture',project,dirs_exist_ok=True);shutil.copytree(S/'playwright/tests/fixture',project/'nested',dirs_exist_ok=True)
(project/'nested/specs/home.spec.ts').write_text((project/'nested/specs/home.spec.ts').read_text().replace("'E2E ready'","'E2E alternate'"))
(project/'playwright-b.config.ts').write_text((project/'playwright.config.ts').read_text().replace('retries: 1','retries: 0'))
repoRelative=str((O/'task-fixtures/repository').as_posix())
html='''<!doctype html><html lang="en"><head><title>Source fixture</title><meta name="viewport" content="width=device-width"><style>body{background:white;color:black}#contrast{color:#aaa;background:white}#dynamic{width:80px;height:80px;background:#333}@media(max-width:500px){#responsive{display:none}}@media(prefers-color-scheme:dark){body{background:black;color:white}}@media(prefers-reduced-motion:reduce){#motion{animation:none}}#motion{animation:move 2s infinite}@keyframes move{to{transform:translateX(10px)}}</style></head><body><main><h1>E2E ready</h1><img id="case" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><p id="contrast">Contrast fixture</p><div id="responsive">Responsive fixture</div><div id="dynamic">Dynamic fixture</div><div id="motion">Motion fixture</div></main></body></html>'''
(O/'task-fixtures/repository/pages').mkdir(parents=True,exist_ok=True);(O/'task-fixtures/repository/pages/a.html').write_text(html);(O/'task-fixtures/repository/pages/b.html').write_text(html.replace('E2E ready','E2E alternate').replace('<img id="case"','<img alt="named fixture" id="case"'))
# Deterministic PNG byte fixtures, never screenshots or approved browser baselines.
def png(w,h,color):
 def chunk(t,d):return struct.pack('!I',len(d))+t+d+struct.pack('!I',zlib.crc32(t+d)&0xffffffff)
 raw=b''.join(b'\0'+bytes(color)*w for _ in range(h));return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
for w in [640,800]:
 path=O/f'task-fixtures/repository/baseline-{w}.png';path.write_bytes(png(w,480,[0,0,0,255]))
def manifest(w,variant):
 data=(O/f'task-fixtures/repository/baseline-{w}.png').read_bytes();dh='sha256:'+hashlib.sha256(data).hexdigest();profile=bp(w,480);conditions={k:profile[k]for k in ['colorScheme','reducedMotion','locale','timezoneId','deviceScaleFactor','hasTouch','isMobile']};conditions['fullPage']=True
 entries=[{'id':f'target-{letter}','route':f'/{letter}'if variant=='a'else '/b','profile':'desktop','baselineFile':f'baseline-{w}.png','sha256':dh,'browser':'chromium','browserVersion':'FIXTURE-UNOBSERVED-NOT-APPROVED','viewport':profile['viewport'],'pageConditions':conditions}for letter in ['a','b']];return {'schemaVersion':'kubeclaw.visual-baselines.v2','baselineBundleDigest':'sha256:'+hashlib.sha256('\n'.join(sorted(x['sha256']for x in entries)).encode()).hexdigest(),'entries':entries}
for w in [640,800]:
 for variant in ['a','b']:write(f'task-fixtures/repository/manifest-{w}-{variant}.json',manifest(w,variant))
write('task-fixtures/qualifications.json',{'html':'Source-defined byte files, not hosted/served endpoints','png':'Deterministic serialized image data, not browser rendering/screenshot/captured approved baseline','visualBrowserVersion':'Explicit UNOBSERVED fixture placeholder; genuine approved browser-bound recapture/version/manifest/baseline provenance still missing','playwrightSource':'Original fixture copied unchanged for primary project; nested variant changes expected heading, second config changes task retry1->0. Neither JS/TS config imported or executed. Test titles in report definitions are proposed source-shaped joins, not observed native report title receipt.'})
baseTasks={'axe':{'url':'http://127.0.0.1:18080','routes':['/a']},'lighthouse':{'purpose':'performance','url':'http://127.0.0.1:18080','routes':['/a']},'playwright':{'url':'http://127.0.0.1:18080','projectDirectory':'playwright','configFile':'playwright.config.ts'},'visual':{'url':'http://127.0.0.1:18080','manifestFile':'manifest-640-a.json','targets':['target-a','target-b']}}
for p,t in baseTasks.items():write(f'task-fixtures/{p}.task.json',t)
# Actual source-shaped synthetic assessment inputs only. Never fake provider invocation/native result execution.
write('fixtures/source-reports.json',{'axeViolation':{'id':'image-alt','impact':'critical','help':'Source-defined missing image alternate text','nodes':[{'target':['#case']}]},'lighthouseReports':[{'categories':{'performance':{'score':s},'seo':{'score':.8,'auditRefs':[{'id':'meta-description'}]},'best-practices':{'score':1,'auditRefs':[]}},'audits':{'largest-contentful-paint':{'numericValue':2500},'cumulative-layout-shift':{'numericValue':.2},'total-blocking-time':{'numericValue':100},'meta-description':{'score':0,'scoreDisplayMode':'numeric','title':'Document lacks a meta description'}}}for s in [.85,.8,.95,1,.99]],'playwrightReport':{'stats':{},'suites':[{'title':'home.spec.ts','specs':[{'title':'project-owned assertion','tests':[{'projectName':'real-chromium','status':'expected','results':[{'status':'passed'}]}]},{'title':'independent test continues','tests':[{'projectName':'real-chromium','status':'expected','results':[{'status':'passed'}]}]},{'title':'project-owned skip','tests':[{'projectName':'real-chromium','status':'skipped','results':[{'status':'skipped'}]}]}]}]},'visualDiffPercent':.25,'qualification':'Source assessment definitions, not genuine provider/native responses or output artifacts'})
fieldDefs=[];caseids=set();coord=[];profilePairs=[]
for group,m in members:
 id=m['id'];p='axe'if 'axe'in group else group.split('.')[-1];f=inv[id];old=legacy.get(id);a=clone(owner[p]['profiles']['A']);b=clone(a);taskA=clone(baseTasks[p]);taskB=clone(taskA);unavailable=None;notes=[]
 if old:
  field=old['field'];classification=old['classification'];current=old['currentSemantics'];legacyPair={'A':old['completeA'],'B':old['completeB']}
  if classification=='task-data':
   key=field.replace('[]','');taskA[key]=clone(old['completeA'][key]);taskB[key]=clone(old['completeB'][key]);
   for t in [taskA,taskB]:
    if 'url'in t:t['url']=t['url'].replace(':32123',':18080').replace(':32124',':18081')
    if key=='endpointName':t.pop('url',None)
    if 'projectDirectory'in t:t['projectDirectory']='playwright/nested'if t['projectDirectory']=='nested'else 'playwright'
    if 'configFile'in t:t['configFile']='playwright-b.config.ts'if '-b.'in t['configFile']else 'playwright.config.ts'
    if 'manifestFile'in t:t['manifestFile']='manifest-640-b.json'if '-b.'in t['manifestFile']else 'manifest-640-a.json'
   pointer='/properties/'+key
  else:
   q=a['processing'];z=b['processing'];key=field.split('[')[0].split('.')[0];pointer='/properties/profiles/additionalProperties/properties/processing'
   if p=='axe':
    if key=='profiles':q['selectedProfiles']=old['completeA']['profiles'];z['selectedProfiles']=old['completeB']['profiles'];suffix='/properties/selectedProfiles'+('/items'if '[]'in field else '')
    elif key=='profileFile':q['selectedProfiles']=z['selectedProfiles']=['desktop'];z['profiles']['desktop']['viewport']['width']=1280;suffix='/properties/profiles';notes.append('Legacy repository policy path replaced by captured full owned profile map; source file import is disposable provenance projection only, no second active task-policy author.')
    else:
     q[key]=clone(old['completeA'][key]);z[key]=clone(old['completeB'][key]);suffix='/properties/'+key
     if key=='acceptances':
      for side in [q,z]:
       for waiver in side['acceptances']:
        if waiver['rule']=='case-rule':waiver['rule']='image-alt'
        if waiver['rule']=='other':waiver['rule']='button-name'
        waiver['reason']=waiver['reason'].replace('approved','definition-only').replace('reviewed','definition-only')
     if '[]'in field:suffix+='/items';tail=field.split('[]',1)[1];suffix+=('/properties/'+tail[1:])if tail else ''
    pointer+=suffix
   elif p=='lighthouse':
    purpose='seo'if key=='acceptances'or old['fixedConditionalNoIndependentB']else 'performance';taskA['purpose']=taskB['purpose']=purpose
    if key=='settingsFile':z['settings']['budgets']['relaxed']['minimumScore']=90;suffix='/properties/settings'
    elif key in ['profile','budget','runs','timeoutMs','acceptances']:
     mapped={'profile':'selectedProfile','budget':'selectedBudget'}.get(key,key);suffix='/properties/byPurpose/properties/'+purpose+'/properties/'+mapped
     q['byPurpose'][purpose][mapped]=clone(old['completeA'][key]);z['byPurpose'][purpose][mapped]=clone(old['completeB'][key]);
     if key=='acceptances':
      for side in [q,z]:
       for waiver in side['byPurpose'][purpose]['acceptances']:
        if waiver['audit']=='case-audit':waiver['audit']='meta-description'
        if waiver['audit']=='other':waiver['audit']='document-title'
        waiver['reason']=waiver['reason'].replace('approved','definition-only').replace('reviewed','definition-only')
     if '[]'in field:suffix+='/items';tail=field.split('[]',1)[1];suffix+=('/properties/'+tail[1:])if tail else ''
     if old['fixedConditionalNoIndependentB']:unavailable='Non-performance byPurpose projection runs=1 only. No distinct valid B at that same purpose; performance3/5 vs SEO1 is grouped task-purpose projection, not independent scalar alternate. Original effect/alternate requirement remains OPEN.'
    else:raise Exception(field)
    pointer+=suffix
   elif p=='playwright':
    suffix='/properties/'+key;q[key]=clone(old['completeA'][key]);z[key]=clone(old['completeB'][key])
    if key=='requiredTests':q[key]=['home.spec.ts > project-owned assertion > real-chromium'];z[key]=['home.spec.ts > project-owned skip > real-chromium'];suffix+=('/items'if '[]'in field else '')
    if key=='minimumExecutedTests':q[key]=2;z[key]=3
    pointer+=suffix
   elif p=='visual':
    if key=='profileFile':z['profiles']['desktop']['viewport']['width']=800;taskA['targets']=taskB['targets']=['target-a'];taskB['manifestFile']='manifest-800-a.json';suffix='/properties/profiles';notes.append('Whole profile frame change requires matching task v2 baseline viewport/pageConditions; serialized fixture is NOT approved browser recapture. Native effect remains conditional on genuine baseline identity.')
    elif key=='comparisonProfile':q['selectedComparisonProfile']='strict-v1';z['selectedComparisonProfile']='balanced-v1';q['overrides']=z['overrides']={};suffix='/properties/selectedComparisonProfile';notes.append('Legacy isolated label B was fully masked by all3 identical explicit overrides. New whole pair removes overrides on BOTH sides; captured strict0 vs balanced.5 changes diff.25 failed/passed; no unowned fallback.')
    elif key=='overrides':q['overrides']=clone(old['completeA'][key]);z['overrides']=clone(old['completeB'][key]);suffix='/properties/overrides';suffix+=('/properties/'+field.split('.')[1])if '.'in field else ''
    elif key=='masks':
     q[key]=clone(old['completeA'][key]);z[key]=clone(old['completeB'][key]);taskA['targets']=taskB['targets']=['target-a','target-b']
     if field=='masks[].target':z[key]=clone(q[key]);z[key][0]['target']='target-b';notes.append('Both task targets selected on BOTH sides; selectors fixed #a. Avoid legacy coupled target/selector/task changes; only actual targeted mask association differs.')
     suffix='/properties/masks'+('/items'if '[]'in field else '');tail=field.split('[]',1)[1]if '[]'in field else '';suffix+=('/properties/'+tail[1:].replace('[]',''))if tail else '';suffix+=('/items'if tail.endswith('[]')else '')
    else:q[key]=clone(old['completeA'][key]);z[key]=clone(old['completeB'][key]);suffix='/properties/'+key
    pointer+=suffix
 else:
  sourcefield=m['source']['field'];current='Actual immutable manifest declaration and conservative selected default'if 'plugin.json'in m['source']['path']else 'Actual BUILTIN_PROFILES business preset fallback, custom same-name repository profile overrides it; native profile/options/executable/grant authority separate.'
  if sourcefield.startswith('BUILTIN_PROFILES.'):
   classification='owned-browser-profile';parts=sourcefield.split('.')[1:];field='.'.join(parts);q=a['processing']['profiles'];z=b['processing']['profiles'];leaf=parts[-1];parent=z
   for part in parts[:-1]:parent=parent[part]
   val=parent[leaf];alts={'browser':'webkit'if parts[0]=='mobile'else 'firefox','width':800 if parts[0]=='desktop'else 412,'height':768 if parts[0]=='desktop'else 900,'colorScheme':'dark','reducedMotion':'reduce','locale':'fr-FR','timezoneId':'Europe/Paris','deviceScaleFactor':2}
   parent[leaf]=not val if isinstance(val,bool)else alts[leaf];a['processing']['selectedProfiles']=b['processing']['selectedProfiles']=[parts[0]]
   pointer='/properties/profiles/additionalProperties/properties/processing/properties/profiles/additionalProperties'+''.join('/properties/'+v for v in parts[1:]);legacyPair=None
  else:
   classification='conservative-package-declaration';field=sourcefield.split('].')[1];parts=field.split('.');pointer='/properties/profiles/additionalProperties/properties/declarations'+''.join('/properties/'+x for x in parts);legacyPair=None;d=manifests[p]['testProviders'][0]
   if field=='retrySafe':
    if d['retrySafe']:b['declarations']['retrySafe']=False
    else:unavailable='Actual package retrySafe=false. Selected true would widen unsupported retry safety; no distinct safe boolean B. Original alternate/effect obligations OPEN, no unsafe explicit task override invented.'
   elif field=='matrixFields':unavailable='Actual package matrixFields=[] and config has no supported manifest-declared matrix key. No distinct safe selection B; source/canonical obligations retained OPEN.'
   else:
    outcome=parts[-1];before=d['evidenceDefaults'][outcome];extra=[t for t in d['evidenceTypes']if t not in before]
    if extra:b['declarations']['evidenceDefaults'][outcome]=before+[extra[0]];notes.append('Distinct supported retention selection, NOT evidence production proof. Error-path artifacts usually absent; quiet Axe/Lighthouse/Visual have no guaranteed log. Original native F-EFFECT remains OPEN where no genuine produced B artifact is reachable.')
    else:unavailable='Outcome mandatory baseline already equals full actual supported evidenceTypes set. No distinct safe selection B without removing mandatory retention or inventing unsupported artifact type. Original alternate/effect obligation OPEN.'
 # Named complete A/B profiles; task-only preserves same entire policy, no fictitious policy delta.
 an=id+'-A';bn=None if unavailable else id+'-B';owner[p]['profiles'][an]=a
 if bn:owner[p]['profiles'][bn]=b
 paths={}
 for side,t in [('A',taskA),('B',taskB)]:path=f'task-fixtures/pairs/{id}-{side}.json';write(path,t);paths[side]=path
 entries={}
 for side,profileName in [('A',an),('B',bn or an)]:
  r=clone(root);next(t for t in r['pluginSelections']if t['packageId']==f'kubeclaw.{p}')['profileId']=profileName;path=f'fixtures/entries/{id}-{side}.json';write(path,r);entries[side]=path
 targetSchema=str(O/f'schemas/{p}.task.schema.json')if classification=='task-data'else str(O/f'schemas/kubeclaw.{p}.schema.json')
 fieldDefs.append({'id':id,'originalGroup':group,'originalGroupMember':m,'originalRow':f,'originalRowBodySha256':digest(f),'provider':p,'registrationId':f'kubeclaw.{p}:{p}','field':field,'classification':classification,'currentSupportedDomain':None,'currentSemantics':current,'retainedLegacyDefinition':old,'retainedLegacyPairHistory':legacyPair,'sourceIdentity':m['source'],'targetSchemaBinding':{'path':targetSchema,'pointer':pointer},'wholeProfiles':{'A':an,'B':bn},'wholeProfileHashes':{'A':digest(a),'B':digest(b)if bn else None},'taskPair':paths,'entryPair':entries,'nativeEffectEligibility':'OPEN/not-run; fixture schemas/helper assessment only, no authentic browser/input/grant/tool/version receipt','unavailableIndependentB':unavailable,'notes':notes,'sourceOracleRef':'field-oracles.json#/entries/'+str(len(fieldDefs)),'status':'not-run'})
 caseids.update(m['originalCaseIds']);profilePairs.append({'settingId':id,'provider':p,'profiles':{'A':an,'B':bn},'tasks':paths,'entries':entries})
 for witness in old.get('readers',[])if old else []:
  assert sha(witness['path'])==witness['sha256'];assert Path(witness['path']).read_text().splitlines()[witness['line']-1]==witness['text'];coord.append(witness)
for p,d in owner.items():write(f'stand/config/plugins/kubeclaw.{p}.config.json',d)
def pointed(path,pointer):
 n=read(path)
 for part in pointer.lstrip('/').split('/')if pointer else []:n=n[part.replace('~1','/').replace('~0','~')]
 return n
for f in fieldDefs:
 sb=f['targetSchemaBinding'];sb['sha256']=sha(sb['path']);sb['exactNode']=pointed(sb['path'],sb['pointer'])
 source=f['sourceIdentity'];field=source['field'];
 if field.startswith('#/'):f['currentSupportedDomain']=pointed(source['path'],field[1:])
 elif 'BUILTIN_PROFILES'in field:f['currentSupportedDomain']={'sourceValue':processing['axe']['profiles'][field.split('.')[1]],'nativeAcceptedNode':sb['exactNode'],'qualification':'Business baseline/support grammar only; native browser library/platform constraints and authentic capability grant separate'}
 else:f['currentSupportedDomain']={'manifestExactValue':manifests[f['provider']]['testProviders'][0][f['field'].split('.')[0]],'selectedDeclarationNode':sb['exactNode']}
write('scope.json',{'groups':selected,'originalFieldIds':[f['id']for f in fieldDefs],'originalCaseIds':sorted(caseids),'implementationAuthorization':None,'globalC0Accepted':False,'futureCases':'not-run'})
write('field-definitions.json',{'rows':fieldDefs});write('profile-task-pair-index.json',profilePairs)
by={f['id']:f for f in fieldDefs};cases=[]
for id in sorted(caseids):
 c=matrix[id];ids=[f['id']for f in fieldDefs if id in f['originalGroupMember']['originalCaseIds']];cases.append({'id':id,'originalCanonicalCase':c,'originalCanonicalCaseSha256':digest(c),'retainedNativeCase':native.get(id),'nativeCaseSha256':digest(native[id])if id in native else None,'thisCutSettingIds':ids,'perMemberFieldContracts':[{'settingId':i,'completeOwnerSchemaRef':by[i]['targetSchemaBinding'],'wholeProfiles':by[i]['wholeProfiles'],'taskPair':by[i]['taskPair'],'entryPair':by[i]['entryPair'],'oracleRef':by[i]['sourceOracleRef']}for i in ids],'currentDefinitionGeneration':'browser-provider-contracts-01/pipeline-entry.v6-extension/provider-configuration.v2','state':'not-run','requirementsUnwaived':True})
write('case-definitions.json',{'cases':cases})
# Exact reviewed base and future extension; no pending Security/Gateway/latest-fill admitted.
write('same-entry-extension-dependency.json',{'baseRoot':{'path':str(P/'stand/config/pipeline.config.json'),'sha256':sha(P/'stand/config/pipeline.config.json')},'baseRootSchema':{'path':str(P/'schemas/pipeline-entry.schema.json'),'sha256':sha(P/'schemas/pipeline-entry.schema.json')},'boundedBaseIndependentReview':{'path':str(B/'independent-same-entry-deployment-binding-review-02/README.md'),'sha256':sha(B/'independent-same-entry-deployment-binding-review-02/README.md')},'proposedSingleRoot':'stand/config/pipeline.config.json','proposedSchema':'schemas/pipeline-entry.schema.json','sixComponentsUnchanged':root['components'],'delta':'Only four real browser provider tuples/closed package+registration+owner enums and an explicit complete native Buster browser-source-A profile; root selects that captured profile. Prior4 package/controller/recovery tuples and existing profiles remain exact. No seventh component, private root, simultaneous normative v5/v6, implicit latest Security/Gateway/source author integration. Future coordinated receiving/file-set/codec/receipt author rejoin must explicitly include these files and hashes after bounded independent review.','currentLoader': 'Current source v1 combined configs and native owners do NOT implement this proposed processing capture/v2/root extension','implementationAuthorization':None})
write('native-resource-association.json',{'completeOwnerPath':'stand/config/components/buster-engine.config.json','completeProfile':'browser-source-A','soleService':'fixture.service.buster-runtime','workerCoreProfile':'local-A','settings':baseline['settings'],'originalBaseProfile':'provider-network-A','nativeBudgetCeilingsUnchanged':True,'requestedOriginPortPolicyDelta':'Explicit task source fixture origins18080/18081 and Playwright port18081 added to complete requested policy. NO grant/endpoint/host/capacity installation fact. All existing time/count/byte/process/memory/CPU/browser-membership caps unchanged.','capabilityProjection':{f'browser.{p}':{'sourceConsumer':f'skills/buster/engine/test-gates/browser-{p}-runtime.ts','nativePolicyKey':{'axe':'browserAxe','lighthouse':'browserLighthouse','playwright':'browserPlaywright','visual':'browserVisual'}[p]}for p in providers},'externalActivation':{'browserExecutables':None,'observedBrowserVersions':None,'nativeSourceImages':None,'runtimeNodeModulesIdentity':None,'sandboxAndCgroupIdentity':None,'originalCapabilityGrants':None,'hostResourceCapacity':None,'authenticTypedFixtureInputs':None,'approvedVisualBaselines':None},'allNativeCases':'not-run'})
write('source-coordinates.json',list({(x['path'],x['line']):x for x in coord}.values()))
# Freeze all substantive inherited packages/reviews/history read definitions, not canonical metadata/HEAD navigation.
frozenDirs=[P,B/'same-entry-deployment-binding-01',B/'independent-same-entry-deployment-binding-review-02',R,B/'independent-runtime-provider-contract-review-03',L,Path('docs/review/evidence/config-acceptance/runtime/batches/bce3f075-provider-declarations-10')]
frozen=sorted({p for d in frozenDirs for p in d.rglob('*')if p.is_file()});write('frozen-input-identities.json',{'inputs':[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}for p in frozen]})
sourcePaths=sorted({Path(m['source']['path'])for _,m in members}|{p for name in providers for p in (S/name).rglob('*')if p.is_file()}|{Path(f'skills/buster/engine/test-gates/browser-{p}-runtime.ts')for p in providers}|{Path('skills/buster/engine/test-gates/production-browser-options.ts'),Path('skills/buster/engine/test-gates/capability-runtime.ts'),Path('skills/common/plugin-runtime/foundation/registry/build.ts'),Path('skills/buster/engine/test-gates/runner-log-capture.ts'),Path('skills/buster/engine/test-gates/fixture-authority.ts'),Path('node_modules/axe-core/axe.js')});write('source-pins.json',{'files':[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}for p in sourcePaths]})
print(json.dumps({'fields':len(fieldDefs),'cases':len(cases),'completePackageProfiles':{p:len(d['profiles'])for p,d in owner.items()},'wholeEntries':len(members)*2,'nativeActions':0,'frozenInheritedFiles':len(frozen)}))
