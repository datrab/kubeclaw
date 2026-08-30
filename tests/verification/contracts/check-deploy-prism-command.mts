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
const control=readFileSync(new URL("../../../skills/prism/server/control.ts",import.meta.url),"utf8");
const imageWorkflow=readFileSync(new URL("../../../.github/workflows/build-images.yaml",import.meta.url),"utf8");
for(const command of ["prism)","prism-smoke)","prism-e2e)","prism-status)","teardown-prism)"])assert(source.includes(command),`missing deploy command: ${command}`);
for(const guard of ["--atomic","PRISM_CONTROL_IMAGE_REPOSITORY","PRISM_CONTROL_IMAGE_TAG","Prism values file is missing"])assert(source.includes(guard),`missing Prism deployment behavior: ${guard}`);
assert.match(source,/cmd_prism\(\)[\s\S]*require_spiffe_csi_driver[\s\S]*cmd_prism_secrets/u,
  "Prism deployment must fail before Helm when the SPIFFE CSI driver is unavailable");
assert(!source.includes("PRISM_APPROVER_USERS"),"Prism deployment must not require an approver allowlist");
assert(!source.includes("PRISM_CONTROL_IMAGE_DIGEST"),"Prism deployment must use ordinary tagged images");
assert(source.includes("reconcile_prism_provider_secret"),"Prism must create or explicitly reconcile its provider Secret from the existing LiteLLM credential");
assert(source.includes("PRISM_PROVIDER_ENDPOINT"),"Prism must expose an optional provider endpoint override");
assert(source.includes("PRISM_PROVIDER_SECRET_OVERWRITE"),"Prism provider Secret rotation must require an explicit overwrite switch");
assert(source.includes("does not match the requested provider route"),"Prism must fail closed when an existing provider Secret disagrees with requested overrides");
assert(source.includes("Missing image pull Secret: ${PRISM_NAMESPACE}/${PRISM_IMAGE_PULL_SECRET_NAME}"),"Prism must preflight its configured pull Secret");
assert(source.includes("secretsToCopy: [prism-test-provider, prism-test-runtime, prism-test-postgresql-auth, prism-test-ghcr]"),"leased Prism acceptance must copy isolated fixture Secrets through the broker");
assert(source.includes("[[ $lease_phase == Ready ]]"),"leased Prism acceptance must fail closed unless the broker reports Ready");
assert(!chartValues.includes("digest:"),"Prism chart values must not expose image digests");
assert(chartValues.includes("imagePullSecrets:"),"Prism chart defaults must configure GHCR authentication");
assert(imageWorkflow.includes("type=raw,value=latest"),"Prism image workflow must publish the default chart tag");
for(const values of [chartValues,productionValues]){
  assert(!values.includes("tag: main"),"Prism values must not request the unpublished main image tag");
  for(const kind of ["control","studio","worker","ingestion"])
    assert(values.includes(`${kind}: { repository: ghcr.io/datrab/kubeclaw-prism-${kind}, tag: latest`),
      `Prism ${kind} values must use the published latest image tag`);
}
assert(productionValues.includes("imagePullSecrets:\n  - name: ghcr-secret"),"Prism production values must reuse the Nova/Buster GHCR Secret");
assert(productionValues.includes("studio: { replicas: 1"),"Prism Studio must default to one production replica");
assert(productionValues.includes("worker: { replicas: 1"),"Prism Worker must default to one production replica");
for(const template of [workloads,jobs,ingestion,postgresql])assert(template.includes("imagePullSecrets:"),"every Prism pod template must render imagePullSecrets");
assert(workloads.includes("runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000"),
  "Prism application pods must use a numeric non-root identity; the images declare the named node user");
assert(postgresql.includes("PGDATA, value: /var/lib/postgresql/data/pgdata"),"Prism PostgreSQL must initialize an ownership-safe PGDATA child directory");
assert(!chartSchema.includes("approverUsers"),"Prism chart schema must not expose an approver allowlist");
assert(!workloads.includes("PRISM_APPROVER_USERS"),"Prism workloads must not configure an approver allowlist");
assert(networkPolicy.includes("providerNetworkPolicy.internalLiteLLM.namespace"),"Prism worker egress must select the configured LiteLLM namespace");
assert(networkPolicy.includes("port: 4000"),"Prism worker egress must allow the internal LiteLLM port");
for(const port of ["18891","18892"])assert(namespacePolicies.includes(`port: ${port}`),`Nova/Buster NetworkPolicies must include test-gate port ${port}`);
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
