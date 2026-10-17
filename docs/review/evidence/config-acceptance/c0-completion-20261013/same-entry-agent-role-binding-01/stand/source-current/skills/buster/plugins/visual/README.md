# Visual Regression Provider

`kubeclaw.visual@1` captures real browser screenshots and compares them with
reviewed Git-managed baselines. Each manifest entry binds the route, named
browser profile, baseline file, image digest, browser family and captured version, viewport, and page
conditions.

Use `kubeclaw.visual-baselines.v2`; v1 requires an explicitly reviewed recapture.
The exact browser version must match before pixel comparison. See the
[upgrade procedure](../../../../docs/architecture/pipeline-test-gate-visual-operator-guide.md).

The provider uses the brokered `browser.visual` capability. It cannot start a
browser or access the network directly. Operator policy controls origins,
browsers, executable paths, concurrency, time, masks, compressed PNG bytes,
decoded pixel memory, and evidence size.

The provider never changes a baseline. A missing baseline, digest mismatch, or
identity mismatch is an execution error. Baseline, current, difference, and
summary files remain evidence.

Run the real browser verification with:

```bash
npm test --prefix skills/buster/plugins/visual
```
