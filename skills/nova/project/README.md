# Nova project runtime

`nova-project.v1` is a product-level input compiled into the existing v2 lifecycle graph. Its compiler and launcher ship in Nova's role bundle as `@kubeclaw/nova-project`; the lifecycle core does not own module stage names. Buster continues to own provider execution. Nova's existing quality stage orchestrates the verified remote decision and subsequent evaluator dispatch.

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
| `schemaVersion` | Exactly `nova-project.v1` |
| `id` | Lowercase project identifier, up to 48 characters |
| `runId` | Explicit identity, matching every resolved provider plan |
| `repositoryRoot` | Absolute repository path |
| `workspaceRoot` | Absolute worktree parent outside the repository |
| `baseRevision` | Full 40-character committed Git baseline |
| `modules` | One to 128 module declarations |
| `final` | Required `{lint, test, integrationRequirements, review?}` cumulative gates |

Each module declares `id`, `dependsOn`, `task`, nonoverlapping repository-relative `ownedPaths`, and nonempty `requirements` containing `{id, statement}`. The module also supplies:

- `implementation`: `{agent, agentRole?}`.
- `lint`: `{policyPath, policyProject}`; policy path is absolute.
- `review`: optional `{agent}` using the normal blocking review profile; Echo defaults off.
- `test`: `{requiredChecks, agent?, agentRole?, testAgentEnabled?, providerPlan}`. Buster and its test-agent default on (`agent: "buster"`); explicit `testAgentEnabled: false` suppresses only agent dispatch. The provider plan contains `repositoryId`, a complete resolved `plan`, per-node `grants`, `maximumConcurrency`, `submittedAt`, and `timeoutMs`. The compiler owns repository and source-stage selection. Neither a static revision nor caller-supplied success evidence belongs in this object.

Resolve provider plans from the real worker registry before compiling. Each plan's digest, run, project and module scope must match; at least one non-skipped blocking test is required. Compilation does not establish that the provider has executed or that its declared command is sufficient coverage.

## Scheduling and repair

Modules are sorted topologically with a stable identifier tie-break. A project uses one repository publication lane: implementation, full lint, optional scoped review, then native provider quality evaluation complete before another module starts. Explicit module dependencies remain in the graph. This prevents another module from advancing shared HEAD during those checks; it does not prevent changes by an unrelated process outside Nova.

Lint, review and test repair requests target their module's implementation. Forge receives verified JSON contents from the requester's artifacts, limited to 32 artifacts and a 256 KiB complete handoff. Missing, corrupt, cross-run or oversized evidence blocks before worktree creation; evidence is never silently truncated. Grant implementation `artifacts.read` access to `kubeclaw.lint`, `kubeclaw.review` and `kubeclaw.buster-quality-gate`. Existing durable repair invalidation clears later results and schedules the checks again. Provider execution selects the actual implementation artifact's verified source revision, never ambient HEAD. Review resolves the module’s original before-revision and latest candidate from verified implementation artifacts. It retains that baseline across repairs and blocks before agent dispatch if repository HEAD differs from the candidate. Requirements remain digest-bound. The review stage needs artifact read grants for both `kubeclaw.review` and `kubeclaw.implementation-agent`. The quality stage persists the native decision before returning a nonpassing disposition or dispatching its evaluator.

## Acceptance and migration limits

The compiler regression uses real Git, resolved provider contracts, the installed stage registry and the extracted Nova launcher for two dependent modules. It executes zero implementation/review/test stages and is not an end-to-end agent acceptance test. The isolated-provider regression separately executes healthy and deliberately broken committed source through the real quality stage and remote adapter; its local evaluator is a deterministic source assertion, not an LLM quality claim.

A separate integration regression uses real Git commits and durable artifact storage to verify two module revision ranges, cumulative repair review, actual source contents, tampered references, ambiguous artifacts, and rejection of an unrelated HEAD. It supplies no agent verdicts and does not establish full agent execution.

This route does not yet replace the legacy project scaffold or all production E2E orchestration. Prism approval and baseline import, full verified evidence contents for repair/evaluation, external delivery and deployed acceptance remain open. The compiler now emits mandatory cumulative gates and a verified quality manifest, which does not establish a live demo or operator acceptance. Do not use compile success as evidence of those features.

Quality-stage graphs must migrate to `{gateId, task, providerPlan}`. `runId`, `attempt`, `suitePlan` and `suiteEvidence` are removed from that stage's public input: identity comes from the core lease and evidence from the verified remote import. Keep old runtime versions available to drain existing snapshots; do not rewrite historical authority using current inputs.

Compiled lint stages require `artifacts.read` access to `kubeclaw.implementation-agent`. Lint resolves the selected implementation commit and checks an isolated Git checkout of those committed files; uncommitted edits and newer repository HEAD cannot replace the candidate. Required language tools and dependencies must be available to that checkout. Missing tooling stays a blocking execution error. Standalone lint calls without a revision selector keep working-directory lint behavior.

## Explicit mandatory coverage and final gates

Declare `requiredChecks` before suite selection, with `{checkId, requirementRefs, nodeIds}`. A requirement reference is `{moduleId, requirementId}`; `moduleId: null` refers to an explicitly declared final integration requirement. `nodeIds` name original test declarations, such as `unit/assertion`; every resolved matrix variation is required. A missing, excluded, condition-skipped, advisory or unsuccessful required node cannot pass coverage. Optional nodes retain their existing semantics. No fixed suite count establishes completeness.

Resolve each provider plan with `declaration.coverage` containing `gate-coverage.v1`: projectId, kind, baseRevision, modules (`moduleId`, ownedPaths, full requirements), integrationRequirements, requiredChecks, and policyDigest from `gateCoverageDigest(unsigned)`. Module policies contain precisely that module. The cumulative policy contains the sorted complete module/requirement/path union plus `final.integrationRequirements`; its resolved scope is `{moduleId:null, gateId:"final-test"}`. Module and requirement ordering must match the compiler's canonical order. The compiler independently reconstructs expected policies from project fields and rejects narrower plans, even on the same source commit.

`final.lint` uses the same policy configuration shape as module lint. `final.test` uses the same test configuration shape and has its own complete cumulative plan and explicit required checks. `final.review` is optional; when enabled it reviews project baseline through the final integrated candidate with all requirements and owned prefixes. Final gates have no implicit last-module repair target. Failed cumulative checks stop technical completion instead of guessing which module owns a cross-module defect.

The graph ends with final-lint, optional final-review, final-test, and project-summary. The summary registration needs artifact read grants for implementation, lint, review and Buster quality namespaces, plus writes to `kubeclaw.project-summary`. Old project inputs missing explicit coverage or final gates require migration; standalone unbound test plans still run but cannot establish project completeness. `npm run verify:test-gate:coverage` includes genuine local source tests, actual remote skipped executions and explicitly labelled artifact-contract tests; no successful isolated Buster/agent E2E is inferred from them.
