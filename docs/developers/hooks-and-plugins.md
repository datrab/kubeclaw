# Hooks And Plugins

Status: current
Audience: developer, maintainer

## Purpose

Use this page to understand KubeClaw's pipeline extension points. The current extension model is a startup-frozen plugin registry with typed kinds, hook families, stage IDs, capabilities, and config schemas.

The current manifest and configuration examples on this page describe the runtime that exists today. They are not the contract planned for the self-contained plugin architecture. See [Planned self-contained plugin model](#planned-self-contained-plugin-model) before designing a new long-lived plugin.

## Planned Self-Contained Plugin Model

KubeClaw is moving toward a generic stage engine in which core owns safe execution and plugins own concrete behavior. The planned model has these user-visible rules:

> The target `pipeline-plugin-v2` contracts are being frozen under
> [`skills/common/plugin-runtime/contracts/plugin-system/v2`](../../skills/common/plugin-runtime/contracts/plugin-system/v2/README.md).
> They remain planned behavior until the registry and runtime cutover phases
> are complete; the current runtime contract documented below remains active.

- Stage types are open-ended strings registered by plugins. Core does not hardcode workers, gates, validators, Forge, Buster, or approval.
- Every plugin lives in a self-contained package with its manifest, implementation, prompts, schemas, tests, fixtures, and documentation.
- A package normally exposes one stage type. It may expose a small cohesive family only when the types share one feature, trust boundary, ownership, dependencies, and atomic release lifecycle.
- Every stage registration declares its own configuration schema, input schema, result schema, executor, and `requiredCapabilities`.
- All declared capabilities are mandatory and authorized per stage invocation. Missing authorization or adapters fail startup, and a stage never inherits sibling-stage permissions.
- A cohesive package may also register immutable observers and capability adapters, but every registration keeps separate authority, failure, checkpoint/readiness, and shutdown boundaries.
- Package identity controls provenance, trust, installation, and versioning. Core retains scheduling and lifecycle authority.
- The canonical `plugin.json` manifest is inert data. Core validates provenance, integrity, schemas, ownership, and grants before importing executable modules.
- Plugin-local durable state is append-only and replayable; mutable views are projections. Invocation contexts are revoked after completion, timeout, cancellation, or ownership loss.
- Installation and grants are operator-controlled. Project configuration may select installed stage types but cannot install code, add roots, expand trust, or grant capabilities.
- The initial public SDK has no lifecycle-affecting policy hooks. Use core policy, a stage, a capability adapter, schema validation, or an immutable observer instead.
- Legacy package-level capabilities and kind-based contracts will be replaced atomically rather than retained as aliases or fallback paths.

The planned canonical shape is:

```json
{
  "id": "acme.example",
  "apiVersion": "pipeline-plugin-v2",
  "packageVersion": "1.0.0",
  "stages": [{
    "type": "acme.example-stage",
    "module": "./dist/stages/example.js",
    "export": "execute",
    "requiredCapabilities": ["state.read", "artifacts.write"],
    "configSchema": "./schemas/example-config.json",
    "inputSchema": "./schemas/example-input.json",
    "resultSchema": "./schemas/example-result.json"
  }],
  "observers": [],
  "adapters": []
}
```

This shape is not accepted by the current runtime yet. Do not copy it into production configuration until the migration is implemented and the page status changes. See [Plugin System Vision](../architecture/plugin-system-vision.md) for the decision map and [Plugin System Implementation Plan](../architecture/plugin-system-implementation-plan.md) for the phased migration.

## When To Use Each Mechanism

- Worker plugin: use when a module phase needs a different work executor.
- Gate plugin: use when an `execution_order` gate needs a new decision/control behavior.
- Validator plugin: use for deterministic checks before or after module work.
- Generator plugin: use for post-run or post-stage generated artifacts.
- Notification plugin: use for structured lifecycle notifications.
- Telemetry plugin: use for event sinks and observability integrations.

Do not use a notification or telemetry plugin to change scheduler truth. They are output surfaces.

## Built-In Hook Families

- `worker.execute`
- `gate.execute`
- `validator.run`
- `generator.run`
- `pipeline.started`
- `pipeline.completed`
- `module.started`
- `module.completed`
- `gate.started`
- `gate.completed`
- `telemetry.sink`

Each plugin kind has allowed hook families. Registry validation rejects kind/hook mismatches.

## Built-In Stage IDs

Workers:

- `worker:module_forge`
- `worker:module_buster`

Gates:

- `gate:review`
- `gate:approval`
- `gate:buster`

Validators:

- `validator:architecture`
- `validator:delivery_lint`
- `validator:pre_check`
- `validator:full_lint`

Generators:

- `generator:project_summary`
- `generator:pipeline_review`
- `generator:case_study`

Telemetry:

- `telemetry.sink`

## Lifecycle

1. Nova loads platform and project config.
2. The registry builds from built-in definitions and enabled configured modules.
3. Registry validation checks contract version, kind, hook family, stage IDs, capabilities, source type, trust tier, config schema, and implementation.
4. The registry is frozen for the run.
5. Pipeline stages invoke the selected owner through the plugin context.
6. Plugins emit stream, telemetry, artifacts, notifications, or control results according to kind.

This startup freeze is intentional. It keeps a run reproducible even if files change while a pipeline is executing.

## Manifest Contract

Plugin manifests use contract version `pipeline-plugin-v1` and JSON Schema draft-07 config schemas. Current source types are `builtin`, `local`, and `external`. Current trust tiers are `trusted` and `restricted`.

Capabilities are checked by kind. Examples:

- workers require `dispatch.worker_runtime`
- gates cannot declare `dispatch.worker_runtime`
- validators cannot request/wait/signal or dispatch worker runtimes
- telemetry plugins can emit telemetry and may notify/write artifacts when declared

Restricted plugins must use configured allowlists for restricted capabilities.

## Examples

Add a custom validator stage owner:

```json
{
  "plugins": {
    "enabled": true,
    "allowCustomModules": true,
    "extraModulePaths": ["/home/node/.openclaw/plugins"],
    "stageOwners": {
      "validator:delivery_lint": "local.validator.delivery-lint"
    }
  }
}
```

Add a notification listener for module completion:

```json
{
  "plugins": {
    "modules": {
      "local.notification.audit": {
        "enabled": true,
        "config": {
          "hooks": ["module.completed"]
        }
      }
    }
  }
}
```

These examples show shape only. Validate custom manifests against the registry rules before relying on them in a production run.

## Failure Behavior

Registry failures should be loud and early:

- unsupported contract version
- invalid kind/hook family
- invalid stage ID
- missing required capability
- forbidden capability
- missing implementation
- forbidden discovery path
- missing or conflicting stage owner
- unknown or conflicting gate type owner

Runtime plugin failures should return typed control results or explicit degraded observability events where possible. A plugin should never silently skip required work.

## Verification

Run the behavior verification area that covers registry/operator surfaces when plugin behavior changes:

```bash
node --test tests/verification/e2e/*.test.mjs
```

Also run docs/reference checks when plugin docs or generated references change:

```bash
npm run docs:inventory:check
npm run docs:generate:check
```

## Sources

- `skills/nova/pipeline/core/constants.ts`
- `skills/nova/pipeline/core/registry/builtins.ts`
- `skills/nova/pipeline/services/notification-contract.ts`
- `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- `skills/common/plugins/openclaw-agent-observer/`
