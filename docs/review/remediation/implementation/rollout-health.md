# Envoy, LiteLLM and Prism rollout boundaries

Scope: IFR-07-001, IFR-14-001 and IFR-20-002. No cluster, CI or deployment commands
were executed. Live rollout and health proofs remain open.

## Configuration ownership

Agent PodTemplates now checksum their generated Envoy bootstrap content when
SPIFFE is enabled. The checksum covers the mounted `envoy.yaml` data, excluding
unrelated ConfigMap metadata. Prism control and worker use the respective
`control.yaml` and `worker.yaml` content from their shared ConfigMap. A change
confined to control's permitted Nova identity therefore requests a control
rollout without unnecessarily restarting worker or studio. No dynamic reload
shim or SDS behavior change is introduced.

LiteLLM remains a plain manifest deployment. Its renderer reads the config once,
emits that same text as `litellm-config.data[config.yaml]`, and adds a corresponding
PodTemplate checksum to the original Deployment. The existing infrastructure
block renders fully before applying ConfigMap, Deployment and Service, then
keeps the existing Service patch and rollout wait order. Thus a `subPath` config
update changes the PodTemplate without a separate patch-after-apply restart.
The renderer performs no Kubernetes operations. Credentials remain Secret refs.

## Health and single-control rollout

LiteLLM startup and liveness use the process-only `/health/liveliness` endpoint;
readiness uses `/health/readiness`. The pinned OCI index
`sha256:690f24800e2208e4f31b01483b9d0521d79dc508c8191f1c0b2f21549400c580`
and its digest-validated amd64/arm64 config/provenance objects both identify source
commit `7d5b6456baaf8be6ac1a60db2b710566b5344adf`, whose
[pyproject declares version 1.101.0](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/pyproject.toml).
The [commit-fixed original health implementation](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/health_endpoints/_health_endpoints.py)
defines the unauthenticated endpoints: liveness checks process/shutdown state;
readiness returns 503 when a configured database is disconnected unless explicitly
allowed by `allow_requests_on_db_unavailable`. The
[exact exception handler](https://github.com/BerriAI/litellm/blob/7d5b6456baaf8be6ac1a60db2b710566b5344adf/litellm/proxy/db/exception_handler.py)
defaults that override to false; the repository configuration does not enable it.

The source caches successful DB checks for 15 seconds and bounds a fresh check
at four seconds. The configured three-second Kubernetes readiness timeout can
mark a slow check unready earlier, which is conservative. Startup/liveness never
call that DB check, so DB latency does not create a liveness restart loop.
`docs/review/evidence/litellm-pinned-provenance.json` records the digest chain,
source references and source blob IDs without registry credentials. These are
registry/source observations, not image execution or signature-verification proof.
The image and genuine DB-failure behavior remain **runtime-unverified**. No image
layers, Docker runtime, replacement health server or paid model request was used.

The Prism chart already requires one control replica and mounts the retained
ReadWriteOnce artifacts PVC only in control. ReadWriteOnce restricts attachment
to one node, not multiple writers on that node. Default RollingUpdate can overlap
old and new control Pods or wait on cross-node attachment. Control-only Recreate
therefore preserves the intended singleton architecture during managed upgrades,
with an intentional availability gap. Studio and worker retain their existing
strategies. Recreate does not provide fencing against rogue Pods, force deletion,
or node partitions, and no corruption is asserted without live evidence.

## Verification scope

`node tests/verification/contracts/check-rollout-health.mjs` renders actual Helm
charts and actual plain LiteLLM manifests. It changes generated trust identities
and a model route, verifies changed mounted ConfigMap content also changes the
intended PodTemplate, and verifies unrelated Service/ingress configuration does
not. It checks consumer-specific Prism rollout scope, unchanged studio/worker
strategies, singleton/RWO declarations, and the declared probe endpoints. This is
rendering evidence, not probe execution, API admission, or successful rollout.

Passed locally: the full sensitivity command above, canonical ESLint for
`scripts/render-litellm-deployment.mjs` and the new regression using
`charts/kubeclaw/files/config/eslint.config.mjs`, `bash -n scripts/deploy.sh`,
and scoped `git diff --check`. Rendering covered all three agent roles, both
Prism Envoy consumers, unchanged unrelated consumers, and exact LiteLLM
ConfigMap content. The existing trusted Prism preference subject environment
entry is preserved.

Still required on the real host: change an allowed peer and reject the old identity
after actual Envoy rollout; confirm the effective LiteLLM route after config-only
rollout and Ready/Unready transitions under process and database faults; perform
the Prism upgrade with active writes, cross-node scheduling, and a failing new
instance. Keep these findings partially verified until those original acceptance
gates pass.
