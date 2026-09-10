# T15-F01 configured-writer checkpoint

This package remains **incomplete**. The source-authority implementation is still
bounded and internally consistent at `e644a79fddd4d4d686fbd351b6edaec5575caf57`,
but the original final acceptance requirement is a genuine configured writer
consuming immutable sources. That proof cannot be produced in this checkout.

The frozen set was re-derived from `c38779c71bb92bc15c3fcb89930348e5417aa475`:
47 entries had status `implementiert`, the set exactly matches
`partial-47-scope.json`, and T15-F01's original source text remains byte-for-byte
unchanged (SHA-256 `eeee165794cbae32952dc20eef3a7658cbb468b3e3718c7ba8dc26a3542c90b1`).

## What was genuinely re-run

The unchanged report-source suite passed 10/10 without skips. It executes two
different Git revisions and completed source runs through Nova Core, lifecycle
and effect journals, the original ArtifactStore, then exercises valid selection
plus wrong-run, source, head, snapshot and attempt data; duplicate, missing and
tampered artifact references; interrupted journals; and unresolved effects. Both
unchanged report plugin suites also passed through actual Core,
EffectCoordinator, FileJournal, ArtifactStore, configured provider/grant
resolution, local authenticated transport, retry/reopen and durable replay.

Those plugin tests explicitly report `modelExecution:false`. Their HTTP response
is a protocol fixture, not a writer. They prove that the runtime receives the
verified source bundle and that its returned draft is persisted with exact refs
and execution ownership; they do not satisfy the remaining writer acceptance.

## Exact blocker

The repository's real writer route is
`kubeclaw.runtime-dispatch:openclaw`, which needs a configured OpenClaw Gateway,
token, result boundary and ACP/subagent runtime. This environment has no
`openclaw` executable, no `/home/node/.openclaw/openclaw.json`, no gateway token
or tools URL, and no listener on port 18789. Invoking the repository's broad
real-E2E probe would also spawn a provider session and attempt Discord, Redis,
Git, Kubernetes, BuildKit and Tailscale operations; it was intentionally not run
because this package authorizes none of those actions.

Replacing that route with a canned server, a deterministic fake writer, a mock,
a precomputed report or a generated-text assertion would weaken the native gate.
No such change was made. No deployment, CI run, paid resource, provider call or
third-party message occurred.

## Required next action

In an explicitly authorized environment with the configured OpenClaw/ACP writer:

1. Produce two completed source runs at two real source revisions through the
   current Core and ArtifactStore.
2. Select their immutable full refs through `report.evidence.read`, then run the
   actual pipeline-review and case-study stages through
   `kubeclaw.runtime-dispatch:openclaw`.
3. Verify the writer receives the pinned bundle and that stored output retains
   bundle/evidence refs and distinct current execution ownership, while
   `narrativeStatus` remains `draft-not-entailment-verified`.
4. Re-run wrong run/source/digest, missing/tampered content, retry and recovery
   cases through that same configured route. Do not label older ambiguous
   histories by inventing or migrating a guessed mode marker.

Raw command evidence is
[run19-t15-writer-prerequisite.txt](../../evidence/run19-t15-writer-prerequisite.txt).
