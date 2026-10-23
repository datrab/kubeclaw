"""Additive C0 definition author. Writes only this new package; never activates code."""
import copy, hashlib, json, pathlib
R = pathlib.Path.cwd()
B = R / 'docs/review/evidence/config-acceptance/c0-completion-20261013'
O = B / 'nova-agent-target-contracts-01'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def bodysha(v): return hashlib.sha256(canonical(v).encode()).hexdigest()
def read(p): return json.loads((R/p).read_text())
def write(p,v):
 p=O/p; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
def text(p,v):
 p=O/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(v)
def pin(p):return {'path':str(p.relative_to(R)),'sha256':digest(p),'bytes':p.stat().st_size}
packages=['architecture-validator','implementation-agent','pipeline-review','prism-design','project-summary','case-study']
groups=read(str((B/'independent-whole-c0-readiness-review-01/runtime-residual-contract-groups.json').relative_to(R)))['groups']
members=[dict(m,packageId='kubeclaw.'+p) for p in packages for m in groups['kubeclaw.'+p]]
assert len(members)==18 and [len(groups['kubeclaw.'+p]) for p in packages]==[2,2,7,4,2,1]
ids={m['id'] for m in members}; caseids={c for m in members for c in m['originalCaseIds']}
assert len(caseids)==144
inventory=read('docs/review/remediation/config-semantic-inventory.json')
matrix=read('docs/review/remediation/config-acceptance-matrix.json')
native=read('docs/review/evidence/config-acceptance/runtime/case-proposals.json')
rows=[r for r in inventory['rows'] if r['id'] in ids]
cases=[c for c in matrix['cases'] if c['id'] in caseids]
nativecases=[c for c in native if c['id'] in caseids]
assert len(rows)==18 and len(cases)==144
write('scope.json',{'groups':{p:groups['kubeclaw.'+p] for p in packages},'originalFieldCount':18,'originalCaseCount':144,'qualification':'No extra original fields or IDs; new literal source coordinates are dependencies, not canonical ID additions.'})
write('original/rows.json',rows);write('original/cases.json',cases);write('original/native-case-bodies.json',nativecases)
write('original/identity.json',{'rowBodies':{r['id']:bodysha(r) for r in rows},'caseBodies':{c['id']:bodysha(c) for c in cases},'nativeBodies':{c['id']:bodysha(c) for c in nativecases},'currentCombinedDefinitionGeneration':{r['id']:r.get('currentCombinedDefinitionGeneration') for r in rows},'phaseResults':{c['id']:[c['phase'],c['result']] for c in cases}})

# Freeze exact productive bytes, not executable stand-ins. Tests are read for fixture provenance only.
sourcefiles=set()
for p in packages:
 base=R/'skills/nova/plugins'/p
 sourcefiles.update(x for x in base.rglob('*') if x.is_file() and x.suffix in ['.ts','.json','.mjs','.md'])
sourcefiles.update((R/'skills/common/plugins/runtime-dispatch').rglob('*.ts'))
sourcefiles.update((R/'skills/common/plugins/runtime-dispatch').rglob('*.json'))
for f in ['skills/nova/core/execution/stage-executor.ts','skills/nova/core/execution/pipeline-loop.ts','skills/nova/core/execution/run-decisions.ts','skills/nova/core/execution/runner.ts','skills/nova/core/execution/adapter-startup.ts','skills/nova/core/execution/adapters.ts','skills/nova/core/execution/context.ts','skills/nova/core/execution/engine-runtime.ts','skills/nova/core/execution/engine-snapshots.ts','skills/nova/core/execution/engine-run.ts','skills/nova/core/execution/graph.ts','skills/nova/core/state/read-run-evidence.ts','skills/nova/core/lifecycle/recovery.ts','skills/nova/project/compiler.ts','skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts','skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts','skills/common/plugin-runtime/sdk/src/values.ts','skills/common/plugin-runtime/sdk/src/generated/contracts.ts','skills/common/plugin-runtime/foundation/registry/configuration.ts','skills/common/plugin-runtime/foundation/registry/schema.ts','skills/common/plugin-runtime/foundation/registry/capabilities.ts','skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json']:
 sourcefiles.add(R/f)
for f in ['contracts/pipeline-test-gate/v1/src/coverage.ts','contracts/pipeline-test-gate/v1/src/digest.ts','contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json','contracts/pipeline-observability/v1/src/canonical-json.ts','contracts/delivery-manifest/v3/src/index.ts','contracts/delivery-manifest/v3/schemas/delivery-manifest.v3.schema.json']:
 sourcefiles.add(R/f)
for f in ['skills/common/plugin-runtime/foundation/registry/digest.ts','skills/common/plugin-runtime/foundation/registry/errors.ts']:
 sourcefiles.add(R/f)
sourcepins=[pin(x) for x in sorted(sourcefiles)]
for p in sourcefiles:
 dst=O/'source'/p.relative_to(R);dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(p.read_bytes())
write('source-pins.json',{'files':sourcepins,'qualification':'Actual read-only source witnesses; frozen source files are NOT activated/imported wholesale.'})
history=[]
for d in ['same-entry-engine-binding-01','same-entry-engine-binding-02','independent-same-entry-engine-binding-review-02','runtime/batch-06-http-runtime-codec','runtime/batch-08-repository-execution']:
 history.extend(pin(p) for p in sorted((B/d).rglob('*')) if p.is_file())
old=R/'docs/review/evidence/config-acceptance/runtime'
for d in ['batches/6606af9-agent-stage-config-16','batches/21bf51b-agent-role-event-20','batches/6606af9-report-reader-17']:
 history.extend(pin(p) for p in sorted((old/d).rglob('*')) if p.is_file())
for f in ['agent-target-profile-controls.json','row-overlay.json','CONTRACTS.md','external-input-contracts.json','manifest.json','future-cases.json']:
 history.append(pin(B/'runtime'/f))
write('history-pins.json',{'files':history,'qualification':'Immutable old definitions/reviews retained; no old validator replay/native execution or acceptance imported.'})

def object_schema(props,required=None):return {'type':'object','additionalProperties':False,'required':list(props) if required is None else required,'properties':props}
ID={'type':'string','pattern':'^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$'}
schemas={}; owners={}; manifests={}; tasks={}; registrations={}
execution={'runId':'run:fixture-nova','stageId':'fixture-stage','attemptId':'attempt:fixture-nova','attemptNumber':1}
ref={'artifactId':'source-fixture','namespace':'kubeclaw.implementation-agent','mediaType':'application/json','digest':'sha256:'+hashlib.sha256(b'{}').hexdigest(),'sizeBytes':2,'producer':dict(execution,runId='run:fixture-source',stageId='source')}
report_source={'runId':'run:fixture-source','journalHead':'sha256:'+'a'*64,'snapshotDigest':'sha256:'+'b'*64,'sourceStageId':'source','sourceRevision':'c'*40,'artifacts':[ref]}
stageA={'architecture-validator':{'agent':'case-target-a','agentRole':'architecture-diagnostic-A'},'implementation-agent':{'agent':'case-target-a','agentRole':'implementation-diagnostic-A'},'pipeline-review':{'agent':'case-target-a','agentRole':'review-diagnostic-A'},'prism-design':{'agent':'prism','target':'case-operator-a','issuerId':'case-issuer-a','timeoutMinutes':60},'project-summary':{'agentRole':'summary-diagnostic-A'},'case-study':{'agent':'case-target-a'}}
evidenceA={'storageRoot':'/fixture/nova/original-state','orchestratorIssuerId':'case-original-writer','maximumJournalBytes':1048576,'maximumArtifactBytes':1048576,'maximumBundleBytes':1048576}
task_values={'architecture-validator':{'task':'Validate the fixture architecture without making changes.','architecture':{'component':'fixture'},'source':{'projectId':'fixture-project','repositoryRoot':'/fixture/repository','architectureRef':'fixture-architecture','paths':['docs/architecture.md']}},'implementation-agent':{'runId':'run:fixture-nova','moduleId':'fixture-module','attempt':1,'task':'Implement the fixture task only in the attempt-owned workspace.','headBefore':'c'*40,'workspace':{'repositoryRoot':'/fixture/repository','workspacePath':'/fixture/worktrees/attempt','branch':'fixture-attempt','baseRef':'c'*40,'mergeTarget':'fixture-main','commitMessage':'Fixture implementation'}},'pipeline-review':{'task':'Review only supplied verified source facts.','source':report_source},'case-study':{'task':'Draft the case study using only supplied verified facts.','source':report_source},'prism-design':{'runId':'run:fixture-nova','projectId':'fixture-project','architectureArtifact':{'artifactId':'fixture-architecture','contentDigest':'sha256:'+'d'*64,'revision':1},'requiresDesign':True},'project-summary':{'projectId':'fixture-project','modules':[{'moduleId':'fixture-module','sourceStageId':'source','testStageId':'tests','expectedCoverage':{}}],'final':{'sourceStageId':'source','lintStageId':'lint','testStageId':'tests','expectedCoverage':{}}}}
for kind,binding in [('module',task_values['project-summary']['modules'][0]),('cumulative',task_values['project-summary']['final'])]:
 unsigned={'schemaVersion':'gate-coverage.v1','projectId':'fixture-project','kind':kind,'baseRevision':'c'*40,'modules':[{'moduleId':'fixture-module','ownedPaths':['src'], 'requirements':[{'id':'works','statement':'Fixture α requirement.'}]}],'integrationRequirements':[],'requiredChecks':[{'checkId':'works','requirementRefs':[{'moduleId':'fixture-module','requirementId':'works'}],'nodeIds':['unit']}]}
 binding['expectedCoverage']=dict(unsigned,policyDigest='sha256:'+bodysha(unsigned))
for p in packages:
 pkg='kubeclaw.'+p; base=R/'skills/nova/plugins'/p;manifest=json.loads((base/'plugin.json').read_text());manifests[p]=manifest
 registrations[p]=[(kind,x) for kind in ['stages','adapters','observers'] for x in manifest[kind]]
 regprops={}
 for kind,r in registrations[p]:
  node=json.loads((base/r['configSchema']).read_text());node.pop('$schema',None)
  if r['id']==manifest['stages'][0]['id'] and 'agent' in node['properties'] and p!='prism-design':node['properties']['agent']=copy.deepcopy(ID)
  if r['configSchema'].endswith('evidence-config.schema.json'):
   for n in ['maximumJournalBytes','maximumArtifactBytes','maximumBundleBytes']:node['properties'][n]['maximum']=9007199254740991
   node['properties']['storageRoot']['pattern']='^/'
   for n in ['storageRoot','orchestratorIssuerId']:node['properties'][n]['readOnly']=True
  regprops[pkg+':'+r['id']]=node
 profile=object_schema({'processing':object_schema(regprops)})
 owner=object_schema({'schemaVersion':{'const':'pipeline-package-policy.v1'},'packageId':{'const':pkg},'instanceId':{'const':'fixture.'+p},'profiles':{'type':'object','minProperties':1,'propertyNames':{'pattern':'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'},'additionalProperties':profile}})
 owner['$schema']='https://json-schema.org/draft/2020-12/schema'; schemas[p]=owner;write('schemas/'+p+'.owner.schema.json',owner)
 initial={pkg+':'+manifest['stages'][0]['id']:copy.deepcopy(stageA[p])}
 if p=='pipeline-review':initial[pkg+':evidence']=copy.deepcopy(evidenceA)
 owners[p]={'schemaVersion':'pipeline-package-policy.v1','packageId':pkg,'instanceId':'fixture.'+p,'profiles':{'A':{'processing':initial}}}
 write('task-fixtures/'+p+'.json',task_values[p]);tasks[p]='task-fixtures/'+p+'.json'

# Concrete, whole, source-supported current OpenClaw fixture. One fictional model / codex parser fallback,
# not a second installed agent or endpoint. Runtime06 history is retained unchanged.
target={'endpoint':'http://127.0.0.1:18080/tools/invoke','tokenSecret':'case.gateway.token','runtime':'subagent','agentId':'codex','agentRole':'fixture-runtime-role','model':'synthetic-provider/model-a','thinking':'high','collectorMode':False,'spawnIntervalMs':1500,'tokenizerEncoding':'o200k_base','maxPromptBytes':900000,'maxInputTokens':120000,'maxOutputTokens':6000,'maxContextTokens':128000,'cwd':'/fixture/repository','repositoryRoot':'/fixture/repository','workspaceRoot':'/fixture/worktrees','pollMs':1000,'maxPollMs':15000,'maxPolls':1800,'sessionTimeoutMs':1800000,'resultPathPrefix':'results/fixture'}
runtime={'schemaVersion':'pipeline-registration-policy.v1','packageId':'kubeclaw.runtime-dispatch','registrationId':'kubeclaw.runtime-dispatch:openclaw','instanceId':'fixture.runtime-dispatch','profiles':{'A':{'processing':{'targets':{k:copy.deepcopy(target) for k in ['case-target-a','case-target-b','prism']}}}}}
write('config/plugins/kubeclaw.runtime-dispatch.config.json',runtime)
runtime_schema=read('skills/common/plugins/runtime-dispatch/schemas/openclaw-config.schema.json');runtime_schema.pop('$schema');targetnode=runtime_schema['properties']['targets']['additionalProperties']
targetnode['required']=list(target);targetnode['properties']={k:v for k,v in targetnode['properties'].items() if k in target or k in ['controllerSessionKey','resultEndpoint','resultTokenSecret']}
for n in targetnode['properties'].values():n.pop('default',None)
write('schemas/runtime-dispatch.owner.schema.json',dict(object_schema({'schemaVersion':{'const':'pipeline-registration-policy.v1'},'packageId':{'const':'kubeclaw.runtime-dispatch'},'registrationId':{'const':'kubeclaw.runtime-dispatch:openclaw'},'instanceId':{'const':'fixture.runtime-dispatch'},'profiles':{'type':'object','minProperties':1,'additionalProperties':object_schema({'processing':runtime_schema})}}),**{'$schema':'https://json-schema.org/draft/2020-12/schema'}))
write('fixtures/http-runtime-targets.json',{'targets':{'case-target-a':{'endpoint':'http://127.0.0.1:18080/runtime','authentication':'hmac','tokenSecret':'case.runtime.hmac','maxRequestBytes':1048576,'maxResponseBytes':1048576}}})
write('fixtures/runtime-context.json',{'qualification':'Source-definition fixture ONLY; none of these names, paths, endpoint, model or secret references establish installed availability, provenance, credentials or grants. No simultaneous HTTP/OpenClaw provider routing.','execution':execution,'runtimeDispatchProfile':{'schemaVersion':'runtime-dispatch-profile.v1','encoding':'json-utf16-v1'},'originalR':{'nativePolicyRef':'frozen original activated runtime-dispatch:openclaw target map and grant/source/secret revisions, to be captured before authorized future run','grantRef':'real original capability grants, not a fixture-produced authority','leaseLimitsSource':'skills/nova/core/execution/stage-executor.ts:wallTimeMs/cpuMillis=stage execution.timeoutMs, memoryBytes=512*1024*1024; these are lease declarations, not kernel enforcement proofs','requiredChecks':['runtime target resource IDs each present in captured map AND original lease grants','same service/package/registration/source/model/agent/thinking/SDK/tool/host identity','exact native R/S/H cumulative remaining quotas/deadline; never reset on module/retry/recovery','matching actual tokenizer and provider context for supported model','native original source/workspace/immutable task intent/fence/secret revision']}})

fields=[];pairs=[];bindings=[];receiving=[];roots=[]
def source_refs(paths,terms):
 refs=[]
 for f in paths:
  q=R/f
  for i,line in enumerate(q.read_text().splitlines(),1):
   if any(t in line for t in terms):refs.append({'path':f,'sha256':digest(q),'line':i,'text':line})
 return refs
def originalnode(m):
 value=read(m['source']['path'])
 for part in m['source']['field'][2:].split('/'):value=value[part]
 return value
for m in members:
 p=m['packageId'][9:];field=m['source']['field'].split('/')[-1];rid=m['id'];pkg=m['packageId'];registration=next(r['id'] for kind,r in registrations[p] if r['configSchema']==m['source']['path'].split('/'+p+'/')[-1])
 reg=pkg+':'+registration
 profileA=copy.deepcopy(owners[p]['profiles']['A']); profileB=copy.deepcopy(profileA)
 a=profileA['processing'][reg];b=profileB['processing'][reg]
 family=''; limitation='';negative='';oracle='';classification='J';eligibility='only a new eligible logical M may read a newly selected complete policy within the already retained original R/S/H grants/ceilings; current code pins whole graph/R, not demonstrated per-M late selection'
 if field=='agentRole':
  b[field]=a[field].replace('-A','-B');family='diagnostic-event-provenance-not-authorization'
  oracle='Same stage type/task/agent target and business protocol; PipelineLoop emits EXACT selected string in stage.started before executor, and run-decisions stage.succeeded/blocked/failed/cancelled copies same string. Business runtime resource, request payload and selected native target remain identical. Unicode/whitespace/NUL are not silently normalized by event reader; full encoded journal/metadata quota still applies.'
  negative='Empty string rejected by owning schema; omitted field is an explicit source-supported absence branch, diagnostic field omitted. Do not claim non-string direct-graph omission proves admitted schema configuration. Inject role as runtime agent/model/grant selector and require denial at original real capability boundary.'
  limitation='Meaningful diagnostic-only A/B. No agentRole authorization/model/backend effect exists in these plugin modules; original F-EFFECT obligations asking for such effect remain OPEN. Preserve batch20 correction and historical exact event bytes.'
 elif field=='agent' and p!='prism-design':
  b[field]='case-target-b';family='authorized-runtime-target-resource-locator'
  oracle='Same complete task/source/protocol and fixed original runtime-dispatch provider: actual request.resource.canonicalId A=case-target-a/B=case-target-b; dispatch-adapter exact captured Map lookup, target-specific runtime attestation targetId and genuine session/effect receipts correspond. Both fixture targets intentionally use the SAME fictional model/agent: route identity, not second agent/model capability proof.'
  negative='Unknown ID, padded ID, control character, mismatched original grant, wrong selected runtime adapter or source/package/schema/instance must reject before runtime/native/network/secret effects; do not inject a selector into SDK codec.'
  limitation='Complete typed A/B locally defined. Native effect eligibility requires genuine captured TWO authorized target resources and installed protocol/model/tool fixtures; these fictional resource IDs are not installation receipts.'
 elif field=='agent':
  family='fixed-prism-protocol-resource';classification='R';eligibility='immutable supported original protocol target; no independent profile B'
  oracle='requiresDesign=true calls runtime.dispatch canonicalId prism. requiresDesign=false exits passed before reading config or dispatch, a masking control only. Non-prism config violates source schema and stage config guard.'
  negative='Replace agent with case-target-b -> owning const rejection, no productive admission; bypass const stage config guard must reject. No native alternative granted merely because a target map contains another key.'
  limitation='A and B are intentionally identical complete profiles; distinct supported agent B is unavailable in current code. Original alternate/F-EFFECT requirements not waived.'
 elif field in ['storageRoot','orchestratorIssuerId']:
  family='original-state-writer-projection';classification='R';eligibility='derive exclusively from original retained run writer/R state source; not editable per-M authority'
  oracle=('Read original completed coordinator-mode history at exact original absolute no-symlink root, pin events/snapshot/effects inode/stat/hash, head, digest, run and producer. Alternate root is a negative wrong-source control, not a distinct valid same-history B.' if field=='storageRoot' else 'Use exact original orchestrator writer issuer during recoverStageStates. Authentic authority-dependent wait/signal records required for a meaningful wrong-issuer rejection; issuer-independent histories mask this field. A different current/latest issuer cannot reinterpret retained history.')
  negative='Relative/empty/symlink/wrong-root/changed head or snapshot rejects; wrong writer on authority-dependent original records rejects before export; unreadable historical coordinator mode is explicitly unsupported, never synthesized/migrated for test.'
  limitation='A/B identical for same original source. Valid B requires a separately genuine complete source/writer context, not a new author of the same retained history. Original effects remain OPEN.'
 elif field in ['maximumJournalBytes','maximumArtifactBytes','maximumBundleBytes']:
  b[field]=524288;family={'maximumJournalBytes':'combined-original-journal-snapshot-effects-bytes','maximumArtifactBytes':'aggregate-selected-artifact-bytes-before-read','maximumBundleBytes':'complete-canonical-bundle-export-bytes'}[field]
  oracle={'maximumJournalBytes':'Q measures events.jsonl + run-snapshot.json + present effects.jsonl raw bytes, each later read gets REMAINING Q. Exact authentic sum=Q accepted, Q-1 rejected with RUN_EVIDENCE_FILE_OR_BUDGET_INVALID; allocations include file-size+1. Never independently Q per file, truncate, reset, compact or remove effect records.','maximumArtifactBytes':'Sum actual selected ArtifactRef.sizeBytes in fixed selection order; safe integer and JSON media checked before each artifacts.read. Total=Q accepted, Q+1 triggers REPORT_ARTIFACT_BUDGET_EXCEEDED before reading offending artifact. Ref/response canonical identity/digest/size/encoded bytes and source-kind guards still must hold.','maximumBundleBytes':'Buffer.byteLength(actual canonicalJson(buildEvidenceBundle(...))) includes digest, facts, attempts, selected/omitted refs and omission metadata. Exact bytes=Q exported; Q+1 REPORT_BUNDLE_BUDGET_EXCEEDED after read-only source verification, before bundle return. Source changed between reads rejects regardless quota.'}[field]
  negative='1..MAX_SAFE_INTEGER domain is numerical policy, NOT proof arbitrary huge allocations fit native memory/storage. Use unchanged authentic source crossing 524288..1048576, with all earlier/later quotas generous, original required evidence intact. Exact sum/exact sum-1 derived additional full profiles only after real source bytes frozen; no arbitrary midpoint numeric mock.'
  limitation='Concrete A=1MiB/B=512KiB whole profiles; matching causal authentic source fixture remains to be supplied/captured. Adjacent same-boundary byte formula is exact, not fabricated original state/native acceptance.'
 elif field=='target':
  b[field]='case-operator-b';family='operator-publish-target-resource';classification='R'
  oracle='requiresDesign=true, no valid prior approval, same verified architecture and runtime prism result: signal.wait create succeeds, then operator.request/publish canonicalId exact selected target. A/B targets must BOTH belong to original authorized messaging catalog/grants with genuine distinct destination receipts. Approved branch masks target because publish/wait absent.'
  negative='Unknown/ungranted target rejects at real operator.request capability/target catalog; no invented endpoint, credential or route. Forged wait issuer/expiry/project/waitId rejected PRISM_DESIGN_WAIT_INVALID.'
  limitation='Typed two-target fixture is not installed operator routing. Original authority/native delivery effects remain OPEN.'
 elif field=='issuerId':
  b[field]='case-issuer-b';family='operator-approval-issuer-binding';classification='R'
  oracle='Without approval, exact selected issuer copied into signal.wait/create authorizedIssuer and operator.request payload, waitFrom demands same issuer. With same genuine approval signed/recorded for A, changing to B rejects PRISM_DESIGN_APPROVAL_INVALID before try/dispatch. Valid B context needs original authorized B issuer association, not grant widening.'
  negative='Forged issuer type/id, architecture digest, approvalId, bundle digest rejects; genuinely issuer-independent no-approval record only proves intended waiter association, not authentication receipt.'
  limitation='Typed A/B issuer association and precise negative oracle locally defined; native signed authority/context facts absent. No independently invented principal.'
 elif field=='timeoutMinutes':
  b[field]=30;family='persisted-approval-wait-expiry-minutes';oracle='No prior approval and requiresDesign=true: expiresAt=Date(now)+minutes*60000, same exact value checked by waitFrom and copied to operator publish/wait result. A60/B30 at same controlled admitted clock implies expiry delta1800000ms. This is persisted wait policy, not the stage invocation timer/native wall-time budget.'
  negative='0/fraction/string and >525600 rejected owning schema; approved branch or requiresDesign=false masks wait-time policy. Wrong returned expiry rejects PRISM_DESIGN_WAIT_INVALID; ensure original wait retention/clock/deadline/resource policies admit both choices.'
  limitation='Current source Date.now is real clock; pure formula controls do not prove authenticated durable wait/signal/expiry or cancellation behavior.'
 elif field=='deliveryManifestEncoding':
  b[field]='delivery-manifest.utf16-v1';family='explicit-delivery-manifest-version-and-byte-contract';classification='R'
  oracle='A explicit profile absence selects historical delivery-manifest.v2 canonicalJson digest; B present const selects v3 createDeliveryManifestV3 and outer artifacts.write kubeclaw-json.utf16.v1. Same actual module/final gate coverage and verified evidence/ref bytes; Unicode key order fixture must distinguish canonical locale ordering vs UTF16 codec. V3 semantic review encoding requires explicit outer reviewArtifactEncoding; no fallback/latest/default fill.'
  negative='Unsupported present encoding and wrong review semantic/outer encoding combination reject exact DELIVERY_MANIFEST_ENCODING_INVALID or DELIVERY_REVIEW_ARTIFACT_MODE_INVALID, before write. Missing/ambiguous/corrupt evidence/source/coverage rejects independently.'
  limitation='Schema-domain A absence/B const is intentional full branch, not omitted policy filled from live defaults. Actual typed v2/v3 coverage/evidence fixture and whole native artifact provenance remain OPEN.'
 else:raise AssertionError(field)
 aid=rid+'-A';bid=rid+'-B';owners[p]['profiles'][aid]=profileA;owners[p]['profiles'][bid]=profileB
 pair={'fieldId':rid,'packageId':pkg,'registrationId':reg,'A':{'profileId':aid,'profile':profileA,'sha256':bodysha(profileA)},'B':{'profileId':bid,'profile':profileB,'sha256':bodysha(profileB)},'taskRef':tasks[p],'sameTask':True,'sameOriginalR':True,'distinctProfile':profileA!=profileB,'qualification':limitation}
 pairs.append(pair)
 paths=['skills/nova/plugins/'+p+'/src/stage.ts']
 if field=='agentRole':paths+=['skills/nova/core/execution/pipeline-loop.ts','skills/nova/core/execution/run-decisions.ts']
 elif 'maximum' in field or field in ['storageRoot','orchestratorIssuerId']:paths+=['skills/nova/plugins/pipeline-review/src/evidence-adapter.ts','skills/nova/core/state/read-run-evidence.ts']
 elif field=='deliveryManifestEncoding':paths+=['skills/nova/plugins/project-summary/src/summary.ts']
 else:paths+=['skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts','skills/common/plugins/runtime-dispatch/src/openclaw.ts']
 refs=source_refs(paths,[field,'canonicalId:','runtime.dispatch','withRuntimeDispatchProfile','REPORT_','RUN_EVIDENCE_','deliveryManifestEncoding'])
 ptr='#/properties/profiles/additionalProperties/properties/processing/properties/'+reg.replace('~','~0').replace('/','~1')+'/properties/'+field
 definitions={'id':rid,'packageId':pkg,'registrationId':reg,'original':m,'originalDomain':originalnode(m),'currentDefaults':'No schema default for this original node. Optional agentRole absence omits diagnostic label; delivery encoding absence explicitly chooses historical v2. stage config is supplied by task/project graph currently; target complete selected package owner projection requires approved migration, not claimed installed.','policyClass':classification,'eligibility':eligibility,'family':family,'soleProposedAuthor':{'path':'config/plugins/'+pkg+'.config.json','instanceId':'fixture.'+p,'pointer':'#/profiles/<selected>/processing/'+reg+'/'+field,'taskPartition':'Task requests/architecture/source/workspace/project/run/approval/report intent stay task; runtime target map/grants/native source/issuer derived from retained original R, not task or stage-editable shadow copies.'},'completeOwnerSchemaRef':'schemas/'+p+'.owner.schema.json','completeOwnerSchemaPointer':ptr,'AProfile':aid,'BProfile':bid,'taskRef':tasks[p],'sourceWitnesses':refs,'expectedOracle':oracle,'negative':negative,'limitations':limitation,'originalRequirements':next(r['requirements'] for r in rows if r['id']==rid),'futureResult':'not-run','originalCaseIds':m['originalCaseIds'],'reviewerConfirmation':'pending independent review'}
 fields.append(definitions)
 node=schemas[p]
 for part in ptr[2:].split('/'):node=node[part.replace('~1','/').replace('~0','~')]
 definitions['activeSchemaBinding']={'path':'schemas/'+p+'.owner.schema.json','sha256':digest(O/('schemas/'+p+'.owner.schema.json')),'pointer':ptr,'exactNode':node,'qualification':'One normative proposed owner node per original field; original schema/node is historical source domain, not another active generation.'}
 for side in ['A','B']:
  view=copy.deepcopy(owners[p]['profiles'][aid if side=='A' else bid]['processing'][reg]);path='receiving/pairs/'+rid+'/'+side+'.json';write(path,view)
  receiving.append({'fieldId':rid,'side':side,'packageId':pkg,'registrationId':reg,'instanceId':'fixture.'+p,'serviceInstanceId':'fixture.service.nova-runtime','ownerRef':'config/plugins/'+pkg+'.config.json','profileId':aid if side=='A' else bid,'selectedProfileSha256':bodysha(owners[p]['profiles'][aid if side=='A' else bid]),'currentProjectionRef':path,'currentConfigSchemaRef':m['source']['path'],'currentProjectionSha256':bodysha(view),'qualification':'Current-wire schema projection only, NOT current loader/registry late selected policy support or activation proof.'})
for p in packages:write('config/plugins/kubeclaw.'+p+'.config.json',owners[p])
write('field-definitions.json',fields);write('profile-pairs.json',pairs);write('receiving-index.json',receiving)

base=B/'same-entry-engine-binding-01';root=json.loads((base/'stand/config/pipeline.config.json').read_text());root_schema=json.loads((base/'schemas/pipeline-entry.schema.json').read_text())
write('config/pipeline.config.json',root)
inherited=[]
for top in ['config','charts','my-values']:
 for src in (base/'stand'/top).rglob('*'):
  if not src.is_file():continue
  relative=src.relative_to(base/'stand');dst=O/relative
  if relative.as_posix()=='config/pipeline.config.json':
   assert dst.read_bytes()==src.read_bytes()
  else:
   if dst.exists():assert dst.read_bytes()==src.read_bytes(), 'Unexpected changed inherited file collision: '+str(relative)
   else:dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(src.read_bytes())
  inherited.append({'source':pin(src),'target':relative.as_posix(),'sha256':digest(dst)})
write('frozen-base-physical-file-set.json',{'files':inherited,'qualification':'The shared complete physical v7 author namespace is retained unchanged, plus explicit Nova package owners. Future root pair files are complete root-value views over this shared namespace, not standalone installed/deployable directory trees or a competing CONFIG index. A future reviewed generation author must materialize the sole entry plus this exact file-set at the receiving root; no implicit file lookup/current fill.'})
future_schema=copy.deepcopy(root_schema);future_schema['properties']['schemaVersion']={'const':'pipeline-entry.v7-nova-extension.proposal01'}
selection=future_schema['properties']['pluginSelections']['items'];selection['properties']['kind']['enum'].append('stage')
for p in packages+['runtime-dispatch']:
 pkg='kubeclaw.'+p;selection['properties']['packageId']['enum'].append(pkg);selection['properties']['ownerPath']['enum'].append('plugins/'+pkg+'.config.json')
 for r in (manifests[p]['stages']+manifests[p]['adapters']) if p!='runtime-dispatch' else [{'id':'openclaw'}]:selection['properties']['registrationId']['enum'].append(pkg+':'+r['id'])
write('schemas/future-same-entry-extension.schema.json',future_schema)
extension=[]
for p in packages:
 for kind,r in registrations[p]:extension.append({'kind':'stage' if kind=='stages' else 'adapter','packageId':'kubeclaw.'+p,'registrationId':'kubeclaw.'+p+':'+r['id'],'instanceId':'fixture.'+p,'ownerPath':'plugins/kubeclaw.'+p+'.config.json','profileId':'A','serviceInstanceId':'fixture.service.nova-runtime'})
extension.append({'kind':'adapter','packageId':'kubeclaw.runtime-dispatch','registrationId':'kubeclaw.runtime-dispatch:openclaw','instanceId':'fixture.runtime-dispatch','ownerPath':'plugins/kubeclaw.runtime-dispatch.config.json','profileId':'A','serviceInstanceId':'fixture.service.nova-runtime'})
for pair in pairs:
 for side in ['A','B']:
  value=copy.deepcopy(root);value['schemaVersion']='pipeline-entry.v7-nova-extension.proposal01';value['pluginSelections']+=copy.deepcopy(extension)
  for s in value['pluginSelections']:
   if s['packageId']==pair['packageId']:s['profileId']=pair[side]['profileId']
  path='future-entry-pairs/'+pair['fieldId']+'/'+side+'/config/pipeline.config.json';write(path,value);roots.append({'fieldId':pair['fieldId'],'side':side,'path':path,'sha256':bodysha(value),'selectedOwner':'config/plugins/'+pair['packageId']+'.config.json','selectedProfile':pair[side]['profileId'],'selectedProfileSha256':pair[side]['sha256'],'rootQualified':'Full source-definition future single-entry proposal only; does not pass unchanged current v7 schema or become a current installed root. Frozen v7 all six components/bindings/old selections retained.'})
write('whole-entry-pairs.json',roots)
write('same-entry-extension-dependency.json',{'currentNormativeRoot':pin(base/'stand/config/pipeline.config.json'),'currentNormativeSchema':pin(base/'schemas/pipeline-entry.schema.json'),'currentReviewedSupplement':pin(B/'same-entry-engine-binding-02/README.md'),'independentReviewedSupplement':pin(B/'independent-same-entry-engine-binding-review-02/README.md'),'ownBaseRoot':'config/pipeline.config.json','proposalSchema':'schemas/future-same-entry-extension.schema.json','qualification':'No simultaneous normative schemas. Engine02 is supplement of physical Engine01 v7. This artifact is a future additive Nova extension pending independent review + combined same-entry author integration; no publication/version reservation. v8 Gateway/Browser author pending explicitly NOT inherited.','soleWriter':'User writes complete per-package-instance profile under the original config/plugins/<package>.config.json. One selection tuple chooses it. The generation author reads once, validates every declared profile/whole entry and all source relations, creates readonly current receiver projection. TASK has no fallback/shadow writer. No file reread/latest/deep merge on retry/recovery/cleanup.','receivingClosure':['same role/service/package/instance/registration/profile tuple per ALL stage+adapter rows belonging to one package instance','stage type owner actual manifest; module export, config/input/result source/schema digests unchanged until approved migration','original R selected runtime.dispatch provider EXACTLY one registration (HTTP or OpenClaw), its complete selected owner/target map/grants/secret revision shared, not switched by stage codec','pipeline-review stage AND evidence adapter same package instance/profile/service; evidence root/writer exact original source authority, source service relationship verified independently','existing six components remain six; Nova native state/orchestrator/host/grant contexts are original C3 R resource dependencies, no invented seventh component or borrowing arbitrary Buster/Prism role as Nova authorization','new receiving ABI required at engine-runtime/registry configuration validation/runner graph/StageExecutor config/AdapterStarter config/parent R provenance/snapshot. Current readers do not load these selected owners.'],'rejections':['missing/duplicate selection','wrong package or source/module/schema digest','same package stage/evidence split profile/instance/service','wrong role/context or arbitrary service owner','wrong original native grant/resource/target/catalog/secret revision','unbound task override or ordinary model payload attempting control metadata','recovery latest-B replacement of stored original R/J binding']})

casecontracts=[]
for case in cases:
 mem=[f for f in fields if case['id'] in f['originalCaseIds']];assert len(mem)==1
 f=mem[0];suffix=case['id'].split('-')[-1]
 action=f['expectedOracle']
 if suffix=='BINDING':action='Capture original source-defined R and logical M/J binding from A; publish complete B; started M remains A across all stages/retries/repair/cleanup, only eligible next unstarted M may B within original R/S/H; wrong role/module/free-graph membership/source/contract/instance/service/parent-R rejects. Current wholegraph/R pins preserved; no claim late-M binding already implemented.'
 elif suffix=='RECOVERY':action='Crash/restart at actual persisted parent-R/module/effect boundary using stored original A graph/registry/config/source/native counter/deadline/secret revisions. Make B current, remove unrelated current files, and require exact stored A or explicit unsupported legacy rejection without effects; no latest-B fill, reset, synthetic old receipt or fresh controller budget. Ambiguous native effect must reconcile before retry; cleanup keeps original ownership.'
 elif suffix=='EVAL':action='Freeze complete profiles/root/package/task/input/source/native context and generation before fixed Eval; evaluate paired task corpus under exact fixed generation, no evolving B/current selection/model roster or replenished native counters. Same original requirements and protocol/parser/cleanup observers; author source checks are not fixed Eval execution.'
 elif suffix=='MUTANT':action='Approval-only isolated production mutant bypasses exact intended field reader/rejecting boundary in field negative/oracle below; decisive same-source negative must fail, restore bytes, rerun genuine positive A/B + cleanup/recovery. No mutant implemented or run in C0.'
 elif suffix=='VAL':action=f['negative']+' Positive complete A/B source schema and semantic admission controls required; source checks here do not replace real provider/runtime admission.'
 casecontracts.append({'id':case['id'],'fieldId':f['id'],'originalCaseRef':'original/cases.json','originalBodySha256':bodysha(case),'originalPhase':case['phase'],'originalResult':case['result'],'originalRequirementIds':case['requirementIds'],'nativeOriginalRef':'original/native-case-bodies.json' if any(c['id']==case['id'] for c in nativecases) else None,'profilePairRef':'profile-pairs.json#'+f['id'],'wholeEntryRef':'whole-entry-pairs.json#'+f['id'],'taskRef':f['taskRef'],'completeOwnerSchemaRef':f['completeOwnerSchemaRef'],'completeOwnerSchemaPointer':f['completeOwnerSchemaPointer'],'activeSchemaBinding':f['activeSchemaBinding'],'family':f['family'],'action':action,'fieldEffectOracle':f['expectedOracle'],'negativeControls':f['negative'],'priorState':'Genuine authenticated original registry/package/config/grants/source/parent R/J/module/secret revision/native ceilings captured before effect; local synthetic fixtures only establish source/schema/serialization shape.','observer':'Actual admitted capability resource IDs + original effect ledger/native session attestation/lease/frame/byte identity + original event/artifact/report/wait receipts; zero forbidden side effects at exact rejection. Original native outputs/producers/cleanup/cancellation must be real, no mock replaced boundary. For agentRole diagnostic-only source event, not model identity proof.','futureCommand':next((c.get('command') for c in nativecases if c['id']==case['id']),case.get('command')),'limitations':f['limitations'],'futureResult':'not-run','reviewerConfirmation':'pending fresh independent review'})
write('case-definitions.json',casecontracts)

# Additional actual literal source dependencies use immutable coordinate identity, never ghost IDs.
processing=[]
for path,terms,semantics in [
 ('skills/common/plugins/runtime-dispatch/src/openclaw-config.ts',['agentId:','thinking:','target.maxPromptBytes ===','target.maxOutputTokens ===','target.tokenizerEncoding ===','timingValid','runtime: raw.runtime'],'Direct parser fallbacks agentId invalid/missing->codex, role invalid/missing->target ID, trimmed required model, thinking default high but no enum (direct empty string possible); strict schema stricter. Fixed current encoder o200k_base and prompt900000/input120000/output6000/context128000. Proposed native adjustable budget from Runtime08 is migration only, not current support. Source relational timing/collector/controller/result/URL/path checks remain.'),
 ('skills/common/plugins/runtime-dispatch/src/openclaw.ts',['assertPromptBudget','assertOutputBudget','runtimeAttestation','sessions_spawn','sessionLabel','runtimePromptBudget','runtimeDispatchAttempt','pacedSpawn','reconcileOpenClawFailure'],'Actual spawn passes runtime,agentId,model,thinking; label uses runtime TARGET agentRole (not stage agentRole) plus collision-resistant dispatch identity. Prompt measured UTF8/tokenizer before spawn; returned output checked AFTER native generation. SDK codec cannot select target/model/token cap. Input control fields stripped only exact whitelist; cancellation combines declared absolute deadline with original signal. Preserve source results/session model/attestation/result bytes/atomic file and fenced cleanup.'),
 ('skills/common/plugins/runtime-dispatch/src/adapter.ts',['boundedInteger','authentication:','assertRequest','maxRequestBytes','maxResponseBytes'],'HTTP adapter independently requires original selected runtime registration, HMAC/SPIFEE-proxy constraints. 1..8388608 bytes JSONbody before secret/request and response.body reserialized after request; default1MiB. JSON depth20/container1000/key128 shape not OpenClaw tokenizer/session limits.'),
 ('skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts',['PROFILE_BYTES','ALREADY_BOUND','CAPABILITY_INVALID'],'Exact finite runtime-dispatch-profile.v1/json-utf16-v1 marker; no model/target/config generation fields. Historical absence explicit; no double binding; only invocation-root metadata is control.'),
 ('skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts',['RUNTIME_RESULT_FILE_MAX_BYTES','JSON.stringify','RUNTIME_AGENT_TASK_PREFIX'],'Immutable wrapper and task serialized exactly once; fixed result path max2048UTF8 bytes; instructions are protocol/safety source, not task-overridable arbitrary prompt. Mutable task and actual guidance remain task intent within source-specific protocol.'),
 ('skills/nova/core/execution/stage-executor.ts',['wallTimeMs','config: definition.config','PIPELINE_STAGE_NOT_ACTIVATED','runtime.controller.abort'],'Current native lease wall/cpu stage timeout and memory512MiB source declaration; runner schema and wholegraph pin. Kernel/model stopping proof separate; no arbitrary domain widening or assumption current native registration profiles loaded.')]:
 refs=source_refs([path],terms)
 for c in refs:processing.append(dict(c,identity=bodysha({'sourceSha256':c['sha256'],'pointer':'line:'+str(c['line']),'text':c['text']}),semantics=semantics,associatedOriginalFieldIds=sorted(ids),associatedFutureCaseArtifact='case-definitions.json',originalCandidateId=None,qualification='Actual literal receiving dependency; no additional canonical original field/ID claimed. Whole-universe scanner coverage remains open.'))
write('source-processing-coordinates.json',processing)
write('unavailable-independent-effects.json',[{'fieldId':f['id'],'family':f['family'],'limitation':f['limitations'],'originalCaseIds':f['originalCaseIds'],'requirementsOpen':True} for f in fields if not next(p for p in pairs if p['fieldId']==f['id'])['distinctProfile'] or f['family']=='diagnostic-event-provenance-not-authorization'])
write('conservation.json',{'originalFields':18,'originalCanonicalCases':len(cases),'originalNativeBodies':len(nativecases),'scopeCounts':{p:len(groups['kubeclaw.'+p]) for p in packages},'originalAllCaseBodiesPreserved':True,'originalRequirementsStatesAndHistoryPreserved':True,'originalFEffectBINDRecoveryEvalNotWaived':True,'completePackageOwners':6,'declaredCompletePackageProfiles':sum(len(v['profiles']) for v in owners.values()),'currentWireReceivingViews':len(receiving),'wholeFutureSingleEntryPairs':len(roots),'noIndependentDistinctProfileFields':[p['fieldId'] for p in pairs if not p['distinctProfile']],'nativeActions':0,'implementationAuthorization':None,'freshIndependentReview':'required; no self/global C0 acceptance'})
text('README.md','''# Nova agent targets — additive C0 source-definition proposal 01

Exactly **18 original fields / 144 original linked cases** across architecture-validator 2,
implementation-agent 2, pipeline-review 7, Prism design 4, project-summary 2 and case-study 1.
All original row/canonical/native bodies, phases, requirements and histories are frozen, not rewritten.
No original future case is passed by these definition checks. No implementation/native/global acceptance.

## Concrete definition

- Six actual manifest packages/stages and the pipeline-review evidence adapter use one existing
  `config/plugins/<package>.config.json` owner per package instance, complete closed default-free
  profile generation. `profile-pairs.json`, `field-definitions.json`, `case-definitions.json` and
  36 whole future-entry views identify exact source domains, readers, cases and receiving shapes.
- Four stage `agentRole` fields are **diagnostic event provenance only**: exact strings are copied
  by current PipelineLoop/run-decisions; they do not authorize model, role, tools or dispatch.
  Batch20 correction supersedes batch16 removal prose without rewriting either historical artifact.
- Prism `agent` is constant `prism`; original state root and original writer issuer cannot acquire
  an independent valid same-history B. Their complete A/B copies intentionally coincide. Original
  F-EFFECT/alternate obligations remain open, not waived. Evidence budgets have concrete 1MiB/512KiB
  whole profiles; real unchanged authentic source byte crossings remain a future fixture qualification.
- HTTP and OpenClaw adapters are distinct selected registrations. SDK codec is finite metadata,
  **not** a target/model/thinking/generation selector. OpenClaw output-token validation is post-output,
  not provider stopping/token budget evidence. Current fixed tuple is preserved; Runtime06/08
  history and proposed adjustable domains are not silently substituted into current constructors.
- Task request/source/project/architecture/workspace/approval intent remain TASK. Original R/S/H
  grants, source/issuer authority, native quotas/counters, agent/model/harness/tool/secret revisions
  remain immutable dependencies. Fictional parser fixtures prove no installed endpoint/model/agent.

## Single-entry dependency / receiving ABI

Current reviewed base is **physical Engine01 v7**, supplemented by reviewed Engine02 admission
relations; `config/pipeline.config.json` here is its exact frozen copy. The Nova future schema and
complete root views are an explicit additive extension proposal, **not a second current root**,
not a reserved published generation and not pending v8 Gateway/Browser integration. Existing six
components and their binding identities are unchanged. See `RECEIVING-ABI.md` and
`same-entry-extension-dependency.json`. No seventh component, private root/index or registry
multi-instance routing is invented. Exact receiving/native resource integration still requires
combined author review and approved C3/C4/C5 implementation, not current loader acceptance.

## Finite review priorities

1. Check all 18 field/case schema nodes, complete paired profiles/current projections and original bodies.
2. Independently challenge diagnostic-only role preservation, Prism constant, original writer/state
   classifications and causal masking controls; retain unsupported original effect obligations.
3. Challenge whole package stage+adapter/service/profile/role closure, source/contract/parent-R/module
   membership/cancellation/fence/deadline/cleanup/secret/counter/byte-frame and fixed Eval cases.
4. Integrate only through an explicit reviewed single-entry generation delta; capture genuine original
   target/operator/source/native/model/SDK/tool/host/auth rosters before any future productive run.

`COMMANDS.md`, raw attempts and `definition-observations.json` describe bounded pure checks only.
No stage execute, adapter activation, model/provider/browser/network/API/CLI/credentials/native/Eval.
Fresh independent review is required; source counts and this author report are not acceptance.
''')
text('RECEIVING-ABI.md','''# Proposed receiving migration, not current runtime support

## Sole writer and selection

The existing single entry selects exact package/registration/instance/profile/ownerPath/service.
The package owner supplies each full registration's processing config; no stage/task policy fallback,
deep merge, schema-default policy fill, current-B reread or second per-registration file writer.
All declared profiles and every selected tuple must be schema/semantic admitted before generation.
Pipeline-review stage and evidence adapter must agree on package instance/profile/service; project
summary has no runtime dispatch capability. Exact package module/export/schema/source digest and
manifest capabilities are immutable package provenance, not editable policy grants.

## Actual current receiving chain

Registry validateRuntimeRegistrationConfiguration validates stage.config and enabled adapter configs;
PipelineRunner validates graph/input/config against actual owner; StageExecutor copies graph definition
config to plugin-context.v2. AdapterStarter validates cached platform adapter config and captures it at
activation. Core snapshots preserve whole graph/config/registry/package/grants, exact SDK marker and
source; recovery rejects mismatch. This does NOT already implement sole selected CONFIG profiles or
logical next-unstarted-M rereads. The future author must project validated policy readonly at these
same receiving paths, with exact versioned ABI and stored original R/J dependency identity.

## Original native resource authority

Each selected stage obtains actual original lease and manifest capability grant. Runtime dispatch
resource IDs must be members of captured target map AND matching original resource grants; only one
actual runtime.dispatch provider registration is selected. OpenClaw target runtime/agentId/model/thinking
belongs to captured native target owner; agentRole there is a session-label input, not stage role/grant.
Pipeline evidence storageRoot/orchestratorIssuerId are generated original writer projections; no second
editable trust author. Prism operator target/issuer require original genuine messaging/approval authority.
Stage timeout/CPU/memory leases are source declarations; kernel/browser/model/proxy controls need real
native receipts. No permissive role inference from field spelling or arbitrary Buster/Prism component.

## Durable temporal / role and byte boundaries

R retains exact activated provider/service/source/schema/grants/native remaining counters/deadline/secret
revision for all child modules. J/task/profile/root/source/model payload codec/frame bytes are frozen at
declared boundary; stored binding includes exact original parent-R/module contract/generation/instance
and logical graph membership. Started M remains A across later stages/attempt/repair/recovery/cleanup;
only eligible next unstarted M can B within R ceilings. Standalone/freegraph entry must obtain the same
authentic role/source/parent context, not arbitrary prefix IDs. Unsupported legacy rejects before effects,
never manufactures new bindings or translates old bytes into current generation. Diagnostics retain
exact historical stage agentRole strings; no authorization propagation from those labels. Fixed Eval
uses one captured generation and fixed genuine task/native fixture universe, no evolving current-B fill.

## Exact future rejection and mutation contract

Reject missing/duplicate/split package stage/evidence profile or instance/service, wrong registration/
module/schema source, missing native context, wrong role/source/parent-R/freegraph membership, unauthorized
runtime/target/resource, SDK selector injection, task policy shadow, stale digest/byte/frame/contract,
wrong secret revision, exceeded remaining deadline/quota, and unsupported legacy. Observe original real
effect/session/journal/artifact/wait receipts and zero forbidden effects at the exact rejecting boundary.
Production mutants are approval-only future work; restore pinned source and rerun positive after each.
No cleanup or cancellation success is inferred from Promise rejection; genuine owner-specific native
quiescence and uncertain-effect reconciliation must be observed. Existing original obligations stay open.
''')
print(json.dumps({'fields':18,'cases':144,'nativeBodies':len(nativecases),'profiles':sum(len(v['profiles']) for v in owners.values()),'sources':len(sourcepins),'historyPins':len(history),'productiveActions':0}))
