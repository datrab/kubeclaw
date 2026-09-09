# LiteLLM

## Procedure

Configure the model gateway URL and credential Secret reference.

The infrastructure deployment command renders `litellm-config` and the Deployment
from one snapshot of `my-values/infra/litellm-config.yaml`. The PodTemplate checksum
changes with those exact mounted configuration bytes, so a configuration-only
update requests a rollout despite the `subPath` mount. To inspect without applying:

```sh
node scripts/render-litellm-deployment.mjs my-values/infra/litellm-config.yaml my-values/infra/litellm-deployment.yaml
```

Use this rendered output for manual installation too; applying the raw Deployment
alone does not bind it to the ConfigMap content. Secret rotation still requires
an explicit operational rollout; secret values are not embedded in annotations.

## Verify

Verify provider health from the gateway namespace before a model-backed run.

Startup and liveness query `/health/liveliness`; readiness queries
`/health/readiness`. The pinned OCI index
`sha256:690f24800e2208e4f31b01483b9d0521d79dc508c8191f1c0b2f21549400c580`
contains amd64 and arm64 images whose labels and digest-verified provenance name
LiteLLM source commit `7d5b6456baaf8be6ac1a60db2b710566b5344adf`,
[version 1.101.0](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/pyproject.toml).
The [exact revision's health endpoints](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/health_endpoints/_health_endpoints.py)
support unauthenticated probes: liveness checks process/graceful-shutdown state
without a database or model call; readiness reports HTTP 503 for an unavailable
configured database unless the explicit `allow_requests_on_db_unavailable`
setting is enabled (its default is false).

Successful database readiness is cached for up to 15 seconds. The internal DB
check has a four-second deadline; the Kubernetes readiness timeout is three
seconds, so a slow check can conservatively mark the Pod unready before that
deadline. This does not create a liveness dependency on the database. Digest and
source evidence is recorded in `docs/review/evidence/litellm-pinned-provenance.json`.
The pinned image has not been executed locally; actual probe and DB-failure
behavior still require runtime verification.

Before operational acceptance, use the pinned image to verify startup, a hung
HTTP process, and configured database loss/restoration. Confirm Ready becomes
false on database loss while liveness remains successful; verify the changed
effective model route after a configuration-only rollout. A successful manifest
render or rollout command alone is not proof of those behaviors.

## Common Failures

Authentication, model allowlist, and timeout failures surface through runtime
dispatch without exposing credentials.
