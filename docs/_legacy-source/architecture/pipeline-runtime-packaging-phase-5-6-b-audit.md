# Pipeline Runtime Packaging Phase 5.6-B Audit

Status: complete

## Purpose

Phase 5.6-B replaces the mixed runtime core with real source packages.

## Result

Each implementation now has one owner:

- `plugin-foundation` contains role-neutral registry and isolation functions.
- `nova-core` contains orchestration and pipeline policy.
- `worker-core` contains neutral attempt execution.
- `buster-engine` contains test execution meaning.

The move did not copy implementation files. The old mixed core path does not
exist. Package manifests state the allowed dependencies.

The Nova surface does not export worker or Buster authority. The worker
surface does not export Nova or Buster authority. The Buster surface uses the
worker core and does not export Nova authority.

## Proof

Run:

```bash
node scripts/check-runtime-package-ownership.mjs
node tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts
node tests/verification/contracts/check-plugin-system-v2-boundaries.mjs
```

The existing provider registry, suite resolver, test-plan runner, and worker
proofs also pass after the move.

Independent review used Codex `gpt-5.6-terra` with high reasoning. It found two
accepted integration issues. The deployment proof used the old CLI path. The
new packages also used repository-relative imports. Both issues were fixed.
The final review was clean.

## Next Step

Phase 5.6-C creates role manifests. A manifest will select packages and
plugins for one runtime.
