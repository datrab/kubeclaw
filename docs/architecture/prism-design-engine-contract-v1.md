# Prism Design Engine Contract v1

Status: accepted architecture contract

## Purpose and boundary

The Prism Design Engine runs above the existing neutral worker core. Worker-core
owns transport, attempt lifecycle, identity, claims, limits, progress, logs,
cancellation, evidence transport, cleanup, health, capacity, generic failures,
telemetry, result digests, and receipts.

The Design Engine owns design-specific requests, results, validation, policy,
orchestration, and tools. No Prism type or policy enters the worker-core packages.

```text
Nova
  -> generic worker-core attempt
       -> opaque specialist request
            -> Prism Design Engine
                 -> design operation and result
       -> generic evidence, telemetry, receipt, and lifecycle result
```

## Engine identity

Prism uses the existing worker profile:

```json
{
  "engineId": "prism-design-engine",
  "contractId": "kubeclaw.prism-design-engine@1",
  "engineVersion": "1.0.0",
  "contentDigest": "sha256:..."
}
```

- `engineId` is the stable engine name.
- `contractId` identifies the major engine contract.
- `engineVersion` identifies the deployed implementation.
- `contentDigest` identifies the exact engine package.

The contract major changes only for incompatible request or result changes. The
implementation version can change for compatible features and fixes.

## Worker-core binding

Prism defines one discriminated request schema:

```text
prism.design-engine-request.v1
```

Worker-core carries it through the existing `specialistOperation`:

```json
{
  "contractId": "kubeclaw.prism-design-engine@1",
  "inputSchemaId": "prism.design-engine-request.v1",
  "inputSchemaDigest": "sha256:...",
  "values": {
    "operation": "render",
    "parameters": {}
  }
}
```

Prism defines one discriminated result schema:

```text
prism.design-engine-result.v1
```

Worker-core carries it through the existing `workerSpecialistResult`:

```json
{
  "schemaId": "prism.design-engine-result.v1",
  "schemaDigest": "sha256:...",
  "values": {
    "operation": "render"
  }
}
```

Both schemas reject unknown fields. The operation discriminator selects one strict
request or result shape.

## Artifact references

Large inputs use the existing worker-core `inputs` array. For example:

```json
{
  "name": "design-document",
  "kind": "artifact",
  "artifact": {
    "artifactId": "document-12",
    "type": "prism-design-document",
    "mediaType": "application/json",
    "contentDigest": "sha256:...",
    "sizeBytes": 48212,
    "storageUrl": "artifact-storage-uri"
  }
}
```

The Prism request refers to the input by name:

```json
{
  "documentInput": "design-document"
}
```

Prism verifies that the named input exists, has the expected kind and media type,
matches its digest, and conforms to the expected Prism schema after retrieval.
Complete documents, images, corpus objects, previews, and bundles do not appear in
`operation.values`.

## Operations

The v1 Design Engine has five operations:

```text
generate
render
evaluate
ingest
publish
```

### Generate

`generate` creates design directions, creates the first Design Document, or refines
an existing document.

Request:

```json
{
  "operation": "generate",
  "parameters": {
    "mode": "directions",
    "designRequestInput": "design-request",
    "currentDocumentInput": null,
    "instruction": "Create three distinct directions for the approved product architecture.",
    "scope": {
      "views": [],
      "components": [],
      "flows": []
    },
    "directionCount": 3,
    "seed": "direction-set-01"
  }
}
```

Required fields are `mode`, `designRequestInput`, `instruction`, `scope`, and `seed`.
`currentDocumentInput` and `directionCount` are conditional fields.

Allowed modes are:

- `directions`
- `document`
- `refine`

Rules:

- `currentDocumentInput` is required for `refine`.
- `directionCount` is valid only for `directions`.
- Direction count defaults to three and is limited to one through five.
- An empty scope means the complete experience.
- Scope IDs must resolve when Prism refines a document.
- `seed` distinguishes an intentional creative variation from a transport retry.

Direction result:

```json
{
  "operation": "generate",
  "mode": "directions",
  "directions": [
    {
      "id": "calm-technical",
      "title": "Calm technical workspace",
      "summary": "Dense operational information with restrained presentation.",
      "evidenceId": "direction-calm-technical"
    }
  ],
  "summary": "Created three distinct directions."
}
```

Document or refinement result:

```json
{
  "operation": "generate",
  "mode": "refine",
  "document": {
    "evidenceId": "design-document-13",
    "schema": "prism.design-document.v1",
    "revision": 13,
    "digest": "sha256:..."
  },
  "changed": {
    "views": ["dashboard"],
    "components": ["deployment-row"],
    "flows": []
  },
  "summary": "Increased dashboard density while retaining navigation."
}
```

A successful document generation or refinement returns one complete immutable
document revision. A patch is not the canonical result.

### Render

`render` produces deterministic prototype evidence.

Request:

```json
{
  "operation": "render",
  "parameters": {
    "documentInput": "design-document",
    "targets": [
      {
        "view": "sign-in",
        "state": "error",
        "viewport": "wide"
      }
    ],
    "outputs": {
      "screenshots": true,
      "prototype": true,
      "accessibilityTree": true,
      "layoutEvidence": true
    }
  }
}
```

Each target requires a view, state, and one of `compact`, `regular`, or `wide`.
Duplicate targets are rejected. At least one output must be enabled.

The deployed renderer pins browser, fonts, locale, timezone, mock seed, animation
policy, and device scale. Requests cannot supply arbitrary browser flags or code.

Result:

```json
{
  "operation": "render",
  "renderer": {
    "id": "prism-studio-renderer",
    "version": "1.0.0",
    "environmentDigest": "sha256:..."
  },
  "captures": [
    {
      "view": "sign-in",
      "state": "error",
      "viewport": "wide",
      "screenshotEvidenceId": "sign-in-error-wide",
      "accessibilityEvidenceId": "sign-in-error-wide-a11y",
      "layoutEvidenceId": "sign-in-error-wide-layout"
    }
  ],
  "prototypeEvidenceId": "interactive-prototype",
  "summary": "Rendered one target."
}
```

Actual files use worker-core evidence references.

### Evaluate

`evaluate` analyzes a document and optional render evidence.

Request:

```json
{
  "operation": "evaluate",
  "parameters": {
    "documentInput": "design-document",
    "previewIndexInput": "preview-index",
    "checks": [
      "schema",
      "completeness",
      "accessibility",
      "consistency",
      "visual-quality"
    ]
  }
}
```

`documentInput` and `checks` are required. `previewIndexInput` is required for
render-dependent checks.

Allowed checks are:

- `schema`
- `completeness`
- `accessibility`
- `consistency`
- `visual-quality`

Result:

```json
{
  "operation": "evaluate",
  "passed": false,
  "counts": {
    "info": 1,
    "warning": 2,
    "error": 1
  },
  "findings": [
    {
      "id": "missing-auth-recovery",
      "check": "completeness",
      "severity": "error",
      "message": "The authentication failure has no recovery path.",
      "target": {
        "kind": "flow",
        "id": "authentication"
      },
      "suggestion": "Connect the error state to the password recovery flow."
    }
  ],
  "reportEvidenceId": "design-evaluation-report",
  "summary": "Publication is blocked by one completeness error."
}
```

Allowed severities are `info`, `warning`, and `error`. Errors block publication.
Warnings require review. Prism quality findings do not count as user-preference
evidence.

### Ingest

`ingest` normalizes one source into one Prism-owned corpus item.

Request:

```json
{
  "operation": "ingest",
  "parameters": {
    "contentInput": "captured-reference",
    "source": {
      "kind": "public-web",
      "capturedAt": "2026-08-12T20:00:00Z"
    },
    "rights": {
      "retention": "analysis-only",
      "retainOriginal": false,
      "validUntil": null
    }
  }
}
```

Allowed initial source kinds are `public-web`, `open-source`, `design-system`,
`internal-project`, `user-upload`, `generated`, and `provider-research`.

Allowed retention states are `full`, `derived`, `analysis-only`, `temporary`, and
`forbidden`.

Rules:

- One attempt processes one logical source item.
- Provider locators remain at the ingestion boundary.
- Corpus identities are Prism-owned.
- `forbidden` records rejection but stores no source content.
- `analysis-only` stores normalized observations but not the original.
- Batch ingestion coordinates several attempts rather than defining another engine
  operation.

Result:

```json
{
  "operation": "ingest",
  "corpusItem": {
    "id": "reference-01",
    "revision": 1,
    "digest": "sha256:..."
  },
  "stored": {
    "original": false,
    "derivedAssets": false,
    "analysis": true,
    "embedding": true
  },
  "analysisEvidenceId": "reference-01-analysis",
  "summary": "Stored normalized analysis without the original source."
}
```

The detailed corpus model is defined in architecture workstream 4.

### Publish

`publish` validates and creates one immutable Baseline Bundle.

Request:

```json
{
  "operation": "publish",
  "parameters": {
    "documentInput": "design-document",
    "specificationInput": "design-specification",
    "acceptanceCriteriaInput": "acceptance-criteria",
    "previewIndexInput": "preview-index",
    "approval": {
      "approvalId": "approval-01"
    }
  }
}
```

Rules:

- The approval ID resolves through a trusted capability.
- The request cannot assert the approving user.
- Approval binds to the exact input digests.
- All publication gates must pass.
- The attempt requires `design.baseline.publish`.
- Identical approved inputs produce the same bundle digest.

Result:

```json
{
  "operation": "publish",
  "handoff": {
    "schema": "prism.baseline-handoff.v1",
    "projectId": "user-app",
    "bundleId": "user-app-baseline",
    "bundleRevision": 1,
    "bundleDigest": "sha256:...",
    "evidenceId": "approved-baseline-bundle",
    "summary": "Approved user application baseline."
  }
}
```

The actual bundle is returned as worker-core evidence.

## Generic fields not repeated by Prism

The Design Engine result does not repeat:

- attempt or worker identity;
- lifecycle state;
- start and completion timestamps;
- resource usage and generic limits;
- evidence artifact metadata;
- cleanup state;
- exit code or signal;
- result digest or receipt.

Worker-core owns these fields.

## Errors

Failed operations use the existing worker-core error field and have no specialist
result. Prism uses this small code set:

```text
PRISM_INPUT_INVALID
PRISM_SCHEMA_UNSUPPORTED
PRISM_REFERENCE_MISSING
PRISM_POLICY_DENIED
PRISM_RIGHTS_DENIED
PRISM_RENDER_FAILED
PRISM_EVALUATION_BLOCKED
PRISM_APPROVAL_INVALID
PRISM_PUBLICATION_BLOCKED
PRISM_DEPENDENCY_UNAVAILABLE
PRISM_INTERNAL_ERROR
```

Input, schema, policy, rights, approval, and evaluation-blocked failures are not
retryable without changed inputs. Dependency failures can be retried. Render and
internal failures are retryable only when the operation can safely repeat.

Messages must not include secrets, credentials, prompts, or private provider data.

## Validation boundary

### Nova or dispatch plugin

Before dispatch, validate:

- the engine contract is installed and permitted;
- the request matches the Prism request schema;
- named inputs exist;
- required capabilities are granted;
- limits comply with pipeline policy;
- approval exists before a publish attempt is created.

### Worker-core

Worker-core validates only generic facts:

- worker profile and engine contract match;
- contract and schema digests match the frozen attempt;
- claim and worker identity are valid;
- inputs, limits, and capabilities match the neutral protocol;
- deadline and cancellation state permit execution.

Worker-core does not interpret Prism fields.

### Prism Design Engine

Prism validates:

- operation-specific fields;
- artifact kinds, media types, digests, and contents;
- Design Document and Baseline Bundle schemas;
- cross-document references;
- rights and retention policy;
- design-specific capabilities;
- publication gates and approval binding.

## Capabilities

Each operation requires one direct capability:

| Operation | Required capability |
| --- | --- |
| `generate` | `design.generate` |
| `render` | `design.render` |
| `evaluate` | `design.evaluate` |
| `ingest` | `design.corpus.ingest` |
| `publish` | `design.baseline.publish` |

Supporting provider, object-storage, and database access uses narrower internal
capabilities. A design operation does not grant unrestricted network or corpus
access.

## Idempotency

Every operation is safe to retry.

### Generate identity

```text
operation + mode + input digests + normalized instruction + scope
+ engine digest + seed
```

A transport retry reuses the result. An intentional creative variation uses a new
seed or logical request.

### Render identity

```text
document digest + targets + output selection + renderer environment digest
```

### Evaluate identity

```text
document digest + preview digest + check set + evaluator version
```

### Ingest identity

```text
source content digest + rights policy + normalization schema
+ analyzer version + embedding version
```

A changed analyzer creates a new corpus-item revision rather than a duplicate item.

### Publish identity

The complete approved dependency closure defines publication identity. Identical
inputs return the existing bundle. A changed input requires new approval and creates
a new bundle revision.

## Progress

Prism uses worker-core progress events. The bounded `details` object can contain:

```json
{
  "stage": "rendering",
  "completed": 3,
  "total": 8
}
```

Recommended stages are `validating`, `researching`, `generating`, `rendering`,
`evaluating`, `ingesting`, `publishing`, and `finalizing`.

Progress is informative. Durable output exists only in the result and evidence.

## Required binding tests

1. A valid Prism request fits unchanged in `specialistOperation.values`.
2. Worker-core accepts the Prism contract without importing Prism types.
3. Worker-core rejects an invalid contract or schema digest generically.
4. Prism rejects an unknown operation or field.
5. Named artifact inputs must exist and match expected kinds, media types, and
   digests.
6. Every operation requires its declared capability.
7. Cancellation reaches long-running generation, rendering, and ingestion.
8. Large artifacts remain outside `operation.values`.
9. Successful output fits in `workerSpecialistResult.values`.
10. Evidence uses only worker-core evidence references.
11. Failed Prism work uses worker-core `error` and has no specialist result.
12. Transport retry does not create a second design revision or bundle.
13. Identical render inputs produce identical evidence digests.
14. No Prism type or schema is imported by worker-core packages.
15. A claimed approval identity in the request cannot authorize publication.
16. Buster and Prism use the same core without sharing engine contracts.

The machine JSON Schemas, representative fixtures, and these binding tests are
implementation artifacts. They must follow this accepted architecture contract.
