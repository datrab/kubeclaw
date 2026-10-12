# Independent Worker Core local policy and provider cancellation review

Status: the bounded functional LC1–LC5 and PC1–PC3 checks pass independently on the frozen source. **Full quality acceptance remains open:** canonical lint reports 31 Runner/test findings and 12 provider-child findings. This is not overall CONFIG, Buster execution, native preparation or image acceptance. The identified PC-DOC chronology defect was corrected after the runtime freeze and independently rebound below.

The reviewer did not author either migration. Earlier Buster admission implementation is prior baseline, not an independently reaccepted change here. Criteria are [LC1–LC5/LC-DOC](config-worker-local-runtime-inventory-20260921.md) and [PC1–PC3/PC-DOC](buster-provider-cancellation-20260921.md).

## Independent execution and binding

Evidence: [independent review directory](../../evidence/independent-config-worker-local-runtime-20260921/). The reviewer wrote `run-review.py` and `run-controls.py`, rather than rerunning the author's orchestration. These use the previously reviewed binding/diagnostic utilities and the inspected exact GNU-flock mapping hook. Command vectors, durations and raw output are retained.

`run1` (session 31040) is overall **exit 1**, solely because both strict lint commands fail. Actual results:

- Genuine separate-process GNU flock exclusion, release/reacquisition and GNU tar archive roundtrip pass.
- The maintained `verify:worker-core:local-config` command passes, including original Core contracts, all seven policy cases and actual production replay profiles 1/2 with two jobs each.
- All 10 original deadline cases pass. Full original Runner, real remote-provider and remote-runtime configuration scripts each exit 0.
- The complete maintained component suite passes 565/565, with no skipped/cancelled cases, including both Helm/AJV settings matrices and the sixth owner delivery checks.
- Both local-runtime and Foundation type projects exit 0.
- Canonical touched-source lint reports 31 findings; child lint reports 12. Neither is described as green.

`controls1` (session 24315) exits 0 because all five deliberately bad variants are detected. Each Core fallback restoration actually loads and produces the corresponding omission assertion failure. Replacing the production replay value with 65536 actually runs the prohibited second provider and produces a second evidence artifact; the expected one-attempt assertion fails. Removing only the child's SIGTERM handler makes the full original Runner fail the existing cooperative `aborted.txt` assertion after provider startup. This is an actual process-path failure, not a syntax or initialization failure. The child-path hook changes only the executable source argument and its matching filesystem-read permission; other launcher options remain intact.

Both before/after manifests have drift `[]`. The positive broad binding contains 33,173 source/dependency/tool identities. Actual module-load observations contain 2,552 unique file/hash pairs, with no mismatches against bound files. The 97 external global npm launcher modules outside the broad manifest are separately recorded by their actual load hashes and exact matching subsequent snapshots in `external-module-binding.json`. They are **not** retrospectively claimed to have broad prebinding. GNU binaries and observed `ldd` libraries are bound. No diagnostic source-write violations were reported.

The write hook is diagnostic, not a sandbox: direct descriptors, FileHandle APIs or external writers can escape its coverage. Provider processes deliberately receive clean environments and do not inherit module tracing; their sources, sandbox binary and dependencies remain covered by the broad binding, not claimed observed by that trace. No PRoot wrapper, native ownership model substitution or provider budget change is used to make real provider execution pass.

## Source and original-contract review

One `worker-core.config.json` authors the three required settings. Core accepts and freezes explicit typed values; the constructor/validator has no fallback or coercion. Timer bounds remain 1–2147483647 and replay capacity 1–1000000. The actual CLI reads one full bundle snapshot, then factory → service → prepared execution → runner → default Core forwards the policy. The runner and service validate before their effects. Custom runtime injection still requires the policy and is not used as proof of its implementation.

Source inspection found one production `new LocalWorkerRuntime` in the Runner. No new Buster drain call was introduced. The production replay test uses actual factory/default Runner/default Core and a discovered real provider; preparation remains explicitly modeled. Two jobs per profile establish per-prepared-job scope. Core drain/cancellation tests prove Core lifecycle behavior, not an invented Buster shutdown integration.

Root's `#reclaimExpiredAttempts` extraction preserves the original loop and ordering before duplicate/capacity admission. The shared loader, schema, both chart validators, owner references, mounted bundle, checksum and release/COPY paths carry the sixth owner. Packaging and Docker-source checks do not prove a built image; no such acceptance is claimed.

The original fixture insertions explicitly author prior effective values. Two later semantic fixture corrections were reviewed separately: the 5-ms positive timeout now settles on its actual abort signal, while the exact original nonsettling behavior is retained as an unresolved negative with no cleanup/evidence. The excessive-log positive now uses a real registered provider, observes its PID, requires ESRCH and unchanged marker, and retains the original error and sub-1000-ms bound; the old modeled nonsettling log case remains an additional unresolved negative. These are not disguised as configuration-only literal insertions.

`original-assertion-mapping.json` independently compares TypeScript assertion-call AST text, normalizing whitespace and the explicit policy insertion only. All 116 original Runner, 18 real-provider and 19 deadline assertions remain; the Runner adds 14. The original hard timeout remains 20 ms with a sub-2000-ms stop assertion. The original cooperative marker assertion remains unchanged and detects the private PC control.

PC adds a permanent SIGTERM listener to the existing child AbortController. It does not report fabricated completion or add a grace interval. The parent still sends IPC abort followed by group TERM, retains its 500-ms forced escalation and 1000-ms termination bound, and requires actual closure. The maintained Engine boundary documentation explains repeated TERM, cooperative abort, forced termination and unresolved work.

## Open quality and documentation gates

`lint-comparison.json` independently compares current diagnostics with archived-before evidence. The 31 scope findings correspond to the prior 32 after removal of Core's complexity finding; no newly classified diagnostic remains. Child rule/message multiplicities are exactly the same 12 as before. Existing origin does not exempt these files from the user's quality requirements: broad Runner/test complexity and size, child mutable state, dynamic loading and console findings remain unfinished work. No rule or ignore was relaxed in this review.

The PC author report initially presented the earlier missing-handler state in present tense at the top. After the runtime freeze, the author corrected its head to the implemented functional state and marked the earlier missing-handler observation as historical. Independent recheck confirms the exact after hash `7732f3585cb7da6ddd86b497fd146f49f46c7e52f7d35e5191e3b6461fd478c9`; the original report remains archived in `doc-final/before.md`. This bounded DOC defect is resolved; the quality limits remain explicit. Historical failed runs, including PRoot SIGSEGV, invalid fixture assumptions, run8 cancellation failure and author mutant harness errors, must remain failures. The independent positive results here do not relabel them.

Functional evidence is sufficient for the specified configuration propagation and cancellation correction. Final quality acceptance, broader D17 hidden authors, actual native preparation, production images and live deployment remain separate open gates.
