import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../../../scripts/deploy.sh",import.meta.url),"utf8");
const chartValues=readFileSync(new URL("../../../charts/prism/values.yaml",import.meta.url),"utf8");
const chartSchema=readFileSync(new URL("../../../charts/prism/values.schema.json",import.meta.url),"utf8");
const workloads=readFileSync(new URL("../../../charts/prism/templates/workloads.yaml",import.meta.url),"utf8");
const jobs=readFileSync(new URL("../../../charts/prism/templates/jobs.yaml",import.meta.url),"utf8");
const ingestion=readFileSync(new URL("../../../charts/prism/templates/ingestion.yaml",import.meta.url),"utf8");
const postgresql=readFileSync(new URL("../../../charts/prism/templates/postgresql.yaml",import.meta.url),"utf8");
const networkPolicy=readFileSync(new URL("../../../charts/prism/templates/networkpolicy.yaml",import.meta.url),"utf8");
const serviceAccounts=readFileSync(new URL("../../../charts/prism/templates/serviceaccounts.yaml",import.meta.url),"utf8");
const workerTrust=readFileSync(new URL("../../../charts/prism/templates/configmap-worker-trust.yaml",import.meta.url),"utf8");
const liveAcceptance=readFileSync(new URL("../live/prism-nova-production-e2e.mjs",import.meta.url),"utf8");
const namespacePolicies=readFileSync(new URL("../../../my-values/infra/network-policies.yaml",import.meta.url),"utf8");
const productionValues=readFileSync(new URL("../../../my-values/prism-values.yaml",import.meta.url),"utf8");
const agentValues=readFileSync(new URL("../../../my-values/prism-agent-values.yaml",import.meta.url),"utf8");
const agentBridge=readFileSync(new URL("../../../skills/prism/server/agent-bridge.mjs",import.meta.url),"utf8");
const studioServer=readFileSync(new URL("../../../skills/prism/server/studio.ts",import.meta.url),"utf8");
const control=readFileSync(new URL("../../../skills/prism/server/control.ts",import.meta.url),"utf8");
const databaseBootstrap=readFileSync(new URL("../../../skills/prism/server/bootstrap-database.ts",import.meta.url),"utf8");
const databaseMigrate=readFileSync(new URL("../../../skills/prism/server/migrate.ts",import.meta.url),"utf8");
const firstMigration=readFileSync(new URL("../../../skills/prism/storage/migrations/001_prism.sql",import.meta.url),"utf8");
const imageWorkflow=readFileSync(new URL("../../../.github/workflows/build-images.yaml",import.meta.url),"utf8");
for(const command of ["prism)","prism-smoke)","prism-e2e)","prism-status)","teardown-prism)"])assert(source.includes(command),`missing deploy command: ${command}`);
for(const guard of ["--atomic","PRISM_CONTROL_IMAGE_REPOSITORY","PRISM_CONTROL_IMAGE_DIGEST","Prism values file is missing"])assert(source.includes(guard),`missing Prism deployment behavior: ${guard}`);
assert.match(source,/cmd_prism\(\)[\s\S]*require_spiffe_csi_driver[\s\S]*cmd_prism_secrets/u,
  "Prism deployment must fail before Helm when the SPIFFE CSI driver is unavailable");
assert.match(source,/cmd_prism\(\)[\s\S]*require_helm_release_idle "\$PRISM_RELEASE" "\$PRISM_NAMESPACE"[\s\S]*require_helm_release_idle agent-prism "\$PRISM_NAMESPACE"[\s\S]*cmd_prism_secrets/u,
  "Prism deployment must reject pending operations for both owned Helm releases before changing cluster state");
assert(!source.includes("PRISM_APPROVER_USERS"),"Prism deployment must not require an approver allowlist");
assert(source.includes("PRISM_CONTROL_IMAGE_DIGEST"),"Prism deployment must require an immutable control image digest");
assert(!source.includes("reconcile_prism_provider_secret"),"Prism worker deployment must not own model-provider credentials");
assert(source.includes("PRISM_AGENT_VALUES_FILE"),"Prism must deploy its OpenClaw agent release");
assert.match(source,/prism:archive_url[\s\S]*PRISM_CODE_BUNDLE_ARCHIVE_URL[\s\S]*cmd_prism\(\)[\s\S]*append_code_bundle_override_file[\s\S]*-f "\$prism_bundle_override"/u,
  "Prism deploy must install its versioned runtime code bundle");
assert.match(agentValues,/codeBundle:[\s\S]*existingSecret:\s*"github-bundle-reader"/u,
  "Prism code bundle must use the existing private-release reader");
assert.match(agentValues,/repoUrl:\s*"git@github\.com:datrab\/kubeclaw\.git"/u,
  "Prism project checkout must remain on the explicit SSH remote");
for(const sourceText of [agentValues,agentBridge]){
  assert(sourceText.includes("/app/skills/packages/prism-contract/schemas/prism-v1.schema.json"),
    "Prism prompts must read the canonical schema from the code bundle");
  assert(sourceText.includes("/app/skills/packages/prism-contract/fixtures/minimal-web.json"),
    "Prism prompts must read the fixture from the code bundle");
  assert(!sourceText.includes("git-repo/contracts/prism"),
    "Prism prompts must not couple runtime contracts to the project checkout");
}
assert(source.includes("Missing image pull Secret: ${PRISM_NAMESPACE}/${PRISM_IMAGE_PULL_SECRET_NAME}"),"Prism must preflight its configured pull Secret");
assert(source.includes("secretsToCopy: [prism-test-runtime, prism-test-postgresql-auth, prism-test-ghcr, openclaw-shared-secrets, git-deploy-key-nova]"),"leased Prism acceptance must copy the OpenClaw agent and isolated fixture Secrets through the broker");
assert(source.includes("[[ $lease_phase == Ready ]]"),"leased Prism acceptance must fail closed unless the broker reports Ready");
assert(chartValues.includes("digest: \"\""),"Prism chart values must require image digests from deployment authority");
assert(chartValues.includes("imagePullSecrets:"),"Prism chart defaults must configure GHCR authentication");
assert(imageWorkflow.includes("type=raw,value=latest"),"Prism image workflow must publish the default chart tag");
assert.match(studioServer,/prismProxyResponseHeaders\(upstream\.headers\)[\s\S]*setHeader\("set-cookie", forwarded\.setCookies\)/u,
  "Prism Studio must forward the session and CSRF Set-Cookie headers as separate values");
for(const values of [chartValues,productionValues])for(const kind of ["control","studio","worker","ingestion"])
  assert(values.includes(`${kind}: { repository: ghcr.io/datrab/kubeclaw-prism-${kind}, digest: \"\"`),
    `Prism ${kind} values must require an immutable digest`);
assert(/imagePullSecrets:\r?\n  - name: ghcr-secret/u.test(productionValues),"Prism production values must reuse the Nova/Buster GHCR Secret");
assert(productionValues.includes("studio: { replicas: 1"),"Prism Studio must default to one production replica");
assert(productionValues.includes("worker: { replicas: 1"),"Prism Worker must default to one production replica");
for(const template of [workloads,jobs,ingestion,postgresql])assert(template.includes("imagePullSecrets:"),"every Prism pod template must render imagePullSecrets");
assert(workloads.includes("runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000"),
  "Prism application pods must use a numeric non-root identity; the images declare the named node user");
assert(jobs.includes("runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000"),
  "Prism migration jobs must use the control image's numeric non-root identity");
assert.match(jobs,/name: bootstrap-database-roles[\s\S]*mountPath: \/tmp[\s\S]*name: migrate[\s\S]*mountPath: \/tmp[\s\S]*name: tmp[\s\S]*emptyDir:/u,
  "Prism migration containers need a writable temporary filesystem under a read-only root");
assert.match(source,/capture_prism_migration_logs[\s\S]*bootstrap-database-roles migrate[\s\S]*Prism Helm deployment failed; captured migration output follows/u,
  "Prism deployment must preserve migration diagnostics before atomic cleanup");
assert.doesNotMatch(source,/kubectl rollout restart deployment\/"\$prism_workload"/u,
  "Prism deploys must not restart digest-pinned application images");
assert.match(databaseBootstrap,/ECONNREFUSED[\s\S]*maxAttempts = 60[\s\S]*retrying bootstrap/u,
  "Prism database bootstrap must tolerate bounded PostgreSQL startup races");
assert.match(databaseBootstrap,/GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA prism TO prism_runtime[\s\S]*ALTER DEFAULT PRIVILEGES FOR ROLE prism_migrator/u,
  "Prism bootstrap must repair runtime privileges left by interrupted migrations");
assert.match(databaseMigrate,/infrastructure: "preprovisioned"/u,
  "the production migrator must require infrastructure prepared by the admin bootstrap");
assert.doesNotMatch(firstMigration,/CREATE EXTENSION|CREATE ROLE|CREATE SCHEMA/u,
  "ordinary Prism schema migrations must not require database-wide administrative privileges");
assert(ingestion.includes("runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000"),
  "Prism ingestion must use its image's numeric non-root identity");
assert(postgresql.includes("PGDATA, value: /var/lib/postgresql/data/pgdata"),"Prism PostgreSQL must initialize an ownership-safe PGDATA child directory");
assert(!chartSchema.includes("approverUsers"),"Prism chart schema must not expose an approver allowlist");
assert(!workloads.includes("PRISM_APPROVER_USERS"),"Prism workloads must not configure an approver allowlist");
assert(!workloads.includes("PRISM_PROVIDER_"),"Prism worker must not receive model-provider credentials");
assert(networkPolicy.includes("prism-openclaw-agent"),"Prism must isolate its OpenClaw agent network path");
assert(networkPolicy.includes("port: 4000"),"only the Prism OpenClaw agent path may reach internal LiteLLM");
assert.match(networkPolicy,/name: prism-default-deny[\s\S]*?podSelector:[\s\S]*?key: app[\s\S]*?operator: In[\s\S]*?prism-control[\s\S]*?prism-test-runner/u,
  "Prism default-deny must select only Prism workloads when sharing the KubeClaw namespace");
assert.doesNotMatch(networkPolicy,/name: prism-default-deny\s*\}\s*\n?spec:\s*\{\s*podSelector:\s*\{\s*\}/u,
  "Prism default-deny must never select every pod in a shared namespace");
assert.doesNotMatch(networkPolicy,/name: prism-dns\s*\}\s*\n?spec:\s*\n?\s*podSelector:\s*\{\s*\}/u,
  "Prism DNS allowance must not broaden egress for every pod in a shared namespace");
assert(namespacePolicies.includes('port: 18891'),'Nova/Buster NetworkPolicies must include the provider-plan port 18891');
assert(!namespacePolicies.includes('port: 18892'),'Nova/Buster NetworkPolicies must not retain the retired suite-worker port 18892');
assert(!control.includes('roles.includes("approver")'),"any authenticated Prism user must be able to approve");
assert(/all\)[\s\S]*?cmd_prism[\s\S]*?cmd_agents/.test(source),"deploy all must install Prism before agents");
assert(source.includes('PRISM_NAMESPACE="${PRISM_NAMESPACE:-$NAMESPACE}"'),"Prism must default to the KubeClaw namespace");
assert(/if \[\[ \$role == "prism" \]\][\s\S]*?cmd_prism/.test(source),"agent prism must use the dedicated Prism command");
assert(!/kubectl create namespace "\$PRISM_NAMESPACE"/.test(source),"Prism must not create namespaces directly");
assert(!/kubectl delete namespace "\$PRISM_NAMESPACE"/.test(source),"Prism must not delete namespaces directly");
assert(!source.includes("kubectl port-forward"),"Prism acceptance must not use port-forward");
assert(source.includes("app: prism-test-runner"),"Prism acceptance must use an in-cluster test runner");
assert(source.includes('serviceAccountName: prism-test-runner'),"Prism acceptance must use its dedicated SPIFFE workload identity");
assert(source.includes('PRISM_CONTROL_URL, value: "http://127.0.0.1:18443"'),"Prism acceptance must enter control through the local Worker Trust proxy");
assert(source.includes('restartPolicy: Always'),"Prism acceptance must run Envoy as a native Job sidecar");
assert(serviceAccounts.includes('"test-runner"'),"Prism must create the acceptance runner ServiceAccount");
assert(workerTrust.includes('sa/prism-test-runner'),"Prism control must authorize the exact acceptance SPIFFE identity");
assert(workerTrust.includes('prism-control-internal'),"Prism acceptance must resolve control through the mTLS-only Service");
assert(!liveAcceptance.includes("createHmac"),"Prism acceptance must not retain the legacy dispatch HMAC");
assert(!liveAcceptance.includes("PRISM_E2E_DISPATCH_SECRET"),"Prism acceptance must not receive the legacy dispatch secret");
console.log(JSON.stringify({ok:true,contract:"deploy-prism-command.v1"}));
