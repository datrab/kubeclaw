from pathlib import Path
import json,hashlib
B=Path(__file__).resolve().parent;R=B.parents[3]
paths=['charts/kubeclaw/files/config/buster-engine.config.json','charts/kubeclaw/templates/_swarm-config.tpl','skills/common/plugin-runtime/foundation/config/swarm-components.schema.json','skills/common/plugin-runtime/foundation/config/swarm-bundle.ts','skills/common/plugin-runtime/foundation/config/buster-execution.ts','skills/buster/engine/test-gates/provider-process-session.ts','skills/buster/engine/test-gates/provider-loader.ts','skills/buster/engine/test-gates/provider-capabilities.ts','skills/buster/engine/test-gates/runner.ts','skills/buster/engine/test-gates/tests/provider-capabilities.test.ts','tests/verification/contracts/check-pipeline-test-plan-runner.mts']
for rel in paths:
 p=R/rel
 for folder in ['before','files']:
  q=B/folder/rel;q.parent.mkdir(parents=True,exist_ok=True);assert not q.exists();q.write_bytes(p.read_bytes())
def read(rel):return (B/'files'/rel).read_text()
def write(rel,s):(B/'files'/rel).write_text(s)
values={'maximumProtocolBytes':16777216,'terminationGraceMs':500,'terminationTimeoutMs':1000,'capabilityDrainTimeoutMs':1000,'minimumHeapMiB':16,'heapFraction':0.7,'maximumPendingCapabilities':32,'minimumOpenFiles':64,'artifactFileDescriptorReserve':32}
p=paths[0];o=json.loads(read(p));o['settings']['execution']['provider'].update(values);write(p,json.dumps(o,indent=2)+'\n')
p=paths[2];o=json.loads(read(p));d=o['$defs']['buster-execution-provider'];d['required']+=list(values)
for k in values:
 d['properties'][k]={'type':'integer','minimum':1,'maximum':2147483647 if k.endswith('Ms') else 9007199254740991}
d['properties']['minimumHeapMiB']['maximum']=8589934591
d['properties']['heapFraction']={'type':'number','exclusiveMinimum':0,'maximum':1}
o['$defs']['buster-provider-runtime']={'type':'object','additionalProperties':False,'required':['provider','observation'],'properties':{'provider':{'$ref':'#/$defs/buster-execution-provider'},'observation':{'$ref':'#/$defs/buster-execution-observation'}}};write(p,json.dumps(o,indent=2)+'\n')
p=paths[3];s=read(p).replace("'buster-execution', 'buster-execution-observation'] as const", "'buster-execution', 'buster-execution-observation', 'buster-provider-runtime'] as const");write(p,s)
p=paths[4];s=read(p).replace('export interface BusterProviderExecutionSettings {','export interface BusterProviderExecutionSettings {\n'+''.join('  readonly '+k+': number;\n' for k in values));s=s.replace('  const policy = value as BusterExecutionSettings;', '  const policy = value as BusterExecutionSettings;\n  validateProviderTiming(policy.provider);');s+='''
export interface BusterProviderRuntimeSettings {
  readonly provider: BusterProviderExecutionSettings;
  readonly observation: BusterObservationSettings;
}
function validateProviderTiming(provider: BusterProviderExecutionSettings): void {
  if (provider.terminationGraceMs >= provider.terminationTimeoutMs) {
    throw new Error('SWARM_CONFIG_BUSTER_PROVIDER_TERMINATION_ORDER_INVALID');
  }
}
export function validateBusterProviderRuntimeSettings(value: unknown): BusterProviderRuntimeSettings {
  validateComponentSettings('buster-provider-runtime', value, 'SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID');
  const policy = value as BusterProviderRuntimeSettings;
  validateProviderTiming(policy.provider);
  return Object.freeze({ provider: Object.freeze({ ...policy.provider }),
    observation: Object.freeze({ ...policy.observation }) });
}
''';write(p,s)
p=paths[6];s=read(p).replace('validateBusterObservationSettings','validateBusterProviderRuntimeSettings').replace('BusterObservationSettings','BusterProviderRuntimeSettings').replace('#observation','#policy').replace('observation: BusterProviderRuntimeSettings','policy: BusterProviderRuntimeSettings').replace('= observation','= policy').replace(', observation)',', policy)').replace('Settings(observation)','Settings(policy)');write(p,s)
p=paths[8];s=read(p).replace('new RegisteredTestProviderLoader(executionPolicy.observation)','new RegisteredTestProviderLoader({ provider: executionPolicy.provider, observation: executionPolicy.observation })');write(p,s)
p=paths[10];s=read(p).replace('new RegisteredTestProviderLoader(runnerExecutionPolicy.observation)','new RegisteredTestProviderLoader({ provider: runnerExecutionPolicy.provider, observation: runnerExecutionPolicy.observation })');write(p,s)
p=paths[7];s=read(p).replace('constructor(maximum = 32) { this.#maximum = maximum; }', "constructor(maximum: number) {\n    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('TEST_PROVIDER_CAPABILITY_LIMIT_INVALID');\n    this.#maximum = maximum;\n  }").replace('async drain(timeoutMs = 1_000): Promise<void> {', "async drain(timeoutMs: number): Promise<void> {\n    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new Error('TEST_PROVIDER_CAPABILITY_DRAIN_TIMEOUT_INVALID');");write(p,s)
p=paths[9];write(p,read(p).replace('capabilities.drain()','capabilities.drain(1000)'))
p=paths[5];s=read(p).replace("import type { BusterObservationSettings }", "import { validateBusterProviderRuntimeSettings, type BusterProviderRuntimeSettings }").replace('const MAX_PROTOCOL_BYTES = 16 * 1024 * 1024;\n','').replace('readonly #observation: BusterObservationSettings;','readonly #policy: BusterProviderRuntimeSettings;').replace('readonly #capabilities = new ProviderCapabilities();','readonly #capabilities: ProviderCapabilities;').replace('observation: BusterObservationSettings)', 'policy: BusterProviderRuntimeSettings)').replace('    this.#observation = observation;', '    this.#policy = validateBusterProviderRuntimeSettings(policy);\n    this.#capabilities = new ProviderCapabilities(this.#policy.provider.maximumPendingCapabilities);').replace('Math.max(64, invocation.limits.artifactFiles + 32)','Math.max(this.#policy.provider.minimumOpenFiles, invocation.limits.artifactFiles + this.#policy.provider.artifactFileDescriptorReserve)').replace('Math.max(16, Math.floor(invocation.limits.memoryBytes / (1024 * 1024) * 0.7))','Math.max(this.#policy.provider.minimumHeapMiB, Math.floor(invocation.limits.memoryBytes / (1024 * 1024) * this.#policy.provider.heapFraction))').replace('> MAX_PROTOCOL_BYTES','> this.#policy.provider.maximumProtocolBytes').replace('observation.processSampleIntervalMs','this.#policy.observation.processSampleIntervalMs').replace('this.#observation.resourceSampleIntervalMs','this.#policy.observation.resourceSampleIntervalMs').replace('this.#capabilities.drain()','this.#capabilities.drain(this.#policy.provider.capabilityDrainTimeoutMs)').replace("signal('SIGKILL'), 500)","signal('SIGKILL'), this.#policy.provider.terminationGraceMs)").replace("}, 1_000)","}, this.#policy.provider.terminationTimeoutMs)")
# Unit conversion remains fixed; selected descriptor arithmetic must remain exact.
s=s.replace('    const runtime = runtimePaths();', "    if (!Number.isSafeInteger(invocation.limits.artifactFiles + this.#policy.provider.artifactFileDescriptorReserve)) {\n      throw new Error('TEST_PROVIDER_DESCRIPTOR_BUDGET_INVALID');\n    }\n    const runtime = runtimePaths();")
write(p,s)
p=paths[1];s=read(p).replace('(ne $value (floor $value))', '(and (eq $limit.type "integer") (ne $value (floor $value)))')
# Numeric schema kind is authoritative: ratio has exclusive lower bound, all integer policies retain inclusive bounds.
s=s.replace('{{- if or (lt $value (float64 $limit.minimum))', '{{- if and (hasKey $limit "exclusiveMinimum") (le $value (float64 $limit.exclusiveMinimum)) -}}{{- fail (printf "buster execution %s.%s is below its exclusive bound" $section $key) -}}{{- end -}}\n{{- if or (and (hasKey $limit "minimum") (lt $value (float64 $limit.minimum)))')
s=s.replace('{{- if gt $execution.provider.maximumResultBytes', '{{- if ge $execution.provider.terminationGraceMs $execution.provider.terminationTimeoutMs -}}{{- fail "buster execution termination grace must precede termination timeout" -}}{{- end -}}\n{{- if gt $execution.provider.maximumResultBytes');write(p,s)
rows=[]
for rel in paths:
 rows.append({'path':rel,'beforeSha256':hashlib.sha256((B/'before'/rel).read_bytes()).hexdigest(),'afterSha256':hashlib.sha256((B/'files'/rel).read_bytes()).hexdigest()})
(B/'manifest.json').write_text(json.dumps({'status':'private-unreviewed-unexecuted','files':rows},indent=2)+'\n')
