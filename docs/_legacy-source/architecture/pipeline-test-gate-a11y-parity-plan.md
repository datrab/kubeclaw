# Accessibility suite Phase 9 parity plan

Status: implemented source design  
Audience: migration reviewers  
Owner: Pipeline architecture  
Evidence: `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json`  
Applicable version: Suite 9  
Verification revision: pending Suite 9 commit

## Goal

Phase 9 proves every baseline item against the replacement. It does not use numeric violation thresholds as a compatibility shortcut.

## Comparison method

1. Compare the baseline identifier set with the parity ledger.
2. Require one disposition and one proof target for every item.
3. Run accessible and inaccessible pages through real Axe.
4. Test exact and expired acceptances.
5. Test origin, browser, route, profile, result, and screenshot limits.
6. Confirm that incomplete findings remain visible.
7. Confirm that browser versions appear in provider details.

## Deliberate changes

The replacement removes numeric severity thresholds. Exact acceptances are safer because they name the known element and rule.

The replacement adds multiple routes and named profiles. It runs each combination in a new browser context and uses bounded parallel work.

## Evidence rules

The JSON report contains Axe results without embedded screenshot bytes. Screenshot files use separate evidence records. This prevents duplicate large evidence.

## Exit criteria

Phase 9 closes when every ledger entry is proved and no runtime compatibility wrapper remains. The offline scaffolder can convert reviewed legacy configuration once.
