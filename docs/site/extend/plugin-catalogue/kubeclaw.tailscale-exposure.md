# kubeclaw.tailscale-exposure

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/tailscale-exposure/plugin.json; skills/buster/plugins/tailscale-exposure/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: source facts revision 7994a51e16bc752357c3a801190b12b7d6a191a4; package behavior sources revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb. Local command results and their limits appear under Package Checks.

## Purpose

Create a bounded Tailscale exposure for a Buster test target.

## When To Use It

When a remote test needs access to a private fixture, use it.

## When Not To Use It

Do not use it for permanent ingress or unrelated network access.

## Most Important Limit

It depends on Tailscale authority and must clean up the temporary exposure.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Package Reference

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.tailscale-exposure@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/tailscale-exposure/plugin.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `exposure` | `kubeclaw.tailscale-exposure@1` | `src/provider.js` | `provider` |

## test provider: exposure

Public identifier: `kubeclaw.tailscale-exposure@1`.
Global registration ID: `kubeclaw.tailscale-exposure:exposure`. This identifies the installed registration. Graphs select stage types. Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `kubernetes.exposure`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/schemas/config.schema.json)

Configuration fields: schema declarations. Defaults are annotations, not proof that the caller inserts a value.

- `retentionMode` (enumeration; optional; allowed `["release","await-readiness"]`)
- `endpointName` (referenced schema; optional; reference `#/$defs/dnsLabel`)
- `hostname` (referenced schema; optional; reference `#/$defs/dnsLabel`)
- `path` (string; optional; maxLength `1024`; pattern `^/(?:[^/?#\r\n][^?#\r\n]*)?$`)
- `readinessTimeoutSeconds` (integer; optional; minimum `1`; maximum `3600`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `exposure` |
| `contractId` | `kubeclaw.tailscale-exposure@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":true,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"}]` |
| `outputs` | `[{"name":"exposure","kind":"value","required":true,"schemaId":"kubeclaw.public-endpoint-fixture@1"}]` |
| `requiredCapabilities` | `["kubernetes.exposure"]` |
| `retrySafe` | `false` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `deployment`: value; required.

Outputs:

- `exposure`: value; required.

## Failure Behavior

The provider selects a matching deployment endpoint. Omitted endpointName requires a sole endpoint, and endpointName is not authorization. Optional hostname requests one DNS-label public hostname. path defaults to / and must be a root-relative path without //, query, fragment, NUL, CR or LF.

readinessTimeoutSeconds defaults 120, admits integers 1..3600 and is capped by invocation.timeoutMs. retentionMode defaults release. await-readiness forwards a handoff retention request and requires awaiting-readiness phase plus exposure generation in the response.

Preparation and cleanup forward the selected path, optional hostname and handoff mode to kubernetes.exposure. The actual runtime/controller owns release/handoff lifetime and reconciliation. Cleanup calls release but does not prove remote deletion. Configure fixture, Tailscale operator and Kubernetes authorities independently.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports. Discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
The selected runtime owns failure recording and lifecycle state. Package code does not gain lifecycle authority.
Adapter startup cleanup can remain pending when shutdown ignores its abort signal. Use the [startup stop rules](../../use/plugins.md#3-activate-and-prove-health).

## Package Checks

Historical local command record dated 2026-09-16.
Recorded source revision: `bcf032f241b432bf920baa9ee5f727947921447d`.
Recorded environment: `Linux workspace with Node.js 24 and BusyBox userland`.
Recorded result: `passed`.

Exact reason from that historical record:

> The package-local command completed with exit code 0.

This historical quotation is not a current package-availability or readiness result.
The next section gives the current command or no-command declaration.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/tailscale-exposure
```

Package test files found: 1. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts
```

Local package checks do not prove live host or cluster readiness.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/buster/plugins/tailscale-exposure/plugin.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/plugin.json)
- Package implementation guide: [skills/buster/plugins/tailscale-exposure/README.md](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/README.md)
- Module for `exposure`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/src/provider.js)
- Test: [skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts)
