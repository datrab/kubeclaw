# Buster Runtime Configuration

Status: implemented, with installation-specific values required
Audience: platform operator and Buster maintainer
Owner: buster
Evidence: skills/buster/engine/test-gates/production.ts
Evidence revision: `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`
Applies to: `buster-remote-plan-runtime.v1`
Last verified: loader, service, and capability runtime inspection on 2026-09-19

## Purpose and Boundary

This file configures the Buster HTTP service and the authority that it can give
to test providers. It is operator configuration. A project cannot change it
through `pipeline.json`.

The project declaration says what a test wants to do. Nova policy limits the
resolved plan. The Buster runtime file decides which capabilities exist on this
installation and applies service-side limits. A project value can be lower than
an operator limit. It cannot raise an operator limit or enable a capability.

The production loader accepts a JSON file path and a separate environment map.
It returns an in-process runtime object. The repository does not currently ship
a standalone configuration schema or a general Buster administration CLI.
Therefore, use this reference with the loader verification command. Do not
assume that an unknown JSON field is rejected: the current loader reads known
fields but does not perform a closed root-object check.

> **Claim:** The production loader constructs one authenticated, durable Buster
> service from an operator JSON file, environment secrets, a trusted package
> registry, service limits, and explicit capability blocks.
>
> **Implementation:** [The production loader reads JSON, secrets, the package registry, service limits, and capability blocks](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/production.ts#L116-L422).
>
> **Contract or setting:** `buster-remote-plan-runtime.v1` is the exact root
> version. [The HTTP runtime validates its listener and performs recovery before it listens](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/remote-plan-runtime.ts#L6-L72).
>
> **Test evidence:** [The configuration check covers authentication, source keys, isolation, capability requirements, and HTTP policy](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/tests/verification/contracts/check-pipeline-remote-runtime-config.mts#L12-L153).
> The direct configuration check could not complete in the documentation
> environment on 2026-09-19 because that environment has no `/usr/bin/tar`.
> It stopped at that explicit host prerequisite; it did not report a product
> assertion failure.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`.
>
> **Limit:** Loader construction proves configuration parsing. It does not
> prove that BuildKit, Kubernetes, browsers, scanners, the registry, or a target
> endpoint works.

## Load Order and Precedence

1. The loader resolves the runtime file itself to a real path. Relative paths
   in the file resolve from its containing directory.
2. It reads `KUBECLAW_BUILD_REVISION` and named secrets from the supplied
   environment. Secret values do not come from JSON.
3. It loads `platformConfig`, discovers installed packages, applies package
   trust, and builds one immutable registry snapshot.
4. It validates root service limits and each configured capability block.
5. It creates durable stores, the execution service, and the HTTP runtime.
6. `start()` recovers durable jobs before it opens the listener.

JSON does not override environment secret values. Environment values do not
override numeric or policy fields in JSON. Code defaults apply only where this
page states a default. A provider plan cannot override any value on this page.

## Required Environment

| Variable | Requirement | Reason and security effect |
| --- | --- | --- |
| `KUBECLAW_BUILD_REVISION` | Required; 40–64 lower-case hexadecimal characters | Binds every result to the Worker/Buster build that executed it. Do not use a branch name or an invented value. |
| Name in `tokenEnvironmentVariable` | Required when `trustedPeerSpiffeIds` is absent | Supplies the bearer token. The JSON stores only its variable name, so the secret does not enter configuration source control. |
| Name in `sourceAttestationPublicKeyEnvironmentVariable` | Required; must differ from the token variable | Supplies the trusted Nova Ed25519 public key. Buster uses it to verify source attestations. |
| Registry variable names | Required only when their corresponding registry fields are present | Supply registry username and password as a pair. The loader rejects an incomplete pair. |

Use either a bearer token or trusted peer SPIFFE IDs for HTTP client identity.
When `trustedPeerSpiffeIds` exists, the loader does not read
`tokenEnvironmentVariable`. TLS material and peer identity must still be
provided by the deployment path that terminates the connection correctly.

## Root Service Fields

All byte, time, count, and concurrency values are safe integers. Unless a row
states otherwise, their minimum is 1 and the loader has no maximum. Choose a
maximum that fits available storage or memory; absence of a loader maximum does
not make an unbounded value safe.

| Field | Required/default | Meaning |
| --- | --- | --- |
| `schemaVersion` | Required; exact `buster-remote-plan-runtime.v1` | Selects this loader contract. |
| `platformConfig` | Required path | Plugin-platform file. Relative paths resolve from the runtime file. It supplies installation roots and package trust. |
| `host` | Required non-empty string | Listener address. Binding a non-loopback address exposes the service to the configured network. Pair it with authenticated transport. |
| `port` | Required; integer 0–65535 | Listener port. `0` asks the operating system for a port and is useful for tests, not stable service discovery. |
| `tokenEnvironmentVariable` | Required unless SPIFFE peers are configured | Name of the bearer-token variable. It must match `[A-Z][A-Z0-9_]*`. |
| `trustedPeerSpiffeIds[]` | Optional; 1–32 non-empty strings | Allowed authenticated peer identities. Its presence selects peer authentication instead of bearer token loading. |
| `sourceAttestationPublicKeyEnvironmentVariable` | Required variable name | Selects the Nova source-attestation public key. It cannot be the token variable. |
| `trustedSourceAuthority` | Required non-empty string | Exact authority expected in a signed source snapshot. It must agree with Nova's configured source authority. |
| `stateRoot` | Required path | Durable job, result, and evidence records. Keep it on private persistent storage. |
| `runtimeRoot` | Required path | Attempt workspaces and extracted source. Give Buster exclusive ownership and enough temporary capacity. |
| `tarExecutable` | Required path to an existing file | GNU-compatible archive program used for listing and safe extraction. The service resolves the real file at startup. |
| `maximumArchiveBytes` | Required positive integer | Maximum compressed source archive accepted into the store. |
| `maximumExtractedBytes` | Required positive integer | Maximum total file bytes accepted after archive expansion. It limits decompression amplification. |
| `maximumResultBytes` | Required positive integer | Maximum stored result object and maximum result returned by the HTTP runtime. |
| `maximumResultStoreBytes` | Required positive integer | Aggregate capacity reserved for result objects. Admission rejects work when the reservation cannot fit. |
| `maximumRequestBytes` | Required positive integer | HTTP request-body limit. It must be large enough for an accepted job and source archive. |
| `maximumResponseBytes` | Required positive integer | General HTTP response limit. Evidence and result endpoints also apply their object-specific limits. |
| `shutdownTimeoutMs` | Required positive integer | Time allowed for listener closure and service shutdown before connections are forced closed. |
| `maximumActiveJobs` | Default 2 | Maximum jobs executing at one time. |
| `maximumQueuedJobs` | Default 16 | Maximum admitted jobs waiting for execution. |
| `maximumConcurrentAttempts` | Default 64 | Maximum total attempt weight that one submitted plan can request. A plan above it is rejected. |
| `allowedCapabilities[]` | Required array; empty is valid | Exact capability IDs that Buster can grant. A provider manifest and the job grant must also allow each capability. |

## Minimal Root Configuration

This minimal file starts an authenticated service without executable provider
capabilities. It is useful for validating storage, authentication, source
attestation, package discovery, recovery, and HTTP readiness. It cannot execute
a test plan because `allowedCapabilities` is empty.

```json
{
  "schemaVersion": "buster-remote-plan-runtime.v1",
  "platformConfig": "./platform.json",
  "host": "127.0.0.1",
  "port": 8080,
  "tokenEnvironmentVariable": "BUSTER_V2_TOKEN",
  "sourceAttestationPublicKeyEnvironmentVariable": "BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY",
  "trustedSourceAuthority": "nova:production",
  "stateRoot": "./state",
  "runtimeRoot": "./runs",
  "tarExecutable": "/usr/bin/tar",
  "maximumArchiveBytes": 8388608,
  "maximumResultBytes": 16777216,
  "maximumResultStoreBytes": 67108864,
  "maximumExtractedBytes": 33554432,
  "maximumRequestBytes": 16777216,
  "maximumResponseBytes": 16777216,
  "shutdownTimeoutMs": 5000,
  "recordLimits": {
    "maximumRecords": 1000,
    "maximumBytes": 67108864,
    "maximumRecordBytes": 16777216
  },
  "allowedCapabilities": []
}
```

The paths `platform.json`, `state`, and `runs` resolve from the directory that
contains this file. The platform file must be a valid `pipeline-platform.v2`
document with trusted Buster package roots. The numeric values above are an
example capacity plan, not production recommendations.

First run the loader contract check from the KubeClaw repository root:

```text
node tests/verification/contracts/check-pipeline-remote-runtime-config.mts
```

This check constructs and starts the minimal runtime. It therefore needs the
exact `/usr/bin/tar` path used by its controlled fixture. The broader registered
runtime check is `npm run verify:test-gate:remote-runtime`; it has the same
archive-tool prerequisite in the current fixture.

For an actual service, inject the token and public key through the deployment's
secret mechanism. Set the build revision to the exact deployed Git revision:

```text
export KUBECLAW_BUILD_REVISION="<40-to-64-character-lowercase-hex-revision>"
export BUSTER_V2_TOKEN="<at-least-32-character-random-token>"
export BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY="<PEM-encoded-Nova-Ed25519-public-key>"
node skills/buster/engine/remote-plan-cli.ts --config "<buster-runtime.json>"
```

Replace each bracketed value; do not type the brackets. The CLI prints one
`buster-remote-runtime-ready.v1` JSON object with the bound host and port after
durable recovery finishes. It then remains in the foreground. From another
process, check readiness:

```text
curl --fail --show-error "http://127.0.0.1:8080/readyz"
```

### Start one Nova remote-gate request

The Buster service command above owns its `--config` option. Nova has a
separate command that submits one prepared gate request to that service:

```text
node skills/nova/core/test-gates/remote-gate-cli.ts \
  --config "<nova-runtime.json>" \
  --job "<job.json>" \
  --timeout-ms "300000"
```

The Nova command requires all three value-taking options. `--config` selects
the Nova remote-gate runtime configuration. `--job` selects a JSON request
that contains the source identity, resolved plan, grants, concurrency limit,
and submission time. `--timeout-ms` sets the positive whole-number deadline
passed to gate execution. A missing value, a missing option, zero, a negative
number, or a fractional timeout fails before Nova loads the runtime.

This command consumes an already prepared request. It does not resolve a test
plan, add capabilities, or repair grants. A passed process exit means that the
returned remote stage result has outcome `passed`; other outcomes set a
non-zero exit status.

> **Source evidence — Nova remote-gate command**
>
> **Claim:** The command requires the configuration, job, and positive timeout
> values, then passes the parsed request and timeout to one gate execution.
>
> **Implementation:** [argument and request handling](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/core/test-gates/remote-gate-cli.ts#L9-L37)
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`

For the minimal file, the response must have HTTP 200, `ready: true`, and code
`BUSTER_READY`. Use HTTPS and the deployed address when `tls` or a network
service exposes Buster. Send `SIGTERM` or `SIGINT` to the foreground CLI for a
graceful stop. Preserve its final error output if shutdown fails.

> **Source evidence — service entry point**
>
> **Claim:** The CLI accepts exactly `--config <file>`, starts recovery before
> it prints the ready record, waits for `SIGINT` or `SIGTERM`, and then invokes
> graceful runtime shutdown.
>
> **Implementation:** [The Buster CLI owns the load, start, signal, and stop sequence](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/remote-plan-cli.ts#L1-L27).
>
> **Contract or setting:** [The readiness route returns `BUSTER_READY` only when recovery and configured dependency readiness succeed](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/remote-plan-http.ts#L84-L103).
>
> **Test evidence:** [The runtime test verifies recovery-before-listen, liveness, readiness, dependency failure, and shutdown behavior](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/tests/verification/contracts/check-pipeline-remote-plan-runtime.mts#L188-L262). The registered check reached its declared `/usr/bin/tar` prerequisite and stopped because the documentation environment does not contain that path on 2026-09-19.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`.
>
> **Limit:** An empty capability list proves only the service boundary. It
> cannot admit an executable provider grant.

The service also rejects archives with unsafe paths or types, more than 200,000
entries, or excessive expanded bytes. These archive rules are fixed code
limits, not configuration fields.

### Durable record limits

`recordLimits` is required.

| Field | Required | Meaning |
| --- | --- | --- |
| `recordLimits.maximumRecords` | Yes | Maximum durable records in the store. |
| `recordLimits.maximumBytes` | Yes | Maximum aggregate record bytes. |
| `recordLimits.maximumRecordBytes` | Yes | Maximum bytes in one record. It must permit the largest accepted job record. |

Set the record and result capacities together. A large request limit is not
useful when a single durable record cannot store the accepted job. Capacity
failure is an admission error, not a failed quality assertion.

### Dependency readiness and TLS

| Field | Required/default | Meaning |
| --- | --- | --- |
| `dependencyReadiness.maximumExecutionMs` | Optional block; positive integer | BuildKit readiness command timeout. When the block is absent, the service uses 1000 ms. |
| `dependencyReadiness.maximumOutputBytes` | Optional block; positive integer | BuildKit readiness output limit. When the block is absent, the service uses 65536 bytes. |
| `tls.keyPath` | Required when `tls` exists | Private-key file. The loader resolves its real path and reads it at startup. |
| `tls.certificatePath` | Required when `tls` exists | Certificate file. The runtime passes both byte buffers to the HTTP server. |

BuildKit readiness is active only when `container.build` is allowed. The
service refuses new work when that dependency check fails. Other capability
dependencies fail during their own admission or execution; the root readiness
endpoint does not probe all browsers, scanners, clusters, or target services.

## Capability Blocks

A capability can be present in an installed provider and still be unavailable.
The ID must be in `allowedCapabilities`, and the matching block below must be
present when the loader requires it. This two-part rule prevents package
installation from silently granting host or network authority.

### Direct command: `command.execute`

`directCommand` is required when `command.execute` is allowed.

| Field | Required/default | Meaning |
| --- | --- | --- |
| `executableCatalog` | Required non-empty string map | Maps stable project names to operator-approved executables. Project configuration selects a name, not a path. |
| `executableSearchPath[]` | Required; 1–32 strings | PATH directories exposed to a command. |
| `runtimeReadRoots[]` | Required; 1–32 strings | Host roots that the isolated process can read for runtimes and shared libraries. |
| `maximumOutputBytes` | Required | Combined bounded process output. |
| `maximumExecutionMs` | Required | Hard command duration. |
| `maximumProcesses` | Required | Process-count limit. |
| `maximumMemoryBytes` | Required | Memory limit. |
| `maximumCpuMillis` | Required | CPU-time limit. |
| `terminationGraceMs` | Required | Grace between cooperative termination and forced termination. |
| `cgroupRoot` | Required for strong isolation unless sampling is explicitly allowed | Cgroup root used for process, memory, and CPU enforcement. |
| `allowSampledProcessLimit` | Default `false` | Allows the weaker sampled-process fallback when no cgroup root exists. Use only as an explicit risk acceptance. |

### Container build: `container.build`

`containerBuild` is required when `container.build` is allowed.

| Field | Required/default | Meaning |
| --- | --- | --- |
| `buildctlExecutable` | Required path | BuildKit client executable. |
| `buildkitHost` | Required string | BuildKit endpoint used by `buildctl`. |
| `registryBaseUrl` | Required absolute HTTP(S) origin | Registry API origin used for manifest verification. |
| `registryReference` | Required host[:port] | Registry name placed in immutable image references. It must equal the URL host for health access. |
| `repositoryPrefix` | Required string | Namespace below the registry for test images. |
| `allowedPlatforms[]` | Required; 1–32 strings | Platforms a project can request. |
| `allowedBuildArguments[]` | Default empty; maximum 32 | Non-secret build-argument names that a project can use. |
| `maximumLogBytes` | Required | Build log limit. |
| `maximumExecutionMs` | Required | Build and verification duration limit. |
| `maximumManifestBytes` | Required | Registry manifest response limit. |
| `registryUsernameEnvironmentVariable`, `registryPasswordEnvironmentVariable` | Optional pair | Names of HTTPS registry credential variables. Both or neither must exist. |

The registry health probe under `networkHttp` reuses this registry endpoint and
credential pair. Credential use requires HTTPS. An anonymous HTTP lab registry
can use an unsupported scan-access record, but it is not a secure
production credential path.

### Kubernetes fixture: `kubernetes.fixture`

`kubernetesFixture` is required when `kubernetes.fixture` is allowed.

| Field | Required/default | Meaning |
| --- | --- | --- |
| `kubectlExecutable` | Required path | Kubernetes client executable. |
| `controllerNamespace` | Required string | Namespace of the lease controller. |
| `leaseApiGroup`, `leaseApiVersion` | Required strings | API identity of the deployment lease. |
| `allowedNamespacePrefixes[]` | Required; 1–32 | Namespace prefixes that a project can request. |
| `allowedRegistryPrefixes[]` | Required; 1–32 | Immutable image registry/repository prefixes accepted by the broker. |
| `allowedSecretReferences[]` | Default empty; maximum 32 | Existing source secrets that a fixture can request. |
| `allowedStorageClasses[]` | Default empty; maximum 32 | Explicit storage classes accepted in checked manifests. |
| `allowDefaultStorageClass` | Required Boolean | Whether a PVC can omit its storage class. |
| `maximumManifestBytes` | Required | Checked-manifest limit. |
| `maximumResources` | Required | Maximum Kubernetes objects in one request. |
| `maximumPersistentVolumeClaimBytes` | Required | Maximum one-claim storage request. |
| `maximumPersistentVolumeTotalBytes` | Required | Maximum storage across the fixture. |
| `maximumRetentionSeconds` | Required | Upper bound for a retained deployment lease. |
| `maximumExecutionMs` | Required | Fixture capability duration. |
| `pollIntervalMs` | Default 1000; runtime range 50–10000 | Lease observation interval in milliseconds. |

### Tailscale exposure: `kubernetes.exposure`

`tailscaleExposure` is required when `kubernetes.exposure` is allowed.

| Field | Required/default | Meaning |
| --- | --- | --- |
| `kubectlExecutable` | Required path | Kubernetes client executable. |
| `controllerNamespace` | Required string | Namespace of the exposure controller. |
| `leaseApiGroup`, `leaseApiVersion` | Required strings | Exposure lease API identity. |
| `allowedNamespacePrefixes[]` | Required; 1–32 | Deployment namespaces that exposure can use. |
| `allowedHostSuffixes[]` | Required; 1–32 | DNS suffixes that a produced endpoint must use. |
| `maximumExecutionMs` | Required | Exposure and handoff duration. |
| `pollIntervalMs` | Default 1000; runtime minimum 10 | Lease observation interval. It cannot exceed `maximumExecutionMs`. |

### HTTP and shared network: `network.http`

`networkHttp` is required when `network.http` is allowed.
Its nested field names are `allowedOrigins[]`, `allowedHostSuffixes[]`,
`allowedPorts[]`, `allowedMethods[]`, `allowedRequestHeaders[]`,
`maximumRequestBytes`, `maximumResponseBytes`, `maximumExecutionMs`,
`allowWebSocket`, and `registryHealth`. The table uses fully qualified names so
that a reader cannot confuse these fields with fields in another policy object.

| Field | Required/default | Meaning |
| --- | --- | --- |
| `networkHttp.allowedOrigins[]` | Default empty; maximum 32 | Exact direct origins permitted by operator policy. |
| `networkHttp.allowedHostSuffixes[]` | Default empty; maximum 32 | Permitted target suffixes, normally for internal services. |
| `networkHttp.allowedPorts[]` | Required; 1–32 unique integers, range 1–65535 | Target ports. |
| `networkHttp.allowedMethods[]` | Default `GET`, `HEAD`; when present 1–32 strings | Methods exposed by the capability. The runtime rejects names outside its supported method set. |
| `networkHttp.allowedRequestHeaders[]` | Optional; 1–32 strings | Request headers that providers can send. |
| `networkHttp.maximumRequestBytes` | Defaults to `maximumResponseBytes` | Request body and WebSocket message limit. |
| `networkHttp.maximumResponseBytes` | Required | Response-body limit. |
| `networkHttp.maximumExecutionMs` | Required | One network operation limit. |
| `networkHttp.allowWebSocket` | Default `false` | Enables WebSocket operations for providers such as API flow. |
| `networkHttp.registryHealth` | Optional; exact `true` | Adds the configured container registry as a health target. It requires `containerBuild`. |

An empty origin and suffix policy does not mean open network access. A target
can also arrive through a typed fixture input whose authority the runner checks.

### Browser Axe: `browser.axe`

| Field | Required/default | Meaning |
| --- | --- | --- |
| `allowedOrigins[]` | Default empty; maximum 32 | Direct browser origins. |
| `allowedBrowsers[]` | Required; 1–32 | Browser families allowed by policy. Provider support is Chromium, Firefox, and WebKit. |
| `browserExecutables` | Optional map with only `chromium`, `firefox`, `webkit` | Absolute executable paths. Each configured path must exist and be executable. |
| `maximumCombinations`, `maximumConcurrency` | Required | Limits profile/route products and parallel browser work. |
| `maximumExecutionMs`, `maximumResultBytes` | Required | Runtime and result limits. |
| `maximumScreenshots`, `maximumScreenshotBytes` | Required | Failure screenshot count and byte limits. |

`browserAxe` is required when `browser.axe` is allowed.

### Lighthouse: `browser.lighthouse`

| Field | Required/default | Meaning |
| --- | --- | --- |
| `allowedOrigins[]` | Default empty; maximum 32 | Direct target origins. |
| `chromeExecutable` | Required absolute executable path | Chrome/Chromium binary; it must exist and be executable. |
| `maximumRuns` | Required | Maximum repeated measurements. |
| `maximumExecutionMs`, `maximumResultBytes` | Required | Runtime and report limits. |

`browserLighthouse` is required when `browser.lighthouse` is allowed.

### Visual browser: `browser.visual`

| Field | Required/default | Meaning |
| --- | --- | --- |
| `allowedOrigins[]` | Default empty; maximum 32 | Direct target origins. |
| `allowedBrowsers[]`, `browserExecutables` | Required family list; executable map optional | Same executable validation as Axe. Exact browser identity remains part of baseline compatibility. |
| `maximumCombinations`, `maximumConcurrency` | Required | Target/profile product and parallel browser limits. |
| `maximumExecutionMs`, `maximumResultBytes` | Required | Runtime and result limits. |
| `maximumScreenshotBytes` | Required | Limit for one captured image. |
| `maximumMasksPerCombination` | Required | Maximum dynamic-region masks in one comparison. |

`browserVisual` is required when `browser.visual` is allowed.

### Playwright: `browser.playwright`

| Field | Required/default | Meaning |
| --- | --- | --- |
| `allowedOrigins[]` | Default empty; maximum 32 | Direct target origins. |
| `allowedTargetPorts[]` | Required; 1–32 unique ports | Endpoint ports accepted by policy. |
| `playwrightExecutable`, `sandboxExecutable` | Required paths | Controlled Playwright entry point and process sandbox. |
| `runtimeNodeModules`, `browsersPath` | Required paths | Read-only runtime package and browser installation locations. |
| `readOnlyRoots[]` | Required; 1–32 | Additional runtime roots available inside isolation. |
| `maximumWorkers` | Required | Maximum project-requested Playwright workers. |
| `maximumExecutionMs`, `maximumOutputBytes`, `maximumResultBytes` | Required | Duration, process output, and JSON result limits. |
| `maximumArtifactBytes`, `maximumArtifactFiles` | Required | Total Playwright evidence limits. |
| `maximumProcesses`, `maximumMemoryBytes`, `maximumCpuMillis` | Required | Attempt resource limits. |
| `terminationGraceMs` | Required | Grace before forced process termination. |
| `cgroupRoot` | Required non-empty path | Strong process accounting and enforcement root. No sampled fallback exists for this block. |
| `runAsUid`, `runAsGid` | Required positive integers | Unprivileged identity used by the sandbox. |

`browserPlaywright` is required when `browser.playwright` is allowed.

### Security scan: `security.scan`

| Field | Required/default | Meaning |
| --- | --- | --- |
| `trivyExecutable` | Required path | Trivy executable. |
| `allowedRegistryPrefixes[]` | Required; 1–32 | Image reference prefixes permitted for scanning. |
| `maximumExecutionMs`, `maximumOutputBytes` | Required | Scanner duration and output limits. |
| `cacheDirectory` | Required path | Operator-maintained Trivy database cache. |
| `databasePolicy.maximumVulnerabilityAgeMs` | Default 172800000; required when `databasePolicy` exists | Maximum vulnerability database age; runtime maximum 30 days. |
| `databasePolicy.maximumJavaAgeMs` | Default 604800000; required when `databasePolicy` exists | Maximum Java database age; runtime maximum 30 days. |
| `databasePolicy.maximumDatabaseBytes` | Default 8589934592; required when `databasePolicy` exists | Maximum database footprint; runtime maximum 32 GiB. |
| `registry.registryBaseUrl`, `registry.registryReference` | Required when `registry` exists | Scanner registry origin and matching host. |
| `registry.registryUsernameEnvironmentVariable`, `registry.registryPasswordEnvironmentVariable` | Optional pair for parsing; required for HTTPS scan access | Names of scanner credential variables. |
| `registry.registryCaFile` | Optional path | Additional registry CA file, resolved from the runtime-file directory. |

`securityScan` is required when `security.scan` is allowed. HTTP registry scan
configuration creates an unsupported-access record instead of receiving credentials.
Use HTTPS with credentials for the supported authenticated path.

### Kubernetes runtime security: `kubernetes.runtime-security`

| Field | Required/default | Meaning |
| --- | --- | --- |
| `kubectlExecutable` | Required path | Kubernetes client executable. |
| `controllerNamespace`, `leaseApiGroup` | Required strings | Broker namespace and lease API authority. |
| `allowedNamespacePrefixes[]` | Required; 1–32 | Namespaces that runtime observation can inspect. |
| `maximumExecutionMs`, `maximumOutputBytes` | Required | Observation duration and output limits. |
| `maximumObservationAgeMs` | Required | Maximum age of controller-produced runtime evidence. |
| `pollIntervalMs` | Default 1000; runtime range 10–10000 | Observation polling interval. `maximumObservationAgeMs` cannot be lower than it. |

`kubernetesRuntimeSecurity` is required when
`kubernetes.runtime-security` is allowed.

The capability constructors apply these runtime defaults and tighter ranges
after the production loader parses the JSON. [HTTP derives request limits and
defaults to GET and HEAD](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/network-http-runtime.ts#L155-L177).
[The Kubernetes fixture defaults polling and bounds its interval](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L443-L503).
[The database policy owns its age and byte defaults and maxima](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/trivy-database.ts#L7-L47).

## Safe Configuration Procedure

1. Start with `allowedCapabilities: []` and valid root service, storage,
   authentication, source-attestation, and platform fields.
2. Set `KUBECLAW_BUILD_REVISION`, the source public key, and either the token or
   peer identity configuration in the service environment.
3. Run
   `node tests/verification/contracts/check-pipeline-remote-runtime-config.mts`
   from the repository root. Stop on the first `BUSTER_REMOTE_CONFIG_*`,
   authentication, source, or isolation error.
4. Add one capability ID and its complete block. Run its implementation check.
5. Verify the real dependency in a disposable environment before production
   use. The suite reference gives the exact command and prerequisite.
6. Start the service with
   `node skills/buster/engine/remote-plan-cli.ts --config "<buster-runtime.json>"`.
   Query `/readyz` and confirm it reports `BUSTER_READY`. Record the runtime
   revision, registry snapshot, file digest, and deployment revision.
7. Submit one bounded canary through Nova. Confirm terminal result import and
   cleanup before increasing concurrency or enabling another capability.

Do not add a capability only because a plugin is installed. Do not put secret
values in the JSON file. Do not make a broad network suffix, registry prefix,
namespace prefix, read root, executable catalogue, or secret allowlist to avoid
a validation error. Each allowlist is an authority boundary.

## Failure, Recovery, and Change Control

| Observation | Meaning | Safe action |
| --- | --- | --- |
| Loader rejects a field | File value, path, secret, or conditional block is invalid. | Correct the file or environment. Do not start with a partially built runtime. |
| Readiness says `BUSTER_NOT_BOOTSTRAPPED` | Durable recovery has not completed. | Keep the service out of traffic and inspect recovery/store errors. |
| Readiness says `BUSTER_DEPENDENCY_UNAVAILABLE` | Configured BuildKit readiness failed. | Repair BuildKit access. Do not treat this as a project test failure. |
| Submission says capability denied | The plan grant is absent from the provider contract or operator allowlist. | Check all three authorities. Do not broaden the operator list until the provider need is reviewed. |
| Store capacity rejects admission | Durable proof cannot fit. | Preserve existing data, adjust retention/capacity, then submit a new operation if necessary. |
| Shutdown times out | Active work or persistence did not reach a safe boundary in time. | Preserve state and logs. On restart, let recovery inspect durable records before new admission. |

A change to package roots or trust can change the registry snapshot and make an
already resolved plan incompatible. A change to capability policy can make a
later submission fail even when project configuration did not change. Roll out
these changes with a new recorded configuration digest and canary. Keep old
state until all jobs accepted under the old deployment have terminal records
and imported evidence.

## Related References

- [Buster architecture](../understand/buster.md) explains the service and
  execution sequence.
- [Buster suites and providers](buster-suites.md) explains project fields and
  live proof commands.
- [Provider configuration](buster-provider-configuration.md) lists every
  project-controlled provider field. Those fields do not replace this operator
  policy.
- [Run and diagnose a Buster suite](../use/workflows/buster-suite.md) explains
  supported submission, observation, recovery, cleanup, and evidence.
