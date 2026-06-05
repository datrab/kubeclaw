# Deployment Backlog / Open Tasks

Status: open infrastructure backlog
Last repo audit: 2026-05-12T15:38:41Z

Purpose: track deployment/infrastructure work required so Kubernetes actually supports the Redis security and Buster default-deny capability enforcement implemented in code.

## Current repo evidence

- Redis clients read `REDIS_PASSWORD` through the shared transport in `skills/common/pipeline/redis-transport.ts`; non-local Redis fails closed unless password, TLS, or documented network isolation is configured.
- Agent Helm deployment template already injects `REDIS_PASSWORD` from `.Values.redis.secretName` / `.Values.redis.secretKey` into both the main `kubeclaw` container and optional `stream-processor` sidecar.
- Default chart values point Redis at `redis-master.kubeclaw.svc.cluster.local:6379` and `redis-secrets` / `redis-password`.
- `my-values/infra/redis-values.yaml` configures Bitnami Redis auth with `existingSecret: redis-secrets` and `existingSecretPasswordKey: redis-password`.
- Buster capability logic is code-level and default-deny. Nova only forwards explicit module/gate `capabilities` from project configuration into Redis payloads; Helm must not grant task capabilities.
- Buster chart values currently enable `sandbox.enabled: true` and `serviceAccount.create: true`. The chart creates privileged sandbox security context plus a ClusterRole/Binding for namespace/workload testing.
- `my-values/infra/buster-namespace-fence.yaml` exists to restrict the Buster ServiceAccount to `buster-*` / `test-*` namespace create/delete via ValidatingAdmissionPolicy.
- NetworkPolicy support for Redis isolation is not present in the chart/infra manifests yet.

## 1. Secret Management & K8s Environment Setup

- [ ] Secret validation preflight: add a deploy/check script that fails if `redis-secrets` is missing from the target namespace or lacks a non-empty `redis-password` key.
- [x] Helm env wiring: chart template injects `REDIS_PASSWORD` via `secretKeyRef` for the main agent container and stream processor.
- [x] Container code expectation: shared Redis transport reads `process.env.REDIS_PASSWORD`.
- [x] Redis deployment values: `my-values/infra/redis-values.yaml` points Bitnami Redis at `redis-secrets.redis-password`.
- [ ] Render/live verification: verify the installed Redis pod starts with auth/`requirepass` enabled using the same `redis-secrets.redis-password` value.
- [ ] Optional hardening: decide whether Redis TLS is required later. Current code supports `REDIS_TLS` / `REDIS_TLS_ENABLED`, but current infra backlog assumes password + in-cluster NetworkPolicy.

## 2. Network Isolation (K8s Zero-Trust Transport)

- [ ] Redis Service type verification: verify the installed Redis Service is `ClusterIP` only. It must not be `NodePort` or `LoadBalancer`.
- [ ] Redis NetworkPolicy: add a namespace `NetworkPolicy` allowing ingress to Redis port `6379` only from approved pipeline-worker pods.
- [ ] Pod access labels: standardize a stable Redis-access label, for example `access: redis` or `kubeclaw/redis-client: "true"`, on Nova, Buster, and future workers such as Pentest.
  - Current chart already labels pods with `kubeclaw/role: <agentRole>`, which can cover Nova/Buster today.
  - Add generic `podLabels` / `extraPodLabels` values support so future workers can opt into Redis access without rewriting chart templates.
- [ ] Default-deny namespace policy: add an optional but recommended namespace-wide default deny policy, then explicitly allow Redis, DNS, LiteLLM/Qdrant/Gateway traffic as needed.
- [ ] Egress review: if a default deny egress policy is used, explicitly permit required destinations: Redis, DNS, LiteLLM, Qdrant, Git/SSH, registry endpoints, Discord/webhooks, and provider APIs.
- [ ] Redis transport env consistency: if relying on NetworkPolicy as part of the security claim, consider setting `REDIS_NETWORK_ISOLATION=isolated` in the agent pods for documentation/diagnostics, even though `REDIS_PASSWORD` is already configured.

## 3. Capability Manifests (Default Deny Integration)

- [ ] Logical capability mapping: document and configure project-level module/gate `capabilities` in `swarm.config.json` or project progress/config files. Do not define task capabilities in Helm.
- [ ] Default-deny rollout check: before enabling Buster in production, confirm each project module/gate that needs destructive/tool-heavy suites declares only the required capabilities:
  - `static_web_server`
  - `container_runtime`
  - `kubernetes_api`
  - `browser_automation`
  - `lighthouse`
  - `discord_media`
- [ ] Platform-only image pre-pull: decide whether Buster startup should pre-pull images. If yes, set `BUSTER_PLATFORM_CAPABILITIES=image_prepull` only on the Buster deployment; this is a platform startup permission, not a task capability.
- [ ] Operator runbook: document that empty task capabilities are expected to make destructive/tool-heavy suites fail closed with ERROR verdicts and durable `operator.alert` records.

## 4. Physical Infrastructure Permissions for Authorized Buster Capabilities

- [x] Sandbox image toolchain: `docker/Dockerfile.sandbox` includes Podman/Buildah, nginx, Playwright, Lighthouse, k6, curl/jq, and browser dependencies.
- [x] Privileged sandbox context: chart enables privileged/root sandbox mode when `sandbox.enabled=true`.
- [x] Podman storage: chart mounts `/var/lib/containers` and `/sandbox` when sandbox mode is enabled.
- [x] K8s RBAC path: chart can create a Buster ServiceAccount plus ClusterRole/Binding for namespace/workload tests.
- [ ] Namespace fence deployment: apply and validate `my-values/infra/buster-namespace-fence.yaml` wherever Buster RBAC is enabled.
- [ ] RBAC chart hardening: prevent accidental cluster-wide test RBAC for non-Buster agents; bind the ClusterRole only when `agentRole=buster` and/or an explicit `k8sTestRbac.enabled=true` flag is set.
- [ ] Podman/K3s runtime validation: run a live smoke test confirming privileged Buster can run `podman`, build with the configured registries, and clean run-labeled resources.
- [ ] K8s capability smoke: run a live smoke test confirming authorized Buster can create/delete only `buster-*` or `test-*` namespaces and cannot touch production namespaces.
- [ ] Registry connectivity: verify Buster can reach `registry-local` / `registry-mirror` and that `registries.conf` is mounted correctly in sandbox mode.

## 5. Redis Streams and Deployment Health

- [ ] Processor cleanup: Buster values disable the legacy stream-processor sidecar because `buster-pipeline.ts` owns Redis task consumption. Clean up stale processor docs/templates or clearly document when the processor is still used.
- [ ] Liveness/readiness review: ensure Buster probes still represent the dual-process `buster-pipeline.ts` + gateway startup model; if the pipeline dies, the pod should restart.
- [ ] Durable alert path: verify persistent volumes preserve `.swarm/logs/**/operator-alerts.jsonl` long enough for operators to diagnose capability denials.
- [ ] Redis stream smoke: from Nova, dispatch a Buster task and verify Buster consumes it, writes completion, and Nova reads completion using authenticated Redis.
- [ ] Failure smoke: dispatch a Buster task without required capabilities and verify no tool-heavy command runs, suite verdict is ERROR, and durable operator alert contains who/what/why.

## 6. Deployment Documentation

- [ ] Create an operator guide covering Redis secret creation, Redis Helm install, agent Helm installs, NetworkPolicy install, Buster namespace fence, and smoke-test commands.
- [ ] Add a requirements document for Buster-capable clusters: Kubernetes version for ValidatingAdmissionPolicy, NetworkPolicy CNI support, privileged pod policy allowance, storage, registry access, and required external egress.
- [ ] Harden and optimize charts (TBD): add explicit values for pod labels, Redis NetworkPolicy, Buster platform capabilities, RBAC gating, and default-deny policy toggles.
- [ ] Keep security intent split: Helm grants physical infrastructure permissions; project config grants logical task capabilities.
