# Observe a Tailnet Exposure, Transfer Its Ownership, and Release It

Status: supported exposure lifecycle and explicit external-client/policy boundaries. No live Tailnet claim
Audience: pipeline, namespace-controller, Tailnet and application operators
Owner: Buster exposure, namespace-controller and Tailnet maintainers
Evidence: skills/buster/plugins/tailscale-exposure/src/provider.js; skills/buster/engine/test-gates/tailscale-exposure-runtime.ts; skills/buster/engine/test-gates/exposure-generation.ts; skills/buster/engine/test-gates/exposure-handoff.ts; tests/verification/e2e/nova-tailscale-production-preflight.mts; scripts/deploy.sh; my-values/infra/tailscale-operator-values.yaml
Applies to: Buster public-endpoint-fixture.v1 via tailscale-ingress. Platform Studio routes remain separate
Last verified: 2026-10-21. Source and bounded local contract checks only. No OAuth, ACL, DNS, HTTPS or route cleanup execution

## Select the route and owner

A platform Ingress for Studio, Argo CD or another service is not a Buster
attempt-owned exposure. Use the platform installation and
[Prism/Studio procedure](../prism-studio.md#canonical-prism-and-studio-procedure)
for that route. A Studio preview is design markup, not an application release.
Do not release a platform route through a fixture lease.

This task concerns one resolved `kubeclaw.tailscale-exposure@1` fixture linked to
one typed Kubernetes deployment fixture. The provider selects an exact Service
endpoint from that deployment. It does not accept an arbitrary internal URL.
The controller and Tailscale operator create the route. An allowed client and
an application reader prove access separately.

Choose one lifecycle before execution:

- **Ephemeral check:** deployment cleanup deletes its fixture and exposure
  `retentionMode: release` returns it to Off during reverse cleanup. The
  maintained live preflight proves this bounded path, not a retained demo.
- **Retained readiness handoff:** the deployment must retain its namespace and
  the exposure uses `await-readiness`. A generation-bound handoff transfers
  ownership before a separate trusted demo-readiness producer commits it.
  Follow [Demo Delivery](../demo-delivery.md#canonical-demo-delivery-procedure)
  for that complete project, authenticated readiness, human decision and expiry.
  An exposed URL alone is not the handoff or human acceptance.

## 1. Establish operator, target and client prerequisites

Complete [cluster/release binding and scoped authority](../install.md#bind-cluster-authority)
and the [Kubernetes fixture procedure](kubernetes-fixture.md). Use the canonical
[runtime capability reference](../../reference/buster-runtime-configuration.md)
and [exposure suite contract](../../reference/buster-suites.md#5-tailscale-exposure-suite)
for settings rather than maintaining a second field inventory here.

The platform owner must provide the official operator, `IngressClass/tailscale`,
the actual controller/fixture namespaces, a pullable digest-pinned application
image and selected Service/port/path. Its client needs the runtime's permitted
namespace prefix, allowed public host suffixes and scoped lease get/patch
permissions. The namespace fixture separately needs its own create/read/delete
authority. A grant in one namespace or capability does not grant the other.

The Tailnet owner must provide OAuth authority, approved operator/proxy tags,
MagicDNS/HTTPS readiness and the exact ACL/grant policy for this route. The
checked-in values leave OAuth credentials outside Git and select default tags
`tag:k8s-operator` and `tag:k8s`. Private overlays can change that selection.
Record the selected policy and allowed client identities, not assumed defaults
or Secret values. A ready operator is not proof that the intended client may
reach the target.

Before a retained-route exercise, register one permitted and one deliberately
unpermitted client/device identity. Bind both to the same target hostname/path/port and bounded
observation window. Include the application authentication policy and cleanup owner. The
Tailnet/policy owner must provide the actual client and policy-observation
controls. This repository supplies no universal Tailnet ACL edit, device-login
or policy-verdict CLI. Missing client or policy authority is a safe stop, not a
reason to expose the route publicly or disable authentication.

## 2. Allocate through a supported workflow

Use the actual project compile/start and stopped-writer observation commands in
[Run a Buster Suite](buster-suite.md#5-submit-and-observe-in-production).
The owning project supplies its resolved plan, grants, immutable image and
checked-manifest input. The exposure node consumes the Kubernetes deployment's
`deployment` value and the HTTP node consumes the exposure output. It is not a
standalone `tailscale expose` command or an arbitrary `kubectl Ingress` patch.

For the separately registered **ephemeral live preflight**, the supported
wrapper command is:

```bash
assert_cluster_binding || exit 126
export TAILSCALE_PROBE_IMAGE="<registry/repository>@sha256:<64-hex-digest>"
./scripts/deploy.sh nova-tailscale-preflight "$TAILSCALE_PROBE_IMAGE"
```

The linked install procedure defines the bound shell and selected checkout.
This command allocates real remote work and a route. It is not a dry run.

Its
probe image must serve HTTP on container port 8080. The service maps port 80.
The plan uses a checked-manifest producer, deployment fixture, exposure fixture
and a blocking HTTP request. The optional expected-text setting belongs to that
preflight's existing configuration, not a new ad hoc URL substitution.

The preflight uses `release`, not `await-readiness`, and cleanup removes the
route before its wrapper returns. It is therefore not an opportunity to perform
later independent-client ACL probes against a still-retained route. For those
checks use a separately owned retained project route whose actual result and
expiry remain current. Do not rerun preflight to recover an unknown old lease.

## 3. Verify the current lease generation and endpoint

The exposure runtime first verifies the deployment lease's namespace, Service,
port, Ready phase and exact unexpired deadline. It patches the exposure under
an owner/request digest and resource version, then requires the controller's
current generation, matching owner and Ready exposure phase. A stale Ready
condition or a matching hostname alone is insufficient.

Read the typed result and original imported evidence. Keep lease name/namespace,
current lease UID/resource version/generation, owner/request identity, image and
manifest digest, selected Service/path, HTTPS URL/hostname, expiry and plan/job/
result/decision identities together. The ordinary deployment provider has a
weaker Ready/Rejected wait. Use the exposure's stronger generation/owner
observation for this route, not the basic lease phase alone.

The returned URL must be HTTPS, have the selected path and a permitted host
suffix, with no userinfo or fragment. Its host must match controller status and
any requested hostname constraint. This validates the result shape and route
identity. DNS, TLS, ACL and the application response still require the actual
client path. Do not use an external public URL or a direct Service response to
replace that check.

For the ephemeral preflight, require all four remote nodes passed, status
`completed`, decision `passed`, matching complete imported evidence and zero
runner cleanup errors. The initial `nova-tailscale-production-preflight.v1`
receipt reports runner cleanup separately from cluster cleanup. The wrapper
waits for observed namespace and lease deletion, confirms absence, updates the
cleanup fields and signs/verifies the production receipt. Preserve its actual
terminal status and `dist/verification/tailscale-exposure-production-receipt.json`.
A signing or wrapper failure does not prove that no route existed.

## 4. Observe allowed access and a meaningful negative

For a still-owned retained route, require each registered client owner to independently
verify its current device/user identity. Then require each owner to use the **same retained HTTPS URL**
inside the approved window. Record client identity, route/lease generation,
policy version, UTC interval, DNS result, certificate/host validation and bounded
request outcome. Use its actual authorized application reader. A network
connection or generic HTTP 200 is not application correctness.

The unpermitted-client result must distinguish policy denial from DNS failure,
TLS failure, timeout, expired lease and an application authentication response.
Correlate it with the Tailnet owner's authoritative policy observation. A failed
curl or a client not connected to the Tailnet does not by itself prove an ACL
negative. Conversely, a fixture's successful Buster HTTP node proves that test
client path, not every permitted user or rejection of an unpermitted device.

If the application has authentication, test the declared missing/wrong credential
behavior separately through its protected client mechanism. Do not call an
application 401/403 a Tailnet ACL result. The simple preflight image is not a
demo-auth proof. Use the owning application's actual security contract. Never
print session tokens or credentials to supply evidence.

If a required client/policy probe is unavailable, retain the exact missing
client/target/policy authority and safe stop. Do not fabricate a negative result
from successful DNS, an Ingress object or source tests.

## 5. Transfer readiness ownership without overwriting a successor

For `await-readiness`, the lease must have cleanup policy `retain`, a nonempty
UID, verified immutable image and manifest digest. The handoff binds that UID,
original exposure owner/request, expiry, image and manifest to a new readiness
owner and phase `awaiting-readiness`. The runtime patches the handoff with
resource-version protection, then requires the controller to observe the new
owner and current exposure generation before returning it.

Retain that exact `demo-exposure-handoff.v1` and its observed generation. The
old provider's cleanup is now superseded. It must not switch the successor's
route Off. A repeated original request can observe its existing exact handoff.
A changed source request, handoff record or generation is a conflict, not a
reason to overwrite annotations.

This is not committed demo readiness. The separate trusted producer verifies
live lease/Ingress, image/manifest, generated credentials and delivery evidence
before it commits readiness. Use the canonical demo procedure. Do not replace
it with a status patch or treat a notification receipt as approval. After commit,
its retained exposure snapshot/owner and deadline govern subsequent decisions.

## 6. Failure, release and cleanup

For an approved OAuth-rejection exercise, use
[Tailscale Authentication Rejected](../diagnose.md#tailscale-authentication-rejected)
with its bound namespace/Secret/deployment identities and secure restore source.
It allocates a new route because an old device can remain usable despite a bad
OAuth credential. Restore the original Secret/operator path and confirm cleanup
through that owning procedure. Do not rotate a real credential casually or
leave its failure trap disarmed.

An RBAC denial, expired/mismatched lease, denied host, timeout, controller
failure or unresolved mutation is its actual failed boundary. Failed prepare
attempts a bounded owned rollback to Off. Rollback can fail too. Preserve both
errors and current owner/generation. A stale attempt must neither report
success nor disable a newer exposure. Do not start a replacement route to hide
uncertain prior ownership.

Under `release`, provider cleanup invokes the actual exposure release. The
runtime sets purpose `gate`/provider `off` only while ownership still matches and
waits for current owner/generation Off. Superseded cleanup returns without
removing the successor's route.

The returned `releaseAction` is an owner-tested
lease patch generated by this runtime, not an unconditional namespace delete.
Validate the original trusted result and current lease before an authorized
operator uses that action. Do not blindly evaluate text from an unverified
receipt.

Its JSON test checks the owner annotation, not an atomic lease-UID
precondition. Never describe it as a universal UID-fenced delete command.

For a handed-off or committed route, use its **current** demo lifecycle owner,
release/decision/expiry procedure and retention policy. An old release action
can reject its changed owner. That rejection protects the successor and is not
permission to strip the owner test. Do not edit readiness/product status or
delete retained namespace/storage to force cleanup.

Observe actual exposure Off/Ingress absence, then the namespace fixture's
selected deletion or retained deadline. Keep distinct runner cleanup, API
observed absence and external Tailnet device/route retirement. The repository
wrapper checks cluster namespace/lease absence, not independent Tailnet device
inventory or every prior client's denial. The Tailnet owner must provide those
external retirement observations where required. TTL reaching its deadline
alone does not prove successful reconciliation or deletion.

Retain original source/plan/result evidence, exact route/lease/handoff identities,
positive and negative client observations, release/rollback failures and final
cleanup/retention authority. Do not delete canonical evidence or revoke a shared
OAuth identity as fixture cleanup.

## Source authority

- [Operator values keep OAuth authority separate and select defaults](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/tailscale-operator-values.yaml#L1-L34).
- [Provider selects only the deployment-owned internal endpoint](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/plugins/tailscale-exposure/src/provider.js#L32-L62).
- [Provider result, required handoff and cleanup invoke the narrow capability](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/plugins/tailscale-exposure/src/provider.js#L72-L106).
- [Readiness waits match generation/owner and exact lease binding](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/tailscale-exposure-runtime.ts#L123-L163).
- [Prepare and ownership transfer require observed current readiness](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/tailscale-exposure-runtime.ts#L190-L240).
- [HTTPS/host/path constraints and successor-safe release](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/tailscale-exposure-runtime.ts#L242-L270).
- [Owner/request digest, current-generation check and owner-tested release action](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/exposure-generation.ts#L8-L62).
- [Handoff binds UID/image/manifest/expiry and observed ownership generation](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/buster/engine/test-gates/exposure-handoff.ts#L1-L49).
- [Ephemeral live plan uses delete/release fixtures plus blocking HTTP](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L119-L151).
- [Result import and route/resource identity precede initial receipt](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L173-L225).
- [Wrapper confirms cluster cleanup before retained signed receipt](https://github.com/datrab/kubeclaw/blob/24a3fa0b316160187f23b02aeac8b2c60bb6e527/scripts/deploy.sh#L2534-L2589).
