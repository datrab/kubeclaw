# Security suite Phase 10 cutover plan

## Goal

Make the provider plan the only Security Suite authority.

## Cutover steps

1. Add explicit security nodes to the production workspace.
2. Reject retired `test_suites: [security]` and `test_config.security` input during project setup.
3. Delete the legacy `security.ts` runtime and all legacy dispatch mappings.
4. Mark the bridge migrated only after implementation and parity gates pass.
5. Package the security providers, Trivy, and trusted capabilities in Buster.
6. Add a suite-specific production preflight and signed receipt.
7. Keep `productionAcceptance` pending until the real final-cycle command observes the same immutable image, namespace state, evidence import, and cleanup.
8. Verify that the production workspace has all five provider node identities,
   has no retired security fields, and derives the Kubernetes fixture image
   only from the typed container-build output.
9. Add the blocking dependency provider to every scaffolded Buster scope, and
   reject a production scope that omits this sole dependency-scan authority.

## Rollback rule

Rollback is a source revert. The old and new authorities must never run together. Do not restore the legacy suite as a fallback.

## Exit gate

The cutover inventory, migration status, real workspace, runtime role, deployment command, documentation manifest, and absence checks must agree. Terra/high autoreview must be clean before commit.
