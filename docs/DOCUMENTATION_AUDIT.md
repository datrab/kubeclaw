# Documentation Audit

Status: current
Audience: maintainers, documentation contributors

## Scope

The active documentation tree is every file under `docs/` except `docs/archive/`. Archived material is historical context and is not current behavior authority.

## Current Audit Result

The 2026-07-18 high-level truth refresh reviewed all active documentation sections against current source owners, generated inventory, contract tests, deployment manifests, and the real E2E scenario registry.

Current automated coverage:

- 136 active Markdown pages pass structural checks.
- Generated source inventory and reference sections are current.
- Local links and repository path references pass validation.
- The topic-map coverage guard passes.
- Deployment claims are additionally checked by deployment-truth verification.
- Pipeline lifecycle, telemetry, Buster, checkpoint, and compatibility boundaries have dedicated contract checks.

## Material Corrections In The Current Tree

- The real E2E surface is eight suites and 46 uniquely owned cases; every case has a green latest result as of 2026-07-18.
- Agent semantic artifacts use a shared pipeline-owned immutable envelope. Agents do not author run/module/gate/attempt/dispatch/schema/timestamp/path identity.
- Buster uses namespace leases in production broker mode. The separate namespace controller owns cluster-scoped namespace operations; Buster retains only lease-client authority plus namespace-local access granted for a live lease.
- Agent code is delivered through role code bundles and common overlays rather than being baked into the heavyweight runtime images.
- The active issue tracker contains unresolved issues only.

## Remaining Limits

See [open issues](open-issues.md) for current defects, risks, and decisions. The main documentation limitation is the absence of a single live-verified clean-cluster bootstrap. Exact reference generation also remains intentionally partial where a prose page has a clear source and drift check.

## Audit Commands

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/contracts/check-checkpoint-hook-contracts.mjs --source-root "$PWD"
node tests/verification/contracts/check-canonical-pipeline-compat-debt-free.mjs --source-root "$PWD"
git diff --check
```

## Review Rule

A passing docs check proves structure, references, generated output, and declared coverage. It does not prove live provider, cluster, network, registry, Discord, or Tailscale behavior. Those claims require the named live verification procedure or must remain explicitly bounded.
