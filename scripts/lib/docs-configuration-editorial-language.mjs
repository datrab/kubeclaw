// Maintained editorial wording, separate from retained source facts and qualifications.
export const editorialOwners = Object.freeze({
  unusedHelmExampleLeaf:"This leaf has no recorded receiving use in the locally bound chart. This field-level result does not mean that its complete values file is inactive. Other fields in the same file can have consumers. Do not treat this leaf as effective configuration until its owner proves a receiving contract or removes the unused value. This statement does not prove a successful render or deployment.",
  ed25519AcceptedForm:'A non-empty Node-readable Ed25519 public key. PEM text is a supported key encoding.',
  kubernetesHostDefault:'No repository default. This consumer passes through the Kubernetes service host value when present.',
  kubernetesPortDefault:'No repository default in this consumer. It passes through the Kubernetes service port value when present.',
  originInvalid:'The loader does not parse URL structure. It compares each retained entry with the request Origin header. A match requires the same string.',
  commandEmpty:'Each empty item remains an empty string. An empty executable name cannot start a process. The selected executable controls the meaning of an empty argument.',
  capabilityAccepted:'A Linux capability name supported by the container runtime, such as `NET_ADMIN`, or `ALL` for all capabilities.',
  quantityAccepted:'A non-negative Kubernetes resource quantity for the named resource. CPU uses CPU units. Memory and ephemeral storage use bytes, with Kubernetes quantity suffixes.',
});


// Display-only correction for the fourteen original retained ENV language parents.
// The authenticated historical inventory and its tuple reconstruction remain unchanged.
const retainedEnvironmentLanguageNames = new Set([
  'MCP_ALLOWED_ORIGINS', 'PRISM_DISPATCH_SECRET', 'PRISM_INGRESS_SECRET',
  'PRISM_NATIVE_POOL_POLICY_FILE', 'PRISM_PRODUCT_CONTROLLER_CA_FILE',
  'PRISM_PRODUCT_CONTROLLER_TOKEN_FILE', 'PRISM_PRODUCT_CONTROLLER_URL',
  'PRISM_PRODUCT_ISSUER', 'PRISM_PRODUCT_OPERATORS', 'PRISM_PRODUCT_ORIGIN',
  'PRISM_WORKER_SECRET', 'KUBERNETES_SERVICE_HOST', 'KUBERNETES_SERVICE_PORT',
  'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',
]);
export function retainedEnvironmentDisplayText(sourceItem) {
  if (!retainedEnvironmentLanguageNames.has(sourceItem.name)) return sourceItem;
  const wording = (value) => typeof value === 'string' ? value
    .replaceAll('; see the exact source and its producer bindings.', '. Refer to the exact source and its producer bindings.')
    .replaceAll('Varies by receiving process; see the consumer-specific contracts.', 'Varies by receiving process. Read the consumer-specific contracts.')
    .replaceAll('(see consumers)', '(refer to consumers)')
    .replaceAll('Adding entries permits those exact browser origins.', 'Adding entries lets requests with those exact browser origins pass this filter.') : value;
  const item = { ...sourceItem };
  for (const key of ['meaning', 'acceptedForm', 'precedenceExplanation', 'changeImpact']) item[key] = wording(item[key]);
  item.precedence = sourceItem.precedence.map((step) => ({ ...step, condition: wording(step.condition) }));
  item.consumerContracts = sourceItem.consumerContracts?.map((contract) => ({ ...contract, purpose: wording(contract.purpose), impact: wording(contract.impact) }));
  return item;
}

export const retainedApiReceiverNotes = `### Recorded Schema And Receiving Operations

A schema authority is the named, versioned source of a field contract. Template fallback examples apply only if the input reaches that template. Earlier schema or deployer checks can reject the input before selection. A source description can give the contract of a shared type, not the selected receiver.

The exact field sources below identify the selected resource, document and path. The source descriptions keep their source wording. A SHA-256 identifies recorded bytes. It is not evidence of the selected receiver behavior or an executed operation.

- ObjectMeta is the metadata object inside a resource. Its labels and annotations are metadata fields. They are not fields at the root of every resource. A cluster-scoped resource has no namespace selection from a generic metadata default.
- A probe is a container health check. A liveness failure can cause a container restart. A readiness failure removes readiness and can remove a Pod from Service endpoints. It does not by itself restart the container.

  A startup probe can delay the other probes. The shared Probe description is not evidence that every property applies to readiness. In particular, the quoted grace-period text contains a zero/minimum-one conflict. Do not select zero from that quotation as an approved value.

  Read the exact receiving probe contract and API version.
- An ordinary init container must complete without failure before the next init container starts. An init container with restartPolicy Always is a sidecar. Its startup condition can let the next init container start while the sidecar continues. The sidecar contract is different from the contract for an ordinary init container.
- A resource quantity is a number. It can have a Kubernetes unit suffix. A request gives the requested resource quantity. For a PersistentVolumeClaim, the selected storage request is storage capacity, not a container CPU or memory request.

  Shared compute-resource wording does not change that storage receiver. It is not evidence that a volume is available to a Pod.
- A feature gate enables a version-specific API feature. A quoted gate, deprecation, controller default or installation prerequisite is not proof that the selected cluster supplies it. Read the receiving field contract and its prerequisites before use. A quoted restriction on updating a Pod does not prohibit a Deployment template change that creates replacement Pods.
`;

export const retainedPayloadLanguageNotes = `### Recorded Tool Messages And Runtime Limits

The strings below give recorded tool configuration for messages, principles and remediation. A message gives a source-pattern warning, not an observed exploit, a passed check or evidence that the suggested operation prevents every attack. The recorded wording stays visible so that a reader can identify the actual message. These explanations state its bounded meaning.

- To pass an argument is to supply it to the receiving function. This does not mean that a check passed. A programming exception reports a failure to an exception handler. To catch an exception is to receive it in that handler.

  To raise or rethrow it is to send the failure to an enclosing handler. A swallowed exception is one that the handler does not report or send to another handler. A Python bare except handler can catch SystemExit and KeyboardInterrupt as well as ordinary exceptions. The Python pass keyword performs no operation.

  It is not a statement that a check passed.
- Interpolation puts values into source text. Shell, SQL and executable-text warnings identify a possible code or query boundary. An argument array or a parameterized query keeps values separate from that source boundary when the receiving API supports it. A source-pattern match is not evidence of exploitation or the safety of a replacement in all cases.
- An allowlist is an explicit set of accepted values. A URL, object key, redirect or protocol still requires its receiving validation. A static import or registry makes declared loading visible to the source tools. It is not an authorization grant or evidence that all runtime loads were found.
- Cross-site scripting (XSS) is script execution in a browser from untrusted content. Jinja autoescape escapes template output for its selected output context. Without it, HTML output can have an output-escaping/XSS risk. It is not by itself evidence of server-side template injection.

  Template-source trust and output escaping are separate boundaries. The recorded message that combines these claims is not a correct assertion that autoescape prevents template-source execution.
- Hash, random-value, secret-comparison and serialization warnings concern their named programming operations. A cryptographic warning is not proof that every use is exploitable or that a named alternative is correct for every protocol. A tool rule or remediation string is not a new security assurance.

The source chain records chart selection, file copies and a declared adapter. It is not evidence of current runtime delivery. In particular, the request.policyPath reader is not joined here to the materialized runtime configuration path. The SWARM_CONFIG field reader is image-owned and is not available in the checked-in source.

Opaque executable configuration and redacted values have no hidden-content language or runtime qualification here.
`;


// Current receiving explanations for the existing retained material finding classes.
// These explanations do not change the authenticated historical field/consumer facts.
export function retainedHelmReceiverGuidance(field, sourcePath) {
  const path = field.path;
  const group = field.meaning.semanticGroup;
  const notes = [];
  const add = (id, text) => notes.push({ id, text });
  if (group === 'namespace-name' && field.type === 'string') add('T1', 'This field is one namespace string, not a list. The required condition, fallback and any Release.Namespace equality come from the exact receiving guards below. An empty list is not a value for this field.');
  if (group === 'kubernetes-collection-contract') add('T2', 'Use the exact selected API slot and its named schema or receiving source. A resources map, environment source, volume, mount, security context, probe and port have different variants. A generic mention of valueFrom or security-context alternatives does not add those variants to another slot. Without an exact field contract, these generic alternatives are not accepted input advice.\n\nAny Prism ingestion requirement applies only to its own ingestion receiver.');
  if (/\[\d+\]/u.test(path)) add('T3', 'This field is inside a list. A statement about merging a map is not evidence of an independent merge at this list index. For Helm values, a later list replaces the enclosing list. Omission of a later override keeps the earlier value.\n\nRead the selected source and receiving operation before removing an item or a nested key.');
  if (path.endsWith('.defaultTtlSeconds')) add('T4', 'This field gives the default namespace-lease duration in seconds. The namespace lease expires, not the broker component. Keep the separate maximum and receiving override rules.');
  if (path.endsWith('.maxTtlSeconds')) add('T4', 'This field gives the maximum namespace-lease duration in seconds. It is not the default lease duration or the lifetime of the broker component. Keep the separate default and receiving bounds.');
  if (/busterRuntimePersistence\.claimName$/u.test(path)) add('T5', 'When runtime persistence is enabled, this is the name of the retained PVC that the chart creates. The workload volume reference is a separate use of the name. A name is not evidence that the claim exists, is bound or is mounted.');
  if (/agent\.git\.secretName$/u.test(path)) add('T6', 'When Git integration is enabled, a Helm-empty Secret name selects the git-deploy-key name for the selected role, including the role fallback in the linked template. This is not an empty-name disable switch. A missing selected Secret or key is a separate receiving failure.');
  if (/codeBundle\.auth\.existingSecretKey$/u.test(path)) add('T6', 'When existingSecret selects this integration, a Helm-empty key selects token. This fallback occurs before the selected Secret key is used. A missing effective data key is not the same as an empty input. Without existingSecret, this expression sets an empty token.');
  const credentialKeys = [
    ['$.auth.existingSecretKey', 'gatewayToken'],
    ['$.litellm.existingSecretKey', 'litellmApiKey'],
    ['$.discord.existingSecretKey', 'discordToken'],
    ['$.stitch.existingSecretKey', 'stitchApiKey'],
  ];
  for (const [rootPath, generatedKey] of credentialKeys) {
    if (field.meaning.localHelmChart === 'charts/kubeclaw' && path === rootPath) add('T6', 'With existingSecret selected, the helper uses this key verbatim, including an empty string. It does not supply a key fallback in that branch. Without existingSecret, the generated credential branch uses ' + generatedKey + '. Keep the selected object, credential role and effective data-key failure separate.');
  }
  if (/discordWebhook\.secretKey$/u.test(path)) add('T6', 'When secretName selects the webhook integration, a Helm-empty key selects discordWebhook. A missing effective key is a separate failure. The webhook integration is not selected solely by the Discord enabled field.');
  if (/redis\.secretKey$/u.test(path)) add('T6', 'The linked template uses redis-password when this key is Helm-empty. Keep this fallback separate from the selected Secret object and a missing effective data key.');
  if (field.meaning.localHelmChart === 'charts/kubeclaw' && /^\$\.(?:auth|discord|litellm|stitch)\.existingSecret(?:Key)?$/u.test(path)) add('T6', 'An existing Secret reference and the conditional generated-credential branch are different sources. Read the exact parent gate, inline-value condition and data-key expression below. A generic missing-key statement does not remove a template fallback. This page is not evidence that the selected credential exists or is accepted.');
  if (/imagePullSecrets/u.test(path)) add('T6', 'An image-pull Secret is used by the kubelet for registry authentication. This reference does not expose its credential to the workload as an environment value or mounted file. A missing required pull credential can prevent image pull. A public image or another valid credential source is a separate case.\n\nA list, its object item and the item name have different empty-value rules.');
  if (group === 'redis-stream-length') add('T7', 'The template selects 1000 when this input is Helm-empty, including numeric zero. The startup reader uses Number.parseInt and sends its string result to Redis XADD. This is not a strict positive-safe-integer check. Redis controls acceptance of the selected MAXLEN argument.\n\nWith ~, trimming is approximate. This is not the observed stream size.');
  if (group === 'redis-stream-name') add('T7', 'This is the stream for the startup-only RedisStream check, not a readiness check. The enabled check can use the configured stream or its per-agent default. Empty input is not by itself evidence that no target is checked.');
  if (/probes\.dependencies\.registries\.endpoints/u.test(path)) add('T7', 'These are targets of the startup-only registry check. With the check enabled, no effective endpoints is a failure. With the check disabled, it is bypassed. An HTTP 401 response can meet this check criterion without giving evidence of authenticated image pull.');
  if (/readiness/u.test(path) && /probe|failureThreshold|periodSeconds|timeoutSeconds|HTTPGet|httpGet/iu.test(path + ' ' + group)) add('T7', 'This receiver controls readiness or readiness timing. Readiness failure changes the ready state and Service endpoint selection. It does not by itself restart the container. The script timeout fallback of 10 seconds and the Kubernetes omitted-field default of 1 second are different receivers.\n\nUse the exact selected receiver below.');
  if (/liveness/u.test(path) && /probe|failureThreshold|periodSeconds|timeoutSeconds|HTTPGet|httpGet/iu.test(path + ' ' + group)) add('T7', 'This receiver controls liveness or liveness timing. The configured failure threshold can cause a container restart. It does not select readiness traffic. An HTTPGet path default and a rejected authored value are separate cases.');
  if (/startup/u.test(path) && /probe|HTTPGet|httpGet/iu.test(path + ' ' + group)) add('T7', 'A startup probe gates the later liveness and readiness probes. Failure at its configured threshold can cause a container restart. It is not an independent readiness traffic selector.');
  if (group === 'network-port' || group === 'port-name' || group === 'network-protocol' || group === 'http-probe-path') add('T8', 'Read the exact receiving port or HTTPGet field. A Service targetPort can be a name or a number. A Service port, NodePort, container port and HTTP probe port do not share all defaults or zero-value rules. Declaring a port does not create a listener, Service, proxy or route.\n\nHTTP probes use their HTTP transport, not an arbitrary UDP listener.');
  if (/extraPorts.*targetPort/u.test(path)) add('T8', 'The retained targetPort buster-plan differs from the retained extra-container port name plan-runtime. These literals are preserved. This page is not evidence that the named route works. Resolve the receiving names before using it as a working route.');
  if (group?.startsWith('resource-')) add('T9', 'A resource quantity is a number. It can have a Kubernetes unit suffix. A CPU limit controls CPU time and can cause throttling. A memory limit can cause termination of the container for an out-of-memory condition (OOM).\n\nAn ephemeral-storage limit has its own storage-pressure and eviction behavior. Requests are scheduling inputs, not all of these runtime mechanisms at once. Omission from a rendered container is not evidence that admission or runtime supplies no effective default. A Deployment template and its resulting Pod are different defaulting stages.');
  if (path.includes('gateway.resources') || (path.startsWith('$.resources') && field.meaning.localHelmChart === 'charts/kubeclaw')) add('T3', 'The gateway resource selection can use the fallback resources map only when gateway.resources is Helm-empty. This is a whole-map selection, not a separate fallback for each missing leaf. Keep this selection before field-specific resource effects.');
  if (/shutdown\.drainFile$/u.test(path)) add('T10', 'This is the shutdown drain-marker file, not a CA file, identity socket or host directory. The linked template supplies its /tmp fallback before use. The marker is not proof that in-flight work has completed.');
  if (group === 'pre-stop-drain-duration') add('T10', 'The template uses 5 when this input is Helm-empty, including zero. Do not treat numeric zero here as a request to skip the selected preStop wait.');
  if (group === 'termination-grace-duration' && sourcePath.includes('kubeclaw')) add('T10', 'The template selects its 180-second grace fallback before the Kubernetes receiver. Removing a later override does not directly select the Kubernetes omitted-field default. This grace is not evidence that shutdown work completes.');
  if (group === 'root-mode-control' || path === '$.gateway.startupDoctor.enabled') add('T10', 'The state-migration init path and the conditional ownership-repair path are different. The ownership repair has its runAsRoot=false condition. Do not extend that condition to every init operation.');
  if (path.endsWith('.redis.host')) add('T11', 'This host is the Redis connection destination. It is not an advertised Tailnet host name or an identity grant. Read the linked process connection and enabled conditions.');
  if (path.endsWith('.redis.port')) add('T11', 'The template selects 6379 when this input is Helm-empty. Validation applies to the selected port, not to the empty input before fallback.');
  if (path.endsWith('.nodeCaFile')) add('T11', 'This path selects the registry or mirror custom-CA file, not a socket or drain marker. Custom CA selection requires the paired file and Secret fields in the linked guard. An optional mirror can be disabled only with the exact endpoint, transport and trust combination shown below. The writable registry has its separate required endpoint and credential rules.');
  if (group === 'registry-transport') add('T11', 'The mirror and writable-registry contracts have different required conditions. Keep the endpoint, transport, custom CA and credential guards together. An intentionally disabled optional mirror is not an incomplete enabled registry.');
  if (path.endsWith('.socketPath')) add('T11', 'This is the SPIFFE Workload API socket path. A non-empty path is not evidence that the socket or identity service is available. It is not a CA file, drain marker or shutdown control.');
  if (group === 'workspace-document') add('T12', 'This value is the content of the named workspace seed document. A Helm-empty input omits its seed key. The init copy uses present seed files and its existing-file/override rules. Empty input does not promise an empty persisted document or erase an existing file.\n\nworkspace.enabled=false suppresses seeding, not the workspace volume. The selected narrative is historical source evidence, not newly approved operator instructions or evidence of a running identity.');
  if (path === '$.serviceAccount') add('T13', 'An unused serviceAccount.name child does not remove the create or automount receivers. Keep their actual conditions. The no-binding limit for the unused name is not the precedence rule for this group.');
  if (path === '$.processor') add('T13', 'The only recorded child here is the unused enabled leaf. No receiving contract is bound for this group. Do not infer reconciliation or a failure effect from the generic parent text. Owner: the named chart maintainer.\n\nResume condition: add an actual receiving contract or remove the unused value before operational use.');
  if (/productDecisions/u.test(path) && sourcePath.includes('prism')) add('T14', 'The shown annotation or chart projection is not proof that the controller receives a Secret, issuer, audience or CA at runtime. The selected product-decision contract requires its own enabled-mode fields and HTTPS controller port 8443 boundary. Keep those exact parent constraints. A syntactically accepted field is not a delivered credential or verified decision.');
  if (path.endsWith('.policyDigest')) add('T14', 'The shown policy-digest annotation and guard are not evidence of verification of arbitrary archive bytes. Keep policy identity separate from code-bundle archive SHA-256 and Git commit identity.');
  if (sourcePath.includes('prism') && /(?:control|worker\.native)\.replicaCount$/u.test(path)) add('T14', 'This receiver requires exactly one replica. Other integer values are rejected, not supported alternatives. A selected replica count is not proof that a process is running.');
  if (path.includes('kubeclaw.io/health-mode')) add('T16', 'The receiver is the Argo CD Application health Lua evaluator selected by the bound chart. The kubeclaw.io annotation prefix does not name or install another controller. Helm projection, Lua evaluation, strict revision checks, observed mode and comparison/sync errors are separate stages.');
  if (/\.destination\.server$/u.test(path)) add('T16', 'This field is the destination server URL. A registered cluster name, where supported, belongs to the separate destination.name field. It is not an additional accepted form of this server string.');
  if (/\.chart$/u.test(path) && field.meaning.apiCollectionAuthority) add('T16', 'This field selects a chart name. A repository-relative directory belongs to the separate path field. Keep the valid alternate source modes and competing-generator restrictions.');
  if (/\.path$/u.test(path) && /\.sources?(?:\[\d+\])?\.path$/u.test(path)) add('T16', 'This field is a repository-relative source directory, not a chart name. Keep the alternate chart source mode and its separate field. A source reference alone is not evidence of a launch or a synchronized deployment.');
  if (/\.helm$/u.test(path)) add('T16', 'This is the Helm generator option map. Directory-generator options belong to the separate directory map. Preserve source selection and competing-generator constraints.');
  if (/\.directory$/u.test(path)) add('T16', 'This is the directory generator option map, not a Helm option map. The selected include pattern stays exact. Empty-pattern behavior requires the selected directory matcher contract. A schema default is not evidence of that behavior.\n\nOwner: the named directory generator. Resume condition: bind its actual include/exclude matcher before giving empty-pattern advice.');
  if (/\.project$/u.test(path) && field.meaning.apiSchemaAuthority?.requiredBySchema) add('T17', 'The pinned submitted-object schema requires this project field. A later controller default does not make omission valid before schema admission. Keep the selected project and its independent permission checks.');
  if (/\.spec\.description$/u.test(path)) add('T18', 'This is a stored human-readable project description. Changing it does not by itself grant source-repository, destination or resource-kind permissions, or change an API identity.');
  if (/\.destinations(?:\[\d+\])?(?:\.(?:namespace|server|name))?$/u.test(path)) add('T18', 'This is a destination cluster/namespace permission, not a source-repository permission. A namespace child and server child have different values. Keep the independent project, destination, negative-match and cluster restrictions.');
  if (/namespaceResourceWhitelist/u.test(path)) add('T18', 'A wildcard here concerns namespaced resource kinds under separately permitted destinations and blacklist constraints. It is not an independent grant for cluster-scoped resources or all namespaces. Keep the separate cluster whitelist.');
  if (/sourceRepos/u.test(path)) add('T18', 'This field controls source-repository permission. Destination-only project-cluster restrictions do not define its repository matcher. Keep the positive/negative repository rules of the named receiver. A missing actual matcher is not permission to guess empty-pattern behavior.');
  if (/ignoreDifferences|jqPathExpressions/u.test(path)) add('T19', 'A comparison exclusion alone does not change synchronization. That effect requires the separate RespectIgnoreDifferences option. JQ items are field expressions. Resource group/kind filters belong to the enclosing rule, not to each expression string.');
  if (/\.automated\.(?:allowEmpty|prune|selfHeal)$/u.test(path)) add('T19', 'With automated synchronization enabled, allowEmpty concerns an empty generated set, prune concerns removal, and selfHeal concerns correction of live drift. One switch does not grant the other operations. Keep their independent gates and selected values.');
  if (/repoURL$/u.test(path) && String(field.value).includes('registry-1.docker.io/bitnamicharts')) add('T20', 'The selected value is the recorded OCI Helm repository identity. Do not reject it solely by applying a generic absolute-URL description or add an invented scheme to the literal.');
  if (sourcePath.includes('/registry-')) add('T20', 'The retained registry:2 selection and a Distribution 3.0.0 configuration authority are not the same version. The version-3 description does not by itself qualify version-2 runtime acceptance. Keep the historical image and configuration unchanged. Owner: the selected registry implementation.\n\nResume condition: bind its version-specific receiving contract before use.');
  if (/schemaConfig.*store$/u.test(path)) add('T20', 'Here v13 is the Loki storage schema version, not the Loki product release. The selected store must meet that storage-schema contract.');
  if (group === 'image-tag') add('T20', 'A selected digest is the image-byte authority where the image helper uses it. A tag change can leave those bytes unchanged. Without a digest, the tag can select mutable content. A tag alone is not evidence of verified security updates or image availability.');
  if (/matchLabels/u.test(path)) add('T21', 'This is a key/value label map or one of its values. Operator/value objects belong to matchExpressions, not matchLabels. For these selectors, AND means that every stated match condition must hold. Keep the required parent selector and workload-template agreement.');
  if (group === 'persistent-volume-access-modes' || group === 'pvc-access-mode') add('T21', 'The parent collection and each child use the same supported access-mode set, including ReadWriteOncePod only where the pinned receiver supports it. ReadWriteOnce does not by itself enforce one Pod. A selected access mode is not evidence of storage allocation or a successful mount.');
  if (/tolerations/u.test(path)) add('T21', 'An Exists toleration with no key or effect can match more than one named taint. Other placement constraints still apply. A toleration is not a guarantee of scheduling.');
  if (group === 'read-only-volume-mount' || group === 'projected-file-mode') add('T21', 'The mount readOnly field and the source type are separate constraints. Secret and projected sources can be intrinsically read-only. A false mount flag or writable Unix mode does not make such a source writable. Keep item-mode precedence and the selected decimal/octal value.');
  if (/networkPolicy|apiServerPort|apiServerCIDR|cilium/i.test(path) || /cilium|network-policies/u.test(sourcePath)) add('T22', 'This statement is only about the recorded policy objects and the selected policy path. Their absence is not proof that all cluster isolation is absent. Their selected port is not proof that no other network path exists. A selected /32 is one host within the accepted CIDR address-range form.\n\nCIDR notation gives an address range by a network prefix. Layer 3 (L3) concerns network addresses, Layer 4 (L4) concerns transport ports/protocols, and Layer 7 (L7) concerns application protocols. Keep the selected policy and CRD prerequisites.');
  if (sourcePath.includes('loki')) add('T23', 'The selected single-binary workload and distributed read/write/backend settings are different receivers. A zero count for an unused distributed workload is not an active-workload outage. The selected singleBinary workload has its separate count. Loki auth_enabled selects multitenancy, not independent user authentication.\n\nReplication of ingestion and redundancy of stored data are different. Retention configuration is not proof that deletion is active or has occurred.');
  if (/retention|storageSpec|volumeClaimTemplate/u.test(path) && /prometheus|monitoring/i.test(sourcePath)) add('T23', 'Removing a later chart override can retain a chart default. A rendered custom resource can then have a separate Operator default before its PVC is created. Do not treat override removal as direct removal at the final storage receiver. Retention is not proof that data was deleted.\n\nKeep retirement/selector prerequisites.');
  if (group === 'environment-runtime-contract') add('T24', 'The outer environment value is a string. A declared port, path or byte limit can have a separate process parser. Keep the exact producer and receiving process. BUSTER_PLAN_PORT is not an arbitrary TCP/UDP field.\n\nArchive and extracted byte limits are different. For an image-owned reader not available in the checked-in source, its parser, default, failure and mount contract are unknown. Owner: the named image producer. Resume condition: supply that exact reader contract before treating this input as a full operator option.');
  if (group === 'downward-api-field' || group === 'projected-file-path') add('T25', 'Use this projection source and exact relative output path. A serviceAccountToken, ConfigMap item and downwardAPI field are different sources. ObjectFieldSelector apiVersion is not a general CRD, RBAC, controller or lease authority. Keep the selected file name and source identity.');
  if (group === 'process-options' && /node|NODE_OPTIONS/i.test(path + ' ' + field.meaning.text)) add('T25', 'The selected Node old-space option limits that JavaScript heap space, not total process or container memory. The environment parser does not accept arbitrary shell options by implication.');
  if (group === 'discord-channel-id') add('T24', 'This field is the selected channel identifier for its named runtime consumer. It does not by itself select every guild, direct-message, command or message route. The chart fallback is not evidence that an empty channel is accepted by that runtime. Keep the explicit enabled/disabled and receiving-plugin boundary.');
  if (group === 'raw-sha256-digest') add('T25', 'This field is the expected SHA-256 of the selected archive bytes. It is separate from expectedCommit, which is a Git identity. Keep the exact enabled, URL, archive-verification and process-consumer conditions. A digest string alone is not evidence that bytes were downloaded or verified.');
  if (path.endsWith('.codeBundle.contractVersion')) add('T3', 'The template fallback v2 is a template-selected value. It must not be called a chart default merely because the selected row has the same text.');
  if (group === 'container-name' && field.value === 'buster-v2-runtime') add('T25', 'This exact name selects the dedicated registry helper and its worker-count guard. It is not only an arbitrary lookup label.');
  if (group === 'host-path' && String(field.value).includes('cgroup')) add('T25', 'This is the host cgroup directory used by the browser container. It is not a CA file, identity socket, drain marker or shutdown control. Keep the separate container mount and host directory.');
  if (group === 'host-path-type') add('T25', 'DirectoryOrCreate creates the directory when the path does not exist. A path of the wrong type fails. Omission or an empty type does not itself request DirectoryOrCreate.');
  if (/\.tls(?:\[\d+\])?\.hosts|tailscale.*host/i.test(path)) add('T26', 'The hosts-list matcher and the certificate source are separate receivers. Keep its own empty/wildcard rules and the selected Tailscale controller source. A generic secretName description is not evidence of which certificate is used or that live TLS works.');
  if (sourcePath === 'my-values/infra/argocd-values.yaml') add('T26', 'An inactive Argo valueFiles profile is not evidence that bootstrap or manual direct loading is excluded. Read the actual named loader before calling the full file inactive. A source path is not a launch record.');
  if (/\.helm\.valuesObject/u.test(path)) add('T16', 'Helm renders these chart inputs. A downstream application can then interpret the generated payload. In particular, the Argo Application health Lua evaluator is not the same receiver as Helm rendering. A redacted Lua body has not received hidden-content or execution qualification.');
  if (sourcePath.includes('alloy') && path.endsWith('.configMap.content')) add('T20', 'A CRI log file is a container log file in Container Runtime Interface format. Relabeling changes its log labels in the named Alloy component. A chart fallback after omission and explicit empty content are different. Redacted selected content is not a reviewed executable body.');
  if (sourcePath.includes('spire') && /Hooks\.enabled/u.test(path)) add('T23', 'These flags select chart hook rendering and its install/upgrade or deletion lifecycle. A flag is not evidence that a hook was executed. Deletion hooks and install/upgrade repair hooks are different operations.');
  if (sourcePath.includes('spire') && /namespaces.*create$/u.test(path)) add('T23', 'The global namespace-create flag and the server namespace-create flag are different inputs. Keep the actual parent/child selection. A false flag is not evidence that the namespace is absent.');
  if (sourcePath.includes('spire') && /podSelector.*matchLabels/u.test(path)) add('T21', 'An explicit empty label value is not the same as removing its selector key. Omission of a later Helm override can keep an earlier key. Keep the separate namespace and Pod selectors. An arbitrary label is not identity authorization.');
  if (sourcePath.includes('tailscale') && /defaultTags/u.test(path)) add('T23', 'An empty tag item or string is different from an absent effective item. Omission of a later override can keep earlier tags. The actual Tailnet policy still controls what the selected tags authorize.');
  if (sourcePath.includes('promtail-retired')) add('T23', 'The retirement selector and eligible labeled nodes control whether this retired workload is used. Resource or client changes alone are not evidence that a workload is running. Keep this prerequisite before the resource/client effect at the selected receiver.');
  if (/allowedAccess.*subject$/iu.test(path)) add('T18', 'This subject is the selected Kubernetes ServiceAccount namespace/name. Keep its exact canonicalization for an unqualified name. It is not a generic issuer string or evidence that any runtime identity is authenticated.');
  if (group === 'source-secret-allowlist') add('T6', 'No effective source entry means this allowlist grants no copies. A selected name whose Secret does not exist is a different copy failure. A test-prefixed name is not proof that its data is safe to copy.');
  if (field.meaning.apiCollectionAuthority?.authority.includes('io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta')) add('T15', 'ObjectMeta is the metadata object inside the named resource. Its UID identifies one object instance. resourceVersion is an opaque version token, not a general numeric order. An ownerReference controller flag is not a permission transfer.\n\nFinalizer keys block final deletion while they stay in the list. A finalizer does not guarantee cleanup or give its keys a fixed execution order.');
  if (group === 'security-profile-type') add('T21', 'If an AppArmorProfile or SeccompProfile object is declared, its type is required. Omission of the full profile is a different admission/runtime default case. Keep the selected Unconfined value and the actual supported type constraints.');
  if (/\.capabilities\.(?:add|drop)/u.test(path)) add('T21', 'An empty add list changes additions through that list only. An empty drop list changes removals through that list only. The add list alone does not give all effective capabilities. The drop list alone does not give all effective capabilities.\n\nKeep the selected ALL drop and separate additions.');
  if (group === 'run-as-user' || group === 'run-as-group') add('T21', 'A numeric Linux user or group ID does not require a same-named image account. Keep the separate non-root policy and the selected UID 0 supervisor design.');
  if (group === 'volume-mount-path') add('T21', 'This mountPath is the path inside the container. It is not the volume name or the source object. Keep the actual source-volume constraints and required mount fields.');
  if (group === 'volume-name-reference') add('T21', 'This name refers to the matching volume in the Pod. It is not a source path or a list. Omission of a required reference is different from removing an optional enclosing mount.');
  if (group === 'volume-name-definition') add('T21', 'This is the volume name, which must be unique within the Pod. It does not by itself choose Secret, ConfigMap, PVC, projected or host-backed source behavior.');
  if (group === 'volume-subpath') add('T21', 'The subPath selects a relative path inside the volume. An empty subPath uses the volume root. Keep this separate from the container mountPath and source name.');
  if (path.endsWith('.fieldRef.apiVersion')) add('T25', 'ObjectFieldSelector apiVersion selects the schema version for its fieldPath and defaults to v1. It is not a general CRD, RBAC, controller or lease authority.');
  if (group === 'port-name' && path.includes('extraPorts')) add('T8', 'A ServicePort name must obey the Service DNS-label contract and is unique within that Service. A Service with more than one port requires names. Do not substitute the ContainerPort IANA service-name constraint.');
  if (group === 'port-name' && path.includes('extraContainers')) add('T8', 'A ContainerPort name must obey its IANA service-name constraint and is unique within the Pod. This is not the separate ServicePort name contract.');
  if (group === 'csi-driver-name') add('T25', 'A Container Storage Interface (CSI) driver supplies volumes through that interface. The named SPIFFE CSI driver supplies the selected Workload API socket volume. Its identifier is not evidence that the driver is installed or that an identity request succeeds.');
  if (path.endsWith('.resourceFieldRef.divisor')) add('T25', 'The omitted divisor has its receiver default. An explicitly empty scalar is not omission. Keep the selected divisor and the Go runtime scale constraint.');
  return notes;
}


export function retainedHelmDisplayText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('A object', 'An object').replaceAll('A array', 'An array')
    .replaceAll('missing project permissions prevents', 'missing project permissions prevent')
    .replaceAll('can be reused', 'can be used again')
    .replaceAll('An excessive mode grants the subject more authority than intended.', 'An incorrect mode can grant the subject more authority than intended.')
    .replaceAll('An excessive request leaves the Pod Pending', 'A request for more resources than are available can leave the Pod Pending')
    .replaceAll('Excessive requests leave Pods Pending', 'Requests for more resources than are available can leave Pods Pending')
    .replaceAll('an excessive request can prevent scheduling', 'a request for more resources than are available can prevent scheduling')
    .replaceAll('Excessive retention can fill the volume', 'A long retention period can fill the volume')
    .replaceAll('an excessive limit can exhaust the volume', 'a limit greater than the available volume capacity can fill the volume')
    .replaceAll('A short limit aborts valid backups; an excessive limit allows stuck jobs to overlap or consume resources.', 'A short limit can abort a valid backup. A long time limit can let a stuck job consume resources for longer. Job overlap also depends on the receiving schedule and concurrency policy.')
    .replaceAll('A short timeout interrupts work or cleanup; an excessive timeout consumes the Kubernetes termination window.', 'A short timeout can interrupt work or cleanup. The selected timeout must leave time for the other shutdown steps within the Kubernetes termination window.')
    .replaceAll('A very small value removes evidence too quickly; an excessive value grows memory use; invalid input stops configuration.', 'A small selected stream length can remove evidence needed by readers. A large selected length can increase memory use. Redis receives the value through the documented integer conversion and XADD command.')
    .replaceAll('does not waive schema validation', 'does not remove the schema constraints')
    .replaceAll('main Prism image policy', 'Prism application image policy')
    .replaceAll('dead route', 'route with no matching listener')
    .replaceAll('a broad protocol can permit unintended traffic', 'a broad protocol can let unintended traffic through')
    .replaceAll('Changes which transport traffic the policy permits.', 'Changes the transport traffic that is permitted by the policy.')
    .replaceAll('or permits an unintended protocol', 'or selects an unintended protocol')
    .replaceAll('unless ignoreMissingValueFiles permits omission', 'unless omission is permitted by ignoreMissingValueFiles')
    .replaceAll('omission or null permits namespaced kinds', 'with omission or null, namespaced kinds are permitted')
    .replaceAll('A nonempty list permits matching entries', 'With a nonempty list, matching entries are permitted')
    .replaceAll('permits contention', 'can cause contention')
    .replaceAll('permits overcommit', 'can cause overcommit')
    .replaceAll('permits unintended writes', 'can let unintended writes occur')
    .replaceAll('permits registry blob deletion', 'enables registry blob deletion')
    .replaceAll('permits no source', 'selects no source')
    .replaceAll('permits normal chart scheduling', 'does not restrict normal chart scheduling through this field')
    .replaceAll('or permits an empty generated set', 'or accepts an empty generated set')
    .replaceAll('Kubernetes permits an unnamed port', 'Kubernetes accepts an unnamed port')
    .replaceAll('permits writes subject to the volume and filesystem', 'lets writes occur subject to the volume and filesystem')
    .replaceAll('Remove the field only when the chart should omit the CPU limit.', 'Only if you do not want the chart to include the CPU limit, remove the field.')
    .replaceAll('Remove the field only when the chart should omit the memory limit.', 'Only if you do not want the chart to include the memory limit, remove the field.')
    .replaceAll('Remove the field only when the chart should omit the request.', 'Only if you do not want the chart to include the request, remove the field.')
    .replaceAll('An empty value skips the selected application user', 'An empty value does not create the selected application user')
    .replaceAll('An empty value skips this named application database', 'An empty value does not create this named application database')
    .replaceAll('duplicate resolved paths are skipped', 'duplicate resolved paths are not used')
    .replaceAll('skips repeated resolved paths', 'does not use repeated resolved paths')
    .replaceAll('`false` skips only this health check', 'With `false`, the program does not do this health check')
    .replaceAll('`false` skips only this startup check', 'With `false`, the program does not do this startup check')
    .replaceAll('`true` skips resources annotated as Helm tests.', 'With `true`, resources annotated as Helm tests are not used.')
    .replaceAll('a disabled dependency check skips it', 'the program does not do it when the dependency check is disabled')
    .replaceAll('A store supported by Loki v13', 'A store supported by Loki storage schema v13')
    .replaceAll('makes provisioning ambiguous or fail', 'makes provisioning ambiguous or causes it to fail');
}