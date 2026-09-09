# Review evidence encoding — independently approved bounded package

Run `20260909t2146`, new isolated `fix/resume-47-run3-review-encoding` checkout.
Fresh remote base `9628872976da8d43c3a17faa89962f9e32d88979` was compared against
the committed local cache `8734df5`: all 3,346 tracked blob SHAs and modes match
the untruncated remote tree. No previous uncommitted work is used.

The original external authored-graph stage-input evidence contract explicitly
allows arbitrary JSON in `content`. A genuine English original producer hashes
`{ä:1,z:2}`; original Swedish `parseReviewInput` rejects the same persisted input.
The local repro is separately checkpointed in `f5ea0f4`; it is not a full stage
test. The compiler's current closed ASCII evidence is not falsely presented as
that reproduced defect.

## Explicit bounded format boundary

| Original boundary | Required change |
| --- | --- |
| Authored graph evidence object | Optional explicit `encoding: kubeclaw-json.utf16.v1`; explicit new producers hash portable bytes. Existing compiler output retains its original closed ASCII-key shape. |
| Stage JSON schema and `parseReviewInput` | Strict encoding enum; dispatch only from declared encoding; retain marker when converting object content to its exact JSON string. |
| Prepared and sliced `ReviewBundleEvidence` | Retain marker with exact string and digest. |
| Bundle TS/generated JSON schema, parser and bounds | Accept only known marker; require bounded JSON and exact canonical bytes under that marker; unknown/mixed encodings reject. |
| Snapshot, bundle store, prompt and report | Marker is included in the enclosing bundle hash; exact bundle identity remains attached to report/approval. Closed outer ASCII-key serialization is not globally changed. |
| Cache | No unrelated generic-unknown cache migration; the demonstrated open input is converted to a string before entering the bundle. |

`review-bundle.v1` retains its enclosing shape with an explicitly versioned
optional evidence format. Untagged evidence retains its historical canonical
rules byte-for-byte. No raw-JSON bypass, guessed locale, fallback serializer,
or inferred marker is introduced. Historical object-only evidence has no saved
producer bytes: an already mismatched legacy digest cannot be reconstructed
across locales without its original producer/authority. Even old bundles with
strings keep the original canonical-only parser contract; this package does
not silently weaken it to arbitrary JSON strings. New explicit format input
is a new producer decision, not retroactive approval migration.

Root approved this design for implementation, not integration. This checkpoint
is incomplete until original stage/Git/ArtifactStore/controlled-HTTP tests,
schema/bounds/marker-tampering and old-compatibility tests pass independently.
No native model, gateway, deployment or overall PCR-SDK-001 completion is claimed.

## Implemented boundaries and verification

Production source implements the explicit evidence marker in both schemas,
both parsers, bounds and cumulative coverage verification. Existing compiler
and generated simplification evidence remain their
declared legacy format; mixed inputs are supported without rewriting it.

The original full review-package `npm test` passed, including its real Core,
repository, HTTP, report persistence, repair/advisory and coverage cases. The
new `--portable-evidence` mode of its original live-function test passed under
native sv-SE: actual authored graph input contains Unicode tagged evidence and
untagged cumulative coverage; the original HTTP transport receives its exact
bundle; the actual ArtifactStore bundle equals that dispatched bundle, and the
stored report binds its marker through `bundleDigest`. Stripping the marker
changes that identity. This controlled HTTP endpoint supplies deterministic
review protocol responses, not a real model/Gateway completion.

The independent cross-locale test also opens the original disk ArtifactStore
in new processes, reparses the persisted bundle and reproduces its exact digest
under en-US and sv-SE. Unknown/mismatched codecs reject; the immutable old
producer fixture preserves old same-locale success and cross-locale rejection.
If marker stripping happens to be byte-compatible with the current legacy
locale, it still creates a different enclosing bundle identity and cannot
reuse the bound report/approval.

Actual strict Ajv compilation exposed existing declaration errors in the bundle
schema. With Root's explicit approval, conditional required properties and the
already enforced repository-path string domain are now declared in their own
schema scopes. Existing closed fields, paths, statuses and conditional
renamed/copied requirements are retained. The generator and actual strict
Ajv2020 compile now pass, with before-output preserved by the reviewer.

Full review-plugin and Nova typechecks and focused canonical lint passed.
Original compiler check and project source/recovery regressions passed:
11/11 tests, zero skips. Existing pinned-plugin digest/upgrade authority is not
bypassed: this is not automatic mutation of existing paused run registries.

Independent review then identified the unnecessary compiler marker addition as
a historical-graph compatibility risk: existing source identity versions predate
this evidence format. With Root approval that preventive compiler change was
removed, not hidden behind a new shim or guessed source version. The compiler
file is exactly its remote-base content; actual accepted Unicode evidence is
produced through the authored graph API. Existing built-in evidence is not
falsely claimed to be migrated. The review-enabled historical graph regression
now passes: a remotely verified archived original compiler produces and writes
the original graph snapshot; current `compileProjectRecovery` returns the exact
compiled result without changing stored bytes. This is the actual compiler
consumer used by CLI recovery, not a claim of a full recovered CLI pipeline run.
The before `RECOVERY_GRAPH_DIGEST_MISMATCH` is retained as raw evidence.

All new regressions are now registered in the existing `npm test` command.
Final `frozen-default-suite.txt` records the entire original suite plus new
codec/store/schema/locale checks at `d58ee5a`, exit 0. The final added historical
compiler wrapper and all new checks at `1d0cd9e` pass **5/5 Node-reported tests,
zero skips**, including a nested independent 1/1 compiler regression. Strict
schema comparison checks 384 original-domain vectors plus 384 extra-field
negatives. Raw final evidence is in `docs/review/evidence/run3-review-encoding/`.

Independent approval is recorded in `run3-review-evidence-independent-review.md`
at reviewer commit `c100f1b85a7d92c88f4c98ce2b57afa356c1f368`. The independent
complete original suite and final 5/5 matrix pass, with zero skips, plus the
unchanged archived compiler regression, source/recovery checks, full typechecks
and canonical focused lint. Root must still reconcile the fresh remote head
and run the affected integrated tests before publication.
Broad PCR-SDK-001 still needs the other inventoried identity domains; the old
object-only evidence reconciliation boundary remains explicitly documented.
