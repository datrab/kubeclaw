# Migrating Pipeline Plugins

Status: canonical migration workflow

## Purpose

Use this workflow to turn retained or newly imported behavior into a
self-contained v2 package without introducing forwarding wrappers or parallel
runtime authority. The repository completed its v1-to-v2 authority cutover in
Phase 12; these rules remain the contract for future extension migrations and
replacements.

## Select A Cohesive Unit

Start with one behavior whose inputs, outputs, configuration, effects, tests,
and consumers can be named precisely. If the behavior requires a capability
that does not yet exist, implement and verify its adapter registration before
claiming stage parity.

Behavior, not source structure, is the migration contract. Preserve every
observable legacy input, result, effect, artifact, lifecycle transition,
failure mode, retry, cancellation, and recovery guarantee unless a deliberately
changed contract is demonstrably simpler or more effective. Do not copy a
module line for line merely because it exists. Before implementation, answer:

1. What exact behavior must remain equivalent?
2. Which code is accidental complexity rather than part of that behavior?
3. Can the replacement use a smaller direct domain function or capability
   boundary?
4. Would a focused rewrite produce a clearer or safer result than adapting the
   legacy module?
5. If behavior changes, what is better, who accepted the change, and which
   legacy and replacement tests prove the difference?

Choose `reuse`, `refactor`, or `rewrite` explicitly for every parity scenario.
`reuse` is not preferred by default. A rewrite is correct when it preserves the
declared behavior with less complexity; an intentional behavior change is
correct only when its old expectation, new expectation, rationale, complexity
impact, and approval are recorded. Undocumented behavior drift fails parity.

One cutover unit may contain multiple registrations when they share one domain
implementation. Each registration still has independent configuration,
capabilities, lifecycle, and evidence.

Reject a candidate from the current extraction batch when it cannot yet
receive a canonical core-issued envelope, identity, lease, wait, or receipt.
Document that prerequisite and choose the next dependency-ready package;
never invent those authority fields inside the adapter merely to make a
scaffold appear complete.

## Package Extraction

1. Record exact legacy producers, consumers, files, schemas, configuration,
   effects, fixtures, tests, documentation, and deletion paths in the migration
   ledger.
2. Put the complete implementation inside the owning role-aware package.
3. Put schemas, configuration contracts, fixtures, tests, and package
   documentation beside the implementation.
4. Separate stages from privileged adapters. Stages decide domain results;
   adapters own filesystem, subprocess, Git, network, state, artifact, secret,
   or runtime effects.
5. Connect stages and adapters only through the public v2 SDK and explicitly
   granted capabilities.
6. Reject package imports that escape the package or reach retained v1
   implementations.

If a package introduces a genuinely new bounded foundation capability, record
it as `new` rather than inventing a legacy pairing. Similar terminology is not
evidence of behavioral equivalence: operator command lifecycle and subprocess
execution, for example, are separate ownership surfaces.

Storage adapters require an authority check before extraction. A local
append-only plugin-state journal is not automatically a replacement for Redis
transport, scheduler recovery, or a domain read model merely because all of
them persist data. Record the new authority independently unless the legacy
producer, consumer, ordering, replay, retention, and failure contracts are
actually reproduced.

Network adapters require real local-server tests for origin, method, header,
redirect, timeout, cancellation, body-size, response-size, content-type, and
error semantics. A generic HTTP capability is new foundation unless it
reproduces the complete delivery or transport contract of a named legacy
consumer.

HTTP publication is not durable transport merely because the receiver returns
an acknowledgement. Its contract must explicitly state whether it owns a
queue, retry schedule, replay cursor, receiver idempotency, and post-response
delivery evidence. If those are absent, classify the package as bounded HTTP
foundation rather than Redis or message-bus parity.

Telemetry persistence tests must prove canonical envelope preservation,
idempotent redelivery, sequence assignment, redaction, replay validation,
corruption failure, cancellation, and bounded records. A local evidence journal
must not claim Redis stream, retention, or consumer-group parity.

Observer extraction requires both a pure mapping test and delivery through the
real observer runtime. The mapping test owns envelope semantics; the runtime
test proves subscriptions, grants, adapter effects, at-least-once checkpointing,
and lifecycle isolation.

For multi-registration observers, execute every registration in the real
observer runtime and assert an independent checkpoint for each. Shared mapping
code is acceptable; shared authority is not. Redaction must occur before any
telemetry, artifact, or effect boundary and tests must scan every resulting
journal for the original sensitive values.

Notification observers should own stable presentation, not forward arbitrary
event payloads. Preview notifications expose only explicitly selected,
bounded artifact identity and metadata. Run each observer against the real
checkpoint runtime and the real bounded operator transport, then scan effect
journals for both discarded artifact content and authentication secrets.

Host-event sources must allowlist exact hooks, normalize identity before
emission, serialize or otherwise bound callback backpressure, account for
failed emissions, and drain subscriptions during shutdown. When a separate
dual-host plugin is the concrete host integration, keep its contract suite as
required evidence and defer no-duplicate-source activation to the final system
E2E gate.

Confidential capabilities need a persistence design before their adapters are
usable. Secret values must never enter effect requests, receipts, lifecycle
events, telemetry, error messages, or replay state. Test that absence against
the real effect coordinator; a resolver unit test alone is insufficient.

Secret-bearing adapters must also inspect every nested capability request. A
confidential resolver can still leak its result if the caller copies the raw
value into an auditable HTTP header or subprocess environment. Prefer a
one-way, request-bound derivative such as HMAC over the exact serialized body
and core idempotency key, then assert against the real effect journal that the
raw secret never appears in requests, receipts, events, or errors.

Nested capability calls need an explicit cancellation audit. Checking the
outer signal before and after a dependency prevents stale continuation but
does not prove that an in-flight nested socket or process is aborted. When the
core context cannot propagate the caller signal into nested invocation, record
that as an activation prerequisite and do not claim mid-flight cancellation
parity.

The canonical adapter runtime propagates the outer invocation signal through
every nested capability call. Live-function tests for a nested network or
process chain must cancel after the dependency has started, prove the
underlying resource closes, and prove no completed outer receipt is recorded.
Preflight-only cancellation assertions are insufficient.

Git adapters must be verified with disposable real repositories, worktrees,
branches, commits, and merges. Tests must cover option injection, symlink and
root escape, scoped paths, hooks, identity, environment isolation, output and
runtime limits, cancellation, process-group termination, and shutdown. Claim
only the declared Git operations; later pull/push/recovery work remains a
separate cohesive extension.

A package that calls a retained implementation, executes a configured opaque
command instead of owning the domain behavior, or asks an agent to recreate
deterministic logic has not been migrated.

## Required Verification Before Package Parity

Run all of the following:

- TypeScript package unit tests over real domain functions for TypeScript
  plugins, or tests in the implementation's native language for non-TypeScript
  plugins;
- package/core integration tests through the actual v2 registry, grants,
  adapters, lifecycle, and artifact/state boundaries;
- live function tests using real local tools or infrastructure adapters;
- exact Nova or Buster bundle assembly and complete module-graph checks;
- legacy behavior tests that define the parity contract;
- package boundary, schema, capability-denial, cancellation, and failure tests;
- documentation, inventory, security, and repository-hygiene checks.

The canonical package gate must discover every package root that contains
either `plugin.json` or `openclaw.plugin.json` and run that package's declared
test suite. Dual-host packages are not exempt from package-local boundary
evidence merely because one of their manifests belongs to OpenClaw rather than
the pipeline runtime. Every TypeScript plugin must expose a package-local
TypeScript live-function suite; JavaScript-renamed live suites are rejected.

Mocks may test an isolated error branch, but mock-only tests cannot establish
parity. At least one authoritative replacement scenario per registration must
execute the real implementation and real adapter boundary.

Registry availability is not behavior parity. A package being discoverable,
valid, grant-resolved, activatable, or independently executable does not
authorize switching a production consumer. Replacement authority moves only
after every retained workflow behavior has recomputable evidence; no
forwarding bridge or dual registry is introduced.

For deterministic stages, use two complementary layers: package-local unit
tests for exhaustive domain decisions and a live-function test through the
real registry/runner for capability authorization, adapters, effects,
artifacts, lifecycle mapping, and failure containment. Neither layer replaces
the other.

For adapters, test the effect implementation directly against disposable real
resources, then run at least one real stage consumer through the registry and
effect coordinator. Direct adapter tests prove storage/integrity/error
semantics; consumer-driven tests prove grants and lifecycle integration.
Consumer tests must assert public adapter results or catalog contracts, never
private storage-directory layouts.

Effect adapters must bound every resource they create or consume. For
subprocess adapters, test exact executable and canonical working-directory
authorization, argument validation, environment isolation, combined output
limits, execution timeout, cancellation, non-zero exits, graceful-to-forced
termination, and shutdown with real disposable processes. The capability
resource identity—not an untrusted payload field—selects the authorized
executable.

Agent-judgment stages must separate their deterministic protocol from the
eventual agent execution. Package tests must exhaustively verify instruction
construction, closed output parsing, contradiction detection, and canonical
result reduction. An agent-free live function test must still traverse the
real registry, grants, runtime-dispatch adapter, confidential secret boundary,
and bounded local transport. That proves the protocol integration without
pretending that a local HTTP response establishes reviewer judgment parity;
the actual agent-backed judgment remains part of the single final E2E proof.

A generic dispatch adapter must not be used as shorthand for complete agent
lifecycle parity. Extract target selection, request/response validation,
confidential request-bound authentication, idempotency, cancellation, and
transport failure semantics first. Keep spawn, monitor, transcript, handoff,
termination, and restart recovery separately blocked until their canonical
capabilities and real lifecycle tests exist.

Agent-backed validators need contradiction rules tied to their verdict. A pass
cannot coexist with findings or an empty inspected-evidence set, and a
remediation verdict cannot omit actionable findings. Persist only parsed,
closed output; malformed raw responses become a blocked stage result rather
than an untrusted report artifact.

Branch-synchronization stages must not receive broad command execution merely
to run Git. Put the exact ref/path materialization operation on the
resource-scoped Git adapter, validate every ref and relative path, report
missing source paths distinctly, and commit only the adapter-reported changed
paths. Verify the complete operation against a disposable repository with a
real source branch, checkout, commit, state journal, and artifact store.

Agent implementation stages must own an attempt-identity and completion
protocol. Never cast an agent response to a stage result. Require the returned
run, work item, and attempt to match; reject contradictory ready/blocked
evidence; and persist only the validated completion. Repository-diff proof,
session monitoring, handoff, and recovery remain separate prerequisites rather
than implicit properties of a successful protocol response.

Agent-written reports need pinned evidence references and a closed
machine-authoritative report. Require every mandated review dimension, validate
run/attempt identity, and store only parsed JSON. A Markdown presentation or a
successful dispatch is not by itself review evidence.

Deterministic summaries must remain deterministic. Replace opaque fact maps
with a versioned closed fact contract, calculate metrics and presentation in
pure code, inject external facts through bounded capabilities or upstream
artifacts, and test formatting against exact fixtures. Do not introduce agent
judgment merely because a candidate wrapper already dispatches an agent.

Generated narrative stages must separate deterministic grounding from agent
judgment. Send a bounded fact list with explicit no-fabrication rules, require
a correlated closed response, validate the complete ordered document
structure, and store only accepted output. Local protocol success does not
prove factual prose or agent lifecycle parity.

Large agent runtimes must be decomposed before migration claims are made. A
post-suite judgment plugin may own evidence correlation, verdict parsing, and
result reduction, but it cannot claim queueing, suite execution, deployment
tools, leases, cleanup, or recovery. Name and document the extracted protocol
scope, and keep every wider legacy surface blocked.

Place decision plugins in the consumer's role bundle. If Nova consumes Buster
completion evidence and owns the gate decision, the quality-gate package is a
Nova package even though its evidence originated in Buster. Test bundle
placement as part of extraction; package names must not determine authority.

Human-decision stages need three distinct tests: pure guidance authentication
and result reduction, a real pending-request path through operator messaging
and durable waits, and resume cases that prove terminal guidance performs no
new effect. Package extraction may establish these without contacting a human,
but it must not claim external signal delivery, restart recovery, timeout
resolution, or operator-transport parity until those paths are authoritative.

Wait persistence must be separated from resume authority. A wait adapter may
durably record typed intent, enforce idempotency, and expose replay, but core
must continue to own authorized-issuer checks, expiry, signal matching, and new
attempt creation. Test wait storage with a real journal, restart/replay,
idempotency conflict, corruption, entry bounds, symlink denial, and
cancellation; never treat a successfully appended wait as proof that resume
semantics are complete.

Durable adapters must validate the complete canonical object both before append
and while replaying existing records. TypeScript types and upstream callers are
not runtime validation. For authorization-bearing records, test closed object
shapes, identifier grammars, enum values, strict RFC 3339 date-time formats,
JSON payload validity, and malformed journal entries so invalid authority
cannot become durable state. `Date.parse()` alone is not a schema-format
validator.

Capability consumers must validate the adapter's complete public response
envelope, not a convenient inner payload or the adapter's private journal
layout. When an adapter evolves from returning a resource directly to returning
operation metadata plus that resource, update the consumer parser and verify
the interaction through the real adapter runtime. This catches contract drift
that isolated producer and consumer unit tests cannot detect.

Event sources must redact and bound payloads before the core's first durable
event append. Downstream observer redaction is too late because it cannot erase
the source event journal. Event-source startup must also be transactional:
release every earlier subscription when a later registration fails, and prove
both secret absence and partial-start rollback with real journal/subscription
tests. The adapter runtime likewise shuts down every already-ready adapter when
any later adapter fails activation, including the instance whose readiness
failed, in reverse startup order. A failed registry start therefore cannot
leave unmanaged producers or resources behind.

Live function tests must not:

- spawn Nova, Buster, Codex, Claude, or another agent;
- call the real pipeline E2E harness;
- consume model tokens;
- silently replace unavailable infrastructure with a fake success.

They may execute deterministic local tools such as compilers, linters, parsers,
Git commands in temporary repositories, or disposable local service adapters.

## Atomic Package Checkpoint

Finish and commit one package before editing the next:

1. run the package build, unit, boundary, integration, and live-function tests;
2. rebuild all v2 packages and assemble both role bundles;
3. accept reviewed inventory coverage and regenerate the migration ledger;
4. run focused legacy parity tests, v2 contracts, documentation, audit, and
   whitespace checks;
5. update the extraction-progress record and replacement scenario;
6. commit only that package and its directly generated/documented evidence.

This sequencing prevents partial work for several packages from sharing one
unreviewable checkpoint and lets later migrations adopt improvements discovered
by earlier ones.

## Deferred System E2E

Do not run `run-real-pipeline-e2e.mjs` or the live failure matrix for each
package. Run them once after:

- every active registration uses v2;
- the v2 registry, capabilities, graph, lifecycle, effects, waits, and recovery
  paths are authoritative;
- all packages have package-level parity;
- the assembled Nova and Buster bundles contain no forwarding candidates.

This final run is the release proof for the complete new system.

## Atomic Final Cutover

After all package and runtime prerequisites pass:

1. freeze and activate the complete v2 registry;
2. switch every consumer;
3. run the fast/full live E2E and failure matrix;
4. delete every superseded implementation, parser, registry entry,
   configuration field, schema, test, fixture, example, generated artifact,
   and active document;
5. run exact negative absence and prohibited-import checks;
6. record immutable `cutover-complete` evidence.

There is no compatibility bridge and no post-cutover cleanup backlog.

## Reference Package

[`skills/nova/plugins/lint`](../../skills/nova/plugins/lint) demonstrates the
package shape:

- two independently registered stages share one package-owned deterministic
  lint engine;
- a separately activated adapter owns tool execution;
- stage results are derived from canonical reports;
- report artifacts are written through the artifact capability;
- unit and live function tests do not spawn agents;
- the package remains non-authoritative until the final all-v2 cutover.
