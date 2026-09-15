# Prism: design ownership and implementation choices

Status: extracted decisions; approval and proof are bounded below
Audience: architecture readers, developers, and operators
Owner: Prism maintainers
Applies to: source revision `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`
Last verified: 2026-09-15; source reconciliation, no new live acceptance
Language: English editorial review; full ASD-STE100 verification remains an AP11 gate

## Product and data ownership

Nova owns the product architecture and module plan. Prism designs an experience inside those constraints.
Prism produces a mocked design and an immutable approved baseline, not a production application.
Forge and the pipeline implement and test the application against that baseline.
This keeps design exploration independent from production credentials and deployment authority.

The original architecture marks these boundaries accepted; an individual approver and date are not recorded for every clause.
Its diagrams and provider names describe design intent, not installed services.
The three storage responsibilities are separate: the Design Document owns editable design, PostgreSQL owns durable relational state, and the platform artifact store owns large immutable objects.
Generated previews and editor projections do not become canonical state.
Published evidence needed by an approved bundle must remain available even if draft projections can be rebuilt.

Research, design directions, detailed editing, and review/publication are connected user activities.
The Studio supports them without becoming a second orchestrator.
Provider-specific response formats stay behind adapters. External provider candidates are not proof of working integrations.

## Design Document and editor

The accepted August 12 schema review keeps meta, theme, assets, components, views, and flows.
Nodes keep id, type, props, and children.
Token, data, asset, and action references use explicit objects so validation does not depend on magic string prefixes.
Transition identity is separate from its triggering action: one action can have success and failure outcomes.
Property patches target node IDs directly and cannot change identity, type, or children.

Data binding uses bounded dot paths, not an expression language.
Views own responsive patches; theme breakpoints do not create a second responsive layout mechanism.
Simple tables remain limited. Rich rows use a list and reusable component instead of arbitrary render functions.
Terminal commands are display-only. Declared transitions change mock state without executing a shell.
A deferred node type needs a strict schema and capability proof before it is supported.
The current catalog and fixtures, rather than an old candidate list, determine available nodes.

The Puck decision is provisional adapt: use it behind a typed adapter and keep it replaceable.
Convert editor actions into Prism operations. Never accept complete editor state as canonical replacement.
Use the same operation model for mobile, including non-drag alternatives, undo, redo, and revision recovery.
The authoritative preview uses a separate opaque-origin sandbox.
The editor's same-origin iframe is not the security boundary.
Messages require exact source, protocol, session, order, and size checks.
These restrictions cost adapter work but prevent framework state or rendered code from acquiring Studio authority.

## Retrieval and preferences

Use PostgreSQL full-text search plus exact pgvector search first, with rights filters and deterministic rank combination.
Keep one combined embedding before adding separate facets or another vector store.
Only measured limits justify the extra operational and consistency cost of HNSW, replicas, or a specialist service.
The phase-0 decision permits local implementation with PGlite evidence; it does not establish native-server or physical-device acceptance.

The spike proposes p95 at most 250 ms. The implementation plan and executable server benchmark use 300 ms at 10,000 references.
No separate approval for this relaxation is established here.
Record both limits. G07 must report results against both and must not call 300 ms an approved replacement without decision evidence.
The other recorded criteria include precision at 10 of 0.70, recall at 20 of 0.80, zero rights leaks, and declared corpus and hardware.
The top ten must also contain four product or source families when four are eligible.
Rights and status filters must have zero false inclusions.
The same query, corpus snapshot, model, and ranking version must return the same ordered IDs.
Hybrid search must match or improve the better individual search method on the labelled query set.
Exact vector search must preserve full vector recall. The optional 100,000-row scale probe does not block v1.
These are acceptance targets, not measured production results.

Here, p95 is the query time that at least 95% of measured queries meet.
Precision at 10 measures the share of relevant results in the first ten results.
Recall at 20 measures the share of the labelled relevant results found in the first twenty.
Together with diversity and access filters, these checks prevent a fast but unhelpful or unauthorized result from passing.

The [spike criteria](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/spikes/prism-foundation-spikes.md#L245-L266)
and [implementation-plan criteria](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism-implementation-plan.md#L332-L345)
are the sources for these requirements. Their different latency limits remain visible.

[D11](runtime-and-operations.md#d11) owns contextual preferences and project overrides.
The accepted no-decay contract conflicts with implemented 180-day decay.
[DOC-AP04-PREFERENCE-001](../status/open-issues.md#doc-ap04-preference-001) preserves that unresolved approval boundary.
Do not silently rewrite either history or stored preference snapshots to hide the conflict.

## Durable operations and publication

Acquire the migration lock before schema metadata access. One migration owner applies ordered files on one connection.
Control is not a second schema manager.
Use durable cross-replica replay nonces and input-bound idempotency keys.
A lost response must return the previously committed result; a changed input or stale generation must conflict.

Approval binds the exact architecture revision, design revision, warning identity, and independent bundle-member digests.
Check warnings again at publication. A later edit cannot reuse an old approval.
Direction diversity checks compare all pairs and must not mistake copy or key-order changes for real diversity.
Keep exact internal evidence origin and digest when workers consume or return artifacts.

Service-to-service traffic uses its declared Service DNS and authentication boundary.
Human access uses the controlled ingress/session route. Do not infer either identity from an arbitrary header or port-forward.
Namespace mutation belongs to its controller. The permanent platform namespace is not a temporary demo.
Capture and ingestion validate the actual endpoint, TLS identity, redirects, and address restrictions.
Quarantine cleanup failure must not authorize publication or erase its cause.

The accepted recovery contract in [runtime decisions](runtime-and-operations.md#prism-recovery-policy) qualifies the earlier unconditional PITR proposal.
Later native host-pool decisions qualify the earlier workload-only/no-host-path direction.
Prism continues to use neutral Worker Core contracts; these changes do not put Prism types in Core.
The thirteen original workstreams are covered through product, state, editor, retrieval, preferences, providers, workers, integration, access, publication, recovery, observability, and acceptance.
Historical phase completion does not certify every deployed workstream.

## Evidence and remaining proof

The old repository production verifier did not prove production execution.
Later protected manifests bind the source, four image identities, and gate artifacts.
That HMAC receipt is distinct from other suites' external Ed25519 receipts.
Neither a service-level end-to-end test nor a schema/CEL matrix proves the complete Nova–Forge–Buster–human journey.
An August controller failure is historical evidence, not a current cluster diagnosis.

Use G07 for native PostgreSQL and service state, G08 for browser/mobile behaviour, G10 for human/controller authority,
G13 for recovery, and G14 for the complete project journey.
Physical-device, real database, clean namespace, failure recovery, and protected receipt checks retain their actual prerequisites.
The compact original finding index preserves local closures; old phase task counts do not reopen them.

- [prism-design-engine-architecture.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/prism-design-engine-architecture.md)
- [prism-design-document-v1-review.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/prism-design-document-v1-review.md)
- [prism-foundation-spikes.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/spikes/prism-foundation-spikes.md)
- [phase-0-audit.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism/phase-0-audit.md)
- [prism-implementation-plan.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism-implementation-plan.md)
- [phase-16-correction-audit.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism/phase-16-correction-audit.md)
- [phase-17-remediation-audit.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism/phase-17-remediation-audit.md)
- [phase-18-completion-audit.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/implementation/prism/phase-18-completion-audit.md)
- [index.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/prism/domain/index.ts)
- [index.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/prism/corpus/index.ts)
- [verify.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/spikes/prism/postgres-retrieval/verify.mjs)
