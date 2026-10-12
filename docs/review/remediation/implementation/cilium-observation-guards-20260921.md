# Cilium observation guards — 2026-09-21

Pre-implementation acceptance criteria (bounded local C2 guard slice):

| Case | Required result |
| --- | --- |
| CG1 | Install requires a JSON object with exactly one node whose `spec.unschedulable` is the boolean `true`; missing, malformed or merely truthy values stop before mutation. |
| CG2 | CRI list requires an explicit array; every sandbox has a nonempty unique string ID and a recognized state. Only explicit `SANDBOX_NOTREADY` can bypass namespace inspection. |
| CG3 | Ready sandbox inspection must identify that same sandbox, report `SANDBOX_READY`, and explicitly report host-network mode `NODE` or integer `2`. Unknown, inconsistent or ordinary networking stops before mutation. |
| CG4 | Cleanup verification must reject absent/malformed endpoint lists and missing, invalid or unequal revision observations; no inferred zero revision. |
| CG5 | Run original shell orchestration against explicitly fake CLI fixtures: accepted observations proceed, rejected observations issue no mutating commands, cleanup failures delete no policy, and neither script creates an acceptance marker or uncordons. |
| CG6 | Runbook documents enforced observations, operator responsibilities and fixture-only evidence limits; fresh independent review remains required. |

No host, cluster, dataplane or connectivity action is authorized or performed by this slice. Synthetic CLI fixtures demonstrate orchestration guards only, not real Cilium enforcement or C2 completion.

Implementation: `deploy-cilium.sh` now invokes the small read-only
`verify-cilium-install-preflight.py` helper in place of inline assertions and the
missing-items fallback. Explicit exceptions remain active under Python optimized
execution. The migration script continues to call the original policy verifier;
that verifier now requires nonempty endpoint observations and explicit integer
revisions, without changing source-policy comparison or the deletion allowlist.
Neither shell script creates an acceptance marker or uncordons the node.

Compatibility was checked against primary versioned sources, not just the fake
fixtures: the recorded AX41 K3s `v1.36.4+k3s1` selects cri-tools
`v1.36.0-k3s1`; its real list/status serializers use protobuf JSON with default
values emitted and named enums. Explicit empty `items: []` is accepted; missing
items, missing state and numeric state values are rejected. Host network `NODE`
and integer `2` are accepted, but boolean values, floating-point `2.0` and string
`"2"` are not. Source snapshots and versioned links are retained in the evidence
folder and runbook. This does not establish the actual version on a live host.

Local validation uses Python 3 with PyYAML 6.0.3 in
`node_modules/.cache/cilium-guard-venv`, Bash and original shell scripts. Run:

```sh
PATH="$PWD/node_modules/.cache/cilium-guard-venv/bin:$PATH" \
  python3 scripts/tests/cilium-observation-guards.test.py
```

The fake CLIs are explicit boundary fixtures; no kubectl, Helm or k3s command is
sent to a host or cluster. Five unittest methods exercise 48 complete shell
invocations across positive and negative observations. The first run passed;
the fixture was then corrected to consume namespace YAML on stdin, avoiding a
possible artificial broken pipe in the `create | apply` pipeline. No production
behavior was changed for that fixture correction. Final execution results are
recorded below. Bash syntax and Python compilation checks passed.

Two isolated negative controls use the same real orchestration: restoring the
HEAD preflight admits incomplete/unknown CRI observations; restoring zero as a
missing revision fallback admits unobserved revisions. The controls fail on
behavior assertions, not setup errors. No production source was mutated.

The runbook documents exact accepted observations, operator quiescence,
point-in-time/race limits, real version verification, cleanup gates and the
remaining actual networking/recovery acceptance work. CG1–CG6 are local guard
criteria only. The subsequent
[independent review](independent-cilium-observation-20260921.md) accepts CG1–CG6
with additional adversarial cases and exact retained source snapshots;
IFR-02-001/C2 remains open.

Final results: **5/5 test methods, all 48 shell invocation cases passed**, no
skips (`docs/review/evidence/cilium-observation-guards-20260921/tests-final.txt`,
23.357 seconds). With the corrected fake stdin handling, both negative controls
still fail: legacy preflight **8 assertion failures, zero errors**; missing-revision
zero default **1 assertion failure, zero errors** (`mutants-final.txt` and named
raw logs in that directory). `source-sha256.json` binds the inspected scripts,
test fixture and operator runbook. Earlier execution output is retained as
historical evidence, not relabeled as final.
