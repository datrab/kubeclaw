# Lighthouse security model

## Trust boundaries

The provider reads reviewed project settings. The Buster capability owns Chrome, network access, timing, and response limits. Nova owns plan resolution and the final gate decision.

## Network boundary

The target must match one exact operator origin or one exact typed fixture origin. An origin includes the scheme, host, and port. The local proxy rejects another origin. HTTPS CONNECT requests must match the exact target host. WebSocket upgrades are denied.

## File boundary

The settings path must be relative, must resolve inside the repository, and must name a regular file after canonical path resolution. The file has a 256 KiB limit. Evidence is written only to the runner-owned evidence directory.

## Resource boundary

Operator policy limits total runs, execution time, returned bytes, provider process resources, and concurrency. Performance samples run sequentially. Cancellation kills Chrome and closes the proxy.

## Secrets

The provider receives no Kubernetes credentials and no browser credentials. URLs with embedded credentials are rejected. Projects must not store authentication tokens in Lighthouse configuration.
