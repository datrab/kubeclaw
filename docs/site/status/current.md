# Current Platform Status

Status: current implementation status with separate live-acceptance limits
Audience: operator, plugin author, architecture reader
Owner: platform-architecture
Evidence: packaging/runtime/roles/nova.json; packaging/runtime/roles/buster.json; packaging/runtime/roles/prism.json
Applies to: current repository roles and documented product boundaries
Last verified: 2026-09-17; no live environment result is available

## Where to find current work

This page is a source-reviewed snapshot. It is not a live service dashboard.
The `Last verified` field states its evidence limit. Runtime health, availability,
and successful delivery need the environment checks in [live acceptance](acceptance.md).

The [open-issues view](open-issues.md) comes from the canonical machine-readable register.
Update `docs/status/open-issues.json`, then run `npm run docs:status:generate`.
The generated page contains the remaining implementation work and its completion criteria.
It separates current implementation issues from later additions to their scope.

[Live acceptance](acceptance.md) records environment prerequisites, procedures and expected results.
A local finding closure does not assert that those procedures ran.
The [decision index](../decisions/README.md) explains enduring constraints and their authority.

## Status Authority

| Question | Authority | Meaning |
| --- | --- | --- |
| What does repository source implement? | This page and linked implementation sources | Source-backed behavior at the verified revision |
| Which implementation work remains open? | `docs/status/open-issues.json` through [open issues](open-issues.md) | Current technical gaps with stable IDs |
| What work is planned? | [Roadmap](roadmap.md) | Intended work, not current behavior |
| Did the system pass in a real environment? | [Live acceptance](acceptance.md) | Recorded procedure, environment, and result |
| Why does a constraint exist? | [Decision records](../decisions/README.md) | Decision authority, reason, and supersession |

Update the machine-readable issue register before its generated page. Do not add
a second issue list to an architecture or operator page. A closed source issue
does not close its separate live-acceptance gate.

## Source-backed runtime boundaries

- Nova owns the pipeline lifecycle and dispatches bounded work.
- Worker Core provides common mechanics below specialist engines.
- Nova, Buster and Prism each have a runtime-role manifest.
- Prism has an implemented native execution path; it is not merely a design outside the role inventory.
- Buster's remaining native-runner and fixture-lifetime integration belongs to the open issues.
- Forge and Echo are dispatched specialists. A registered package does not prove activation or reachability.
- Plugin API v2 is the extension contract. This does not imply that every runtime and deployment path has completed live acceptance.

These statements describe repository sources. They do not confirm a deployed cluster, successful operator delivery or product acceptance.
Use the issue-specific code references and acceptance gates before making a stronger claim.
