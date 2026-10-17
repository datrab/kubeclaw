# Lighthouse suite Phase 10 cutover plan

Status: source cutover implemented; production acceptance pending  
Audience: operators and migration reviewers  
Owner: Pipeline architecture

## Goal

Phase 10 removes the legacy `perf` authority and makes `kubeclaw.lighthouse@1` the only source authority for Lighthouse tests.

## Cutover sequence

1. Remove `perf` from the legacy bridge protocol.
2. Remove the old suite function and registry entry.
3. Remove the old Lighthouse capability name from the legacy runtime.
4. Reject old flat `test_config.perf` values during project setup.
5. Require an explicit replacement node for an old `perf` selection.
6. Package the new provider and capability in Buster.
7. Add a real production workspace declaration.
8. Add a signed Nova-to-Buster production preflight and receipt.
9. Record production acceptance as pending until the final controlled cycle.

## No dual authority

The old suite cannot execute after this phase. Project setup can detect old configuration, but it does not translate flat thresholds into a new budget. This is a fail-closed migration check, not a compatibility runtime.

## Rollback

Rollback restores the whole source commit. Operators must not restore only the old `perf` registry entry. A partial rollback would create dual authority.

## Exit criteria

The inventory gate must prove deletion, packaging, production selection, preflight orchestration, status accuracy, and a clean legacy-token scan. Live production acceptance closes only after its signed receipt passes.
