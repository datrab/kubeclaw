# Generated Inventory

Status: generated-support
Audience: maintainers, documentation agents

## Purpose

This directory contains stable JSON inventory extracted from source files. Reference and operator docs use these files to avoid copying drift-prone facts by hand.

## Regenerate

From the repository root:

```bash
npm run docs:inventory
```

## Check

```bash
npm run docs:inventory:check
```

The check fails when generated inventory files do not match the current source-derived output.

## Current Coverage

- `deploy-script.json` from `scripts/deploy.sh`
- `secret-setup.json` from `my-values/setup-secrets.sh`
- `helm-values.json` from the chart defaults, Nova/Buster values, and infrastructure values/manifests

## Next Targets

- rendered Nova and Buster manifests
- pipeline CLI flags
- environment variables from config loaders and templates
- OpenClaw and swarm config fields
- progress JSON fields and examples
- Redis streams, status keys, and artifact paths
- telemetry events and observability sinks
- Buster suites, task config, and linting rules
- CI workflows and image publishing behavior
- verification commands and smoke checks
