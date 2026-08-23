# Test A Plugin

Status: implemented
Audience: plugin author, maintainer
Owner: plugin-foundation
Evidence: scripts/verify-plugin-packages.mjs; tests/verification/contracts/check-plugin-system-v2-boundaries.mjs
Applies to: pipeline-plugin-v2
Last verified: generated during publication

## Purpose

Plugin verification must prove package behavior and platform boundaries.

## Required Proof

- Validate the manifest and every referenced schema.
- Resolve each declared module and export.
- Test granted and denied capabilities.
- Test timeout, cancellation, retry safety, and cleanup where applicable.
- Test idempotent behavior across replay or restart where applicable.
- Prove that the package imports no private core file.

## Commands

```bash
npm run verify:plugin-packages
npm run verify:plugin-live-capabilities
npm run verify:plugin-system-v2
```

Use the package-specific command on its generated catalogue page during development.
