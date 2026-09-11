# Independent Delivery continuation review

Reviewed remote commit `d22ee1d298aa63050673e075b363ae4c996008dc`, exact tree
`d90200377036cd73d1048e1d206e66cc9e8fed40` (local `bc777cd`). Compared with
remote `4e7a12c2f24a841519373ff9c18110642d130521` (local `f8feec3`).
Reviewer used a separate detached worktree, original production dependencies,
and relative workspace package links. No reviewed production/test source was
modified during verification. This review did not author the reviewed changes.

## Finding: P2 — moved tests lost their existing TypeScript verification

At `contracts/prism/v1/package.json:10`, the runtime test command follows the
moved remediation and baseline tests, but `typecheck` at line 12 still uses
`contracts/prism/v1/tsconfig.json:13-16`, whose test include is `tests/**/*.mts`.
The moved files and their integration fixtures are no longer in that project.
Likewise `skills/buster/plugins/http/package.json:7` follows its moved runtime
test, while `skills/buster/plugins/http/tsconfig.json:3` still checks only the
old test directory. The same mismatch exists in
`skills/buster/plugins/demo-auth-smoke/package.json:1` and `tsconfig.json:1`.
No replacement integration-owned TypeScript verification entrypoint exists in
the reviewed tree. Node's runtime TypeScript stripping does not restore static
checking. This weakens an existing gate even though runtime assertions remain.

Reproduced with the unchanged TypeScript compiler's `--listFilesOnly -p` for
each of those three projects, first in the exact parent candidate worktree and
then in the reviewed worktree. All commands exited 0. Parent membership is true
for both Prism suites and the demo-auth/HTTP tests; reviewed membership is false
for all four. Exact results: `typecheck-membership.json`.

Restore explicit static verification owned by the integration layer, and wire
it into canonical verification without importing cross-role tests back into
shared production packages. Preserve the previous compiler strictness. The move
should not be accepted as fully verified until that omission is repaired.

## Source and test review

No additional blocking issue found in the bounded Delivery production diff.
The contract extraction preserves first-observation portable serialization,
closed keys, owner/media checks, byte budgets, evidence order/multiplicity,
review pairing, and historical v2 outer-reference behavior. The common owner
helper applies the same predicates as the replaced inline check.

Summary's extracted reader keeps one cumulative byte counter per build, exact
artifact selection and digest/size verification. Review-governor and coverage
extractions retain their original predicates and serialization mode. No public
mode/default or Worker Core/role-engine boundary changes were introduced by
these refactors.

All eleven moved files preserve assertion bodies: changes are import/resource
paths and renamed fixture references. Repository executable references to old
paths were searched; none remained outside historical documentation. Package
runtime callers and nested Remote Gate/Demo Handoff callers resolve the new
locations. Their typecheck omission above is distinct from runtime relocation.

The added import test changes genuine completed records via the original CAS
transition API and reopens storage in a fresh consumer process. It asserts exact
failure messages and two completed original artifact reads before import
rejection, then restores the original record and proves success. Gate-reference
cases prove initial success, exact rejection after one real manifest read, and
unchanged import bytes. Cancellation cases preserve actual requested journals,
abort at the original durable-acceptance callback, and assert failed receipts,
unchanged artifact files and no subsequent gate read. The audit callback is
boundary instrumentation; no adapter/journal implementation is replaced.

Scenario-label booleans in the helper are derived classifications, not separate
runtime instrumentation. The review relies on the actual journal/receipt/error
assertions, not those booleans. Individual receipt mutations can fail at earlier
binding/digest checks; these cases demonstrate consumer rejection, not independent
coverage of every internal validator branch.

## Executed verification

From the reviewed worktree:

```sh
node --test contracts/delivery-manifest/v3/tests/contract.test.mts tests/verification/reliability/delivery-manifest-v3-compiler.test.mjs tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs tests/verification/reliability/delivery-manifest-v3-durability.test.mjs tests/verification/reliability/delivery-manifest-v3-cancellation.test.mjs tests/verification/reliability/delivery-manifest-import-boundary.test.mjs tests/verification/reliability/delivery-manifest-gate-reference.test.mjs
```

Passed **13 groups, 0 failed, 0 skipped**, including the original contract and
compiler matrix, locale/body/ref boundaries, twelve real SIGKILL histories,
four cancellation scenarios, and 34 new negative consumer cases. Raw output:
`delivery.txt`; process exit 0.

Also passed: configured ESLint for all three affected production files and
three new/previous cancellation consumer tests; original contract and Summary
TypeScript checks; unchanged package-ownership gate; full Summary, pipeline-gate,
telemetry-store, HTTP, demo-auth, remote-test-gate and demo-handoff npm test
commands. Exact argv and exit codes are retained in `commands.json`,
`static-commands.json`, and `go-commands.json`, with individual raw logs.
Go packages used the existing Go 1.24.13 executable through PATH prefix
`/workspace/scratch/4e25cf57c177/toolchains/go/bin`.

Two initial reviewer setup mistakes are retained, not counted as success:
default ESLint could not locate the centrally stored config (`lint.txt`);
demo-auth initially lacked Go on PATH (`demo-auth-package.txt`). Corrected
commands used the original configured ESLint and existing Go executable; no
source/assertion or security/environment restriction was altered.

## Limits and disposition

This independently reviews only the listed Delivery changes, cancellation and
consumer tests, and integration-test moves. Prism engine refactoring is outside
this review. Native direct-command sandbox, browser/PostgreSQL/cluster/CI and
actual provider/model execution were not run. Genuine semantic producer and
full historical migration acceptance remain open. The previously flagged
semantic helper was not invoked, rephrased or routed elsewhere.

This evidence cannot close PCR-SDK-001 or any broader finding by itself and does
not authorize integrating the coupled semantic/Delivery candidate. Finding counts
remain unchanged. One concrete verification regression requires follow-up.

## Independent follow-up: P2 corrected and verified

The author supplied correction commit `6f300ece9b9e71daa485100d06f7ce666baaae12`,
exact tree `a2f94dd74c3e9f225fe1e9d6fed98c8109547fe8`. This was checked in a
second detached worktree. The correction adds three integration-owned tsconfigs,
retains the original Prism typecheck and HTTP/demo-auth build checks, and appends
the appropriate integration checks. Root `typecheck:integration` checks all
three; `verify:contracts` calls it first. No existing gate/assertion was removed.

All three effective compiler-option maps from `tsc --showConfig` exactly match
their pre-move originals (`compiler-options.json`). `tsc --listFilesOnly`
confirms coverage of both Prism tests, both Prism fixtures, HTTP and demo-auth.

For each of those **six files**, this independent reviewer temporarily appended
`const INDEPENDENT_TYPECHECK_SENTINEL: string = 840039;` in the isolated correction
worktree. The original package entrypoint failed with the expected TS2322 and
identified that file. With one mutation in each project, root
`npm run typecheck:integration` also failed with TS2322 (**three root negatives**).
The tests' runtime assertions and production source were never altered.

Every file was restored byte-for-byte in a `finally` block. Original package
entrypoints passed again; root integration typecheck and unchanged ownership
gate passed. Final `git status --porcelain` was empty. Exact commands, all
positive/negative logs, membership, restored hashes and the verification script
are under `docs/review/evidence/resume-84-delivery-review/typecheck-fix/`.
The full `verify:contracts` pipeline was not run; its wiring was inspected and
its integration subcommand exercised directly.

The P2 regression above is resolved by this exact correction. No further issue
found within this review's bounded scope. This conclusion does not close a
broader finding or remove the previously documented native/semantic acceptance
requirements.
