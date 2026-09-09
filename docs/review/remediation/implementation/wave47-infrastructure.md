# Wave 47 — original infrastructure finding acceptance

2026-09-09. Base `a8cf34f`. All eleven assigned complete original findings were
read from `register.json`'s `source_finding_text`, not inferred from status labels.
The old infrastructure-directory Git object is not present in this checkout; no
claim of reading that unavailable tree is made. No deployment, CI run, live
cluster access, host configuration change or operator message occurred.

## New causal release fix: IFR-19-001

The selected-release renderer built its image/bundle comparison baseline before
reading the private Registry configuration. The Registry contract correctly
requires an explicit origin, so valid Buster private overlays could never reach
the release comparison. This was a production render bug, not merely a stale
positive fixture. The original script with the updated real private-overlay
regression exits 1; the fixed script passes all ten original release tests.

The renderer now projects **only** `runtimeInfrastructure.registry` from the
original values files into its independent baseline and intermediate overlay
checks. Helm performs the actual merging; the projection does not merge YAML
by hand. Selected images, container slots and code-bundle identities still come
from the verified release, and every original overlay is independently checked.
Private context files are mode 0600 under a temporary directory and are removed
in `finally`. The final render uses the original arguments, so an omitted or
invalid final registry still fails the chart contract. No fake registry origin
is introduced in production.

The real Git/Shell/Helm tests supply an explicit test operator registry through
`BUSTER_VALUES_FILE`. Image-slot removal, mutable/wrong-slot image references,
cross-source bundles, indirect/duplicate bundle controls and source changes
continue to reject. Release-materialization, rollout-sensitivity and broker-fence
fixtures now supply the same required Buster runtime/origin contract. Their old
missing-input failures are retained. No production guard was relaxed.

## Original acceptance vs actual evidence

| ID | Original requested proof | New local evidence and exact remaining boundary |
| --- | --- | --- |
| IFR-08-001 | Shared explicit client contract; uncached native CRI digest pull and real Pod; unauthorized clients rejected. | Five registry-client configuration/Helm tests pass. Actual pinned Trivy pulls an authenticated local HTTPS OCI image; wrong credentials/scope reject. BuildKit, CRI and Pod proof remains absent; these local clients do not establish node reachability. |
| IFR-09-001 | Actual BuildKit/node traffic through mirror; offline cache hit vs miss. | Original generated BuildKit/node mirror configuration assertions pass. No BuildKit daemon, CRI or native mirror cache exists here; traffic/offline gates remain open. |
| IFR-19-001 | Every documented entrypoint selects immutable receipt images; reject unselected overrides; compare actual Pod imageIDs. | New baseline bug fixed. Ten original Git/Shell/Helm release tests pass after a reproduced before-failure, and both configuration-binding tests passed in the combined run. Local release selection/render defect is verified; Pod imageIDs remain an additional explicitly unperformed operating check. |
| IFR-22-001 | Separate PR vs publication permissions; immutable actions; isolated internal/fork PR token checks. | Five original parsed workflow trust tests pass. No GitHub workflow or test PR was run; effective issued tokens/secret availability remain unobserved. |
| IFR-24-002 | Actual pinned Trivy with stale DB must block; scan timestamp cannot refresh advisory age. | Five native tests pass with real 0.74.0 and its real databases, zero skips: positive snapshot/image scans, old copied source metadata with current DownloadedAt, caller override refusal, missing/changed/schema/cancellation/FIFO rejection and scoped HTTPS credentials. This original local freshness acceptance is met. No remote worker/provider or deployed image claim is added. |
| IFR-07-001 | Configuration-driven rollout and actual old-peer rejection after update. | Original actual Helm/config sensitivity gate passes after restoring required Buster fixture inputs; all relevant checksum changes asserted. No native Envoy peer rollout has run. New trust-readiness work is separate and is not this rollout proof. |
| IFR-18-001 | Alternate controller SA enforced by actual Kubernetes VAP admission. | Original Helm gate passes both namespaces/identities/prefixes and rejects Kubernetes 1.29. Original controller Go suite passes. Its local HTTP fixtures are not a Kubernetes API server; actual CEL/admission and installed-policy migration remain open. |
| IFR-14-001 | Config-only effective model route and process/DB-fault Ready/Unready behavior. | Actual plain-manifest and Helm sensitivity gate passes; probe separation remains asserted. Pinned LiteLLM native runtime with DB is not running, so effective route/fault behavior remains open. |
| IFR-20-001 | Explicit configured limits; original large/invalid ingestion inputs, measured limits/OOM recovery. | Three real Helm tests and two original native Node service tests pass; invalid TTL, actual cleanup failure/retry, pause and explicit sizing remain verified. There is no resource-isolated ingestion Pod or OOM/CPU/disk observation; these specific resource gates remain open. |
| IFR-20-002 | Singleton-control upgrade under writes, cross-node scheduling and failing replacement. | Helm verifies Recreate only for control and preserves worker/studio strategies. No cross-node cluster upgrade or write load was run. |
| IFR-25-001 | Functional dependency and expired-cert faults after startup; status plus alarm, independent liveness. | See the separately committed `worker-trust-operational-readiness.md`. New Envoy source/render work is explicitly native-unverified; it must not be counted as this acceptance. |

## Commands and raw results

Run from this checkout, using actual Helm from
`/workspace/scratch/4e25cf57c177/toolchains/bin` on PATH:

- Combined `node --test` over workflow trust, registry client, deployment release,
  release configuration/images, Prism ingestion resource and original ingestion
  service tests: 28 total, 25 passed, 3 release render failures (exit 1, before fix).
  Command files: `tests/verification/contracts/workflow-trust-split.test.mjs`,
  `tests/verification/deployment/{registry-client-config,deployment-release,release-configuration,release-images,prism-ingestion-resources}.test.mjs`,
  `skills/prism/tests/ingestion-service.test.mts`.
- `node --test tests/verification/deployment/deployment-release.test.mjs tests/verification/deployment/release-images.test.mjs`: 10 passed, exit 0 after fix.
- Original `deployment-release.mjs` from base with the new private-overlay test:
  `node --test --test-name-pattern='original deployment render entrypoints' tests/verification/deployment/deployment-release.test.mjs`: exit 1. The working implementation was restored in `finally`.
- `node tests/verification/contracts/check-rollout-health.mjs` and
  `node tests/verification/contracts/check-buster-namespace-fence.mjs`: each exit 0 after explicit fixture configuration.
- `go test ./cmd/buster-namespace-controller`: exit 0, actual Go binary from
  `/workspace/scratch/4e25cf57c177/toolchains/go/bin`.
- `node --test tests/verification/deployment/registry-trivy-native.test.mts skills/buster/plugins/security-providers/tests/database-freshness.test.mts`: 5 passed, exit 0. Set `REGISTRY_TRIVY_BINARY` and `KUBECLAW_SECURITY_TEST_TRIVY` to `/workspace/scratch/4e25cf57c177/toolchains/trivy-0.74.0/trivy`, both corresponding cache variables to `/workspace/scratch/4e25cf57c177/toolchains/trivy-cache`.
- Canonical ESLint (`--config charts/kubeclaw/files/config/eslint.config.mjs`)
  on the release script and four changed original tests: exit 0.

Raw logs: `docs/review/evidence/wave47-infra/`. They distinguish the initial
failures from passing reruns; the initial combined run is not reported green.

## Newly checked prerequisites

Native Trivy and both DB snapshots are present outside PATH and were actually
executed, correcting any assumption based only on PATH. PostgreSQL 17 binaries
are also present: `initdb --version` succeeds. However this executor runs as UID
0, and an actual `setpriv --reuid=65534 --regid=65534 --clear-groups -- id` fails
with `setresuid failed: Invalid argument` (exit 127). No eligible unprivileged
local server identity or provided isolated DSN is available; no PostgreSQL
startup guard was bypassed. Envoy, BuildKit/buildctl, Docker and CRI executables
were not found by PATH and scratch-binary searches. No new platform capability
or infrastructure is assumed merely because a parser/renderer test passed.
