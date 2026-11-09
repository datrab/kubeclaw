# Extend the Demo Handoff Package

Status: source-backed package guide; deployed delivery remains unavailable
Audience: plugin developer, platform developer, pipeline operator
Owner: Nova demo-handoff maintainers
Evidence: skills/nova/plugins/demo-handoff/plugin.json; skills/nova/plugins/demo-handoff/src; skills/nova/plugins/demo-handoff/schemas; skills/nova/plugins/demo-handoff/tests
Applies to: kubeclaw.demo-handoff 1.0.0; pipeline-plugin-v2
Last verified: 2026-10-21; repository-source facts checked; local checks identified separately

## Purpose and authority

This package turns qualified final test evidence into a candidate, delivers its
actual tested HTTPS URL and generated demo credentials to one private operator
target, and asks the internal controller to record Ready for Acceptance.
**Ready is not human acceptance.** Do not use this package to build an image,
create an exposure, authenticate an application, approve a design, or reconcile
an arbitrary external effect.

Use [Deliver a Demo](../../use/demo-delivery.md#canonical-demo-delivery-procedure)
for the maintained local rehearsal, its prerequisites, expected observations,
cleanup, and the explicit unavailable live journey. This guide owns the
package's implementation/change contract, not another operator delivery route.
The [project input](../../reference/nova-project.md#optional-demo-fields)
explains the compile-time provider chain; the
[lease reference](../../reference/buster-namespace-lease.md) owns controller
fields and transitions.

Why the stages are separate: a candidate proves selected evidence, delivery
proves the exact private message, and readiness binds that receipt to the
controller's current deployment. Combining them would obscure which external
step is uncertain. The cost is several durable records and strict cross-stage
identity checks. Reconsider the split only with a replacement protocol that
preserves those independent authority and lost-response boundaries.

## Registrations and stage inputs

Package identity is `kubeclaw.demo-handoff@1.0.0`. The Nova runtime role must
include it. Graphs select stage **types**; platform capability selection names
global **registration IDs**. They are not interchangeable.

| Local registration | Global registration | Consumer selection |
| --- | --- | --- |
| `candidate` | `kubeclaw.demo-handoff:candidate` | Stage type `kubeclaw.demo.candidate` |
| `delivery` | `kubeclaw.demo-handoff:delivery` | Stage type `kubeclaw.demo.delivery` |
| `ready` | `kubeclaw.demo-handoff:ready` | Stage type `kubeclaw.demo.ready` |
| `handoff` | `kubeclaw.demo-handoff:handoff` | Provider of `demo.handoff` |

All three stage configuration objects are closed and empty. Their inputs are
closed, required objects. Unknown input fields fail; no caller-supplied result
or receipt bypasses evidence selection.

| Stage input | Meaning and bounds |
| --- | --- |
| Candidate `manifestStageId` | Source summary stage ID, nonempty string, schema maximum 2,048 characters. |
| Candidate `authNodeId` | Exact authentication node selected from qualified evidence, same string bound. |
| Candidate `protocol` | Exactly `json-session.v1`. |
| Candidate `operatorTarget` | 1–128 lowercase alphanumeric / `.`, `_`, `:`, `-` characters, starting alphanumeric. |
| Candidate `retentionSeconds` | Required integer 1–9,223,372,036. Project compilation supplies default 604,800 when authored demo retention is absent; a hand-authored stage input must still supply the required field. |
| Delivery `candidateStageId` | Exact candidate producer stage, nonempty string with schema maximum 2,048 characters. |
| Ready `candidateStageId`, `deliveryStageId` | Exact producers of both selected handoff artifacts; same string bound. |

JSON Schema string lengths and runtime string lengths are different measures.
The helper also rejects control characters and measures its text bound using
JavaScript UTF-16 code units. A schema-valid string is not automatically valid
for every runtime helper.

The [manifest and schemas](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/plugin.json)
are the exact registration authority. Use the generated
[package facts](../plugin-catalogue/kubeclaw.demo-handoff.md) for the source
schema links, and the [SDK contract rules](../../reference/sdk.md) for the
shared `stage-result.v2` and full artifact-reference envelope.

## Candidate, delivery and readiness artifacts

Candidate selection uses visible artifacts from the current run and configured
summary producer. It requires exactly one artifact at the latest attempt;
absence or a tied latest selection is an error. `test.plan.evidence` performs
the original summary/native-import qualification. A caller's passed flag,
HTTP 200, or arbitrary same-digest object is not that authority.

The candidate is `demo-candidate.v1`: current run, selected manifest reference,
authentication node, protocol, private target, retention, and verified evidence.
The stage writes it as JSON in namespace `kubeclaw.demo-handoff` under
`demo-candidate:<runId>`, then returns that artifact reference in a passed stage
result. Invalid candidate work returns blocked `demo.candidate_invalid`.

The delivery stage selects the configured candidate and invokes
`demo.handoff` operation `deliver`, resource type `demo.candidate`, canonical ID
equal to the candidate artifact ID. Its output is persisted under
`demo-delivery:<runId>` in the same namespace. The stored `demo-delivery.v1`
binds the full candidate reference, stable delivery ID, exact private transport
payload digest and authoritative receipt. Failure returns blocked
`demo.delivery_unresolved`; it is not proof that no private message was sent.

The ready stage selects both artifacts, invokes operation `commit`, and stores
`demo-ready:<runId>`. `demo-ready-commit.v1` binds the candidate digest, exact
request-body digest and controller response. Its failure returns blocked
`demo.readiness_unresolved`; it is not permission to construct a new request ID.

Every adapter read rechecks current run, configured stage, namespace,
`application/json`, a size from 1 byte through 8 MiB, returned full reference,
original UTF-8 bytes, byte count and SHA-256 digest. A new artifact with the same
content but another producer does not inherit authority.

Implementation: [candidate](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/candidate.ts),
[delivery](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/delivery.ts),
[ready](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/ready.ts),
and [selection/byte rules](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/protocol.ts).

## Adapter configuration and least authority

Every field below is required. The adapter has no endpoint, credential, state
root, stage or timeout fallback. The example in the operator rehearsal is local
fixture configuration, not a deployment template.

| Adapter field | Consumer meaning |
| --- | --- |
| `candidateStageId`, `deliveryStageId`, `readyStageId`, `manifestStageId` | Exact stage owners used for artifact and invocation admission. Match the compiled graph. |
| `operatorTarget` | Exact private target; must equal the candidate's target. Same target grammar as candidate input. |
| `endpoint` | Canonical HTTPS URL ending exactly `/v1/demo-ready`; no query, fragment, URL username/password, or alternate normalized spelling. |
| `tokenPath`, `caPath` | Normalized absolute paths to the projected service-account token and trusted controller CA. Operator owns mounts and access. |
| `stateRoot` | Normalized absolute root of the adapter's durable intent/receipt store. Keep it with the owning installation and pending requests. |
| `timeoutMs` | Integer 100–60,000 milliseconds. Bounds adapter invoke and receipt lookup; shutdown can abort either earlier. |

The schema also bounds all stage, endpoint and path strings to 2,048
characters. The client reads regular nonempty credential files: token at most
16 KiB and CA at most 1 MiB. Token whitespace after trimming or control
characters is invalid. File mounting is a platform responsibility, not performed
by activation. The client does not establish a no-symlink filesystem sandbox;
protect credential roots through the installation's normal authority.

Select the original `kubeclaw.remote-test-gate:evidence` for
`test.plan.evidence`. Select the **same original operator adapter** for
`operator.request` and `operator.receipt`. A second adapter with a similar
receipt shape cannot attest the first adapter's message.

| Caller | Required grants/resources |
| --- | --- |
| Candidate stage | `test.plan.evidence` for the `kubeclaw.project-summary` evidence namespace; writes only its `kubeclaw.demo-handoff` artifacts. |
| Delivery and ready stages | `demo.handoff` plus artifact writes in the handoff namespace. |
| Handoff adapter | Artifact reads in summary/handoff namespaces, summary evidence qualification, and operator request/receipt only for its configured private target. |
| Original evidence adapter | Its existing original gate-artifact namespace grants and verified import-store configuration. |
| Original operator adapter | Its configured private Discord target, secret resolution and network grant. Receipt lookup reads its durable authority rather than sending another webhook. |

The controller certificate must validate against the configured CA. The
projected token audience and configured producer identity must match the
controller. TokenReview authenticates the configured runtime/service account,
not an individual in-process plugin. Sharing a container does not isolate that
token from other code. Keep service-account/webhook/platform tokens private.
Generated demo username/password are intentionally delivered unredacted in the
private message and can remain in original pipeline artifacts/logs; do not
publish those artifacts or interpret telemetry redaction as deletion of them.

## Durable state, concurrency and lost responses

Before delivery, the adapter rereads and binds the original candidate and
qualified evidence. The URL must be exact HTTPS without credentials, query or
fragment. Generated username/password come from that evidence, not config.
The stable delivery ID hashes current run, candidate digest and target.
Private-message receipt lookup binds that identity, original delivery stage
and exact transport payload. Changed payloads, foreign owners or legacy
unbound receipts cannot authorize readiness.

For readiness, the adapter rereads the candidate, verified manifest/import and
delivery artifact, then queries the authoritative operator receipt. It compares
the complete expected delivery artifact rather than trusting a supplied
receipt-shaped value.

The controller request binds run, source revision, candidate/decision/result
digests, lease name/UID, namespace, immutable image, manifest and credential
digests, Secret UID, exposure owner/generation, URL, observation time, retention
and exact receipt. Source revision must be `git:` plus 40 lowercase hexadecimal
characters and exposure generation a positive safe integer. These are separate
from merely having a valid JSON envelope.

The adapter persists exact JSON request bytes under stream
`demo-ready/intents` and the request ID before the first POST. The durable
store permits 10,000 records, 64 MiB total, and 65,536 bytes per record. The
HTTP request and response each have a separate 16 KiB bound.

- The first append winner sends the readiness POST. A competing append or
  replay with the same exact body performs a status lookup instead.
- An existing request ID with different body fails `DEMO_READY_INTENT_CONFLICT`.
- If the first POST loses its response, the adapter queries
  `/v1/demo-ready/status` with lease name, lease UID and request ID.
- A recovered receipt lookup without any original intent returns no receipt;
  it does not initiate a new readiness POST.
- A status failure remains unresolved. Replay does not change the original
  observation time, retention or request bytes, and does not renew a deadline.

A valid response must be `demo-ready-response.v1`, state
`ready-for-acceptance`, same lease/request identities, and digest of the exact
request body. It must give the same retention and an expiry equal to ready time
plus retention, later than now; ready time cannot precede the source observation.
Only then does the adapter append `demo-ready/receipts` with
`demo-ready-commit.v1`. The controller independently rechecks live bindings and
commits its own durable state; the local receipt is not controller authority.

Regular invocations assert the current resource fence; cancellation combines
invocation, adapter shutdown and timeout signals. `shutdown` aborts owned work.
Cancellation does not prove that a POST or private message had no effect.
This adapter implements no general compensate, erase-delivery, refresh-retention or authenticated human
extension operation.

Implementation: [adapter state machine](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/adapter.ts),
[cross-stage binding](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/binding.ts),
and [bounded TLS client/response admission](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/src/controller-client.ts).

## Failure and safe action

| Family or stage outcome | Trigger and effect | Retry or stop |
| --- | --- | --- |
| `demo.candidate_invalid`, `DEMO_HANDOFF_*` input/reference/artifact failures | Missing, ambiguous, foreign, oversized, changed or invalid candidate/evidence. Candidate cannot become authoritative. | Correct a new governed input or restore the original compatible evidence; never relabel a producer or rewrite a digest. |
| `DEMO_CANDIDATE_*`, `DEMO_MANIFEST_OWNER_INVALID` | Candidate run/target/protocol/evidence or summary ownership changed. | Stop before delivery/readiness; preserve the original references and obtain correct current-run evidence. |
| `DEMO_HANDOFF_OPERATION_INVALID`, `...PRODUCER_DENIED`, `...RESOURCE_INVALID` | Capability/operation, stage owner or candidate resource disagrees. | Correct registration/grants/graph before a new run. Do not broaden grants to force an old run through. |
| `demo.delivery_unresolved`, `DEMO_DELIVERY_*` | Private-message response or original receipt/artifact is missing or inconsistent. A message might already exist. | Inspect the original operator delivery identity and receipt; do not use a new delivery key or send credentials again on an assumption. |
| `DEMO_READY_ENDPOINT_INVALID`, `...PATH_INVALID`, `...DEADLINE_INVALID`, `...CREDENTIAL_FILE_INVALID`, `...TOKEN_INVALID` | Invalid configured endpoint, path, duration or mounted credential. Activation/client rejects. | Stop and repair the installation-owned prerequisite; keep pending intent identity unchanged. Never disable TLS or share tokens in a report. |
| `DEMO_READY_INTENT_CONFLICT`, `...RESPONSE_UNBOUND` | Changed original request body or returned lease/digest/time/retention mismatch. | Preserve store/request/response; stop rather than mint another request ID. |
| `DEMO_READY_*UNRESOLVED`, `DEMO_READY_HTTP_*`, `...CANCELLED`, `demo.readiness_unresolved` | Transport, controller status, HTTP response, abort or readiness outcome uncertain. | Query only the original controller status contract through the owning adapter. No generic Core result-import/retry promise. |
| `...REQUEST_TOO_LARGE`, `...RESPONSE_TOO_LARGE`, durable-store limit/integrity error | Local evidence/transport/storage bound exceeded or corrupt state. | Stop before treating partial state as success; retain bytes and ask the owning store/controller operator to resolve capacity or integrity. |

These are package families, not an exhaustive list of all Foundation, TLS,
filesystem or capability errors. Underlying failures can propagate. Preserve
first errors and actual durable identities before selecting another action.

## Change, verify, activate and remove

1. Prepare an isolated checkout using the
   [developer handbook](../developer-handbook.md#prepare-a-clean-checkout).
   Select this package's Node dependencies, OpenSSL and Go prerequisites through
   the existing demo rehearsal; do not point tests at a real Discord target or
   production controller.
2. Change the owning stage, adapter, binding or client and its closed schema
   together. Keep registration IDs and package/source identity explicit. A new
   candidate field or changed digest codec requires corresponding original
   evidence/controller readers and compatibility decisions; do not mutate a
   retained run's graph or stored intent body.
3. Use the exact local compiler and package tests from
   [Deliver a Demo](../../use/demo-delivery.md#canonical-demo-delivery-procedure).
   For the package itself, from repository root:

   ```bash
   npm test --prefix skills/nova/plugins/demo-handoff
   ```

   Required outcomes: compiler accepts the real bounded demo chain and rejects
   wrong links/retention; client rejects wrong TLS/token/body/result bindings;
   local handoff produces one delivery/ready result, rejects foreign or changed
   receipts/evidence, and handles a lost post-commit response without another
   delivery or readiness POST. Preserve actual TAP counts/errors/skips; source
   inspection alone is not a passing run. The local tests use contract
   deployment/TokenReview vectors; no native cluster, real Tailnet or Discord
   success is claimed.
4. Update this package guide, its generated catalog/configuration facts and
   source-bound complexity assignment. Run the relevant schema/registration
   checks and [documentation maintenance](../documentation-maintenance.md).
5. Validate the selected Nova role, package snapshot, stage configs, grants,
   private operator adapter, controller trust and durable roots before
   [activation](../../use/plugins.md#3-activate-and-prove-health). A unit test
   or manifest discovery is not activation. Live delivery remains stopped at
   the operator guide's explicit product gap until its named owners provide
   actual deployment inputs, access and cleanup proof.
6. For replacement/removal, stop admission and drain all stages/adapter calls.
   Reconcile every pending private-message or controller request under its
   original identity. Keep the old package/config/runtime available for
   retained compatible runs. Select replacements only for new governed work;
   do not edit a retained graph or change its intent body to force rollback.
7. Disable/remove through the
   [canonical package lifecycle](../../use/plugins.md#4-drain-and-disable).
   Package removal does not remove private messages, candidate/delivery/ready
   artifacts, adapter intent/receipt records, controller lease state, generated
   credentials, or an exposure. Their owners retain and clean each under the
   existing operator cleanup/retention procedure. Preserve unresolved state;
   there is no package-wide safe-delete or rollback-all command.

The successful local path and wrong-owner/changed-evidence negative path are
maintained in [handoff tests](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/demo-handoff/tests/handoff.test.mts).
Those fixtures are representative package validation, not a substitute for
separate human acceptance.
