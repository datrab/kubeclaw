#!/usr/bin/env python3
"""C0 discovery with explicit unresolved semantic obligations; never an acceptance runner."""
import pathlib,json,hashlib,re,subprocess
ROOT=pathlib.Path.cwd(); OUT=ROOT/'docs/review/evidence/config-acceptance/runtime'; OUT.mkdir(parents=True,exist_ok=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,x): (OUT/name).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
def source(p,field):return {'path':str(p),'field':field,'sha256':digest(p)}
def sid(p,field):return 'RT-'+hashlib.sha256((str(p)+'#'+field).encode()).hexdigest()[:16]
def hits(files,key):
 result=[]; rx=re.compile(r'\b'+re.escape(key)+r'\b')
 for f in files:
  for n,l in enumerate(f.read_text(errors='replace').splitlines(),1):
   if rx.search(l):result.append({'path':str(f),'line':n,'sha256':digest(f),'text':l.strip()[:800]})
 return result
rows=[]; gaps=[]; schemas=[]; roster=[]
chains={
 'stages':['skills/nova/core/cli.ts:runPipelineV2/recoverPipelineV2','skills/nova/core/execution/engine-run.ts:runNewPipeline/executePrepared','skills/nova/core/execution/runner.ts:PipelineRunner.run','skills/nova/core/execution/pipeline-loop.ts:PipelineLoop','skills/nova/core/execution/stage-executor.ts'],
 'adapters':['skills/nova/core/execution/engine-runtime.ts:createAdapterRuntime','skills/nova/core/execution/adapters.ts:AdapterRuntime.start/invoke','skills/nova/core/execution/adapter-startup.ts:AdapterStarter.startAll'],
 'observers':['skills/nova/core/execution/engine-runtime.ts:serializedObserverDrainer/drainObservers','skills/nova/core/telemetry/observers.ts:ObserverRuntime.drain','skills/nova/core/telemetry/observer-delivery.ts:deliverObserver'],
 'testProviders':['skills/nova/project/compiler.ts:validateModuleRuntime accepts already-resolved providerPlan.plan/digest','skills/nova/plugins/buster-quality-gate/src/stage.ts:execute -> test.plan.execute','skills/nova/plugins/remote-test-gate/src/adapter.ts -> createProductionNovaTestGate/ProductionNovaTestGate.execute','skills/buster/engine/test-gates/runner-provider-operation.ts:initializeProvider/executeProvider','provider instance execute(input.invocation,context)'],
 'reportAdapters':['skills/buster/engine/test-gates/runner-provider-operation.ts:finalizeBusterReports','skills/buster/engine/test-gates/specialist-report-finalization.ts']}
# Classification is a candidate until its real consumer has been reviewed; constants are not automatically invariants.
TASK_FIELDS={'flowFile','url','endpointName','routes','profileFile','acceptances','specFile','operations','tags','projectDirectory','configFile','requiredTests','buildContext','definition','outputName','platform','executable','args','workingDirectory','environment','reports','coverage','artifacts','loginPath','usernameKey','passwordKey','cookieName','protectedPath','usernamePointer','assertions','serviceName','servicePort','serviceTargetPort','image','targets','masks','manifestFile','settingsFile','paths','path','hostname'}
SECRET_FIELDS={'tokenSecret','resultTokenSecret','sourcePrivateKeySecret','secretReferences','secretName','keySecret','apiKeySecret'}
INVARIANT_FIELDS={'schemaVersion','protocol','reportArtifactEncoding','reviewSemanticEncoding','deliveryManifestEncoding','registryVersion','format','mediaType','template'}
POLICY_CONSTS={'maxPromptBytes','maxInputTokens','maxOutputTokens','maxContextTokens','tokenizerEncoding','agent','profile'}
for manifest in sorted(pathlib.Path('skills').glob('*/plugins/*/plugin.json')):
 m=json.loads(manifest.read_text()); files=[f for f in manifest.parent.rglob('*') if f.is_file() and f.suffix in {'.ts','.js','.mjs'} and not set(f.parts)&{'tests','dist','node_modules'}]
 plugin={'id':m['id'],'path':str(manifest),'sha256':digest(manifest),'registrations':[]}
 for kind in chains:
  for reg in m.get(kind,[]):
   if not reg.get('configSchema'):continue
   p=manifest.parent/reg['configSchema']; doc=json.loads(p.read_text()); registration={'kind':kind,'id':m['id']+':'+reg['id'],'type':reg.get('type'),'contractId':reg.get('contractId'),'module':str(manifest.parent/reg['module']),'export':reg.get('export'),'schema':str(p)}
   plugin['registrations'].append(registration); schemas.append({'path':str(p),'sha256':digest(p),'registration':registration,'document':doc})
   def walk(v,field,pointer,trail=()):
    if not isinstance(v,dict):return
    if '$ref' in v:
     ref=v['$ref']
     if ref.startswith('#/'):
      if ref in trail:
       gaps.append({'id':'RT-REF-CYCLE-'+sid(p,pointer),'source':source(p,pointer),'ref':ref});return
      target=doc
      for item in ref[2:].split('/'):target=target[item.replace('~1','/').replace('~0','~')]
      yield from walk(target,field,pointer+' -> '+ref,trail+(ref,));return
     if ref.startswith('https://kubeclaw'):
      canonical=pathlib.Path('skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json'); c=json.loads(canonical.read_text()); target=c
      frag=ref.split('#',1)[1] if '#' in ref else ''
      try:
       for item in frag.lstrip('/').split('/') if frag else []: target=target[item]
       yield from walk(target,field,pointer+' -> '+ref,trail+(ref,));return
      except KeyError:pass
     gaps.append({'id':'RT-UNRESOLVED-REF-'+sid(p,pointer),'source':source(p,pointer),'ref':ref});return
    if field:
     yield field,pointer,v
    for key,child in v.get('properties',{}).items():yield from walk(child,(field+'.' if field else '')+key,pointer+'/properties/'+key,trail)
    if isinstance(v.get('items'),dict):yield from walk(v['items'],field+'[]',pointer+'/items',trail)
    if isinstance(v.get('additionalProperties'),dict):yield from walk(v['additionalProperties'],field+'.{key}',pointer+'/additionalProperties',trail)
    for key,child in v.get('patternProperties',{}).items():yield from walk(child,field+'.{'+key+'}',pointer+'/patternProperties/'+key,trail)
    for op in ['oneOf','anyOf','allOf']:
     for i,child in enumerate(v.get(op,[])):yield from walk(child,field,pointer+'/'+op+'/'+str(i),trail)
    for op in ['if','then','else']:
     if isinstance(v.get(op),dict):yield from walk(v[op],field,pointer+'/'+op,trail)
   seen=set()
   fields=list(walk(doc,'','#'))
   if not fields:fields=[('$empty','#',doc)]
   for field,pointer,fragment in fields:
    ident=sid(p,registration['id']+'#'+pointer)
    if ident in seen:continue
    seen.add(ident); key=field.split('.')[-1].replace('[]',''); first=field.split('.')[0].replace('[]','')
    locations=hits(files,key) if key!='$empty' else []
    classification='operator-setting';reason='Config schema value affects the owned runtime behavior; per-field policy/task boundary needs consumer review.'
    if key in SECRET_FIELDS:classification='secret-reference';reason='Reference names resolve through secret/capability boundary; no credential contents inventoried.'
    elif first in TASK_FIELDS and kind=='testProviders':classification='task-data';reason='Provider invocation selects a concrete test target, artifact, expected assertion, fixture identity or repository command; not a global replacement for per-task inputs. Review default/policy subfields separately.'
    elif key in INVARIANT_FIELDS and 'const' in fragment:classification='protocol-invariant';reason='Finite on-wire encoding/discriminator selects a parser or artifact contract. Exact consumer rationale remains review obligation.'
    if key in POLICY_CONSTS:classification='operator-setting';reason='Schema const pins a runtime agent/token/model profile policy today; not justified as universal protocol invariant.'
    status='consumer-review-required'
    rows.append({'id':ident,'owner':m['id'],'scope':{'registration':registration['id'],'kind':kind,'instance':'each configured stage/adapter/observer/test-provider invocation','profile':'selected by workflow or platform; no central author established'},'source':source(p,pointer),'field':field,'classification':classification,'classificationReason':reason,'current':{'value':'instance-specific input; external deployed profile unknown','schemaDefault':fragment.get('default'),'precedence':'productive project path: supplied already-resolved plan configuration.values -> provider local fallback. Exported resolveTestPlan API additionally applies Ajv useDefaults:true, but no in-repo production caller is established' if kind=='testProviders' else 'workflow stage.config or platform adapters/observers map then plugin parser/local fallbacks; registry validation does not apply defaults','requiredAtParent':'See owning schema document required/conditionals'},'domain':{k:fragment[k] for k in ['type','enum','const','minimum','maximum','minLength','maxLength','pattern','format','minItems','maxItems','additionalProperties','required','dependentRequired'] if k in fragment},'unit':'ms' if key.endswith('Ms') else 'seconds' if key.endswith('Seconds') else 'bytes' if 'Bytes' in key else 'tokens' if 'Tokens' in key else 'count' if re.search('Attempts|Retries|Polls|Files|Concurrency|Steps|Jobs|Count|workers',key) else 'schema-defined','reader':{'registrationEntry':registration['module']+':'+str(registration['export']),'candidateLocations':locations,'verifiedFieldReader':None},'productiveCallers':chains[kind]+[registration['module']+':'+str(registration['export'])],'validation':{'schema':str(p),'genericBoundary':'validateRuntimeRegistrationConfiguration or resolveTestProviderConfiguration; RegistryError REGISTRY_RESULT_INVALID/REGISTRY_MANIFEST_INVALID','semantic':'See candidate source lines; not yet independently closed for this field'},'targetAuthor':{'proposal':'pipeline.config.json component/profile ref -> plugin-owned profiles/'+m['id']+'.config.json','rule':'retain task inputs in workflow/plan; policy fields single plugin author; explicit secret references only'},'activation':'target module-start immutable binding; current stage graph/run adapter activation or resolved test plan','recoveryEffects':'Current graph/runtime config/package pins reject drift; provider config digest persists in resolved plan. Module generation binding not implemented. Field-specific effects require review.','eval':'eligible policy profiles fixed generation; task data remains task-specific; no complete Evalrunner established','migration':'proposal only; remove schema/code default if policy; preserve task authority and finite protocol identities','requirements':['D17','D20','D21','C0-A','C0-B','C0-C','F1','F2a','F3a','F4a'],'cases':['RT-C0-SCHEMA-DISCOVERY'],'evidence':['docs/review/evidence/config-acceptance/runtime/schema-roster.json','docs/review/evidence/config-acceptance/runtime/config-reader-search.log'],'semanticStatus':status})
 roster.append(plugin)
save('plugin-roster.json',roster);save('schema-roster.json',schemas)
# Entire productive code scope is dispositioned as candidate, not unexplained exclusion.
sources=[]; defaultCandidates=[]
scopes=['skills/nova','skills/common/plugin-runtime','skills/common/plugins','skills/buster/plugins','skills/buster/engine/test-gates']
for root in scopes:
 for p in sorted(pathlib.Path(root).rglob('*')):
  if not p.is_file():continue
  if set(p.parts)&{'node_modules','dist','tests','test'}:continue
  if p.suffix not in {'.ts','.js','.mjs','.json','.md','.yaml','.yml'}:continue
  text=p.read_text(errors='replace')
  candidates=[]
  if p.suffix in {'.ts','.js','.mjs'}:
   for n,l in enumerate(text.splitlines(),1):
    if re.search(r'\?\?|\|\||\bDEFAULT\w*\b|\bdefault\s*:|\buseDefaults\b|\bprocess\.env\b|\b(?:timeout|limit|budget|retry|model|prompt|config|concurrency|poll)\w*\s*[:=]',l,re.I):candidates.append({'path':str(p),'line':n,'text':l.strip()[:1500],'sha256':digest(p),'disposition':'unresolved-candidate; syntax match is not semantic coverage'})
  defaultCandidates.extend(candidates)
  linked=[r['id'] for r in rows if r['source']['path']==str(p)]
  sources.append({'path':str(p),'sha256':digest(p),'disposition':'schema fields enumerated; consumer closure pending' if linked else 'runtime-default/input/protocol candidate; manual semantic disposition pending' if candidates else 'source identity recorded; no narrow scanner match is not verified non-setting exclusion','rows':linked,'candidateCount':len(candidates)})
save('default-candidates.json',defaultCandidates)
result={'identity':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip()},'status':'incremental C0 discovery; NO acceptance PASS','rows':rows,'sources':sources,'gaps':gaps+[{'id':'RT-SEMANTIC-CLOSURE','description':'Schema field rows deliberately consumer-review-required; lexical locations are not semantic closure.'},{'id':'RT-CODE-DEFAULT-DISPOSITION','description':str(len(defaultCandidates))+' code-default/config/input candidates require per-source/per-field semantic disposition; full candidates retained.'},{'id':'RT-EXTERNAL-PROFILE','description':'Deployed Nova/OpenClaw profile and installed external plugin roster are unavailable; no values inferred.'},{'id':'RT-EVAL-MODULE-BINDING','description':'Module generation binding and fixed CONFIG-generation Eval policy are proposed contracts; no complete implemented consumer established.'}]}
save('inventory-fragment.json',result)
print(json.dumps({'plugins':len(roster),'registrations':sum(len(p['registrations']) for p in roster),'schemasDistinct':len({p['path'] for p in schemas}),'rows':len(rows),'sources':len(sources),'defaultCandidates':len(defaultCandidates),'gaps':len(result['gaps'])}))
