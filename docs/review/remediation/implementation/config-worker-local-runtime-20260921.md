# Worker Core local runtime configuration — isolated implementation

Status: integrated author work, not independently accepted. The initial staging-only checkpoint below is historical; actual execution outcomes follow. The preimplementation criteria LC1–LC5/LC-DOC in [the accepted inventory](config-worker-local-runtime-inventory-20260921.md) remain unchanged. This work does not claim CONFIG completion.

## Fixed implementation boundary

The existing full component bundle gains `worker-core.config.json`, owner `worker-core`, with required `settings.localRuntime.drainTimeoutMs=300000`, `cancellationTimeoutMs=30000`, and `replayLimit=65536`. Existing timer/integer bounds remain exact. The common bundle snapshot returns a Worker Core sibling; it does not duplicate ownership in Buster Engine. The actual Buster CLI reads one snapshot and explicitly forwards this typed policy through production composition, service, prepared execution, and the default runner to Core. All public low-level constructors, including custom-runtime branches, require an explicit policy. No constructor or fixture supplies a missing policy.

Core remains independent of process-global config. Production replay capacity belongs to each prepared-job runtime. No Buster drain lifecycle is added; Core drain/cancellation proofs remain separate from Buster replay propagation. Existing store/readiness fallbacks and wider D17 work remain open.

Before any live integration: preserve every original contract/runner/deadline assertion and timer; stage all constructor fixtures explicitly; require missing/null/type/range negatives, two full profiles, actual default-path replay saturation/reclamation, actual Core drain/cancellation, three restored-fallback mutants, and a lost-production-replay mutant. Delivery must include entry/schema/loader/Helm/COPY/symlink/release checksum paths for the sixth owner. Final integration must rebase each staged file against its recorded live baseline; Listener changes and accepted shared work may not be overwritten.

## Evidence and pending work

Independent byte copies under `docs/review/evidence/config-worker-local-runtime-20260921/staging/{before,files}` are checked as distinct regular-file inodes. `baseline-identities.json` records the starting sources, including the now coherent Listener production delta. No hardlink or symlink copy is trusted for writable fixtures. Runtime checks wait until the combined Component/Listener review releases the source/test window.

## Staging checkpoint: explicit callers and decisive probes

The runner now validates and freezes its policy as its first constructor action, before any identity/store/directory preparation. The service likewise snapshots policy before readiness construction. Custom-runtime injection does not bypass this required contract. Original fixture constructors receive explicit prior effective values; no helper adds a missing policy. The insertion manifest is source bookkeeping, not a test result.

The new staged `check-pipeline-worker-local-config.mts` uses a genuinely discovered isolated provider and the production factory, real HTTP Nova submission, committed signed source, real prepared service/store, default runner and default Core. Native preparation ownership alone uses the already named modeled fixture. Profiles set replay capacity to 1 and 2 with two distinct sequential attempts per job; the first accepted identity remains live for the original claim window. Capacity 1 must persist the actual `WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED` path and must not emit second-provider evidence, whereas capacity 2 must execute both providers. A second separate job per profile proves per-job scope; persisted result bytes/digest and imported graph attempts remain checked. No substitute execute callback, worker runtime or provider loader is supplied.

Separate staged Core tests cover all three required values and exact bounds, real drain/cancellation under two policies and real replay saturation/expiry reclamation. Both chart validators are tested against AJV with missing, null, boolean, string, zero, negative, fractional and above-bound fields, plus inclusive lower/upper bounds. Packaging loops include the new owner in archive, literal ConfigMap and individual checksum checks. These are unexecuted preparations; type/runtime failures may remain until the coordinated integration window. Original contract scripts and their deadlines/assertions remain required.

## Integrated author checkpoint (not acceptance)

The 56 staged files were integrated after all expected live hashes matched; the completed Listener document was first rebased from separately retained bytes. The Root release-images correction remained byte-identical outside this patch. The additive maintained command was inserted by Root.

`run1`, `run2`, and `run3` are red overall, each with whole captured source/dependency/tree drift `[]`. The seven new Core policy cases and both maintained typechecks passed. Run1 exposed a faulty positive test setup (missing required repository directory); its corrected fixture now keeps real repository/workspace present while asserting no artifact/observability/V2-store creation on invalid policy. Run2 and diagnostic run3 reached real persisted remote results: first provider failed `TEST_PROVIDER_INITIALIZE_EXITED:null:SIGSEGV`; second retained the expected `WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED`. Zero provider evidence does not satisfy LC3. No assertion or deadline was weakened.

The separate bounded start diagnosis retained direct and PRoot executions of the same sandbox binary, Node binary and limits. Direct sandbox+Node succeeds; PRoot fails with exit255/SIGSEGV. PRoot page-size invocation succeeds; disabling its seccomp acceleration still fails. Its verbose trace reaches unchanged sandbox limits, no-new-privileges and seccomp, then the child's actual Node exec dies. The original real-provider script also fails in this PRoot environment. This establishes a concrete environment-dependent failure, not an accepted substitute for actual successful provider execution. No launcher or provider limit has been changed.

## Native tool-path correction and subsequent author results

With Root approval, the test harness runs Node and providers directly and maps only the exact `/usr/bin/flock` pathname for Node `spawn` and `spawnSync` to the hash-bound real GNU executable; arguments, options, descriptors and results are unchanged. All mapping uses are logged. The two real-provider fixtures accept an explicit test-only GNU tar path, retaining the original OS path otherwise. Production code, isolation, kernel limits and provider budgets are unchanged. Actual separate lock-holder/contender exclusion, subsequent acquisition and GNU tar archive extraction passed. The provider child has its original clean environment and does not inherit these hooks. This is a local tool-path accommodation, not a production image/host proof.

Run4 passed Core7, complete production replay (two profiles × two jobs with actual evidence bytes), both types and drift[]. Run5 preserved a red full original regression: original Core/deadlines/config and maintained component565/565 (including both Helm/AJV matrices) passed, while an old modeled Runner timeout and an unmapped synchronous Nova flock failed. After extending the same exact-path hook to synchronous flock, run6 passed the complete original real-provider script, replay and types; Runner and strict lint remained red, drift[].

Actual archived-before lint demonstrates 32 pre-existing findings, enumerated by file/line/rule in `lint-baseline/findings.json`. The two newly introduced findings (an eighth composition parameter and test nesting) were removed cohesively. No lint rule or ignore changed; the broad Runner and original test-file baseline remains unresolved quality work. Root's separate minimal Core reclamation-loop extraction was later accepted by exact byte comparison and is under the subsequent real checks.

The original Runner timeout fixture never settled its execute promise and merely logged terminate. Actual Core correctly quarantined further work, so its old `timed_out`/cleanup oracle contradicted the modeled behavior. Root authorized a bounded fixture correction: the original 5ms timed-out/cleanup case now settles on actual AbortSignal; the exact original never-settling behavior is retained additionally and must be errored/unresolved without cleanup/evidence. Run7 reached the next analogous log-hang fixture; its original TEST_PROVIDER_LOG_LIMIT and <1000ms requirements remain unchanged. Root authorized replacing that positive fixture with a genuinely registered provider that writes its PID, emits the same excessive log, and actually hangs. Its PID must disappear, and the marker remains unchanged after observation. The old modeled never-settling log overflow remains an additional unresolved negative. No global fake termination was added. The existing registered hardTimeout20ms/<2000ms test is unchanged. Run8 is the subsequent full-script check, not a preclaimed pass.

## Final author checkpoint for independent review

Run8 reached a genuine registered-provider cancellation failure, preserved unchanged.
The separately scoped PC correction and precriteria are in
[buster-provider-cancellation-20260921.md](buster-provider-cancellation-20260921.md).
Run9 then passed the complete original Runner, real-provider, Core/deadlines, seven
policy cases, actual two-profile/two-job default production replay and both types.
Its wrapper remains red because strict lint has 31 existing findings after the
cohesive Root-authored Core reclamation extraction removed one prior finding.
No rule was disabled. Original Runner positive timeout/log-hang fixture corrections
and the additional original-unresolved negatives are described above; all original
deadlines and result assertions remain.

mutants1 preserves three unique-target harness failures and one actual detected
production replay mutant. Corrected mutants2 detects all four intended mutations
through real assertions: each restored Core fallback and lost production replay
propagation; drift[]. PC control1 independently detects the removed child signal
handler through the original cooperative marker assertion, drift[]. final1 executes
the complete maintained verify:worker-core:local-config command successfully; child
lint is red with 12 unchanged pre-existing findings, separately compared before/after.
All author snapshots retain exact raw errors; no earlier red run is reclassified.

The prior maintained components run5 passed565/565 including new owner delivery and
Helm/AJV bounds, but final independent review must bind the combined current source.
This is an author handoff, not LC/PC acceptance. Native preparation remains explicitly
modeled in the production replay fixture; image, native guest and live gates remain
open. Existing broad Runner/child lint work is not claimed complete.
