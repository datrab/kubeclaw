# Security providers

This package registers separate security-header, dependency, immutable-image,
static Kubernetes, and runtime Kubernetes test providers. The suite groups
these providers. It does not execute scanner logic.

The contained verification uses a real HTTP server, Trivy, its real advisory
database, and the isolated provider runner. The runtime Kubernetes provider
requires the final deployed cluster proof. No scanner output is mocked.
