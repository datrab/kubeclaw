# Prism Baseline Bundle v1

Status: accepted architecture contract

## Purpose

The Baseline Bundle is Prism's immutable handoff to Nova and the pipeline.

The Design Document tells Studio what to render. The Baseline Bundle packages that
document with the approved guidance, assets, visual targets, and acceptance criteria
that the pipeline needs to implement and verify the experience.

Drafts, conversations, research responses, rejected directions, preference events,
and worker logs are not part of the bundle.

## Bundle layout

```text
prism-baseline/
├── manifest.json
├── design-document.json
├── design-specification.md
├── acceptance-criteria.json
├── assets/
├── previews/
│   └── index.json
└── checksums.json
```

All paths are relative to the bundle root. A path must not escape the bundle.

## Manifest

`manifest.json` is the bundle entry point.

```json
{
  "schema": "prism.baseline-bundle.v1",
  "bundleId": "user-app-baseline",
  "projectId": "user-app",
  "revision": 1,
  "designDocument": {
    "path": "design-document.json",
    "schema": "prism.design-document.v1",
    "revision": 12
  },
  "designSpecification": {
    "path": "design-specification.md"
  },
  "acceptanceCriteria": {
    "path": "acceptance-criteria.json"
  },
  "assets": {
    "dashboard-preview": {
      "path": "assets/images/abc123.webp",
      "mediaType": "image/webp",
      "digest": "sha256:..."
    }
  },
  "previews": {
    "path": "previews/index.json"
  },
  "createdAt": "2026-08-12T17:00:00Z",
  "digest": "sha256:..."
}
```

Required fields:

- `schema`
- `bundleId`
- `projectId`
- `revision`
- `designDocument`
- `designSpecification`
- `acceptanceCriteria`
- `assets`
- `previews`
- `createdAt`
- `digest`

Rules:

- `schema` is exactly `prism.baseline-bundle.v1`.
- IDs are Prism-owned and follow the Prism ID rules.
- `revision` is a positive integer.
- Dates use UTC and RFC 3339.
- Provider IDs, provider schemas, remote URLs, and absolute paths are forbidden.
- The manifest resolves every required member and asset.
- A published bundle is immutable. A design change creates a new revision.

Approval is an event outside the bundle. Worker-core records who approved the exact
bundle digest and when. This keeps the bundle content-based and portable.

## Design Document

`design-document.json` contains one complete, valid, approved Design Document. It is
embedded in the bundle rather than referenced through PostgreSQL. The pipeline can
therefore consume the handoff when Prism is unavailable.

Its schema and revision must match `manifest.json`.

## Design specification

`design-specification.md` explains the approved intent that does not belong in the
render schema. It uses these fixed sections:

```markdown
# Design specification

## Experience goal

## Users and primary tasks

## Approved direction

## Screen and flow inventory

## Responsive behavior

## Accessibility requirements

## Content guidance

## Important design rules

## Implementation notes

## Known limits
```

The specification can explain desired feeling, hierarchy, density, disclosure,
media treatment, and implementation-relevant trade-offs. It must not contain raw
research, provider responses, chat history, or preference history.

## Acceptance criteria

`acceptance-criteria.json` defines observable requirements.

```json
{
  "schema": "prism.acceptance-criteria.v1",
  "criteria": [
    {
      "id": "auth-error-state",
      "category": "flow",
      "requirement": "The sign-in flow shows a clear authentication error.",
      "targets": [
        {
          "view": "sign-in",
          "state": "error"
        }
      ],
      "priority": "required",
      "verification": ["visual"]
    }
  ]
}
```

Each criterion requires:

- `id`
- `category`
- `requirement`
- `targets`
- `priority`
- `verification`

Allowed categories are `visual`, `flow`, `responsive`, `accessibility`, `content`,
and `interaction`.

Allowed priorities are `required` and `recommended`.

Allowed verification methods are `automated`, `visual`, and `manual`. A criterion
can use more than one method.

Targets identify views and optional states or node IDs. Requirements describe an
observable result. They do not prescribe a production framework or internal code
structure unless that choice affects the user experience.

## Assets

`assets/` contains every asset required to reproduce the approved baseline.

```text
assets/
├── images/
├── icons/
├── fonts/
└── media/
```

Rules:

- Stored filenames are content-addressed.
- The Design Document uses logical Prism asset IDs.
- The manifest maps each logical ID to a path, media type, and digest.
- Each asset has permitted use and recorded provenance outside the render document.
- No asset requires a provider API at consumption time.
- Unused assets are excluded.

## Approved previews

`previews/` contains approved visual targets. `previews/index.json` identifies each
capture.

```json
{
  "schema": "prism.preview-index.v1",
  "previews": [
    {
      "id": "sign-in-default-wide",
      "view": "sign-in",
      "state": "default",
      "viewport": "wide",
      "path": "sign-in/default-wide.webp",
      "width": 1440,
      "height": 1000,
      "digest": "sha256:...",
      "fidelity": "exact"
    }
  ]
}
```

Allowed fidelity values:

- `exact`: layout and presentation must closely match the target.
- `intent`: the target defines direction, but justified production differences are
  permitted.

Each required view, state, and viewport has a preview unless the acceptance criteria
explicitly define another verification method.

## Checksums and bundle digest

`checksums.json` lists each design, evidence, and asset member. It excludes
`checksums.json` and `manifest.json`. The manifest contains the resulting bundle
digest, so including its final bytes in the checksum list would create an
impossible self-reference. The content-addressed archive digest protects the
manifest bytes. Publication also validates every manifest reference before it
stores the archive.

```json
{
  "algorithm": "sha256",
  "files": {
    "design-document.json": "...",
    "design-specification.md": "...",
    "acceptance-criteria.json": "...",
    "assets/images/abc123.webp": "...",
    "previews/index.json": "..."
  }
}
```

The bundle digest is calculated from one canonical serialization of the checksum
list. The future machine schema must define that serialization exactly.

## Publication rules

Prism can publish a bundle only when:

1. The Design Document is valid.
2. Every document and manifest reference resolves.
3. Every required asset exists and its digest matches.
4. Required views, states, and viewports have verification evidence.
5. Every required flow has a start and reachable success path.
6. Acceptance criteria are valid.
7. No forbidden external dependency exists.
8. Every checksum and the bundle digest match.
9. The user explicitly approves publication.

After publication, Nova receives the immutable bundle through this handoff:

```json
{
  "schema": "prism.baseline-handoff.v1",
  "projectId": "user-app",
  "bundleId": "user-app-baseline",
  "bundleRevision": 1,
  "bundleDigest": "sha256:...",
  "artifact": "artifact:sha256:...",
  "summary": "Approved user application baseline with authentication, dashboard, account settings, and recovery flows."
}
```

Nova uses the digest to create the module plan and bind implementation and fidelity
evidence to the exact approved baseline.

## Excluded information

The bundle does not contain:

- conversations or draft history;
- rejected directions or research collections;
- provider records or identifiers;
- preference events or taste profiles;
- prompts or model responses;
- database records or worker logs;
- approval records or pipeline module plans;
- production source code.

These records can remain in their owning systems. They do not define the approved
pipeline baseline.
