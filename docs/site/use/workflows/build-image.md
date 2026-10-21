# Follow a BuildKit Image From Source to Its Consuming Node

Status: supported build/publication path with explicit original-request and consuming-node stops; no live build or pull claim
Audience: pipeline, Buster, registry and node operators
Owner: Buster build provider, registry and platform maintainers
Evidence: scripts/registry-client-config.mjs; scripts/inspect-node-registry.mjs; skills/buster/plugins/container-build/src/provider.js; skills/buster/engine/test-gates/container-build-runtime.ts; tests/verification/e2e/nova-buildkit-production-preflight.mts; scripts/deploy.sh
Applies to: kubeclaw.container-build@1, container-image.v1 and the selected registry-clients.v1 installation
Last verified: 2026-10-21; source and bounded local contract checks only; no build, push, node pull or application execution

## Start with one image task

The complete chain is source → resolved build → push → verified manifest bytes →
Nova evidence import → exact consuming node/platform → application observation.
Each arrow needs its own authority. A successful BuildKit command or `/v2/`
response does not prove the last three steps. A cached node image does not prove
registry access or current node trust.

Use the actual [container-build suite](../../reference/buster-suites.md#2-container-build-suite)
and [provider/runtime configuration owners](../../reference/buster-runtime-configuration.md)
for settings, not a second configuration catalogue here. For first-party release
images, retain the separate [release/image identity contract](../../reference/images-and-digests.md).
This task does not promote a new runtime release or replace image-selection
receipts.

Before a live operation, the pipeline owner supplies a committed source,
resolved plan, actual provider/grants and expected platform. The registry owner
supplies its writable endpoint, protected credentials/CA authority, retention
and backup. The platform owner supplies the exact consuming node/runtime and
its versioned client installation, cold-pull, application-reader and rollback
procedure. If that last procedure is absent, record the node step as unavailable;
do not invent a universal `crictl`, config-copy or service-restart command.

## 1. Bind client configuration and authority

In the accepted selected checkout, complete
[cluster/release preflight](../install.md#bind-cluster-authority) and
[Prepare the client projections](../maintenance.md#prepare-the-client-projections).
That procedure extracts one reviewed Buster render and produces private new
BuildKit, runtime and node projections from one `registry-clients.v1` contract.
Retain the sanitized origin/reference, render/contract/projection digests and
credential-authority reference, not generated credential-bearing node contents.

Do not hand-edit one client projection to make a failed task pass. Worker
entrypoint regeneration, node installation and effective container-runtime
routing are different actions. In particular, the node example selects no
registry by itself. The source-only node inspector cannot prove effective
containerd routing, DNS, authentication or a pull. Complete
[Install and prove the selected clients](../maintenance.md#install-and-prove-the-selected-clients)
before new runtime deployment or a node change.

For a controlled build, use a new approved attempt-owned output name/tag in the
resolved plan. The build context and Dockerfile must remain inside the admitted
provider repository/scratch boundaries. Protected credential arguments do not
belong in Docker build args; use the selected credential authority. The
provider's default platform is not evidence of the consuming node's platform.
Select and retain the actual allowed platform explicitly when that distinction
matters.

## 2. Run the supported build and retain its result

For a governed project, use the exact compile/start/audit procedure in
[Run a Buster Suite](buster-suite.md#5-submit-and-observe-in-production) with the
same source, platform, project and plan. Do not submit a hand-written remote job
or call BuildKit directly to bypass source attestation, provider admission or
result/evidence import.

The maintained live build **preflight**, when its registered installation and
receipt authority are available, has this separate entry point:

```bash
assert_cluster_binding || exit 126
./scripts/deploy.sh nova-buildkit-preflight
```

Use the selected checkout and bound shell from the linked install procedure.
This command starts real remote work and can publish an image; it is not an
offline validation command. The deployed Nova/Buster token/source key and
external production receipt signing/trust keys must already belong to their
proper authorities. Missing credentials, selected release, worker readiness or
signing authority are stops, not permission to synthesize them.

The preflight owns a new temporary Git fixture, new run and idempotency identity.
It builds an nginx-based page carrying that run ID. Its Dockerfile uses a tagged
upstream base; its successful output digest is exact, but this is not proof of
reproducibility from only the source commit or an unchanged upstream tag.

Require the actual remote status `completed`, gate decision `passed`, one
complete matching imported result/evidence record and no runner cleanup error.
The unsigned result uses `nova-container-build-production-preflight.v4` and
identifies run/job, source/runtime revisions, plan/result/decision digests,
evidence digests and the digest-qualified image. The wrapper then checks the
observed Buster revision and signs/verifies its production receipt before
storing `dist/verification/container-build-production-receipt.json`.
Retain full terminal output and status plus the accepted receipt through the
existing evidence owner; a wrapper failure can occur after the build succeeded.

## 3. Distinguish the attempt tag, manifest and running image

The capability derives an attempt tag `run-<hash>` from the exact resource
identity and pushes to its selected repository. This tag is a diagnostic
reference, not immutable image authority. BuildKit's metadata supplies
`containerimage.digest`; Buster then GETs that exact manifest by digest through
the configured registry and protected authentication. It bounds the received
bytes, hashes them and requires equality with the expected digest. A present
`Docker-Content-Digest` header must agree too.

Only after that check does the provider return `container-image.v1` with
`reference: registry/repository@sha256:…`, digest and its build identity/platform
facts. Nova's complete result/evidence import binds the remote result to its
original request. Compare all of those original identities; a success string
or a mutable tag copied into a new manifest is insufficient.

Keep the immutable reference, original attempt tag, source revision, platform,
job/request/plan/result/decision and imported evidence identities together.
A root OCI index digest, selected platform manifest, image config identity and
runtime `imageID` are not universal interchangeable strings. Use the
[descriptor and workload identity distinctions](../../reference/images-and-digests.md#descriptor-inspection-useful-bounded-not-a-running-container-verdict)
for their actual mappings; do not normalize away a mismatch by removing a
prefix or selecting the first child.

## 4. Require the consuming-node observation or stop

Publication does not install or run the image. Before a node exercise, its owner
must bind the node identity, OS/architecture/variant, runtime/version, effective
registry/mirror route, CA/auth source and exact digest. The approved procedure
must preserve the existing node configuration, define the reload/restart
boundary and rollback, and isolate an owned test workload from production.

Use that procedure's actual cold-pull control. Evidence must distinguish an
uncached manifest resolution/fetch from a ready Pod that reused local content.
Do not evict shared production images, clear all runtime caches or set a pull
policy and call it proof that every layer was uncached. An `IfNotPresent` start
can use a cache; even a successful digest resolution is not a universal claim
that every layer transferred again.

Observe the exact consuming Pod UID, node, selected container name,
`containerID`, requested immutable image, runtime-reported `imageID` and any
restart. Bind those observations to the retained manifest/platform identity,
then run the owning application's bounded reader for its expected content and
authorized access. The preflight page's expected run text is useful only if the
actual original image and retained run ID are still known; a different image
or generic HTTP 200 cannot close this observation.

The repository's client generator and build preflight supply no complete node
installation/restart/cold-pull/application-reader command sequence. Stop here
when the platform owner has not supplied that versioned procedure and per-node
proof. Name the missing node/runtime, configuration, trust/credential, expected
image/content and cleanup authority in the stop record. Local client generation
or a successful push cannot fill it.

## 5. Bound failure and retry authority

For an approved lab endpoint denial, reuse
[Registry Endpoint Unavailable During BuildKit Push](../diagnose.md#registry-endpoint-unavailable-during-buildkit-push).
Its guarded original Service/consumer identities, bounded fault window, exact
selector restoration and independent mirror observations remain authoritative.
Do not repeat those destructive settings on another registry or translate a
reachability fault into a TLS/credential bypass.

Read the first failed boundary: source/registry admission; BuildKit launch or
build; push; bounded manifest read/hash; evidence import; runner cleanup; or
wrapper signing. The capability distinguishes completed nonzero build output
from launch, deadline, cancellation and verification errors. Do not call an
arbitrary nonzero wrapper status a proved push denial.

An interrupted or failed preflight removes its temporary source/Nova state in
its finalizer and creates new identities on the next call. It has no supported
operator original-state custody/read operation. Therefore a new preflight is
not a retry or reconciliation of a possibly accepted push. Preserve original
stdout/stderr/status, interval, any request/job/image identities and signed or
unsigned receipt. Mark missing original identities unavailable.

Stop new build admission and have the Nova/Buster/registry owners inspect the
original job and intended attempt tag/digest through an authorized read path.
If that supported read/custody path is unavailable, retain the uncertainty and
follow [uncertain external effects](../diagnose.md#lost-responses-and-uncertain-effects).
Do not manually import a result, edit state, rebuild different content under an
old identity or delete a possibly published image to make the uncertainty vanish.

## 6. Cleanup and final decision

Restore the exact fault controls before ending its approved window. Remove only
owned disposable consumer resources through the node/application procedure,
and verify their absence or bounded retained ownership. Dispose of generated
credential-bearing client files through their credential owner; retain sanitized
projection digests and prior configuration for rollback.

The build capability removes its own temporary Docker authentication/metadata
directory; that does not delete a pushed registry image or prove remote layer
cleanup. Registry image/tag retirement and garbage collection require the
registry owner's retention, referenced-manifest inventory and backup contract.
Do not delete shared blobs or active release digests as test cleanup.

Record separate outcomes for build/push, verified manifest/import, cold node
pull, original-image application observation, failure reconciliation and cleanup.
Claim the whole chain only when all required observations agree. Otherwise
retain the exact implemented partial result and named safe stop without
promoting it to a completed node-consumer workflow.

## Source authority

- [One contract produces private client projections without node installation](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/registry-client-config.mjs#L83-L118).
- [Runtime consumes generated BuildKit and registry configuration](https://github.com/datrab/kubeclaw/blob/24a3fa0b316160187f23b02aeac8b2c60bb6e527/docker/buster-runtime-entrypoint.sh#L11-L31).
- [Provider context, Dockerfile/template, arguments and platform selection](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/plugins/container-build/src/provider.js#L48-L94).
- [Actual build request and typed digest output](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/plugins/container-build/src/provider.js#L98-L145).
- [Attempt-bound tag, actual buildctl push and metadata digest](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/container-build-runtime.ts#L226-L263).
- [Bounded raw manifest hashing and digest/header agreement](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/container-build-runtime.ts#L113-L154).
- [Remote import/image receipt assertions and temporary-state finalizer](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L88-L129).
- [Wrapper checks runtime identity then signs/verifies only after remote execution](https://github.com/datrab/kubeclaw/blob/24a3fa0b316160187f23b02aeac8b2c60bb6e527/scripts/deploy.sh#L1990-L2042).
- [Node example explicitly does not select/install registry routing](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/k3s-registries.yaml#L1-L7).
- [Node inspector reports source configuration, not effective runtime or CRI pulls](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/inspect-node-registry.mjs#L15-L46).
