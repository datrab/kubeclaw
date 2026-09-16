# AP06 Completion Checkpoint

Date: 2026-09-15
Rechecked: 2026-09-16
Status: complete
Scope: W04, W05, and W06
Evidence revision: `85e73b1885f04a9494f388cf6622ad0bde2db447`

## Result

AP06 replaces the short architecture introduction with one connected explanation.
The 2026-09-16 review added the missing pipeline dependency and platform layers.

This size is not the acceptance measure.
The acceptance measure is whether a new reader can explain the system and find the next task page.

## Delivered Pages

| Reader outcome | Canonical page | AP05 package |
| --- | --- | --- |
| Understand purpose, audience, prerequisites, scope, and limits. | [Understand KubeClaw](../site/understand/README.md) | W04 |
| Distinguish all components and their authority. | [Components and Authority](../site/understand/components-and-authority.md) | W04 |
| Follow normal and failed requests through durable state. | [Request, State, and Recovery](../site/understand/request-state-recovery.md) | W05 |
| Map roles to processes, identities, networks, storage, and failures. | [Deployment and Trust](../site/understand/deployment-and-trust.md) | W06 |
| Explain direct and conditional pipeline dependencies. | [Pipeline Dependencies](../site/understand/pipeline-dependencies.md) | W06 correction |
| Separate platform controllers and optional operations tools. | [Platform and Operations Architecture](../site/understand/platform-and-operations.md) | W06 correction |
| Understand SPIFFE, Envoy, and exact workload trust. | [Worker Trust](../site/understand/worker-trust.md) | W06 detail |
| Resolve technical terms without prior knowledge. | [Glossary](../site/reference/glossary.md) | W04–W06 |

The former [Request To Result](../site/understand/request-to-result.md) route now points to the complete trace.
This preserves incoming links without maintaining a second lifecycle explanation.

## Acceptance Evidence

| AP06 requirement | Evidence |
| --- | --- |
| Short introduction | The entry page states purpose, readers, prerequisites, scope, and current limits. |
| One complete example | The account-page example follows compile, Forge, lint, Echo, Buster, import, final checks, and closure. |
| All named components | The component page explains Nova, Nova Core, Foundation, SDK, Worker Core, Buster, Prism, Forge, Echo, and the plugin runtime. |
| Honest status | The entry and component pages separate presence, activation, reachability, local verification, and live acceptance. |
| Complete architecture subjects | The pages also cover Git, Redis, PostgreSQL, BuildKit, registries, Tailscale, K3s, Flannel, Cilium, Argo CD, monitoring, and Ops. |
| Important failures | The lifecycle page explains retry, repair budgets, approval, resume, restart, cancellation, escalation, and uncertain effects. |
| Precise diagrams | Nine diagrams have direct text alternatives. They cover authority, execution, dependencies, platform layers, trust, storage, and recovery. |
| Glossary | The glossary defines component, lifecycle, identity, trust, and evidence terms. It also separates similar terms. |
| Code evidence | Forty-two source-evidence boxes link claims to revision-bound code ranges and applicable decision records. |
| Reader routing | Each architecture page links to the matching operations, extension, status, issue, or decision page. |

## Decision Explanation Standard

The component and deployment pages state why each main boundary exists.
They also state its cost and a reconsideration condition where the evidence supports one.

The pages do not invent missing rationale.
They link to the preserved decision record when that record contains the complete alternatives and approval history.

## Source Display Choice

AP06 uses a Markdown source-evidence box for each important claim.
The box shows the claim context and a revision-bound code link.

AP06 does not copy production code into the page.
Copied code would become a second source that can drift.
The link opens the exact lines at the inspected revision.

A rendered inline code preview remains a publication feature.
AP09 can add that feature if the selected renderer supports a stable and accessible preview.
The current box remains a complete fallback.

AP06 also keeps each architecture diagram in Mermaid source beside its explanation.
This keeps the facts, labels, and arrows with the architecture text while the context is current.
AP09 owns the final HTML renderer, visual style, navigation, and responsive behavior.
This split prevents a temporary presentation from becoming a second publication pipeline.

## Language Review

The product text uses controlled technical English.
It uses short sentences, active voice, defined technical nouns, and direct statements.

The repository language check accepts all new AP06 pages.
AP11 retains the formal ASD-STE100 dictionary review and human-reader acceptance test.
AP06 therefore does not claim final formal certification.

## Verification

| Check | Result |
| --- | --- |
| `git diff --check` | Pass. |
| `npm run docs:check:refs` | Pass: 1,749 local links and 823 repository-path references. |
| `npm run docs:check:coverage` | Pass. The topic-map references remain current. |
| `npm run verify:docs:controlled-language` | Pass. |
| Revision-bound source audit | Pass: all 98 checked architecture code links resolve to existing files and valid line ranges. |
| Local link audit | Pass through `npm run docs:check:refs`; linked files exist. |
| Architecture presentation check | Pass: all nine Mermaid diagrams have a direct text alternative; all source-evidence boxes contain a revision-bound code link. |
| AP06 content measures | Pass: 2,052 lines, 13,706 words, 42 source-evidence boxes, nine diagrams, and 55 glossary terms. |
| `npm run docs:publication:check` | No AP06 page error. The complete check remains red for pre-existing catalogue and legacy-page findings assigned to AP08, AP09, and AP11. |

The verification does not claim a fresh runtime or live-cluster test.
AP06 changed documentation only.

## Remaining Work

- AP07 completed operator procedures, recovery, backup, restore, upgrades, and loss-of-access boundaries.
- A supported Git mirror does not exist in current source. The architecture states this limit instead of inventing an implementation.
- IFR-01-001 still owns empty-host automation and recovery preparation.
- AP08 must complete extension guidance and regenerate the plugin catalogue.
- AP09 must complete publication integration and can add inline source previews.
- AP10 must remove replaced historical pages after their content migration.
- AP11 must run the final ASD-STE100 and human-reader acceptance gates.
- Product issues and live acceptance remain visible in the status track.
