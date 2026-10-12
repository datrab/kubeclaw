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
registry when false. The lab manifest is a template rendered with an explicit storage class and capacity
(see the maintenance procedure below). It still supplies no server TLS/auth.
No NodePort is introduced. Image security scans against this HTTP lab registry
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

Deleting a test namespace does not remove images from a shared registry. The lab
registry now stores its data on `registry-local-data`, an explicitly sized
ReadWriteOncePod PVC. `Recreate` avoids overlapping server replicas. The same PVC
provides exclusivity for the offline GC Job. A CSI driver supporting RWOP is
required; ordinary RWO allows concurrent Pods on one node and is rejected.
See the [Kubernetes access-mode contract](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes).
Do not downgrade the access mode to make an unsupported provisioner accept it.

Set `KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG` to a private JSON file containing
exactly `capacity` (a positive integer with Mi/Gi/Ti suffix) and
`storageClassName`. The operator selects both; the repository chooses no disk
allocation for the cluster. The PVC request is the declared storage budget,
not a filesystem quota on a shared unbounded backend. Select a provisioner that
actually bounds the volume and monitor its free bytes/inodes. Exhaustion fails
writes; increasing capacity or deleting retained images is not automatic.
Existing PVC class, access mode and requested capacity must match. Resize or
migration is a separate deliberate storage operation. The deploy command reads
existing Deployment/PVC objects and refuses an ephemeral or ambiguous existing
mount before applying anything. Migrate and verify all existing digests offline
before switching an old `registry:2` installation to this `registry:3.0.0` layout.
The renderer does not perform that migration or authorize deleting old data.

### Manual maintenance

Finish or stop image-producing jobs before the maintenance window; interrupted
uploads may need to be retried. Retain their source/build evidence. Capture the
current objects, render and review a dry-run plan:

```sh
kubectl get deployment registry-local -n "$NAMESPACE" --ignore-not-found -o json > registry-deployment.json
kubectl get pvc registry-local-data -n "$NAMESPACE" --ignore-not-found -o json > registry-pvc.json
node scripts/render-registry-local.mjs "$KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG" gc-dry-run registry-deployment.json registry-pvc.json > registry-gc-dry-run.yaml
```

Check each command succeeded. Explicitly applying the reviewed plan scales the
server to zero and creates `registry-local-gc-dry-run`. RWOP prevents it mounting
while the old writer still owns the volume. Inspect the completed Job's logs.
Only after that review, render mode `gc` using freshly captured Deployment/PVC
objects, then explicitly apply it and inspect `registry-local-gc`. A failed Job
has no automatic retry; investigate the failure while keeping the server stopped.
Jobs/logs have no TTL and no automatic deletion. For a subsequent maintenance
run, retain the previous logs and deliberately remove the completed Job objects
before creating new ones with these fixed names.

The official [Distribution GC](https://distribution.github.io/distribution/about/garbage-collection/)
marks every existing manifest reference before sweeping unreferenced blobs.
The generated command never enables `--delete-untagged`; DELETE and automatic
upload purging are disabled in the server configuration. Thus all published
manifest digests and their layers are retained, including overwritten tags,
active demos, waiting runs and accepted images. This conservative policy may
release little space: it intentionally has no age-based image eviction and no
claim that a completed job makes its image deletable. Unfinished upload chunks
are retained too. It only releases completed blobs that no manifest references.

After successful GC and deliberate removal of the completed GC Pod/Job (to
release its RWOP mount), render mode `serve` against current objects and apply
that reviewed plan. Verify reads by retained digest. No command here is invoked
automatically during deployment, and no cluster change was executed by the local
tests. Full namespace/PVC destruction remains destructive and deletes this data;
ordinary Pod replacement preserves it. Logs, reports and source retention retain
the D07 policy. BuildKit cache remains a separate store.

Before treating a deployment as working, use an uncached immutable digest in an
actual node CRI pull and a real test Pod, including unauthorized-client rejection.
For a mirror, observe requests from an actual fresh build and uncached node pull;
then separate cached-hit and uncached-miss behavior with upstream unavailable.
The original local Distribution test verifies two retained manifest digests,
shared layers, DELETE rejection, dry-run, actual orphan-blob release and server
restart. Kubernetes RWOP enforcement, provisioner capacity and Pod replacement
remain later live checks under D12; local configuration tests do not claim those
cluster results.

## E2E target selection

The real E2E runner consumes `KUBECLAW_REGISTRY_CONFIG` and an explicit
`REAL_E2E_DEPLOYMENT_IMAGE` on that registry, pinned by SHA-256. It rejects the
retired local-registry override and foreign image authorities. Native fixture
verification authenticates to the selected manifest and checks its bytes;
it never chooses the first repository or tag in a catalog. Supply the configured
CA at Node startup through `NODE_EXTRA_CA_CERTS` when needed. This preflight does
not establish native BuildKit push, uncached CRI pull or Pod success.
