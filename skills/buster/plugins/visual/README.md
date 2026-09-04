# Visual Regression Provider

`kubeclaw.visual@1` captures real browser screenshots and compares them with
reviewed Git-managed baselines. Each manifest entry binds the route, named
browser profile, baseline file, image digest, browser, viewport, and page
conditions.

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
