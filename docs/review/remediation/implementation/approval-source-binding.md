# Source-bound architecture/report approval — PATH-T04-001

Implemented 2026-09-09; targeted local verification completed. Independent counterreview and Root source-boundary review completed. This patch implements source binding only, not
PATH-T04-002 risk-acceptance composition or a new operator acceptance policy.
D02/D10 continue to require the relevant operator decision for the exact evidence;
blocking findings, corrupted evidence and incorrect attribution are not overridden.

## Root cause and implementation

Previously the architecture producer accepted a task and arbitrary architecture
object, approval checked only report bytes, Blueprint resolved a mutable branch
later, and Forge created its workspace from ambient HEAD. Graph pinning did not
bind external repository or plan files. Identical accepted report bytes could
therefore precede execution on changed source.

The patch reuses the existing `git.repository.read` freeze/read proof, canonical
JSON digest, ArtifactRef, run/attempt identity and durable wait/decision mechanisms.
It adds no second journal, generated contract field, new capability, plugin-specific
core branch, or repair-budget change.

- Architecture input may declare `source` with project, canonical repository,
  architecture ref and explicit architecture/module-plan paths. The authorized
  repository adapter resolves source HEAD and the architecture ref to full commits,
  reads the actual declared bytes at the pinned revision, and checks clean source.
  The trusted producer records project/run/repository, both commits, input digest,
  file bytes/digests/sizes/regular-file modes and the canonical subject digest. The agent receives
  that immutable subject. All declared paths must appear in checkedFiles; refs
  are rechecked after the response before its report is stored.
- Architecture approval validates the original report ArtifactRef and subject,
  rechecks current source/architecture before requesting or resuming approval,
  and stores a report-bound approval artifact. The existing wait's report digest
  transitively binds these subject bytes; the existing authorized issuer and
  wait-ID checks remain in force. Approval of source-less reports produces
  report-only evidence and cannot authorize downstream Blueprint or Forge.
  Generic human approval is unchanged.
- Clean, subject-bound reports retain the existing no-findings behavior: graphs
  may skip human architecture approval. This is not acceptance of a failed check.
  A source-less report, stale report/approval pair or ambiguous producer fails
  downstream authority resolution.
- Blueprint consumes the pinned architecture commit and limits sync to reviewed
  paths. Its artifact binds the subject to actual before/after source revisions.
  Forge resolves that artifact and completed ancestor implementation artifacts,
  accepting only a unique subject-bound source chain. Legitimate sequential
  modules can consume predecessor commits; external commits do not silently
  become that chain. Reviewed architecture/plan bytes must remain identical.
- Worktree creation, sync, commit and merge recheck source at their original Git
  mutation boundary. Worktree and merge sources are pinned commits, not later
  resolutions of mutable refs. Reviewed bytes are checked before worktree creation
  and merge; transition parent commits and resulting reviewed bytes are checked
  before results can extend authority. An external main-branch change during
  implementation blocks merge and the next module.

The source-less reporting API remains usable. A workflow intending to proceed
from architecture review to implementation must supply the source declaration and
read/write grants; unbound reports are not grandfathered into execution authority.
Runtime role `packaging/runtime/roles/nova.json` already includes repository,
artifact and Git adapters. The actual production-pipeline launcher now supplies
source/plan inputs and coherent grants, including the report/approval/lineage
artifact namespaces. The project compiler has no architecture composition today;
adding one belongs to PATH-T04-002 and is not smuggled into this patch.

## Verification

- `node --test tests/verification/reliability/approval-source.test.mjs tests/verification/reliability/admin-repair.test.mjs`:
  13/13 passed. Nine source-binding tests use the original engine, architecture,
  approval, Blueprint and Forge plugins plus original repository/Git, artifact,
  wait, operator, HTTP and dispatch adapters. They run real temporary repositories,
  native HTTP endpoints, immutable artifact stores, worktree creation, commits and
  merges. The deterministic local reviewer/implementation endpoint is a test
  service, not a claim of live OpenClaw/model evaluation; no runtime, Git, storage
  or module implementation is replaced with a shim or mock.
- Positive: real source capture, operator wait/approval, pinned Blueprint sync,
  two sequential original Forge implementations and identical journal replay.
  Clean bound reports also pass with the approval stage genuinely skipped.
- Negative: source commit, dirty plan at unchanged path, or moved architecture
  ref during the wait; source drift after approval before sync or Forge; source-less
  report followed by attempted execution; external source commit while the original
  implementation dispatch is active. These cannot dispatch the next unauthorized
  implementation or merge onto unexpected main source. Original report/decision
  evidence remains retained.
- Original `npm test && npm run build` passed in human-approval,
  architecture-validator, blueprint-sync, implementation-agent,
  repository-adapter and git-workspace. The architecture build initially caught
  an implicit output type introduced by the coverage check; explicit types fixed
  it and the build was rerun successfully. No test or lint rule was weakened.
- Whole Nova TypeScript check passed. Canonical ESLint passed for all changed
  production TypeScript, test/fixture and production-launcher files.
  `git diff --check` passed.

## Limits

No live model, cluster, deployed runtime role, operator delivery or production E2E
was launched. Local tests do not establish those operational proofs. The existing
repository adapter's configured `expectedHead` still applies; source declarations
must select refs compatible with that explicit pin. Source capture rejects dirty
working trees instead of silently incorporating uncommitted files. Plans must be
committed, declared review inputs; generic task text alone is not source authority.

Git mutation checks do not claim to prevent an unrelated external process from
writing between every OS operation. Consumed commits are immutable; failed parent
or byte validation denies a result from extending approval authority. Any Git
mutation whose outcome becomes uncertain remains subject to the existing effect
reconciliation boundary, not an automatic reapproval or rollback fiction.

## Independent-review correction

Independent review reproduced an external commit made inside the owned Forge
worktree during dispatch. The initial patch still discarded `git.commit`'s
returned commit and later resolved the mutable branch, so that extra source could
enter the approved chain. Forge now supplies the original owned source as the
expected commit parent, and the original Git adapter checks HEAD before committing
and the resulting first parent afterward. Forge retains the returned full commit;
merge rejects a branch that moved away from it and consumes that exact commit.
Direct Git clients that omit these binding fields retain their original behavior.

The correction adds a real original-engine worktree-commit regression and an
original Git-adapter regression that moves the branch after its commit result,
checks rejection with unchanged target, then checks the unchanged unbound-client
behavior. Git-workspace and implementation-agent original tests/builds, correction
lint and whole Nova typecheck passed again. The source-binding suite was rerun:
10/10 passed, including both original main-source drift and new worktree drift.

A second original-engine reproduction found that an integrity-valid Blueprint
artifact for an earlier subject incorrectly blocked fresh approval after an
administrative architecture rerun. Authority resolution now ignores prior-subject
sync artifacts after verifying their original bytes, matching implementation
lineage behavior; same-subject invalid transition bindings still reject.

Review input capture now requires regular Git files and binds their exact mode.
This prevents approved symlink blob text from authorizing later filesystem reads
through a mutable target. Git workspace verification checks mode and bytes, and
Blueprint's no-change check preserves reviewed executable-mode changes even when
the content is unchanged. The added native regressions cover renewed source
approval through original administrative repair, symlink rejection before agent
dispatch, and successful mode-only synchronization.

Final combined source-binding (13) and original administrative-repair (4) tests:
17/17 passed. Original repository-adapter and Git-workspace tests/builds passed
again; correction ESLint and whole Nova typecheck passed. The repository reader's
unchanged object-ID parser and new mode parser were extracted into its existing
revision-parsers module to keep the original 300-line lint boundary intact.

## Exact patch scope

New files:

- `skills/common/plugin-runtime/sdk/src/review-subject.ts`
- `skills/common/plugin-runtime/sdk/src/source-approval.ts`
- `skills/common/plugins/git-workspace/src/review-source.ts`
- `tests/verification/reliability/approval-source-fixture.mjs`
- `tests/verification/reliability/approval-source.test.mjs`
- This implementation note.

Changed files:

- SDK `src/index.ts`: two helper exports only; no generated contract mutation.
- git-workspace `src/operations.ts`: original Git admission/pinning/transition checks;
  `tests/live-function.test.ts`: moved-branch regression with actual returned commit.
- architecture-validator: `plugin.json`, `schemas/input.schema.json`,
  `src/protocol.ts`, `src/stage.ts`, `tests/live-function.test.ts`, `README.md`.
- human-approval: `plugin.json`, `src/architecture-approval.ts`,
  `tests/package-boundary.test.mjs`, `README.md`.
- blueprint-sync: `plugin.json`, `src/stage.ts`, `tests/live-function.test.ts`, `README.md`.
- implementation-agent: `src/stage.ts`, `README.md`.
- repository-adapter: `src/adapter.ts`, `src/revision-reader.ts`,
  `src/revision-parsers.ts`, `README.md`.
- `tests/verification/reliability/admin-approval-fixture.mjs`: coherent new grants.
- `tests/verification/e2e/run-v2-production-pipeline.mts`: actual source declaration,
  full module-plan input and report/approval/lineage grants.

No staging, commits, CI, deployment, budget changes, force-passed checks or
PATH-T04-002 acceptance behavior were performed in this task.
