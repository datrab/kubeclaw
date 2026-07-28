# Phase 9 Changelog

Status: in progress

This file records implementation decisions, behavior findings, test evidence,
deletions, and atomic commits for the concrete plugin and adapter migration.

## Batch 1: Validation And Lint

### Findings

- Delivery lint was already authoritative after Phase 8 and remains a direct
  deterministic implementation.
- Preflight preserved the two legacy declaration rules but needed explicit
  paired fixtures proving owned Dockerfile, runtime-only Dockerfile, API
  specification, and clean behavior.
- The lint package already contains the mature data-driven tool engine. Its
  complexity comes from supported tools and policy contracts rather than v1
  scheduler coupling, so rewriting the engine would increase parity risk.
- Architecture validation mixed four different owners: software-architecture
  judgment, generic graph validation, deterministic file/configuration checks,
  and agent-session lifecycle.

### Changes

- Architecture findings are now closed structured values with stable identity,
  severity, software-architecture scope, paths, explanation, and remediation.
- Architecture prompts explicitly exclude generic graph validity, required-file
  presence, runtime configuration, and execution bookkeeping. Those are owned
  by core, deterministic preflight stages, and registry activation.
- Blocking architecture verdicts require blocking/error findings; remediation
  verdicts reject blocking/error contradictions.
- Architecture protocol tests were converted to TypeScript.
- Added TypeScript legacy-versus-v2 preflight parity fixtures.
- Added TypeScript lint parity fixtures for policy matching, finding
  fingerprints, and architecture-cycle reduction.
- Recorded per-scenario reuse/refactor decisions and the approved architecture
  responsibility split in the migration ledger.

### Verification

- `npm test --prefix skills/nova/plugins/architecture-validator`
- `npm test --prefix skills/nova/plugins/preflight-contract`
- `npm test --prefix skills/nova/plugins/lint`

## Batch 2: Review, Approval, And Reporting

### Findings

- Review decision and pipeline review are intentionally separate: one may
  request remediation, while the other is retrospective evidence only.
- Human approval already follows the target boundary: the stage owns the
  decision protocol, while messaging, waits, authorization, and resume belong
  to capabilities and core.
- Case-study generation had no reason to own publication side effects.
- The legacy project-summary path delegated a deterministic reporting problem
  to a generator and mixed formatting, persistence, telemetry, and Discord
  delivery.

### Changes

- Retained the strict review, approval, case-study, and pipeline-review
  reducers and recorded their complete per-registration decisions.
- Recorded the intentional removal of case-study publication authority.
- Kept project summary as a deterministic rewrite and hardened every count,
  identity, overflow, percentage, diagnostic, and zero-denominator boundary.
- Added a native TypeScript project-summary behavioral parity suite.
- Added replacement evidence scenarios for all five registrations.

### Verification

- `npm test --prefix skills/nova/plugins/review`
- `npm test --prefix skills/nova/plugins/human-approval`
- `npm test --prefix skills/nova/plugins/case-study`
- `npm test --prefix skills/nova/plugins/pipeline-review`
- `npm test --prefix skills/nova/plugins/project-summary`

## Batch 3: Forge And Implementation

### Findings

- The legacy Forge supervisor combines implementation policy with session
  polling, handoff, transcript collection, retry, termination, and scheduler
  bookkeeping.
- Copying that supervisor would preserve accidental complexity. The runtime
  capability is the correct owner of generic session mechanics; the stage must
  still prove the terminal session and implementation evidence it consumes.
- Repository reads and blueprint synchronization already have cohesive,
  minimal v2 boundaries.

### Changes

- Rewrote the implementation completion contract around explicit terminal
  session evidence: stable session identity, start/completion timestamps,
  transcript digest, handoff count, and termination classification.
- Ready-for-testing now requires a completed session, changed paths, and only
  passing checks. Blocked work cannot claim successful session completion.
- Replaced the edited JavaScript protocol suite with native TypeScript.
- Upgraded the live implementation harness to execute a local session workflow,
  produce a real workspace change and transcript, and verify its digest through
  the complete v2 core/capability path.
- Recorded reuse/refactor/rewrite decisions and replacement scenarios for
  repository reads, implementation, and blueprint synchronization.

### Verification

- `npm test --prefix skills/nova/plugins/implementation-agent`
- `npm test --prefix skills/nova/plugins/blueprint-sync`
- `npm test --prefix skills/nova/plugins/repository-adapter`
- `node --test $(find tests/skills/nova/pipeline/agents -type f -name '*.test.mjs' -print | sort)`

## Batch 4: Buster Execution And Quality

### Findings

- The extracted test-agent previously judged supplied booleans and therefore
  did not deserve its execution-stage name.
- Recreating the Buster worker wholesale would also recreate its scheduler,
  polling, subprocess, and session coupling.
- Buster evidence production and Nova quality adjudication must remain separate
  so the testing role cannot approve itself.

### Changes

- Rewrote test-agent as an explicit execute, collect, judge flow.
- Added bounded real command-suite execution through `command.execute`.
- Preserved supplied evidence for specialized non-command suites and requires at
  least one real or supplied suite.
- Added strict terminal test-session evidence, transcript digest, identity, and
  termination validation.
- PASS now requires passing suite evidence, no findings, and a completed
  terminal test session.
- Rebuilt the live test around a real subprocess suite plus a local runtime
  session/transcript harness through the complete v2 core.
- Converted edited Buster protocol tests to TypeScript.
- Added the complete quality-gate failure-class matrix.
- Recorded the paired legacy and replacement scenarios for both Buster
  registrations.

### Verification

- `npm test --prefix skills/buster/plugins/test-agent`
- `npm test --prefix skills/nova/plugins/buster-quality-gate`
- `node --test $(find tests/skills/buster -type f -name '*.test.mjs' -print | sort)`
- `node --test tests/verification/e2e/buster-simulator.test.mjs`

## Batch 5: Privileged Adapters

### Findings

- The existing Git adapter preserved worktree, commit, merge, and path-sync
  behavior, but did not cover the observable fetch, rebase, and push surface.
- Redis publication cannot honestly be represented by generic HTTP, local
  telemetry, or plugin-state adapters. Authentication, Streams trimming,
  atomic deduplication, and Redis entry receipts are provider semantics.
- Operator request transport is a cohesive adapter boundary. Discord
  presentation, notification policy, audit projection, and degraded/restored
  notices remain observer behavior and are carried into Phase 10.
- Generic session supervision belongs behind `runtime.dispatch`; domain stages
  consume closed terminal session evidence and never receive host credentials
  or raw session APIs.

### Changes

- Added bounded `fetch`, `rebase`, and `push` operations to `git.sync`.
- Added real bare-remote Git tests for fetch, rebase, push, ref validation, and
  option-injection denial.
- Added `kubeclaw.redis-transport` with independent publication and telemetry
  adapter registrations.
- Implemented a bounded RESP transport with secret-based authentication,
  TLS support, payload limits, timeout/cancellation, stream-name
  canonicalization, approximate MAXLEN trimming, and an atomic Lua
  deduplication/append transaction.
- Added TypeScript package-boundary and local Redis-protocol tests.
- Recorded one reuse/refactor/rewrite decision and one package-local
  replacement scenario for every privileged adapter package.

### Verification

- `npm test --prefix skills/common/plugins/git-workspace`
- `npm test --prefix skills/common/plugins/redis-transport`
- All package-local privileged-adapter suites through the parity recorder
- Real Redis backend smoke remains a Phase 12 cutover test; the Phase 9 test
  proves the provider protocol locally without requiring external services.
