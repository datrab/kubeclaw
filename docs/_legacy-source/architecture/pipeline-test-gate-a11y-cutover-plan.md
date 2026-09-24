# Accessibility suite Phase 10 cutover plan

Status: implemented source design  
Audience: operators and migration reviewers  
Owner: Pipeline architecture  
Evidence: `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json`  
Applicable version: Suite 9  
Verification revision: pending Suite 9 commit

## Goal

Phase 10 makes `kubeclaw.axe@1` the only accessibility authority. It removes the old Buster suite function and bridge route.

## Cutover sequence

1. Add the provider and capability to the production Buster runtime.
2. Add the accessibility suite template.
3. Convert old project declarations into provider nodes.
4. Reject retired numeric thresholds with a stable error.
5. Remove the legacy suite file and runner registration.
6. Mark the legacy bridge entry as migrated.
7. Verify that production code does not request legacy `a11y`.
8. Keep production acceptance pending until all suite sources close.

## Rollback rule

Do not restore dual authority. Revert the complete Suite 9 commit if source rollback is necessary.

## Exit criteria

The cutover gate requires replacement files, legacy absence, project conversion, runtime packaging, and an honest pending production state.
