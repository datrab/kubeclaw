# Package deep-guide ownership

Status: package behavior and change-guide index
Audience: extension author and maintainer
Owner: plugin-foundation
Evidence: scripts/docs-plugin-complexity.mjs; docs/config/documentation-plugin-complexity.json
Applies to: all discovered installable package manifests
Last verified: current read-only classification check

Use this index to find the owning behavior and change guide for a package. Related packages can share one specialist guide. Generated catalogue and configuration references supply their separate registration and field facts. Classification reasons identify configuration, effect, state or extension boundaries to inspect before a change; they do not grant runtime authority.

<!-- BEGIN GENERATED: plugin complexity -->

| Package | Classification reasons | Owning guide |
| --- | --- | --- |
| `kubeclaw-agent-observer` | externalEffects, internalExtension, persistence | [openclaw](../../understand/openclaw.md) |
| `kubeclaw-ops` | externalEffects, internalExtension | [ops-mcp](../../understand/ops-mcp.md) |
| `kubeclaw-prism` | externalEffects, internalExtension, persistence | [prism-runtime](../../understand/prism-runtime.md) |
| `kubeclaw.agent-observability` | externalEffects, multiple-registrations, persistence | [telemetry](../../understand/telemetry.md) |
| `kubeclaw.api-flow` | externalEffects, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.architecture-validator` | externalEffects, persistence | [echo](../../understand/echo.md) |
| `kubeclaw.artifact-store` | externalEffects, persistence | [data-and-state](../../understand/data-and-state.md) |
| `kubeclaw.axe` | externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.blueprint-sync` | externalEffects, persistence | [forge](../../understand/forge.md) |
| `kubeclaw.buster-quality-gate` | externalEffects, persistence | [buster](../../understand/buster.md) |
| `kubeclaw.case-study` | externalEffects, persistence | [reports](reports.md) |
| `kubeclaw.command-runner` | externalEffects, nested-configuration | [worker-core](../../understand/worker-core.md) |
| `kubeclaw.container-build` | conditional-configuration, externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.coverage-budget` | No complex signal in current sources | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.delivery-lint` | externalEffects, persistence | [lint](../lint.md) |
| `kubeclaw.demo-auth-smoke` | conditional-configuration, externalEffects, nested-configuration | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.demo-handoff` | externalEffects, multiple-registrations, persistence | [demo-handoff](demo-handoff.md) |
| `kubeclaw.direct-command` | externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.git-workspace` | externalEffects, nested-configuration, persistence | [forge](../../understand/forge.md) |
| `kubeclaw.http` | externalEffects, nested-configuration | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.human-approval` | externalEffects, multiple-registrations, persistence | [wait-resume](../../use/workflows/wait-resume.md) |
| `kubeclaw.implementation-agent` | externalEffects, persistence | [forge](../../understand/forge.md) |
| `kubeclaw.junit-report` | No complex signal in current sources | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.kubernetes-fixture` | externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.lighthouse` | conditional-configuration, externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.lint` | externalEffects, multiple-registrations, nested-configuration, persistence | [lint](../lint.md) |
| `kubeclaw.network-http` | externalEffects, nested-configuration | [buster](../../understand/buster.md) |
| `kubeclaw.notification-observer` | externalEffects, multiple-registrations, nested-configuration, persistence | [telemetry](../../understand/telemetry.md) |
| `kubeclaw.openapi` | conditional-configuration, externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.openclaw-agent-events` | externalEffects, internalExtension, nested-configuration, persistence | [openclaw](../../understand/openclaw.md) |
| `kubeclaw.operator-messaging` | conditional-configuration, externalEffects, nested-configuration, persistence | [wait-resume](../../use/workflows/wait-resume.md) |
| `kubeclaw.pipeline-review` | externalEffects, multiple-registrations, persistence | [reports](reports.md) |
| `kubeclaw.playwright` | externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.preflight-contract` | externalEffects, multiple-registrations, persistence | [nova-project](../../reference/nova-project.md) |
| `kubeclaw.prism-design` | externalEffects, persistence | [prism-runtime](../../understand/prism-runtime.md) |
| `kubeclaw.project-summary` | externalEffects, persistence | [nova-project](../../reference/nova-project.md) |
| `kubeclaw.redis-transport` | externalEffects, multiple-registrations, persistence | [telemetry](../../understand/telemetry.md) |
| `kubeclaw.remote-test-gate` | conditional-configuration, externalEffects, multiple-registrations, nested-configuration, persistence | [buster](../../understand/buster.md) |
| `kubeclaw.repository-adapter` | externalEffects | [echo](../../understand/echo.md) |
| `kubeclaw.review` | conditional-configuration, externalEffects, multiple-registrations, nested-configuration, persistence | [echo](../../understand/echo.md) |
| `kubeclaw.runtime-dispatch` | conditional-configuration, externalEffects, multiple-registrations, nested-configuration, persistence | [openclaw](../../understand/openclaw.md) |
| `kubeclaw.secret-resolver` | nested-configuration | [security-and-trust](../../understand/security-and-trust.md) |
| `kubeclaw.security-providers` | externalEffects, multiple-registrations, nested-configuration | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.size-budget` | nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.state-store` | externalEffects, persistence | [data-and-state](../../understand/data-and-state.md) |
| `kubeclaw.tailscale-exposure` | externalEffects, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.telemetry-observer` | externalEffects, persistence | [telemetry](../../understand/telemetry.md) |
| `kubeclaw.telemetry-store` | externalEffects, persistence | [telemetry](../../understand/telemetry.md) |
| `kubeclaw.transport-publisher` | externalEffects, nested-configuration, persistence | [communication](../../understand/communication.md) |
| `kubeclaw.visual` | externalEffects, nested-configuration, persistence | [buster-suites](../../reference/buster-suites.md) |
| `kubeclaw.wait-store` | externalEffects, persistence | [wait-resume](../../use/workflows/wait-resume.md) |

<!-- END GENERATED: plugin complexity -->

## Maintain a package assignment

Use Node.js 24 from the repository root with the complete checkout, installed repository dependencies, and its current package manifests, schemas, classification policy and owning guides. Confirm the toolchain with `node --version`. Run `node scripts/docs-plugin-complexity.mjs --check`. Success exits zero and prints JSON with `ok: true`, the discovered package, complex-package and canonical-assignment counts, and the source/classification-only boundary. Counts describe current discovery, not guide-depth or runtime acceptance. The check is read-only: it creates no resources and needs no cleanup. A nonzero exit prints the failing assertion or `PLUGIN_COMPLEXITY_*` diagnostic. Stop and inspect the named source, consumer, assignment or index difference before changing a binding or guide; do not use a failed check as coverage. It discovers package additions/removals, derives recursive schema/registration signals and rejects changed source-bound effect/state/extension decisions. After reviewing the actual semantics, edit the policy and owning guide, then run the same check. Do not renew a digest to turn a missing explanation green.

The optional `--index` operation prints this source-derived page to stdout. Review it before replacing this generated owner index. It never changes the policy or a guide. Independent content review and any activation/live checks stay separate.
