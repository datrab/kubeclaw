# Generated Reference Support

Status: generated-support
Audience: maintainers, documentation agents

## Purpose

Generated reference pages are written into `docs/reference/` from inventory files. This directory documents the generation support path and is reserved for future generated-only fragments if direct reference-page generation becomes too large.

## Regenerate

```bash
npm run docs:inventory
npm run docs:generate
```

## Check

```bash
npm run docs:inventory:check
npm run docs:generate:check
```

## Current Generated Reference Pages

- `../../reference/cli.md`
- `../../reference/secrets.md`
- `../../reference/helm-values.md`
- `../../reference/environment-variables.md`
- `../../reference/verification-commands.md`
