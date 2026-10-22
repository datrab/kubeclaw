# Source-only correction review, round 1

## Whole assigned scope and exact candidate

The current five-page Ops Source-content correction still requires correction for the two material items below. This is a whole assigned-partition correction result, not a partial read. It does not issue Reader, Quality, test execution, runtime adoption, gate, or deployed/live acceptance verdicts.

Baseline: `108fd854525688584b8b3e5595c6ee77461a46a0`. Current uncommitted five-page bytes are frozen under `reviewed-pages/`; their SHA-256s and exact current-versus-baseline diff are in `coverage.json` and `current-vs-108fd.diff`. Original report and findings remain untouched. Every previous complete page read is retained for byte-identical mapped spans; all correction diff spans and affected current contexts were read. This is exact unchanged-content reuse, not a full-read assertion based on search results. All 22 manifest source hashes match upstream `34cf38ef53ee41381543785d0ffae90a37fac9ca`; original 16 identities are unchanged and their full reviews remain applicable. All six newly assigned blobs were read completely: Buster values 1–269, KubeClaw RBAC 1–90, namespace-controller template 1–273, fixture runtime 1–758, provision template 1–44, provisioner 1–150. Zero unread assigned scope.

The parent corrected two transient citation mistakes while this review was active. The terminal reviewed Ops bytes use Codex 20–68, Nova 69–97, Buster 98–118 and `server.mjs` 114–138 for event continuation. Those terminal excerpts are correct; the transient mistakes are **not** remaining findings. Parent-reported test PASS is not borrowed as Source proof and no tests were run here.

## Remaining material findings

### C1 — Buster's direct worker authority is still understated in repeated summaries (original S3 incompletely reconciled)

The expanded `ops-mcp.md:24–29,63,68–72` and updated communication/security central callouts now correctly describe direct worker lease-bound workload/test API authority. However:

- `platform-and-operations.md:980–981` still says Buster retains **only** a worker “lease-token exception for the namespace controller”; `996–997` says agents do not receive a Kubernetes credential; and `1013` still claims **“Only the MCP owns Kubernetes read/exec authority.”** These are not gateway-qualified and the direct worker API reads/workload effects make the latter universal claim false.
- `security-and-trust.md:881` still says “agent credentials do not grant direct Kubernetes access,” without the gateway/MCP-client qualification now used elsewhere.
- `codex-integration.md:96–97` still describes the worker solely as a “namespace-controller lease exception.” It should explicitly reference the now-documented worker direct lease/workload/test authority, so this complete page does not carry the old narrower summary alongside corrected pages.

Source basis remains the selected worker API projection/mount (`my-values/buster-values.yaml:158–165,193–213`), its selected Buster deployer/tester allowlist (`219–228`), base lease and Deployment/Service-read Role (`charts/kubeclaw/templates/rbac.yaml:14–26`), deployer/tester **ClusterRoles** (`buster-namespace-controller.yaml:23–56`), and the actual fixture lease submission followed by direct manifest apply (`kubernetes-fixture-runtime.ts:692–715`). Deployer also has namespace-scoped Secret reads at template 34–38. The prior report traced the selected kubeconfig, worker invoker construction and actual RoleBinding reconciliation; those source identities are unchanged. Requalify these remaining summaries to Codex/Nova/Buster gateways or MCP client credentials, and keep the separate worker authority explicit. No redesign/removal of the legitimate worker path is requested.

### C2 — New diagram/text calls polling a lease-resource watch

`ops-mcp.md:64` now draws API → controller labeled **“Lease resource watch”**; text `70` says the controller “watches/reconciles” leases. The first correction correctly removed the nonexistent direct worker→controller lease-request path, but introduced a different unproved transport.

Actual source at upstream `cmd/buster-namespace-controller/main.go:122–130` repeatedly calls `reconcileAll`, then sleeps `pollInterval`; `231–239` performs a normal HTTP GET of the lease collection and loops returned items. This is periodic list/reconciliation, not a Kubernetes watch stream. The chart **permits** `watch` (template `70–72`) but actually selects a polling interval (`227–228`); permitted RBAC is not an invoked transport.

Use “lease list/read response”/“polled lease resources” (and a corresponding controller→API list request if showing complete request directions), and say “lists/reconciles” in the text alternative. This is a source invocation/diagram-edge correction, not live traffic proof.

## Remaining non-terminal wording cleanup

`platform-and-operations.md:1023` still refers to “scoped rollout observations” after the revised Verification section explicitly declines retained deployment receipts. Replace it with source/layout limits, as already done in the security page. This is the remaining S1 wording residue; it does not negate the substantial successful removal of specific unsupported outcomes.

## Resolved original findings

- S1's substantive Ops claims of 26 CI checks, 31/19/6 executed tests, Argo Synced/Healthy, ready/no-restart Pods and successful Nova native discovery/denial have been removed or explicitly marked unverified. Source definitions and optional `OPS_MCP_OPENCLAW_BIN` behavior are accurately separated from execution. Upstream source is still explicitly not adopted into this branch.
- S2's selected-Nova contradiction is resolved by locally marking the older token/lease/verification/OAuth-read material as historical branch evidence, prohibiting application to current upstream Nova, and qualifying the route/least-authority rows.
- S3's main Ops path, gateway/worker distinction, actual lease-to-workload source example and central security/communication callouts are corrected. C1 identifies the remaining repetitions, not a new broader audit.
- S4's terminal Codex/Nova/Buster policy ranges, aggregate pagination/default/caller/event ranges, scoped hook RBAC, template invocation and retained/generated-token ranges now support their captions. Six new manifest sources exactly match their linked immutable upstream blobs.

## Diagram and source boundaries

The new Ops graph has nine edges. Codex→MCP, Nova→adapter, Buster→adapter, each adapter→MCP, MCP→API, worker→API, API→controller and controller→API were checked with the adjacent text. Worker→API now correctly names both lease and lease-bound workload/test operations; the API→controller watch label is C2. Changed platform Ops-client→MCP and MCP→K3s edges retain the original source-supported identities. Unchanged other-system diagrams retain the prior full-page reads and scope; no unrelated subsystem re-audit is claimed.

All six added complete files are inert source declarations/implementations, not results. Their image tags, capability availability and chart fields do not establish running image identity, effective RBAC, successful fixture deployment, or credential availability. Existing source tests retained from the first review cover gateway isolation, worker token preservation, exact client grants, TLS/exec protocol boundaries and provisioning assertions; no execution result is inferred. Original positive determinations and limitations remain applicable to exact unchanged source.

No repository edits, imported repository modules, getters, tests, generators, endpoints or credentials were executed/read by this reviewer. Only review artifacts were saved outside the repository. Re-review final changed contexts against these frozen page hashes after correcting C1/C2; do not reuse this report as a Source PASS for modified bytes.
