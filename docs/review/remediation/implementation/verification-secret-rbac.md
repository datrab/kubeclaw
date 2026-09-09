# Namespace-scoped verification Secret — IFR-17-001

The Nova verification ClusterRole no longer grants Secret reads. A separate Role and RoleBinding grant only `get` on the configured OAuth Secret inside the configured operator namespace. The ServiceAccount subject stays in the agent release namespace. Resource names include a hash of release name and release namespace to distinguish agent releases sharing one operator namespace. Existing cluster-level Pod and IngressClass visibility is unchanged.

The actual consumer is `checkTailscaleOauthSecret()` in `tests/verification/e2e/check-real-e2e-capabilities.mjs`: it uses `TAILSCALE_OPERATOR_NAMESPACE` and `TAILSCALE_OAUTH_SECRET_NAME` for a namespaced kubectl request. The chart now provides both from `busterNamespaceBroker.leaseClient.verificationRead`, using the existing defaults `tailscale` and `operator-oauth`. There is no cluster Secret read fallback. Empty configured namespace/name is rejected when granting verification access. Secret contents are not added to environment variables.

The existing probe performs an ordinary Secret GET. Kubernetes RBAC does not turn that into a metadata-only permission; the authorized Secret remains readable. This patch narrows its namespace and name, rather than claiming data-access elimination.

The operator namespace and Secret must already exist. This agent Helm release creates/owns only its Role and RoleBinding there. It neither creates the operator namespace nor takes ownership of the Secret. Uninstalling the agent release removes its RBAC objects and does not request namespace/Secret removal. The installer needs authority to manage those RBAC resources in the existing operator namespace. These are manifest ownership semantics, not a performed install/uninstall.

## Current evidence

Before editing, the new regression executed actual Helm against Nova values and failed because the Secret grant was a ClusterRole. After the change:

- `node tests/verification/deployment/check-verification-secret-rbac.mjs` passes actual Helm default/custom/disabled renders plus empty-scope negative cases. Parsed Role/Binding structure proves one named Secret/get grant in one namespace, no cluster Secret grant, correct cross-namespace ServiceAccount identity, matching probe environment, and no owned operator Namespace. A same-named Secret in an unrelated namespace has no grant in this rendered RBAC graph; this is not a live 403 observation.
- Original `check-role-chart.mjs` and `check-deployment-truth.mjs --source-root "$PWD"` pass.
- `check-git-disabled.mjs` still passes all 16 combinations after the environment additions.
- `helm lint charts/kubeclaw -f my-values/nova-values.yaml` passes.
- Scoped `git diff --check` passes.

The optional existing `check-real-e2e-capabilities.test.mjs` could not import `ioredis` in this checkout; its exact dependency is 5.11.1 in runtime tool locks. No substitute client or root dependency change was introduced. No API request, credential access, namespace creation, deployment, or CI execution occurred. Actual allowed access and 403 denial for same-named control-namespace and other Secrets remain live verification steps.
