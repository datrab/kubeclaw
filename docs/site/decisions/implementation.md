# Implementation decisions and evidence boundaries

Status: extracted decisions; individual approval and implementation states are stated below
Audience: maintainers and architecture readers
Owner: platform maintainers
Applies to: source revision `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`
Last verified: 2026-09-15; source reconciliation, no new runtime acceptance
Language: English editorial review; full ASD-STE100 verification remains an AP11 gate

## Preserve history without retaining parallel implementations

The recorded September 12 instruction requires integration of all branch updates into main, even when live acceptance remains open.
This replaces the earlier recommendation to retain 190 conflicting branches without integration.
Inspect each conflict and keep the current intended implementation. Git parents preserve the original branch evidence.
A backup of a work-in-progress branch is not proof that its changes are integrated.

Before remote deletion, read the current ref SHA and prove reachability from published main.
Use the expected SHA when deleting a ref. Do not remove dirty worktrees as part of that operation.
The historical totals describe a frozen audit, not today's branch count.
AP04 performs no branch deletion or new integration acceptance.

This approach preserves evidence without keeping old execution paths as permanent fallbacks.
It costs an explicit content review before integration. Blindly replacing main with an older branch would lose later corrections.
The user's instruction is source-recorded; this extraction does not create another branch policy.

A partial local checkout must never stand in for the complete remote tree.
Apply only reviewed file changes on the known remote tree and compare all resulting paths and modes.
A missing local file is not an instruction to delete the remote file.
The September 14 recovery report documents this safeguard; it is an established recovery method, not a separately dated architecture approval.

The fallback-cleanup ledger contains only a header. It proves neither complete cleanup nor an active fallback.
Its AP04 disposition is no durable decision. The single-runtime rule remains in ADR-004.

- [README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/branch-cleanup-20260911/README.md)
- [README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/branch-cleanup-20260912/README.md)
- [retained-branches.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/branch-cleanup-20260912/retained-branches.md)
- [resume-20260914-gitops-handoff.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/resume-20260914-gitops-handoff.md)
- [fallback-cleanup-ledger.tsv](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/decisions/fallback-cleanup-ledger.tsv)

## Versioned JSON and asynchronous consumers

JSON bytes, semantic identity, and producer authority are different properties.
The SDK uses explicit encoding profiles so new writes can have stable identity across locales.
Historical readers keep their original version and bytes. Do not normalize old records and silently recalculate their digests.
Do not describe this as universal RFC 8785 compatibility or Unicode normalization.

New product entrypoints explicitly select source, report, review, and Delivery-v3 modes.
A legacy API call without that mode still selects its historical format.
The corrected SDK test selects the same mode as the real product consumer.
Equal bytes from a different producer do not authorize a read or acknowledgement.
Raw journal and signature domains retain their own version rules.

The broad initial epoch proposal is refined by these explicit producer/reader profiles.
This avoids a simultaneous rewrite of all historical records, but every consumer must verify the correct profile and provenance.
PCR-SDK-001 is locally closed under D12. Historical stale subrecords do not reopen it.
The separate whole-retention gap remains PCR-OBS-002.

Asynchronous Git reads must be awaited by callers, adapters, and tests.
The historical lint-integration-fixed log still ends with a failed assertion against a Promise.
Its name is not proof of success. These logs supply integration evidence for the existing bounded-execution rule, not a new accepted decision.

- [sdk-portability-plan.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/sdk-portability-plan.md)
- [pr6-sdk-local-verification.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-sdk-local-verification.md)
- [evidence-file-partition.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/lint/src/engine/evidence-file-partition.ts)
- [lint-integration-fixed.log](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/branch-cleanup-20260912/validation/lint-integration-fixed.log)

## Native admission, fixture lifetime, and CPU measurement

[D13, D14, and D16](runtime-and-operations.md#d13) remain the accepted task-unit, retained-fixture, and host-pool decisions.
Admission must precede workload execution and restriction changes.
The workload must not receive cgroup migration descriptors or permission to escape its allocated scope.
A trusted native handshake, not a delayed Node callback, establishes this order.
Final counters and proved termination must precede scope release.
A terminal metadata record alone cannot prove that descendants have stopped.

The initial shared-process Prism CPU method charged unrelated concurrent work.
It is superseded by the native per-attempt production path and its final kernel observations.
The historical initial run passed 21 tests and failed to load one file; the corrected file then passed three tests.
Keep those results separate. Positive delegated-cgroup and deployed-service proof remain G03/G07 work.

Buster retains a distinct unresolved integration boundary.
An unprivileged host with no_new_privs cannot acquire a helper's file capabilities for a nested identity switch.
The recorded alternatives are a narrowly authorized in-scope launch broker or a privileged whole Buster host.
The broker is recommended in the source, not recorded as an accepted user choice.
It must keep broker, provider, capability, browser, and report work under the same attempt accounting scope.
Only the trusted engine can hold its control descriptor. Requests cannot select arbitrary identities, executables, or roots.
Failure or uncertain launch state must fence admission and preserve cleanup evidence.
The complete Buster replacement remains [PCR-BUSTER-ENGINE-001](../status/open-issues.md#pcr-buster-engine-001) and [004](../status/open-issues.md#pcr-buster-engine-004).
Do not expose either recommendation as an implemented public extension contract.

- [attempt-owner-launcher-admission-design.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/attempt-owner-launcher-admission-design.md)
- [pr6-buster-launch-authority-decision.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-buster-launch-authority-decision.md)
- [pr6-prism-native-local-closure.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-prism-native-local-closure.md)
- [worker.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/prism/server/worker.ts)
- [native-worker-launcher.c](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/worker/core/worker/native-worker-launcher.c)

## Controller identity and human product decisions

A controller ServiceAccount can authenticate a service call. It does not prove that a human approved a product or lease extension.
Bind human intent to the actor, run, source, lease UID, current revision, previous expiry, action, and reason.
Preserve the signed decision and exact receipt. The original Ready time remains immutable.
An identical replay must return the stored result; a different concurrent decision must conflict.
An expired or deleting lease cannot be revived by a retry.

The older demo-retention design described extension ingress as missing.
Later product-controller and Control work adds signed product decisions and an extend action.
The controller verifies the decision separately from the service token and uses compare-and-swap updates.
Thus, the old missing-controller-extension statement is superseded.
Authenticated end-to-end human ingress and delivery still require G10/G14 acceptance.
An administrator-created native fixture is not that human journey.

The source contract has a bounded signed decision window, bounded append-only receipt history, and exact expiry arithmetic.
Native admission, token verification, lost successful PATCH responses, stale cleanup, and controller permissions have distinct evidence scopes.
The original IFR-18-001 is locally closed; its broader deployment and product-delivery requirements remain separate.
D02/D06 retain the accepted human-authority and demo-lifetime rules. This extraction does not add another approval date.

- [demo-retention-policy-design.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/demo-retention-policy-design.md)
- [wave48-product-controller.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave48-product-controller.md)
- [run6-coupled-root-review.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/run6-coupled-root-review.md)
- [demo-product.go](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/cmd/buster-namespace-controller/demo-product.go)
- [demo-product-native_test.go](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/cmd/buster-namespace-controller/demo-product-native_test.go)

## Reliability and source-bound delivery

Keep the frozen graph, registry, configuration, and source identity through recovery.
An uncertain external effect requires inspection of its actual receipt before retry.
An uncertain worktree must remain available for reconciliation.
Do not substitute a new graph or current package bytes for an unreadable historical snapshot.

Repair handoff retains bounded evidence: 32 artifacts and a 256 KiB inline limit in the recorded design.
Large evidence uses artifacts. Source, review, lint, and quality results must refer to the same delivered candidate.
A fixture expiry can cancel dependent work; a retained journal must still preserve the cause.
Storage admission is an aggregate reservation, not a guarantee that physical disk bytes are preallocated.
Observers distinguish exhausted delivery from uncertain delivery. A removed required audit observer must not reappear through documentation.

These are refinements of ADR-001/009/011 and D08, not new independent lifecycle policies.
Local crash, compiler, report, and receipt tests establish their actual path only.
The complete delivery journey remains G14 and whole-store retention remains PCR-OBS-002.

- [pipeline-reliability-remediation.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/pipeline-reliability-remediation.md)
- [CHANGELOG.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/e2e/CHANGELOG.md)
