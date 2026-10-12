# Security providers

This package registers separate security-header, dependency, immutable-image,
static Kubernetes, and runtime Kubernetes test providers. The suite groups
these providers. It does not execute scanner logic.

The contained verification uses a real HTTP server, Trivy, its real advisory
database, and the production capability invokers. CI requires a clean dependency
fixture to pass, a real npm lockfile containing lodash 4.17.20 to fail with
CVE-2021-23337, missing HTTP security headers to fail, and unsafe Kubernetes
configuration to fail. An immutable image is also scanned; its current findings
are retained rather than assuming it is vulnerability-free. The runtime Kubernetes provider
requires the final deployed cluster proof. No scanner output is mocked.

For local verification, set `KUBECLAW_SECURITY_TEST_TRIVY` to the executable
returned by `bash scripts/scan-runtime-images.sh --executable` and
`KUBECLAW_SECURITY_TEST_CACHE` to a populated Trivy cache. The test obtains
real npm lockfiles; it needs npm registry access. CI downloads the advisory
database before starting the provider tests. Missing tools, databases or
network prerequisites fail the job.
