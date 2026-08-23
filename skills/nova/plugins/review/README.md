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

Repository-audit planning uses `o200k_base` token counts for the complete serialized
input envelope. It reports byte and token values separately. It enforces per-call
bytes, per-call input, model context with reserved output, separate initial,
expansion, and verification input budgets, a combined hard ceiling, estimated
cost, wall time, and actual retry consumption before dispatch. Prompt accounting
uses the shared runtime envelope plus a bounded result-path reserve. The OpenClaw
runtime adapter repeats the check on the exact final prompt that it sends.

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
