# Echo review Phase 3 design

Status: complete
Owner: `skills/nova/plugins/review`
Phase: frozen review bundle and focused context selection

## Objective

Replace the loose stage input with one immutable, reproducible review bundle.
Normal review remains diff-focused. Phase 3 selects bounded context from
candidate paths supplied by deterministic upstream producers; the review stage
hydrates those paths from one frozen Git revision. It does not build a
whole-repository graph.

## Point 1 — input and capability audit

Status: complete

### Current boundary

The Phase 2 stage accepts a task, requirements, and arbitrary content-addressed
evidence. It does not identify a base or head revision, changed files, allowed
scope, contextual source files, inclusion reasons, or context-selection limits.
The review plugin requires only `runtime.dispatch`.

The platform exposes `git.repository.read` through
`kubeclaw.repository-adapter`, but that adapter intentionally supports only a
bounded `read_text` operation for a path the caller already knows. It does not
list files, calculate Git diffs, resolve symbols, infer ownership, or construct a
dependency graph. Lint and contract stages already produce some useful repository
facts, but no generic graph capability exists.

### D-ER3-001: Phase 3 adds immutable Git reads, not repository discovery

Phase 3 will not add repository discovery, symbol indexing, or graph construction
to core or the review plugin. It will extend the repository adapter at its existing
`git.repository.read` ownership boundary with narrowly bounded operations that:

- freeze the configured checkout's full immutable `HEAD` object ID when the
  review stage begins and optionally require an operator-configured expected head;
- require the review head to equal that frozen authorized head;
- accept a base only when it is a commit ancestor of the authorized head;
- return the normalized changed-path manifest for exactly that base/head pair,
  filtered to explicitly authorized repository prefixes; and
- read one explicitly named UTF-8 file at the authorized head revision.

The adapter uses argument-safe Git execution, retains canonical path and byte
limits, rejects symbolic refs and path escape, and never exposes unrestricted
listing or command execution. Capability grants still constrain readable path
prefixes. It never returns base-revision file content, unreachable-object content,
or content from a commit other than the frozen authorized head. This is the
minimum authority needed to prove that reviewed bytes and changed paths belong to
the authorized review target.

### D-ER3-002: Upstream producers supply candidates; review owns selection

The stage input carries an immutable base revision, allowed scope, evidence, and
context candidate paths with provenance. Candidate producers may use
TypeScript analysis, dependency-cruiser, Knip, plugin manifests, contract
registries, test configuration, or Git before invoking review.

The review plugin validates every candidate and deterministically selects the
bounded subset sent to Echo. Selection policy, inclusion reasons, limits, bundle
identity, and context expansion remain review-domain ownership.

The adapter resolves the stage-time head and returns a proof privately bound to
the current pipeline attempt. The plugin uses that proof to hydrate every changed
file and optional candidate path from the exact head. It also obtains the
authorized base/head changed-path manifest from the adapter. Candidate bytes are
therefore bound to the frozen review target rather than supplied by the caller.
Deleted paths may appear in the changed-path manifest but have no context bytes.

This avoids runtime plugin-to-plugin imports. Candidate provenance is data, not a
dependency on the producer implementation.

### D-ER3-003: Immutable revisions and normalized repository paths are mandatory

The new bundle identifies full immutable base and head object IDs. Symbolic refs
such as branch names are not accepted. Changed files, scope prefixes, candidate
paths, and requested expansion paths use normalized repository-relative paths.

### D-ER3-004: Normal review receives no unrestricted repository view

Changed files are always eligible. Additional candidates require typed inclusion
reasons tied to a changed or already selected file. Selection has deterministic
ordering, file-count, per-file-byte, total-byte, dependency-depth, and ownership
limits. Every selected item records why it was included.

The future repository graph and whole-codebase audit remain deferred in
`echo-review-roadmap.md`.

### D-ER3-005: One expansion is review data, not lifecycle control

Echo may return one structured request for additional known candidate paths. The
plugin validates the request against the frozen candidate set and scope, expands
the same bundle once, records the reason, and redispatches. Echo cannot browse,
change revisions, add evidence, or create a lifecycle result.

### Point 1 proof

- review manifest and input schema inspected;
- SDK/core capability authorization inspected;
- repository-adapter implementation and security boundary inspected;
- current stage callers and live tests inspected; and
- the minimum immutable Git proof surface identified without introducing graph,
  symbolic-ref, unrestricted listing, or command authority.

## Point closeout protocol

Each point receives focused tests, TypeScript and contract checks where
applicable, `git diff --check`, a dedicated commit, Terra/high independent review against
that commit, independent finding verification, and a documented closeout before
the next point begins.

## Point 2 — canonical `review-bundle.v1` contract

Status: complete

### D-ER3-006: The bundle is review data, not a lifecycle result

`review-bundle.v1` contains the task, immutable revisions, verified changed-path
manifest identity, allowed scope, requirements, evidence, selected UTF-8 context,
typed inclusion reasons, selection algorithm version, candidate-manifest identity,
expansion round, and resolved policy digest. It contains no PASS/FAIL field,
remediation instruction, wait, retry, or core transition.

The bundle digest is stored beside the deeply frozen bundle rather than inside the
value, avoiding a self-referential hash. Point 3 implements that snapshot.

### D-ER3-007: One executable schema authority

The TypeScript contract exports the canonical JSON Schema. A deterministic
generator emits `schemas/review-bundle.v1.schema.json`; `schema:check` fails on
drift. Hard limits are shared with the parser and selection implementation that
follow. Git object IDs must be full 40- or 64-hex values, paths are normalized,
and context is bounded UTF-8 text. Evidence content is bounded canonical JSON
text. JSON Schema provides the coarse shape and character ceiling only. The
exported semantic bounds check enforces actual UTF-8 bytes, canonical evidence,
and bounded evidence depth because JSON Schema `maxLength` counts characters
rather than bytes. Point 3 must invoke that check at the authoritative bundle
construction and parsing boundary before any bundle can enter production use.

### Point 2 proof

- generated standalone schema is current;
- contract and semantic-bound unit tests pass;
- package TypeScript and focused lint pass;
- documentation and `git diff --check` pass.

## Point 3 — deterministic parsing, freezing, and digesting

Status: complete

### D-ER3-008: Semantic parsing is the bundle trust boundary

The strict parser rejects unknown or missing fields, invalid object IDs, path
escape, duplicate identities, invalid rename/copy metadata, out-of-scope context,
invalid reason provenance, digest mismatch, non-canonical evidence, excessive
depth, and actual UTF-8 byte overflow. It normalizes every unordered collection
before deeply freezing the accepted bundle.

### D-ER3-009: Bundle identity is external and reproducible

The snapshot digest is SHA-256 over canonical JSON of the normalized frozen
bundle. A module-owned certification prevents callers from constructing fake
snapshots. Equivalent input ordering produces the same digest; content, policy,
revision, scope, or selection changes produce a different digest.

Repository authorization and candidate selection remain injected facts at this
pure boundary. Point 6 connects adapter proof to bundle creation before dispatch.

### Point 3 proof

- parser and snapshot unit tests pass;
- semantic resource bounds execute in the parser;
- schema drift, package TypeScript, focused lint, documentation, and
  `git diff --check` pass.

## Point 4 — deterministic focused-context selection

Status: complete

### D-ER3-010: Candidate provenance is closed and ordered

Every hydrated context candidate carries normalized content, a matching SHA-256
digest, one or more typed reasons, and a dependency depth. Changed files are the only
depth-zero roots. Every relational reason must point to an existing candidate at
a lower depth. Deleted files, cycles, self-links, unknown reasons, expansion
reasons, path escape, and out-of-scope provenance are rejected before selection.

Candidates are ordered without locale-sensitive comparison by dependency depth,
reason priority, and normalized path. The candidate-manifest digest covers the
ordered path, content digest, reasons, and depth. Input order therefore cannot
change selection or identity.

### D-ER3-011: Context limits are active policy, not reserved configuration

The review policy now actively controls maximum selected files, bytes per file,
total selected context bytes, and dependency depth. Built-in `gate`, `lean`, and
`audit` profiles use the same selector with different limits; they are named data
profiles, not separate runtime branches. Hard candidate count, candidate bytes,
file count, file bytes, total bundle bytes, and dependency-depth ceilings remain
non-configurable.

The selector records every omitted candidate as `dependency_depth`, `file_bytes`,
`file_count`, `total_bytes`, or `unreachable`. It does not silently truncate the
candidate set and does not decide pipeline lifecycle. Point 6 will translate
material omissions, including missing changed-file context, through review policy
and the existing stage result boundary.

### Point 4 proof

- permutation tests prove stable candidate identity and selected order;
- scope, provenance, digest, reserved-reason, depth, file-count, and byte-limit
  tests pass;
- policy schema generation, parser cross-field checks, profile tests, package
  TypeScript, focused lint, and `git diff --check` pass.

## Point 5 — one bounded context-expansion round

Status: complete

### D-ER3-012: Echo requests context; it does not browse

`echo-review-output.v1` may contain one optional `contextRequest`. The request
contains normalized candidate paths, affected requirement IDs, and a bounded
reason. The response parser requires requested IDs to be assessed as `unverified`;
an exported pure authority check binds them to the bundle's declared requirement
set before expansion. A request cannot accompany findings and cannot name
arbitrary repository paths at execution time.

The plugin accepts only paths from the immutable candidate manifest that the
initial selector explicitly omitted. It rejects duplicate, unsafe, unknown,
already-selected, changed-manifest, and second-round requests. Candidate content,
revisions, evidence, policy, and manifest identity cannot change between rounds.
The candidate-manifest digest includes every selection-relevant field: path,
content digest, typed reasons, reason source paths, and dependency depth.
The selector accepts only a resolver-certified policy. The initial selection
records the complete resolved-policy digest, a digest of its exact context limits,
and a digest of the frozen scope. Expansion rejects a different policy, limit set,
or scope. A module-owned initial selection is consumed after its first valid
expansion, so retaining the round-zero object cannot create parallel or repeated
expansion branches. Certification is held by a controller instance private to the
selector module; exported code cannot add forged objects to that controller's
ownership set.

### D-ER3-013: Expansion is cumulative and uses reserved capacity

The initial selection has configurable file and byte budgets below the total
context budgets. One expansion may add at most `maxExpansionFiles` known omitted
candidates into that reserved capacity. Previously supplied context is never
removed. Requested dependency chains remain subject to stable candidate order,
dependency depth, per-file bytes, total files, and total bytes. Added files retain
their original reasons and receive `context_expansion` provenance.
Candidate inputs reserve one hard-bounded reason slot for this provenance, so an
expanded item cannot exceed the context contract's per-file reason ceiling.

The three profile values are active policy inputs. They all use the same expansion
implementation. An expansion that cannot fit remains explicit in the omission
record; it never increases a hard ceiling and never creates lifecycle control.
Point 6 will decide whether a failed material request blocks or escalates.
Custom policy parsing requires both initial limits to be strictly lower than the
corresponding total limits, so an enabled expansion cannot be configured with
zero file or byte reserve.

### Point 5 proof

- parser and JSON Schema tests cover valid requests, unsafe paths, duplicates,
  verified requirements, and requests mixed with findings;
- selection tests cover cumulative expansion, frozen-manifest identity, known
  omissions, reserved capacity, provenance, and second-round rejection;
- policy schema/parser tests cover initial-versus-total cross-field limits;
- package tests, TypeScript, focused lint, documentation, and `git diff --check`
  pass.

## Point 6 — live immutable bundle assembly and dispatch

Status: complete

### D-ER3-014: Repository proof precedes every Echo dispatch

The repository adapter freezes the checkout's full `HEAD` commit when the review
stage starts. The caller supplies only the immutable base. The adapter accepts the
base only when it is an ancestor of the stage-time head, returns a normalized
base/head changed-path manifest filtered to requested prefixes inside the
capability grant, and reads explicitly named UTF-8 blobs only from that same
head. Manifest authority does not widen file-read authority: requesting the
manifest at repository resource `.` still leaves revision reads restricted to
the granted prefixes. Git is invoked with argument arrays rather than a shell. Symbolic
refs, unauthorized heads, traversal, non-files, invalid UTF-8, and oversized
content are rejected.

Before Echo sees a bundle, the review stage verifies the adapter's manifest
identity and independently compares every selected context path, head, content,
byte count, and SHA-256 digest with a revision read. Every non-deleted changed
path must be present in the initial selection. A policy limit that prevents this
returns the existing review orchestrator result; it is never silently truncated.

### D-ER3-015: The live agent input is exactly one certified snapshot

The loose task/evidence input was replaced by task identity, immutable base,
allowed scope, requirements, content-addressed evidence, and deterministic
context candidate paths. The caller does not supply the final head, changed paths,
source bytes, or source digests; the adapter is their authority. Evidence JSON is
canonicalized before bundle construction.

The stage constructs and snapshots `review-bundle.v1` only after repository
proof and context selection. The dispatch protocol sends the frozen bundle and
its digest. The policy byte ceiling is checked against the actual serialized
bundle, not only the raw stage input. Echo still returns only assessments,
findings, or one context request; it cannot return lifecycle control.

### D-ER3-016: One expansion causes one newly proved redispatch

When the first valid response requests known omitted context for an unverified
requirement, the stage expands through the certified selector using the same
stage-time-proved candidate pool, snapshots an expansion-round-one bundle, and
dispatches once more. A second request, an unknown path, a changed manifest,
changed policy, or an expansion that cannot fit is rejected. The final response
alone enters the existing evidence verification and deterministic reducer.

Adapter and dispatch transport failures are not converted into review findings
or invalid-input results. They propagate to core so its attempt, retry, timeout,
and recovery policy remains authoritative. Only validated proof mismatches,
invalid candidate data, and policy-limit outcomes are reduced by the review
plugin.

### Point 6 proof

- repository-adapter tests use a real two-commit Git repository and cover frozen
  head, ancestor, manifest, revision-content, traversal, UTF-8, and byte limits;
- review stage tests prove manifest-before-read-before-dispatch ordering,
  revision mismatch rejection, one expansion, cumulative context, and a second
  immutable dispatch;
- the live v2 registry test grants both capabilities and executes the review
  against an actual frozen repository;
- review and repository-adapter tests, TypeScript, focused lint, capability
  contract checks, documentation, and `git diff --check` pass.

## Point 7 — stage-time target freeze and adversarial proof

Status: complete

### D-ER3-017: Normal review freezes the completed implementation

The repository adapter no longer captures `HEAD` at adapter activation. The
review stage invokes `freeze_head` immediately before it asks for the changed
manifest. The returned full commit ID is paired with an opaque HMAC proof bound
to the current pipeline attempt. That proof is required for every manifest and
revision-content read, is never placed in `review-bundle.v1`, and is never sent to
Echo.

This permits Forge and merge stages to commit work before review begins while
keeping the final review input immutable. A later repository commit cannot alter
the already frozen manifest or source reads. Reusing the proof in a different
attempt, changing its head, or forging it is rejected.

### D-ER3-018: Changed context is derived; optional context remains extensible

Every non-deleted changed file is automatically hydrated from the frozen head and
becomes a depth-zero `changed` candidate. Upstream analyzers may add bounded
candidate paths with typed relational reasons, but they cannot supply or override
source bytes, digests, the head, or changed provenance. This keeps the normal gate
diff-focused while preserving a clean extension point for later deterministic
analysis.

Before reading optional source, the stage orders descriptors deterministically
and defines one total candidate pool bounded by `maxContextFiles`,
`maxContextFileBytes`, dependency depth, and the hard candidate-byte ceiling.
Initial selection and cumulative expansion both operate inside that same pool.
Descriptors ranked beyond the total file capacity cannot fit into the review and
are never read. The smaller initial limits reserve capacity inside the pool for
Echo's one expansion round.

### D-ER3-019: Whole-project audit remains a separate authorized source mode

Phase 3 does not use `freeze_head` as a reason to enumerate the repository. The
future whole-project audit described in `echo-review-roadmap.md` remains possible,
but it will require an explicit graph or repository-manifest producer, bounded
module slices, and separate operator authorization. It will reuse immutable
revision proofs and bundle identity without widening the normal gate.

### Point 7 proof

- a real repository test commits after adapter activation and proves review
  freezes the newer stage-time head;
- another commit after freezing does not alter the manifest or source bytes;
- forged, changed-head, and cross-attempt proofs are rejected;
- stage tests prove callers no longer provide final head or changed-file bytes;
- review, repository-adapter, and plugin-runtime TypeScript and focused tests pass.

## Point 8 — broader non-E2E verification

Status: complete

The canonical product verifier reached and passed skill typechecking (40 configs,
392 source files), scaffold typechecking, Knip, checkpoint contracts, test-gate
traceability and contracts, worker-core contracts, plugin inventory, SDK checks,
plugin builds, sandbox builds, and the plugin-system contract groups through live
capability verification. It then stopped at the pre-existing Buster suite-runtime
live test because that test returned `ERROR` where its fixture expects `PASS`.
This is outside the review Phase 3 paths and matches the already recorded external
closeout limitation from Phase 2.

Review/repository package tests, their TypeScript builds, the shared plugin-runtime
TypeScript build, generated inventory, documentation checks, focused ESLint, and
`git diff --check` pass. Knip found one obsolete revision verifier left behind by
the new hydration boundary; it was removed and the check passed on rerun.

Terra/high independent review used the repository helper with
`/app/node_modules/@openai/codex/bin/codex.js`. The final focused verification
change returned no actionable findings.

## Point 9 — final architecture audit and closeout

Status: complete

Phase 3 preserves the agreed authority model:

- core owns attempts, retries, recovery, waits, and lifecycle transitions;
- the review plugin owns bundle construction, selection, expansion, and review
  policy;
- the repository adapter owns stage-time Git identity and exact-revision reads;
- Echo receives only the frozen bundle and cannot browse or author lifecycle
  control;
- normal review is diff-focused and cannot enumerate the whole repository; and
- future whole-project audit remains possible through a separate authorized,
  bounded source mode.

The Phase 3 independent review loop accepted and fixed four findings: scope had to be
checked before repository reads, hydration needed deterministic resource bounds,
the expansion pool had to remain usable inside its total capacity, and malformed
provenance had to fail before capacity pruning. The final
Terra/high code review returned no actionable findings.

Phase 3 is complete. The next roadmap item is independent semantic verification
of Echo findings.
