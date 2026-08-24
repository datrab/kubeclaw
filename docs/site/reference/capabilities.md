# Capability Catalogue

Status: implemented
Audience: plugin author, operator, security reviewer
Owner: plugin-foundation
Evidence: skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts
Applies to: pipeline-plugin-v2
Last verified: generated during publication

## Purpose

This catalogue lists each grantable capability and every registration that declares it.

| Capability | Declared by |
| --- | --- |
| `agent.events.subscribe` | `kubeclaw.openclaw-agent-events:source` |
| `artifacts.read` | `kubeclaw.artifact-store:artifact-store`<br>`kubeclaw.human-approval:architecture-approval`<br>`kubeclaw.prism-design:design`<br>`kubeclaw.review:review`<br>`kubeclaw.review:repository-audit` |
| `artifacts.write` | `kubeclaw.test-agent:test`<br>`kubeclaw.agent-observability:evidence`<br>`kubeclaw.artifact-store:artifact-store`<br>`kubeclaw.notification-observer:audit`<br>`kubeclaw.architecture-validator:architecture`<br>`kubeclaw.blueprint-sync:sync`<br>`kubeclaw.buster-quality-gate:quality`<br>`kubeclaw.case-study:case-study`<br>`kubeclaw.delivery-lint:delivery-lint`<br>`kubeclaw.implementation-agent:implementation`<br>`kubeclaw.lint:pre-check`<br>`kubeclaw.lint:full`<br>`kubeclaw.pipeline-review:review`<br>`kubeclaw.preflight-contract:validate`<br>`kubeclaw.prism-design:design`<br>`kubeclaw.project-summary:summary`<br>`kubeclaw.review:review`<br>`kubeclaw.review:repository-audit` |
| `command.execute` | `kubeclaw.direct-command:command`<br>`kubeclaw.test-agent:test`<br>`kubeclaw.command-runner:command` |
| `container.build` | `kubeclaw.container-build:buildkit` |
| `git.commit` | `kubeclaw.git-workspace:git`<br>`kubeclaw.blueprint-sync:sync`<br>`kubeclaw.implementation-agent:implementation` |
| `git.merge` | `kubeclaw.git-workspace:git`<br>`kubeclaw.implementation-agent:implementation` |
| `git.repository.read` | `kubeclaw.runtime-dispatch:openclaw`<br>`kubeclaw.delivery-lint:delivery-lint`<br>`kubeclaw.preflight-contract:validate`<br>`kubeclaw.repository-adapter:repository`<br>`kubeclaw.review:review`<br>`kubeclaw.review:repository-audit` |
| `git.sync` | `kubeclaw.git-workspace:git`<br>`kubeclaw.blueprint-sync:sync` |
| `git.workspace.create` | `kubeclaw.git-workspace:git`<br>`kubeclaw.implementation-agent:implementation` |
| `git.workspace.remove` | `kubeclaw.git-workspace:git`<br>`kubeclaw.implementation-agent:implementation` |
| `kubernetes.exposure` | `kubeclaw.tailscale-exposure:exposure` |
| `kubernetes.fixture` | `kubeclaw.kubernetes-fixture:deployment` |
| `lint.execute` | `kubeclaw.lint:pre-check`<br>`kubeclaw.lint:full`<br>`kubeclaw.lint:executor` |
| `network.http` | `kubeclaw.buster-suite-runtime:suite`<br>`kubeclaw.http:request`<br>`kubeclaw.network-http:http`<br>`kubeclaw.operator-messaging:operator`<br>`kubeclaw.runtime-dispatch:runtime`<br>`kubeclaw.runtime-dispatch:openclaw`<br>`kubeclaw.transport-publisher:publisher` |
| `operator.request` | `kubeclaw.notification-observer:notifications`<br>`kubeclaw.notification-observer:preview-delivery`<br>`kubeclaw.operator-messaging:operator`<br>`kubeclaw.human-approval:approval`<br>`kubeclaw.human-approval:architecture-approval`<br>`kubeclaw.prism-design:design` |
| `runtime.dispatch` | `kubeclaw.test-agent:test`<br>`kubeclaw.runtime-dispatch:runtime`<br>`kubeclaw.runtime-dispatch:openclaw`<br>`kubeclaw.architecture-validator:architecture`<br>`kubeclaw.buster-quality-gate:quality`<br>`kubeclaw.case-study:case-study`<br>`kubeclaw.implementation-agent:implementation`<br>`kubeclaw.pipeline-review:review`<br>`kubeclaw.prism-design:design`<br>`kubeclaw.review:review`<br>`kubeclaw.review:repository-audit` |
| `secrets.read` | `kubeclaw.buster-suite-runtime:suite`<br>`kubeclaw.operator-messaging:operator`<br>`kubeclaw.redis-transport:publisher`<br>`kubeclaw.redis-transport:telemetry`<br>`kubeclaw.runtime-dispatch:runtime`<br>`kubeclaw.runtime-dispatch:openclaw`<br>`kubeclaw.secret-resolver:secrets`<br>`kubeclaw.transport-publisher:publisher`<br>`kubeclaw.remote-test-gate:plan` |
| `signal.wait` | `kubeclaw.wait-store:waits`<br>`kubeclaw.human-approval:approval`<br>`kubeclaw.human-approval:architecture-approval`<br>`kubeclaw.prism-design:design` |
| `state.append` | `kubeclaw.state-store:state`<br>`kubeclaw.blueprint-sync:sync` |
| `state.read` | `kubeclaw.state-store:state` |
| `telemetry.emit` | `kubeclaw.agent-observability:ingester`<br>`kubeclaw.redis-transport:telemetry`<br>`kubeclaw.telemetry-observer:telemetry`<br>`kubeclaw.telemetry-store:telemetry` |
| `test.plan.execute` | `kubeclaw.test-agent:test`<br>`kubeclaw.buster-quality-gate:quality`<br>`kubeclaw.remote-test-gate:plan` |
| `test.suite.execute` | `kubeclaw.buster-suite-runtime:suite`<br>`kubeclaw.test-agent:test`<br>`kubeclaw.buster-quality-gate:quality` |
| `transport.publish` | `kubeclaw.redis-transport:publisher`<br>`kubeclaw.transport-publisher:publisher` |
