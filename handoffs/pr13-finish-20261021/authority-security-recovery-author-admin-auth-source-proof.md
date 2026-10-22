# Separate administrative-authentication correction

Author preparation only, 2026-10-22. No independent acceptance or product execution.

## Exact corrective scope

In `docs/site/understand/request-state-recovery.md`, replace only:

> It needs a separate signed decision record and strict replay checks.

with:

> It needs a separate decision record, matching authenticated-principal and allowed-issuer checks for new decisions, and strict replay checks.

`admin-auth-only.patch` contains this single outside-Source-box sentence delta. `source-boxes-only.patch` deliberately excludes it; `candidate.patch` combines the two. The captured baseline is retained unchanged. No cryptographic guarantee replaces the erroneous universal signature claim.

## Coherent implementation, entry and consumers

Exact source hashes and actual read ranges are in `fresh-source-read-ranges.json`; the handoff recheck records no subsequent physical drift in those current files.

- Complete `skills/nova/core/execution/engine.ts:1–35`: `reopenBlockedPipelineV2` forwards a mandatory `AdministrativeDecisionAuthenticator` to the normal administrative entry. Its returned principal has operator/administrator type and id. The callback supplies authentication; this API does not itself prescribe a signature protocol.
- Complete `engine-admin.ts:1–152`: `reopenPipeline` clones/freezes inputs, validates the closed administrative decision, prepares runtime and uses the run mutation lock. `#recorded` matches either decisionId or idempotencyKey and rejects unequal canonical full decision content. `#authorize` authenticates **new** decisions, requires exact actor/principal type and id equality, then checks the configured issuer allowlist. Exact previously recorded replay does not invoke fresh authentication.
- The same complete administrative implementation verifies pinned packages/configuration and graph before continuation, recovers persisted lifecycle state, checks the blocked target/run restriction for a new decision, verifies declared remediation and budget/busy/terminal constraints, then records a new decision before resumed lifecycle events. Append-once causation and recovered completion/wait checks preserve idempotent replay; these do not rewrite the old journal into a success.
- Complete `administrative-repair.ts:1–29` consumes the original durable attempt result, validates its StageResult contract and retains repair identity/budget enforcement. It is not a synthetic successful result.
- The closed schema branches `skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:803–879` and generated type declarations `skills/common/plugin-runtime/sdk/src/generated/contracts.ts:146–230` contain no generic required signature field. That is a bounded contract observation, not a prohibition on a real authenticator using cryptography externally.
- Complete engine-run/context/graph-build and lifecycle reducer/repair-budget reads, with bounded engine-snapshots read, establish the original execution/recovery consumers; their exact scopes are listed in the read manifest rather than claimed as a new whole-repository review.

## Named assertion evidence, not execution

- Full `tests/verification/reliability/admin-repair.test.mjs:1–122` and `admin-approval-fixture.mjs:1–56` were read. The fixture supplies `value => value.actor` as its authentication callback, not a cryptographic signature verifier. Tests cover original graph/approval invalidation, durable repair evidence, completed replay and crash-prefix replay.
- Only the relevant sections of `tests/verification/contracts/check-plugin-system-v2-phase6.mjs` were read:155–195 (fixture principal/allowlist setup) and400–560 (issuer denial, same-decision concurrency/one-record behavior and recorded-unapplied/completed replay). No whole-file fresh-read claim is made.
- These are assertions/source examples, **not executions in this author batch**. In particular a fixture accepting actor metadata is not a production authentication recommendation.

## Limits preserved

The caller must implement trustworthy authentication and protect decision/journal storage; issuer matching cannot authenticate untrusted metadata by itself. Exact recorded replay trusts the protected prior record rather than reauthenticating it. No deployed administrator/authenticator, callback transport, live reopen, credential or crypto verification was exercised. Existing callback/reopen/runtime and live-operation limits, links, pins and surrounding claims remain intact. This correction neither grants an administrative operation nor changes product code, schema or tests.
