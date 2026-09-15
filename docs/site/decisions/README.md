# Decisions and their authority

> AP04 extraction complete. See the [completion report](../../blueprint/AP04-checkpoint.md) for evidence and remaining documentation work.
Status: current documentation extraction
Audience: maintainer, architecture reader, operator
Owner: platform-architecture
Evidence: packaging/runtime/package-ownership.json
Applies to: source baseline 1e50167fcb4355dfce4110d612ab360828c64394 and AP04 extraction
Last verified: 2026-09-15, source and decision provenance review only

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
| [Acceptance and closure provenance](acceptance.md) | What does D12 close locally, and how do the original finding IDs remain traceable? |

Original identifiers remain attached to their decisions.
Repeated explanations share a record; distinct approval or supersession boundaries remain explicit.
Where the source does not establish approval, the record says so.
Historical scope instructions are not new product requirements.
Sources are pinned to Git revisions so later review cleanup does not remove the evidence.

Maintain unfinished work in [open issues](../status/open-issues.md), not a second task list inside each record.
Maintain environmental proof in [live acceptance](../status/acceptance.md).
When a decision changes, record the new authority, rationale and successor.
Do not rewrite old approval evidence or silently turn an implementation workaround into an accepted rule.

The `ap04_extraction` fields in the [existing review ledger](../../blueprint/review-ledger.jsonl) resolve the 128 AP03 decision handoffs to these records. Original target names remain as historical planning data. Full source-document migration remains pending for AP06–AP10.
