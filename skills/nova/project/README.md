# Nova project runtime

`nova-project.v2` is a product-level input compiled into the existing v2 lifecycle graph. Its compiler and launcher ship in Nova's role bundle as `@kubeclaw/nova-project`; the lifecycle core does not own module stage names. Buster continues to own provider execution. Nova's existing quality stage orchestrates the verified remote decision and subsequent evaluator dispatch.

## Commands

```sh
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json --compile /path/new-pipeline.json
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json --recover run:example
node /app/skills/pipeline.ts --platform /path/platform.json --project /path/project.json --signal /path/resume-signal.json
```

Compile validates the graph against the installed registrations, input/config schemas and capability grants without starting adapters or creating a run. It refuses to overwrite an existing output. Normal execution requires a clean repository at the declared baseline. Recovery retains the original project, resolved plans, run identity and platform configuration; immutable snapshot validation rejects drift. Explicit `--pipeline` graphs retain the existing core CLI and concurrency behavior.

## Project fields

| Field | Meaning |
|---|---|
| `schemaVersion` | Exactly `nova-project.v2` |
| `id` | Lowercase project identifier, up to 48 characters |
| `runId` | Explicit identity, matching every resolved provider plan |
| `repositoryRoot` | Absolute repository path |
| `workspaceRoot` | Absolute worktree parent outside the repository |
| `baseRevision` | Full 40-character committed Git baseline |
| `architecture` | Required `{ref, requiredFiles, review?}` immutable source admission |
| `modules` | One to 128 module declarations |
| `final` | Required `{lint, test, integrationRequirements, review?}` cumulative gates |

Each module declares `id`, `dependsOn`, `task`, nonoverlapping repository-relative `ownedPaths`, and nonempty `requirements` containing `{id, statement}`. The module also supplies:

- `blueprint`: required `{modulePath, substeps?, serveDockerfile, apiSpecFile}`; both deliverable selectors must be explicit repository-relative paths or `null`.
- `implementation`: `{agent, agentRole?}`.
- `lint`: `{policyPath, policyProject}`; policy path is absolute.
- `review`: optional `{agent}` using the normal blocking review profile; Echo defaults off.
- `test`: `{requiredChecks, agent?, agentRole?, testAgentEnabled?, providerPlan}`. Buster and its test-agent default on (`agent: "buster"`); explicit `testAgentEnabled: false` suppresses only agent dispatch. The provider plan contains `repositoryId`, a complete resolved `plan`, per-node `grants`, `maximumConcurrency`, `submittedAt`, and `timeoutMs`. The compiler owns repository and source-stage selection. Neither a static revision nor caller-supplied success evidence belongs in this object.

Resolve provider plans from the real worker registry before compiling. Each plan's digest, run, project and module scope must match; at least one non-skipped blocking test is required. Compilation does not establish that the provider has executed or that its declared command is sufficient coverage.

## Scheduling and repair

Modules are sorted topologically with a stable identifier tie-break. A mandatory deterministic source-preflight, optional architecture review/findings approval, and one complete Blueprint sync precede the modules. A project uses one repository publication lane: implementation, full lint, optional scoped review, then native provider quality evaluation complete before another module starts. Explicit module dependencies remain in the graph. This prevents another module from advancing shared HEAD during those checks; it does not prevent changes by an unrelated process outside Nova.

Lint, review and test repair requests target their module's implementation. Forge receives verified JSON contents from the requester's artifacts, limited to 32 artifacts and a 256 KiB complete handoff. Missing, corrupt, cross-run or oversized evidence blocks before worktree creation; evidence is never silently truncated. Grant implementation `artifacts.read` access to `kubeclaw.lint`, `kubeclaw.review` and `kubeclaw.buster-quality-gate`. Existing durable repair invalidation clears later results and schedules the checks again. Provider execution selects the actual implementation artifact's verified source revision, never ambient HEAD. Review resolves the module’s original before-revision and latest candidate from verified implementation artifacts. It retains that baseline across repairs and blocks before agent dispatch if repository HEAD differs from the candidate. Requirements remain digest-bound. The review stage needs artifact read grants for both `kubeclaw.review` and `kubeclaw.implementation-agent`. The quality stage persists the native decision before returning a nonpassing disposition or dispatching its evaluator.

## Acceptance and migration limits

The compiler regression uses real Git, resolved provider contracts, the installed stage registry and the extracted Nova launcher for two dependent modules. It executes zero implementation/review/test stages and is not an end-to-end agent acceptance test. The isolated-provider regression separately executes healthy and deliberately broken committed source through the real quality stage and remote adapter; its local evaluator is a deterministic source assertion, not an LLM quality claim.

A separate integration regression uses real Git commits and durable artifact storage to verify two module revision ranges, cumulative repair review, actual source contents, tampered references, ambiguous artifacts, and rejection of an unrelated HEAD. It supplies no agent verdicts and does not establish full agent execution.

This route does not yet replace the legacy project scaffold or all production E2E orchestration. Prism source authoring and legacy baseline import, external delivery and deployed acceptance remain open. The optional architecture reviewer uses the original report-bound findings approval when enabled. The compiler now emits mandatory cumulative gates and a verified quality manifest, which does not establish a live demo or operator acceptance. Do not use compile success as evidence of those features.

Quality-stage graphs must migrate to `{gateId, task, providerPlan}`. `runId`, `attempt`, `suitePlan` and `suiteEvidence` are removed from that stage's public input: identity comes from the core lease and evidence from the verified remote import. Keep old runtime versions available to drain existing snapshots; do not rewrite historical authority using current inputs.

Compiled lint stages require `artifacts.read` access to `kubeclaw.implementation-agent`. Lint resolves the selected implementation commit and checks an isolated Git checkout of those committed files; uncommitted edits and newer repository HEAD cannot replace the candidate. Required language tools and dependencies must be available to that checkout. Missing tooling stays a blocking execution error. Standalone lint calls without a revision selector keep working-directory lint behavior.

## Explicit mandatory coverage and final gates

Declare `requiredChecks` before suite selection, with `{checkId, requirementRefs, nodeIds}`. A requirement reference is `{moduleId, requirementId}`; `moduleId: null` refers to an explicitly declared final integration requirement. `nodeIds` name original test declarations, such as `unit/assertion`; every resolved matrix variation is required. A missing, excluded, condition-skipped, advisory or unsuccessful required node cannot pass coverage. Optional nodes retain their existing semantics. No fixed suite count establishes completeness.

Resolve each provider plan with `declaration.coverage` containing `gate-coverage.v1`: projectId, kind, baseRevision, modules (`moduleId`, ownedPaths, full requirements), integrationRequirements, requiredChecks, and policyDigest from `gateCoverageDigest(unsigned)`. Module policies contain precisely that module. The cumulative policy contains the sorted complete module/requirement/path union plus `final.integrationRequirements`; its resolved scope is `{moduleId:null, gateId:"final-test"}`. Module and requirement ordering must match the compiler's canonical order. The compiler independently reconstructs expected policies from project fields and rejects narrower plans, even on the same source commit.

`final.lint` uses the same policy configuration shape as module lint. `final.test` uses the same test configuration shape and has its own complete cumulative plan and explicit required checks. `final.review` is optional; when enabled it reviews project baseline through the final integrated candidate with all requirements and owned prefixes. Final gates have no implicit last-module repair target. Failed cumulative checks stop technical completion instead of guessing which module owns a cross-module defect.

The graph ends with final-lint, optional final-review, final-test, and project-summary. The summary registration needs artifact read grants for implementation, lint, review and Buster quality namespaces, plus writes to `kubeclaw.project-summary`. Old project inputs missing explicit coverage or final gates require migration; standalone unbound test plans still run but cannot establish project completeness. `npm run verify:test-gate:coverage` includes genuine local source tests, actual remote skipped executions and explicitly labelled artifact-contract tests; no successful isolated Buster/agent E2E is inferred from them.

## Required immutable source admission (v2 migration)

Version 1 is rejected explicitly; it cannot silently enter an unbound project lane.
Every module supplies its blueprint location and explicit deliverable selectors.
`architecture.ref` names a committed architecture source (a full commit or Git ref);
`architecture.requiredFiles` lists additional required repository-relative control
files, and may be empty when the module blueprints are the complete control set.
The compiler adds all explicitly selected module/substep FORGE.md paths. Files
must be regular committed files; missing files, symlinks and invalid declarations
block before any agent dispatch. The [Forge declaration contract](../plugins/preflight-contract/README.md)
is mandatory in each consumed blueprint. Ownership and required coverage remain
explicit project inputs, never inferred from filenames or prose.

The native source stage captures the existing immutable ReviewSubject once, at
`baseRevision`, including the exact declared architecture files and the digest of
module requirements/checks and final integration/check policy. The original
compiler and runtime validator check project graph/configuration/capability
contracts; the native stage checks declared source presence, identities and
machine-readable delivery declarations. This does not semantically validate
arbitrary prose or infer an application's architecture requirements.

`architecture.review` is absent by default. When enabled it requires
`{agent, approval:{target, issuerId, timeoutMinutes?}}`, with real operator target
and wait-issuer grants. The agent consumes the same stored subject. A clean report
skips the approval wait; findings require the existing report/source-bound human
approval. Mandatory native failure cannot be replaced by an agent verdict.

One Blueprint sync publishes the complete admitted control set before the first
implementation. Every implementation and the sync require the exact source stage
and input digest; missing evidence blocks. Existing Git boundaries verify source
HEAD, architecture ref, reviewed file bytes/modes and sequential implementation
lineage before workspace creation and merge. Changes require new source admission,
not an unbound retry. Requirements and cumulative coverage-v2 gates remain intact.

Grant source-preflight `git.repository.read` and writes to
`kubeclaw.preflight-contract`. Sync/implementation need reads of that namespace,
Blueprint/implementation lineage and enabled architecture/approval artifacts.
The architecture validator now declares `artifacts.read` (including for existing
standalone registrations); migrate its grant to allow the preflight namespace.
Enabled approval also needs the original operator-request and durable wait grants.

The setup scaffold remains a legacy declaration editor, not a v2 project importer.
Author the v2 project file explicitly and resolve its declared provider plans from
the actual installed registry before the documented `--compile` command. Missing
source, requirement or coverage fields need an explicit authoring decision. A
future legacy import must report missing information; this patch does not guess it.

`project-source.test.mjs` compiles full v2 projects and executes their bounded
source/sync/implementation prefix through original Git and artifact stores plus
explicit local HTTP transport vectors. It proves source-consumer integrity, not
LLM quality, downstream provider execution, complete delivery or acceptance.

The original immutable-source contract permits at most 128 distinct control files
in total, including architecture files and every selected module/substep FORGE.md.
The project compiler validates that same contract before emitting the graph.
Exceeding the budget requires an explicit source-structure change; the compiler
does not drop files or weaken the existing capture limit.

When architecture findings need human approval, the existing approval consumer
requires the complete report (including its immutable source subject) to fit
256 KiB. The source artifact reader separately permits up to 4 MiB. File count
alone does not establish that these byte budgets fit; oversized inputs block
rather than producing approval over truncated evidence.

Optional `demo` adds the explicit demo acceptance handoff after the qualified
project summary. Its closed fields are `authNodeId`, `protocol` (currently
`json-session.v1`), `operatorTarget`, and optional `retentionSeconds` (default
604800). Normalized demo policy is bound into the source contract and review
input digest. The final plan must contain the complete source image build,
checked manifest, deployment, generated credentials, retained exposure and
blocking coverage-qualified authentication links. See
[`demo-handoff`](../plugins/demo-handoff/README.md) for required private delivery,
controller authentication, grants and remaining native verification boundaries.

An omitted demo section preserves technical-only pipelines. CLI output marks that
scope explicitly and never treats technical completion as Ready-for-Acceptance
or human acceptance. A configured demo pipeline establishes Ready only after its
original evidence, delivery receipt and controller commit have all succeeded.
