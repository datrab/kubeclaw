# Registry clients and image lifetime

Buster now requires an explicit registry contract. The old
`runtimeInfrastructure.localRegistry`, `KUBECLAW_LOCAL_REGISTRY` sidecar override
and separate `CONTAINER_BUILD_REGISTRY_*` sidecar values are removed. A cluster
Service name does not establish node DNS, CRI trust or authorization. Existing
Buster installations must supply a private values overlay before their next
render; the chart rejects missing endpoint/transport/auth configuration. Other
agent roles do not acquire a registry requirement.

Configure `runtimeInfrastructure.registry.endpoint` as the actual registry
origin reachable from both Buster and every node that runs its test Pods. Set
`transport: https` and `authSecretName` to an existing Secret with the configured
`usernameKey` and `passwordKey` (defaults `username`/`password`). Provision that
registry's server TLS, authorization and private network reachability separately.
The endpoint has no embedded credentials, path, query or fragment. No DNS name,
public exposure, credential or CA is created by these settings.

For a private CA, set `caSecretName`, `caSecretKey` and `nodeCaFile`. The chart
mounts the supplied CA in the Buster sidecar, configures BuildKit's CA path, and
sets Node's `NODE_EXTRA_CA_CERTS` for manifest verification. `nodeCaFile` is the
operator-selected path where the same CA must be installed on each host. A
Secret reference or generated path does not prove that either file exists on a
node. System-trusted TLS needs no custom CA settings. The same authentication
configuration feeds the existing container-build provider's credential
interface; credentials are not written into runtime JSON or BuildKit TOML.

The native Trivy image scanner receives a temporary, mode-0600 Docker credential
file scoped to the exact configured registry host and removes it after the scan.
The scanner receives the same private CA through its `--cacert` option; it never
uses global username/password variables or disables HTTPS verification. Existing
database freshness checks and disabled database updates remain in force.

An anonymous HTTP registry is available only by explicitly selecting
`transport: http-lab` and an `http://` endpoint. It cannot receive credentials or
TLS settings. The checked-in `my-values/infra/registry-local.yaml` is such a lab
service, with no server TLS/auth. Deploy tooling applies it only when
`KUBECLAW_DEPLOY_LAB_REGISTRY=true` is explicitly selected. That switch does not
configure clients or expose a node endpoint. It does not remove an existing
registry when false. Do not interpret the lab manifest as a durable or secured
registry. It has no persistence or disk budget; configure capacity deliberately
before relying on it. No NodePort is introduced. Image security scans against this HTTP lab registry
fail explicitly with `SECURITY_SCAN_HTTP_LAB_UNSUPPORTED`: the pinned scanner
flag also relaxes TLS verification, so the client does not silently enable it.
The full lab image pipeline is therefore unsupported; use authenticated HTTPS
for the complete configured image path.

## Docker Hub mirror

`runtimeInfrastructure.dockerHubMirror.endpoint` is empty by default. Set its
actual origin and explicit `https` or `http-lab` transport to configure Docker
Hub pulls in BuildKit and generated node configuration. Custom CA fields have
the same meanings as above. This public-image cache has no inferred upstream
credentials. The writable registry cannot double as a proxy mirror. GHCR and
private registries are not redirected to it. All other clients remain direct
unless separately configured; deploying a mirror Pod is not transparent client
configuration.

The checked-in HTTP cache is an opt-in lab manifest:
`KUBECLAW_DEPLOY_LAB_DOCKERHUB_MIRROR=true`. The manifest's existing cache PVC size
is unchanged and is not a capacity recommendation. Containerd and BuildKit may
contact the upstream for misses and metadata; cache behavior and offline
availability must be verified with actual clients, not inferred from Pod health.

## Generate and review node configuration

The sidecar receives non-secret `KUBECLAW_REGISTRY_CONFIG` JSON from the chart.
Use that exact `registry-clients.v1` object as the input file for node generation.
The root accepts only `schemaVersion`, `registry` and optional `dockerHubMirror`.
Registry/mirror objects accept `endpoint`, `transport`, `caFile`, `nodeCaFile` and
the chart metadata `caSecretName`, `caSecretKey`; registry additionally accepts
`auth`, `authSecretName`, `usernameKey`, `passwordKey`. All values except `auth`
are strings. `auth` accepts only `usernameEnvironmentVariable` and
`passwordEnvironmentVariable`. Unknown keys fail, including misspelled mirror
settings. To disable a mirror, omit it or use `endpoint: ""`, `transport: ""`
and empty/omitted trust fields; an empty object or configured trust/transport
without an endpoint is rejected. Chart values use only their documented Secret
metadata fields; generated `auth`/`caFile` are not values overrides.

It contains registry/mirror origins, transport, trust paths and credential
*environment variable names*, not secret values. Supply those referenced
credential variables privately in the local environment. Then run:

```sh
node scripts/registry-client-config.mjs registry-clients.json node registries.generated.json
```

The output is JSON, which is valid YAML for k3s `registries.yaml`. It includes
credentials and is created mode 0600; the generator refuses to overwrite an
existing file. Keep it private. Review and merge with existing host registry
settings deliberately; copying it wholesale could discard unrelated registries.
Generation does not apply configuration, restart k3s, install CA files, or prove
reachability. `my-values/infra/k3s-registries.yaml` is now an empty example instead
of a misleading localhost-port placeholder. Host installation remains an
operator action. Do not distribute the node credentials through pipeline logs.

The CLI also supports `buildkit` and `runtime` output modes. The actual Buster
entrypoint uses these modes before starting BuildKit, so URL, transport, auth
and digest lookup use the same validated input. Arbitrary duplicate registry env
entries on the named sidecar are rejected at chart render time. Exactly one
`buster-v2-runtime` sidecar is required for the Buster role.

For the real E2E workspace generator, supply the same non-secret
`KUBECLAW_REGISTRY_CONFIG` JSON in its operator environment. Missing configuration
fails before workspace creation. The generator validates the contract and copies
only its registry origin into module HTTP and intentional API-failure tests;
it does not resolve credentials or write credential names into project files.

The Buster entrypoint explicitly enables `networkHttp.registryHealth`. This uses
the existing container-build credential environment references and Node CA trust.
It permits the configured origin and port only for `GET`/`HEAD /v2/`, with no
query, body, WebSocket, redirects, or caller headers other than `Accept`. The
runtime adds authentication after the provider request boundary; platform
credentials never enter authored pipeline or API-flow configuration. Other
origins receive no registry credentials. Plain HTTP remains an explicitly
selected anonymous lab mode. Module health still requires an actual HTTP 200;
the intentional API-failure scenario still expects 599 and fails against the
actual 200. These checks establish registry health, not image push/pull success.

## Image lifetime and outstanding native evidence

Deleting a test namespace does not remove images from a shared registry.
Registry replacement can lose the current lab container's writable layer. The
repository supplies no reference-aware registry GC. Until an authoritative
reference lifecycle exists, retain required images and clean up only by an
explicit operator action that protects active leases/demos, waiting runs and
images needed for retained acceptance evidence. D06 demo expiry is not D07 log
expiry. Logs, reports and source retention remain unchanged. BuildKit cache and
registry images are separate stores. No storage size/class, automatic retention
period or deletion policy is invented here.

Before treating a deployment as working, use an uncached immutable digest in an
actual node CRI pull and a real test Pod, including unauthorized-client rejection.
For a mirror, observe requests from an actual fresh build and uncached node pull;
then separate cached-hit and uncached-miss behavior with upstream unavailable.
Registry GC requires multi-lease reference protection and registry-Pod
replacement tests after a real lifecycle/storage design exists. Local Helm,
configuration and HTTPS tests do not close any of these native gates.

## E2E target selection

The real E2E runner consumes `KUBECLAW_REGISTRY_CONFIG` and an explicit
`REAL_E2E_DEPLOYMENT_IMAGE` on that registry, pinned by SHA-256. It rejects the
retired local-registry override and foreign image authorities. Native fixture
verification authenticates to the selected manifest and checks its bytes;
it never chooses the first repository or tag in a catalog. Supply the configured
CA at Node startup through `NODE_EXTRA_CA_CERTS` when needed. This preflight does
not establish native BuildKit push, uncached CRI pull or Pod success.
