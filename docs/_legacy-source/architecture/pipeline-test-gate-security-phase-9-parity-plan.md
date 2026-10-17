# Security suite Phase 9 parity plan

## Goal

Account for each old behavior, each architecture decision, and each removed defect before legacy deletion.

## Comparison method

The legacy baseline records the old header behavior as historical fact. Executable tests run the replacement against real HTTP responses, a real dependency tree, a real immutable image, and a real checked manifest. The signed remote proof checks dispatch, isolated scheduling, evidence storage, import, and the Nova decision. The controller test checks the runtime observation model. The final deployed cluster proof stays pending until the controlled production cycle.

## Required decisions

- Preserve useful header checks through named profiles.
- Replace numeric missing-header allowances with exact finding acceptances.
- Add dependency, image, static policy, and runtime security domains.
- Keep scanner failure as an execution error.
- Block critical and high findings, active threats, and vulnerabilities without fixes under `strict-v1`.
- Keep accepted, expired, and unused acceptances visible.
- Remove duplicate vulnerability ownership from generic lint after the security provider owns it.
- Normalize package, installed version, fixed version, source file,
  reachability, and status fields before policy evaluation.
- Prove that no general lint tool retains dependency-vulnerability authority.

## Exit gate

Each ledger row must have a rationale and an existing executable proof or an
explicit historical baseline fact. The expected item count must match. The
semantic gate must check normalized findings, all five production nodes, typed
image input, authenticated evidence import, and sole vulnerability authority.
No row can be deferred for source cutover. Production acceptance is tracked
separately.
