# Operator Quickstart

Status: implemented
Audience: operator
Owner: nova-core
Evidence: package.json; skills/nova/core/cli.ts
Applies to: current supported release
Last verified: generated during publication

## Objective

Validate the checkout and display the pipeline command interface.

## Prerequisites

- Use a supported Node.js environment.
- Install repository dependencies.
- Run the commands from the repository root.

## Procedure

1. Verify generated documentation and plugin contracts.

```bash
npm run docs:check
npm run verify:plugin-system-v2
```

2. Display the pipeline command options.

```bash
npm run pipeline -- --help
```

## Expected Result

Both verification commands exit with code zero. The pipeline command prints its supported options.

## Verification

Confirm that the plugin inventory reports every installed manifest. Confirm that no documentation check reports stale generated files.

## Common Failures

- A stale generated file means its source changed without regeneration.
- A missing dependency means the checkout does not contain an installed workspace dependency.
- An invalid plugin means its manifest, schema, module, export, or boundary proof failed.

## Recovery

Run the named generator for stale output. Reinstall dependencies only when the lockfile and installed tree differ.
