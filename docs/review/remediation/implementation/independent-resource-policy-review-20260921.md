# Independent review: Prism resource policy

The bounded resource-policy implementation is accepted for its functional and
documentation criteria. **CP07's complete changed-file lint check remains red**
with three reproduced baseline violations; this review does not waive them or
claim all quality checks pass. No new implementation defect was found. The fresh
reviewer did not implement or modify this slice. CONFIG F1–F6, host capacity and
native kernel enforcement remain open.

## Production path and simplicity

The sole authored `operator.prism.native.resourcePolicy` is required and closed
by the shared schema. Both original loaders return a deeply frozen policy from
their startup document. The old `prismNativePolicy` resolver is removed; the three
retired environment keys occur in production only in the explicit rejection list.
The producer requires a policy argument and Control supplies its captured policy.
There is no optional policy argument, hidden process-environment lookup or copied
resource default in the producer. Original test/integration callers now obtain
their explicit policy from the original author loader rather than introducing
another author file or manually maintained constants.

The two small resource-policy functions keep separate responsibilities: compare
memory/task maxima with the selected pool, and map validated envelope budgets to
process-limit fields. The actual supervisor invokes both at the appropriate
boundaries. The admission extraction preserves the former new-versus-recovered
semantics: newly accepted budgets must fit the policy; an accepted historical
identity retains its original requested budgets. Missing requested budgets still
fail. CPU remains cumulative attempt-tree milliseconds, memory bytes, and tasks
Linux tasks including threads. No cumulative CPU-time/pool-rate comparison or
historical V1 process-count reinterpretation was introduced.

Helm requires the three-key native object and the exact three resource-policy
fields, using safe-integer bounds rather than Node timer limits. It preserves the
shared author/schema aliases, mounts and checksum delivery to Control and Worker,
and rejects competing Helm values. The canonical author, original schema/loaders,
producer, actual Control operation, supervisor admission and journal paths were
reviewed together. The per-attempt numbers alone do not establish simultaneous
host capacity; that limit is correctly documented.

## Independently executed checks

| Check | Result and boundary |
|---|---|
| [Runtime, Control operation and Helm](../../evidence/config-resource-policy-independent-20260921/runtime-helm.txt) | **232/232 passed**, no skipped/cancelled tests. Includes original production loaders, transport tests, strict policy values and safe-integer ceiling, real Helm/package delivery, PGlite persistence and real HTTP503 dispatch/retry. The HTTP peer is explicitly not a successful native worker. |
| [Original engine/service/cancellation consumers](../../evidence/config-resource-policy-independent-20260921/original-consumers.txt) | **17/17 passed**, no skips. |
| [Original filesystem journal regression](../../evidence/config-resource-policy-independent-20260921/journal.txt) | **8/8 passed**, no skips; actual GNU flock via Proot, persistence and actual child death, without a lock stub. |
| [Original native PostgreSQL operation-journal test](../../evidence/config-resource-policy-independent-20260921/postgresql/operation-journal.txt) | **1/1 passed** on a reviewer-owned, isolated PostgreSQL **18.6** server with original migration 017. Concurrent SQL reservations, committed writer death, result replay and a newly authored changed resource policy preserve the original accepted identity and budgets. Server start and stop are retained. No cgroup/launcher/worker success is claimed. |
| [Prism TypeScript](../../evidence/config-resource-policy-independent-20260921/typecheck.txt) | Exit 0. |
| [Independent snapshot probe](../../evidence/config-resource-policy-independent-20260921/snapshot-probe.txt) | Both roles reject each exact equal-value and empty legacy override; nested snapshots resist mutation; omitting producer policy fails; a high cumulative CPU limit is not incorrectly compared with CPU quota. [Source](../../evidence/config-resource-policy-independent-20260921/snapshot-probe.mjs). |
| [Independent mutations](../../evidence/config-resource-policy-independent-20260921/mutants.txt) | Three private-copy changes detected: producer memory default replaces authored value; pool equality is incorrectly rejected; task admission mistakenly uses memory bytes as its ceiling. Original behavior assertions fail, without modifying production files. |

The independent mutation harness builds on the author's isolated-copy/import
rewriting mechanism, with different mutations selected by this reviewer. Its
first diagnostic recognizer expected AssertionError only, while the equality
mutation correctly failed the originally successful pool-fit call with
`PRISM_NATIVE_POLICY_EXCEEDS_POOL`. That harness diagnostic failure is retained
as `mutants-initial-harness-diagnostic.txt`; it is not misreported as a passing
harness run. The final recognizer requires that exact semantic error for the
equality mutation and assertion failures for the other two. [Harness](../../evidence/config-resource-policy-independent-20260921/mutate.mjs).

The reviewer PostgreSQL replay extends the parent's earlier limited source set:
all repository `skills`, `contracts`, test fixtures, relevant reliability/deployment
tests, chart/config inputs and root package/lock/type configuration are retained.
**1,826 file hashes match before and after** the run, including the actual spawned
`tests/fixtures/prism-native-operation-writer.mts` and workspace package manifests.
The [source archive](../../evidence/config-resource-policy-independent-20260921/postgresql/tested-source.tar.gz),
[receipt](../../evidence/config-resource-policy-independent-20260921/postgresql/run.json)
and [harness](../../evidence/config-resource-policy-independent-20260921/run-postgresql.py)
are separate from the parent's earlier evidence, which remains untouched. The
installed third-party dependency tree and native package binaries are not a new
reproducible-build proof: the lockfile and existing downloaded-package identities
bind their declared inputs, while this run proves the actually executed local
SQL/journal behavior. It never connects to an existing database or installs
system-wide packages. Original root-owned supervisor policy checks remain unrun.

## Lint limitation and documentation

Canonical lint for the complete changed JS/TS file set exits **1**, with exactly
three errors: the existing 68-line concurrent-resource-attribution integration
callback exceeds 60 lines, and the two existing `.native.mts` cancellation/shutdown
filenames violate filename case policy. [Current raw output](../../evidence/config-resource-policy-independent-20260921/lint.txt).
The reviewer independently linted the **HEAD source text** of those same files
under the current canonical policy and reproduced all three:
[baseline evidence](../../evidence/config-resource-policy-independent-20260921/lint-baseline.json).
No rule, baseline, test or file exclusion was changed to obtain this conclusion.
These are explicit remaining quality work, so CP07 is not fully green. The new
production helpers and resource-policy tests introduce no additional lint errors.

Operator configuration, Prism guide and the foundation README accurately explain
values/units, safe-integer bounds, producer/startup snapshot ownership, two-role
rollout, rejected overrides, pool-fit failure and accepted-budget replay. Comparing
the JSON inventory with the retained preceding slice shows changes to **exactly
three entries**: CPU, memory and task environment sources. No other unresolved
entry was marked done. The implementation report labels the initial Helm-count
failure, mutant-harness problem, separate PostgreSQL evidence and lint limitation
honestly. Source identities and reviewed documentation are retained in the
[31-file review manifest](../../evidence/config-resource-policy-independent-20260921/source-identities.json).

No image build, live rollout, root-owned native supervisor, cgroup enforcement or
full task/host-budget reconciliation was executed or inferred from these tests.
A subsequent lint cleanup must retain these semantics and receive its own review;
this accepted functional review remains bound to its recorded source state.
