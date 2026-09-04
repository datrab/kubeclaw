# Visual Regression User Guide

## Purpose

Use `kubeclaw.visual@1` to compare reviewed Git baselines with screenshots from a real deployed application. The test is deterministic. It does not ask an agent to decide whether pixels are acceptable.

## Configure the test

Create `.swarm/browser-profiles.json`, `.swarm/visual/baselines.json`, and the PNG files named by the manifest. Declare a blocking node in `.swarm/pipeline.json`. Select every target by its manifest ID. Use a typed deployment or public-endpoint input. Do not put credentials in the URL.

The manifest binds each image to its route, profile, browser, viewport, page conditions, and SHA-256 digest. The bundle digest binds the ordered set of image digests. If one value differs, the test returns an error before comparison.

## Masks and differences

Use masks only for small dynamic elements such as a clock. A mask belongs to one target and is stored in evidence. `strict-v1` permits no differing pixels. `balanced-v1` permits a small reviewed margin. A result inside the uncertainty margin still fails when optional agent review is not explicitly configured.

## Baseline changes

Test execution never changes a baseline. Generate a candidate in a separate trusted workflow. Review the baseline, current image, and difference. Approve the candidate through the durable human gate. A separate apply stage can then update the PNG, digest, manifest, and bundle digest in one reviewed commit.

## Evidence and failure

Each target stores baseline, current, and difference PNG evidence. The JSON report records the comparison profile, overrides, browser version, digests, masks, and measured difference. Missing files, path escape, identity mismatch, digest mismatch, browser failure, or blocked egress are execution errors. A pixel-policy violation is a failed test.

## Disablement

Remove the explicit node only through normal pipeline review. Do not use an empty target list or stale legacy `visual-reg` fields to disable the test.
