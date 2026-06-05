# Tests layout

This directory is the long-term home for repo-owned test and verification code.

## Direction

Verification harnesses should live under `tests/`, not under `scripts/`.
During the transition, `scripts/*.mjs` may remain as thin compatibility entrypoints that forward into the real implementations here.

## Planned structure

```text
tests/
  skills/
  verification/
    lib/
    runtime/
    contracts/
    behavior/
```

## Boundary rule

- `scripts/` = operator/deployment utilities and temporary compatibility shims
- `tests/skills/` = Node unit tests for code that runtime-packages from `skills/`
- `tests/` = verification, contract guards, fixtures, and harness logic

## Migration rule

Moves into `tests/` should be mechanical:
- preserve command behavior first
- keep wrapper entrypoints in `scripts/` during transition
- update docs only after wrappers exist
- only remove wrappers in a later cleanup pass
