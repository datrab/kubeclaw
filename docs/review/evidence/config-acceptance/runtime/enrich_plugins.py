#!/usr/bin/env python3
import json,pathlib,re,hashlib
O=pathlib.Path('docs/review/evidence/config-acceptance/runtime');d=json.loads((O/'inventory-fragment.json').read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
configs={
 'artifact-store':('adapter.ts',{'maxArtifactBytes':16777216,'maximumRecords':100000,'maximumStoreBytes':268435456},'activate -> FileDurableRecordStore(maximumRecords/maximumBytes/maximumRecordBytes:65536) + FileDurableBlobStore -> invokeArtifact/get/put; byte quota enforced before durable append', 'root required; positive safe integers; ARTIFACT_SIZE_EXCEEDED; real artifact digest/path ownership validation'),
 'state-store':('adapter.ts',{'maxEntryBytes':1048576,'maximumRecords':100000,'maximumStoreBytes':268435456},'activate -> FileDurableRecordStore -> invoke read/append; namespace resource grant enforced', 'root required; positive safe integer quotas; persistent durable store rejects exhaustion'),
 'telemetry-store':('adapter.ts',{'maxRecordBytes':1048576,'maximumRecords':100000,'maximumStoreBytes':268435456},'activate -> FileDurableRecordStore -> invoke append; checked telemetry event namespaces', 'root required; positive safe integer quotas; durable store record/effective total admission'),
 'wait-store':('adapter.ts',{'maxEntryBytes':1048576,'maximumRecords':100000,'maximumStoreBytes':268435456},'activate -> FileDurableRecordStore -> create/read wait + retained core wait resolver', 'root required; positive safe integers; wait issuer/expiration/idempotency/retained evidence consistency; no secret contents'),
 'network-http':('adapter.ts',{'allowedMethods':['GET'],'allowedHeaders':['accept','content-type','idempotency-key'],'maxRequestBytes':1048576,'maxResponseBytes':1048576,'timeoutMs':30000},'parseConfig -> activate.invoke -> origin/method/header checks -> performRequest AbortSignal.timeout -> responseBody streamed byte limit', 'required allowedOrigins; positive integer limits; NETWORK_ORIGIN_DENIED/METHOD_DENIED/HEADER_DENIED/REQUEST_SIZE_EXCEEDED/RESPONSE_SIZE_EXCEEDED/TIMEOUT; redirects forbidden'),
 'command-runner':('adapter.ts',{},'activate -> canonical executable catalog/allowed working roots -> invoke authorized command -> subprocess owner/timeout/output/termination contract', 'schema required six fields; positive safe integer limits; realpath executable/working root admission'),
 'git-workspace':('adapter.ts',{},'activate -> canonical allowedRepositoryRoots/workspaceRoot/Git executable/author identity -> invoke workspace create/commit/merge/sync/remove -> git operation runner', 'all config values required; canonical paths, identity and positive timing/output limits; workspace references ownership checked'),
 'secret-resolver':('adapter.ts',{},'activate copies config.environment map -> invoke secrets.read -> names[logicalSecretId] -> process.env[selectedEnvironmentName]', 'SECRET_DENIED if missing mapping; SECRET_UNAVAILABLE if undefined/empty env; root mapping object required; never enumerate/read actual ENV values'),
 'redis-transport':('adapter.ts',{},'activatePublisher/activateTelemetry -> config -> invoke secrets.read -> streamIdentity -> exchange EVAL REDIS_PUBLISH_LUA -> XADD capped stream + SET dedup PX TTL', 'exact keys; redis/rediss URL without credentials/path/query/fragment; positive maxLen<=1000000 dedupTtlMs<=31536000000 timeoutMs<=300000; REDIS_CONFIG_INVALID/UNKNOWN_FIELD'),
 'operator-messaging':('config.ts',{'maximumDeliveryRecords':100000,'maximumDeliveryBytes':268435456,'maxPayloadBytes':65536,'format':'json'},'parseConfig -> adapter.activate -> durable delivery records -> target secret/endpoint/payload -> actual network.http delivery/receipt', 'exact keys/target IDs; exactly one direct endpoint versus secret endpoint+origin; direct token required; same-origin receipt; maxPayloadBytes positive<=1048576; OPERATOR_CONFIG_INVALID/UNKNOWN_FIELD; secret values remain confidential'),
 'transport-publisher':('adapter.ts',{'maximumDeliveryRecords':100000,'maximumDeliveryBytes':268435456,'maxPayloadBytes':262144},'readConfig -> activate -> durable delivery store -> signing secret resolution + signed HTTP publication and receipt', 'exact root/target keys; valid target ID, HTTP(S) endpoint without embedded credentials/hash; positive quotas; maxPayloadBytes<=1048576; TRANSPORT_CONFIG_INVALID'),
 'openclaw-agent-events':('adapter.ts',{'maxQueueEvents':256,'maxQueueBytes':1048576,'drainTimeoutMs':5000},'activate -> normalizeAgentHookName -> ingressLimits -> IngressQueue.enqueue -> event normalize/emit -> IngressQueue.drain', 'hook names supported by canonical normalizer; positive safe queue limits, events<=10000 bytes<=16777216 drain<=60000; AGENT_EVENT_LIMIT_INVALID/INGRESS_CAPACITY/DRAIN_TIMEOUT'),
 'notification-observer':('observer.ts',{'maxMessageChars':8192,'pipelineLabel':'KubeClaw Pipeline'},'observe -> suppression/presentation config -> lifecycleNotification -> bounded payload -> publish operator.request; preview-delivery separately deliverPreview', 'schema field type/range restrictions; configuredText nonblank<=256; max message default applies only regular observe; target is required in target(context) on delivery, but schema does not require it; missing field can survive prepareRuntime and then fail NOTIFICATION_TARGET_INVALID on first delivery'),
}
for row in d['rows']:
 source=row['source']['path'];parts=source.split('/')
 if 'field' not in row:continue
 if len(parts)<5 or parts[:3]!=['skills','common','plugins']:continue
 plugin=parts[3]
 if plugin not in configs:continue
 key=row['field'].split('.')[-1].replace('[]','')
 f,defaults,chain,errors=configs[plugin];files=[p for p in pathlib.Path('skills/common/plugins/'+plugin+'/src').rglob('*') if p.suffix in {'.ts','.js','.mjs'}];reads=[]
 for p in files:
  for n,l in enumerate(p.read_text().splitlines(),1):
   if re.search(r'\b'+re.escape(key)+r'\b',l):reads.append({'path':str(p),'line':n,'text':l.strip(),'sha256':sha(p)})
 row['reader']={'verifiedFieldReader':reads,'productiveEntry':chain,'parserPath':'skills/common/plugins/'+plugin+'/src/'+f}
 row['current']['codeDefault']=defaults.get(key,'required/no local setting replacement established at this key; schema optional absence may be intentionally task/feature data or still require exact review')
 row['current']['precedence']='platform.adapters/observers[explicit enumerated registration ID] -> raw context.config -> plugin parser/local replacement above. Ajv defaults are validation annotations here, not applied by activation.'
 row['validation']['semantic']=errors
 row['targetAuthor']={'proposal':plugin+' owned complete plugin profile referenced by renamed pipeline.config.json; exact file root deferred to packaging definition','rule':'single owned author; remove listed operational replacements; grant/trust/secret references bound run-stable; task receipt/input data separate'}
 row['activation']='run-owned adapter/observer activation today; target run-stable service/security/store policy, module-owned adapter tuning only with justified instance closure'
 row['recoveryEffects']='Current pinned runtime.configuration includes complete adapter/observer raw config; storage retention/ack/dedup/wait history preserved; new generation cannot free retained records or erase uncertain effects. Per-setting hot activation is not implemented.'
 if key.endswith('Secret') or plugin=='secret-resolver':row['classification']='secret-reference';row['classificationReason']='Logical secret->environment/secret resolver name reference only; immutable secret revision unavailable, no values read.'
 if plugin=='operator-messaging' and key=='format':row['classification']='operator-setting';row['classificationReason']='Presentation/transport format is configurable target policy, not fixed universal wire invariant.'
 if key=='$empty':
  row['classification']='protocol-invariant';row['classificationReason']='Manifest config schema explicitly permits only empty object; observer business values come from immutable event/context and capability provider. Explicit activation and failure policy are separately inventoried.';row['semanticStatus']='source-traced closed empty config contract; activation/failure policy separate'
 elif reads:row['semanticStatus']='source-traced plugin config contract; independent field-level review still required'
 else:row['semanticStatus']='unresolved-dynamic/container reader; do not claim closure'
# Provider task/policy boundaries explicitly corrected per owner, not by broad all-plugins label.
tasks={
 'api-flow':{'flowFile','url','endpointName'},'http':{'url','endpointName','path','method','accept','expectedStatuses','expectedText','expectedContentType'},
 'direct-command':{'executable','args','workingDirectory','environment','resultMode','reports','coverage','artifacts'},
 'demo-auth-smoke':{'loginPath','usernameKey','passwordKey','cookieName','protectedPath','usernamePointer','assertions'},
 'container-build':{'buildContext','definition','outputName','platform'},'kubernetes-fixture':{'image','serviceName','servicePort','serviceTargetPort','testCredentials'},
 'axe':{'url','endpointName','routes','acceptances'},'lighthouse':{'purpose','url','endpointName','routes','acceptances'},'openapi':{'specFile','url','endpointName','operations','tags'},
 'playwright':{'url','endpointName','projectDirectory','configFile','requiredTests'},'visual':{'url','endpointName','manifestFile','targets','masks'},'tailscale-exposure':{'path','hostname','endpointName'},
 'security-providers':{'projectDirectory','paths'},'size-budget':{'format'},'coverage-budget':set()}
for row in d['rows']:
 parts=row['source']['path'].split('/')
 if 'field' not in row:continue
 if len(parts)<5 or parts[:3]!=['skills','buster','plugins']:continue
 plugin=parts[3];first=row['field'].split('.')[0].replace('[]','')
 if first in tasks.get(plugin,set()) and row['classification'] not in {'secret-reference','protocol-invariant'}:
  row['classification']='task-data';row['classificationReason']='Concrete '+plugin+' invocation defines target/executable/assertion/artifact identity; task-specific absence/empty collection does not synthesize a global operator budget. Any nested timeout/limit exceptions remain explicit review obligations.'
 elif row['classification']=='task-data':
  row['classification']='operator-setting';row['classificationReason']='Owned test-provider policy/profile selection or resource/quality constraint; original broad task-data label insufficient. Source reader/precedence still needs exact consumer review.'
(O/'inventory-fragment.json').write_text(json.dumps(d,indent=2)+'\n')
print('Plugin reader/default contracts enriched without acceptance promotion')
