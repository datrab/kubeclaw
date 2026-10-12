# Independent review: required Worker Core scope capacity

Status: bounded explicit-capacity change accepted after independent review and the final corrections documented below. This does not accept native execution, all Worker configuration, or CONFIG/D17 as a whole.

The reviewer did not author this change. Comparison with the preserved author baseline confirms exactly three production lines change: the option becomes required, the constructor forwards it without `?? 128`, and startup validates missing capacity instead of bypassing validation. Both actual Prism and Buster compositions still forward their trusted host-pool capacity. No additional operational author is introduced.

The complete [baseline comparison](../../evidence/independent-config-worker-scope-required-20260921/before-diffs.txt) shows that original test assertions remain unchanged. Four fixture objects explicitly receive their previous capacity of 128. The additional maintained case exercises nine invalid inputs and preserves existing durable ownership bytes. Native fixture edits were inspected and typechecked; those native tests were not executed.

## Independently executed checks

[Commands and results](../../evidence/independent-config-worker-scope-required-20260921/results.json) record:

- Original ownership module: 10/10, no skips or cancellations, using the actual util-linux flock bound through the existing proot tool.
- Original modeled quiescence module: 3/3, no skips or cancellations.
- Independent counterprobe: 14 invalid scalar/structured values reject with exactly `WORKER_NATIVE_CAPACITY_INVALID`; capacities 1, 7, 129 and the largest safe integer reach the intentionally absent filesystem path. No supervisor admission occurs. This demonstrates validation order and absence of an extra 128 clamp, not real kernel capacity enforcement.
- Worker Core and maintained native-test typechecks: exit 0.
- Canonical scoped ESLint on the production module and four affected test modules: exit 0.
- The author's private old-fallback mutation, independently rerun: the maintained invalid-capacity test fails with an actual assertion because the old bypass reaches filesystem validation. The filtered negative control is not counted as an original-suite pass.

The author's initial BusyBox flock failure and indirect fixture type error remain preserved. No original oracle, deadline or production limit was relaxed.

## Binding and remaining verification

The initial independent before/after manifests bind 384 source/config/test files, with an empty drift list. A separate Node module-load hook subsequently records the actual 114-file ownership import closure, including contract modules, AJV and formats. That trace exposed dependencies not present in the initial broad manifest. The initial run is therefore not represented as a fully transitive final binding; a short final bound ownership/quiescence/probe run remains necessary once the shared test slot is available.

The maintained `tsconfig.native-scope.json` omits `worker-ownership-store.test.mts`, including its new nine-input case. This is a verification coverage finding, not a production defect. The author has been asked to include the module and then rerun the maintained typecheck. Final acceptance will be recorded additively after these checks, retaining this checkpoint.

## Final correction and bounded acceptance

The author additively included `worker-ownership-store.test.mts` in the maintained native-test type configuration, without removing any existing module. The [final independent run](../../evidence/independent-config-worker-scope-required-20260921/final-results.json) passes ownership 10/10, modeled quiescence 3/3, all 18 independent input probes, and that expanded maintained typecheck. The prior typecheck result is not retroactively described as covering the new test.

The corrected [before](../../evidence/independent-config-worker-scope-required-20260921/final-before.json) and [after](../../evidence/independent-config-worker-scope-required-20260921/final-after.json) manifests bind 889 files, including the measured runtime closure, contracts and schemas, AJV and formats, relevant foundation/Worker sources, fixtures, and configuration. The final drift list is empty. Initial evidence and its incomplete binding remain preserved above. Scoped lint and the three-line production/baseline comparison remain valid; the subsequent change was only the additive test typecheck inclusion.

No blocking finding remains for this bounded removal of the capacity fallback. Real cgroup capacity enforcement and execution of the modified native fixtures remain unexecuted in this review. Other Worker defaults and the complete D17 migration remain open.

After the final run, Root added only the `verify:config:components` package script. The independent [byte reconstruction](../../evidence/independent-config-worker-scope-required-20260921/package-command-addition.json) proves that removing that one line restores the exact package hash captured by the final run. Dependencies, exports, existing commands and Worker source are unaffected; this additive command does not justify repeating the runtime checks.
