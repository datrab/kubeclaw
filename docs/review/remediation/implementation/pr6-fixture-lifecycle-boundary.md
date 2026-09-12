# Buster fixture accounting boundary — decision proposal

Status: proposed, not implemented and not an issue closure. This is separate
from the already accepted decisions about Linux task units, generous limits,
Worker Core ownership primitives and Buster-only fixture policy.

## Existing behavior that the integration must preserve deliberately

In `skills/buster/engine/test-gates/runner.ts`, successful fixture provisioning
sets `retainFixture`. Attempt cleanup then deliberately returns without calling
the provider cleanup function. The runner persists the completed worker attempt
and uses the fixture outputs to execute dependent nodes. Only after those nodes
finish does `#cleanupFixtures` invoke cleanup on the retained provider instance,
terminate it and remove its attempt repository. The original attempt claim
window is calculated from setup timeout and completion phases, not from the
duration of all dependent nodes.

The new generic native process executor drains the complete host tree before
sealing a terminal result. Using it unchanged for this existing fixture setup
path would terminate the retained host before its dependents and eventual
cleanup run. Exempting retained fixtures from drain without durable replacement
ownership would retain the original orphan and accounting defect.

## Alternatives

1. Keep the existing setup attempt open until fixture cleanup finishes. Its
   claim, budget and final receipt then cover the entire fixture lifetime.
   Buster must distinguish readiness from terminal completion, renew long-lived
   claims and update downstream result/reference handling. This provides one
   continuous accounting boundary but changes the meaning and duration of the
   existing setup-attempt budget.
2. Give fixtures an explicit durable Buster lifecycle, with readiness, use and
   teardown phases, a separate lifetime resource budget and a terminal fixture
   receipt. Ordinary attempts retain their normal completion boundary. Buster
   owns the readiness/dependency policy and final run aggregation; Worker Core
   owns only the neutral process scope, lease fencing and native observations.
   This preserves the distinction between ready fixtures and completed attempts,
   but adds a versioned fixture lifecycle/accounting contract.

Recommendation: option 2, with explicit, generously sized lifetime limits and
no inferred conversion from historical setup/process budgets. Prism continues
to use its ordinary per-attempt execution and browser-closure lifecycle.

## Required properties of the selected implementation

- Readiness never certifies that the retained fixture host has stopped.
- A fixture always has exactly one durable resource owner, including recovery,
  cancellation and teardown. Scope identity includes boot and inode identity.
- Do not move live processes between cgroups to simulate a fresh memory budget:
  existing memory charges cannot be assumed to follow that move. Keep native
  ownership and accounting on the physical scope through its full lifetime.
- Phase/receipt references remain immutable and explicitly bound. No provisional
  result is silently rewritten after dependent work has referenced it.
- Final plan completion and terminal source cleanup require confirmed fixture
  teardown, or preserve an explicit unresolved failure and block unsafe reuse.
- Tests must cover setup success followed by dependent work, cleanup CPU/I/O,
  failed teardown, cancellation and real supervisor death at ownership changes.
- No operational cleanup or deployment is authorized by this proposal.

The open choice is the public budget/receipt boundary for retained fixtures.
The Core/Buster responsibility split and Prism's independent lifecycle were
already decided and do not need to be approved again.
