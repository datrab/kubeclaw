# Setup Flow

## Prerequisites

`./scripts/deploy.sh setup` configures an **existing Kubernetes cluster**. It does
not install K3s, initialize a control node, restore a datastore, or prepare worker
hosts. Select and verify the intended kubectl context before running it. The
selected API must be reachable with working credentials and permission to list
namespaces and create the target namespace if absent. The lookup uses a name field
selector; this still requires the Kubernetes `list` verb, not just `get` on a
named namespace. Install kubectl, Node.js, Bash and Helm on
the operator machine; Helm needs access to the configured chart repositories.

Cluster version, CNI, DNS, StorageClasses and persistent-volume recovery must be
prepared separately for the selected environment. Native worker host preparation
and capacity checks are separate deployment steps; see
[native worker node setup](../operations/native-worker-host-pools.md). An absent
namespace is not evidence of a fresh or empty cluster. Do not reinstall the
cluster in response to an API, credential or authorization failure.

## Procedure

Run `NAMESPACE=<workspace> ./scripts/deploy.sh setup`. The script lists namespaces
with `--field-selector metadata.name=<workspace> -o json`. It validates the
returned list and exact namespace identity. A successful one-item list preserves
the existing namespace; a successful empty list requests its creation. Malformed
or unexpected responses stop setup. No `--ignore-not-found` flag or error-text
matching can turn an API error into an empty namespace list. Any failed lookup stops setup before namespace creation,
Helm repository changes or secret setup; its kubectl diagnostic remains visible.
A failed creation also stops the sequence, including a race in which another
operator created the namespace first.

After the namespace step, setup adds the configured Helm repositories, updates
them and runs secret setup according to `KUBECLAW_RUN_SECRET_SETUP`. In a
noninteractive session its default `auto` skips secret setup; explicitly provision
and verify the required secrets before deploying workloads. Choose the reviewed
image or code bundle, configure trusted plugin roots and deploy the Helm release.

## Verify and repeat

Check the intended context and namespace, then render the chart and run the
deployment truth check before deployment. A lookup failure requires repairing
connectivity, context, credentials or API permissions first. Rerun the same setup
command after repair; an existing namespace is preserved. If a later repository
or secret step failed, earlier successful changes remain. Setup does not roll
back the namespace or delete its data. A rerun is not a host restore procedure.

The automated namespace guard tests execute the original shell command with CLI
fixtures. They prove command ordering and stopping on CLI failures; they do not
prove real Kubernetes authorization, host installation, storage recovery or node
admission. Those require an isolated environment and the full bootstrap and
recovery acceptance checks.

## Troubleshooting

The deployment release guard and Helm uninstall helper first list the selected
Helm backend's raw release records in the namespace, with labels
`owner=helm,name=<release>`. They support the default Secret backend
(`HELM_DRIVER` unset, `secret` or `secrets`) and ConfigMaps (`configmap` or
`configmaps`). Other drivers stop the operation before mutation; SQL and memory
storage are not supported by this observation contract. Read/list permission on
the selected backend is required, plus named-record read permission for Helm.

Helm and kubectl must use the same shared `KUBECONFIG` context. Deployment/setup/
teardown entrypoints reject nonempty Helm-only connection overrides before cluster
lookup: `HELM_KUBECONTEXT`, `HELM_KUBETOKEN`, `HELM_KUBEASUSER`,
`HELM_KUBEASGROUPS`, `HELM_KUBEAPISERVER`, `HELM_KUBECAFILE`,
`HELM_KUBETLS_SERVER_NAME` and `HELM_KUBEINSECURE_SKIP_TLS_VERIFY`.
Move the intended connection/authentication settings into the shared kubeconfig;
errors name the conflicting setting without printing its value.

Only a successful, validated empty raw collection means the release is absent.
For an existing release, every returned record must have the expected resource
kind, namespace, record name, release label, unique positive revision and known
status. Each revision is then read with `helm status --revision <N> -o json` and
its decoded identity, revision and status must match that record. This checks
all stored history, oldest first, before using the newest status; it performs one
storage list and one Helm status read per revision. There is no history cap or
fallback to an older readable record. Repair a corrupt record through a reviewed
Helm recovery procedure; do not delete history merely to pass the guard.

A decoded `helm list` result alone cannot establish absence or the latest status:
Helm can silently omit corrupt records. Pending installation, upgrade or rollback,
an uninstall in progress, and unknown status stop deployment. The GitOps ownership
check still runs first. These observations are not a lock: maintain a single
operator and stop on concurrent changes or errors.

Tailscale OAuth-secret bootstrap and the conditional resource deletion helpers
use resource collection queries with an exact `metadata.name` field selector.
They require `list` permission on the relevant resource, even if the operator
already has named-resource `get` permission. This covers Secrets, ConfigMaps,
Deployments, Services and Jobs in the selected namespace, and
ValidatingAdmissionPolicies at cluster scope. The existing create, apply,
uninstall and delete permissions remain necessary for the requested operation.

Only a successful, validated empty collection means absence. A nonzero command,
including a credential error containing “not found”, stops the operation. Wrong
identity, duplicate items, unexpected API/kind or malformed JSON also stop it.
A collection with a nonempty or invalid continuation token is incomplete and
cannot establish absence, including during namespace setup.
An existing OAuth Secret is preserved. Failed creation/application stops before
the operator Helm upgrade. Validation errors do not print Secret response bodies.
Status tables remain informational: failed lookups report incomplete observations
and never claim the collection is empty.

Repair credentials, connectivity or permissions before retrying. A failure does
not undo earlier successful changes: teardown can have removed earlier resources
before a later lookup fails. Its existing ownership checks, confirmation prompts,
manifest/selector deletion scope and PVC behavior remain in force; this guard is
not a backup or recovery procedure. Observations are not atomic with later
mutations, so avoid concurrent operators. The CLI-fixture tests demonstrate these
shell decisions, not actual cluster permissions, persistence or recovery.
