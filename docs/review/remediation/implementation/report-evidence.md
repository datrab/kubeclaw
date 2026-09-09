# T15-F01 — Historical report source authority

The prior v3 identity repair bound execution and stored bytes but still passed
caller-authored historical facts to the model. v4 replaces that source contract
with an explicitly selected, read-only snapshot of existing completed Nova data.
The source bundle is embedded in the existing report artifact, not a new store.

The generic Core reader uses the original journal parser, pinned snapshot digest
validator and lifecycle reducer. It verifies the exact current requested journal
head, completed run boundary, completed attempts and effects, and original full
artifact producer references. All reads have explicit byte limits and opened
regular-file/no-follow checks; bounded legacy resolution now also uses NONBLOCK
so writerless FIFOs cannot stall before fstat. Directory and file identities are
rechecked. No FileJournal constructor, tail repair or write occurs in this reader.
Existing writer/parser behavior and default legacy lookup remain unchanged.

The pipeline-review evidence adapter scopes access through report.evidence.read
and allowedRunIds, resolves original artifact-store get_json responses, and checks
producer, ID, namespace, media type, hash and exact bytes. get_json additively
returns the already stored artifact metadata. Product extraction accepts known
implementation, lint and quality-evaluation producers with matching source
revision; selected old attempts, foreign refs and unsupported facts fail. A second
projection rejects source changes across asynchronous artifact reads.

Both stages require authored v4 `{task, source}` input and explicitly configured
reader/provider grants and budgets. No v3 fallback remains. Execution identity is
still the actual lease; historical target is exact run/head/snapshot/source.
Case-study project identity comes from the pinned graph. Typed status/facts and
evidence IDs come from the bundle; observations/Markdown must cite selected IDs.
Narrative remains draft-not-entailment-verified: citations and format do not prove
arbitrary prose, passing tests, publication readiness or model factuality.

The bundle lists unselected artifacts and omitted logs, checkpoint-only artifacts,
prompts, registry config, credentials, unstructured claims and effect payloads.
Effect completion records are checked; omitted referenced effect payload blobs
are not verified evidence. Selected facts are not a claim of complete coverage.
D01/D07 private operator logs and demo credentials remain in their original stores;
this exporter neither deletes nor modifies them. Artifact retention remains the
existing store's responsibility. No cluster/model execution was performed.

The shared generic parent-invocation/attempt dependency identity correction is a
separate slice. This adapter uses ordinary scoped reads, with no synthetic
external delivery ID or confidential bypass. Cleanup fixtures gained only the
required actual provider, grants and reader configuration; their assertions remain.

## Independent review correction: effect completeness and mode authority

The first reader checked only each effect journal's own hash chain and pending
set. Independent review reproduced acceptance of an empty effects file while the
pinned lifecycle still contained completed durable effects. The final reader
reconciles both original ledgers: stable original request identity, acceptance,
receipt identity/status/provider, and lifecycle run/stage/attempt/effect identity.
Empty journals and intact completed prefixes cannot satisfy later pinned events.
Observer requests still require complete durable records even though the original
engine intentionally omits their lifecycle effect audit.

The Coordinator now emits its actual durable/confidential execution mode through
an internal audit sink, and the original lifecycle appender persists that mode.
The field is not taken from request payloads or adapter output. The immutable
snapshot records `effectAuditVersion: coordinator-mode.v1`. Execution, replay,
transport, secret handling and the original internal durable sink are unchanged.
The read-only projection requires this marker. Older ambiguous snapshots reject
with `RUN_EVIDENCE_EFFECT_MODE_UNVERIFIABLE` and an explicit no-migration message;
they are not silently labelled verified or rewritten.

Confidential operations intentionally have no durable effect record. They require
an ordered same-owner audit triplet with Coordinator-owned confidential mode,
original redacted shape and terminal adapter matching the snapshot's selected
provider. This covers both policy-owned secrets.read and the original explicit
runtime-dispatch network.http confidential dependency. A mere redacted flag on an
ordinary effect cannot excuse a missing ledger record; inconsistent modes reject.
The real source tests exercise both confidential paths and counterexamples.

## Verification

- Actual two Git/source/Core histories, original artifact store: ten tests,
  including foreign/stale refs, missing/corrupt blobs, incomplete/nonterminal
  journals, unresolved effects, mutation during artifact read, tiny byte budget,
  and writerless legacy FIFO. All pass, zero skips.
- Original pipeline-review and case-study protocol, actual Core/HMAC HTTP live
  consumer and package-boundary suites pass. Retry, durable replay and another
  executing run preserve original artifact identity assertions. HTTP responses
  are transport fixtures; protocol-only vector hashes are not authority proof.
- Original artifact-store suites pass with additive metadata. Original cleanup
  consumers pass 29 tests. Original run-root and 16 MiB journal consumers pass.
- Plugin builds, full Nova typecheck, strict new-test typecheck and scoped canonical lint pass.
  Existing run-root has two max-depth findings in its unchanged scanner body;
  its sole scope change is the approved bounded-open NONBLOCK flag.

## Exact owned paths

Shared files contain other authors' disjoint hunks: engine-snapshots exports the
pure validator here; dependencyIdentityVersion belongs to the generic fix.
The additional effectAuditVersion marker belongs to this report slice.
Vocabulary/authorization own only report.evidence.read. Lock changes add only the
two real pipeline-review workspace dependencies.

- `skills/nova/core/state/journal.ts`
- `skills/nova/core/state/read-run-evidence.ts`
- `skills/nova/core/execution/engine-snapshots.ts`
- `skills/nova/core/execution/run-root.ts`
- `skills/nova/core/src/index.ts`
- `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts`
- `skills/nova/core/execution/authorization.ts`
- `skills/common/plugins/artifact-store/src/adapter.ts`
- `skills/nova/plugins/pipeline-review/package.json`
- `package-lock.json`
- `skills/nova/plugins/pipeline-review/src/protocol.ts`
- `skills/nova/plugins/pipeline-review/src/stage.ts`
- `skills/nova/plugins/pipeline-review/plugin.json`
- `skills/nova/plugins/pipeline-review/schemas/input.schema.json`
- `skills/nova/plugins/pipeline-review/tests/protocol.test.mjs`
- `skills/nova/plugins/pipeline-review/tests/live-function.test.ts`
- `skills/nova/plugins/pipeline-review/tests/package-boundary.test.mjs`
- `skills/nova/plugins/pipeline-review/README.md`
- `skills/nova/plugins/case-study/src/protocol.ts`
- `skills/nova/plugins/case-study/src/stage.ts`
- `skills/nova/plugins/case-study/plugin.json`
- `skills/nova/plugins/case-study/schemas/input.schema.json`
- `skills/nova/plugins/case-study/tests/protocol.test.mjs`
- `skills/nova/plugins/case-study/tests/live-function.test.ts`
- `skills/nova/plugins/case-study/tests/package-boundary.test.mjs`
- `skills/nova/plugins/case-study/README.md`
- `skills/nova/plugins/pipeline-review/src/evidence-adapter.ts`
- `skills/nova/plugins/pipeline-review/src/evidence-bundle.ts`
- `skills/nova/plugins/pipeline-review/schemas/evidence-config.schema.json`
- `tests/verification/reliability/report-evidence.test.mts`
- `tests/verification/reliability/report-identity-fixture.mjs`
- `tests/verification/reliability/runtime-session-cleanup.test.mts`
- `tests/verification/reliability/adapter-cleanup-scope.test.mts`
- `skills/nova/core/effects/contracts.ts`
- `skills/nova/core/effects/coordinator.ts`
- `skills/nova/core/execution/engine-runtime.ts`
- `docs/review/remediation/implementation/report-evidence.md`

## Raw local evidence

- [report-evidence-source-tests.txt](../../evidence/report-evidence-source-tests.txt)
- [report-evidence-review-tests.txt](../../evidence/report-evidence-review-tests.txt)
- [report-evidence-case-tests.txt](../../evidence/report-evidence-case-tests.txt)
- [report-evidence-artifact-tests.txt](../../evidence/report-evidence-artifact-tests.txt)
- [report-evidence-cleanup-tests.txt](../../evidence/report-evidence-cleanup-tests.txt)
- [report-evidence-journal-tests.txt](../../evidence/report-evidence-journal-tests.txt)
- [report-evidence-runroot-tests.txt](../../evidence/report-evidence-runroot-tests.txt)
- [report-evidence-test-tsc.txt](../../evidence/report-evidence-test-tsc.txt)
- [report-evidence-lint.txt](../../evidence/report-evidence-lint.txt)
- [report-evidence-builds.txt](../../evidence/report-evidence-builds.txt)
- [report-evidence-core-tsc.txt](../../evidence/report-evidence-core-tsc.txt)

Commands ran from the repository root with the supplied Node/Go toolchain PATH:

```sh
node --test tests/verification/reliability/report-evidence.test.mts
npm test --prefix skills/nova/plugins/pipeline-review
npm test --prefix skills/nova/plugins/case-study
npm test --prefix skills/common/plugins/artifact-store
node --test tests/verification/reliability/adapter-cleanup-scope.test.mts tests/verification/reliability/runtime-session-cleanup.test.mts
node tests/verification/contracts/check-nova-journal-scale.mts
node tests/verification/contracts/check-nova-run-root.mts
npm run build --prefix skills/nova/plugins/pipeline-review
npm run build --prefix skills/nova/plugins/case-study
npx tsc --noEmit -p skills/nova/tsconfig.json
npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ESNext --strict --skipLibCheck --allowImportingTsExtensions --erasableSyntaxOnly --allowJs tests/verification/reliability/report-evidence.test.mts
npx eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/nova/core/state/read-run-evidence.ts skills/nova/core/state/journal.ts skills/nova/plugins/pipeline-review/src skills/nova/plugins/case-study/src tests/verification/reliability/report-evidence.test.mts tests/verification/reliability/report-identity-fixture.mjs
```

Additional correction evidence: [reconciliation lint](../../evidence/report-evidence-reconcile-lint.txt), [original Coordinator/identity consumer](../../evidence/report-evidence-coordinator-consumer.txt).

Final independent counterreview passed the ten source regressions and two original dependency/Coordinator cases with no skips. The empty/completed-prefix ledger blocker is closed by lifecycle reconciliation and Coordinator-owned mode; old ambiguous producer snapshots explicitly reject. These hashes establish original-store consistency, not authentication of malicious storage rewrites. No remaining demonstrated blocker in this bounded report source-authority slice.
