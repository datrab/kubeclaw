# Buster cluster configuration — implementation checkpoint

Status updated on 2026-10-09: the September seventeen-command run has ended: **16 passed, one failed** (`verify:test-gate:security-cutover`); no unexpected source drift. All three lifecycle baseline cases and all 61 RuntimeSecurity consumer cases passed. The failing security command passed its five provider cases, then stopped on the obsolete Docker download assertion, before downstream checks. The independently reviewed oracle correction and DOC V2 are integrated but the full security chain has not been repeated. Nine corrected RuntimeSecurity controls, two lifecycle controls and final independent evidence/documentation acceptance remain pending. Earlier CI2 20-case and eight-control acceptance remains valid at its recorded generation. Overall CONFIG and original findings remain open. See the [current handoff](../resume/HANDOFF-20261009.md) for exact source boundaries, expired database prerequisites and resume steps.

## Resulting behavior and authority

The selected complete `buster-engine` component supplies KubernetesFixture, Tailscale and RuntimeSecurity policy. Both charts validate and deliver the selected complete document with the same checksum. Shared lease settings feed broker delivery; the actual deployment namespace and existing registry-client contract remain external bindings. Disabled cluster routes need no namespace binding, but all component policy fields remain required. Retired runtime objects, worker environment overrides and broker Helm policy values reject by presence. See the [configuration reference](../../../architecture/buster-cluster-configuration.md) for all fields, units, migration and remaining owners, and the [RuntimeSecurity checkpoint](config-buster-runtime-security-20260924.md) for that extension.

## Accepted evidence

| Proof | Accepted result and source boundary |
|---|---|
| [Runtime3, Fast5 and tool probe](../../evidence/independent-cluster-final-20260924/runtime3-controls1-review.json) | All thirteen runtime commands passed, including 44 new cluster and 376 grouped original cases; types/lint/shell and actual callback/Promise/tool contracts passed. Results belong to their bound generation. |
| [Poll correction and nine controls](../../evidence/independent-cluster-final-20260924/poll-delta-and-nine-controls-final-review.json) | Fast6 and the complete four-case poll module passed after the test merge-patch correction. Seven unchanged controls plus two repeated poll controls failed for their intended assertions, without the earlier rollback TypeError. These are explicit delta checks, not a full Runtime3 rerun. |
| [CI2 Service2](../../evidence/independent-cluster-ci2-proof-20260924/ci2-service2-evidence-review.json) | 20/20 capture and production-route cases passed: real consumer behavior after file/array/nested-object mutation; two profiles through production service/factory/provider IPC for each of three capabilities; denied grant/route without CLI effects. The earlier CI2 gaps are resolved at this generation. |
| [Eight capture/service controls](../../evidence/independent-runtime-security-policy-20260924/ci2-service-controls1-evidence-review.json) | All eight exact hooks caused the intended consumer assertion failures; source bindings, guards and drift were independently inspected. |

These are local genuine-process tests with modeled Kubernetes/controller responses and an explicitly modeled native preparation adapter. They do not establish deployed infrastructure or native-isolation behavior. Source snapshots and before/after bindings in each run determine exactly which generation was tested.

## Historical failures and corrections

The following attempts remain failed or incomplete. Later success does not reclassify them.

| Historical attempt | Finding and disposition |
|---|---|
| [V1/V3 source review](../../evidence/independent-buster-cluster-invoker-policy-20260921/source-review-v3-20260924.json) | V1 had inconsistent API-version validation and required a namespace even for disabled routes. V2 corrected production; V3 added factory cases. |
| [Fast1](../../evidence/buster-cluster-runtime-20260924/fast1/results.json), [lint1](../../evidence/buster-cluster-runtime-20260924/lint1/results.json), [Fast2](../../evidence/buster-cluster-runtime-20260924/fast2/results.json) | Type diagnostics, constructor complexity and declaration-project association failed. Reviewed corrections preserved strict checking; Fast3 and subsequent runs passed. |
| [Runtime1](../../evidence/buster-cluster-runtime-20260924/runtime1/results.json) | 42/44 new cases; inactive-profile test wrote active files, a deadline assertion used a retired literal, and the tool wrapper lost Node's custom Promise contract. Original failures and reviewed corrections are preserved. |
| [Tool probe1](../../evidence/buster-cluster-runtime-20260924/tool-probe1/setup-failure.json) | Manifest metadata rejected before execution. Subsequent genuine probes verified callback/Promise success and exit7, stdout/stderr, child identity, tar and flock. |
| [Runtime2](../../evidence/buster-cluster-runtime-20260924/runtime2/interruption.json) | Interrupted after eight commands without final protection/drift snapshots. Its Prism legacy-value test expected a later template error instead of the correct earlier closed-schema error. The reviewed correction retained negative inputs and restored original property presence. |
| [Controls1](../../evidence/buster-cluster-runtime-20260924/controls1/results.json) | Expected failing exits alone were insufficient: Tailscale poll also hit a test rollback TypeError. The merge-patch fixture was corrected and both poll controls repeated; see accepted evidence above. |
| [Initial CI2 coverage review](../../evidence/independent-cluster-final-20260924/criteria-coverage-source-review.json) | Helper composition and service start/stop did not prove postcapture effects or full capability execution. The added tests later passed Service2; Service1's missing HTTPS fixture credentials were explicitly corrected without weakening the production contract. |

The live Kubernetes test's formerly ignored 180000 ms cleanup setting was moved to the supported provider execution policy. This deliberately made the declared limit effective; it is neither unchanged effective behavior nor live-cluster evidence. See the [reviewed qualification](../../evidence/buster-cluster-invoker-policy-20260921/type-correction-v1/README-reviewed.md).

## Remaining acceptance work

Complete and independently inspect the current full regression, corrected RuntimeSecurity controls and test-lifetime failure/negative controls; then bind the documentation to that final checkpoint. Preserve all failed attempts and distinguish test teardown from production process ownership. The RuntimeSecurity manifest allocation and abort-before-close limitations, provider request defaults, controller policies, Foundation capture deadline and other configuration owners remain separate open work. Documentation must be updated whenever those boundaries or their evidence change.
