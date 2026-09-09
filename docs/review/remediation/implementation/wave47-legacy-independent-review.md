# Independent review: explicit legacy authoring importer

Reviewed product worktree: `wave47-product`, HEAD
`ba999e2357c2162bbaeac48122105972bab72970`; importer implementation
`63856dfc54ee3461bebb0ae0cb467432c55c2f63`. Packaging from `b1c2ec5` is separately
reviewed by the orchestrator. This reviewer changed no product source.

**Result: no blocking findings in the reviewed importer scope.** Sixteen
additional cases pass through the original CLI and real files, followed by the
unaltered original compiler/legacy-import cases. This proves authoring and
validation behavior, not execution, successful native tests, deployment, demo
delivery or operator acceptance.

## Authority and coverage review

`legacy-import.ts` copies only module identity mapping, module dependencies,
blueprint directory and explicit substeps from legacy declarations. The authored
project passes through `compileProject`; its allowed-field validation rejects
injected project approval and module status. Legacy result, approval, retry and
completion fields do not become execution state. Old gate states are not read as
verdicts. Every old gate instead needs a nonempty authored migration explanation;
the explanation is not an operator approval token.

The mapping must cover every old module exactly once, and dependency references
must resolve to mapped modules. The compiler's original coverage checks bind
module requirements and cumulative final checks to their resolved plans. Removing
final required checks fails before an output file is written. This is structural
coverage enforcement; it cannot establish that an authored requirement or test is
semantically sufficient without the subsequent reviews and execution.

A declared legacy `run_id` cannot be reused as the authored project run ID.
The importer does not start a run or allocate a runtime identity. Additional
read-only trace: normal `runPipelineV2` uses `runNewPipeline`, whose
`writeRunSnapshots` rejects an existing run snapshot with `RUN_ALREADY_EXISTS`.
Thus compilation does not silently recover previous V2 authority. That existing
runtime guard was inspected, not exercised by launching pipeline stages here.

## File and CLI review

The original CLI resolves the actual source file and requires the declared
repository root to be canonical before checking containment. An in-repository
symlink pointing to an outside source is rejected, as is a symlink alias used as
the repository root. Imported module and substep traversal is rejected. The
compiler still emits source-preflight and blueprint-sync: importing authoring is
not evidence that the source documents themselves have passed execution-time
admission.

The output is caller-selected and created with exclusive `wx`. Existing regular
files, existing output symlinks, dangling output symlinks and output equal to the
source are rejected without changing their targets. Combining import with the
project-execution flag rejects as an invalid CLI argument. Runtime registry/grant
validation occurs before the output write. Recompiling the actual imported file
through the original `--project ... --compile` CLI succeeds and creates no runtime
state directory.

## Executed independent cases

1. Legacy verdicts/approval/retry fields are discarded; original CLI recompile
   succeeds, with source-preflight and final-test present and no run created.
2. Same known legacy run ID rejects.
3. Authored project approval injection rejects.
4. Authored module status injection rejects.
5. Missing cumulative required coverage rejects.
6. Incomplete module mapping rejects.
7. Missing explicit legacy-gate decision rejects.
8. Module-directory traversal rejects.
9. Substep traversal rejects.
10. Source symlink escaping the repository rejects.
11. Noncanonical repository alias rejects.
12. Existing regular output is preserved.
13. Existing output symlink is not followed.
14. Dangling output symlink is not followed.
15. Output cannot overwrite the input source.
16. Import cannot be combined with project execution.

The original `check-project-compiler.mts` fixture supplied its actual temporary
Git repository, original compiler, provider registry and platform configuration.
An adjacent temporary copy inserted the independent hook immediately before the
existing `checkLegacyProjectImport` call, retaining all original assertions. Each
hook case spawned the original `skills/nova/pipeline.ts`; no compiler, provider,
filesystem or CLI result was mocked. The temporary harness was removed.

Raw final evidence:
`docs/review/evidence/wave47-legacy-independent-review.txt`.
Reproducible hook:
`docs/review/evidence/wave47-legacy-independent-probe.mjs`.
It exports `reviewLegacy({project, platformFile, temporary, runtime})` for the
original fixture context described above.

The initial reviewer run stopped because its error-message regular expression
expected uppercase words while the actual correct rejection said
`Invalid pipeline test-gate gateCoverage: /requiredChecks ...`. Only that reviewer
pattern changed to require the exact relevant diagnostic. The failed reviewer
run remains in `wave47-legacy-independent-review-initial.txt`; no product
validation or original test was weakened.

Native providers, full pipeline execution, live demo and human acceptance were
deliberately not inferred from any of these compiler/import passes. Their
separately recorded gates remain unchanged.
