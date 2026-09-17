# Request To Result

Status: replaced by the complete architecture trace
Audience: architecture reader, maintainer, operator
Owner: Nova Core
Evidence: docs/site/understand/request-state-recovery.md
Applies to: pipeline-plugin-v2
Last verified: source inspection on 2026-09-15

The complete trace is now in [Request, State, and Recovery](request-state-recovery.md).

That page explains the normal path and the important failure paths.
It also identifies each owner, durable record, identity, timeout, stop condition, and artifact.

Use these related pages:

- [Components and Authority](components-and-authority.md) explains who can make each decision.
- [Deployment and Trust](deployment-and-trust.md) explains where each handoff crosses a process or trust boundary.
- [Glossary](../reference/glossary.md) defines the terms used in the trace.
