# Test-Suite Migration Playbook

Status: accepted migration workflow, version 2

Audience: maintainers, reviewers, operators, and future suite owners
Applies to: unit, lint, build, size, deployment, readiness, exposure, API,
accessibility, Lighthouse, visual, end-to-end, security, load, and later suites

## Purpose

This playbook defines one repeatable way to replace an old test suite with the
provider-based test system. It prevents a migration from losing behavior,
creating two gate authorities, or leaving old code behind.

The short rule is:

```text
audit → design → implement → prove → compare → cut over → delete → review
```

Every suite uses the same workflow. A suite can add specialist details, but it
cannot skip a step.

Use the required
[migration templates](pipeline-test-gate-suite-migration-templates.md). The
[generated status page](pipeline-test-gate-suite-migration-status.md) is the
only human-readable source for migration counts.

## Hard phase gates

Each formal phase has an entry gate and an exit gate. Do not continue when a
gate fails.

The implementation entry gate requires:

- a clean worktree from the current `main` commit;
- locked dependencies;
- required tool preflight checks;
- a recorded list of unavailable external facilities;
- a green retained baseline; and
- package ownership and import-boundary checks.

Each phase exit gate requires:

- focused real tests;
- all retained regression tests;
- current user and operator documents;
- schema, error, example, status, and language checks;
- a clean Terra review;
- one phase commit on the remote branch; and
- proof that the local and remote commits match.

Cutover has one additional entry rule. The parity ledger must have no blocked
or unproved item.

## Terms in plain language

- **Suite**: a reusable group of test definitions. For example, the provided
  unit suite can contain several unit-test instances.
- **Test instance**: one configured test. For example, `frontend-unit` and
  `backend-unit` are separate instances.
- **Provider**: the installed, versioned code that performs one kind of test.
- **Report adapter**: code that reads a standard report file and converts it to
  common result facts. JUnit is the first example.
- **Fixture**: declared setup that another test needs, such as a deployed
  service or temporary database.
- **Blocking**: failure can fail the pipeline gate.
- **Advisory**: failure remains visible but cannot fail the pipeline gate.
- **Parity item**: one stable, named behavior from the old suite that must be
  preserved, improved, or deliberately removed as a defect.
- **Cutover**: the one change that gives the new path authority and removes
  authority from the old path.

## Fixed ownership rules

These rules apply to every migration:

1. Nova owns the pipeline graph and final gate decision.
2. Buster executes tests and returns facts. It does not approve a pipeline.
3. One test result has only one authoritative execution path.
4. A provider cannot install itself, expand its permissions, or fetch unknown
   test code during a run.
5. Project test content comes from the committed project snapshot. Reusable
   test code comes from installed, versioned provider packages.
6. Original reports and selected logs remain evidence. Normalized summaries do
   not replace the source evidence.
7. Structured reports are authoritative when declared. Console text is never
   parsed as structured test evidence.
8. Independent tests continue after another independent test fails.
9. Cancellation, timeout, failure, error, and skip remain different states.
10. The old implementation is deleted after proved cutover.

## Required migration records

Each suite migration must maintain these records:

1. **Baseline** — every old input, output, behavior, permission, dependency,
   error, artifact, event, and known defect.
2. **Decision map** — every accepted architecture decision that applies.
3. **Implementation plan** — ordered subphases, code targets, proof targets,
   and stop conditions.
4. **Parity ledger** — one disposition and proof for every baseline item.
5. **Cutover and deletion list** — every old runtime, config, example, test,
   document, registry entry, and compatibility path to remove.
6. **Final audit** — verification results, review findings, accepted fixes,
   scope boundary, and remaining work.

These records are versioned with the code. A chat message is not a migration
record.

## Documentation quality gate

Documentation is part of the product. A migration cannot close if a capable
reader must inspect source code or ask a maintainer to understand normal use.

Before implementation, the documents must explain:

- what the suite does and does not do;
- who owns each decision and lifecycle step;
- every project-facing field in plain language;
- defaults, valid limits, and override rules;
- a smallest working example;
- examples for common tools or project layouts;
- blocking and advisory examples;
- dependencies, typed artifact links, retries, and parallel work where used;
- success, failure, timeout, cancellation, missing-input, and invalid-report
  behavior;
- evidence retention and where results appear;
- security boundaries, including denied paths, environment values, network
  access, and runtime content fetching;
- comparison with the main rejected alternatives and the reason for the chosen
  design;
- migration, cutover, rollback, and deletion behavior; and
- operator troubleshooting for every stable error code introduced by the
  migration.

Every example must use the real schema and must be covered by a parser,
contract, or integration test. Pseudocode must be labelled as pseudocode.

Each project field must have a type, required state, default, limits, meaning,
failure behavior, and example. Each operator field must have the same record.

Each stable error code must have a cause, effect, correction, retry rule, and
evidence location. Machine checks compare the guides with schemas and source
error codes.

Use controlled English in user and operator procedures:

- Define a technical term before its first use.
- Define an abbreviation before its first use.
- Use one action in each instruction.
- Use active voice when the actor is important.
- Use one term for one concept.
- Put a warning before the affected action.
- Do not use vague words as requirements.
- Keep a sentence to 40 words or fewer.

These rules are ASD-STE100-inspired. They do not claim formal ASD-STE100
conformance. A human review must still verify the technical meaning.

A closeout reviewer must answer all of these questions from the documents:

1. How do I enable one test?
2. How do I configure two independent tests?
3. What makes a test block the gate?
4. What files are authoritative evidence?
5. What happens when the command, fixture, or report fails?
6. What can the provider access?
7. How do retries, cancellation, and restart affect the result?
8. How do I remove or disable the test?
9. Which old behavior was preserved, improved, or deleted?
10. How do I verify the migration locally and in CI?
11. Which parts are proved inside the contained Nova pod?
12. Which unavailable external facilities remain for the final single-path
    production proof?

If an answer is missing or ambiguous, documentation is incomplete.

## Sequential workflow

### Step 1 — Isolate the work

Create a dedicated branch and worktree from the newest `main`. Confirm that
local unrelated files are not present in the migration worktree.

Record:

- source commit;
- branch and worktree;
- current remote relationship; and
- pre-existing failures, if any.

Install dependencies from the lockfile. Run tool preflight and package-boundary
checks before product changes. This early check prevents a late ownership
failure during the full regression run.

### Step 2 — Audit the old suite

Read the complete production path, not only the main suite function. Include:

- project and operator configuration;
- activation and allowlists;
- discovery and defaults;
- process or service execution;
- permissions and isolation;
- result calculation;
- reports, logs, artifacts, receipts, and events;
- retries, timeouts, cancellation, and restart behavior;
- dependencies on other suites or fixtures;
- callers and downstream consumers;
- real examples and pipeline fixtures; and
- deletion targets.

Run the old tests and capture representative real outputs. Mark old defects
separately. A defect is not a parity requirement.

### Step 3 — Create stable parity items

Give every required behavior a stable identifier. For example:

```text
UNIT-EXEC-001: execution never invokes a shell
UNIT-RES-001: zero executed tests cannot pass
```

Each item later receives one disposition:

- `preserved` — the replacement keeps the behavior;
- `improved` — the replacement provides a safer or clearer equivalent;
- `removed-defect` — an accepted design removes faulty old behavior;
- `deferred` — an accepted decision explicitly moves it to a later phase; or
- `blocked` — proof cannot complete and the migration cannot cut over.

### Step 4 — Map architecture decisions

List the decisions that govern the suite. Confirm that the proposed design does
not create a new authority, store, scheduler, report format, or permission model
when an accepted shared system already exists.

If the migration needs a new durable rule, record a decision before code is
written. Do not hide architecture decisions inside implementation details.

### Step 5 — Design the smallest complete replacement

Reuse shared components in this order:

1. existing provider contract;
2. existing suite resolver and configuration layering;
3. existing Nova graph nodes and typed links;
4. existing Buster runner, retries, concurrency, and cancellation;
5. existing report adapters;
6. existing evidence and receipt stores; and
7. existing remote execution and restart recovery.

Add a new shared abstraction only when two real consumers need it or when one
accepted decision cannot be met without it.

The replacement must be complete enough for one real vertical run. It must not
build speculative features for later suites.

### Step 6 — Write user and operator documentation first

Write the configuration reference, examples, result rules, security boundary,
troubleshooting, and cutover procedure before implementation. This exposes
unclear contracts while changes are still cheap.

Use the documentation quality gate in this playbook. Add examples to the proof
matrix so implementation tests the same values shown to users.

### Step 7 — Implement in reviewable subphases

Each subphase must have:

- a bounded objective;
- explicit code and proof targets;
- focused real tests;
- a decision audit;
- updated documents; and
- a review before the next subphase.

Do not mix cutover or deletion into the first implementation slice.

### Step 8 — Prove the vertical path

At least one test must cross the real path:

```text
project declaration
→ Nova resolution and stored graph
→ authenticated remote dispatch
→ Buster recovery and scheduling
→ worker and isolated provider
→ real tool or service
→ original evidence and normalized result
→ Nova import and gate decision
```

Mocks can test narrow errors. They cannot be the only proof of the production
boundary.

During the migration program, this vertical proof runs inside the contained
Nova pod. Use real source, processes, HTTP, providers, reports, evidence, and
gate policy. A facility that cannot exist in that pod, such as writable host
cgroup delegation, BuildKit, or a deployment target, must be named explicitly.
Use the closest real contained proof and defer only that unavailable facility.
Do not weaken production contracts or invent a mock success.

The final external production-platform proof occurs only after all suites have
migrated and one authority path remains. At that point, repeat the vertical
proof without local fallbacks and prove the selected service manager, kernel
controls, external facilities, recovery, and rollback.

Run all production-required suite proofs with one command:

```bash
./scripts/deploy.sh nova-production-preflights \
  registry.example.invalid/kubeclaw/preflight@sha256:DIGEST
```

Use a real 64-character SHA-256 digest. The image must listen on port `8080`.
The command stops on the first failed proof. It refuses to start until all 13
source cutovers are complete. It also fails when a production-required suite
does not have an orchestration entry. It uses only the dedicated
`kubeclaw-fixture-preflight` Secret for the Secret-copy proof.

For each unavailable facility, record five facts:

1. Why the real facility is unavailable.
2. Which substitute is used.
3. Which behavior the substitute proves.
4. Which behavior it does not prove.
5. Which final external test remains required.

Do not report an emulator or wrapper as full production proof. Use it only for
the unavailable boundary. Keep all other components real.

### Step 9 — Prove parity

Map every parity item to a real test, contract test, or documented approved
improvement. Test at least:

- valid and invalid configuration;
- normal success and failure;
- zero-work behavior;
- missing and malformed evidence;
- timeout and cancellation;
- retries and unstable success;
- restart and duplicate delivery;
- concurrency and dependency behavior;
- permission denial and path containment;
- size and count limits; and
- observability and evidence completeness.

The parity ledger must have no unexplained item.

### Step 10 — Compare without dual authority

The old and new paths may run together only in a controlled comparison. The
comparison must name which path is authoritative. The non-authoritative path
cannot alter the gate, remediation, or final pipeline state.

Use the comparison to explain intentional result differences. Do not tune the
new path to reproduce an old defect.

### Step 11 — Cut over once

In one controlled change:

1. activate the new registration and suite template;
2. mark the legacy bridge entry as migrated;
3. prevent the old and new paths from both controlling the gate;
4. update project examples and real pipeline fixtures; and
5. run positive and dual-authority rejection tests.

The cutover must fail closed if authority is ambiguous.

### Step 12 — Delete the old path

Remove every item in the deletion list:

- runtime code;
- registry and protocol names;
- configuration fields and defaults;
- console parsers;
- old examples and fixtures;
- compatibility adapters;
- obsolete tests; and
- stale documentation.

Add negative tests that search for or exercise every deleted surface. A comment
that says code is deprecated is not deletion.

Keep a machine-readable cutover inventory. It must list the files to delete,
shared registries to clean, replacement files to retain, current guides, and
old tokens that must disappear. Also move fault-injection fixtures away from
the deleted suite. A test fixture must not keep an old suite alive.

When deletion removes code that the parity comparison imported, replace that
dependency with immutable recorded legacy facts. The facts must be produced
and accepted during parity proof. Do not retain executable legacy code only to
run a comparison after cutover.

Search project scaffolding, example generators, real-run workspaces, failure
fixtures, and documentation. The old configuration must not be recreated by a
less obvious generator.

### Step 13 — Close and publish

Run:

- focused suite verification;
- decision and parity traceability;
- the full retained contract suite;
- all affected package and live capability tests;
- TypeScript and documentation checks;
- Git whitespace checks;
- production dependency audit; and
- the required Terra/high review.

Accept and fix valid findings. Document rejected findings with concrete proof.
Then commit, push, and verify that the intended remote branch contains the exact
commit.

If a rebase changes the commit, rerun the focused proof and documentation
checks. Run the final review against the exact promoted diff. Record the tested
commit in the final audit.

## Phase boundaries

For each suite, use three formal phases:

1. **Implement** — build the new path without giving it production authority.
2. **Prove parity** — close every baseline item and run a real gate proof.
3. **Cut over and delete** — switch authority once and remove the old path.

For unit tests these are Phases 8, 9, and 10.

## Reusable three-phase plan templates

Use these templates for every old suite. A suite plan contains only the facts
that are special to that suite. It must not invent a different migration
method.

### Template A — Implement the replacement

1. Lock the project and operator contracts.
2. Build the smallest provider, fixture, adapter, or composition that satisfies
   the accepted decisions.
3. Reuse the shared graph, runner, retry, concurrency, evidence, remote, and
   recovery systems.
4. Write complete user and operator guides with tested examples.
5. Run a real contained Nova-pod vertical proof.
6. Keep the replacement non-authoritative.

Exit only when the replacement is complete enough to prove, all applicable
decisions are implemented, focused and regression tests pass, and review is
clean.

### Template B — Prove equal-or-better parity

1. Convert the baseline into one machine-checked parity ledger.
2. Give every baseline ID exactly one disposition and at least one proof.
3. Prove valid old behavior with contracts, providers, and real contained runs.
4. Prove each accepted improvement and add negative tests for removed defects.
5. Run old and new paths together only in a controlled comparison in which the
   old path remains authoritative and the replacement is shadow-only.
6. Explain every result difference in a comparison record.
7. Repeat the real Nova-pod vertical proof and close with full regression and
   review.

Exit only when the ledger is complete, no behavior loss is unexplained, every
old defect remains absent, and the shadow path cannot affect the real gate.

### Template C — Cut over and delete

1. Refuse to start unless the parity ledger is completely proved.
2. Switch authority once and reject ambiguous dual authority.
3. Update real project declarations, examples, and fixtures.
4. Delete every old runtime, parser, configuration field, registration,
   protocol name, test, example, compatibility path, and stale document named
   by the deletion ledger.
5. Add negative tests that prove deleted surfaces cannot return.
6. Run the real contained vertical proof through the sole remaining path.
7. Run full regression and review, then publish the exact commit.

Exit only when one authority remains and source searches plus executable tests
prove the old path is gone.

If a requirement needs deployed infrastructure, record source cutover and
production cutover separately. Use `sourceCutover: complete` only after the old
source authority is gone. Keep `productionAcceptance: pending`, parity `in-progress`,
and cutover `in-progress` until the normal deployed route stores a successful
receipt. A test file or a direct capability check is not a production receipt.
The receipt must have an Ed25519 signature from the production operator
authority after the operator observes final resource deletion. The closeout
check must use the trusted public key installed at
`/etc/kubeclaw/production-receipt-authority.pub` outside the repository. It
must bind the receipt to the deployed Nova source revision and Buster image
revision. A key inside the repository, a caller-selected verification key, or
a fingerprint that a contributor adds in the same patch is not a trust anchor.

## Reusable closeout checklist

- [ ] Baseline covers the complete old production path.
- [ ] Known defects are separate from required behavior.
- [ ] Applicable architecture decisions are mapped.
- [ ] Project and operator docs meet the documentation quality gate.
- [ ] Examples are real, valid, and tested.
- [ ] The new path reuses shared runtime systems.
- [ ] Real vertical proof crosses Nova and Buster.
- [ ] A deployed-infrastructure requirement has an executed receipt, not only a planned gate.
- [ ] A trusted external key verifies the production receipt and deployed Nova and Buster revisions.
- [ ] Every parity item has a disposition and proof.
- [ ] Comparison has only one authority.
- [ ] Cutover rejects dual authority.
- [ ] Every deletion target is removed and negatively tested.
- [ ] Focused and full verification pass.
- [ ] Terra/high review has no unresolved actionable finding.
- [ ] Documentation states the exact scope boundary and remaining work.
- [ ] Commit is pushed and remote equality is verified.
- [ ] Phase status is generated from the machine status record.
- [ ] Schema fields and stable errors are documented.
- [ ] Controlled-language checks pass.
- [ ] Unavailable facilities have explicit proof limits.

## Current migration state

Do not maintain migration counts in this playbook. Read the
[generated migration status](pipeline-test-gate-suite-migration-status.md).
