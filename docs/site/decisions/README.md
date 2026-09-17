# Decisions and Their Authority

Status: current
Audience: maintainer, architecture reader, operator
Owner: platform-architecture
Evidence: packaging/runtime/package-ownership.json
Applies to: current architecture and product policy
Last verified: 2026-09-17

Use these records to understand why a constraint exists and whether its approval is established.
An accepted decision can still have incomplete implementation.
Code that matches a proposal does not prove that someone approved it.
A local finding closure does not prove deployment or human product acceptance.

| Record | Questions it answers |
| --- | --- |
| [Core and plugins](core-and-plugins.md) | Who owns lifecycle authority, extension contracts, isolation, durable effects and specialist execution? |
| [Test-gate decisions](test-gate.md) | Which original test-gate decisions govern providers, evidence, remote jobs and Worker Core? |
| [Runtime and operations](runtime-and-operations.md) | Which runtime, observability, operator, retention, configuration and recovery constraints apply? |
| [Echo decisions](echo.md) | Which original Echo decisions govern proposals, deterministic evidence, reduction and policy? |
| [Prism decisions](prism.md) | How do product, editor, retrieval, preference, publication and recovery choices fit together? |
| [Implementation decisions](implementation.md) | How do native ownership, signed human decisions, versioned data and integration history refine the core rules? |

Original identifiers remain attached to their decisions.
Repeated explanations share a record; distinct approval or supersession boundaries remain explicit.
Where the source does not establish approval, the record says so.
Historical scope instructions are not new product requirements.
Sources are pinned to Git revisions so later review cleanup does not remove the evidence.

Maintain unfinished work in [open issues](../status/open-issues.md), not a second task list inside each record.
Maintain environmental proof in [live acceptance](../status/acceptance.md).
When a decision changes, record the new authority, rationale and successor.
Do not rewrite old approval evidence or silently turn an implementation workaround into an accepted rule.

These pages explain current architectural and product decisions. They do not expose
the documentation process that produced them. Use [current status](../status/current.md)
for implemented boundaries, [open work](../status/open-issues.md) for known gaps,
and [acceptance](../status/acceptance.md) for evidence that still needs a live environment.
