# Preserve editable scaffold provider plans

PCR-SCAFFOLD-001: after first generation, `progress.scaffold.json.pipeline` is
the editable provider-plan source until `--apply`. Regeneration now retains the
entire object, including node configuration, dependencies, retries, concurrency,
scope choices and deliberate removals. Applied `pipeline.json` and inferred
defaults do not overwrite these draft edits. First generation without a prior
pipeline keeps the existing discovery/conversion behavior.

New modules and gates are still discovered. Their missing provider plans are
explicit validation diagnostics; the generator does not rebuild existing plans
to silently fill those gaps. Operators add the required new scopes to the draft.
An outer non-object pipeline or another project identity rejects regeneration
before writing. Nested incomplete plans remain editable drafts and are diagnosed
by the existing validation path; this is not a claim of full nested validation
before every draft write. Regeneration instructions now state source ownership.

Twenty-nine genuine CLI tests pass: four new regressions and all 25 existing
tests. New tests use actual temporary Git repositories and files, run
generate/edit/generate/check/apply, compare the full retained provider object,
exercise a separately changed applied pipeline, add a new discovered module,
and verify rejection without overwrite for another project identity. Independent
review repeated all four new tests and found no blocker for this source contract.
Scaffold TypeScript checking passes. The new test file has clean canonical lint;
the discovery module retains the same six pre-existing lint errors as HEAD
(three complexity errors, one file-length error, one function-length error,
and the existing scope-builder complexity error). No lint rule was relaxed.

## Remaining publication boundary

The finding also requested examination of two-file apply publication. A real
filesystem fault confirms that boundary is still unsafe: generate and apply a
valid draft, change its description, replace the target `pipeline.json` with a
directory, then apply again. The original CLI exits 1 with concrete `EISDIR`,
but `progress.json` has already changed. The two output files are not an atomic
transaction; process interruption between writes has the same design risk.

No rollback shim or claimed atomic rename of two files was introduced. This
finding remains partially implemented until publication has one coherent
generation/commit boundary shared by its readers, with genuine interruption
and second-write-failure verification. The draft edit-loss defect is fixed and
verified; the apply boundary is explicitly still open. No CI or deployment ran.
