# Pipeline Test Gate Phase 10 Plan

Status: complete

Suite: unit tests

Purpose: make the provider-based unit path authoritative and remove every
executable legacy unit surface.

## Plain-language outcome

Before this phase, the old unit runner controls real gates and the replacement
has only shadow proof. After this phase, a project declares unit tests in
`.swarm/pipeline.json`, Nova resolves that declaration, Buster runs the
`direct-command` provider, structured reports are imported, and Nova makes the
only gate decision. The old npm discovery, command-string execution, and
console-output parser no longer exist.

This cutover does not migrate any other legacy suite. Build, health, API, and
the remaining legacy suites continue to use the bridge until their own
implementation, parity, and cutover phases finish.

## Non-negotiable rules

- All 93 unit parity items must remain proved.
- The replacement and legacy unit paths must never both control a gate.
- There is no fallback from the replacement to the deleted runner.
- Missing replacement configuration is a configuration error, not a request
  for hidden npm discovery.
- Phase 10 acceptance uses real contained execution in the Nova pod.
- External single-path production-platform proof remains deferred until all
  suites are migrated.
- Deletion is machine checked. A stale import, protocol value, registry entry,
  execution-order entry, old configuration field, or old documentation example
  blocks completion.

## 10-A — Lock the cutover inventory

Create `pipeline-test-gate-unit-cutover-inventory.json`. It lists every legacy
surface to delete and every replacement surface that must remain. A verifier
rejects missing paths, unexpected retained paths, stale protocol membership,
and an incomplete parity ledger.

## 10-B — Activate the replacement

The existing `kubeclaw.unit-suite@1` template, `kubeclaw.direct-command@1`
provider, JUnit adapter, and optional coverage provider become the sole unit
composition. Unit declarations come from `.swarm/pipeline.json`. The final
remote result follows Nova's normal stage-result path and blocking/advisory
policy.

## 10-C — Enforce one authority

Mark unit as migrated in the bridge ledger. Remove it from the runtime's
unmigrated-suite list. Reject any request that tries to select legacy unit,
including requests that contain no replacement node. Do not silently choose a
path and do not invoke a fallback.

## 10-D — Move configuration and examples

Replace legacy examples such as:

```json
{
  "test_suites": ["unit"],
  "test_config": { "unit": { "test_cmd": "npm test" } }
}
```

with explicit `.swarm/pipeline.json` declarations. Examples cover JUnit,
exit-code mode, several unit instances, blocking/advisory policy, and optional
coverage. Project scaffolding must stop generating legacy unit fields.

## 10-E — Remove unit from the legacy runtime

Remove unit from the legacy protocol, suite registry, execution order,
dependency graph, capability dispatch, and legacy live fixtures. Other legacy
suites remain unchanged.

## 10-F — Delete the old unit implementation

Delete `unit.ts` and `unit-output.ts`, including npm discovery, shell-like
command tokenization, framework-specific console parsing, threshold behavior,
and old findings conversion. Remove tests and documentation that teach these
surfaces.

## 10-G — Prove deletion

Add negative checks for every inventory entry. Prove that legacy unit requests,
old configuration, imports, and dual authority are rejected, and prove that an
unmigrated non-unit suite still works.

## 10-H — Run the sole-path contained proof

Use a committed fixture and the complete real path:

```text
.swarm/pipeline.json
→ Nova plan
→ signed committed snapshot
→ authenticated HTTP
→ Buster
→ worker
→ direct-command provider
→ real Node test process
→ real JUnit file
→ evidence import
→ Nova decision
```

Prove blocking pass/fail, advisory failure, malformed and zero-test reports,
retry instability, timeout, cancellation, coverage independence, restart and
duplicate safety, and the absence of legacy execution.

## 10-I — Documentation closeout

Update the user guide, operator guide, reusable migration playbook,
implementation plan, parity ledger, bridge ledger, architecture inventory, and
generated references. Documentation must explain the only supported unit path,
common errors, and exact corrections.

## 10-J — Final audit and promotion

Run focused Phase 10 proof, all 93 parity checks, retained Phase 7–9
regressions, full contracts, plugin live and containment tests, TypeScript,
documentation, dependency, security, and Git checks. Run Terra/high review,
verify every finding, fix accepted findings, and repeat until clean. Commit and
push the branch. Promote it to `main` only without disturbing unrelated work.

## Completion statement

Phase 10 is complete only when the replacement is authoritative, all 93 parity
items remain proved, all machine-listed legacy unit surfaces are absent, other
legacy suites still work, the sole-path contained proof passes, documentation
describes only current behavior, and the final review is clean.

Completion evidence is recorded in
`pipeline-test-gate-phase-10-final-audit.md`. Unit is the first legacy suite to
complete implementation, parity, cutover, and deletion. Twelve legacy suites
remain.
