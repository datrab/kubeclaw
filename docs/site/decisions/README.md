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

## Record Contract

Each stable identifier keeps one meaning. A complete record states the context,
decision, recorded alternatives, reason, consequences, approval, implementation,
verification, and supersession state. A field can state that the source is silent.
It must not fill an evidence gap with an invented explanation.

Decision status and implementation status are independent. `Accepted` means that
the selected constraint has approval evidence. It does not mean that all code,
operations, or live acceptance for that constraint are complete.

When a decision changes, keep the old identifier. Mark its exact replaced scope
and link to the successor identifier. The successor must state which earlier
guarantees remain valid. Do not reuse an old identifier for the new choice.

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
Sources are pinned to Git revisions so later document maintenance does not remove the evidence.

Maintain unfinished work in [open issues](../status/open-issues.md), not a second task list inside each record.
Maintain environmental proof in [live acceptance](../status/acceptance.md).
When a decision changes, record the new authority, rationale and successor.
Do not rewrite old approval evidence or silently turn an implementation workaround into an accepted rule.

The [documentation governance rules](../reference/documentation-governance.md#decision-records)
define the required record fields and maintenance procedure.

These pages explain current architectural and product decisions. They do not expose
the documentation process that produced them. Use [current status](../status/current.md)
for implemented boundaries, [open work](../status/open-issues.md) for known gaps,
and [acceptance](../status/acceptance.md) for evidence that still needs a live environment.
