# Security suite operator guide

The runtime-security capability accepts only a recent controller observation.
The production controller refreshes lease status on each poll. The Buster
runtime rejects observations older than 10 seconds and timestamps more than
five seconds in the future. Keep node clocks synchronized and keep the
controller poll interval below this age limit.

## Worker image

Buster contains Trivy 0.74.0. The archive checksum is pinned for AMD64 and ARM64. The immutable worker image also contains the Trivy database used by the scan. Rebuild and redeploy Buster to update that database. Dependency and image scans use `--skip-db-update` and `--offline-scan`. All scans use `--skip-version-check` and `--disable-telemetry`. Static configuration scans use `--skip-check-update`; Trivy does not provide `--offline-scan` for that subcommand.

Allow image scanning only for the pipeline registry prefix. Do not permit tags. The provider must consume a reference that contains the same SHA-256 digest as the build output.

## Kubernetes authority

The namespace controller, not the test provider, lists the leased namespace. It records a bounded runtime-security result in lease status. The Buster capability reads the lease and verifies namespace, manifest digest, immutable image, result digest, and observation time. The provider never receives a kubeconfig.

## Production acceptance

Run `./scripts/deploy.sh nova-security-preflight IMAGE@sha256:DIGEST` only during the controlled final cycle. The command must use the deployed Nova, Buster, namespace controller, real registry image, real Kubernetes API, and signed receipt store. A local parser test is not production acceptance.
