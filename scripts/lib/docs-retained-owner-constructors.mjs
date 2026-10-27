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
