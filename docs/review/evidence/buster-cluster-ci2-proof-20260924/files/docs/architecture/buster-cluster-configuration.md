# Buster cluster invoker configuration

The selected complete `buster-engine` component owns Kubernetes fixture and Tailscale exposure invoker policy under `settings.clusterInvokers`. Every field is required. Missing values are not filled by schemas, code, runtime JSON or environment variables. Capability grants and `allowedCapabilities` still independently govern access.

## Select the complete component

Both charts require the explicit `busterComponentFile` value. Their checked-in values select `files/config/buster-engine.config.json`; `my-values/buster-values.yaml` selects `files/config/profiles/buster-engine.runtime.config.json`. The latter is a whole Buster component with the five previously selected test-secret references. The default profile retains an empty list. No merge or keywise override occurs. Edit the selected file; editing the inactive file has no intended effect.

The selected document must identify owner `buster-engine`, use the supported schema, and be packaged under the permitted config path. Missing/empty files, foreign owners and traversal paths reject. The same bytes feed validation, ConfigMap delivery and workload checksum. Delivery retains the name `buster-engine.config.json` and the fixed swarm entry reference; loaders read regular component files from one resolved physical generation and reject component symlinks. Prism's packaged profile has the same physical source author as Kubeclaw's profile.

The entrypoint validates the full bundle and rejects retired environment keys before runtime-root setup, locks, temporary registry files, state/chown/kubeconfig writes or BuildKit launch. It pins the physical entry path for subsequent processes. Each later process validates a fresh snapshot of that physical generation; this is not a claim of one held file descriptor or atomic bytes spanning all processes. Relative kubectl paths resolve from the component generation directory captured with that process's snapshot, never from runtime JSON or a later re-resolution of the entry alias.

## Fields

The following values describe the checked-in default profile, not fallback values. Byte quotas are whole bytes, timer and polling values are milliseconds, retention is seconds, `diagnosticCodeUnits` counts JavaScript string code units, other manifest/resource fields counts. All numeric fields are positive safe integers; command timers are at most 2,147,483,647 ms. Kubernetes polling intervals range from 50 to 10,000 ms. Tailscale polling intervals range from 10 ms to `maximumExecutionMs`. PVC total must cover an individual claim; output multiplication must remain a safe integer.

| Field | Authored default-profile value |
|---|---|
| `shared.kubectlExecutable` | `"/usr/local/bin/kubectl"` |
| `shared.leaseApiGroup` | `"kubeclaw.forgestack.ai"` |
| `shared.leaseApiVersion` | `"v1alpha1"` |
| `kubernetesFixture.allowedNamespacePrefixes` | `["test"]` |
| `kubernetesFixture.registryRepositoryPrefixes` | `["kubeclaw"]` |
| `kubernetesFixture.allowedSecretReferences` | `[]` |
| `kubernetesFixture.allowedStorageClasses` | `[]` |
| `kubernetesFixture.allowDefaultStorageClass` | `true` |
| `kubernetesFixture.runnerServiceAccount` | `"agent-buster"` |
| `kubernetesFixture.credentialReaderServiceAccount` | `"agent-nova"` |
| `kubernetesFixture.maximumManifestBytes` | `1048576` |
| `kubernetesFixture.maximumResources` | `64` |
| `kubernetesFixture.maximumPersistentVolumeClaimBytes` | `10737418240` |
| `kubernetesFixture.maximumPersistentVolumeTotalBytes` | `21474836480` |
| `kubernetesFixture.maximumRetentionSeconds` | `604800` |
| `kubernetesFixture.maximumExecutionMs` | `900000` |
| `kubernetesFixture.pollIntervalMs` | `1000` |
| `kubernetesFixture.shortCommandTimeoutMs` | `15000` |
| `kubernetesFixture.commandOutputManifestMultiplier` | `2` |
| `kubernetesFixture.diagnosticCodeUnits` | `4096` |
| `kubernetesFixture.manifest.maximumNodes` | `100000` |
| `kubernetesFixture.manifest.maximumDepth` | `64` |
| `kubernetesFixture.manifest.maximumAliases` | `1000` |
| `kubernetesFixture.manifest.maximumFlattenVisits` | `100000` |
| `kubernetesFixture.manifest.maximumFlattenPending` | `100000` |
| `tailscaleExposure.allowedNamespacePrefixes` | `["test"]` |
| `tailscaleExposure.allowedHostSuffixes` | `[".ts.net"]` |
| `tailscaleExposure.maximumExecutionMs` | `900000` |
| `tailscaleExposure.pollIntervalMs` | `1000` |
| `tailscaleExposure.shortCommandTimeoutMs` | `15000` |
| `tailscaleExposure.maximumCommandOutputBytes` | `1048576` |

Namespace prefixes admit only the existing exact/prefix namespace relation. Registry repository prefixes are joined to the single existing registry-client endpoint; secret names are references, never secret values. The installation namespace remains the actual projected deployment binding. Explicit service-account names are combined with it for normal production. Direct invoker APIs require full namespace/account subjects and still support cross-namespace subjects; no constructor supplies agent-buster/agent-nova implicitly.

The shared kubectl and lease endpoint also feed RuntimeSecurity and broker CRD/RBAC/controller delivery. Generated controller environment variables deliver this same endpoint; they are not independent worker overrides. Controller access lists, other controller budgets and RuntimeSecurity budgets remain separate policies outside this migration.

Kubernetes command output is `maximumManifestBytes` times `commandOutputManifestMultiplier`, preserving the existing relationship. Both stdout and stderr have the lower process reader's independent cap. Short command deadlines still clamp to the operation/request remainder and `maximumExecutionMs`. Polling still respects the original readiness deadline. Manifest bytes are checked on the opened file before buffer allocation; YAML listener work, expanded alias graph and flattened List work have separate stated limits. These parser limits do not promise bounds on every internal library allocation. PVC totals retain StatefulSet replica multiplication.

## Migrate retired authors

Remove runtime JSON `kubernetesFixture` and `tailscaleExposure` policy sections. Runtime JSON carries the projected installation namespace as `clusterBindings.controllerNamespace`; a `registryReference` in that object is rejected. When KubernetesFixture is enabled, the existing `containerBuild` registry endpoint/reference pair passes the existing registry-health validation before store construction, and its origin is forwarded directly to construct allowed repository prefixes. This introduces no second serialized endpoint author and requires no build configuration for disabled KubernetesFixture. It does not override component policy. RuntimeSecurity's duplicate kubectl/namespace/group/version fields also reject. Remove worker `BUSTER_LEASE_API_GROUP`, `BUSTER_LEASE_API_VERSION`, `BUSTER_ALLOWED_SOURCE_SECRETS`, and old `busterNamespaceBroker.leaseApiGroup/leaseApiVersion` Helm values. Presence rejects even equal or empty values. The five existing Buster profile secret references move into its selected complete component.

KUBECONFIG and Kubernetes service host/port remain transport/credential inputs; this change does not expand cluster authorization. Provider request-schema defaults and old immutable invocation/snapshot interpretation remain a separate migration. The Foundation initial process-group capture deadline of 250 ms is still a separate owner; `processInput` lifecycle settings do not cover it. Protocol/security validation and request interpretation remain unchanged except explicitly rejecting unsafe timer configuration instead of silently clamping the Kube execution ceiling.

`npm run verify:buster:cluster-policy` is the maintained local gate. Local child-process and command-boundary tests are not live Kubernetes/Tailnet or native isolation acceptance. Full CONFIG/D17 status remains separate, including uncentralized policies of other consumers.

Lease API versions use one shared domain: `v` followed by digits, optionally `alpha` or `beta` followed by at least one digit. Examples: `v1`, `v1alpha1`, `v2beta12`. Incomplete prerelease labels (`v1alpha`, `v1beta`) and other labels (`v1rc1`) reject in schema, both charts and both direct invokers. External namespace/registry bindings are required only for enabled cluster consumers; an otherwise valid non-cluster runtime does not need `clusterBindings`. If a binding is supplied even with all cluster routes disabled, its shape and namespace are validated; malformed or extra fields reject. Component policy itself remains explicitly required for every complete Buster component.


## Capture and production-route regression coverage

The local gate includes `buster-cluster-capture.test.mjs`. It invokes actual local CLI processes before and after rewriting the selected component file, and separately after mutating caller-owned arrays and nested manifest policy. The same request must remain valid under the original capture; a fresh capture must enforce the changed namespace, registry, secret, storage, YAML-depth or preview-host policy. A new consumer constructed from the old file snapshot is checked as well. This is behavioral coverage rather than an object-freezing assertion.

`buster-cluster-production-route.test.mjs` submits signed source plans through the public Nova gate and HTTP runtime returned by `loadProductionBusterRemotePlanRuntime`. Two authored profiles exercise each cluster capability through the real service, discovered provider child, capability IPC and local command executable. Captured command arguments and lease bodies check installation namespace, API group/version, runner subject and registry image; the exposure provider checks the returned hostname. Missing grants and disabled routes have independent rejection checks and must execute no cluster command.

The command executable models Kubernetes/Tailscale responses in private files. Preparation uses the existing explicitly modeled native identity/publication adapter, while retaining the actual parser and extractor. These tests do not prove live cluster behavior, native preparation isolation or full CONFIG completion. Their source is not an execution result: acceptance requires the maintained command and semantic controls to pass at the reviewed source hashes.
