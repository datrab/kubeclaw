# Evidence and Acceptance Policy

Status: current decision
Audience: operator, maintainer, architecture reader
Owner: platform-maintainers
Evidence: scripts/docs-status.mjs; tests/verification/contracts/check-production-receipt-attestation.mjs
Applies to: implementation status and operational acceptance
Last verified: 2026-09-17

## Purpose

KubeClaw uses different evidence for different claims. Static implementation evidence can
confirm that code exists. A local test can confirm behavior in its test scope.
Only a live exercise can confirm behavior in the selected running environment.

This separation prevents a passing unit test from becoming an unsupported claim
about Kubernetes, storage, networking, credentials, or a human workflow.

## D12 — Accepted Local Completion Policy

A technical finding can reach local completion when all of these conditions hold:

1. The implemented change addresses the complete stated scope.
2. The relevant source and contract checks pass.
3. A focused regression test proves the corrected behavior.
4. Negative cases prove that the previous unsafe behavior cannot return silently.
5. The evidence identifies the exact source revision and test environment.
6. Remaining environment proof moves to an explicit live-acceptance gate.

Local completion does not assert that a cluster, external service, browser,
registry, Tailnet route, or human delivery path works in production.

### Decision authority and reevaluation

**Reason and benefit:** distinguish complete local correction from environment proof without
claiming that unexecuted live checks passed. **Cost and consequence:** the original
revision-bound local evidence and the separate live gates must both remain visible.
Local completion cannot replace product or deployment acceptance.

**Status:** the owner explicitly accepted this local-completion policy on 2026-09-12.
It replaces the earlier requirement to run every live, cluster, and receiving check
before local finding closure, not runtime safety gates or D02 product acceptance.
**Implementation and verification:** apply the six conditions above to each individual
finding; the policy itself supplies no blanket completed-implementation or live result.
**Reevaluation condition:** unknown: the original decision does not establish a
condition for replacing this local/live separation. An unexecuted live check is a
remaining proof obligation, not approval to change the policy.

Source: [original D12 authority](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme).

## Evidence Levels

| Level | What it proves | What it does not prove |
| --- | --- | --- |
| Source-backed | The named implementation or configuration exists at the cited revision | That the path executed successfully |
| Locally verified | The stated command passed in the recorded local environment | Behavior that needs unavailable external systems |
| Integration verified | Connected components passed with the stated real dependencies | Production deployment or human acceptance |
| Live accepted | The complete procedure passed in the selected target environment | Future revisions or other environments |
| Human accepted | An authorized person accepted the exact delivered result | Technical correctness of a different result |

## Required Record

Every verification record must identify:

- the claim and its scope;
- the exact source revision;
- the command or procedure;
- the environment and required external systems;
- executed, skipped, failed, and blocked cases;
- unchanged result artifacts and their digests;
- the person or system that made the decision; and
- cleanup and retained state after mutating work.

Do not convert a blocked or skipped test into a pass. Preserve failed attempts
beside later successful runs. A retry proves only the later execution.

## Current Status and Live Gates

Use [Current Platform Status](../status/current.md) for the implemented boundary.
Use [Open Implementation Work](../status/open-issues.md) for known technical gaps.
Use [Operational and Live Acceptance](../status/acceptance.md) for environment
procedures that remain unexecuted.
