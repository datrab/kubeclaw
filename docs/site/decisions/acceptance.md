# Local completion and finding provenance

Status: accepted — D12 confirmed by the requester on 2026-09-12

Audience: operators, developers and agents

Owner: platform operator

Evidence: .github/workflows/remediation-native.yaml; tests/verification/contracts/check-production-receipt-attestation.mjs

Applies to: 154 original findings and five separate integration findings

Last verified: 2026-09-15 — documentation/source reconciliation; no new test execution

This page preserves the identity and local disposition of the **154 original findings** and **five additional integration findings**. It is a compact provenance index. Maintain current incomplete implementations in the [open issue register](../status/open-issues.md) and outstanding operational checks in the [acceptance plan](../status/acceptance.md). Local completion does not approve a running system.

## D12 — accepted local completion policy

**Authority: explicitly confirmed by the requester on 2026-09-12.** This page carries the existing decision forward; AP04 does not grant a new approval.

Fully corrected code with sufficient local test coverage is **locally verified and complete for the remediation assignment**. Missing implementation and insufficient local coverage remain open. The requester performs the separate live, cluster and GitHub Actions acceptance checks at the end, after open-sourcing. Unexecuted or skipped tests never become passes.

D12 replaces the earlier requirement to run every operational check before closing a local finding. It changes neither runtime security gates nor D02: a technically ready demo requires explicit human acceptance of the **exact tested version**. D12 does not authorize deployments, messages or bypassing a prohibited action.

[Original D12 decision](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme).

## Reading the index

The pinned register contains **141 locally verified**, **2 implemented but incomplete**, **3 in progress** and **8 open** original findings. Five additional integration findings are locally verified separately. GitHub issue #7, the later GitOps revision mismatch and the preference-decay approval conflict are outside the original 154. Historical 39/47/84-item working sets are overlapping checkpoints, not additional findings.

Each row preserves ID, local disposition, implementation reference and one selected documented evidence source. The [pinned original register](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) retains the full original finding text, previous evidence and its limitations. A commit or report is provenance, not a claim that AP04 reran its tests. An implementation reference for an incomplete finding identifies an intermediate change.

Evidence links are pinned to `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c` or the immutable reference already recorded in the source. They remain useful after historical review files are removed from the working tree. This page does not reproduce the historical raw logs or the full register.

## WP01 — Contracts, SDK and package registration

Operational evidence: [G01](../status/acceptance.md#g01). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PCR-AGENT-CONTRACT-001 | Locally verified | [f22afee9](https://github.com/datrab/kubeclaw/commit/f22afee989872e9c999eee6499b1a0ecdafd882e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts-2.md) |
| PCR-CONTRACT-PLUGIN-001 | Locally verified | [b39d0e16](https://github.com/datrab/kubeclaw/commit/b39d0e16c171b3be237b3288beb5a6dae5dc332d) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/registry.md) |
| PCR-PACKAGES-001 | Locally verified | [b39d0e16](https://github.com/datrab/kubeclaw/commit/b39d0e16c171b3be237b3288beb5a6dae5dc332d) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/registry.md) |
| PCR-PRISM-CONTRACT-001 | Locally verified | [f22afee9](https://github.com/datrab/kubeclaw/commit/f22afee989872e9c999eee6499b1a0ecdafd882e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts-2.md) |
| PCR-PRISM-CONTRACT-002 | Locally verified | [f22afee9](https://github.com/datrab/kubeclaw/commit/f22afee989872e9c999eee6499b1a0ecdafd882e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts-2.md) |
| PCR-PROMPT-001 | Locally verified | [b85b4c18](https://github.com/datrab/kubeclaw/commit/b85b4c18fedcfb5a509295c082d59aab631b0617) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts.md) |
| PCR-REGISTRY-001 | Locally verified | [b39d0e16](https://github.com/datrab/kubeclaw/commit/b39d0e16c171b3be237b3288beb5a6dae5dc332d) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/registry.md) |
| PCR-REGISTRY-002 | Locally verified | [b39d0e16](https://github.com/datrab/kubeclaw/commit/b39d0e16c171b3be237b3288beb5a6dae5dc332d) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/registry.md) |
| PCR-SDK-001 | Locally verified | [b85b4c18](https://github.com/datrab/kubeclaw/commit/b85b4c18fedcfb5a509295c082d59aab631b0617) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-sdk-local-verification.md) |
| PCR-SDK-002 | Locally verified | [b85b4c18](https://github.com/datrab/kubeclaw/commit/b85b4c18fedcfb5a509295c082d59aab631b0617) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts.md) |
| PCR-TELEMETRY-CONTRACT-001 | Locally verified | [9e12ab76](https://github.com/datrab/kubeclaw/commit/9e12ab76d085d1d050fb4ad08b55969ede4407cf) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/telemetry.md) |
| PCR-TELEMETRY-CONTRACT-002 | Locally verified | [9e12ab76](https://github.com/datrab/kubeclaw/commit/9e12ab76d085d1d050fb4ad08b55969ede4407cf) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/telemetry.md) |
| PCR-TEST-CONTRACT-001 | Locally verified | [f22afee9](https://github.com/datrab/kubeclaw/commit/f22afee989872e9c999eee6499b1a0ecdafd882e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts-2.md) |
| PCR-TEST-CONTRACT-002 | Locally verified | [f22afee9](https://github.com/datrab/kubeclaw/commit/f22afee989872e9c999eee6499b1a0ecdafd882e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/contracts-2.md) |

## WP02 — Durable state, locks and recovery

Operational evidence: [G02](../status/acceptance.md#g02). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PCR-EFFECT-001 | Locally verified | [8711c9d1](https://github.com/datrab/kubeclaw/commit/8711c9d1ac0e0e12257629505643dee5ff5ee0a4) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/effects.md) |
| PCR-EXEC-001 | Locally verified | [e5a16848](https://github.com/datrab/kubeclaw/commit/e5a16848eb3287070560af910238774f05541fed) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/recovery.md) |
| PCR-EXEC-002 | Locally verified | [e5a16848](https://github.com/datrab/kubeclaw/commit/e5a16848eb3287070560af910238774f05541fed) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/recovery.md) |
| PCR-OBS-001 | Locally verified | [9162c927](https://github.com/datrab/kubeclaw/commit/9162c9272748246343febdd00cf494cd2e9a198f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/observability-replay.md) |
| PCR-STATE-001 | Locally verified | [4cd09442](https://github.com/datrab/kubeclaw/commit/4cd09442ad34e4927d82b59c8681bb7ad10cf31b) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/state.md) |
| PCR-STATE-002 | Locally verified | [4cd09442](https://github.com/datrab/kubeclaw/commit/4cd09442ad34e4927d82b59c8681bb7ad10cf31b) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/state.md) |

## WP03 — Workers and complete cancellation

Operational evidence: [G03](../status/acceptance.md#g03). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PCR-BUSTER-ENGINE-001 | In progress | No completion commit | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/attempt-resource-accountability-boundary.md) |
| PCR-BUSTER-ENGINE-002 | Locally verified | [aa10f3eb](https://github.com/datrab/kubeclaw/commit/aa10f3eb7fac33769f24fc3d41c628756e895d7a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/buster-engine.md) |
| PCR-BUSTER-ENGINE-003 | Locally verified | [aa10f3eb](https://github.com/datrab/kubeclaw/commit/aa10f3eb7fac33769f24fc3d41c628756e895d7a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/buster-engine.md) |
| PCR-BUSTER-ENGINE-004 | Implemented; incomplete | [550eb948](https://github.com/datrab/kubeclaw/commit/550eb948ec8766b38e8c8d4ccb88a1fdab28e61a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-COMMAND-001 | Locally verified | [aa10f3eb](https://github.com/datrab/kubeclaw/commit/aa10f3eb7fac33769f24fc3d41c628756e895d7a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/buster-engine.md) |
| PCR-ISOLATION-001 | Locally verified | [8feafb7f](https://github.com/datrab/kubeclaw/commit/8feafb7fb9ae8a1425fe9439dae668f07b551d70) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/isolation.md) |
| PCR-ISOLATION-002 | Locally verified | [8feafb7f](https://github.com/datrab/kubeclaw/commit/8feafb7fb9ae8a1425fe9439dae668f07b551d70) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-ISOLATION-003 | Locally verified | [8feafb7f](https://github.com/datrab/kubeclaw/commit/8feafb7fb9ae8a1425fe9439dae668f07b551d70) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/isolation.md) |
| PCR-ISOLATION-004 | Locally verified | [8feafb7f](https://github.com/datrab/kubeclaw/commit/8feafb7fb9ae8a1425fe9439dae668f07b551d70) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-KUBERNETES-FIXTURE-002 | Locally verified | [aa10f3eb](https://github.com/datrab/kubeclaw/commit/aa10f3eb7fac33769f24fc3d41c628756e895d7a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/buster-engine.md) |
| PCR-NETWORK-001 | Locally verified | [76bb9fd7](https://github.com/datrab/kubeclaw/commit/76bb9fd75f2f9367a27a48dc67e95b3c76a1c826) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/process-network.md) |
| PCR-NETWORK-002 | Locally verified | [76bb9fd7](https://github.com/datrab/kubeclaw/commit/76bb9fd75f2f9367a27a48dc67e95b3c76a1c826) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/process-network.md) |
| PCR-NOVA-GATE-001 | Locally verified | [508aef31](https://github.com/datrab/kubeclaw/commit/508aef31cbf32218c2f03441f617eccfc7c5d634) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/nova-gate-deadlines.md) |
| PCR-NOVA-GATE-002 | Locally verified | [508aef31](https://github.com/datrab/kubeclaw/commit/508aef31cbf32218c2f03441f617eccfc7c5d634) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/nova-gate-deadlines.md) |
| PCR-NOVA-GATE-003 | Locally verified | [b4e64ce8](https://github.com/datrab/kubeclaw/commit/b4e64ce83ae3ee327f7c7086ba125ca89b026487) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/nova-remote-boundaries.md) |
| PCR-NOVA-GATE-004 | Locally verified | [b4e64ce8](https://github.com/datrab/kubeclaw/commit/b4e64ce83ae3ee327f7c7086ba125ca89b026487) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/nova-remote-boundaries.md) |
| PCR-NOVA-GATE-005 | Locally verified | [508aef31](https://github.com/datrab/kubeclaw/commit/508aef31cbf32218c2f03441f617eccfc7c5d634) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-RUNTIME-001 | Locally verified | [6d578189](https://github.com/datrab/kubeclaw/commit/6d5781891c081ed9ba4da03f5f66a8961eb869ce) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave47-root-review.md) |
| PCR-WORKER-001 | Locally verified | [0fdea5e1](https://github.com/datrab/kubeclaw/commit/0fdea5e17be4ce19c0fe0621f382a4ad30728580) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/worker-deadline.md) |

## WP04 — Approvals, repair budgets and escalation

Operational evidence: [G04](../status/acceptance.md#g04). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PATH-T04-001 | Locally verified | [dda66cc5](https://github.com/datrab/kubeclaw/commit/dda66cc588d9aec61de0a695f6e5b312d3427ab4) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/approval-source-binding.md) |
| PATH-T04-002 | Locally verified | [e5d4079f](https://github.com/datrab/kubeclaw/commit/e5d4079f997f2fba0858aaa181f093e3178ad7fe) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-risk-and-registry.md) |
| PATH-T04-003 | Locally verified | [36d13117](https://github.com/datrab/kubeclaw/commit/36d131179bd0bd9c0e706d404077124eac3717ec) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/approval-invalidation.md) |
| PCR-APPROVAL-001 | Locally verified | [36d13117](https://github.com/datrab/kubeclaw/commit/36d131179bd0bd9c0e706d404077124eac3717ec) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/approval-invalidation.md) |
| PTR-T05-001 | Locally verified | [4fb4e50f](https://github.com/datrab/kubeclaw/commit/4fb4e50fa8ec59437e5f372d202aa692d9d6252a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/nova-repair-budget.md) |

## WP05 — Forge workspaces and Git integration

Operational evidence: [G05](../status/acceptance.md#g05). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PATH-T07-001 | Locally verified | [700d9295](https://github.com/datrab/kubeclaw/commit/700d92958fff206b325ef1ecccc6e9cca0bb9bca) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/forge-workspace.md) |
| PCR-GIT-001 | Locally verified | [4301b03b](https://github.com/datrab/kubeclaw/commit/4301b03bcdd8d06dafd45414bd3e2c7ecf164928) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/git-repository.md) |
| PCR-IMPLEMENTATION-001 | Locally verified | [700d9295](https://github.com/datrab/kubeclaw/commit/700d92958fff206b325ef1ecccc6e9cca0bb9bca) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/forge-workspace.md) |
| PCR-REPOSITORY-001 | Locally verified | [4301b03b](https://github.com/datrab/kubeclaw/commit/4301b03bcdd8d06dafd45414bd3e2c7ecf164928) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/git-repository.md) |
| T06-F01 | Locally verified | [700d9295](https://github.com/datrab/kubeclaw/commit/700d92958fff206b325ef1ecccc6e9cca0bb9bca) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/forge-workspace.md) |

## WP06 — Mandatory quality checks and coverage

Operational evidence: [G06](../status/acceptance.md#g06). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PATH-T11-001 | Locally verified | [9db5fc8e](https://github.com/datrab/kubeclaw/commit/9db5fc8ec48fc20e4d5bff7d91cf88f57d2f1251) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PATH-T11-002 | Locally verified | [0fb07585](https://github.com/datrab/kubeclaw/commit/0fb075858bf78b2b87b0429f64be6a3bdba80981) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave47-root-review.md) |
| PATH-T13-001 | Locally verified | [0fb07585](https://github.com/datrab/kubeclaw/commit/0fb075858bf78b2b87b0429f64be6a3bdba80981) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-APIFLOW-001 | Locally verified | [42a56fc0](https://github.com/datrab/kubeclaw/commit/42a56fc06b7d347dd8ada01d51475bbf4b1c1041) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/test-provider-semantics.md) |
| PCR-CONTAINER-BUILD-001 | Locally verified | [5323654a](https://github.com/datrab/kubeclaw/commit/5323654a94d8818aabf88e61db133ca7a182f438) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-CONTAINER-BUILD-002 | Locally verified | [5323654a](https://github.com/datrab/kubeclaw/commit/5323654a94d8818aabf88e61db133ca7a182f438) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-DELIVERY-001 | Locally verified | [42a56fc0](https://github.com/datrab/kubeclaw/commit/42a56fc06b7d347dd8ada01d51475bbf4b1c1041) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/test-provider-semantics.md) |
| PCR-DIRECT-COMMAND-001 | Locally verified | [5323654a](https://github.com/datrab/kubeclaw/commit/5323654a94d8818aabf88e61db133ca7a182f438) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-HTTP-001 | Locally verified | [42a56fc0](https://github.com/datrab/kubeclaw/commit/42a56fc06b7d347dd8ada01d51475bbf4b1c1041) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/test-provider-semantics.md) |
| PCR-JUNIT-001 | Locally verified | [42a56fc0](https://github.com/datrab/kubeclaw/commit/42a56fc06b7d347dd8ada01d51475bbf4b1c1041) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/test-provider-semantics.md) |
| PCR-LINT-001 | Locally verified | [82902a19](https://github.com/datrab/kubeclaw/commit/82902a198229488b84e0f6f9dd421104aad5209e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/lint.md) |
| PCR-LINT-002 | Locally verified | [82902a19](https://github.com/datrab/kubeclaw/commit/82902a198229488b84e0f6f9dd421104aad5209e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/lint.md) |
| PCR-LINT-003 | Locally verified | [82902a19](https://github.com/datrab/kubeclaw/commit/82902a198229488b84e0f6f9dd421104aad5209e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/lint.md) |
| PCR-OPENAPI-001 | Locally verified | [42a56fc0](https://github.com/datrab/kubeclaw/commit/42a56fc06b7d347dd8ada01d51475bbf4b1c1041) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/test-provider-semantics.md) |
| PCR-OPENAPI-002 | Locally verified | [42a56fc0](https://github.com/datrab/kubeclaw/commit/42a56fc06b7d347dd8ada01d51475bbf4b1c1041) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/test-provider-semantics.md) |
| PCR-REVIEW-AUDIT-001 | Locally verified | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| PCR-REVIEW-AUDIT-002 | Locally verified | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| PCR-REVIEW-AUDIT-003 | Locally verified | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| PCR-REVIEW-AUDIT-004 | Locally verified | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| PCR-REVIEW-POLICY-001 | Locally verified | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| PCR-REVIEW-POLICY-002 | Locally verified | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| PCR-VISUAL-001 | Locally verified | [0765d19b](https://github.com/datrab/kubeclaw/commit/0765d19b76327a14ac735e7d51a121ab1efa3ff3) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |

## WP07 — Prism jobs, persistence and preferences

Operational evidence: [G07](../status/acceptance.md#g07). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PATH-T02-001 | Locally verified | `ac6f673` (historical short reference; not resolvable) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave49-prism-control-independent-review.md) |
| PATH-T02-002 | Locally verified | [d109cfd9](https://github.com/datrab/kubeclaw/commit/d109cfd917514e3cc526135c4df70b98a9f766f0) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PATH-T02-003 | Locally verified | [d109cfd9](https://github.com/datrab/kubeclaw/commit/d109cfd917514e3cc526135c4df70b98a9f766f0) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave47-root-review.md) |
| PCR-PRISM-AGENT-BRIDGE-001 | Locally verified | [06fbf800](https://github.com/datrab/kubeclaw/commit/06fbf800e7070597c5d481bda6e9dad2aedd653e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-AGENT-BRIDGE-002 | Locally verified | [06fbf800](https://github.com/datrab/kubeclaw/commit/06fbf800e7070597c5d481bda6e9dad2aedd653e) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-CONTROL-001 | Locally verified | [a328cfc2](https://github.com/datrab/kubeclaw/commit/a328cfc29c20094a66d826237e4b347f89ba33a9) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-CONTROL-002 | Locally verified | [84b7048c](https://github.com/datrab/kubeclaw/commit/84b7048c41f8f12420daa0ac5e7f383eb4fe5959) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-CORPUS-001 | Locally verified | [5e439420](https://github.com/datrab/kubeclaw/commit/5e4394203f2cfed57a2c404ba045cd1ac8ad9646) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-INGESTION-001 | Locally verified | [e51b6b4a](https://github.com/datrab/kubeclaw/commit/e51b6b4a77ad726ea2dc29d9e94f0692606f670a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/ingestion-service.md) |
| PCR-PRISM-PREFERENCES-001 | Locally verified | [9a3eff16](https://github.com/datrab/kubeclaw/commit/9a3eff16529032b8a166f09894b3490ccebfc590) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-preferences.md) |
| PCR-PRISM-STORAGE-001 | Locally verified | [1bf865b0](https://github.com/datrab/kubeclaw/commit/1bf865b076df2a4722d27c0a4e5f839f452a5a31) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-artifacts.md) |
| PCR-PRISM-WORKER-001 | Locally verified | [da02ba5a](https://github.com/datrab/kubeclaw/commit/da02ba5ae6abe4b11c1addf992df308608eaed1f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-WORKER-002 | Locally verified | [60620e34](https://github.com/datrab/kubeclaw/commit/60620e34cbcfc5cd616fb20c9166d8f9123aa7eb) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-prism-native-local-closure.md) |
| PCR-PRISM-WORKER-003 | Locally verified | [da02ba5a](https://github.com/datrab/kubeclaw/commit/da02ba5ae6abe4b11c1addf992df308608eaed1f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |

## WP08 — Prism domain, editor and rendering

Operational evidence: [G08](../status/acceptance.md#g08). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PCR-PRISM-DOMAIN-001 | Locally verified | [9d651a88](https://github.com/datrab/kubeclaw/commit/9d651a8851b5a0bfa05ffbc03a0fb58e4ac23882) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-domain.md) |
| PCR-PRISM-DOMAIN-002 | Locally verified | [9d651a88](https://github.com/datrab/kubeclaw/commit/9d651a8851b5a0bfa05ffbc03a0fb58e4ac23882) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-domain.md) |
| PCR-PRISM-DOMAIN-003 | Locally verified | [9d651a88](https://github.com/datrab/kubeclaw/commit/9d651a8851b5a0bfa05ffbc03a0fb58e4ac23882) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-domain.md) |
| PCR-PRISM-ENGINE-001 | Locally verified | [da02ba5a](https://github.com/datrab/kubeclaw/commit/da02ba5ae6abe4b11c1addf992df308608eaed1f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-RENDERER-001 | Locally verified | [a5b09cf3](https://github.com/datrab/kubeclaw/commit/a5b09cf32a886deb3205126c9d1eb8ef9fc44f43) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-renderer-studio.md) |
| PCR-PRISM-RENDERER-002 | Locally verified | [a5b09cf3](https://github.com/datrab/kubeclaw/commit/a5b09cf32a886deb3205126c9d1eb8ef9fc44f43) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-STUDIO-001 | Locally verified | [a5b09cf3](https://github.com/datrab/kubeclaw/commit/a5b09cf32a886deb3205126c9d1eb8ef9fc44f43) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/prism-renderer-studio.md) |
| PCR-PRISM-STUDIO-002 | Locally verified | [a5b09cf3](https://github.com/datrab/kubeclaw/commit/a5b09cf32a886deb3205126c9d1eb8ef9fc44f43) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-PRISM-STUDIO-SERVICE-001 | Locally verified | [7df0919a](https://github.com/datrab/kubeclaw/commit/7df0919a6e23d483862f12d8437d412764474406) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/studio-service.md) |

## WP09 — Observability and Clawdeck delivery

Operational evidence: [G09](../status/acceptance.md#g09). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PCR-AGENTSOURCE-001 | Locally verified | [fecd391d](https://github.com/datrab/kubeclaw/commit/fecd391d1af516ee3838f797fb3a96afc81e9cf2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/observer-ingress.md) |
| PCR-HOSTOBSERVER-001 | Locally verified | [fecd391d](https://github.com/datrab/kubeclaw/commit/fecd391d1af516ee3838f797fb3a96afc81e9cf2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/observer-ingress.md) |
| PCR-HOSTOBSERVER-002 | Locally verified | [fecd391d](https://github.com/datrab/kubeclaw/commit/fecd391d1af516ee3838f797fb3a96afc81e9cf2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/observer-ingress.md) |
| PCR-NOTIFY-001 | Locally verified | [0ba92352](https://github.com/datrab/kubeclaw/commit/0ba923525b62faedd78bef3958af50c9e0286d47) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/operator-notification.md) |
| PCR-OBS-002 | Implemented; incomplete | [27315faa](https://github.com/datrab/kubeclaw/commit/27315faad862f71df940ed32bc4e5a98eca72e0d) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-OPERATOR-001 | Locally verified | [0ba92352](https://github.com/datrab/kubeclaw/commit/0ba923525b62faedd78bef3958af50c9e0286d47) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave47-root-review.md) |
| PCR-REDISTRANSPORT-001 | Locally verified | [50b692e1](https://github.com/datrab/kubeclaw/commit/50b692e16f64b84c5ef072ba72ae7f9153631348) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/redis-transport.md) |
| PCR-REDISTRANSPORT-002 | Locally verified | [50b692e1](https://github.com/datrab/kubeclaw/commit/50b692e16f64b84c5ef072ba72ae7f9153631348) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/redis-transport.md) |
| PCR-TELEM-001 | Locally verified | [8a7754b0](https://github.com/datrab/kubeclaw/commit/8a7754b08db32923e7e2809fbce35832c3880c11) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/telemetry-release-identities.md) |
| PCR-TSTORE-001 | Locally verified | [b0301205](https://github.com/datrab/kubeclaw/commit/b0301205076b7914b732f2af42e9fac7895ece4a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/telemetry-store.md) |
| PCR-TSTORE-002 | Locally verified | [b0301205](https://github.com/datrab/kubeclaw/commit/b0301205076b7914b732f2af42e9fac7895ece4a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/telemetry-store.md) |

## WP10 — Demo namespaces, exposure and operator acceptance

Operational evidence: [G10](../status/acceptance.md#g10). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| F-T14-01 | Locally verified | [5ce5bda2](https://github.com/datrab/kubeclaw/commit/5ce5bda2318efff700343ad623c62cfb520e8732) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| F-T14-02 | Locally verified | [5ce5bda2](https://github.com/datrab/kubeclaw/commit/5ce5bda2318efff700343ad623c62cfb520e8732) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| PCR-BUSTER-NS-001 | Locally verified | [9a566c7c](https://github.com/datrab/kubeclaw/commit/9a566c7c884561f1cb17af500fdc842f22bac5fb) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/namespace-broker.md) |
| PCR-BUSTER-NS-002 | Locally verified | [9a566c7c](https://github.com/datrab/kubeclaw/commit/9a566c7c884561f1cb17af500fdc842f22bac5fb) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/namespace-broker.md) |
| PCR-BUSTER-NS-003 | Locally verified | [9a566c7c](https://github.com/datrab/kubeclaw/commit/9a566c7c884561f1cb17af500fdc842f22bac5fb) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/namespace-broker.md) |
| PCR-KUBERNETES-FIXTURE-001 | Locally verified | [9a566c7c](https://github.com/datrab/kubeclaw/commit/9a566c7c884561f1cb17af500fdc842f22bac5fb) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/namespace-broker.md) |
| PCR-TAILSCALE-001 | Locally verified | [02d94751](https://github.com/datrab/kubeclaw/commit/02d94751551defdb633442f1c42689a00d9f7a7f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/tailscale-exposure.md) |
| PCR-TAILSCALE-002 | Locally verified | [02d94751](https://github.com/datrab/kubeclaw/commit/02d94751551defdb633442f1c42689a00d9f7a7f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/tailscale-exposure.md) |

## WP11 — Reproducible builds and release configuration

Operational evidence: [G11](../status/acceptance.md#g11). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| IFR-08-001 | Locally verified | [85178d4a](https://github.com/datrab/kubeclaw/commit/85178d4a16b1bec3bb5634c3799ae50d4cc8cb0a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-08-002 | Locally verified | [e5d4079f](https://github.com/datrab/kubeclaw/commit/e5d4079f997f2fba0858aaa181f093e3178ad7fe) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-risk-and-registry.md) |
| IFR-09-001 | Locally verified | [85178d4a](https://github.com/datrab/kubeclaw/commit/85178d4a16b1bec3bb5634c3799ae50d4cc8cb0a) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-19-001 | Locally verified | [56c205ef](https://github.com/datrab/kubeclaw/commit/56c205ef0b421f40a378dbe94f072f8c5e94aa91) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-19-002 | Locally verified | [941c6cdb](https://github.com/datrab/kubeclaw/commit/941c6cdb632a4900535361228abe77fc4374fc37) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/role-git.md) |
| IFR-21-001 | In progress | [2ed91ef7](https://github.com/datrab/kubeclaw/commit/2ed91ef75e4c18b0a6b95b6d2850739b3c38ebf4) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-runtime-tool-locks.md) |
| IFR-22-001 | Locally verified | [2a9481cd](https://github.com/datrab/kubeclaw/commit/2a9481cd7ae69eaa572eb290bf5ba3fcc2ddde07) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-23-001 | Locally verified | [b577332b](https://github.com/datrab/kubeclaw/commit/b577332be3f9d61735d26c6d24074a861a7450bd) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/release-configuration.md) |
| IFR-24-001 | Locally verified | [8d47764b](https://github.com/datrab/kubeclaw/commit/8d47764b7b276c783f312198d6987b9197e593e4) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-stateful-migration-closure.md) |
| IFR-24-002 | Locally verified | [d02296f7](https://github.com/datrab/kubeclaw/commit/d02296f7a681210b21320d0fc6c43dc61abb25fc) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/wave47-root-review.md) |
| IFR-29-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| PCR-SCAFFOLD-OPS-001 | Locally verified | [56c205ef](https://github.com/datrab/kubeclaw/commit/56c205ef0b421f40a378dbe94f072f8c5e94aa91) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |

## WP12 — Networking, identities and isolation

Operational evidence: [G12](../status/acceptance.md#g12). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| IFR-03-001 | Locally verified | [af15fce0](https://github.com/datrab/kubeclaw/commit/af15fce0aff3e1ea7c07009350d0c950b0612147) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-api-network-contract.md) |
| IFR-03-002 | Locally verified | [905edf06](https://github.com/datrab/kubeclaw/commit/905edf06721b02558b443b676432993c56b201c1) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-private-access.md) |
| IFR-04-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| IFR-07-001 | Locally verified | [fc136fc8](https://github.com/datrab/kubeclaw/commit/fc136fc8d1351f9ef6bccfafa9f63dd55addbce2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-10-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| IFR-17-001 | Locally verified | [94cafe67](https://github.com/datrab/kubeclaw/commit/94cafe67c2b03bad5869c36a4b7975e0c27968df) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/verification-secret-rbac.md) |
| IFR-18-001 | Locally verified | [9a566c7c](https://github.com/datrab/kubeclaw/commit/9a566c7c884561f1cb17af500fdc842f22bac5fb) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/run6-coupled-root-review.md) |
| IFR-27-001 | Locally verified | [905edf06](https://github.com/datrab/kubeclaw/commit/905edf06721b02558b443b676432993c56b201c1) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-private-access.md) |

## WP13 — Operations, restore and capacity

Operational evidence: [G13](../status/acceptance.md#g13). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| IFR-01-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| IFR-02-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| IFR-05-001 | Locally verified | [06638074](https://github.com/datrab/kubeclaw/commit/0663807443b42e3222d52ff02486f959d7b7acf0) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-gitops-closure.md) |
| IFR-06-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| IFR-11-001 | Locally verified | [905edf06](https://github.com/datrab/kubeclaw/commit/905edf06721b02558b443b676432993c56b201c1) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-redis-migration-closure.md) |
| IFR-12-001 | Locally verified | [9e725b35](https://github.com/datrab/kubeclaw/commit/9e725b35e0e623708f7f0e26ed120fc6ac60eb68) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-postgresql-recovery-checkpoint.md) |
| IFR-13-001 | Locally verified | [af15fce0](https://github.com/datrab/kubeclaw/commit/af15fce0aff3e1ea7c07009350d0c950b0612147) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-qdrant-checkpoint.md) |
| IFR-14-001 | Locally verified | [fc136fc8](https://github.com/datrab/kubeclaw/commit/fc136fc8d1351f9ef6bccfafa9f63dd55addbce2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-15-001 | Locally verified | [8d47764b](https://github.com/datrab/kubeclaw/commit/8d47764b7b276c783f312198d6987b9197e593e4) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-stateful-upgrade-checkpoint.md) |
| IFR-16-001 | Open | No completion commit | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-stateful-upgrade-checkpoint.md) |
| IFR-20-001 | Locally verified | [8b4238f5](https://github.com/datrab/kubeclaw/commit/8b4238f5e0c9e383911c20726e4386bfa72fb846) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-20-002 | Locally verified | [fc136fc8](https://github.com/datrab/kubeclaw/commit/fc136fc8d1351f9ef6bccfafa9f63dd55addbce2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-25-001 | Locally verified | No completion commit | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| IFR-26-001 | In progress | No completion commit | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-prism-backup-groups.md) |
| IFR-28-001 | Open | No completion commit | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |

## WP14 — Complete product graph and evidence-backed delivery

Operational evidence: [G14](../status/acceptance.md#g14). This gate groups the relevant proof obligations; local disposition remains specific to each ID.

| Finding | Local disposition | Implementation reference | Selected evidence |
| --- | --- | --- | --- |
| PCR-PREFLIGHT-001 | Locally verified | [45259142](https://github.com/datrab/kubeclaw/commit/452591423dd19e987454137193a50d6afe615b5f) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/preflight-declarations.md) |
| PCR-PREPORT-001 | Locally verified | [2e17a3d0](https://github.com/datrab/kubeclaw/commit/2e17a3d04cc460851031234890c0accfaff78b09) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/report-identity.md) |
| PCR-SCAFFOLD-001 | Locally verified | [800cba40](https://github.com/datrab/kubeclaw/commit/800cba4033c11337e31d34de11dc6cf66ca10282) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/scaffold-publication.md) |
| T01-F01 | Locally verified | `48320e8` (historical short reference; not resolvable) | [Finding and checkpoint](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) |
| T01-F02 | Locally verified | [5b7f8c69](https://github.com/datrab/kubeclaw/commit/5b7f8c694dc3aa2c05edb45ad8d88483bcdc36b2) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |
| T15-F01 | Locally verified | [86b11c0c](https://github.com/datrab/kubeclaw/commit/86b11c0c7e58cbb7f87ef35bd67bbbccdfad6b37) | [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/pr6-local-acceptance.md) |

## Additional integration findings

All five are locally verified. They do not increase the original 154-finding denominator. The evidence column states the documented boundary.

| Finding | Implementation reference | Local evidence and boundary |
| --- | --- | --- |
| INT-BOUNDARY001 | [b5143cf6](https://github.com/datrab/kubeclaw/commit/b5143cf6d099af0f9af683cb596b9640e3a58946) | Contract-only exports and transitive graph checks; not the complete global gate. [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/registration-contract-boundary.md) |
| INT-STARTUP-LATENCY001 | [8ea0cc2d](https://github.com/datrab/kubeclaw/commit/8ea0cc2d4c4446e25a08a32ee1e52e2cc1efb932) | Meta-schema validation remains enforced; complete phase-6 run includes the 500 ms cancellation assertion. [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/registry-startup-latency.md) |
| INT-REVIEW-UNCERTAIN001 | [10440ac1](https://github.com/datrab/kubeclaw/commit/10440ac1e20e3744cfe78e70182c2dd17bacd801) | An uncertain external review effect requires reconciliation instead of automatic retry; not general live receiver acceptance. [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/review.md) |
| INT-OBSERVER-BUILD001 | [e3ae22ba](https://github.com/datrab/kubeclaw/commit/e3ae22ba92c533fbbadd6ec744f9db32051234a0) | Clean source compilation and packaging of all three roles; generation remains a prerequisite, without a cache fallback. [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/observer-build.md) |
| INT-DEPENDENCY-OWNER001 | [6967d056](https://github.com/datrab/kubeclaw/commit/6967d056e2ae1eaa8277f51fd95394a1ef8df83d) | Nested dependencies bind parent execution identity; 14 isolated tests and Nova type checking, with other receipt integration tracked separately. [Evidence](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/implementation/adapter-dependency-identity.md) |

## Boundaries of inherited local evidence

Real local processes, Git operations, HTTP servers, Helm renders, the Distribution registry and selected native database/browser runs count only within their documented scope. PGlite, SQL doubles, API/cluster fixtures and materialized graphs are correspondingly limited evidence. A filename containing “native” or a reachable `/readyz` does not prove pooled PostgreSQL, installed CRDs, a running pod or a complete user journey.

Earlier failures, skips, missing browsers or shell tools, truncated logs, unchanged timing failures and inherited lint/type failures are not retroactively successes. A later correction closes only the demonstrated cause. Limited readiness, cache, supervisor or resource tests do not automatically prove complete orphan cleanup, whole-process CPU ownership or recovery across services.

AP04 migrates status and provenance. It does not run new runtime, cluster, browser, PostgreSQL or receiver acceptance tests and closes none of the 13 incomplete implementation findings.

The inherited implementation references `48320e8` (T01-F01) and `ac6f673` (PATH-T02-001) cannot be resolved in the checkout or GitHub (checked 2026-09-15). They are retained as historical text, not presented as a valid commit link. The pinned selected evidence and original D12 disposition remain available; this does not invent replacement proof or reopen the finding.
