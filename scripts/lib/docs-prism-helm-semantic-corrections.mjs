// Pure exact-field corrections shared by native local-Helm maintenance and retained semantic projection.
// No discovery, filesystem, caller-provided authority, registry rewrite or runtime execution.
const corrections = {
  "$.ingestion.quarantineTtlMs": {
    "purpose": "Sets the minimum age in milliseconds at which the ingestion reaper can delete acquired digest-named quarantine files. It does not set the lifetime of the ingestion service.",
    "acceptedValues": "An integer from 60,000 through 86,400,000 in the chart schema. Direct process input separately requires a safe integer and clamps it to this interval.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. Empty, zero, null that removes the required key, and values outside the chart bounds fail schema validation.",
    "impact": "Changes quarantine object retention. The reaper compares file mtime with the selected age; cleanup runs at startup and on a timer no longer than 60 seconds.",
    "failure": "Invalid chart input stops Helm before deployment. A quarantine filesystem error can fail startup or a later cleanup pass; a later pass reports its error and does not prove deletion."
  },
  "$.ingestion.resources.requests.cpu": {
    "acceptedValues": "When ingestion is enabled, a positive JSON number or a non-empty string matching the chart resourceQuantity pattern. The template quotes this selected value; the rendered quantity must also satisfy the receiving Kubernetes resource rules.",
    "emptyBehavior": "An omitted override keeps the merged value. When ingestion is enabled, all four request/limit leaves are required; an absent or empty leaf fails chart validation or the template required guard. Disabled empty placeholders do not establish usable sizing for an enabled workload.",
    "failure": "Enabled ingestion without complete valid sizing fails before a valid Deployment is produced. Valid quantities still depend on namespace admission and node capacity; a successful render is not readiness proof."
  },
  "$.ingestion.resources.requests.memory": {
    "acceptedValues": "When ingestion is enabled, a positive JSON number or a non-empty string matching the chart resourceQuantity pattern. The template quotes this selected value; the rendered quantity must also satisfy the receiving Kubernetes resource rules.",
    "emptyBehavior": "An omitted override keeps the merged value. When ingestion is enabled, all four request/limit leaves are required; an absent or empty leaf fails chart validation or the template required guard. Disabled empty placeholders do not establish usable sizing for an enabled workload.",
    "failure": "Enabled ingestion without complete valid sizing fails before a valid Deployment is produced. Valid quantities still depend on namespace admission and node capacity; a successful render is not readiness proof."
  },
  "$.ingestion.resources.limits.cpu": {
    "acceptedValues": "When ingestion is enabled, a positive JSON number or a non-empty string matching the chart resourceQuantity pattern. The template quotes this selected value; the rendered quantity must also satisfy the receiving Kubernetes resource rules.",
    "emptyBehavior": "An omitted override keeps the merged value. When ingestion is enabled, all four request/limit leaves are required; an absent or empty leaf fails chart validation or the template required guard. Disabled empty placeholders do not establish usable sizing for an enabled workload.",
    "failure": "Enabled ingestion without complete valid sizing fails before a valid Deployment is produced. Valid quantities still depend on namespace admission and node capacity; a successful render is not readiness proof."
  },
  "$.ingestion.resources.limits.memory": {
    "acceptedValues": "When ingestion is enabled, a positive JSON number or a non-empty string matching the chart resourceQuantity pattern. The template quotes this selected value; the rendered quantity must also satisfy the receiving Kubernetes resource rules.",
    "emptyBehavior": "An omitted override keeps the merged value. When ingestion is enabled, all four request/limit leaves are required; an absent or empty leaf fails chart validation or the template required guard. Disabled empty placeholders do not establish usable sizing for an enabled workload.",
    "failure": "Enabled ingestion without complete valid sizing fails before a valid Deployment is produced. Valid quantities still depend on namespace admission and node capacity; a successful render is not readiness proof."
  },
  "$.worker.native.closeTimeoutMs": {
    "acceptedValues": "An integer from 1 through 2,147,483,647 milliseconds. The template also requires worker.shutdownTimeoutMs > worker.native.closeTimeoutMs + 10000 and worker.terminationGracePeriodSeconds * 1000 > worker.shutdownTimeoutMs.",
    "emptyBehavior": "An omitted override keeps the merged chart or file value. Zero, an empty string, null that removes the required key, and out-of-range values fail the chart schema; zero is not a no-wait selector and omission does not delegate this required value to a Kubernetes default.",
    "failure": "Helm stops when the scalar bounds or strict timeout relations fail. The template also requires worker.shutdownTimeoutMs > worker.native.closeTimeoutMs + 10000 and worker.terminationGracePeriodSeconds * 1000 > worker.shutdownTimeoutMs. A valid render does not prove that every running operation can finish within these budgets."
  },
  "$.worker.shutdownTimeoutMs": {
    "acceptedValues": "An integer from 1 through 2,147,483,647 milliseconds. The template also requires worker.shutdownTimeoutMs > worker.native.closeTimeoutMs + 10000 and worker.terminationGracePeriodSeconds * 1000 > worker.shutdownTimeoutMs.",
    "emptyBehavior": "An omitted override keeps the merged chart or file value. Zero, an empty string, null that removes the required key, and out-of-range values fail the chart schema; zero is not a no-wait selector and omission does not delegate this required value to a Kubernetes default.",
    "failure": "Helm stops when the scalar bounds or strict timeout relations fail. The template also requires worker.shutdownTimeoutMs > worker.native.closeTimeoutMs + 10000 and worker.terminationGracePeriodSeconds * 1000 > worker.shutdownTimeoutMs. A valid render does not prove that every running operation can finish within these budgets."
  },
  "$.worker.terminationGracePeriodSeconds": {
    "acceptedValues": "An integer from 1 through 2,147,483 seconds. The template also requires worker.shutdownTimeoutMs > worker.native.closeTimeoutMs + 10000 and worker.terminationGracePeriodSeconds * 1000 > worker.shutdownTimeoutMs.",
    "emptyBehavior": "An omitted override keeps the merged chart or file value. Zero, an empty string, null that removes the required key, and out-of-range values fail the chart schema; zero is not a no-wait selector and omission does not delegate this required value to a Kubernetes default.",
    "failure": "Helm stops when the scalar bounds or strict timeout relations fail. The template also requires worker.shutdownTimeoutMs > worker.native.closeTimeoutMs + 10000 and worker.terminationGracePeriodSeconds * 1000 > worker.shutdownTimeoutMs. A valid render does not prove that every running operation can finish within these budgets."
  },
  "$.workerTrust.spiffe.agentServiceAccount": {
    "acceptedValues": "A string matching ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ for the agent ServiceAccount name. The schema applies when the enclosing spiffe/envoy object is present, even when spiffe.enabled is false.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. An explicit empty string fails this field constraint. Removing a required key with null fails the enclosing object schema even when SPIFFE is disabled. Disabled runtime use does not waive schema validation.",
    "failure": "Helm chart-schema validation rejects an absent required key or an invalid present value. A schema-valid value does not prove installed identity infrastructure, successful authentication or workload readiness."
  },
  "$.workerTrust.spiffe.novaServiceAccount": {
    "acceptedValues": "A string matching ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ for the Nova ServiceAccount name. The schema applies when the enclosing spiffe/envoy object is present, even when spiffe.enabled is false.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. An explicit empty string fails this field constraint. Removing a required key with null fails the enclosing object schema even when SPIFFE is disabled. Disabled runtime use does not waive schema validation.",
    "failure": "Helm chart-schema validation rejects an absent required key or an invalid present value. A schema-valid value does not prove installed identity infrastructure, successful authentication or workload readiness."
  },
  "$.workerTrust.spiffe.csiDriver": {
    "acceptedValues": "A non-empty string naming the CSI driver. The schema does not verify that the driver is installed. The schema applies when the enclosing spiffe/envoy object is present, even when spiffe.enabled is false.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. An explicit empty string fails this field constraint. Removing a required key with null fails the enclosing object schema even when SPIFFE is disabled. Disabled runtime use does not waive schema validation.",
    "failure": "Helm chart-schema validation rejects an absent required key or an invalid present value. A schema-valid value does not prove installed identity infrastructure, successful authentication or workload readiness."
  },
  "$.workerTrust.spiffe.trustDomain": {
    "acceptedValues": "A string matching ^[a-z0-9.-]+$ for the SPIFFE trust domain. The schema applies when the enclosing spiffe/envoy object is present, even when spiffe.enabled is false.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. An explicit empty string fails this field constraint. Removing a required key with null fails the enclosing object schema even when SPIFFE is disabled. Disabled runtime use does not waive schema validation.",
    "failure": "Helm chart-schema validation rejects an absent required key or an invalid present value. A schema-valid value does not prove installed identity infrastructure, successful authentication or workload readiness."
  },
  "$.workerTrust.spiffe.socketPath": {
    "acceptedValues": "A string starting with / for the workload API socket path. The schema does not prove the socket is available. The schema applies when the enclosing spiffe/envoy object is present, even when spiffe.enabled is false.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. An explicit empty string fails this field constraint. Removing a required key with null fails the enclosing object schema even when SPIFFE is disabled. Disabled runtime use does not waive schema validation.",
    "failure": "Helm chart-schema validation rejects an absent required key or an invalid present value. A schema-valid value does not prove installed identity infrastructure, successful authentication or workload readiness."
  },
  "$.workerTrust.spiffe.envoy.pullPolicy": {
    "acceptedValues": "Exactly Always, IfNotPresent or Never. This is the Envoy image policy, not the separate main Prism image policy. The schema applies when the enclosing spiffe/envoy object is present, even when spiffe.enabled is false.",
    "emptyBehavior": "An omitted override retains the merged chart or file value. An explicit empty string fails this field constraint. Removing a required key with null fails the enclosing object schema even when SPIFFE is disabled. Disabled runtime use does not waive schema validation.",
    "failure": "Helm chart-schema validation rejects an absent required key or an invalid present value. A schema-valid value does not prove installed identity infrastructure, successful authentication or workload readiness."
  }
};
const approvedIdentities = new Set([
  "charts/prism/values.yaml#$.ingestion.quarantineTtlMs",
  "charts/prism/values.yaml#$.ingestion.resources.limits.cpu",
  "charts/prism/values.yaml#$.ingestion.resources.limits.memory",
  "charts/prism/values.yaml#$.ingestion.resources.requests.cpu",
  "charts/prism/values.yaml#$.ingestion.resources.requests.memory",
  "charts/prism/values.yaml#$.worker.native.closeTimeoutMs",
  "charts/prism/values.yaml#$.worker.shutdownTimeoutMs",
  "charts/prism/values.yaml#$.worker.terminationGracePeriodSeconds",
  "charts/prism/values.yaml#$.workerTrust.spiffe.agentServiceAccount",
  "charts/prism/values.yaml#$.workerTrust.spiffe.csiDriver",
  "charts/prism/values.yaml#$.workerTrust.spiffe.envoy.pullPolicy",
  "charts/prism/values.yaml#$.workerTrust.spiffe.novaServiceAccount",
  "charts/prism/values.yaml#$.workerTrust.spiffe.socketPath",
  "charts/prism/values.yaml#$.workerTrust.spiffe.trustDomain",
  "my-values/prism-values.yaml#$.workerTrust.spiffe.agentServiceAccount",
  "my-values/prism-values.yaml#$.workerTrust.spiffe.trustDomain"
]);
export function prismHelmScalarCorrection(field) {
  if (!field || !approvedIdentities.has(`${field.sourcePath}#${field.path}`)) return null;
  return { ...corrections[field.path] };
}
