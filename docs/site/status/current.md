# Current platform status

> AP04 working draft. Extraction and source migration are incomplete; see the [checkpoint](../../blueprint/AP04-checkpoint.md).
Status: partial
Audience: operator, plugin author, architecture reader
Owner: platform-architecture
Evidence: packaging/runtime/roles/nova.json; packaging/runtime/roles/buster.json; packaging/runtime/roles/prism.json
Applies to: source baseline 1e50167fcb4355dfce4110d612ab360828c64394 and AP04 documentation extraction
Last verified: 2026-09-15, source and documentation checks only

## Where to find current work

The [open-issues view](open-issues.md) comes from one [JSON register](open-issues.json).
Update the JSON, then run `npm run docs:status:generate`.
The generated page contains the remaining implementation work and its completion criteria.
It separates original review findings from later technical follow-ups.

[Live acceptance](acceptance.md) records environment prerequisites, procedures and expected results.
A local finding closure does not assert that those procedures ran.
[Acceptance decisions and provenance](../decisions/acceptance.md) preserve D12 and the original finding identities.
The [decision index](../decisions/README.md) explains enduring constraints and their approval evidence.

## Source-backed runtime boundaries

- Nova owns the pipeline lifecycle and dispatches bounded work.
- Worker Core provides common mechanics below specialist engines.
- Nova, Buster and Prism each have a runtime-role manifest.
- Prism has an implemented native execution path; it is not merely a design outside the role inventory.
- Buster's remaining native-runner and fixture-lifetime integration belongs to the open issues.
- Forge and Echo are dispatched specialists. A registered package does not prove activation or reachability.
- Plugin API v2 is the extension contract. This does not imply that every unrelated runtime migration is complete.

These statements describe repository sources. They do not confirm a deployed cluster, successful operator delivery or product acceptance.
Use the issue-specific code references and acceptance gates before making a stronger claim.
