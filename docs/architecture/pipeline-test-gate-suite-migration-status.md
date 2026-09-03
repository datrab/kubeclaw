# Test-Suite Migration Status

This page is generated from `pipeline-test-gate-suite-migration-status.json`.
Do not edit this page directly.

## Summary

- Replacement implemented: 8 of 13.
- Parity proved: 2 of 13.
- Source cutover complete: 8 of 13.
- Cut over and deleted: 2 of 13.

## Suites

| Old suite | Successor | Implementation | Parity | Source cutover | Production acceptance | Cutover |
| --- | --- | --- | --- | --- | --- | --- |
| `unit` | `kubeclaw.direct-command@1` | complete | in-progress | complete | pending | in-progress |
| `manifest` | `lint:kubernetes-policy` | complete | complete | complete | not required | complete |
| `build` | `kubeclaw.container-build@1` | complete | in-progress | complete | pending | in-progress |
| `bundle` | `kubeclaw.size-budget@1` | complete | complete | complete | not required | complete |
| `k8s` | `kubeclaw.kubernetes-fixture@1` | complete | in-progress | complete | pending | in-progress |
| `health` | `kubeclaw.http@1` | complete | in-progress | complete | pending | in-progress |
| `tailscale-preview` | `kubeclaw.tailscale-exposure@1` | complete | in-progress | complete | pending | in-progress |
| `api` | `kubeclaw.api-suite@1` | complete | in-progress | complete | pending | in-progress |
| `a11y` | `kubeclaw.axe@1` | pending | pending | pending | not required | pending |
| `perf` | `kubeclaw.lighthouse@1` | pending | pending | pending | not required | pending |
| `visual-reg` | `kubeclaw.visual@1` | pending | pending | pending | not required | pending |
| `e2e` | `kubeclaw.e2e-suite@1` | pending | pending | pending | not required | pending |
| `security` | `kubeclaw.security-suite@1` | pending | pending | pending | not required | pending |
