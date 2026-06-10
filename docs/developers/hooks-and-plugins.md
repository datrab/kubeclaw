# Hooks And Plugins

Status: current
Audience: developer, maintainer

## Purpose

Use this page to understand KubeClaw's pipeline extension points. The current extension model is a startup-frozen plugin registry with typed kinds, hook families, stage IDs, capabilities, and config schemas.

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
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area operator-surface
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
- `plugins/openclaw-agent-observer/`
