# kubeclaw.security-providers

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/security-providers/plugin.json; skills/buster/plugins/security-providers/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Run HTTP, dependency, image, policy, and runtime security checks in Buster.

## When To Use It

Use it when a test plan needs one of the five declared security contracts.

## When Not To Use It

Do not treat one provider result as a complete security assessment.

## Most Important Limit

Each provider covers a separate evidence source and execution environment.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.security-providers@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/security-providers/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `headers` | `kubeclaw.security-headers@1` | `src/headers.js` | `provider` |
| test provider | `dependency-trivy` | `kubeclaw.dependency-scan-trivy@1` | `src/dependency.js` | `provider` |
| test provider | `image-trivy` | `kubeclaw.image-scan-trivy@1` | `src/image.js` | `provider` |
| test provider | `kubernetes-policy` | `kubeclaw.kubernetes-policy-security@1` | `src/kubernetes-policy.js` | `provider` |
| test provider | `kubernetes-runtime` | `kubeclaw.kubernetes-runtime-security@1` | `src/kubernetes-runtime.js` | `provider` |

## test provider: headers

Public identifier: `kubeclaw.security-headers@1`.
Global registration ID: `kubeclaw.security-providers:headers`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `network.http`

Provided capabilities: None.

Configuration schema: [schemas/headers.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/schemas/headers.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `profile` (enumeration; required; allowed `["web-https-v1","api-http-v1"]`)
- `paths` (array; required; minItems `1`; maxItems `32`)
- `requestTimeoutMs` (integer; optional; minimum `1`; maximum `300000`)
- `rules` (object; optional)
- `policy` (referenced schema; required; reference `#/$defs/policy`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `headers` |
| `contractId` | `kubeclaw.security-headers@1` |
| `module` | `src/headers.js` |
| `export` | `provider` |
| `configSchema` | `schemas/headers.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":true,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["network.http"]` |
| `retrySafe` | `true` |
| `matrixFields` | `["path"]` |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `deployment`: value; required.

## test provider: dependency-trivy

Public identifier: `kubeclaw.dependency-scan-trivy@1`.
Global registration ID: `kubeclaw.security-providers:dependency-trivy`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `security.scan`

Provided capabilities: None.

Configuration schema: [schemas/dependency.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/schemas/dependency.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `projectDirectory` (string; required; minLength `1`; maxLength `4096`)
- `timeoutMs` (integer; optional; minimum `1000`; maximum `900000`)
- `policy` (referenced schema; required; reference `#/$defs/policy`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `dependency-trivy` |
| `contractId` | `kubeclaw.dependency-scan-trivy@1` |
| `module` | `src/dependency.js` |
| `export` | `provider` |
| `configSchema` | `schemas/dependency.schema.json` |
| `inputs` | Empty list. |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["security.scan"]` |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

## test provider: image-trivy

Public identifier: `kubeclaw.image-scan-trivy@1`.
Global registration ID: `kubeclaw.security-providers:image-trivy`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `security.scan`

Provided capabilities: None.

Configuration schema: [schemas/image.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/schemas/image.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `timeoutMs` (integer; optional; minimum `1000`; maximum `900000`)
- `policy` (referenced schema; required; reference `#/$defs/policy`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `image-trivy` |
| `contractId` | `kubeclaw.image-scan-trivy@1` |
| `module` | `src/image.js` |
| `export` | `provider` |
| `configSchema` | `schemas/image.schema.json` |
| `inputs` | `[{"name":"image","kind":"value","required":true,"schemaId":"kubeclaw.container-image@1"}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["security.scan"]` |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `image`: value; required.

## test provider: kubernetes-policy

Public identifier: `kubeclaw.kubernetes-policy-security@1`.
Global registration ID: `kubeclaw.security-providers:kubernetes-policy`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `security.scan`

Provided capabilities: None.

Configuration schema: [schemas/kubernetes-policy.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `timeoutMs` (integer; optional; minimum `1000`; maximum `300000`)
- `policy` (referenced schema; required; reference `#/$defs/policy`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `kubernetes-policy` |
| `contractId` | `kubeclaw.kubernetes-policy-security@1` |
| `module` | `src/kubernetes-policy.js` |
| `export` | `provider` |
| `configSchema` | `schemas/kubernetes-policy.schema.json` |
| `inputs` | `[{"name":"checked-manifest","kind":"artifact","required":true,"mediaTypes":["application/vnd.kubeclaw.checked-kubernetes-yaml"]}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["security.scan"]` |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `checked-manifest`: artifact; required.

## test provider: kubernetes-runtime

Public identifier: `kubeclaw.kubernetes-runtime-security@1`.
Global registration ID: `kubeclaw.security-providers:kubernetes-runtime`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `kubernetes.runtime-security`

Provided capabilities: None.

Configuration schema: [schemas/kubernetes-runtime.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `timeoutMs` (integer; optional; minimum `1000`; maximum `300000`)
- `policy` (referenced schema; required; reference `#/$defs/policy`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `kubernetes-runtime` |
| `contractId` | `kubeclaw.kubernetes-runtime-security@1` |
| `module` | `src/kubernetes-runtime.js` |
| `export` | `provider` |
| `configSchema` | `schemas/kubernetes-runtime.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":true,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"},{"name":"checked-manifest","kind":"artifact","required":true,"mediaTypes":["application/vnd.kubeclaw.checked-kubernetes-yaml"]}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["kubernetes.runtime-security"]` |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `deployment`: value; required.
- `checked-manifest`: artifact; required.

## Failure Behavior

Each security registration has its own inputs and capability. Unknown rules and malformed capability results fail validation. Trivy tests require a usable local vulnerability database; no database means no vulnerability verdict.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `content-written`.
Recorded local command result on 2026-09-16: `unavailable`.

The command requires a real Trivy cache and executable, which are absent on this host.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/security-providers
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node --test tests/live-function.test.ts tests/database-freshness.test.mts
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/buster/plugins/security-providers/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/plugin.json)
- Authored package guide: [skills/buster/plugins/security-providers/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/README.md)
- Module for `headers`: [src/headers.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/src/headers.js)
- Module for `dependency-trivy`: [src/dependency.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/src/dependency.js)
- Module for `image-trivy`: [src/image.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/src/image.js)
- Module for `kubernetes-policy`: [src/kubernetes-policy.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/src/kubernetes-policy.js)
- Module for `kubernetes-runtime`: [src/kubernetes-runtime.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/src/kubernetes-runtime.js)
- Test: [skills/buster/plugins/security-providers/tests/database-freshness.test.mts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/tests/database-freshness.test.mts)
- Test: [skills/buster/plugins/security-providers/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/security-providers/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
