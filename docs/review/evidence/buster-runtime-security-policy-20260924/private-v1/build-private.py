import pathlib,json,hashlib,copy,re
root=pathlib.Path.cwd(); out=root/'docs/review/evidence/buster-runtime-security-policy-20260924/private-v1'; files=out/'files'; before=out/'before'
def read(p):
 s=(root/p).read_text(); target=before/p; target.parent.mkdir(parents=True,exist_ok=True)
 if not target.exists(): target.write_text(s)
 return s
def write(p,s):
 target=files/p; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(s)
def edit(p,a,b):
 s=read(p); assert a in s,p; write(p,s.replace(a,b))
base='skills/common/plugin-runtime/foundation/config/'
p=base+'swarm-components.schema.json'; schema=json.loads(read(p)); cluster=schema['$defs']['buster-cluster-invokers']; cluster['required'].append('runtimeSecurity')
policy={'allowedNamespacePrefixes':['test'],'maximumExecutionMs':300000,'maximumOutputBytes':16777216,'pollIntervalMs':1000,'maximumObservationAgeMs':10000,'maximumFutureSkewMs':5000,'diagnosticCodeUnits':1024,'executableSearchPath':['/usr/local/bin','/usr/bin','/bin']}
def integer(lo,hi=9007199254740991):return {'type':'integer','minimum':lo,'maximum':hi}
cluster['properties']['runtimeSecurity']={'type':'object','additionalProperties':False,'required':list(policy),'properties':{
 'allowedNamespacePrefixes':copy.deepcopy(cluster['properties']['tailscaleExposure']['properties']['allowedNamespacePrefixes']),
 'maximumExecutionMs':integer(1,2147483647),'maximumOutputBytes':integer(1024),'pollIntervalMs':integer(10,10000),'maximumObservationAgeMs':integer(10,60000),'maximumFutureSkewMs':integer(0,2147483647),'diagnosticCodeUnits':integer(1),'executableSearchPath':{'type':'array','minItems':1,'maxItems':32,'items':{'type':'string','minLength':1,'pattern':'^/[^:\\x00]*$'}}}}
write(p,json.dumps(schema,indent=2)+'\n')
for p in ['charts/kubeclaw/files/config/buster-engine.config.json','charts/kubeclaw/files/config/profiles/buster-engine.runtime.config.json']:
 data=json.loads(read(p));data['settings']['clusterInvokers']['runtimeSecurity']=policy;write(p,json.dumps(data,indent=2)+'\n')
p=base+'swarm-bundle.ts';s=read(p).replace("'buster-cluster-invokers', 'buster-execution'","'buster-runtime-security', 'buster-cluster-invokers', 'buster-execution'")
s=s.replace("$ref: `#/$defs/${name}`","$ref: name === 'buster-runtime-security'\n    ? '#/$defs/buster-cluster-invokers/properties/runtimeSecurity' : `#/$defs/${name}`")
write(p,s)
p=base+'buster-cluster-invokers.ts';s=read(p);s=s.replace('export interface BusterClusterInvokerSettings {','''export interface BusterRuntimeSecuritySettings {
  readonly allowedNamespacePrefixes: readonly string[];
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
  readonly pollIntervalMs: number;
  readonly maximumObservationAgeMs: number;
  readonly maximumFutureSkewMs: number;
  readonly diagnosticCodeUnits: number;
  readonly executableSearchPath: readonly string[];
}
export function validateBusterRuntimeSecuritySettings(value: unknown): BusterRuntimeSecuritySettings {
  validateComponentSettings('buster-runtime-security', value, 'KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID');
  const input = value as BusterRuntimeSecuritySettings;
  if (input.maximumObservationAgeMs < input.pollIntervalMs) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID');
  }
  return Object.freeze({ ...input,
    allowedNamespacePrefixes: Object.freeze([...input.allowedNamespacePrefixes]),
    executableSearchPath: Object.freeze([...input.executableSearchPath]) });
}
export interface BusterClusterInvokerSettings {''')
s=s.replace('  readonly shared: BusterClusterSharedSettings;', '  readonly runtimeSecurity: BusterRuntimeSecuritySettings;\n  readonly shared: BusterClusterSharedSettings;')
s=s.replace('return Object.freeze({ shared:', 'return Object.freeze({ runtimeSecurity: validateBusterRuntimeSecuritySettings(input.runtimeSecurity), shared:')
write(p,s)
p='charts/kubeclaw/templates/_swarm-config.tpl';s=read(p);s=s.replace('{{- range $suffix := $cluster.tailscaleExposure.allowedHostSuffixes -}}','{{- if gt $cluster.runtimeSecurity.pollIntervalMs $cluster.runtimeSecurity.maximumObservationAgeMs -}}{{- fail "buster runtime security policy coherence invalid" -}}{{- end -}}\n{{- range $suffix := $cluster.tailscaleExposure.allowedHostSuffixes -}}');write(p,s)
base='skills/buster/engine/test-gates/'
p=base+'production-cluster-options.ts';s=read(p);s=s.replace("import { integer, stringArray, object }", "import { object }").replace('type Source = Record<string, unknown> | null;\n','');s=s[:s.index('export function kubernetesRuntimeSecurityOptions(')]+'''export function kubernetesRuntimeSecurityOptions(enabled: boolean, policy: BusterClusterInvokerSettings,
  binding: ClusterRuntimeBinding): Pick<BusterCapabilityRuntimeOptions, 'kubernetesRuntimeSecurity'> {
  if (!enabled) return {};
  return { kubernetesRuntimeSecurity: { ...policy.runtimeSecurity, kubectlExecutable: binding.kubectlExecutable,
    controllerNamespace: binding.controllerNamespace, leaseApiGroup: binding.leaseApiGroup } };
}
''';write(p,s)
p=base+'production.ts';s=read(p).replace('kubernetesRuntimeSecuritySource','kubernetesRuntimeSecurityEnabled').replace('kubernetesRuntimeSecurityOptions(kubernetesRuntimeSecurityEnabled, binding)','kubernetesRuntimeSecurityOptions(kubernetesRuntimeSecurityEnabled, policy, binding)');write(p,s)
p=base+'production-capability-sources.ts';s=read(p).replace("['kubernetesFixture', 'tailscaleExposure']","['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity']");s=re.sub(r"  const kubernetesRuntimeSecuritySource = capabilitySource\([\s\S]*?\n  \);", "  const kubernetesRuntimeSecurityEnabled = allowedCapabilities.has('kubernetes.runtime-security');",s);s=s.replace('    kubernetesRuntimeSecuritySource,','    kubernetesRuntimeSecurityEnabled,');write(p,s)
p=base+'production-config-values.ts';edit(p,"['kubernetesFixture', 'tailscaleExposure']","['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity']")
p='docker/buster-runtime-entrypoint.sh';s=read(p);s=re.sub(r'  kubernetesRuntimeSecurity: \{[\s\S]*?\n  \},\n','',s);write(p,s)
p=base+'kubernetes-runtime-security.ts';s=read(p);s=s.replace("type JsonObject =", "import { validateBusterRuntimeSecuritySettings, type BusterRuntimeSecuritySettings } from '../../../common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';\n\ntype JsonObject =")
a=s.index('export interface KubernetesRuntimeSecurityCapabilityInvokerOptions');b=s.index('\nfunction object',a)
s=s[:a]+'''export interface KubernetesRuntimeSecurityCapabilityInvokerOptions extends BusterRuntimeSecuritySettings {
  readonly workspaceRoot: string;
  readonly kubectlExecutable: string;
  readonly controllerNamespace: string;
  readonly leaseApiGroup: string;
}

function capturedOptions(options: KubernetesRuntimeSecurityCapabilityInvokerOptions): BusterRuntimeSecuritySettings {
  const { workspaceRoot, kubectlExecutable, controllerNamespace, leaseApiGroup, ...settings } = options;
  const policy = validateBusterRuntimeSecuritySettings(settings);
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0
    || typeof kubectlExecutable !== 'string' || kubectlExecutable.length === 0
    || typeof controllerNamespace !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(controllerNamespace)
    || typeof leaseApiGroup !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(leaseApiGroup)) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID');
  }
  return policy;
}
''' +s[b:]
s=s.replace('timeoutMs: number, maximumBytes: number,','timeoutMs: number, policy: BusterRuntimeSecuritySettings,').replace("PATH: '/usr/local/bin:/usr/bin:/bin'","PATH: policy.executableSearchPath.join(path.delimiter)").replace('bytes > maximumBytes','bytes > policy.maximumOutputBytes').replace('.slice(0, 1024)', '.slice(0, policy.diagnosticCodeUnits)')
a=s.index('  readonly #leaseApiGroup:');b=s.index('\n  async invoke(',a)
s=s[:a]+'''  readonly #leaseApiGroup: string;
  readonly #policy: BusterRuntimeSecuritySettings;

  constructor(options: KubernetesRuntimeSecurityCapabilityInvokerOptions) {
    this.#policy = capturedOptions(options);
    this.#root = fs.realpathSync(options.workspaceRoot); this.#kubectl = fs.realpathSync(options.kubectlExecutable);
    fs.accessSync(this.#kubectl, fs.constants.X_OK); this.#controllerNamespace = options.controllerNamespace;
    this.#leaseApiGroup = options.leaseApiGroup;
  }
''' +s[b:]
for a,b in {'this.#prefixes':'this.#policy.allowedNamespacePrefixes','this.#maximumExecutionMs':'this.#policy.maximumExecutionMs','this.#maximumOutputBytes':'this.#policy','this.#maximumObservationAgeMs':'this.#policy.maximumObservationAgeMs','this.#pollIntervalMs':'this.#policy.pollIntervalMs'}.items():s=s.replace(a,b)
s=s.replace('this.#policy.maximumObservationAgeMs)', 'this.#policy.maximumObservationAgeMs, this.#policy.maximumFutureSkewMs)')
s=s.replace('maximumAgeMs: number): boolean', 'maximumAgeMs: number, maximumFutureSkewMs: number): boolean').replace('nowMs + 5_000','nowMs + maximumFutureSkewMs');write(p,s)
p='tests/verification/contracts/check-pipeline-remote-runtime-config.mts';s=read(p);s=re.sub(r"\{ capability: 'kubernetes.runtime-security', source: \{ kubernetesRuntimeSecurity: \{[\s\S]*?\n    \} \} \}","{ capability: 'kubernetes.runtime-security', source: {} }",s);write(p,s)
p='tests/verification/contracts/check-pipeline-security-implementation.mts';s=read(p).replace('now, 10_000)', 'now, 10_000, 5_000)');s=s.replace("import path from 'node:path';","import path from 'node:path';\nimport YAML from 'yaml';\nimport { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';")
a=s.index('const rendered =');b=s.index('\nfor (const field',a)
s=s[:a]+'''// Render prerequisites only: no running native-node claim.
const renderPolicy = YAML.parse(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
renderPolicy.nodeName = 'security-render-only';
renderPolicy.pools.buster.namespace = 'kubeclaw';
const renderBinding = nativePoolPolicy(renderPolicy, 'buster');
const rendered = execFileSync(process.env.KUBECLAW_TEST_HELM ?? 'helm', [
  'template', 'security-proof', 'charts/kubeclaw', '--namespace', 'kubeclaw', '-f', 'my-values/buster-values.yaml',
  '--set', 'busterNative.namespace=kubeclaw', '--set', `busterNative.nodeName=${renderBinding.nodeName}`,
  '--set', `busterNative.policyDigest=${renderBinding.policyDigest}`,
  '--set', 'agentRole=buster', '--set', 'busterNamespaceBroker.enabled=true',
  '--set', 'extraContainers[0].name=buster-v2-runtime',
  '--set', `extraContainers[0].image=ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`,
  '--set', 'runtimeInfrastructure.registry.endpoint=http://registry.render-test:5000',
  '--set', 'runtimeInfrastructure.registry.transport=http-lab',
], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });''' +s[b:];write(p,s)
