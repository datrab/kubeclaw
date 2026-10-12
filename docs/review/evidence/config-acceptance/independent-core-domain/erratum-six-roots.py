import pathlib,json,hashlib,subprocess,collections,datetime
out=pathlib.Path('docs/review/evidence/config-acceptance/independent-core-domain')
roots=['workerRegistration','workerHealth','workerTrustEnvelope','attemptProgressEvent','workerLogPart','workerCancellationRequest']
saved=out/'expected-schema-obligations.json'
prior=json.loads(saved.read_text())
expected=[r for r in prior['allDefinitionFields'] if r['definition'] in roots]
# Reuse ONLY the original reviewer-owned resolver definition, without executing
# its output writer or reading changing author residual data.
own=out/'enumerate-schema.py'
prefix=own.read_text().split('for source,doc in registry.values():')[0]
ns={};exec(compile(prefix,str(own),'exec'),ns)
for source,doc in ns['registry'].values():
 for definition,node in doc['$defs'].items():
  if definition in roots:ns['walk'](source,doc,node,definition,'',set())
actual=ns['rows'];key=lambda r:(r['path'],r['definition'],r['field'])
searches=[['git','grep','-n','-E','signWorkerTrustEnvelope|verifyWorkerTrustEnvelope|WorkerTrustEnvelopeV1|checkWorkerCancellationBinding|WorkerCancellationRequestV1|workerTrustEnvelope|workerCancellationRequest','--',':!docs'],['git','grep','-n','-E','authorizeProxiedSpiffePeer|authorizeSpiffePeer|spiffePeerFromForwardedClientCertificate','--',':!docs'],['git','grep','-n','-E','validatePipelineWorkerCoreContract|checkPipelineWorkerCoreContract|workerCoreRelationErrors','--',':!docs',':!tests',':!contracts/pipeline-worker-core'],['git','grep','-n','-E','AbortController|armClaimExpiry|DRAIN_CANCELLED|cancellationTimeoutMs','--','skills/worker/core/worker/local-runtime.ts']]
commands=[]
for i,c in enumerate(searches):
 r=subprocess.run(c,text=True,capture_output=True);p=out/('erratum-reachability-'+str(i)+'.log');p.write_text(r.stdout+r.stderr);commands.append({'command':c,'exit':r.returncode,'raw':str(p)})
paths=[str(saved),str(own),'contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json','contracts/pipeline-worker-core/v1/src/validation.ts','contracts/pipeline-worker-core/v1/src/trust.ts','contracts/pipeline-worker-core/v1/src/index.ts','skills/worker/core/worker/local-runtime.ts','skills/worker/core/worker/trust.ts','skills/worker/core/worker/attempt-executor.ts','tests/verification/contracts/check-pipeline-worker-core-contracts.mts']
report={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'savedCount':len(expected),'savedCounts':dict(collections.Counter(r['definition'] for r in expected)),'rerunCount':len(actual),'sameFieldSet':{key(r) for r in actual}=={key(r) for r in expected},'missingFromRerun':sorted({key(r) for r in expected}-{key(r) for r in actual}),'extraRerun':sorted({key(r) for r in actual}-{key(r) for r in expected}),'fields':expected,'commands':commands,'identities':{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths},'limits':'Reviewer count/reachability erratum only; no inspection or acceptance of changing author corrections.'}
(out/'erratum-six-roots.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['savedCount','savedCounts','rerunCount','sameFieldSet','identities']},indent=2))
