# Review evidence encoding — incomplete source checkpoint

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
| Authored graph / compiler evidence object | Optional explicit `encoding: kubeclaw-json.utf16.v1`; new producers hash portable bytes. |
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
