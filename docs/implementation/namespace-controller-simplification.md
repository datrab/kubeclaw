# Namespace Controller Simplification

Status: repository implementation complete; live rollout pending.

## Purpose

The namespace controller is a small environment broker. It creates and deletes
temporary `test-*` namespaces. It does not run tests and does not contain product
logic.

## Supported Operations

1. Create one broker-owned namespace.
2. Bind approved service accounts to a `deployer` or `tester` Role.
3. Copy explicitly approved infrastructure Secrets.
4. Create or wait for one dedicated preview-login Secret.
5. Expose one Service through the Tailscale IngressClass.
6. Report internal DNS, preview URL, credential availability, and expiry.
7. Delete the namespace on lease deletion or TTL expiry.

Port-forward is not supported. In-cluster clients use Service DNS. Human users use
the Tailscale URL.

## Access Model

Each lease explicitly requests its subjects. The controller accepts only subjects
and modes configured in `busterNamespaceBroker.controller.allowedAccess`.

- `deployer` manages namespaced workloads, Services, ConfigMaps, Jobs, and PVCs.
- `tester` manages bounded test workloads without storage, Secret, RBAC, or Ingress
  authority.

Neither Role can read arbitrary Secrets, create RBAC, create an Ingress, or use
`pods/portforward`.

Both modes can create Pods. A Pod can consume a copied infrastructure Secret.
Therefore, each copied Secret is trusted for every workload-capable subject in the
lease. The source allowlist is a deployment policy boundary, not only a copy list.
It must contain test-only Secrets. It must not contain production provider,
runtime, or database credentials.

## Secret Model

`secretsToCopy` accepts only names configured in `allowedSourceSecrets`. The trusted
controller reads source values through a namespaced Role with explicit
`resourceNames`. The controller has no cluster-wide Secret permission. For each
broker-owned namespace, it binds its own service account to the fixed
`buster-controller-secrets` ClusterRole. This gives the controller Secret access
only in that target namespace. Runners do not receive Secret-list authority.

User-deliverable credentials use a separate Secret. A lease can ask the controller
to generate it or wait for the application to create it. The controller grants
`get` only for that exact Secret name to the declared readers. All subjects that
can create workloads in the namespace must be readers because Kubernetes lets a
Pod mount a namespace Secret without `secrets/get` permission for its creator.
Values never enter lease status, events, or logs.

Helm clients must use `HELM_DRIVER=configmap`. This keeps Helm release state out of
Secrets.

## Lifecycle Rules

- `namespaceName` and the complete lease spec are immutable.
- TTL is required, has a 60-second minimum, and has a configured maximum.
- `cleanupPolicy` is `delete` or `retain`. `retain` tells the client to leave the
  lease active for preview use. The required TTL still deletes it. Explicit lease
  deletion always deletes the namespace.
- The controller verifies lease name and UID labels before it adopts, changes, or
  deletes a namespace.
- TTL cleanup applies after provisioning failures as well as successful runs.
- Lease deletion is idempotent and protected by a finalizer.
- Tailscale exposure waits for a Service with ready Endpoints.
- Disabling exposure removes the controller-owned Ingress.

## Live Rollout

1. Publish the namespace-controller image by digest.
2. Deploy the complete Buster Helm release so CRD, ClusterRole, binding, values, and
   Deployment change together.
3. Confirm that the controller can create Roles but runners cannot read arbitrary
   Secrets or use port-forward.
4. Create a short smoke lease with no copied Secrets.
5. Confirm Service DNS and automatic deletion.
6. Create the Prism lease with approved copied Secrets and generated preview
   credentials.
7. Install Prism with `HELM_DRIVER=configmap`.
8. Confirm Prism through Service DNS and Studio through Tailscale.
9. Read only the dedicated preview credential Secret and deliver it privately.
10. Delete the lease and confirm complete namespace cleanup.

## Release Gates

- Go controller tests pass.
- Helm lint and render checks pass.
- Kubernetes fixture contract and provider tests pass.
- No rendered Role contains `pods/portforward`.
- No runner Role has broad Secret-read authority.
- A real leased namespace passes creation, DNS, Tailscale, credential, TTL, and
  deletion tests.

If Go is not installed in the operator workspace, the controller image build must
run the Go tests before it publishes the image. A local Helm or TypeScript pass does
not replace this gate.
