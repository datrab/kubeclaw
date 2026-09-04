# Prism visual baseline conventions

Prism supplies approved design targets. The visual test provider compares the deployed application with reviewed PNG baseline files.

## Authority boundary

- Prism supplies approved target identity and design intent.
- Git stores the reviewed baseline manifest, shared browser profiles, and PNG files.
- `kubeclaw.visual@1` captures and compares the deployed application.
- The test provider cannot create or replace a baseline.
- A human must review and apply every baseline change in a separate workflow.

## Required files

Store these files in the project repository:

```text
.swarm/
├── browser-profiles.json
└── visual/
    ├── baselines.json
    └── images/
        ├── setup-desktop.png
        └── home-desktop.png
```

`browser-profiles.json` uses `kubeclaw.browser-profiles.v1`. Each named profile fixes the browser, viewport, color scheme, reduced-motion setting, locale, time zone, scale, and mobile conditions.

`visual/baselines.json` uses `kubeclaw.visual-baselines.v1`. Each entry records:

- a stable target ID;
- an origin-local route;
- one named browser profile;
- the baseline PNG path and SHA-256 digest;
- the browser, viewport, and page conditions.

The manifest can also record a digest for the complete baseline image set. The provider verifies all identities and digests before capture.

## Provider declaration

Declare the visual node in `.swarm/pipeline.json`:

```json
{
  "uses": "kubeclaw.visual@1",
  "needs": ["deployment"],
  "inputs": {
    "deployment": {
      "from": "deployment",
      "output": "deployment"
    }
  },
  "config": {
    "manifestFile": ".swarm/visual/baselines.json",
    "profileFile": ".swarm/browser-profiles.json",
    "targets": ["setup-desktop", "home-desktop"],
    "comparisonProfile": "strict-v1"
  }
}
```

The deployment fixture supplies the allowed application origin. Do not put credentials, query-based authentication bypasses, or an arbitrary URL in a Prism handoff.

## Stable capture rules

The Buster browser capability:

1. opens only the typed deployment or public endpoint origin;
2. blocks service workers, WebSockets, WebRTC, and cross-origin subresources;
3. waits for network readiness;
4. disables animation, transition, and caret rendering;
5. applies only target-specific masks from the provider declaration;
6. takes a full-page PNG with a pinned real browser build;
7. stores baseline, current, difference, and structured report evidence.

Masks are for data that cannot be made stable. Keep each mask narrow. The report records every applied selector.

## Baseline change workflow

Test execution never changes Git baselines.

1. Create candidate images with a separate maintainer tool or reviewed browser session.
2. Update the manifest digests and identities.
3. Review each old image, candidate image, and difference image.
4. Approve the change through the normal durable human gate.
5. Apply and commit the approved PNG and manifest changes.
6. Run `kubeclaw.visual@1` against the committed state.

Discord and other notification systems can deliver evidence links. They cannot approve a baseline or change the test verdict.

## Prism handoff

`toBusterPlan` returns a `kubeclaw.visual@1` declaration and the selected target metadata. The approved Prism bundle digest remains part of the handoff. The application pipeline must use the reviewed Git manifest and profiles before it executes the node.

Legacy `visual-reg`, `paths.json`, direct screenshot scripts, and automatic baseline generation are retired.
