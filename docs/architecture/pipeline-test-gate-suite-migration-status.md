# Test-Suite Migration Status

This page is generated from `pipeline-test-gate-suite-migration-status.json`.
Do not edit this page directly.

## Summary

- Replacement implemented: 6 of 13.
- Parity proved: 6 of 13.
- Cut over and deleted: 6 of 13.

## Suites

| Old suite | Successor | Implementation | Parity | Cutover |
| --- | --- | --- | --- | --- |
| `unit` | `kubeclaw.direct-command@1` | complete | complete | complete |
| `manifest` | `lint:kubernetes-policy` | complete | complete | complete |
| `build` | `kubeclaw.container-build@1` | complete | complete | complete |
| `bundle` | `kubeclaw.size-budget@1` | complete | complete | complete |
| `k8s` | `kubeclaw.kubernetes-fixture@1` | complete | complete | complete |
| `health` | `kubeclaw.http@1` | complete | complete | complete |
| `tailscale-preview` | `kubeclaw.tailscale-exposure@1` | pending | pending | pending |
| `api` | `kubeclaw.api-suite@1` | pending | pending | pending |
| `a11y` | `kubeclaw.axe@1` | pending | pending | pending |
| `perf` | `kubeclaw.lighthouse@1` | pending | pending | pending |
| `visual-reg` | `kubeclaw.visual@1` | pending | pending | pending |
| `e2e` | `kubeclaw.e2e-suite@1` | pending | pending | pending |
| `security` | `kubeclaw.security-suite@1` | pending | pending | pending |
