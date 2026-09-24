# Echo review Phase 9 hardening

Status: implemented and under paired historical evaluation

## Purpose

Phase 9 found that Echo could identify real KubeClaw defects, but source citations
could not cross the review trust boundary. It also found missing production context,
missing simplification facts, weak handling of large diffs, and one governor error
path that could escape without a report.

This change closes those system gaps before production promotion. It does not make
the reviewer strict about formatting, naming, or subjective code form. Static lint
owns those concerns.

## Trusted reviewed source

Every source context item is read from the adapter-proved frozen Git revision. Its
content digest is now a review evidence identity with kind `reviewed-source`.

Echo and the independent verifier may cite that identity. Proposal preflight,
reduction verification, and verifier reconciliation all use the same offered-
evidence authority. A cited location must still exist in reviewed context, remain
inside allowed scope, and pass changed-line proof where policy requires it.

This does not trust arbitrary model text or workspace files. Only the exact bytes
already accepted into the immutable bundle become citeable.

## Production context discovery

The repository adapter can list tracked paths from the same frozen revision proof.
The review plugin uses that list and frozen source bytes to add deterministic
context candidates for:

- direct relative imports, including bounded transitive imports;
- nearby tests;
- contracts and schemas;
- package and plugin configuration;
- ownership files; and
- public export files.

Every candidate keeps its source path and dependency depth. The existing context
authority validates provenance, scope, file size, total bytes, file count, and
dependency depth before any item enters the bundle. Caller-provided candidates
remain supported and are merged without duplicate paths.

## Deterministic large-diff slicing

When all changed files fit the focused initial limits, the existing single-bundle
flow and one bounded expansion remain unchanged.

When changed files do not fit, the plugin selects them under the total review
limits and groups connected context by changed root. It packs those groups into
stable slices using file and byte limits. Contract, schema, configuration,
ownership, and public-export context may form one additional bounded integration
slice.

Each slice uses the same frozen revision, changed manifest, policy, requirements,
and deterministic simplification manifest. Echo reviews slices separately. The
plugin then merges inspected evidence, requirement assessments, and exact findings
in a stable order before one independent semantic verification and one canonical
report. Blocking citations are kept before optional inspected-evidence entries.

No changed file is silently truncated. If total limits cannot include every changed
file, the stage requires orchestration as before.

## Simplification facts

The review plugin now produces a first conservative fact class from frozen source:
a high-confidence function that only forwards the same parameters and returns the
target result. The fact creates a `SIM002` candidate. It remains advisory and tells
Echo to retain the wrapper when it owns a documented policy or compatibility
boundary.

The producer is intentionally small. Rules that require a complete usage graph are
not guessed from text. External analyzer facts remain supported.

## Governor failure handling

An artifact-provider failure while reading prior governor history is converted to
certified `invalid_state`. The attempt stores its immutable report and returns a
blocked result. It no longer escapes before report persistence. Core still owns
retry behavior for transport failures outside this certified history boundary.

## Reviewer focus

The reviewer protocol now prioritizes:

- correctness and security;
- contract and authority failures;
- lifecycle and retry behavior;
- concurrency and locking;
- persistence, recovery, and cleanup; and
- data loss.

It explicitly excludes formatting, naming preferences, stylistic form, and
subjective code-shape advice. A P0 claim must describe a serious, directly
evidenced failure path. The independent verifier receives the same source-evidence
instructions.

## Architecture decisions

- The repository adapter supplies facts, not review decisions.
- The review plugin owns candidate selection, slicing, merging, and policy.
- Echo never controls slicing, evidence authority, severity policy, or lifecycle.
- Core remains the only retry, repair, wait, and transition authority.
- Large reviews still produce one canonical report and governor decision.
- The normal review remains diff-focused. This is not a whole-repository audit.

## Post-evaluation audit hardening

The final independent audit identified four trust and coverage edges. They are
closed as follows:

- Every reported source location requires its matching `reviewed-source`
  citation. A missing citation or a digest from another file rejects the
  finding before semantic verification.
- Review slices use deterministic connected components built from both certified
  context provenance and actual relative imports. A connected component is never
  split; if it cannot fit a bounded slice, review requires orchestration.
- Relative imports with emitted extensions are resolved back to source files.
  For example, `./worker.js` can select the tracked `worker.ts` used by TypeScript
  NodeNext projects.
- Caller discovery applies the requested result limit only after candidate text
  matches have been parsed and proven as real imports. A separate fixed scan
  ceiling still bounds repository work.

The context-resolution and slicing regression suites are part of the canonical
review-package test command, so these guarantees cannot be skipped by normal CI.

## Evaluation

The final paired historical evaluation and per-case adjudication are recorded in
`echo-review-phase-9-evaluation.md`.
