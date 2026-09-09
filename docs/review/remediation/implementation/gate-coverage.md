# Mandatory and cumulative gate coverage

Scope: PATH-T11-002 and PATH-T13-001, preserving D03. Product/compiler and existing test-gate contracts own coverage. Generic lifecycle engine and Buster provider execution architecture remain unchanged. This is bounded implementation evidence, not successful full native or deployed E2E acceptance.

## Authority and behavior

`gate-coverage.v1` declares module IDs, full requirement statements, owned paths, explicit integration requirements and required check-to-requirement/node mappings before suite selection. Compiler independently reconstructs expected policies from project fields. Resolved plans retain policy and explicit exclusions in their existing planDigest. Missing, excluded, advisory and condition-skipped mandatory nodes remain unsatisfied; every actual matrix variation participates. Literal matrix-shaped declaration names cannot impersonate a missing base declaration. Standalone v1 plans retain optional selection semantics but provide no completeness authority.

The existing verified remote job supplies revision, tree, archiveContentDigest and pipelineStageId. No second archive authority is introduced. Bound imports emit `test-gate-decision.v2` with a versioned ledger derived from native imported node effects. Unfulfilled mandatory checks prevent passed. The JUnit no-executed-case guard remains before review-agent handling; native counts are unchanged. Quality and remote-adapter consumers compare independent expected policy, exact planDigest, candidate and stage identity. Decision parsing checks ledger integrity and passed-node consistency.

Project compilation requires explicit final lint/test/integration requirements and emits final-lint, optional final-review, final-test, then project-summary. Buster and its test-agent default on. `testAgentEnabled:false` suppresses agent dispatch only, records disabled state and fabricates no agent verdict. Echo defaults off; enabled reviews remain binding. Cumulative failures do not guess a last-module repair owner. Existing module repair budgets are retained.

Review uses existing evidence content to bind coverage into its immutable bundle. The original input parser canonicalizes that content to JSON text; coverage verification checks full requirements/prefixes and cumulative baseline. The owner persists the actual selected bundle, bound by report.bundleDigest. Summary verifies both under the latest producer attempt, including base/head, requirements, paths and policy. Same-revision last-module reports cannot substitute for cumulative review.

`delivery-manifest.v2` requires the exact module requirement/path union and cumulative native coverage, final lint and any enabled review. It exposes source/plan/decision/result bindings and immutable evidence references. It asserts no readiness, retained exposure, credential delivery or operator acceptance. The direct production E2E graph builder requires explicit predeclared `.swarm/pipeline.json` coverage; it never invents scope from selected nodes.

## Verification and remaining gates

`npm run verify:test-gate:coverage` passes ten new tests, the original compiler/installed-registry/source-launcher check and original summary suite. Full output: `docs/review/evidence/gate-coverage-tests.txt`.

The remote regression uses actual Buster HTTP service, signed Git source archive, job store, resolver, runner skip path, Nova importer and durable records. At one committed candidate, standalone optional skip remains passed without completeness authority; required-skipped and required-missing coverage fail. No provider execution or command grant is invented for skipped nodes.

The five-module regression executes real local Node tests against Git commits: M5 passes while an M1/M2 cents/dollars interaction fails at the same commit. The original plan consumer refuses that module policy as cumulative coverage. A source repair/new commit makes the cumulative Node invocation pass. This demonstrates the interaction and plan-binding boundary, not isolated Buster execution.

The review test exercises original input/bundle parsers and durable artifact storage, exact persisted bundle identity and rejection of narrow scope, requirements and baseline. Summary artifact-contract vectors explicitly report `providerExecution:false, agentExecution:false`; they verify corrupt/missing/cross-run artifacts, disabled-agent native evidence, optional enabled review and narrow/module substitutions. They are not passed E2E fixtures.

Additional passing checks: original contract declaration/type parity plus ten resolver examples; original JUnit executed-required importer check; original remote-import seven-decision compatibility; original quality plugin suite; focused original review input/stage/report/snapshot suites; all four modified plugin builds; Nova typecheck; strict new-test/compiler typecheck. Focused canonical lint passes new helpers, changed product/plugin code and tests, without waivers. Shared baseline debt remains: types.ts one max-lines finding (422→426), resolver the same fifteen findings (706→710 lines; draft 89→91), importer the same five findings (346→353 lines), with unchanged complexity values. These baseline gates are not claimed green.

No external deployment/messages/model session or production E2E was run. The established native Buster host blockage (`open task children` / EPIPE) prevents claiming successful isolated provider E2E. No fake process identity, replacement provider, timer or passed report crossed that gate. Full native/deployed acceptance remains separate. Old immutable graphs require version-pinned draining or explicit migration; absent coverage cannot be silently upgraded to completeness.

## Exact owned files

- `package.json`
- `package-lock.json`
- `contracts/pipeline-test-gate/v1/README.md`
- `contracts/pipeline-test-gate/v1/package.json`
- `contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json`
- `contracts/pipeline-test-gate/v1/src/coverage.ts`
- `contracts/pipeline-test-gate/v1/src/coverage-result.ts`
- `contracts/pipeline-test-gate/v1/src/coverage-expectation.ts`
- `contracts/pipeline-test-gate/v1/src/gate-decision.ts`
- `contracts/pipeline-test-gate/v1/src/index.ts`
- `contracts/pipeline-test-gate/v1/src/types.ts`
- `contracts/pipeline-test-gate/v1/src/validation.ts`
- `contracts/pipeline-test-gate/v1/tests/coverage.test.mts`
- `skills/nova/core/test-gates/types.ts`
- `skills/nova/core/test-gates/pipeline.ts`
- `skills/nova/core/test-gates/resolver.ts`
- `skills/nova/core/test-gates/remote-result-import.ts`
- `skills/nova/project/compiler.ts`
- `skills/nova/project/coverage.ts`
- `skills/nova/project/README.md`
- `skills/nova/plugins/buster-quality-gate/src/stage.ts`
- `skills/nova/plugins/buster-quality-gate/src/protocol.ts`
- `skills/nova/plugins/buster-quality-gate/schemas/input.schema.json`
- `skills/nova/plugins/buster-quality-gate/schemas/config.schema.json`
- `skills/nova/plugins/remote-test-gate/src/adapter.ts`
- `skills/nova/plugins/project-summary/src/summary.ts`
- `skills/nova/plugins/project-summary/schemas/input.schema.json`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/README.md`
- `skills/nova/plugins/review/package.json`
- `skills/nova/plugins/review/schemas/input.schema.json`
- `skills/nova/plugins/review/src/review-coverage.ts`
- `skills/nova/plugins/review/src/review-preparation.ts`
- `skills/nova/plugins/review/src/review-report-storage.ts`
- `skills/nova/plugins/review/src/review-report-flow.ts`
- `skills/nova/plugins/review/src/stage.ts`
- `skills/nova/plugins/review/tests/review-coverage.test.mts`
- `tests/verification/reliability/coverage-remote.test.mts`
- `tests/verification/reliability/coverage-interaction.test.mts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/integration/project-summary.test.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `docs/review/evidence/gate-coverage-tests.txt`
- `docs/review/remediation/implementation/gate-coverage.md`
