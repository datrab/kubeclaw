# Pipeline Test Gate Phase 10 Final Audit

Status: source complete; deployed production acceptance pending image rollout

Suite: unit

## Result

Unit is the first legacy suite to complete the full migration loop.

The provider-based unit path is now the only unit gate path. A project declares
unit-test nodes in `.swarm/pipeline.json`. Nova creates the plan and owns the
gate decision. Buster runs the plan and returns facts and evidence.

The legacy unit runner, console parser, protocol value, registry entry,
execution-order entry, dependency entry, old configuration, and project
scaffolding are removed. A legacy unit request is now an error. There is no
fallback to the deleted path.

All 93 unit parity items remain proved:

- 23 valid behaviors are preserved;
- 56 behaviors use a safer or clearer implementation; and
- 14 accepted defects cannot return.

One of thirteen legacy suites is fully migrated. Twelve legacy suites remain.

## Sequential phase result

### 10-A — Cutover inventory

Added a machine-readable inventory. It lists deleted files, shared files that
must be clean, required replacement files, current guides, and forbidden old
tokens. The Phase 10 verifier checks this inventory.

### 10-B — Replacement authority

The unit suite template, direct-command provider, JUnit adapter, and optional
coverage-budget provider form the supported unit path. Normal blocking and
advisory policy applies. Nova remains the only gate authority.

### 10-C — One authority

The bridge marks unit as migrated to `kubeclaw.direct-command@1`. The legacy
protocol rejects unit. The replacement-only vertical proof checks that no
legacy result exists.

### 10-D — Current configuration

Project setup no longer discovers or writes legacy unit configuration. It
rejects a legacy unit request when the provider plan has no replacement node.
It preserves an explicit `kubeclaw.direct-command@1` node. Real workspace
fixtures write explicit unit nodes to `.swarm/pipeline.json`.

### 10-E — Legacy runtime cleanup

Unit is absent from the legacy suite type, registry, order, and dependency
graph. Tests for the temporary legacy runtime now use a suite that has not yet
migrated. This keeps proof for the bridge without keeping unit alive.

### 10-F — Old code deletion

Deleted `unit.ts` and `unit-output.ts`. This removed hidden npm discovery,
string command parsing, console regular expressions, old thresholds, and old
finding conversion.

The package sweep found the old command-string tokenizer was now unused. It
was part of the deleted unit path, so it was removed too.

Phase 9 comparison no longer imports deleted code. It uses immutable legacy
facts accepted during the parity phase.

### 10-G — Negative deletion proof

The cutover test proves that deleted files are absent, required replacement
files exist, all parity items are proved, the bridge marks unit migrated, the
legacy protocol rejects unit, and project setup cannot restore the old fields.

### 10-H — Real contained proof

The proof uses a real committed Git repository and a real
`.swarm/pipeline.json` file. It runs this path:

```text
Nova plan
→ committed source archive
→ authenticated HTTP
→ Buster storage
→ worker
→ isolated direct-command provider
→ real Node test process
→ real JUnit report
→ evidence import
→ Nova gate decision
```

The proof includes one blocking pass and one advisory failure. The final gate
passes, the advisory failure stays visible, and no legacy unit work runs.
Retained Phase 7, Phase 8, and Phase 9 tests cover failure, malformed reports,
zero tests, retry, timeout, cancellation, restart, duplicate delivery,
coverage, evidence, and stable identity.

### 10-I — Documentation

Updated the implementation plan, user guide, operator guide, reusable migration
playbook, architecture index, parity ledger, bridge ledger, real workspace
fixtures, and generated inventories.

The reusable workflow now requires a machine cutover inventory. It also
requires migrations to remove old fault fixtures and configuration generators.
If deleted code supplied old comparison data, an accepted immutable comparison
record replaces that dependency.

### 10-J — Closeout

Focused and full checks passed. The final Terra review used high reasoning.
All accepted findings were fixed and the final review was clean.

## Authority and rollback decision

There is no code rollback from the new unit path to the old path. Restoring the
old runner would restore two authorities and known defects.

If a project declaration is wrong, correct `.swarm/pipeline.json`. If a
provider defect is found, stop unit execution, fix the provider, and rerun the
same immutable plan or create a new plan as the contract requires.

## Production integration

Normal Buster stages execute the resolved provider plan before they make a
decision. They do not infer commands from legacy configuration.

Nova uses the `test.plan.execute` adapter. The adapter sends the committed
source snapshot and immutable plan to Buster, imports the result, and returns
the Nova decision. The production pipeline loads the selected scope from
`.swarm/pipeline.json`.

The Buster deployment allows `command.execute` without mounting a host cgroup.
It uses the command runner's explicit unprivileged sampled process-tree limit
fallback.

## Contained environment boundary

All migration acceptance runs in the Nova pod with real source, processes,
HTTP, providers, reports, evidence, and policy. The pod has a read-only cgroup
mount. The tracked test harness therefore uses sampled accounting for that one
unavailable host feature.

Production configuration enables this fallback because the Kubernetes pod does
not receive cgroup administration authority. Landlock, seccomp, rlimits, and
process-tree termination remain enforced.

After deployment, run `./scripts/deploy.sh nova-unit-preflight`. This command
proves the real Nova-to-Buster route without sampled accounting.

## Verification

The closeout ran:

- focused Phase 10 cutover and replacement-only vertical proof;
- all 93 unit parity checks;
- retained Phase 7, Phase 8, and Phase 9 checks;
- the complete repository contract suite;
- all plugin package and live-capability checks;
- all executable-registration containment checks;
- TypeScript and project-scaffold checks;
- real E2E workspace fixture checks;
- generated inventory and documentation checks;
- Git whitespace checks; and
- the production dependency audit.

The updated closeout also checks:

- project migration rejection and explicit replacement preservation;
- normal production pipeline provider-plan loading;
- the authenticated `test.plan.execute` route;
- capability grants for repository roots;
- Nova and Buster runtime-role packaging;
- the absence of a host cgroup mount or `SYS_ADMIN`; and
- the deployed production preflight source.

No mock service, fake command result, or compatibility wrapper supplies unit
acceptance evidence. Contained and deployed execution use the same unprivileged
sampled process-tree accounting without requiring host cgroup administration.

## Final state

Unit is fully migrated. Its current configuration, execution, result,
evidence, and authority paths are explicit. The old executable path is absent.
The next suite must use the same implementation, parity, cutover, and deletion
workflow.

The repository cutover is complete. Production acceptance remains pending
until the current images are deployed and `nova-unit-preflight` passes.
