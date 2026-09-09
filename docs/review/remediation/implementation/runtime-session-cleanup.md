# Core-owned runtime session cleanup

PCR-RUNTIME-001: nonterminal OpenClaw exits now await a bounded cancellation and
terminal-reconciliation phase. Poll exhaustion, elapsed session time, parent
cancellation, model mismatch and unknown spawn acceptance cannot silently discard
cleanup errors. A cancel acknowledgment alone is not termination evidence.

## Core authorization and lifetime

The SDK adds optional dependency-call signals and optional `withCleanup` support.
An additional dependency signal only narrows the existing parent/lifecycle signal;
it cannot replace either. Core supplies exactly one cleanup allowance per active
adapter invocation, using its existing `shutdownTimeoutMs`. The cleanup deadline
also receives an absolute clock check after callback settlement, so a blocked
event loop cannot turn an expired cleanup into success.

Only the parent invocation signal is detached during cleanup. The same adapter
registration, granted capability, resource authorization, selected provider,
attempt and existing execution-key binding still authorize every dependency call.
Adapter lifecycle revocation, invocation closure and cleanup completion revoke the
scope. Repeated cleanup cannot restart its budget; retained cleanup contexts
cannot issue later requests. No capability vocabulary, grant policy or effect
schema is expanded. The network adapter still enforces its original method,
header, origin and byte restrictions. Runtime shutdown remains revocable; it is
not an authorization escape hatch for cleanup.

The optional SDK method preserves existing context implementers. Production
OpenClaw requires Core support when cleanup is needed and reports unresolved
cleanup if unavailable; it never substitutes direct fetch.

## Session ownership and durable outcomes

Local polling deadlines now reach actual dependency transport and response-body
reads. Cleanup uses its own Core signal, bypasses the short session-list cache,
and reconciles the existing deterministic label after a lost/delayed subagent
spawn response. It never spawns a replacement. A late accepted response may
supply the original identity during the same bounded phase.

Labels now retain the complete SHA-256 dispatch binding (43 base64url characters)
with at most 16 ASCII prefix characters: at most 60 characters total. No digest
bits are truncated. A matching old 8-hex label cannot authorize adoption, cancel
or respawn; it produces `OPENCLAW_LEGACY_SESSION_BINDING_UNRESOLVED` and the
existing durable unresolved receipt. The actual collision dispatch IDs
`collision:11329` and `collision:12843` both had old suffix `d1ba1a3f`; the
Core/HTTP regression accepts both separately and cancels their respective tasks.

Cancellation targets the owned task/session. Both normal polling and cleanup reject a
same-label entry with conflicting run/task/session identity. Registry adoption
requires unique run, task and session bindings across all records and both
field aliases, even when the spawn omitted the optional task ID; contradictory
related status records cannot confirm termination or supply a cancellation target.
Registry adoption and terminal lookup now share the same transitive identifier
closure, so discovering an optional task ID cannot hide another run linked through
that task. The actual Core/HTTP regression reproduced the prior unsafe cancellation
and false terminal confirmation before the correction; afterward it issues zero
cancels and persists the unresolved outcome. Both logs are retained.
ACP responses with explicit conflicting root or nested identifiers also remain
unknown, even when their status text is terminal. ACP `sessions_send`
only requests a stop; the existing `session_status` transport must then report a
terminal state. There is no existing ACP label-registry transport in this code,
so a lost ACP spawn identity remains explicitly unknown instead of inventing a
new Gateway tool or guessing a session.

After terminal confirmation, the dispatch still fails with its original reason
and `OPENCLAW_SESSION_TERMINAL_CONFIRMED`. Otherwise its top-level error preserves
the original reason plus `OPENCLAW_SESSION_CLEANUP_UNRESOLVED`, deterministic
label, known run ID (or `spawn-identity-unknown`) and cleanup failure. The existing
EffectCoordinator persists that diagnostic in the failed effect receipt. This
status means local dispatch failed; it does not claim the remote session stopped.
Existing `EFFECT_OUTCOME_UNRESOLVED`/external-continuation handling prevents blind
replay. Reopening the actual journal and invoking the same identity sends no new
spawn. No new receipt status or invented remote termination receipt is used.

## Upstream label contract

The configured OpenClaw version is `2026.9.2`. Its source tag `v2026.9.2`
resolves to `3928bad9badfcb6c7d140530435e806fb8092190`. Authenticated GitHub
source inspection found no label maxLength or truncation in the native spawn path:

- [Tool schema](https://github.com/openclaw/openclaw/blob/3928bad9badfcb6c7d140530435e806fb8092190/src/agents/tools/sessions-spawn-tool.ts) uses optional `Type.String`; Git blob `101fb13517bf5c2898d1761fe04f4c0d2f75084f`.
- [Parameter reader](https://github.com/openclaw/openclaw/blob/3928bad9badfcb6c7d140530435e806fb8092190/src/agents/tools/common.ts) trims text without a length cap; blob `e5381596d86b318497459646ef9c1342f9ced2cf`.
- [Native spawn](https://github.com/openclaw/openclaw/blob/3928bad9badfcb6c7d140530435e806fb8092190/src/agents/subagents/spawn/subagent-spawn.ts) forwards the trimmed label; blob `15792fda16b68ad0cb687236ebf35d984012a44e`.
- [Session patch](https://github.com/openclaw/openclaw/blob/3928bad9badfcb6c7d140530435e806fb8092190/src/agents/subagents/spawn/subagent-spawn-session-patch.ts) directly upserts it and explicitly distinguishes native spawn from `sessions.patch` uniqueness policy; blob `b2ea7924b489ca2dda118040eab539e3968bf56c`.

The additional local 60-character bound is conservative. This is evidence for
the configured version's source contract; OCI digest-to-source provenance and
live image acceptance were not measured here.

## Verification

`docs/review/evidence/runtime-session-cleanup.txt` contains original commands and
complete output. The new suites cover 29 local cases (the prior 25-case run plus four focused identity regressions) with the real registry,
AdapterRuntime, network adapter and filesystem effect journal:

- Twenty-one original OpenClaw dispatch cases: max polls, stalled poll body, parent
  abort, delayed/lost spawn, rejected/stalled cancel, ACP acknowledgment without
  terminal state, confirmed ACP terminal state, conflicting terminal identity,
  lost ACP identity, conflicting normal-poll identity, a concrete old-prefix hash
  collision, legacy-label refusal, ambiguous lost-spawn registry, conflicting ACP
  identity, contradictory same-run terminal records, and missing spawn task IDs
  with conflicting aliases, conflicting registry records, a transitive conflicting
  run through the discovered task ID, or one valid snake-case
  task ID with a consistent linked partial record. The three ambiguous cases issue zero cancel requests; the valid case
  cancels the resolved owned task. Real response connections close on cancellation.
- One original registry-parser regression rejects conflicting snake/camel aliases.
- Seven Core API cases using a small registered test consumer and actual HTTP:
  authorized cleanup after parent abort, denied origin/capability/method, timeout,
  lifecycle revocation, and native event-loop blocking past the absolute cleanup
  deadline. The consumer does not replace the production OpenClaw adapter in the
  first suite. It also checks that a fresh signal cannot replace an aborted
  parent, repeated/retained scopes are denied, and attempt identity is preserved.

The original runtime-dispatch tests (including real repository result-path
containment), plugin build, original capability-runtime contract, Nova and shared
plugin-runtime TypeScript checks remain required. Focused canonical lint and diff
checking cover this slice. One concurrent original-suite run exceeded its
existing 1-second collector deadline; the unchanged suite passed on serial
rerun. Both outputs are preserved; no timeout or gate was weakened.

This is local protocol/authorization evidence against a controlled HTTP peer,
not a production OpenClaw agent termination measurement. Missing identity,
revoked lifecycle, unavailable registry/endpoint or exhausted cleanup can still
leave external work unresolved; the failure is durable and explicit. Synchronous
JavaScript cannot be forcibly preempted by an AbortSignal. No external agent
requests, CI, deployment or commit were performed.

Frozen source: SDK `src/{runtime,index}.ts`; Core
`execution/{adapters,adapter-startup,adapter-invocation-phase}.ts`;
runtime-dispatch `src/{openclaw,openclaw-session,openclaw-cleanup}.ts`;
`tests/verification/reliability/{runtime-session-cleanup,adapter-cleanup-scope}.test.mts`;
this note and `docs/review/evidence/runtime-session-cleanup.txt`.
