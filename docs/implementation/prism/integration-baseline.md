# Prism production integration baseline

Status: integration in progress.

Prism is a separate design system. Nova dispatches design work to Prism. Nova
uses Archviewer only to present architecture documents as HTML.

## Fixed versions

- Node.js: 24
- OpenClaw base: 2026.7.1-2
- PostgreSQL: 17 with pgvector
- Puck: 0.23.0
- Playwright: 1.62.1
- Helm: 3
- Kubernetes API target: 1.35

## Production choices

- Canonical database: the dedicated Prism PostgreSQL database.
- Artifact backend: a content-addressed persistent volume in v1. The artifact
  contract permits a later S3-compatible backend.
- Dispatch transport: the existing generic Worker Core envelope over an
  authenticated private HTTP path. Prism does not add a second queue.
- Design provider: configured through protected deployment secrets. No provider
  identity enters a Design Document or Baseline Bundle.
- First corpus sources: internal projects, user uploads, and generated material.
  Public-web ingestion stays disabled until a source policy is approved.

## Release blockers

- Production images need published GHCR digests.
- The target cluster must install the chart with operator credentials.
- Live provider credentials and budgets must be approved.
- The Nova-started E2E, failure matrix, backup, restore, Tailscale, and physical
  mobile checks need live evidence.
- Autoreview needs a valid Codex login. The last three Terra calls failed with
  a revoked OAuth refresh token.

The repository does not replace these checks with mocks.
