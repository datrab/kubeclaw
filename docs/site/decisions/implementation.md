# Implementation decisions and evidence boundaries

Status: current decisions with individual approval and implementation states
Audience: maintainers and architecture readers
Owner: platform maintainers
Evidence: skills/nova/core/execution/engine-snapshots.ts; skills/worker/core/worker/native-worker-launcher.c; cmd/buster-namespace-controller/demo-product.go
Applies to: source revision `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`
Last verified: 2026-09-17; no new runtime acceptance result is available

## Derived Record Accountability

These records refine accepted architecture with later implementation evidence.
They do not create approval when the source records only implementation. Each
row makes the shared fields explicit; the sections below give the detailed rule
and linked source.

| Decision group | Context and decision | Alternatives and reason | Consequences | Approval | Implementation and verification | Supersession |
| --- | --- | --- | --- | --- | --- | --- |
| Repository history | Integrate reviewed changes into the primary history and prove remote reachability before deleting a source ref. | A permanent backup branch, blind replacement, and deletion inferred from an incomplete checkout are rejected. | Integration needs an explicit content and ancestry comparison. | This is an established recovery method; no new approval is claimed here. | Repository procedures and retained history are the proof boundary. This page authorizes no branch deletion. | It refines repository recovery without changing the single-runtime decision in ADR-004. |
| Versioned JSON | Select explicit encoding profiles and preserve each historical producer's bytes and authority. | Silent normalization and one simultaneous rewrite of all historical records are rejected. | Consumers must select and verify the correct profile. Historical compatibility remains explicit. | D12 governs local closure. No new product approval is inferred from matching source. | SDK and consumer source were inspected. Whole-retention work remains separate. | Explicit producer profiles replace the broad initial epoch proposal. They do not rewrite old identities. |
| Native admission | Admit native work before execution and retain one accountable scope through termination and cleanup. | Delayed Node admission, shared-process CPU accounting, and arbitrary caller-selected launch identity are rejected. | The trusted boundary becomes stricter and needs a capable host or bounded broker. | D13, D14, and D16 retain their recorded authority. The broker recommendation is not a new exposed user choice. | Prism has a native path. Complete Buster integration and deployed containment remain open. | Native per-attempt accounting replaces Prism's shared-process CPU method. |
| Human decisions | Bind a signed human action to the exact lease, source, revision, expiry, actor, and reason. | ServiceAccount identity alone and replay that changes content are rejected. | Lost successful responses can be replayed safely. Expired or deleting leases stay closed. | D02 and D06 retain the accepted human-authority and lifetime rules. | Controller source and local tests exist. Authenticated end-to-end delivery remains a live gate. | The signed extend path replaces the earlier missing-controller-extension statement. |
| Reliable delivery | Preserve frozen identities and reconcile uncertain effects from receipts before retry. | Current configuration substitution, blind replay, and detached cleanup are rejected. | Recovery retains more evidence and can stop for explicit reconciliation. | These rules refine ADR-001, ADR-009, ADR-011, and D08; they are not new approval events. | Local crash, compiler, report, and receipt tests cover bounded paths. The complete user journey and whole-store retention remain open. | The refinements qualify earlier broad promises without creating a second lifecycle authority. |

## Preserve history without retaining parallel implementations

Integrate intended changes into the primary branch even when live acceptance remains open.
Inspect each conflict and keep the current intended implementation. Git parents preserve the integrated history.
A backup branch is not proof that its changes are integrated.

Before remote deletion, read the current ref SHA and prove reachability from published main.
Use the expected SHA when deleting a ref. Do not remove dirty worktrees as part of that operation.
This decision does not authorize branch deletion or claim new integration acceptance.

This approach preserves evidence without keeping old execution paths as permanent fallbacks.
It requires an explicit content comparison before integration. Blindly replacing the primary branch with an older branch would lose later corrections.

A partial local checkout must never stand in for the complete remote tree.
Apply only reviewed file changes on the known remote tree and compare all resulting paths and modes.
A missing local file is not an instruction to delete the remote file.
This safeguard is part of the established recovery method. The single-runtime rule remains in ADR-004.

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
SDK portability is locally closed under D12. Historical stale subrecords do not reopen it.
The separate whole-retention gap remains open.

Asynchronous Git reads must be awaited by callers, adapters, and tests.
An output file name is not proof of success. Read the command result and its final assertion.

- [evidence-file-partition.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/lint/src/engine/evidence-file-partition.ts)

## Native admission, fixture lifetime, and CPU measurement

[D13, D14, and D16](runtime-and-operations.md#d13) remain the accepted task-unit, retained-fixture, and host-pool decisions.
Admission must precede workload execution and restriction changes.
The workload must not receive cgroup migration descriptors or permission to escape its allocated scope.
A trusted native handshake, not a delayed Node callback, establishes this order.
Final counters and proved termination must precede scope release.
A terminal metadata record alone cannot prove that descendants have stopped.

The initial shared-process Prism CPU method charged unrelated concurrent work.
It is superseded by the native per-attempt production path and its final kernel observations.
Positive delegated-cgroup and deployed-service proof remain part of [worker acceptance](../status/acceptance.md#workers-kernel-limits-supervisors-and-cancellation) and [Prism service acceptance](../status/acceptance.md#prism-database-jobs-sessions-and-resources).

Buster retains a distinct unresolved integration boundary.
An unprivileged host with no_new_privs cannot acquire a helper's file capabilities for a nested identity switch.
The recorded alternatives are a narrowly authorized in-scope launch broker or a privileged whole Buster host.
The broker is the current source recommendation, but it is not an exposed user choice.
It must keep broker, provider, capability, browser, and report work under the same attempt accounting scope.
Only the trusted engine can hold its control descriptor. Requests cannot select arbitrary identities, executables, or roots.
Failure or uncertain launch state must fence admission and preserve cleanup evidence.
The complete Buster replacement remains blocked by [whole-attempt resource ownership](../status/open-issues.md#capability-work-is-missing-from-the-attempt-budget) and [restarted-job quiescence](../status/open-issues.md#restarted-terminal-jobs-retain-source-workspaces-without-a-durable-quiescence-proof).
Do not expose either recommendation as an implemented public extension contract.

- [worker.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/prism/server/worker.ts)
- [native-worker-launcher.c](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/worker/core/worker/native-worker-launcher.c)

## Controller identity and human product decisions

A controller ServiceAccount can authenticate a service call. It does not prove that a human approved a product or lease extension.
Bind human intent to the actor, run, source, lease UID, current revision, previous expiry, action, and reason.
Preserve the signed decision and exact receipt. The original Ready time remains immutable.
An identical replay must return the stored result; a different concurrent decision must conflict.
An expired or deleting lease cannot be revived by a retry.

The product controller and Control path add signed product decisions and an extend action.
The controller verifies the decision separately from the service token and uses compare-and-swap updates.
Thus, the old missing-controller-extension statement is superseded.
Authenticated end-to-end human ingress and delivery still require [delivery acceptance](../status/acceptance.md#demo-kubernetes-admission-tailnet-and-human-acceptance) and the [complete user journey](../status/acceptance.md#complete-user-journey-and-evidence-backed-final-report).
An administrator-created native fixture is not that human journey.

The source contract has a bounded signed decision window, bounded append-only receipt history, and exact expiry arithmetic.
Native admission, token verification, lost successful PATCH responses, stale cleanup, and controller permissions have distinct evidence scopes.
The original native-service readiness work is locally closed; its broader deployment and product-delivery requirements remain separate.
D02 and D06 retain the accepted human-authority and demo-lifetime rules. This page does not add another approval date.

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
The [complete delivery journey](../status/acceptance.md#complete-user-journey-and-evidence-backed-final-report) and whole-store retention remain open.

- [CHANGELOG.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/e2e/CHANGELOG.md)
