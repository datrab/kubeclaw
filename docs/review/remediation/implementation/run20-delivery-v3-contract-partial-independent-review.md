# Delivery-manifest v3 contract — partial independent implementation review

Status: **CORRECTIONS REQUIRED; SOURCE ACCEPTANCE WITHHELD.** This is a
review-only checkpoint of the first public-contract slice. It is not acceptance
of the coupled delivery implementation, PCR-SDK-001 closure, a register change,
MAIN integration or all-47 completion.

Reviewer run: `20260910t050054`.

## Frozen authority

The review began from fresh remote MAIN
`e644a79fddd4d4d686fbd351b6edaec5575caf57`, tree
`64df9214237107c027b27caf4d5f75f27a222f51`. The required remote resume files,
register and frozen baseline were reread. The 47 entries whose status was
`implementiert` at `c38779c71bb92bc15c3fcb89930348e5417aa475`
exactly equal `partial-47-scope.json` and the work-item set; all original
`source_finding_text` values are unchanged. Current counts were eight
`verifiziert` and 39 `implementiert`.

While this review was running, MAIN advanced to the documentation-only commit
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff`, tree
`692a57a387d823d4b6636062e90dfbbeb07d28cd`. Its five deltas from e644a79 are
the register, root checkpoint, active package ledger, work items and a new run
checkpoint. No contract, production or test source changed. The 47-set,
original finding text and eight/39 count were rechecked on 1ba4451.

The reviewed incomplete candidate is
`84e849db6453ee73e41425cf4ac3c82e0b7c6004`, tree
`7dd0e761a3342c0e9b07819ffa32a685d18c6f2d`, sole parent the accepted semantic
source `15f6a808ed1666c3b7a2a3909749e3d4ee377904`. Its complete recursive tree has
4,128 non-tree entries and exactly ten deltas from 15f6a80. Every contract,
schema, package and evidence body was fetched from that remote commit. The
runtime checks used a separate frozen checkout whose reviewed contract source
blob is exactly remote `a5f13626ff902557fb18636095bd8f304bd69aa0`;
the author worktree was not used.

The complete accepted design
`569454a94ef4e3d77cde1628e868a2fd15b22ba7`, independent design review
`90dd3b25c9c30a6a487600bc60ba844f200cefb6`, registered RED
`f3ddec16b5a1c2787e956b5bc9d1556281660831`, independent RED review
`45fff05281c253dd27ffc52cca207c73104ae36d`, semantic source 15f6a80 and
semantic review `5380f0e1640d59ca1bfb0646a87ed96dbb57ffb1` were treated as the frozen
inputs. No prohibited helper action was retried, rephrased or rerouted.

## Independent results

The candidate's contract TypeScript gate independently passes:

`npx tsc --noEmit -p contracts/delivery-manifest/v3/tsconfig.json` -> exit 0.

The new independent seven-case runtime/schema test executes the exact frozen
contract implementation. Four cases pass: a valid v3 value is created and
deeply frozen; a caller-supplied digest is rejected; Proxy/accessor inputs are
rejected without invoking traps; and the shared reader accepts an exact tagged
v3 ref while rejecting a missing portable tag. Three schema/runtime parity
cases fail: invalid `expectedCoverage`, invalid coverage result and an invalid
overlong evidence media type are all admitted by the published JSON schema and
rejected by the runtime parser. There are no skips or todos.

Raw outputs are in
`docs/review/evidence/run20-delivery-v3-contract-independent-before.txt` and
`docs/review/evidence/run20-delivery-v3-contract-typecheck.txt`. The executable
review source is
`tests/verification/reliability/delivery-manifest-v3-contract-independent.test.mjs`.

## Required corrections

### R1 — remote root lockfile is corrupted and contains unrelated churn

The remote commit patch for `package-lock.json` starts with a literal inserted
`Warning: truncated output (original token count: 60911)` and
`Total output lines: 6810` before the JSON document. Its blob is
`004034d29ba16e1898056c5e6732dc992a7aec02`; it is not the clean author-local
lock blob and is not valid JSON. The same remote patch removes libc metadata
from many unrelated optional packages, moves/removes large
`@typescript-eslint` sections and churns unrelated demo-handoff and dependency
ordering. This cannot be accepted as workspace registration.

Regenerate the lockfile from an untruncated fresh source and retain only the new
workspace link and the two owning plugin dependency edges. Prove JSON parse,
package discovery and lock/package closure on the corrected remote blob.

### R2 — the published schema is not the promised closed public contract

`$defs.coverage` and `$defs.coverageResult` are only `{ "type": "object" }`.
They admit values rejected by the existing public gate-coverage validators.
The ArtifactRef schema also admits evidence media types that the runtime owner
rejects. This contradicts the accepted requirement that nested
`GateCoverageV1`/`GateCoverageResultV1` retain their public schemas and that
schema, types and runtime admission have parity.

Reference or faithfully include the existing public nested definitions and pin
the evidence media type/bounds to the runtime contract. Add Ajv/runtime parity
tests for every nested and ArtifactRef boundary. The independent RED test must
turn green without weakening its assertions.

### R3 — creator performs digest work before unsigned-shape admission

`createDeliveryManifestV3` serializes the input, hashes it, spreads it into a
candidate, and only then calls `validateV3`. The accepted design requires the
closed unsigned shape, semantic relations and byte limit to be validated before
calculating the digest. In particular, an oversized or unknown-key value is
hashed before rejection, doing unbounded work outside the intended admission
order.

The independent runtime negative confirms that a caller-provided `digest` is
nevertheless rejected in this revision. It is overwritten with a hash that
included the caller field; `validateV3` then recomputes over the candidate with
`digest` removed, so the two hashes differ and rejection follows. Therefore no
claim is made that the current code accepts the supplied digest. The required
correction is explicit unsigned-shape validation before hashing, followed by
one digest calculation over that validated unsigned value.

### R4 — public exports exceed the frozen finite surface

The source additionally exports `DeliveryModuleBindingV3` and
`DeliveryFinalBindingV3`. They are not in the finite public surface accepted by
569454a. Keep them private implementation types, or obtain a new explicit
design review before expanding the public API.

## Deferred matrix

The candidate honestly labels itself incomplete. Producer/stage wiring,
version-aware original evidence-adapter consumption, compiler and recovery
ownership, v2 corpus parity, registered Core/disk producer-consumer execution,
real import-store success, locale replay, durable requested/accepted/completed
and SIGKILL histories, consumer negatives, package/discovery/sandbox/pin gates,
full regression and all native prerequisites remain untested and unaccepted.
No result from this contract slice closes any finding.

Next action: author publishes a corrected small contract checkpoint. The
reviewer repeats the exact independent test against that frozen remote source,
verifies a minimal clean lockfile, then reviews producer/consumer wiring as a
separate coupled slice. Only the final atomic semantic-plus-delivery source may
be considered for integration after every required native gate passes.
