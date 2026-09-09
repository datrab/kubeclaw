# T01-F01 / T01-F02 — explicit source admission in the project compiler

This is a bounded implementation of the source half of the project lifecycle.
The findings remain partial: no legacy scaffold importer, deployed demo delivery,
Ready transition or final operator acceptance is established by this slice.

## Contract and root cause

The old compiler began with module implementation. `nova-project.v2` requires
explicit architecture source files and per-module blueprint locations plus
nullable Docker/API deliverable selectors. Requirements, owned paths, mandatory
module checks and cumulative checks remain authored inputs. Version 1 is rejected
with a migration error instead of silently receiving inferred source authority.
No compatibility adapter or inferred prose requirements are introduced.

The compiler emits mandatory deterministic source-preflight, optional architecture
review and findings approval, then one complete Blueprint sync before the existing
module lane. The generic Core remains independent of those business stage names.
Source admission reads committed regular files through the original Git adapter
and captures the original immutable ReviewSubject. It verifies the declared
baseline and complete file set, parses each actual FORGE delivery declaration,
and binds the full project requirement/check policy by canonical digest.
The existing 128-control-file capture limit is enforced before graph emission;
no file is dropped to fit it.

Every compiled sync and implementation selects the exact source producer in its
current run and checks the stored artifact bytes, reference, subject and contract
digest. Original Git source/ref/file/mode and sequential lineage checks remain the
mutation authority. Missing or wrong evidence blocks before implementation.
Standalone explicit graphs retain their existing unbound behavior; they do not
establish the new compiled project guarantee.

Architecture agent review is absent by default. When enabled, it receives the
same actual subject and complete policy, not only a digest. A clean report skips
the wait. Findings require the original report/source-bound operator decision.
The first added compiled findings regression exposed a real integration bug:
sharing the single-invocation source budget blocked the first approval.pending
result in the original lifecycle reducer. Only the approval stage now declares
two invocations: create the durable wait, then consume its bound decision. Source,
review and sync remain single-invocation stages; quality repair budgets do not
change. A decision cannot turn a failed mandatory source check into success.

## Configuration and migration

The setup instructions now use the existing closed CLI flags and distinguish the
legacy scaffold editor from v2 project authoring. The project README documents
explicit fields, capabilities, source budgets and remaining migration gaps.
Architecture-validator now needs artifact reads; source-preflight needs original
Git reads and preflight artifact writes. Sync and implementation need preflight
artifact reads in addition to original lineage grants. Real deployment grants
must be migrated; local fixture grants are not evidence of installed access.

## Validation and honest limits

Initial local validation retained its failures: a concurrently incomplete new
capability registration blocked full registry discovery, and the new isolated
source fixture omitted the original JUnit report adapter required by its actual
direct-command provider. The fixture now includes that real adapter; no report
requirement was disabled. Six affected commands then passed, alongside Nova
strict compilation. Original approval-source 13/13, four plugin builds and
shared compilation also passed. Exact commands and raw outputs are in
[initial results](../../evidence/project-source-local-results.json) and
[rerun results](../../evidence/project-source-local-rerun-results.json).

The new source fixture compiles the full project, then deliberately executes only
its source/sync/implementation prefix with original Core, native Git, artifact
stores and local HTTP transport vectors. It does not claim actual model quality,
isolated Buster execution or a complete product E2E. Compiler checks execute zero
stages. Added findings/approval tests preserve their initial failure and diagnostic
logs rather than rewriting them as successes. Final results are recorded below
after independent review.

The earlier author agent stopped on an automatic content-screening error. That
interruption is not an implementation result or passed test. Subsequent work was
limited to reviewing existing code and ordinary local compiler/Git/HTTP checks;
no external security actions, deployment or CI was performed.

Final source regression: [nine original-consumer cases](../../evidence/project-source-nine-tests.txt)
pass, including actual compiled findings, one durable wait, successful bound resume
and changed-source rejection before sync. Initial approval failures remain in
`project-source-compiled-approval.txt` and `project-source-compiled-approval-diagnostics.txt`.

Existing byte budgets remain material: enabled human architecture approval reads
at most 256 KiB for the complete report, including its subject; source artifact
reads have a separate 4 MiB ceiling. The 128-file count does not guarantee that
an arbitrarily large subject fits either reader. Oversized reports block; no
truncation, limit increase or summary-only approval authority was introduced.

Independent final review approved the compiled wait/resume correction and both
new cases. Canonical ESLint passes all 11 changed Source production files with
no suppressions or baseline exceptions; Nova strict compilation passes after
the final correction. See `project-source-independent-production-lint.txt` and
`project-source-independent-nova-typecheck.txt` in the evidence directory.
