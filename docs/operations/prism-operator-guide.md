# Prism operator guide

## Install

1. Put the four published image digests in protected environment variables or
   `my-values/prism-values.yaml`.
2. Run `./scripts/deploy.sh setup`.
3. Run `./scripts/deploy.sh secrets`.
4. Run `./scripts/deploy.sh prism`.
5. Run `./scripts/deploy.sh prism-status`.
6. Run `./scripts/deploy.sh prism-smoke`.

`deploy.sh prism` rejects `latest`, an empty image digest, a missing values
file, and missing Secrets. Helm uses an atomic upgrade. A failed upgrade keeps
the last healthy release.

## Remove workloads

Run `./scripts/deploy.sh teardown-prism`. This command keeps the database PVC,
artifact PVC, and Secrets.

Use `teardown-all` only for a disposable environment. It removes the complete
Prism namespace after the destructive confirmation.

## Status

`./scripts/deploy.sh prism-status` shows workloads, Jobs, Services, PVCs, and
the Helm release. `./scripts/deploy.sh status` includes the same Prism view when
Prism is enabled.
