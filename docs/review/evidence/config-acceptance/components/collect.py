from pathlib import Path
import json,hashlib,re,subprocess,datetime
ROOT=Path.cwd(); OUT=ROOT/'docs/review/evidence/config-acceptance/components'
S='skills/common/plugin-runtime/foundation/config/swarm-components.schema.json'
schema=json.loads((ROOT/S).read_text()); defs=schema['$defs']; rows=[]; sources={}; gaps=[]
def sha(p):return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def source(p,disposition,id=None):
 if not (ROOT/p).is_file():return
 if p not in sources:sources[p]={'path':p,'sha256':sha(p),'disposition':disposition,'settingIds':[]}
 if id and id not in sources[p]['settingIds']:sources[p]['settingIds'].append(id)
def resolve(s,refs=None):
 refs=[] if refs is None else refs
 if '$ref' in s:
  ref=s['$ref']; refs.append(ref)
  if not ref.startswith('#/'):raise Exception(ref)
  n=schema
  for t in ref[2:].split('/'): n=n[t.replace('~1','/').replace('~0','~')]
  return resolve(n,refs)
 return s,refs
def leaves(s,p=(),refs=None):
 s,refs=resolve(s,list(refs or []))
 if s.get('type')=='object':
  for k,v in s.get('properties',{}).items():yield from leaves(v,p+(k,),refs)
 else:yield p,s,refs
def val(v,p):
 for k in p:v=v[k]
 return v
def getfiles(prefixes):
 return [str(p.relative_to(ROOT)) for pre in prefixes for p in (ROOT/pre).rglob('*.ts') if '/tests/' not in str(p) and '/test/' not in str(p)]
allfiles=getfiles(['skills/buster/engine/test-gates','skills/prism','skills/worker/core/worker','skills/common/plugin-runtime/foundation/observability'])
contents={p:(ROOT/p).read_text() for p in allfiles}
base='charts/kubeclaw/files/config/'
shared=['skills/common/plugin-runtime/foundation/config/swarm.ts','skills/common/plugin-runtime/foundation/config/swarm-bundle.ts',S,'charts/kubeclaw/templates/_swarm-config.tpl']
B='skills/buster/engine/test-gates/'; P='skills/prism/'; C='skills/common/plugin-runtime/foundation/observability/'
def chain(owner,p):
 key='.'.join(p); tail=p[-1]
 if owner=='worker-core':return ['skills/buster/engine/remote-plan-cli.ts',B+'production.ts',B+'remote-plan-service.ts',B+'runner-setup.ts','skills/worker/core/worker/local-runtime.ts']
 if owner=='prism-control':return [P+'server/control.ts',P+'server/control-config.ts',P+'server/control-server.ts',P+'server/control-context.ts',P+'server/dispatch-route.ts',P+'server/agent-routes.ts',P+'control/worker-operation-transport.ts']
 if owner=='prism-studio':return [P+'server/studio.ts',P+'server/studio-config.ts',P+'server/studio-request.ts']
 if owner in ['prism-worker','prism-execution']:return [P+'server/worker.ts',P+'server/worker-config.ts',P+'config/native-worker.ts',P+'server/worker-service.ts',P+'server/native-worker-execution.ts','skills/worker/core/worker/native-worker-ownership.ts','skills/worker/core/worker/native-worker-process.ts']
 if p[0]=='preparation':return [B+'preparation-supervisor.ts',B+'preparation-config.ts',B+'preparation-parent-channel.ts',B+'preparation-host-channel.ts',B+'preparation-client.ts',B+'preparation-ledger.ts',B+'preparation-archive.ts',B+'preparation-command.ts',B+'preparation-reservations.ts',B+'preparation-native-phase.ts',B+'preparation-cleanup-execution.ts']
 if p[0]=='admission':return ['skills/buster/engine/remote-plan-cli.ts',B+'production.ts',B+'remote-plan-service.ts']
 if p[0]=='dependencyReadiness':return ['skills/buster/engine/remote-plan-cli.ts',B+'production.ts',B+'remote-plan-service.ts',B+'buildkit-readiness.ts',B+'dependency-process.ts']
 if p[0]=='execution':
  b=['skills/buster/engine/remote-plan-cli.ts',B+'production.ts',B+'remote-plan-service.ts',B+'runner.ts']
  if p[1]=='provider':return b+[B+'runner-provider-operation.ts',B+'runner-attempt-result.ts',B+'runner-attempt-envelope.ts',B+'provider-process-session.ts',B+'provider-loader.ts']
  if p[1]=='reports':return b+[B+'specialist-report-finalization.ts',B+'report-adapter-runtime.ts']
  if p[1]=='observation':return b+[B+'provider-process-session.ts']
  if p[1]=='processInput':return b+[B+'process-input.ts',B+'process-input-lifecycle.ts']
  return b+[x for x in allfiles if x.startswith(C)]
 return ['skills/buster/engine/remote-plan-cli.ts',B+'production.ts',B+'production-cluster-options.ts',B+'capability-runtime.ts']+[x for x in allfiles if x.startswith(B) and (('kubernetes-fixture' in x or 'kubernetes-manifest' in x) if p[1]=='kubernetesFixture' else ('tailscale' in x if p[1]=='tailscaleExposure' else 'kubernetes-runtime-security' in x if p[1]=='runtimeSecurity' else any(t in x for t in ['kubernetes-fixture','tailscale','kubernetes-runtime-security']))) ]
def unit(k,v):
 if k.endswith('Ms'):return 'milliseconds (cpuTimeMs cumulative CPU time, not wall time)' if k=='cpuTimeMs' else 'milliseconds'
 if k.endswith('Bytes'):return 'bytes'
 if k.endswith('MiB'):return 'MiB'
 if k.endswith('Seconds'):return 'seconds'
 if k=='diagnosticCodeUnits':return 'JavaScript UTF-16 code units'
 if k=='heapFraction':return 'fraction of assigned memory'
 if k in ['uid','gid']:return 'POSIX numeric identity'
 if isinstance(v,(int,float)) and not isinstance(v,bool):return 'count; Linux tasks for tasks, descriptors for OpenFiles'
 return 'dimensionless/string reference'
def effects(owner,p):
 k='.'.join(p)
 if owner=='worker-core':return 'LocalWorkerRuntime keeps replay identity set capped by replayLimit; stop drain timeout followed by cancellation timeout; new config must not clear accepted attempts.'
 if owner=='prism-execution':return 'Owned native attempt policy sets cumulative CPU-time/memory/Linux-task limits and result/journal bounds; D18 changes are later W, not C1.'
 if owner=='prism-worker':return 'HTTP admission/connections/input/request deadline and shutdown supervision; ownership records/journal persist; no automatic reset or current-generation substitution authorized.'
 if owner=='prism-control':return 'Dispatch wall deadline/result bound, artifact storage and preference authorization selected at process composition; authority/claims remain separate.'
 if owner=='prism-studio':return 'HTTP proxy upstream timeout and listener/origin; no attempt retry-budget owner.'
 if p[0]=='preparation':return 'Preparation admission, archive/source reservation, UID-owned journal/cleanup and hard native phase resource policy; budgets and cleanup retained across recovery.'
 if p[0]=='admission':return 'Active/queued plan and concurrent attempt admission; queued work cannot silently reset grants or claim deadlines.'
 if p[0]=='dependencyReadiness':return 'BuildKit dependency readiness subprocess output and execution bounds; not test-node input.'
 if p[0]=='clusterInvokers':return 'Capability namespace/storage/secret/registry grants and bounded kubectl/manifests/polling/retention; runtime binding supplies namespace, never author replaces policy.'
 return {'provider':'Provider subprocess protocol/result sizing, claim/queue and termination timing, heap/openfile/capability budgets; immutable attempt policy required.', 'reports':'Report collection/finalization memory, descriptors, CPU/wall time, aggregate counts/result limits; preserved original report evidence.', 'observation':'Resource/process sample cadence; observation cannot manufacture unknown final kernel counters.', 'stores':'Durable attempt evidence and admission metadata/quarantine retention/count/storage caps; existing persisted state does not reset.', 'processInput':'Input acknowledgement poll, termination grace and cleanup timing; uncertain subprocess state must reconcile.'}[p[1]]
for owner in ['prism-control','prism-studio','prism-worker','prism-execution','buster-engine','worker-core']:
 author=base+owner+'.config.json'; doc=json.loads((ROOT/author).read_text()); profiles={'base':{'source':author,'sha256':sha(author)}}
 variant=base+'profiles/buster-engine.runtime.config.json'
 if owner=='buster-engine':profiles['runtime']={'source':variant,'sha256':sha(variant)}
 for p,contract,refs in leaves(defs[owner]):
  id='CMP-'+owner+'-'+'.'.join(p); field=('settings',)+p; current={name:val(json.loads((ROOT/v['source']).read_text()),field) for name,v in profiles.items()}; files=[x for x in chain(owner,p) if (ROOT/x).is_file()]; token=p[-1]
  aliases={'maximumOwnershipRecords':['maximumRecords'],'maximumOwnershipBytes':['maximumBytes'],'registryRepositoryPrefixes':['allowedRegistryPrefixes'],'runnerServiceAccount':['runnerSubject'],'credentialReaderServiceAccount':['credentialReaderSubject'],'dispatchTimeoutMs':['nativeWorkerDispatchTimeoutMs'],'maximumResultBytes':['maximumWorkerResponseBytes'],'cpuTimeMs':['cpuTimeMs']}
  search=[token]+aliases.get(token,[]); hits=[]
  for f in files:
   for n,line in enumerate(contents.get(f,(ROOT/f).read_text()).splitlines(),1):
    if any(re.search(r'\b'+re.escape(t)+r'\b',line) for t in search):hits.append({'path':f,'line':n,'text':line.strip()})
  for f in files+shared+ [v['source'] for v in profiles.values()]:source(f,'component author/schema or productive reader/caller',id)
  status='source-traced' if hits else 'unresolved-consumer'
  if not hits:gaps.append({'id':'GAP-'+id,'settingIds':[id],'reason':'No concrete field access in bounded productive chain; further alias/destructuring tracing required; do not mark C0 covered.'})
  row={'id':id,'owner':owner,'instanceScope':'selected deployed component instance; Buster capabilities gated by separate runtime allowedCapabilities','profileScope':list(profiles),'class':'secret-reference' if token=='allowedSecretReferences' else 'operator-setting','source':{'path':author,'field':'/'+ '/'.join(field),'sha256':sha(author),'profileSources':profiles},'currentValue':current,'default':'None synthesized in readSwarmBundle/Ajv; explicitly authored values above','precedence':'Whole selected Buster owner replaces base at Helm .Values.busterComponentFile, canonicalized on delivery; other owners read same physical entry generation. No keywise merge; retired ENV rejected even if equal.','type':contract.get('type'),'unit':unit(token,current['base']),'supportedDomain':contract,'schema':{'path':S,'sha256':sha(S),'resolvedRefChain':refs,'rootDefinition':'#/$defs/'+owner},'reader':{'loader':'loadSwarmSettings -> readSwarmBundle, both Prism and Buster validated before return','productiveCallerChain':files,'fieldAccessEvidence':hits,'traceStatus':status},'validationErrorContract':{'structural':'strict Ajv2020 allErrors, no useDefaults: SWARM_CONFIG_INVALID:component:'+owner,'semanticSources':shared+(['skills/common/plugin-runtime/foundation/config/buster-execution.ts','skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts'] if owner=='buster-engine' else []),'relations':'See numbered source logs: Prism connection/shutdown and origin/path checks; Buster storage/source/close/provider timing/report memory/evidence pool/cluster coherence. Every required field checked before return.','io':'SWARM_CONFIG_PATH_REQUIRED; native ENOENT/SyntaxError; nofollow regular file; SWARM_CONFIG_CHANGED on stat drift.'},'targetAuthorRef':{'path':author,'entry':'pipeline.config.json components.'+owner,'proposal':'preserve existing physical chart author + same-owner Buster named full profiles; generated image/chart projections not authors'},'activationScope':{'current':'fully validated frozen startup snapshot; no module-level reload or identity persistence guarantee','target':'next not-started eligible module with durable generation closure; started module stays captured generation; stable grants/recovery remain run-bound'},'recoveryRetryClaimDeadlineBudgetEffects':effects(owner,p),'profileEvalSuitability':'Tunable where complete valid profile satisfies related bounds; fixed Eval generation required. No actual Eval runner or module persistence established. Secret allowlists/grants are stable run policy, not arbitrary midrun tuning.','migrationAction':'C1 preserve selected current values and single-generation packaging; C5 durable module/Eval binding. Do not enact D18 worker changes.','requirementIds':['D17','D20','D21','D22','F1','F2a','F3a','F4a','F5a','C0-A','C0-B','C0-C'],'caseIds':['CMP-C1-VAL-'+owner,'CMP-C1-EFFECT-'+owner,'CMP-C1-DELIVERY','CMP-C1-MUT','CMP-C5-BIND'],'verifiedSourceEvidence':['docs/review/evidence/config-acceptance/components/source-read.log','docs/review/evidence/config-acceptance/components/field-access.json'],'status':status}
  rows.append(row)
 for name in ['schemaVersion','owner']:
  id='CMP-'+owner+'-'+name
  rows.append({'id':id,'owner':owner,'instanceScope':'each owner envelope','profileScope':list(profiles),'class':'protocol-invariant','source':{'path':author,'field':'/'+name,'sha256':sha(author),'profileSources':profiles},'currentValue':doc[name],'default':'no fallback','precedence':'selected full document only','type':'string','unit':'protocol identity','supportedDomain':{'const':doc[name]},'reader':{'productiveCallerChain':shared,'traceStatus':'source-traced'},'schema':{'path':S,'sha256':sha(S),'resolvedRefChain':['oneOf owner envelope']},'validationErrorContract':'Ajv owner-envelope strict const; reader owner check -> SWARM_CONFIG_INVALID:component:'+owner,'targetAuthorRef':{'path':author,'entry':'pipeline.config.json components.'+owner},'activationScope':'bundle load before any startup activation','recoveryRetryClaimDeadlineBudgetEffects':'Identity prevents wrong-owner/unversioned policy acceptance; does not reset state.','profileEvalSuitability':'not a tuning knob; version contract migration required','migrationAction':'retain envelope identity during filename migration; any new version explicit','requirementIds':['D17','D21','C0-A','C0-C'],'caseIds':['CMP-C1-VAL-'+owner],'verifiedSourceEvidence':['docs/review/evidence/config-acceptance/components/source-read.log'],'status':'source-traced'})
  for v in profiles.values():source(v['source'],'sole selected owner author per profile',id)
# sources include semantic validators even if no matched field hit
for p in ['skills/common/plugin-runtime/foundation/config/buster-execution.ts','skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts','skills/common/plugin-runtime/foundation/config/swarm.schema.json','charts/kubeclaw/values.yaml','charts/prism/values.yaml','scripts/updates/release-configuration.mjs']:
 source(p,'shared selector/validator or generated alias definition')
source_log=[]
for p in sorted(sources):
 source_log.append('\nSOURCE '+p+' SHA256 '+sha(p)+'\n')
 source_log.extend(str(i)+': '+line+'\n' for i,line in enumerate((ROOT/p).read_text().splitlines(),1))
(OUT/'source-read.log').write_text('COMMAND: collect.py reading independently enumerated author/schema/productive consumer files; no production edits\n'+''.join(source_log))
(OUT/'field-access.json').write_text(json.dumps({r['id']:r['reader'].get('fieldAccessEvidence',[]) for r in rows},indent=2)+'\n')
gaps.extend([{'id':'CMP-GAP-DURABLE','settingIds':[r['id'] for r in rows if r['class']!='protocol-invariant'],'reason':'Frozen startup values exist, but generation identity is not passed into remote-plan runtime; D20 next-module selection, durable closure and fixed Eval bindings not implemented. C5 proposal only.'},{'id':'CMP-GAP-ENTRY-CONST','reason':'Entry profile/features/tuning are fixed const metadata; no selectable runtime profiles through readSwarmBundle. Helm Buster selection lives outside entry via busterComponentFile. C1 must unify selection without duplicated settings.'},{'id':'CMP-GAP-DEFAULTS-OUTSIDE','reason':'Prism server readers still default ENV URLs, trust flags/IDs, Studio root/ingress secret and browser path; separate parent runtime/ENV inventory must link these, not interpret no component loader fallback as global no-default PASS.'}])
fragment={'rows':rows,'sources':list(sources.values()),'gaps':gaps,'identity':{'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),'observedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()},'coverage':{'schemaLeafSettings':len([r for r in rows if r['class']!='protocol-invariant']),'envelopeFields':12,'authors':6,'extraFullOwnerVariants':1,'schemaRefsResolved':True,'unresolvedFieldConsumers':len([r for r in rows if r['status']=='unresolved-consumer']),'c0Verdict':'not-passed; subset inventory only'}}
(OUT/'semantic-fragment.json').write_text(json.dumps(fragment,indent=2)+'\n')
print(json.dumps(fragment['coverage'],indent=2));print('unresolved:',[r['id'] for r in rows if r['status']=='unresolved-consumer'])
