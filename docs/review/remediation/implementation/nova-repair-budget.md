# Nova module repair budgets — D04 / D08

Implemented 2026-09-09. Independently reviewed locally on the same date; Root integration review remains required.

The project compiler gives each implementation stage its own ledger with two lint, two enabled-review and two test repair orders. Omitted review stays disabled. Initial implementation and mandatory cross-category rechecks do not debit that ledger. The generic lifecycle core uses declared category metadata, without importing product plugins or interpreting module stage names.

Original attempt completions deterministically derive repair orders in both execution and journal replay. Orders retain the original findings, artifact references, source facts and invalidated dependency set; idempotent identity prevents completion and subsequent repair-intent projection from charging twice. Invalidations preserve consumed category and technical retry state.

An exhausted category creates a Nova wait containing the pending request and complete ledger. A digest-bound, reasoned Nova signal authorizes exactly one additional order for the whole module. A subsequent repair in any category blocks, even if another category has unused standard allowance. Passing the final rechecks succeeds. Invalid authorization is rejected before durable lifecycle intent. Administrative remediation uses the same ledger and rejects exhaustion before recording its decision.

The compiler's original `maxAttempts: 2` technical allowance is retained separately as `maxTechnicalRetries: 1`. The larger total execution ceiling accommodates initial work, all allowed repairs, mandatory rechecks and that one technical retry; it does not grant extra technical retries.

## Verification

All commands used the supplied Node/Go toolchain path, preserving the existing PATH. No shims, replacement runtime modules, CI runs or deployment were used.

- Repair-budget engine suites: 12 tests passed. Native Git source revisions and production artifact-store writes exercise all six standard orders (seven implementations; lint/review/test checks 7/5/3), final success, module-wide extra-order blocking, invalid signals, technical exhaustion, administrative debit and administrative exhaustion. Independent review added source/check failure after the extra order: these now block while retaining the original failed completion and artifacts, including identical journal replay.
- Recovery coverage: twelve original completion/repair-intent journal prefixes, both sides of Nova signal projection, and both sides of administrative decision projection converge without duplicate debit or stale gates.
- Original administrative repair, repair evidence, Forge workspace and Forge lock suites: 13 tests passed, including actual lint repair and real Git integration/contention.
- Original lifecycle, engine, resume and checkpoint-recovery contract checks passed.
- Project compiler contract, generated SDK consistency and Nova TypeScript checks passed.
- Canonical repository ESLint config passed for changed core/compiler and budget test files; whitespace check passed. The initial ESLint invocation without the explicit canonical config failed because this repository has no root flat config; rerunning with `charts/kubeclaw/files/config/eslint.config.mjs` passed.

These targeted commands encountered no kernel `/proc` or cgroup blocker. They do not establish external worker, cluster, provider or deployment readiness.

## Independent review

The completion-derived debit precedes the replayable repair-intent projection;
the same order ID and full-content equality check prevent duplicate charging.
Repair invalidation preserves owner ledgers and technical retry counts. Category
requesters bind through their declared remediation target; compiled modules each
have their own implementation owner. Authorization checks the complete current
ledger against the pending history, the digest, issuer, wait and reason before
durable signal recording. One authorized order closes automatic repair allowance
across all categories of that owner. Administrative remediation uses that same
disposition before recording its decision. Existing explicit operator `retry`
remains a separately authenticated intervention and does not reset the ledger;
this is not a new automatic repair or technical retry allowance.

Review found one terminal-state gap: a hard failure during the authorized extra
implementation or its checks previously remained `failed`. The budget projection
now maps that terminal failure to `blocked` for the same owner, retaining the
unaltered original result/diagnostic and artifacts. Explicit cancellation and
ordinary successful checks keep their existing behavior. New native Git/artifact
engine regressions cover both the implementation and downstream test boundaries.

Independent rerun: budget suites 12/12 and original administrative repair,
repair-evidence, Forge workspace and Forge lock suites 13/13; original lifecycle
and project compiler checks passed; canonical lint on the correction and fixture/test passed. The
first whole-Nova typecheck during review was temporarily blocked by concurrent
operator-delivery work (`adapter-startup.ts`: missing SDK `EffectRequest.deliveryId`),
not by a budget diagnostic; final integrated verification remains Root's gate.
