// Reviewed static historical owner constructors. This module executes no source input.
// The exact corresponding entire historical owner source must be authenticated
// before these constructors may be used. No import of the real generator occurs.
export function historicalEnvironmentDeclarations() {
 const bindings=[];
 const addEnvironmentConsumerContract=(name,path,raw)=>bindings.push({name,path,raw});
const environmentContract = ({ purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, precedenceSteps, impact, failure, required = 'conditional', evidence = [] }) => ({
  purpose,
  acceptedForm,
  defaultBehavior,
  emptyBehavior,
  invalidBehavior,
  precedence,
  ...(precedenceSteps ? { precedenceSteps } : {}),
  impact,
  failure,
  required,
  evidence,
});
const buster = environmentContract({
    purpose: 'Supplies the Ed25519 public trust anchor used to verify Nova-signed repository snapshots.',
    acceptedForm: 'A non-empty Node-readable Ed25519 public key; this environment path normally carries PEM text.',
    defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint.',
    invalidBehavior: 'Missing material reports the required or missing-key error. Unparseable or non-Ed25519 material reports `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID`; a nonmatching valid key causes `BUSTER_SOURCE_ATTESTATION_INVALID`.',
    precedence: 'The generated configuration fixes this environment-variable name; its process value is the only key source.',
    impact: 'Changing it rotates the source-signature authority and requires the matching Nova signing key.',
    failure: 'Runtime startup stops for bad key material, or new jobs are rejected when signature verification fails.', required: 'required',
  });
const origins = environmentContract({ purpose: 'Limits browser-origin requests accepted by the Ops MCP HTTP endpoint.', acceptedForm: 'A comma-separated list of exact Origin header strings; surrounding whitespace is removed and empty items are discarded.', defaultBehavior: 'Uses an empty set, which disables Origin filtering.', emptyBehavior: 'An empty string produces an empty set and accepts any Origin value.', invalidBehavior: 'The loader does not parse URL structure; a malformed entry simply fails to equal legitimate Origin headers.', precedence: 'The process string is split once at startup; no later source augments the set.', impact: 'Adding entries permits those exact browser origins. An empty set is safe only when loopback binding and bearer authentication remain enforced.', failure: 'A request with an Origin not in a non-empty set is rejected.' });
const kubernetesSubprocessEnvironmentSources = [
  ['skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', 500, 520],
  ['skills/buster/engine/test-gates/kubernetes-runtime-security.ts', 70, 85],
  ['skills/buster/engine/test-gates/tailscale-exposure-runtime.ts', 90, 102],
];
for (const [sourcePath, line, endLine] of kubernetesSubprocessEnvironmentSources) {
  addEnvironmentConsumerContract('KUBERNETES_SERVICE_HOST', sourcePath, environmentContract({ purpose: 'Passes the pod-discovered Kubernetes API host to the isolated kubectl child process used by this capability.', acceptedForm: 'The Kubernetes-provided host or IP string accepted by kubectl client discovery.', defaultBehavior: 'No repository default; Kubernetes normally injects the service value.', emptyBehavior: 'An absent value is passed as absent and kubectl must resolve configuration through the generated kubeconfig.', invalidBehavior: 'kubectl reports URL, DNS, TLS, or connection failure.', precedence: 'The child process receives the current parent-process value together with the explicit generated kubeconfig.', impact: 'Changing it changes Kubernetes client discovery for this capability.', failure: 'The capability command cannot reach the Kubernetes API.', evidence: [{ path: sourcePath, line, endLine }] }));
  addEnvironmentConsumerContract('KUBERNETES_SERVICE_PORT', sourcePath, environmentContract({ purpose: 'Passes the pod-discovered Kubernetes API port to the isolated kubectl child process used by this capability.', acceptedForm: 'A port string accepted by kubectl client discovery.', defaultBehavior: 'No repository default in this consumer; Kubernetes normally injects the service value.', emptyBehavior: 'An absent value is passed as absent and kubectl must resolve configuration through the generated kubeconfig.', invalidBehavior: 'kubectl reports URL or connection failure for an unusable value.', precedence: 'The child process receives the current parent-process value together with the explicit generated kubeconfig.', impact: 'Changing it changes Kubernetes client discovery for this capability.', failure: 'The capability command cannot reach the Kubernetes API.', evidence: [{ path: sourcePath, line, endLine }] }));
}
 bindings.push({name:'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',path:'docker/buster-runtime-entrypoint.sh',raw:buster},{name:'MCP_ALLOWED_ORIGINS',path:'tools/ops-mcp/src/config.mjs',raw:origins});
 return bindings;
}
export function historicalQuantityContract(resource) {
 const api=resource.apiVersion+'/'+resource.kind;
  const k8sSource = (file, lines) => `[Kubernetes v1.35.0 ${file.split('/').at(-1)}](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/${file}#${lines})`;
  const operational = (purpose, acceptedValues, emptyBehavior, impact, failure, controller = `${resource.kind} controller`, source = null) => ({
    status: 'deployment-operational-authority', purpose, acceptedValues, emptyBehavior: `${emptyBehavior}${source ? ` ${source}` : ''}`, impact, failure,
    apiAuthority: `${api} schema, admission, defaulting, and ${controller} reconciliation${source ? `; ${source}` : ''}`,
  });

 return operational('Sets one Kubernetes scheduling request or runtime resource limit for the container.', 'A non-negative Kubernetes resource quantity appropriate to the named resource.', 'Omission removes the authored template request or limit for this resource. When a replacement Pod is defaulted, an absent request inherits a present limit for the same resource; this inheritance is not inserted into the stored Deployment template. An empty string is not a resource quantity. Namespace admission can apply additional defaults and constraints.', 'Changes scheduling, reserved capacity, throttling, eviction, or termination behavior.', 'Invalid quantities fail admission. Excessive requests leave Pods Pending; undersized limits cause throttling, eviction, or OOM termination.', 'Kubernetes API server, scheduler and kubelet', `${k8sSource('pkg/apis/core/v1/defaults.go', 'L164-L196')}; ${k8sSource('pkg/apis/apps/v1/zz_generated.defaults.go', 'L373-L380')}`);
}

export function historicalObserverEnvironmentDeclarations() {
const contracts = new Map();
function add(source, name, purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, impact, failure, owningSurface, required = 'optional', boundary = 'checked-in runtime') {
  contracts.set(`${name}:${source}`, { purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, impact, failure, owningSurface, required, boundary, owner: source });
}
const observer = 'skills/common/plugins/openclaw-agent-observer/src/config.ts';
const observerSettings = {
  OPENCLAW_AGENT_OBSERVER_ENABLED: ['enabled', 'boolean-required'], REDIS_HOST: ['redisHost', 'string'], REDIS_PORT: ['redisPort', 'port'], REDIS_USERNAME: ['redisUsername', 'string'], REDIS_PASSWORD: ['redisPassword', 'string'], REDIS_TLS: ['redisTls', 'boolean'], REDIS_NETWORK_ISOLATION: ['redisNetworkIsolation', 'raw'],
  OPENCLAW_AGENT_OBSERVER_MAX_EVENT_BYTES: ['maxEventBytes', 'event'], OPENCLAW_AGENT_OBSERVER_MAX_QUEUE_PER_STREAM: ['maxQueuePerStream', 'positive'], OPENCLAW_AGENT_OBSERVER_REDIS_COMMAND_TIMEOUT_MS: ['redisCommandTimeoutMs', 'positive'], OPENCLAW_AGENT_OBSERVER_STREAM_MAXLEN: ['streamMaxLen', 'positive'], OPENCLAW_AGENT_OBSERVER_DEADLETTER_MAXLEN: ['deadLetterMaxLen', 'positive'], OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_MAX_ATTEMPTS: ['controlWriteMaxAttempts', 'positive'], OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_BASE_MS: ['controlWriteRetryBaseMs', 'positive'], OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_MAX_MS: ['controlWriteRetryMaxMs', 'positive'], OPENCLAW_AGENT_OBSERVER_HOOK_PRIORITY: ['hookPriority', 'integer'], OPENCLAW_AGENT_OBSERVER_HOOK_TIMEOUT_MS: ['hookTimeoutMs', 'positive'],
};
for (const [name, [setting, kind]] of Object.entries(observerSettings)) {
  const required = ['positive', 'integer', 'boolean-required', 'event'].includes(kind);
  const form = kind === 'string' ? 'A string converted with String and trimmed; blank becomes undefined.' : kind === 'port' ? 'A Number-convertible integer from 1 through 65535, or an absent value.' : kind === 'raw' ? 'The supplied value is retained without normalization here; Redis activation validates the security policy.' : kind.startsWith('boolean') ? 'A boolean, or text normalized with trim and lowercase. Only 1, true, yes, on and enabled become true; other non-empty text becomes false.' : kind === 'event' ? 'A positive integer within the ingress contract maximum; see normalizeAgentObservabilityMaxEventBytes.' : `A Number-convertible ${kind === 'integer' ? 'integer, including zero and negative values' : 'positive integer'}.`;
  add(observer, name, `Supplies ${setting} to the OpenClaw agent observer when its plugin configuration omits that key.`, form,
    kind === 'boolean' ? 'Uses false when neither source supplies a value.' : required ? 'No fallback; a required effective value must be supplied.' : 'No value default; an omitted value remains undefined.',
    kind === 'string' ? 'Empty or whitespace-only becomes undefined.' : kind === 'boolean' ? 'Empty uses false; whitespace-only non-empty text also becomes false.' : kind === 'port' ? 'Empty becomes undefined; whitespace-only text becomes zero and is rejected.' : kind === 'raw' ? 'Empty is passed unchanged to the Redis security-policy reader.' : 'Empty is rejected. Whitespace-only numeric text becomes zero: hookPriority accepts it; positive values reject it.',
    kind.startsWith('boolean') ? 'Unknown non-empty text becomes false; it is not rejected as an invalid boolean token.' : kind === 'string' ? 'This helper does not validate host, username or password syntax; connection checks own later rejection.' : kind === 'raw' ? 'This helper does not validate it; Redis activation can reject a missing plaintext isolation declaration.' : 'Invalid numeric bounds throw a field-specific configuration error.',
    `An explicitly defined plugin config.${setting} wins, including null or empty values. Otherwise env.${name} applies; normalization then runs.`,
    `Changes observer ${setting}; reload the observer to apply it. Redis connection and event queue behavior depend on the full configuration.`, 'Required-value or numeric errors stop observer config resolution; Redis policy and connection failures can occur during activation.',
    `skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json:configSchema.${setting}`, required ? 'required effective plugin or environment value' : 'optional');
}

const observerNormalizationEvidence = {
  string: [{ path: observer, line: 47, endLine: 50 }],
  port: [{ path: observer, line: 63, endLine: 70 }],
  boolean: [{ path: observer, line: 5, endLine: 5 }, { path: observer, line: 33, endLine: 37 }],
  'boolean-required': [{ path: observer, line: 5, endLine: 5 }, { path: observer, line: 39, endLine: 45 }],
  positive: [{ path: observer, line: 52, endLine: 61 }],
  integer: [{ path: observer, line: 72, endLine: 81 }],
};
for (const [name, [setting, kind]] of Object.entries(observerSettings)) {
  const contract = contracts.get(`${name}:${observer}`);
  contract.owningSurface = `skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema.properties.${setting}; OpenClaw plugin config.${setting}`;
  contract.evidence = [{ path: observer, line: 83, endLine: 111 }, ...(observerNormalizationEvidence[kind] ?? [])];
  if (kind === 'event') {
    contract.acceptedForm = 'A Number-convertible integer from 1 through 5242880 bytes.';
    contract.purpose += ' The plugin imports a generated copy of normalizeAgentObservabilityMaxEventBytes. syncContract copies the tracked agent-observability contract source into that generated consumer directory; the tracked normalizer and size constant are the source authority.';
    // The generated copy is ignored by Git. Source links must prove both the
    // canonical behavior and the copy boundary at the documented revision.
    contract.evidence.push(
      { path: observer, line: 1, endLine: 1 },
      { path: 'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs', line: 6, endLine: 14 },
      { path: 'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs', line: 18, endLine: 28 },
      { path: 'contracts/agent-observability/v1/src/routing.ts', line: 1, endLine: 6 },
      { path: 'contracts/agent-observability/v1/src/routing.ts', line: 31, endLine: 43 },
      { path: 'contracts/agent-observability/v1/src/constants.ts', line: 11, endLine: 11 },
    );
  }
  if (name.startsWith('REDIS_')) {
    contract.purpose += ' The Redis writer then requires a trimmed non-empty host and a valid port. Its default secure policy requires a password, TLS, or an accepted network-isolation declaration, including for loopback.';
    contract.evidence.push(
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts', line: 27, endLine: 44 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts', line: 10, endLine: 11 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts', line: 50, endLine: 76 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts', line: 112, endLine: 140 },
    );
    if (kind === 'raw') contract.acceptedForm = 'Passed unchanged by config resolution, then normalized as a boolean or trimmed lowercase text: 1, true, yes, on, required, enabled, isolated, network-policy, network_policy or documented marks isolation; other values are false.';
  }
}
return Object.keys(observerSettings).map(name => ({ name, path: observer, raw: contracts.get(`${name}:${observer}`) }));
}
