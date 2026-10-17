import pathlib,json,hashlib,gzip,copy,datetime
ROOT=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');B=ROOT/'docs/review/evidence/config-acceptance/c0-completion-20261013';D=ROOT/'docs/review/evidence/config-acceptance/delivery';O=B/'gateway-openclaw-profile-01'
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(n,d):
 p=O/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
pins={}
def freeze(p,cut=None):
 raw=p.read_bytes();rel=str(p.relative_to(ROOT));h=hashlib.sha256(raw).hexdigest();rec={'path':rel,'sha256':h,'bytes':len(raw)}
 if cut is None:
  t=O/'frozen-inputs'/f'{h}.gz';t.parent.mkdir(exist_ok=True);t.write_bytes(gzip.compress(raw,mtime=0));rec['snapshot']=str(t.relative_to(O))
 else:rec['exactSourceCuts']=cut;rec['qualification']='full physical source SHA/bytes inspected; exact cited source cuts retained instead of giant complete distribution archives'
 pins[rel]=rec;return rec
inventory=load(ROOT/'docs/review/remediation/config-semantic-inventory.json');matrix=load(ROOT/'docs/review/remediation/config-acceptance-matrix.json');rows=[r for r in inventory['rows'] if r['owner']=='gateway-openclaw'];spec=load(D/'gateway-target-case-specifications-20261013.json');byid={r['settingId']:r for r in spec['fields']}
for p in [ROOT/'docs/review/remediation/config-semantic-inventory.json',ROOT/'docs/review/remediation/config-acceptance-matrix.json',D/'gateway-target-case-specifications-20261013.json',D/'gateway-target-primitive-controls-20261013.json',B/'source-supplement-index.json',B/'delivery/batch-30/source-field-definitions.json',B/'delivery/batch-30/README.md',B/'independent-gateway-attribution-22/README.md',B/'independent-gateway-inventory-21/README.md',B/'independent-whole-c0-readiness-review-01/whole-universe-structural-navigation.json']:freeze(p)
for p in (D/'gateway-target-profiles-20261013').glob('*.json'):freeze(p)
for name in ['charts/kubeclaw/templates/configmap-gateway.yaml','charts/kubeclaw/templates/deployment.yaml','charts/kubeclaw/templates/_helpers.tpl','charts/kubeclaw/templates/service.yaml','charts/kubeclaw/values.yaml','my-values/buster-values.yaml','my-values/prism-values.yaml','versions.json','docker/Dockerfile.buster','node_modules/ajv/package.json','node_modules/ajv/dist/2020.js','node_modules/ajv-formats/package.json','node_modules/ajv-formats/dist/index.js']:
 p=ROOT/name
 if p.exists():freeze(p)
for name in ['README.md','CORRECTIONS.md','RECEIVING-ABI.md','manifest.json','schemas/pipeline-entry.schema.json','generation-receipt-stand.json','pending-security-extension.json'] :freeze(B/'same-entry-deployment-binding-02'/name)
cuts=[]
for r in rows:
 for ref in r['reader'].get('pinnedProductiveSources',[]):
  p=ROOT/ref['path'];text=p.read_text().splitlines();start=ref['line'];end=ref.get('endLine',start);excerpt='\n'.join(text[start-1:end])+'\n';cuts.append({'id':r['id'],'path':ref['path'],'sourceSha256':sha(p),'recordedSourceSha256':ref['sha256'],'line':start,'endLine':end,'excerpt':excerpt,'excerptSha256':hashlib.sha256(excerpt.encode()).hexdigest()})
for path in sorted({c['path'] for c in cuts}):freeze(ROOT/path,[i for i,c in enumerate(cuts) if c['path']==path])
write('pinned-native-source-cuts.json',cuts)
def tokens(field):
 if '.models.openai/' in field:
  prefix,tail=field.split('.models.');model,rest=tail.split('.agentRuntime.');return prefix.split('.')+['models',model,'agentRuntime']+rest.split('.')
 return field.split('.')
def get(obj,ks):
 for k in ks:obj=obj[k]
 return obj
def put(obj,ks,val):
 for k in ks[:-1]:obj=obj.setdefault(k,{})
 obj[ks[-1]]=copy.deepcopy(val)
def remove(obj,ks):
 for k in ks[:-1]:obj=obj[k]
 del obj[ks[-1]]
excluded='DLV-GATEWAY-OPENCLAW-CHANNELS-DISCORD-INBOUNDWORKER-RUNTIMEOUTMS';conditional='DLV-GATEWAY-OPENCLAW-AGENTS-DEFAULTS-MODELS-OPENAI-GPT-6-ASTRA-AGENTRUNTIME-ID'
A={}
for r in rows:
 if r['id'] not in [excluded,conditional]:put(A,tokens(r['source']['field']),byid[r['id']]['Afield'])
# Whole profile A is the original managed current-shape policy, with explicit formerly native timeout default. It is not proof of current CLI-effective LAN bind.
BB=copy.deepcopy(A)
changes={'agents.defaults.thinkingDefault':'high','agents.defaults.reasoningDefault':'on','agents.defaults.contextPruning.ttl':'1h','agents.defaults.compaction.keepRecentTokens':70000,'agents.defaults.subagents.maxConcurrent':10,'agents.defaults.subagents.archiveAfterMinutes':120,'agents.defaults.subagents.runTimeoutSeconds':21600,'agents.defaults.subagents.maxSpawnDepth':2,'agents.defaults.contextInjection':'continuation-skip','agents.entries.main.skills':['project-setup'],'agents.entries.main.skillsLimits.maxSkillsPromptChars':2400,'acp.allowedAgents':['codex'],'tools.sessions.visibility':'tree','tools.sessions_spawn.attachments.enabled':False,'tools.exec.timeoutSeconds':172800,'tools.exec.mode':'allowlist','commands.native':False,'commands.nativeSkills':False,'commands.restart':False,'session.dmScope':'per-account-channel-peer','session.resetByType.group.idleMinutes':21600,'session.threadBindings.idleHours':24,'session.threadBindings.maxAgeHours':48,'channels.discord.streaming.mode':'off','channels.discord.threadBindings.idleHours':24,'channels.discord.threadBindings.spawnSessions':False,'channels.discord.execApprovals.enabled':False,'gateway.bind':'lan','messages.groupChat.visibleReplies':'message_tool','agents.defaults.timeoutSeconds':86400}
for f,v in changes.items():put(BB,tokens(f),v)
put(BB,tokens('agents.defaults.models.openai/gpt-6-astra.agentRuntime.id'),'codex')
domainKeys={'type','enum','const','anyOf','oneOf','minimum','maximum','minLength','maxLength','pattern','format','items','uniqueItems','minItems','maxItems'}
def clean(d):return {k:([clean(x) for x in v] if isinstance(v,list) and k in ['anyOf','oneOf'] else clean(v) if isinstance(v,dict) else v) for k,v in d.items() if k in domainKeys}
tree={'type':'object','additionalProperties':False,'required':[],'properties':{}}
def add(ks,domain,required=True):
 node=tree
 for k in ks[:-1]:
  if k not in node['properties']:node['properties'][k]={'type':'object','additionalProperties':False,'required':[],'properties':{}}
  if k not in node['required']:node['required'].append(k)
  node=node['properties'][k]
 node['properties'][ks[-1]]=clean(domain)
 if required:node['required'].append(ks[-1])
for r in rows:
 if r['id']!=excluded:add(tokens(r['source']['field']),byid[r['id']]['targetDomain']['domain'],r['id']!=conditional)
def obj(props):return {'type':'object','additionalProperties':False,'required':list(props),'properties':props}
text={'type':'string','minLength':1}; locator=obj({'authoritySourceRef':text,'locator':text,'revisionCapability':{'const':'requires-authentic-supported-original-revision-retention-or-block'},'originalRevisionReceipt':{'const':'external-required-not-fake-pin'},'accessGrantReceipt':{'const':'external-required'},'confidentialTransport':{'const':'original-authenticated-host-provider-to-native-resolved-runtime-snapshot-no-plaintext-config'}})
readonly=obj({'modelRoute':obj({'primary':text,'fallbacks':{'type':'array','items':text,'uniqueItems':True},'sourceRef':text}), 'embedding':obj({'providerRef':text,'modelCatalogueReceipt':{'const':'external-required'},'serviceSourceRef':text,'credential':locator}),'installedRuntime':obj({'version':{'const':'2026.9.5'},'nativePackageSourceReceipt':text,'actualImageEqualityReceipt':{'const':'external-required'},'agentOwnerReceipt':{'const':'external-required'},'harnessModelToolPluginGrantReceipt':{'const':'external-required'}}),'deployment':obj({'role':{'enum':['nova','buster','prism']},'instanceId':text,'namespace':text,'gatewayPort':{'type':'integer','minimum':1,'maximum':65535},'sourceRef':text}),'bootstrapContextRef':text,'originalRunAndRecoveryAuthority':{'const':'original-service/run/session/agent/model/source/trust/grants/credential-revision/deadline/cleanup; no latest or hot-M rebinding'}})
profileSchema={'$schema':'https://json-schema.org/draft/2020-12/schema',**obj({'schemaVersion':{'const':'gateway-openclaw-profile.v1-proposal'},'profileId':{'type':'string','pattern':'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'},'role':{'enum':['nova','buster','prism']},'instanceId':text,'managedOpenClaw':tree,'readonlyBindings':readonly})}
def nested(keys,leaf):
 for key in reversed(keys):leaf={'properties':{key:leaf}}
 return leaf
schemaConditional={'if':nested(['readonlyBindings','modelRoute','primary'],{'const':'openai/gpt-6-astra'}),'then':nested(['managedOpenClaw','agents','defaults','models'],{'required':['openai/gpt-6-astra']}),'else':nested(['managedOpenClaw','agents','defaults','models'],{'not':{'required':['openai/gpt-6-astra']}})}
profileSchema['allOf']=[schemaConditional];write('gateway-profile.schema.json',profileSchema)
profiles={}
for label,settings in [('A',A),('B',BB)]:
 primary='openai/gpt-5.6-sol' if label=='A' else 'openai/gpt-6-astra'
 ro={'modelRoute':{'primary':primary,'fallbacks':['openai/gpt-5.5'],'sourceRef':'charts/kubeclaw/values.yaml#/agent/model (same existing Chart author; B explicit conditional selected branch proposal)'},'embedding':{'providerRef':'original-registered-core.openai-compatible','modelCatalogueReceipt':'external-required','serviceSourceRef':'charts/kubeclaw/values.yaml#/litellm/endpoint; isolated future compatible-service fixture is not installed endpoint','credential':{'authoritySourceRef':'my-values/buster-values.yaml#/litellm/existingSecret+existingSecretKey','locator':'kubernetes-secret:kubeclaw/openclaw-shared-secrets#litellmApiKey','revisionCapability':'requires-authentic-supported-original-revision-retention-or-block','originalRevisionReceipt':'external-required-not-fake-pin','accessGrantReceipt':'external-required','confidentialTransport':'original-authenticated-host-provider-to-native-resolved-runtime-snapshot-no-plaintext-config'}},'installedRuntime':{'version':'2026.9.5','nativePackageSourceReceipt':'npm archive1fb6ef4fae447af14f1e3b1028334f39146d181a66a4cce2848d4f741c636340; exact selected OCI bytes/source closure STILL external','actualImageEqualityReceipt':'external-required','agentOwnerReceipt':'external-required','harnessModelToolPluginGrantReceipt':'external-required'},'deployment':{'role':'buster','instanceId':'agent-buster-gateway','namespace':'kubeclaw','gatewayPort':18789,'sourceRef':'my-values/buster-values.yaml +charts/kubeclaw/values.yaml; original authenticated role/instance/grant required'},'bootstrapContextRef':'managed-bootstrap-context.json#/contexts/'+label,'originalRunAndRecoveryAuthority':'original-service/run/session/agent/model/source/trust/grants/credential-revision/deadline/cleanup; no latest or hot-M rebinding'}
 profiles[label]={'schemaVersion':'gateway-openclaw-profile.v1-proposal','profileId':label,'role':'buster','instanceId':'agent-buster-gateway','managedOpenClaw':settings,'readonlyBindings':ro};write('profiles/'+label+'.json',profiles[label])
contexts={}
baseNative=load(D/'gateway-target-profiles-20261013/DLV-GATEWAY-OPENCLAW-MEMORY-SEARCH-ENABLED.A.json')
for label,p in profiles.items():
 contexts[label]={'qualification':'readonly generated existing-author/source context, not second configurable policy/secret writer; exact original per-role/host/grant/image support required','systemAgent':baseNative['agents']['defaults']['systemAgent'],'agentModel':p['readonlyBindings']['modelRoute'],'commandsAuthorization':{'ownerAllowFrom':baseNative['commands'].get('ownerAllowFrom',[]),'discord':baseNative['commands'].get('allowFrom',{}).get('discord',[])},'discordEnabled':baseNative['channels']['discord']['enabled'],'gatewayPort':18789,'gatewayTokenRef':baseNative['gateway']['auth']['token'],'discordTokenRef':baseNative['channels']['discord']['token'],'installedPluginAllow':baseNative['plugins']['allow'],'roleSpecificPluginEntries':{k:v for k,v in baseNative['plugins']['entries'].items() if k not in ['acpx','openai','codex']},'secretsProviderContext':baseNative['secrets'],'authProfileContext':'existing Chart/native OAuth identity references only; actual retained tokens/grants/issuer external, no bytes here','sourceRoleAuthor':'existing Chart + selected original my-values/buster-values.yaml; no arbitrary Context CONFIG writer'}
write('managed-bootstrap-context.json',{'contexts':contexts,'nativeFullSchema':'pinned validateConfigObjectRaw and actual image/native plugin schema still required; this managed69 schema is NOT a substitute full OpenClaw validator'})
mapped=[];caseids=set()
for r in rows:
 f=byid[r['id']];record={'id':r['id'],'originalRow':r,'originalRowBodySha256':hashlib.sha256(json.dumps(r,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'originalCaseIds':r['caseIds'],'originalRequirementIds':r['requirementIds'],'originalTargetCaseDefinition':f,'targetDomain':f['targetDomain'],'currentSourcePrecedence':r['current'],'currentNativeReader':r['reader'],'targetScope':'S gateway process/managed service startup; H installed source/harness/model/plugin/workspace/trust/credential access; R original admitted run/session/deadline/source/grants/cleanup. Not module-hot M.','soleAuthorProposal':'charts/kubeclaw/values.yaml#/profiles/<explicitSelected>/settings/gatewayOpenClaw (same existing Chart producer; original config/openclaw/gateway target remains historical alternative, never a second accepted writer)','runtimeApplicability':'non-effect accepted schema key; remove in approved C3 migration, no new reader' if r['id']==excluded else 'conditional model catalogue branch: present only selected primary=openai/gpt-6-astra' if r['id']==conditional else f['targetDomain']['runtimeApplicability'],'receivingProjection':{},'semanticAccepted':False}
 for label,p in profiles.items():
  file=O/'profiles'/f'{label}.json';ks=tokens(r['source']['field']);pointer='/managedOpenClaw/'+'/'.join(k.replace('~','~0').replace('/','~1') for k in ks)
  try:val=get(p['managedOpenClaw'],ks);record['receivingProjection'][label]={'file':str(file.relative_to(ROOT)),'sha256':sha(file),'pointer':pointer,'exactTypedNode':val,'applicability':'declared source-shaped policy; consumer native/C4 gates not run'}
  except KeyError:record['receivingProjection'][label]={'file':str(file.relative_to(ROOT)),'sha256':sha(file),'pointer':None,'disposition':'excluded unsupported dormant field; never generated' if r['id']==excluded else 'conditional model catalogue absent under selected primary, no ghost default runtime','typedNode':None}
 mapped.append(record);caseids.update(r['caseIds'])
write('original70-field-contracts.json',{'qualification':'full original70 bodies/history retained;69 supported managed policies including conditional model entry,1 original dormant removal; no source/native/global PASS','fields':mapped})
write('original-case-contracts.json',{'qualification':'exact unchanged canonical bodies/requirements/results/lifecycle; future original native effect/bind/recovery/Eval obligations unwaived','cases':[{'id':c['id'],'originalBody':c,'sourceBodySha256':hashlib.sha256(json.dumps(c,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'result':'not-run'} for c in matrix['cases'] if c['id'] in caseids]})
write('read-identities.json',{'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':list(pins.values()),'scope':'native source exact full SHA/byte and cited-cut identities; no giant distribution archive copies, no imports/CLI/native effects','globalC0Accepted':False})
print(json.dumps({'originalFields':len(rows),'cases':len(caseids),'pinnedInputs':len(pins),'sourceCuts':len(cuts),'excluded':excluded,'sourceAuthorChoice':'existing Chart only; original row targets unchanged history, no competing config/openclaw writer'}))
