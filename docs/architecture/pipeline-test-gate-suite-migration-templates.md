# Test-Suite Migration Templates

Status: required templates for each suite migration

Use these templates with the
[migration playbook](pipeline-test-gate-suite-migration-playbook.md).
Do not remove a required section. Write `Not applicable` and give the reason
when a section does not apply.

## Baseline Template

Use a JSON baseline for each new migration. Use this structure:

```json
{
  "schemaVersion": "suite-baseline.v1",
  "legacySuite": "SUITE_ID",
  "successor": "PROVIDER_ID",
  "expectedItemCount": 1,
  "items": [
    {
      "id": "SUITE-AREA-001",
      "class": "old-behavior",
      "requirement": "State one observable behavior.",
      "state": "baseline-recorded"
    }
  ]
}
```

The workflow gate checks the suite, successor, item count, unique identifiers,
class, requirement, and state. The old unit Markdown baseline remains valid as
a historical exception.

Record these values in the baseline items and supporting audit:

- Old suite name.
- Production entry point.
- Project configuration.
- Operator configuration.
- Activation rules.
- Input discovery.
- Permissions.
- External services.
- Results and gate rules.
- Reports, logs, artifacts, and events.
- Timeout, retry, cancellation, and restart behavior.
- Callers and consumers.
- Known defects.
- Deletion targets.

Give each behavior or defect one stable identifier. Keep defects separate from
required behavior.

## Decision Record Template

Use this structure for a new decision:

```text
Decision ID:
Problem:
Selected design:
User effect:
Operator effect:
Security effect:
Rejected alternatives:
Reason for rejection:
Required proof:
Deletion effect:
```

Explain each technical term before you use it. State who owns each choice.

## Implementation Plan Template

### Status

State one value: `planned`, `in progress`, or `complete`.

### Objective

Describe the replacement in one short paragraph. State that the replacement is
not authoritative during this phase.

### Contracts

List the project fields, operator fields, defaults, limits, outputs, evidence,
and stable errors.

### Security Boundary

List allowed files, denied files, network access, environment access,
credentials, installed code, and external services.

### Real Proof

Name each real component in the contained path. For an unavailable facility,
state the reason, substitute, proved behavior, unproved behavior, and final
external test.

### Stop Conditions

Require focused tests, retained regressions, complete documents, a clean
review, a pushed commit, and remote equality.

## User Guide Template

Use these sections:

1. Purpose.
2. Scope exclusions.
3. Terms.
4. Smallest working declaration.
5. Complete field reference link.
6. Common project layouts.
7. Blocking and advisory behavior.
8. Inputs and outputs.
9. Evidence.
10. Retry, timeout, cancellation, and restart behavior.
11. How to disable or remove the test.
12. Local and continuous-integration verification.
13. Common errors and corrections.
14. Migration notes.

Every JSON example must parse. Every provider configuration must pass the real
schema.

## Operator Guide Template

Use these sections:

1. Responsibilities.
2. Terms.
3. Supported host requirements.
4. Installation.
5. Complete configuration example.
6. Field reference link.
7. Credentials and transport security.
8. File and network permissions.
9. Capacity and concurrency.
10. Preflight checks.
11. Start and stop procedure.
12. Verification and expected output.
13. Monitoring and evidence locations.
14. Troubleshooting.
15. Upgrade.
16. Rollback.
17. Final external production proof.
18. Operator checklist.

Do not use a placeholder command as an installation procedure. Label an
environment-specific example when the repository does not own that command.

## Configuration Reference Template

For each project and operator field, record:

```text
Field:
Owner:
Type:
Required:
Default:
Minimum:
Maximum:
Allowed values:
Meaning:
Security effect:
Failure behavior:
Example:
```

The schema documentation check compares this reference with the real project
schema and the declared operator-field inventory.

## Error Reference Template

For each stable error code, record:

```text
Code:
Cause:
Effect:
Correction:
Retry guidance:
Evidence location:
```

Do not combine different corrections under one unnamed group. The error
documentation check compares this reference with production source files.

## Security Model Template

Explain:

- Trusted components.
- Untrusted project input.
- Credential ownership.
- File containment.
- Network access.
- Installed provider identity.
- External-service identity.
- Input and output limits.
- Integrity verification.
- Cancellation and cleanup.
- Known unavailable facilities.
- Final external proof.

State each denied action directly. Do not describe a denied action as an
optional recommendation.

## Parity Ledger Template

Each item must contain:

```json
{
  "id": "SUITE-AREA-001",
  "disposition": "preserved",
  "oldBehavior": "",
  "replacementBehavior": "",
  "oldProof": "",
  "newProof": "",
  "evidence": "",
  "reason": ""
}
```

Use only `preserved`, `improved`, `removed-defect`, `deferred`, or `blocked`.
Cutover is forbidden while an item is blocked.

## Cutover Inventory Template

List:

- New authority.
- Old authority.
- Deleted runtime files.
- Deleted protocol and registry entries.
- Deleted configuration fields.
- Deleted parsers and adapters.
- Deleted examples and fixtures.
- Retained shared files and their remaining owners.
- Required absence tokens.
- Positive sole-path tests.
- Dual-authority rejection tests.

## Final Audit Template

Record:

1. Exact tested commit.
2. Authority before and after the phase.
3. Implemented changes.
4. Accepted decisions.
5. Real proof and unavailable facilities.
6. Parity totals.
7. Deleted surfaces.
8. Focused verification.
9. Full verification.
10. Review findings, fixes, and rejected findings.
11. Dependency audit.
12. Documentation verification.
13. Remote branch equality.
14. Remaining work.

Do not mark the audit complete before verification runs on the final commit.
