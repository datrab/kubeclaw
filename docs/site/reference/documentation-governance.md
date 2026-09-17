# Documentation Governance

Status: current maintenance contract
Audience: documentation contributor, maintainer, reviewer
Owner: documentation
Evidence: scripts/docs-governance.mjs; scripts/docs-publication.mjs; scripts/docs-status.mjs; docs/status/open-issues.json
Applies to: all reader-facing files below docs/site
Last verified: 2026-09-17; source inspection and local documentation checks

## Purpose

This page explains which document owns each type of information. It also explains how to keep that information current.

A link can work while its statement is false. A generated table can be current while its explanation is unclear.
For these reasons, KubeClaw checks source facts and authored explanations through separate paths.

## One Canonical Home for Each Topic

Use the following homes. Link to a canonical page when another reader path needs the same explanation.
Do not copy the explanation into a second page.

| Information | Canonical home | Owner role |
| --- | --- | --- |
| System behavior and component boundaries | `understand/` | The named component or platform owner |
| Operator procedures and recovery | `use/` | Platform operations |
| Extension contracts and development tasks | `extend/` | Plugin foundation or the named specialist owner |
| Exact generated facts and shared terms | `reference/` | Documentation and the source component owner |
| Enduring choices and their reasons | `decisions/` | Platform architecture or the named decision owner |
| Current implementation limits | `status/current.md` and `status/open-issues.md` | Platform architecture and platform maintainers |
| Planned work | `status/roadmap.md` | Platform maintainers |
| Environment acceptance | `status/acceptance.md` | Platform operations |

A page can link to several areas. It must not become a second authority for their facts.
For example, an operator procedure can summarize a trust boundary and link to its full architecture explanation.

## Source Authority

Use the narrowest source that owns a fact.

1. A schema owns accepted fields, types, required values, and structural limits.
2. A runtime manifest owns package membership for that role.
3. Implementation source owns current behavior.
4. A focused test proves only the behavior that it executes.
5. A decision record owns an approved reason or constraint.
6. The open-issue register owns incomplete implementation work.
7. A live acceptance record owns results from a real environment.

Do not use code as proof of approval. Do not use an accepted decision as proof of implementation.
Do not use a local test as proof of deployment behavior.

The publication tool checks page metadata and repository evidence paths. See the
[metadata check](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts/docs-publication.mjs#L404-L467).
The status generator reads the machine-owned issue register. See the
[status source boundary](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts/docs-status.mjs).

## Authored Explanations and Generated Facts

Authored text explains purpose, sequence, reasons, consequences, failure, and recovery.
A maintainer reviews this text when a source dependency changes.

Generated content lists repetitive facts from manifests, schemas, or registers.
Do not edit generated content by hand. Change its source or generator, and then regenerate it.

The current generated reader pages are:

- `status/open-issues.md` from `docs/status/open-issues.json`;
- `reference/capabilities.md` from the capability vocabulary;
- `reference/cli.md`, `reference/environment-variables.md`, `reference/helm-values.md`,
  `reference/secrets.md`, `reference/verification-commands.md`, and
  `reference/workflows.md` from repository inventories;
- `extend/plugin-catalogue/` from plugin manifests, schemas, guidance, and verification records; and
- `reference/generated-documentation-map.json` from page metadata.

The plugin publication source keeps authored guidance separate from generated package facts. See the
[page construction](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts/docs-publication.mjs#L160-L238).

## Required Page Metadata

Every Markdown page has six fields directly below its title.

| Field | Meaning | Update trigger |
| --- | --- | --- |
| `Status` | The page's present claim, not a completion slogan | Its implementation or decision state changes |
| `Audience` | The reader roles that need the page | A supported task or reader path changes |
| `Owner` | The role that reviews and maintains the page | Component responsibility changes |
| `Evidence` | Repository sources that support the page | A source moves, splits, or loses authority |
| `Applies to` | The versions, components, or scope of the claim | Compatibility or scope changes |
| `Last verified` | The last source or environment review and its limit | The page receives a new applicable check |

The generated [documentation map](generated-documentation-map.json) records these fields for every page.
It also assigns the checks that protect each page. The generator fails if any page lacks required metadata.

Run these commands after a documentation change:

```bash
npm run docs:governance:generate
npm run docs:governance:check
npm run docs:publish-check
```

The first command updates the map. The second command detects drift without changing files.
The final command runs the complete local publication gate.

## Decision Records

A stable decision identifier never changes its meaning. A decision record includes these items when evidence exists:

- the problem and its constraints;
- the selected approach and its scope;
- alternatives that the source records;
- the reason for the choice;
- benefits, costs, and operational consequences;
- approval status and provenance;
- implementation and verification status; and
- its successor or related decisions.

If historical evidence does not name an alternative, date, or approver, say that it is unknown.
Do not invent history to make the record look complete.

An accepted decision can have partial implementation. A replaced decision remains in history and points to its successor.
The successor states which part it replaces. It also states which earlier guarantees remain valid.

## Deprecation, Redirect, and Supersession

Use these rules before changing a published route or term:

1. Select the successor page or term.
2. State why the old item is no longer correct.
3. State the compatibility period when one exists.
4. Add a redirect before removing a published route.
5. Link the old decision to its successor when historical meaning matters.
6. Remove an alias only after its declared compatibility period ends.

The repository has no earlier public-route manifest. Therefore, this documentation does not invent redirects for unknown historical URLs.
The [route registry](documentation-route-registry.json) records declared redirects and deprecated terms.
The generated map establishes the current route baseline. Future route changes must preserve declared redirects in the registry.

A repository source path is not automatically a published route. Moving an internal record does not create a public redirect requirement.

## Definition of Complete

A page is not complete because it exists or because a build passes. Completion requires all applicable results below:

- claims agree with their source and declared revision;
- mechanisms, ownership, failures, recovery, and limits have sufficient detail;
- significant choices include reasons and consequences;
- a new technical reader can follow the explanation without chat history;
- instructions contain prerequisites, observations, stop conditions, and recovery;
- extension tasks produce the declared checked result;
- links and evidence resolve in source and publication output;
- an owner, source dependency, and check protect the page; and
- source, local-test, deployment, and human-acceptance states remain distinct.

ASD-STE100 verification is a separate gate. Current project language checks help writers, but they do not certify full ASD-STE100 conformance.

## Change Procedure

1. Identify the canonical page and its owner in the generated map.
2. Read each listed source dependency before changing a claim.
3. Update authored explanation and generated facts through their separate paths.
4. Update decision and status pages when authority or implementation state changes.
5. Refresh `Last verified` with the actual check scope.
6. Generate the documentation map.
7. Run the mapped checks and the complete publication gate.
8. Record checks that need a live environment as pending.

Do not change `Last verified` after a formatting-only edit. Do not claim a live result from source inspection.
