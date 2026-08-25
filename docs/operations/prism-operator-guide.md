# Prism operator guide

## Install

1. Run `./scripts/deploy.sh setup`.
2. Run `./scripts/deploy.sh secrets`.
3. Run `./scripts/deploy.sh prism`.
4. Run `./scripts/deploy.sh prism-status`.
5. Run `./scripts/deploy.sh prism-smoke`.

Prism uses the image repositories and tags configured once in
`my-values/prism-values.yaml`; no digest or approver environment variables are
required. Any user authenticated through the trusted Tailscale ingress can
approve a design. `deploy.sh prism` creates `prism-provider` from the existing
`openclaw-shared-secrets/litellmApiKey`, using the internal LiteLLM
`claude-sonnet` route. Set `PRISM_PROVIDER_ENDPOINT` and
`PRISM_PROVIDER_MODEL` to override that route. Embeddings are optional while
ingestion is disabled; configure both `PRISM_EMBEDDING_ENDPOINT` and
`PRISM_EMBEDDING_MODEL` when enabling them. Helm uses an atomic upgrade. A
failed upgrade keeps the last healthy release.

## Remove workloads

Run `./scripts/deploy.sh teardown-prism`. This command keeps the database PVC,
artifact PVC, and Secrets.

Use `teardown-all` only for a disposable environment. It removes the complete
Prism namespace after the destructive confirmation.

## Status

`./scripts/deploy.sh prism-status` shows workloads, Jobs, Services, PVCs, and
the Helm release. `./scripts/deploy.sh status` includes the same Prism view when
Prism is enabled.
