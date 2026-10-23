# Independent P1–P4 substantive contract review 01

**Verdict: NOT ACCEPTED as a complete bounded proposed-definition/acceptance package.**
The concrete contracts are substantially sound, but the material recipe gaps below
remain. This is not native acceptance, whole-C0 acceptance, C1/C3 approval, or a
production-finding disposition.

Reviewer: fresh child `/root/policy_family_contract_review`, independently assigned
source/definition review, with no implementation responsibility. Reviewed checkout
HEAD: `2db2156a2ad8c64fad0a812b9c90bee040d41423`, dirty working stand. The reviewed
bundle is `../policy-family-contracts-01`. Input and bundle content identities are
in [observations.json](observations.json); the pre-review dirty patch and status
are retained as [worktree.patch](worktree.patch) and [git-status.txt](git-status.txt).
This report changes only its own review directory. No productive tests, API calls,
credentials, native executions, deployment, Eval, or production changes occurred.

## Expected scope and actual examination

Read `docs/review/remediation/OPENCLAW-CONFIG-GOAL.md` first. Inspected all four
family contracts, all 26 proposed control bodies and their existing harness paths,
all ten whole fixtures, four typed domain fragments, owner records, canonical
inventory/matrix joins, source witness expressions and relevant surrounding code.
Inspected actual helpers/include callers/proxy probes; bootstrap/supervisor and
MCP authentication; Hubble query/parser/CLI/result truth; Kubernetes request/list,
the six-resource namespace tool, event outer loop, and single-page tools.

Actual read-only commands included `cat`, `sed -n`, `rg -n`, and Python JSON/YAML
inspection against these exact paths; `git rev-parse HEAD`, `git diff --binary`
and `git status --porcelain` recorded checkout identity. The Python inspection
computed SHA-256, compared all pinned lines, resolved IDs against canonical
`rows`/`cases`, reconstructed the five baseline projections, and compared paired
unrelated fields. It was a task-local review observation, not a proposed generic
validator or native harness. Its complete per-item observations are persisted.

Observed expected/covered counts: **4/4 families, 10/10 fixtures, 26/26 controls,
34/34 input digests and 81/81 line witnesses**. All input/file/line identities
match; all anchor and canonical case IDs exist; all planned harness paths exist.
All 26 controls correctly remain `not-run` and declare future driver extensions.
No empty name-filter test collection is presented as a pass.

Fixture reconstruction independently confirmed:

- Nova/Buster/standalone Prism: historical full A projection, plus readiness block.
- Prism-agent: current Chart base recursively overlaid by actual role values and
  the existing release projection, plus readiness block.
- Ops: historical full Secret-profile A, existing generated Ops image projection,
  existing service baseline options, plus the proposed credentials/query/pagination
  fields.
- All five pairs preserve unrelated fields, and all ten fixture file digests match.
  These facts do not authenticate their public native stand/image/provider names.

## Material findings

### PFCR-01 — Probe-seconds positive/mutant variant is not concretely specified

**Blocking to exact acceptance-case completeness; medium severity.**
`contracts.json` P1 proposed A/B and all four fixture pairs use
`proxyProbeTimeoutSeconds: 3`. `case-specifications.json` P1-D1 and P1-L1 likewise
expect 3s for both. P1-L1 does contain the mutation intention
“Leave proxy probe3s when selected value changes in a complete valid variant”,
so mutation coverage is not wholly absent. But the selected alternate probe value,
complete variant construction, and positive render oracle are not specified.
Thus the ten delivered fixtures do not themselves exercise this independently
adjustable field; the decisive extra variant is left to future invention.

**Fix:** specify a complete clone of a named fixture with an exact valid alternate
probe value (for example 4s while preserving the other named policy fields), or
change B's value. State the real materializer/Helm extraction oracle for every
corresponding startup/readiness/liveness probe, and explicitly join the hardcoded
3s mutant to that same control. Preserve current 3s as the A baseline. No kubelet
timing claim is required merely to prove a declarative render field.

### PFCR-02 — P1-N2 port-level DROP/delay can measure the wrong timeout

**Blocking to native timing recipe validity; high severity.**
Both real `_worker-trust-readiness.tpl` files have
`worker-trust-self-check.connect_timeout: 0.5s` at line 84, outside P1's proposed
route/request/idle fields. P1-N2 currently permits DROP/controlled delay on the
original loopback port 19001 and expects the selected route to expire at A1000ms
versus B500ms. A port-level DROP during connection/TLS establishment can instead
hit the unchanged 500ms connect timeout. In particular it cannot establish the
required A1s route-timeout positive control. B's route500ms also coincides with
that earlier timeout. “Actual Envoy timeout flags” is not an exact distinction
between these two boundaries.

**Fix:** specify an original-Envoy fault that demonstrably allows TCP/TLS and
upstream request establishment, then stalls/delays response delivery beyond the
selected route budget. Retain native connection/handshake observations and the
exact route-timeout flag/status oracle; explicitly reject a connect-timeout result
as proof of this control. State the measurement tolerance numerically or define
how the native harness declares it before execution. Keep the original listener,
identity and 0.5s connect policy; do not substitute a responder or enlarge budgets.

### PFCR-03 — P4 caller map and finite-field effects do not close real boundaries

**Blocking to real caller/case completeness; high severity.**
P4 `proposed.callerMapping` names
`platform_cluster_state/platform_namespace_state`. The latter tool does not exist
at the pinned stand: `server.mjs:219` registers **`platform_network_state`**, and
its productive `pageSize: 50, maxPages: 1` read is at line 231. The corresponding
cluster tool reads at line 212. All source lines are pinned correctly, but the
semantic tool mapping is wrong.

None of P4's eight procedure/oracle bodies invokes these two actual tools to
prove `singlePageSize` A50/B25. P4-D1 compares the numeric block only. P4-N1/N2
exercise namespace aggregation, P4-N3 exercises an aggregate 1000ms deadline,
and P4-S1 exercises event capture. No procedure isolates the **finite local**
deadline from the shorter shared B5s/perGET10s limits. A `singlePageSize=50`
hardcode or `finiteCallDeadlineMs=30000` hardcode therefore has no specified
decisive productive oracle in the delivered recipe set.

**Fix:** correct the tool name and specify positive A/B calls through both actual
local-only registrations, with exact URL `limit`, retained continuation and
one-page output observations. Add a complete finite-deadline variant whose other
limits do not preempt it, with real request/list cancellation and oversized retry
oracles, plus the two field-specific fallback mutants. Keep Argo's accepted task
limit separately classified; do not reclassify it as a policy override.

### PFCR-04 — Newly specified shared-budget edge rules lack decisive controls

**Blocking to complete finite acceptance recipes; medium severity.**
The P4 contract explicitly requires FIFO waiting for temporarily occupied page
slots, attempt-limit termination, and a deadline recheck after synchronous token/CA
reads immediately before HTTPS dispatch. These are meaningful concurrency and
credential-read boundaries, not just wording. P4-L1 observes <=7 pages/<=14
attempts and an oversized retry; P4-N3 delays API traffic. No listed control
deliberately saturates temporary reservations and releases one to a waiting
branch, forces `scan_attempt_limit` before page/deadline limits, or delays the
credential-read phase past the deadline. Their current mutant lists likewise do
not target those three failures.

**Fix:** extend existing task-local library controls with exact complete variants,
prior states and independent dispatch/counter/queue observations for these edges.
Distinguish pre-dispatch credential delay from native API/network delay; local
instrumentation is definition evidence only. Join FIFO-false-exhaustion,
ignored-attempt-cap and omitted-post-read-check mutants to those oracles. This
does not require a new generic validator or more production functionality.

## Substantive checks that held

P1: current 1s/2s/3s values and real five functional instances are correctly
identified; proposed required numeric fields are adjustable, with ms/seconds
relations, nontruncating duration encoding, no schema defaults or numeric const
domains. Business routes/grants are not migrated by this family.

P2: actual 48-byte randomness is distinct from supervisor minimum32 and MCP
32..512 ASCII validation. The 514-byte pretrim ceiling/LF versus CRLF behavior
is correctly retained. The contract explicitly corrects current hardcoded
`codex-ops-bearer` producer versus selected Chart mount coupling, keeps one
same-owner author, supersedes the old entropy target rather than adding a second
writer, distinguishes once-read Codex from per-request MCP reopening, validates
retained credentials rather than regenerating, and leaves authentic revision/
mount/process receipts external. No credential values are disclosed.

P3: actual 5m default/15m maximum and default20/maximum50 are correct. Task
namespace/pod/node/verdict/absolute times/accepted limits remain task inputs;
captured policy governs actual schema/parser/CLI argv. Current loss/node/partial
and unknown ringbuffer completeness/no-lossless-cursor truth is preserved. Fake
CLI procedures remain explicitly definition-only.

P4: explicit JSON unbounded A correctly describes current namespace and event
whole-scan behavior; bounded result arrays are not misrepresented as bounded
scans. B's proposed shared pages/attempts/monotonic deadline spans all six
branches and the event outer loop; retries retain page reservations and spend
attempts, preserve selectors/cursors/byte ceilings and do not refund attempts.
Counters/timers have representable supported domains, admission/cancellation
and partial/not-started truth are specified, and native API/auth/JSON failures
are not converted to a budget success. Findings concern concrete case closure,
not rejection of that coherent same-owner design.

## Per-gate conclusion and remaining inputs

| Bounded criterion | Verdict |
| --- | --- |
| Source identities/current defaults/full fixtures/canonical joins | Verified at this dirty pinned stand |
| Same existing owner paths/no competing proposed author/no defaults | Coherent proposed definition; not implemented |
| Typed domains and substantive P1–P4 semantics | Coherent with limits above |
| Exact real-caller/positive/negative/mutant recipes | **Not accepted: PFCR-01–04** |
| Native/implementation effects, global C0, authorization | Not run/not assessed/not granted |

Genuine external inputs remain original pinned Envoy/tool/image receipts and
isolated fault capability; original Kubernetes/API/CA/token/grants/namespace and
independent audit or authenticated wire observations; original Hubble/relay known
flows/peer/loss evidence; actual provider revision/mounted rollover/process
identities. The missing concrete controls above are internal definition work,
not external-input blockers. Correct them and obtain a fresh bounded recheck;
do not promote this inspection or the author's counts to whole-C0/native PASS.
