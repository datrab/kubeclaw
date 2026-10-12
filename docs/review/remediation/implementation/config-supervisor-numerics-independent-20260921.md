# Independent review: Prism supervisor numerics — 2026-09-21

**Bounded acceptance of the nine-setting configuration migration.** This reviewer
did not implement the slice and changed no production files. The review used
[CS1–CS6 and CS-DOC](config-supervisor-numerics-20260921.md), traced the actual
production composition, inspected test semantics and independently reran the
affected suites. The privileged NRI gate still fails on this host; this report
does not close native execution, CONFIG F1–F6, REGISTER or the full thirteen findings.

Evidence is in `docs/review/evidence/config-supervisor-numerics-independent-20260921/`.
`source-identities.json` and its `.snapshot` files identify the reviewed sources;
`author-source-check.json` independently compares every author-listed live source
and retained snapshot to its recorded hash. All matched. This is a selected source
record, not a full dependency archive or an assertion that unrelated concurrent
OBS work leaves the entire repository unchanged.

## Findings against the criteria

| Criterion | Independent observation and disposition |
| --- | --- |
| CS1 | Accepted. The shared strict schema requires exactly nine supervisor fields. Their defaults and positive integer limits match the original numeric resolver in the Git baseline: 2147483647 except journal bytes at 9007199254740991. Missing fields/objects, null, strings, zero, negative, fractional, excessive and unknown values fail in the real loader and actual Helm renders. |
| CS2 | Accepted. `loadWorkerConfig` obtains one shared validated snapshot. The native supervisor object is frozen and later file/env changes do not replace it. All nine old keys are explicitly rejected even when empty. Searches found those keys only in the rejection list and the old Helm-key rejection, with no production numeric environment read/fallback. |
| CS3 | Accepted for configuration and unprivileged consumer behavior. `runNativePrismWorker` passes the mapped record/byte values to the real ownership store and spreads the mapped snapshot into `NativeWorkerOwnership.supervise`. `nativePrismExecution` uses it for real journal admission and process limits; `nativePrismCommand` carries UID/GID. The unchanged actual consumers use poll for resource observation, close for cancellation/control/process settlement, and drain for both launcher and scope drain. Two authored profiles change real store and output-spool acceptance; journal tests reach the real preallocation boundary. Actual UID/GID switching, polling and drain on a privileged host remain unproven. |
| CS4 | Accepted. Runtime and Helm both reject shutdown equal to or below authored close plus drain, including the one-millisecond boundary. Helm still requires Pod grace strictly above shutdown. The previous fixed ten-second drain term is replaced by its authored value. Request-body timeout remains independent. This preserves the existing deployment invariant; it is not measurement of the full worst-case host shutdown duration. |
| CS5 | Accepted. The old Helm close key and environment emission are removed and old overrides fail. Actual packaged/chart renders deliver both ConfigMap mounts and changed rollout checksums for two profiles; mounted JSON is consumed by the real loader. Root-owned pool policy, runtime/node identity and launcher/supervisor authority checks remain in production before privileged operation. The pure numeric mapping helper does not bypass them in the production composition. |
| CS6 | Accepted for the runnable configuration/runtime/render/release suites below. Two independently rerun negative controls detect lost drain-budget validation and a hardcoded output limit through actual output-spool behavior. The original Go/NRI trust test remains nonpassing, explicitly outside this bounded acceptance. |
| CS-DOC | Accepted for this slice. Central operator guidance lists all nine values, units, consumers, limits, old-key rejection, snapshot/restart behavior and native-host limits. Inventory maps nine settings to ten historical reads, including the retired Helm close author. Existing historical source locations remain observations rather than current runtime authors. No completeness claim was added. |

The extracted `prismSupervisorSettings` function is a small direct mapping reused
by production after actual pool/runtime validation. It introduces no second
configuration resolver or fallback. The removed preliminary filesystem UID fixture
is not used by final tests or this review. Consumer tests explicitly throw before
native allocation and do not fabricate kernel resources, receipts or policy trust.

## Independently rerun evidence

| Log | Result and boundary |
| --- | --- |
| `supervisor-helm.txt` | 255/255 pass, no skips: supervisor configuration plus original actual Helm suite. |
| `runtime.txt` | 130/130 pass, no skips: original worker, result/dispatch, resource policy, HTTP behavior, input and Control configuration selection. Supervisor cases are in the separate 255-case run. |
| `journal.txt` | 14/14 pass, no skips: six supervisor consumer cases, two original Prism journal cases and six original worker journal cases. Real GNU flock via Proot path binding; no fake root. |
| `release.txt` | 25/25 pass, no skips: original release/configuration/images/runtime-input and actual materialization tests. |
| `control.txt` | 24/24 pass, no skips: all original `control*.test.mts` plus `e2e.test.mts`. |
| `native.txt` | Actual Helm/native selection passes. Actual Go-built NRI policy check fails `NATIVE_NRI_POLICY_NOT_TRUSTED`; total 1 pass / 1 fail. Local UID is 1000. No ownership metadata, root identity or kernel capability was forged. |
| `typecheck.txt`, `lint.txt` | Prism typecheck and canonical lint for the eight changed JS/TS files exit 0. |
| `mutants.txt` | Both semantic negative controls detected; exact rerun script retained as `run-mutants.mjs`. |
| `docs.txt`, `refs.txt` | Existing-tree documentation checks pass at review time: 922 active Markdown files, 2229 local links and 813 repository path references. These counts precede adding this review document. |

Commands are retained in `commands.txt`. Counts describe their actual selections,
not disjoint totals: Control configuration occurs in more than one selection.
No successful privileged host execution or cluster rollout was performed.

## Inventory reconciliation

`inventory-counts.json` normalizes both existing inventory resolution formats and
confirms **20 distinct current authored settings / 23 historical reads**. The input
limit has three historical consumers; close has both a former environment and a
former Helm author. The five HTTP-worker rows corrected by the root reviewer were
already implemented settings, not five new migrations.

Their units agree with `WorkerLifecycle.admit`: the ordinary threshold counts all
active requests, and `maximumProbeRequests` supplies additional slots available
only to probes. It is not an independent cap on the number of probes. Connection
count and request/shutdown milliseconds retain their original meanings.

The remaining host gate needs the actual trusted root-owned pool policy and
permitted native kernel environment. This review does not substitute filesystem
or mapping tests for that gate and does not certify host timing/capacity from
schema validity alone.
