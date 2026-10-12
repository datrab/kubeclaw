# Independent review: deployment API absence handling

**Corrected bounded slice accepted after independent re-review.** DA1–DA8 and
DA-DOC are supported within the explicit Secret/ConfigMap and shared-kubeconfig
contract. The original Helm decode-skip blocker is fixed; no unresolved finding
remains in this slice. This does not close H1–H3 or validate a live cluster.
The original rejection is preserved below so the earlier fixture pass cannot be
mistaken for proof of the corrected behavior.

## Corrected implementation and independent evidence

The raw backend list establishes the stored revision set. Exact resource type,
namespace, label identity, full storage key, revision, payload presence and
uniqueness are validated before decoding. Every revision is then read by the
actual Helm `status --revision` command; command status is checked before its
JSON name, namespace, revision and state are reconciled. The latest state is used
only after all observed history passes. There is no handwritten Helm payload
decoder or readable-revision fallback. Unsupported storage backends and nonempty
Helm-only connection overrides are rejected. GitOps ownership and prior deletion
scope remain intact.

- [Independent original entrypoints](../../evidence/deploy-api-errors-independent-20260921/tests-corrected.txt):
  **8/8 methods, 83 scenarios passed**, no skips, 49.558 seconds. These remain
  explicit CLI-fixture orchestration tests, including failed status with plausible
  JSON, history, unknown driver, connection override and secret-safe errors.
- [Namespace regression](../../evidence/deploy-api-errors-independent-20260921/bootstrap-corrected.txt):
  **18/18 passed**, retaining all original cases plus continuation rejection.
- [Independent actual-client probe](../../evidence/deploy-api-errors-independent-20260921/storage-client-probe.py):
  **18/18 passed**, using installed kubectl and Helm 3.22.0 against a loopback HTTP
  fixture. The probe extracts the exact production connection guard and
  `observe_helm_release` function, without replacing either client or parser.
  Each Secret/ConfigMap backend covers empty, healthy, pending, HTTP403, corrupt
  sole/latest/older records, healthy two-revision history and wrong decoded name.
  It confirms both revision GETs for healthy history and no disclosure of the
  fixture release-note marker. [Raw results](../../evidence/deploy-api-errors-independent-20260921/storage-client-probe.json),
  [summary](../../evidence/deploy-api-errors-independent-20260921/storage-client-probe.txt).
  Function-level client testing does not stand in for full live entrypoint or
  mutation testing; original shell orchestration is covered separately above.
- A private extracted-function mutant retains only the latest raw revision.
  The same independent actual-client probe fails on **corrupt older history**:
  the mutant returns `deployed` while the original rejects it. This is a semantic
  bypass, not an import/setup failure. [Raw failure and trace](../../evidence/deploy-api-errors-independent-20260921/storage-client-latest-only-mutant.txt),
  [client requests](../../evidence/deploy-api-errors-independent-20260921/storage-client-latest-only-mutant.json).
- [Parser recheck](../../evidence/deploy-api-errors-independent-20260921/parser-probe-corrected.txt):
  prior 24 positive and 42 negative resource cases still pass; 12 additional
  incomplete/invalid continuation cases fail as required. An independent
  API-version-removal mutation is still detected. Namespace continuation is
  exercised through the original setup entrypoint in the 18-test suite.
- Canonical parser ESLint and Bash syntax pass again; successful
  [lint output](../../evidence/deploy-api-errors-independent-20260921/lint-corrected.txt)
  is empty. No broad lint disable or original test weakening was introduced.

The continuation observation was deliberately scoped: actual kubectl normally
aggregates pages. The previous validators nevertheless accepted a successful CLI
list that explicitly carried an unconsumed continuation token as confirmed
absence. All three relevant parsers now accept only an absent token or the empty
string. This closes an incomplete/malformed-output validation gap; it is not a
claim that ordinary kubectl pagination bypasses the guard in a live cluster.

Primary-source crosscheck also confirms named-record GET/decoding and explicit
revision selection in [Helm 3.18.4 Secret storage](https://raw.githubusercontent.com/helm/helm/v3.18.4/pkg/storage/driver/secrets.go),
[ConfigMap storage](https://raw.githubusercontent.com/helm/helm/v3.18.4/pkg/storage/driver/cfgmaps.go)
and [status CLI](https://raw.githubusercontent.com/helm/helm/v3.18.4/cmd/helm/status.go).
That is source review, not a separate execution of the 3.18.4 binary.

The final operator docs accurately describe both backends, read/list permissions,
shared kubeconfig, all-history cost, recovery rather than record deletion,
non-atomic observations and preceding mutation limits. The historical list-based
implementation and its failed review are clearly labelled. No actual cluster
resource, release or credential was created, mutated or deleted by this reviewer.
Root-owned host preparation, concurrency control, arbitrary tampering outside the
selected labelled backend, other API callsites and full recovery remain outside
this bounded evidence. [Corrected source identities and snapshots](../../evidence/deploy-api-errors-independent-20260921/corrected-source-identities.json)
bind the accepted current state.

## Original rejected review, retained for audit

**Initial review: rejected.** The first independent review on 2026-09-21 found a production
Helm observation failure that the synthetic CLI cases do not model. DA1 and DA4
were open at that stage. No H1–H3, overall API-error remediation or finding closure follows
from the passing tests below. The reviewer did not change production code.

### Initial blocking finding: successful Helm list can conceal invalid stored releases

`scripts/deploy.sh` treats a successful `helm list --all --filter <exact-name>
--max 2 -o json` response as the complete release observation. Real Helm 3.22.0
silently skips a stored release Secret it cannot decode. Its exit status is zero
and its JSON remains well formed. Two independently reproduced cases matter:

1. Only a matching Helm release Secret exists, with corrupt encoded release
   bytes: Helm returns `[]`; the new parser emits `absent`. Teardown can therefore
   claim the release is absent even though release storage remains.
2. A valid older revision 1 is deployed, while latest stored revision 2 has a
   corrupt payload and `pending-upgrade` label: Helm returns revision 1 as
   `deployed`; the new guard admits deployment based on stale release state.

Checking only an empty list would leave case 2 unfixed. The bounded correction
must establish that the exact release's stored records are not being silently
omitted before accepting absence or idle state. It must retain status-first
handling, ownership checks, secret-safe diagnostics and explicitly document any
storage-driver assumptions and additional permissions. Existing records that
cannot be interpreted must stop the mutation rather than disappear from the
observation.

[The retained probe](../../evidence/deploy-api-errors-independent-20260921/client-probe.py)
uses the installed, actual Helm CLI against a loopback HTTP fixture serving
Kubernetes SecretList data. It runs the original parser against that actual CLI
stdout. It does not stub Helm and does not contact a live cluster. The valid,
empty and HTTP403 controls respectively yield `deployed`, `absent` and command
failure; the two corrupt-storage cases reproduce the failure above.
[Raw client stdout, status and HTTP requests](../../evidence/deploy-api-errors-independent-20260921/client-probe.json)
and [summary](../../evidence/deploy-api-errors-independent-20260921/client-probe.txt)
are retained. Installed client version: `v3.22.0+g144ca65`. This does not claim a
real Kubernetes authorization or storage-persistence test, nor execution of
Helm 3.18.4. The implementation's retained 3.18.4/3.22.0 list-command source
correctly documents JSON shape and filter ordering, but those facts alone do not
establish completeness of decoded storage records.

### Initial review subchecks

- Original orchestration suite: **6/6 methods, 51 entrypoint scenarios passed**,
  no skips. [Independent raw run](../../evidence/deploy-api-errors-independent-20260921/tests.txt).
  CLI peers are synthetic; actual observation parser and GitOps ownership module
  execute. This is why the suite does not catch real Helm's decoding behavior.
- Namespace regression: **14/14 passed**, no skips.
  [Raw run](../../evidence/deploy-api-errors-independent-20260921/bootstrap.txt).
- Independent parser probes exercise all six supported kinds with both typed
  and generic list envelopes, present and empty collections (**24 positive cases**),
  plus wrong name, namespace, kind, API version, null item, duplicate item and
  envelope (**42 negative cases**). Rejections do not disclose a response-body
  marker. [Probe](../../evidence/deploy-api-errors-independent-20260921/parser-probe.py),
  [results](../../evidence/deploy-api-errors-independent-20260921/parser-probe.txt).
  Removing item API-version validation in a private parser copy makes the
  originally rejected response become `present`; the independent oracle detects
  the mutation. Production files were not mutated.
- Canonical ESLint for the parser and `bash -n scripts/deploy.sh` exited zero.
  [Lint output](../../evidence/deploy-api-errors-independent-20260921/lint.txt)
  is empty because successful ESLint is silent.
- Source inspection confirms the generic `is_not_found_error` function and all
  its former calls are removed. Both shell observation functions check process
  status before parsing stdout. Resource selectors, identity/API checks and
  explicit OAuth pipeline failure propagation are straightforward. Ownership
  checks remain ahead of deployment/agent teardown. Existing deletion commands,
  manifest fallback selectors and resource scope are preserved.
- Setup/Tailscale docs accurately state new collection-list permissions,
  secret preservation, non-atomic reruns and preceding mutation limits. Their
  claim that the Helm lookup distinguishes absence remains incomplete until the
  blocking finding is corrected. Other pre-existing API callsites are explicitly
  outside this bounded review, as the implementation note states.

[Hashes and snapshots](../../evidence/deploy-api-errors-independent-20260921/source-identities.json)
bind the initial rejected state. The corrected evidence and explicit follow-up
review above supersede its verdict; these initial passing subchecks alone did not
override the blocker.
