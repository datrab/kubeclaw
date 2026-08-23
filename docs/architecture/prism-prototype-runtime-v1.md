# Prism Prototype Runtime v1

Status: accepted architecture contract

## Decision

Prism executes a trusted pinned renderer with untrusted validated data. It does not
execute generated application code.

```text
Studio editor
  -> validated Design Document
  -> trusted prototype runtime
       ├── immutable runtime profile
       ├── approved component packs
       ├── one theme pack
       ├── optional behavior packs
       ├── deterministic mock state machine
       └── isolated preview frame
```

The runtime is easy by default, horizontally scalable, and customizable through
versioned contracts. Customization expands design vocabulary, not runtime authority.

## Default path

A project works without runtime configuration:

```text
Design Document
  -> Prism core component pack
  -> default theme and behavior
  -> Studio preview
```

Prism owns safe defaults for the component catalog, mock behavior, responsive rules,
security policy, resource limits, preview protocol, renderer, and capture profiles.

## Accepted inputs

The runtime accepts:

- valid Design Documents;
- Prism-owned content-addressed artifacts;
- bounded JSON mock data;
- declarative flows and scenarios;
- installed component, theme, and behavior packs;
- approved node types and property values.

It rejects JavaScript, TypeScript, JSX, arbitrary HTML or CSS, shell commands,
production API calls, dynamic packages, inline event handlers, raw external URLs,
production credentials, and arbitrary browser-storage or network access.

## Trust boundary

Trusted, versioned runtime code includes Studio, the Puck adapter, prototype renderer,
component catalog, property schemas, flow interpreter, validator, artifact resolver,
preview protocol, and installed reviewed pack implementations.

Generated documents, text, mock data, assets, flow data, design instructions, and
imported content remain untrusted and are validated and bounded before use.

## Mock state machine

Runtime state is limited to current view, state, viewport, flow, step, scenario,
ephemeral input values, declared mock data, and overlay state.

```text
activate declared node action
  -> find valid transition from current view/state
  -> apply declared deterministic response
  -> move to target view/state
  -> emit bounded runtime event
```

There is no expression language or general application state library. Named scenarios
select deterministic success, error, recovery, or other branches. The same document,
scenario, and mock seed produce the same behavior.

Input validation is declarative. Complex validation results are represented as named
states and transitions rather than executable validators.

## Mock data

Mock data is bounded JSON with no expressions, secrets, real personal data, or remote
references. Approved data references use the Design Document's simple path syntax.
Synthetic values are clearly fictional where confusion is possible.

## Trusted component runtime

Each node type maps to one installed trusted renderer. Unknown types fail closed and
block the affected target rather than silently substituting another component.

Puck edits a projection. Puck actions pass through the accepted typed Prism operation
adapter. Complete Puck client state is never canonical.

Puck plugins are disabled by default. An enabled plugin must be digest-pinned, shipped
in the trusted Studio build, permission-declared, mapped to Prism operations, and
reviewed as runtime code. V1 has no user-installed plugins.

## Isolated preview

The prototype renders in an opaque-origin sandboxed iframe using only the permissions
required for bundled script execution. It receives no same-origin, form, popup,
top-navigation, download, camera, microphone, geolocation, or direct clipboard
authority.

Studio and preview communicate through `prism-preview.v1` messages. Each message has a
session ID, monotonic sequence, type, and bounded payload. Both sides validate schema,
source window, session, sequence, size, and rate. Unknown messages fail closed. No
credential crosses this protocol.

The preview reports node boxes and permitted actions. Studio renders selection and
drop overlays outside the iframe. Runtime coordinates remain evidence and never become
Design Document layout values.

## Artifact delivery and browser policy

The runtime resolves only Prism artifact IDs through verified manifests and digests.
It enforces media types, sizes, image decode limits, safe content disposition, font
allowlists, and media policy. Active SVG is rejected or converted through an approved
sanitization path.

Preview Content Security Policy denies everything except the exact bundled renderer,
approved styles, and controlled artifact media. It denies arbitrary connections,
frames, objects, base URLs, and form actions.

Prototype links emit declared actions. They cannot navigate the Studio window. Copy,
terminal, and command behavior is simulated; no command executes and preview clipboard
authority is unnecessary.

## Runtime profiles and customization packs

Prism composes installed packs into one immutable runtime profile.

### Component pack

```json
{
  "schema": "prism.component-pack.v1",
  "id": "forge-product-ui",
  "version": "1.0.0",
  "components": [
    {
      "type": "deployment-card",
      "renderer": "DeploymentCard",
      "propertySchema": "deployment-card.v1",
      "allowedChildren": [],
      "capabilities": ["move", "duplicate", "delete", "edit-properties"]
    }
  ]
}
```

Component packs add reviewed components, layouts, charts, navigation, domain widgets,
and terminal parts. Implementations are compiled into trusted renderer packages; they
are not dynamically loaded from project data.

### Theme pack

One theme pack supplies semantic colors, typography, space, radius, shadow, and motion
without changing component or runtime contracts.

### Behavior pack

Behavior packs supply declarative reusable scenarios, flow templates, validation
states, and deterministic system responses. They contain no JavaScript.

### Runtime profile

```json
{
  "profileId": "runtime-profile-01",
  "componentPacks": ["prism-core@1", "forge-product-ui@1"],
  "themePack": "forge-dark@1",
  "behaviorPacks": ["standard-authentication@1"],
  "contentDigest": "sha256:...",
  "rendererDigest": "sha256:...",
  "componentCatalogDigest": "sha256:..."
}
```

Baseline Bundles record the exact profile and digests required for reproduction.

## Extension trust levels

1. Project configuration selects installed themes, components, scenarios, viewports,
   rules, and visible features using data only.
2. Installed packs add reviewed compiled components or renderer behavior through a
   deployment update.
3. A new runtime class, such as arbitrary generated code, WebGL, or native rendering,
   requires a separate architecture and security decision.

Project configuration cannot expand iframe permissions, network access, packages,
Kubernetes authority, or executable behavior.

## Deterministic capture

Studio preview and the Prism capture worker use the same catalog and rendering
protocol. Capture pins renderer, browser, catalog, fonts, locale, timezone, time,
seed, scenario, animation policy, device scale, and viewport.

Dynamic time, random IDs, cursors, carets, animation frames, media positions, and
font-loading variance are frozen or masked. Worker capture is authoritative for
approval evidence; interactive browser preview is convenience.

## Resource limits

Runtime policy bounds document bytes and depth, nodes and children, states and
transitions, mock data and text, images and decoded media, fonts, render time, message
rate, and layout evidence. Failure is explicit and never publishes a partial revision.

## Scaling model

```text
stateless Studio replicas
  -> stateless Prism API replicas
  -> PostgreSQL and artifact store
  -> horizontally scalable Prism worker pools
```

Interactive render sessions are reconstructible from a Design Document revision and
local session state. Capture attempts are independent and identify document, runtime
profile, target, viewport, scenario, and render configuration by digest.

Rendering and corpus ingestion can scale in separate worker pools without changing
worker-core or Design Engine contracts.

The artifact interface remains stable when its backend moves to S3-compatible or
replicated storage. PostgreSQL can add pooling, replicas, partitioning, or isolated
retrieval workloads behind the accepted interfaces.

## Caches

Validated documents, resolved runtime profiles, thumbnails, retrieval results, and
pack metadata can use optional digest-keyed caches. Caches are never required for
correctness and can be deleted without data loss.

## Pack migrations

A pack upgrade provides a deterministic migration that reads a validated document and
creates a new draft revision with changed nodes and properties, comparison evidence,
and review. Published baselines are never rewritten.

## Failure behavior

- Invalid documents and unknown nodes fail closed and preserve the last valid revision.
- Preview crash restarts the frame without changing canonical state.
- Runtime timeout terminates the target.
- Message violation closes the session.
- Asset failure blocks publication.
- Renderer mismatch marks previews stale.
- Pack updates never alter existing runtime profiles in place.

## Generated-code boundary

V1 never runs arbitrary generated React, HTML, or JavaScript. A future generated-code
runtime requires a disposable workload with no service token or secrets, restricted
egress, read-only root, capability drop, syscall confinement, resource limits, short
lifetime, and a separate origin. It never replaces the safe Design Document renderer.

## Required proof

Tests must prove escaping and non-execution, fail-closed component behavior, URL and
network denial, iframe isolation, safe asset handling, document and message limits,
flow declaration enforcement, non-executing terminal behavior, deterministic capture,
crash recovery, runtime-profile immutability, pack migration safety, and exact renderer
and catalog version binding.
