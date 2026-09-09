# Review plugin

Owns the deterministic protocol and policy boundary around judgment-based review:

- prompt and task construction;
- `echo-review-output.v1` assessments and proposal parsing;
- `review-policy.v2` validation, profiles, resolution, freezing, and digests;
- content-addressed evidence and requirement-completeness validation;
- certified review-state reduction to canonical `stage-result.v2`;
- stable decision metadata for later ClawDeck evaluation;
- immutable `review-bundle.v1` assembly from adapter-proved Git revisions;
- deterministic focused context with at most one bounded expansion round;
- production discovery of frozen imports, tests, contracts, schemas,
  configuration, ownership, and public exports;
- deterministic connected slices when changed files exceed focused limits;
- citeable `reviewed-source` identities bound to frozen source digests;
- one fresh, bounded semantic-verifier dispatch for eligible Echo proposals;
- privately certified proposal, verdict, policy, and exact-finding provenance;
- explicit rejection and policy-driven uncertainty handling;
- stable exact finding fingerprints before pure decision reduction;
- deterministic, evidence-gated Simplification candidate mining;
- immutable candidate manifests bound to the frozen review revision;
- strict Echo candidate-reference validation; and
- advisory isolation that prevents every Simplification proposal from starting repair;
- exact root-cause grouping for independently confirmed findings;
- policy-driven integer ranking with stable tie-breaks; and
- bounded repair batches that preserve total and omitted finding counts.
- deterministic blocker, advisory, follow-up, and ignored classification;
- immutable `review-report.v2` artifacts bound to the bundle, governor, and attempt;
- operational `gate`, `lean`, and diff-focused `audit` profiles; and
- bounded advisory publication that cannot enter repair.
- core-certified repair-cycle state and immutable baseline recovery;
- deterministic file, added non-test LOC, and ownership growth checks; and
- bounded governor escalation that cannot be changed by Echo or Nova.

Reviewer judgment intentionally remains behind `runtime.dispatch`. The package never
trusts a dispatched response as pipeline control data. Echo does not emit PASS,
FAIL, or `StageResult`. The plugin parses assessments and proposals, verifies the
available evidence boundary, applies a frozen policy, and creates the result.
Invalid, incomplete, or semantically unverified blocking output fails closed.

## Evidence JSON identity

New authored graph evidence should declare `encoding: "kubeclaw-json.utf16.v1"`
and compute `digest` with `sha256Text(portableJson(content))` from the shared
SDK. The project compiler retains its existing closed ASCII-key legacy evidence
format so recompiling an existing run cannot change its pinned graph identity.
Stage input `content` is a JSON
value; the review owner converts it into an exact canonical JSON string and
preserves the marker in `review-bundle.v1`. Schemas, parsers, bounds and coverage
checks reject unknown or mismatched codecs. The enclosing bundle digest binds
the marker and is retained by stored reports and downstream review authority.
Legacy and tagged evidence may coexist in one bundle.

Untagged evidence retains its original locale-dependent canonical contract.
It is never silently relabelled or reserialized as portable evidence. A legacy
object plus digest does not contain the original serialized bytes: if another
locale cannot reproduce that digest, reconciliation requires the original
producer/runtime and existing authorization process. Even legacy bundle strings
must still meet the old canonical-only validation rule. This format addition
does not bypass pinned plugin package checks or renew prior approvals.

Repository-audit planning uses `o200k_base` token counts for the complete serialized
input envelope. It reports byte and token values separately. It enforces per-call
bytes, per-call input, model context with reserved output, phase ceilings, a
combined hard ceiling, estimated cost, wall time, and actual retry consumption
before dispatch. The standard whole-repository profile permits up to 100 context
expansions and 100 verification jobs under a 50-million-input-token total ceiling.
Its component agents also apply the `simplification` lens: they may propose only
concrete, behavior-preserving reductions backed by exact frozen source, and every
proposal goes through the same independent verification path as defect findings.
Simplification is source-based and does not create topology-only jobs. A policy
with Simplification disabled cannot execute a profile that requests this lens.
Follow-up phases select deterministically from the total capacity remaining after
earlier dispatches instead of relying on a small fixed allocation. Their estimates
reserve one attempt for every selected job plus a bounded shared retry pool rather
than multiplying every job by its maximum retry count. Prompt accounting uses the
shared runtime envelope plus a bounded result-path reserve. The OpenClaw runtime
adapter repeats the check on the exact final prompt that it sends.

Before each follow-up phase dispatches, the stage checkpoints a compact
`repository-review-follow-up-status.v1` artifact with requested, selected,
deferred, and reserved-token counts. The final reduction reports semantically
incomplete review-job IDs separately from valid proposal IDs that could not be
verified, so execution completion cannot be confused with verification coverage.

Each completed repository review and verification job is persisted as an
immutable content-cache artifact. Core checkpoints that artifact before the
next concurrent job can make the stage fail. Core checkpoints that artifact before the
overall repository-audit stage completes. Journal recovery supplies the
checkpoints to the next attempt, which validates their source, policy, model,
runtime, and evidence identities and dispatches only missing jobs. A container
failure at batch 150 therefore preserves batches 1 through 149.

Compilation also writes a content-addressed `repository-review-prepared:*`
checkpoint before the first runtime dispatch. A later attempt of the same stage,
or an execute stage that depends on a plan stage in the same run, validates and
reuses that complete frozen compilation instead of inventorying and hydrating the
repository again. Dependency artifacts are visible only along declared graph
edges. `npm run review:status -- --platform <platform.json> --run-id <run-id>`
reads the compact artifact index and the bounded journal tail; it does not scan
the large source-effect journal.

Production OpenClaw targets should set a dedicated `controllerSessionKey` such as
`agent:main:nova-review-controller` and `collectorMode: true`. Collector mode
uses OpenClaw Swarm's supported non-announcing `collect`/`agents_wait` path; the
adapter imports the authoritative atomic result file. Before expensive compilation, run
`npm run runtime:preflight -- --concurrency <n> --model <model>` to prove that the
requested number of real children can be admitted and completed through that
controller without leaving active tasks.

Long reviews use `npm run review:supervise`. The supervisor owns an exclusive
lease, publishes an atomic heartbeat, samples cgroup and Gateway health, adopts
an already-running matching pipeline after its own restart, and recovers only
the same run ID after a nonterminal child exit. `npm run review:status:format`
combines the compact artifact status, fresh heartbeat/resource samples, and the
dedicated controller's active-task list into a bounded human status update.
Stale heartbeats are reported as stale rather than running, and stale resource
samples are retained with their observation timestamp instead of being presented
as current measurements.

Repository jobs do not copy source into task text. Component jobs carry complete
source. Boundary jobs carry exact call-site and contract excerpts. Holistic passes
start from digest-bound compact topology records. They may certify a clean topology
triage with `reviewed-topology` evidence, but they cannot create a code finding
without exact source. Final holistic prompt size, not only relation counts, controls
deterministic recursive splitting. One complete region-graph pass preserves
cross-region paths when detailed topology needs more than one prompt. A blocking
finding still needs independent verification against exact
frozen source. Verification uses complete cited files when they fit. It uses
deterministic cited-line excerpts when a multi-file finding would exceed context.
Only an independently confirmed, policy-eligible, in-scope, repairable finding
can produce `request_fix`. Rejection has no blocking effect. Uncertainty can be
ignored, retained as a follow-up, or sent to the review orchestrator; it never
starts repair.

Every repository review and verification response also carries adapter-owned
runtime evidence. The stage checks the target, runtime, agent, model, and reasoning
level against its configured identity before it accepts or caches the response.
Cache keys include the attested identity digest.

The quality corpus contains paired seeded defects and clean controls for security,
contracts, concurrency, retry, persistence, deployment, and recovery. Run its
deterministic inventory with `npm run evaluate:quality`. A live Terra/high comparison
uses `npm run evaluate:quality -- --live --variant all --results <path>` and scores
the result again through the production parser and scalable preflight boundary.
The command checks the prompt digest and fails on invalid output, lower defect
recall, lower clean-control precision, or an ineligible finding priority.
When the review stage starts, it freezes the repository's current commit through
`git.repository.read`. The caller supplies only the base revision. The stage
derives changed files and hydrates all selected source bytes from that exact
commit, then sends Echo only the resulting frozen bundle. The private revision
proof never enters agent input.

Simplification candidate facts may come from an analyzer or the plugin's conservative
forwarding-wrapper producer. Missing or malformed external facts produce no candidate
and do not block correctness review. A plugin-owned bundle
or manifest integrity failure still fails closed. Candidate rules and confidence
filters come from the frozen review policy. Candidate counts and diagnostics are
reported as stable evaluation facts. `lean` publishes at most three
high-confidence simplification advisories. `audit` uses its larger configured
budget. `gate` publishes none.

Confirmed findings may share a root-cause cluster only when the verifier confirms
a normalized stable `rootCauseHint`. Missing or unsuitable hints create singleton
clusters. Cluster identity excludes messages and line hints. The reducer decides
from the complete verified-finding set, then applies ranking and display limits to
the repair details only. These limits cannot hide a blocker from disposition.

Core remains the only lifecycle authority. It owns retries, remediation, waits,
recovery, transitions, and durable attempt state. Runtime and transport failures
propagate to core. A completed malformed verifier response is a distinct blocked
integrity result.

Every terminal attempt that has a frozen review bundle writes one canonical
`review-report.v2` artifact. The report keeps bounded items plus omitted counts,
the first-attempt governor baseline, current growth measurements, and the
governor decision.
The returned artifact reference must match the exact report and attempt. Required
report persistence fails closed. Reports are immutable per attempt; this plugin
does not own a mutable cross-run backlog.

Core supplies the attempt and remediation-cycle counters. Previous immutable
report references are also supplied by core. The review plugin reads the latest
prior report to recover the first completed attempt's baseline. Ordinary retries
do not advance the repair-cycle count. By default, a third repair request,
excessive file or added non-test LOC growth, or an ownership crossing requires
orchestration. Invalid governor state blocks safely.

Run package-local deterministic tests with:

```bash
npm test
```

## Review completion and revalidation boundaries

Selected audit jobs must pass result preflight before a completion report is
built. Malformed output, foreign evidence and a further context request after
selected expansion are incomplete. Deliberately deferred context expansion
remains distinct. Only certified terminal results (or valid initial context
requests) are checkpointed and reused; cache evidence identity v2 invalidates
older records that did not enforce this condition.

Repository and revalidation profiles use canonical relative prefixes without a
terminal slash. Path input accepts a terminal slash and normalizes it; internal
empty, `.`/`..`, absolute, colon, backslash and control-character paths are rejected.
The only repository-root sentinel is `.`. Plugin dependency radius 0/1 retains
its existing scope while using the receiver's canonical path form.

Revalidation rejects an in-scope finding set larger than maxVerificationJobs
before dispatch. Retry admissions share maxRetryAttemptsPerPhase, synchronously
reserved across concurrent jobs. Invalid completed output and input/proof errors
are integrity blocks; storage/transport errors propagate to Core. An uncertain
external effect is never retried locally: Core retains reconciliation authority.
Missing storage can reach Core's bounded retry policy; an uncertain transport
outcome may require reconciliation instead. Revalidation does not promise
per-finding resume checkpoints; successful repository-audit jobs do.

Policy profile names are stable identifiers, including authorized custom
settings names, in both policy and report contracts. Runtime budget enforcement
uses the pure JavaScript js-tiktoken API with the existing o200k_base/cl100k_base
encodings; token thresholds, reservations and special-token rejection are
unchanged. The privileged runtime adapter retains its native tokenizer.

Simplification facts use the existing lexical scanner to remove comments,
strings, templates and regex contents before recognizing bounded JS/TS forwarding
function syntax. Source positions distinguish same-name local wrappers. Symbols
support legal `$`/`_` names independently of stable fact IDs. Default/rest-argument
wrappers are not certified as pure forwarding. JSX/TSX is explicitly omitted with
an unsupported-source diagnostic because this scanner does not parse JSX text.
Producer truncation includes omittedFactCount and remains visible in mining
diagnostics; produced evidence is checked against its own parser before use.
This is advisory syntax evidence, not whole-program semantic equivalence proof.
