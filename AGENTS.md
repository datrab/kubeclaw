# CONFIG task: repository agent instructions

For the CONFIG centralization task, read
[OPENCLAW-CONFIG-GOAL.md](docs/review/remediation/OPENCLAW-CONFIG-GOAL.md),
[decisions.md](docs/review/remediation/decisions.md) and
[acceptance-20260920.md](docs/review/remediation/acceptance-20260920.md).
The goal document contains current scope, authority, gates and deliverables.
Older reports and generated discovery lists are evidence, not completion claims.

## Authority and scope

- C0 (complete semantic inventory and target definition) is authorized and open.
  Production implementation C1–C6 requires the user's approval of a concrete
  package. A `/goal` invocation or this file does not itself supply that approval.
- Target central entry: `pipeline.config.json`, evolved from the existing
  `swarm.config.json`. Project/workflow `pipeline.json` remains a different
  document. Do not add a parallel manually maintained `system.json`.
- CONFIG precedes the other-session test refactor, D18 worker refactor and twelve
  historical findings. Do not implement those later phases as CONFIG shortcuts.
- No production deployment, host action or paid Eval campaign under this task.

## Production configuration and code quality

- One authoritative author per setting/instance/profile scope. Generated bundles,
  charts and execution snapshots are immutable outputs, never competing authors.
- No hardcoded fallback for configurable settings in code, loader, schema
  resolution, ENV, CLI, chart, entrypoint or recovery. Missing/invalid required
  settings fail before effect. No retry with a default profile or current config.
- Protocol constants, technical supported domains and actual task input are not
  automatically settings. Classify and justify them in the semantic inventory;
  do not disguise operator defaults as constants or optional input normalization.
- Do not introduce spaghetti code: separate loading, validation, resolution,
  publication, execution binding and business execution by existing coherent
  ownership. No duplicate decoders, hidden shared mutable config, circular owner
  dependencies, god module or unrelated refactor. Reuse suitable existing code.
  A file split or passing lint alone is not architecture acceptance.
- Preserve immutable started-module config, durable binding before dispatch,
  consumed budgets, claims/deadlines, graph/grant/recovery foundations and the
  fixed-generation Eval contract. Secret values stay outside normal config,
  logs and snapshots; versioned references and consumer permissions are explicit.

## Verification and completion

- Stable requirement/setting/case IDs, exact source/test identities and raw logs
  are required. Historical green reports and marker counts do not prove current
  coverage. Fixtures/mocks prove only their stated boundary.
- Do not delete/skip/weaken tests, inflate budgets or shrink expected coverage
  to obtain PASS. Record failed, blocked and unexecuted cases explicitly.
- Every completion gate needs a fresh independent subagent in a fresh context.
  Give it requirements and the exact checkout/evidence, not the author's chat.
  It independently checks completeness, real wiring, missing/fallback cases,
  code ownership/complexity and evidence, and reruns decisive checks where safe.
- If the runtime cannot create an independent reviewer, record the gate as
  blocked. Do not self-review or fabricate a subagent result as a substitute.
- Fresh review after material corrections; author cannot mark the task accepted
  based solely on its own report. Use the explicit gates in the goal document.
