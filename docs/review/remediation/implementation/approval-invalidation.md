# Administrative repair and approval schema

Scope: WP04 phase 1, PATH-T04-003 (including merged rejected-guidance and stale sibling-gate variants) and PCR-APPROVAL-001. Source-bound approval, product risk acceptance composition and category repair budgets remain later phases. This patch does not claim those findings fixed.

## Root causes and changes

The administrative path previously changed only the blocked requester and repair target. Unlike normal remediation, it left successful transitive reviews, facts and approvals intact. An actual original graph `source -> review -> approval -> gate`, with a successful sibling gate below source, reproduced this: after authorized repair, review still had one attempt instead of two.

Administrative remediation now records the same durable `RepairRequest` used by normal remediation, then calls the same `applyRepair` projection. The record includes the exact original durable stage result, findings/reason and artifact references. The administrative decision remains attached as audit evidence. Missing original result evidence and a repair target owned by another requester reject before recording a new administrative decision. No synthetic successful result is substituted.

Transitive invalidation clears old facts, waits, retry timing, approval/continuation guidance and remediation links while retaining all monotone attempt and repair counters. The repair target also loses stale wait/guidance fields before receiving its new repair request. Existing live/replay handling consumes the same intent; there is no second pair of ad hoc administrative state events. Historical logs, artifact bytes and old decisions remain retained, but the old signal cannot resolve the current generation's wait.

The nonagent human-approval configuration schema no longer accepts `agentRole`, matching its existing parser. Both registered approval stages share that schema. Target, issuer and timeout retain their existing behavior; no CLI approval or notification transport is added.

## Reproduction and verification

Before the implementation, `node --test tests/verification/reliability/admin-repair.test.mjs` failed its original graph assertion: `review must rerun after source repair`, actual 1, expected 2. The baseline approval schema from `git show HEAD:skills/nova/plugins/human-approval/schemas/config.schema.json` accepted `{target:'ops',issuerId:'operator:ops',agentRole:'nova'}` through the original `validateReferencedSchema`; the unchanged runtime parser rejected it with `APPROVAL_CONFIG_UNKNOWN_FIELD:agentRole`.

After the change:

- `node --test tests/verification/reliability/admin-repair.test.mjs`: PASS, four tests. Original graph reruns source/review/approval/sibling/requester; exact completed replay is journal-idempotent. Two additional runs use real temporary Git commits, the production artifact/wait/operator/network/secret adapters, the original architecture-approval stage and a local HTTP operator receiver. Both previous approval and previous rejection lead to a new source commit, renewed review/sibling facts, a new operator wait and new approval; the old signal is rejected. Unsupported schema fields fail real registry startup before any operator request. All allowed approval configuration fields execute normally.
- The fourth test copies actual persisted run data and cuts the journal at five crash prefixes: administrative decision only, run resumed, durable repair intent, repair attempt completed, and repair stage succeeded. Reopening converges to the same fresh dependent checks with one repair debit and one intent. These are real FileJournal projections and engine invocations, not mocked journal callbacks.
- `npm test && npm run build` in `skills/nova/plugins/human-approval`: PASS, existing package/unit/durable-artifact/live-function tests.
- `npm run typecheck --prefix skills/nova`: PASS.
- `node tests/verification/contracts/check-plugin-system-v2-phase6.mjs`: NOT GREEN. Both the concurrent run and a standalone repeat pass the administrative remediation assertions and reach line 626, then fail the pre-existing requirement that a cancelled run return within 500 ms. This phase changes no cancellation/executor behavior; the assertion is not weakened and the complete phase-6 suite is not claimed green.
- `npx --no-install eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/nova/core/execution/{engine-admin,administrative-repair}.ts skills/nova/core/lifecycle/remediation.ts tests/verification/reliability/admin-{repair.test,approval-fixture}.mjs tests/fixtures/admin-repair/source-plugin/stage.mjs`: PASS.

The Git/artifact fixture is a deterministic registered stage executed by the real engine. It creates real commits and writes real artifacts through the production capability route. Used packages are copied into a temporary installation to pin their actual source independently of unrelated concurrent repository edits; dependencies resolve to the real installed workspace packages. No Git, filesystem, HTTP, wait or artifact implementation is replaced.

## Limits

This phase fixes invalidation, not source provenance: a graph that never binds approval to a source manifest still needs PATH-T04-001. Repair counts remain the current stage counters until the separate D04 ledger phase. Operator authorization continues through the existing issuer/administrative authenticator boundaries. Retaining historical waits and artifacts does not make them current authority; the recovered stage's current wait determines acceptable signals.

Independent follow-up: reverting only WP04 changes retains the cancellation timing failure. The untouched original checkout is faster; profiling identifies synchronous import-audit and file-lock startup latency in the wider remediation. This is a separately open integration regression, not a successful global phase6 gate. The500ms assertion remains unchanged.
