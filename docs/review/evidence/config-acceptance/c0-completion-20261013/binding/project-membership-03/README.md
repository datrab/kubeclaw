# Project membership source join (partial C0-D definition)

The producer is `compileProject`, not prefix guessing by the runtime. Proposed
membership accompanies the new graph version; graph digest authenticates the
declaration. Compiler's actual ordered module list supplies the module identities.

| Group | Exact generated members | Actual producer |
|---|---|---|
| `foundation` | `source-preflight`; optional `architecture-review`, `architecture-approval`; `blueprint-sync` | `project/source.ts::sourceStages`, optional only when `architecture.review` exists |
| `module:<declared module.id>` | `implement-${module.id}`, `lint-${module.id}`, optional `review-${module.id}`, `test-${module.id}` | `project/compiler.ts::moduleStages`, optional only when `module.review` exists |
| `integration` | `final-lint`, optional `final-review`, `final-test` | `project/coverage.ts::cumulativeStages`, optional only when `final.review` exists |
| `delivery` | `project-summary`; optional `demo-candidate`, `demo-delivery`, `demo-ready` | summary from `cumulativeStages`; demo from `project/demo.ts::demoStages`, optional only when valid declared demo exists |

These exact producer assignments refine the initial binding document's broad
group description. Delivery begins before project-summary, not before final-test.
One implementation/lint/review/test repair loop is one module; every current
`request_fix` from its lint/review/test points to its original implementation.
An accepted module binding covers all its stages, including initially unstarted
rechecks. Publication after implementation cannot silently change its lint/test.
Architecture approval suspension/resume remains in original foundation group.
Final integrated validation stays together. Dependencies spanning groups remain
original graph dependencies and do not merge/restart the referenced group.

Actual current compiler fixture controls ran for no-review and review variants:
11/16 stages; exact unique coverage, repair-group consistency and optional review
membership observed. Five groups in each (two real modules). Source/test identities
and raw output are recorded. Setup attempt01 had an incorrect relative import;
its original failure and script are retained. Successful rerun changed only that
evidence harness import path, not production or existing tests.

The demo branch is source-traced, **not executed** here; a valid real full demo
plan/fixture remains a required implementation-spec join. Explicit/custom graphs
require declared exact membership and verified no extra/missing stage; producer
prefix matching is forbidden. Standalone Prism order/Buster plan/preparation
cleanup use their actual separate intent/claim producers, not these project IDs.
The complete field partition, all those standalone paths, authenticated target
digest/schema records and durable real acceptance remain unfinished C0-D work.
No CONFIG/runtime implementation or independent acceptance is claimed.
