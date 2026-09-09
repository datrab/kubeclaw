# Independent review: bounded Nova dispatch metadata projection

Decision: APPROVED for this bounded package only, subject to root reconciliation and repeat of affected tests against the freshly read integration head. PCR-OBS-002 remains incomplete; this is not approval of the whole finding or frozen 47.

Reviewed author source `4d449833700da583d662646a9d682a4007e18d4a`; independently executed in review checkout at `611b28c1ba99404b1b29cd851ce835f98cd36de3`, based on freshly verified remote `4f70d8f13e282e01d014fe82557d37c90d52cb71`. All eight production files match the author's frozen source byte-for-byte. Review-only tests/report additions are not implementation substitutes.

## Authority and preservation

The original FileNovaRemotePlanStore remains the owning dispatch store. Its versioned projection removes only duplicate inline archive bytes, retains the complete logical job and existing digest-checked source blob, and reconstructs the original full payload for strict replay identity. No unique archive, import/evidence, lifecycle journal, logical job, or record count is deleted. Existing quotas remain unchanged.

The manual operator acquires original run → import → dispatch fences. Original import validation/decision logic is factored once into its owning module, not a parallel acceptance path. It requires a complete non-null original result, exact job/source/request identity, every evidence/output/report blob, and unchanged computed decision; pending review and incomplete imports refuse authority. The original dispatch CAS executes the synchronous final authorization under its actual writer fence.

The final check reuses original readRunEvidence and binds the selected original test.plan.execute request, canonical requested/accepted/completed contracts, original quality-stage attempt and ordered lifecycle audit, pinned adapter/state roots, exact plan and explicit source revision, completed decision artifact write, original artifact store and content bytes. Matching a textual runId is not sufficient.

Initial unrelated-Core and canonical-invalid-request counterexamples were independently reproduced and retained before correction. The corresponding tests are unchanged and now pass.

## Executed evidence

[Raw final output and exact SHA256 manifest](../../evidence/run7-dispatch-independent-final.txt) records 27/27 tests, zero skips, after building the original sandbox helper once. Coverage includes real Git archive and tiny quota release, actual Core quality stage → authenticated Buster HTTP → complete original Nova import → original decision artifact → blocked Core → authenticated disposable-run cancellation, replay with no second POST, competing stores, real SIGKILL at the original atomic-write boundary, missing/corrupt archive/evidence, pending/null/review decisions, cross-Core/stage/attempt/source/plan/adapter corruption, malformed canonical request, blocked run, stale metadata, alias paths and bounded snapshot refusal.

The original `npm run verify:test-gate:remote-import` and `npm run verify:test-gate:remote-runtime` completed exit 0, including actual Node-generated JUnit, original importer reconstruction, authenticated HTTP deadline/reconnect checks and shared-runtime/Nova typechecks. Canonical ESLint completed exit 0 on all eight affected production files and all three added test files.

## Explicit exclusions and next action

The actual provider attempt is execution_error (EPIPE or initialize exit70); no native provider success or native gate completion is claimed. Separate retained-import contract-data corruption vectors are not Core/provider positive evidence.

Derived sourceStageId and missing explicit revision refuse projection. Their runtime negative tests use honestly rehashed corrupt snapshots, not a fabricated successful derived producer. Supporting production compiled sourceStageId requires original source-stage artifact/attempt linkage and a genuine bound producer test.

This bounded local-store integrity review does not authenticate a coordinated rewrite of all trusted Core/dispatch/import records, nor independently reverify signed archive provenance against a pinned public key. The genuine positive does traverse the original signing adapter and signature-checking Buster store. Parent-directory checks are not claimed to defeat an adversarial host.

Next action: root independently reconcile this reviewed package with the freshly read remote head, repeat affected tests, update durable evidence/register while keeping PCR-OBS-002 open, and integrate only exact-parent fast-forward. Continue broader connected retention and genuine derived-source ownership work separately.

