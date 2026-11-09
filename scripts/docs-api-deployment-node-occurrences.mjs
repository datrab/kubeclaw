import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {qualifiedDeploymentYamlScalarGraph} from './docs-api-deployment-scalar-graph.mjs';
// UNADOPTED contextual qualification prototype. This function must never be
// wired as a standalone file-level stdout exemption. Its context is selected
// by a source/caller graph consumer, not inferred from CLI/string shape.
const contracts = [
  {
    "source": "scripts/bundle-values-field.mjs",
    "descriptor": {
      "line": 12,
      "sink": "process.stdout.write",
      "expression": "`${value}\\n`"
    },
    "sha256": "b8a920cbce4fbd538b310bdffd9c7b4ef324bb5bb59c7732459c66048f64d0b0"
  },
  {
    "source": "scripts/buster-resource-overlay.mjs",
    "descriptor": {
      "line": 21,
      "sink": "return",
      "expression": "`extraContainers[${indices[0]}].resources=${JSON.stringify(resources)}`"
    },
    "sha256": "178b5a326434ef80b45fb1ecc1587610d8db704e667e74e796fe7767f6bf5304"
  },
  {
    "source": "scripts/buster-resource-overlay.mjs",
    "descriptor": {
      "line": 26,
      "sink": "process.stdout.write",
      "expression": "export function busterResourceArgument(base, overlay) {\n  const resources=overlay?.busterRuntimeResources;\n  if(resources===undefined)return '';\n  if(!resources || typeof resources!=='object' || Array.isArray(resources)\n    || Object.keys(resources).some(k=>!['requests','limits'].includes(k)))throw new Error('BUSTER_RESOURCE_OVERLAY_INVALID');\n  for(const scope of ['requests','limits']) {\n    const v=resources[scope];\n    if(!v || typeof v!=='object' || Array.isArray(v) || !v.cpu || !v.memory\n      || Object.entries(v).some(([k,val])=>!['cpu','memory','ephemeral-storage'].includes(k) || typeof val!=='string' || !/^[0-9]+(?:\\.[0-9]+)?(?:m|Ki|Mi|Gi|Ti)?$/.test(val)))throw new Error('BUSTER_RESOURCE_OVERLAY_INVALID');\n  }\n  const containers=overlay.extraContainers ?? base.extraContainers;\n  const indices=containers?.flatMap((c,i)=>c.name==='buster-v2-runtime'?[i]:[]) ?? [];\n  if(indices.length!==1)throw new Error('BUSTER_RESOURCE_CONTAINER_REQUIRED');\n  return `extraContainers[${indices[0]}].resources=${JSON.stringify(resources)}`;\n}"
    },
    "sha256": "178b5a326434ef80b45fb1ecc1587610d8db704e667e74e796fe7767f6bf5304"
  },
  {
    "source": "scripts/bundle-override-values.mjs",
    "descriptor": {
      "line": 10,
      "sink": "process.stdout.write",
      "expression": "`codeBundle: ${JSON.stringify(codeBundle)}\\n`"
    },
    "sha256": "81fcc460046007538475e5ac02048f9855674d1dc70556fba2ddf4ac5587d51a"
  }
];
const appendSink = {line:365,command:'node',args:['$REPO_DIR/scripts/bundle-override-values.mjs','$archive_url','$expected_commit','$contract_version','$auth_secret','$auth_key']};
// A source-level classification request is NEVER sufficient. The old interface
// remains fail-closed even for exact helper bytes and forged matching labels.
export function contextualDeploymentNodeOutputRole() { return null; }

// Enumerate evidence about this fixed, physically verified deployment graph.
// No source descriptor/context is accepted and NO file-level role is returned.
// Downstream classification must retain caller AND receiver occurrence identity;
// integrating these observations as a role still requires its own review/tests.
const edges = [
  {
    "source": "scripts/bundle-values-field.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1341,
      "text": "      bundle_auth_secret=\"$(bundle_values_field \"$values_file\" \"$private_values\" auth existingSecret)\" || return 1"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1383,
        "text": "    append_code_bundle_override_file \"$override_file\" \"$bundle_archive_url\" \"$bundle_expected_commit\" \"$bundle_contract_version\" \"$bundle_auth_secret\" \"$bundle_auth_key\" || { rm -f \"$override_file\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1398,
        "text": "    helm_args+=(--values \"$override_file\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1401,
        "text": "  if ! render_selected_role \"$role\" \"agent-${role}\" \"$NAMESPACE\" \"$mode\" \"${helm_args[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1413,
        "text": "    --reset-values \"${helm_args[@]}\" --atomic --cleanup-on-fail --wait --timeout \"$AGENT_HELM_TIMEOUT\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1415,
        "text": "  if ! helm \"${helm_args[@]}\"; then"
      }
    ]
  },
  {
    "source": "scripts/bundle-values-field.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1345,
      "text": "      values_auth_key=\"$(bundle_values_field \"$values_file\" \"$private_values\" auth existingSecretKey)\" || return 1"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1383,
        "text": "    append_code_bundle_override_file \"$override_file\" \"$bundle_archive_url\" \"$bundle_expected_commit\" \"$bundle_contract_version\" \"$bundle_auth_secret\" \"$bundle_auth_key\" || { rm -f \"$override_file\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1398,
        "text": "    helm_args+=(--values \"$override_file\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1401,
        "text": "  if ! render_selected_role \"$role\" \"agent-${role}\" \"$NAMESPACE\" \"$mode\" \"${helm_args[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1413,
        "text": "    --reset-values \"${helm_args[@]}\" --atomic --cleanup-on-fail --wait --timeout \"$AGENT_HELM_TIMEOUT\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1415,
        "text": "  if ! helm \"${helm_args[@]}\"; then"
      }
    ]
  },
  {
    "source": "scripts/bundle-values-field.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1358,
      "text": "    if [[ -z $bundle_archive_url ]]; then bundle_archive_url=\"$(bundle_values_field \"$values_file\" \"$private_values\" archiveUrl)\" || return 1; fi"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1383,
        "text": "    append_code_bundle_override_file \"$override_file\" \"$bundle_archive_url\" \"$bundle_expected_commit\" \"$bundle_contract_version\" \"$bundle_auth_secret\" \"$bundle_auth_key\" || { rm -f \"$override_file\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1398,
        "text": "    helm_args+=(--values \"$override_file\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1401,
        "text": "  if ! render_selected_role \"$role\" \"agent-${role}\" \"$NAMESPACE\" \"$mode\" \"${helm_args[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1413,
        "text": "    --reset-values \"${helm_args[@]}\" --atomic --cleanup-on-fail --wait --timeout \"$AGENT_HELM_TIMEOUT\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1415,
        "text": "  if ! helm \"${helm_args[@]}\"; then"
      }
    ]
  },
  {
    "source": "scripts/bundle-values-field.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1680,
      "text": "    prism_bundle_auth_secret=\"$(bundle_values_field \"$PRISM_AGENT_VALUES_FILE\" \"$PRISM_AGENT_VALUES_OVERLAY\" auth existingSecret)\" || return 1"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1721,
        "text": "  append_code_bundle_override_file \"$prism_bundle_override\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1722,
        "text": "    \"$prism_bundle_archive_url\" \"$prism_bundle_expected_commit\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1723,
        "text": "    \"$prism_bundle_contract_version\" \"$prism_bundle_auth_secret\" \"$prism_bundle_auth_key\" || { rm -f \"$prism_bundle_override\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1726,
        "text": "  agent_values+=(-f \"$prism_bundle_override\" --set-string \"litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1728,
        "text": "    || ! render_selected_role prism-agent agent-prism \"$PRISM_NAMESPACE\" code \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1764,
        "text": "  if ! helm lint \"$CHART_DIR\" \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1770,
        "text": "    \"${agent_values[@]}\" --atomic --wait --timeout \"$PRISM_HELM_TIMEOUT\" || prism_agent_helm_result=$?"
      }
    ]
  },
  {
    "source": "scripts/bundle-values-field.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1684,
      "text": "    prism_values_auth_key=\"$(bundle_values_field \"$PRISM_AGENT_VALUES_FILE\" \"$PRISM_AGENT_VALUES_OVERLAY\" auth existingSecretKey)\" || return 1"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1721,
        "text": "  append_code_bundle_override_file \"$prism_bundle_override\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1722,
        "text": "    \"$prism_bundle_archive_url\" \"$prism_bundle_expected_commit\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1723,
        "text": "    \"$prism_bundle_contract_version\" \"$prism_bundle_auth_secret\" \"$prism_bundle_auth_key\" || { rm -f \"$prism_bundle_override\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1726,
        "text": "  agent_values+=(-f \"$prism_bundle_override\" --set-string \"litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1728,
        "text": "    || ! render_selected_role prism-agent agent-prism \"$PRISM_NAMESPACE\" code \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1764,
        "text": "  if ! helm lint \"$CHART_DIR\" \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1770,
        "text": "    \"${agent_values[@]}\" --atomic --wait --timeout \"$PRISM_HELM_TIMEOUT\" || prism_agent_helm_result=$?"
      }
    ]
  },
  {
    "source": "scripts/bundle-values-field.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1696,
      "text": "  if [[ -z $prism_bundle_archive_url ]]; then prism_bundle_archive_url=\"$(bundle_values_field \"$PRISM_AGENT_VALUES_FILE\" \"$PRISM_AGENT_VALUES_OVERLAY\" archiveUrl)\" || return 1; fi"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1721,
        "text": "  append_code_bundle_override_file \"$prism_bundle_override\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1722,
        "text": "    \"$prism_bundle_archive_url\" \"$prism_bundle_expected_commit\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1723,
        "text": "    \"$prism_bundle_contract_version\" \"$prism_bundle_auth_secret\" \"$prism_bundle_auth_key\" || { rm -f \"$prism_bundle_override\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1726,
        "text": "  agent_values+=(-f \"$prism_bundle_override\" --set-string \"litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1728,
        "text": "    || ! render_selected_role prism-agent agent-prism \"$PRISM_NAMESPACE\" code \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1764,
        "text": "  if ! helm lint \"$CHART_DIR\" \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1770,
        "text": "    \"${agent_values[@]}\" --atomic --wait --timeout \"$PRISM_HELM_TIMEOUT\" || prism_agent_helm_result=$?"
      }
    ]
  },
  {
    "source": "scripts/buster-resource-overlay.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1390,
      "text": "    runtime_resources=\"$(node \"$REPO_DIR/scripts/buster-resource-overlay.mjs\" \"$values_file\" \"$private_values\")\" || { [[ -z $override_file ]] || rm -f \"$override_file\"; return 1; }"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1391,
        "text": "    if [[ -n \"$runtime_resources\" ]]; then helm_args+=(--set-json \"$runtime_resources\"); fi"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1401,
        "text": "  if ! render_selected_role \"$role\" \"agent-${role}\" \"$NAMESPACE\" \"$mode\" \"${helm_args[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1413,
        "text": "    --reset-values \"${helm_args[@]}\" --atomic --cleanup-on-fail --wait --timeout \"$AGENT_HELM_TIMEOUT\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1415,
        "text": "  if ! helm \"${helm_args[@]}\"; then"
      }
    ]
  },
  {
    "source": "scripts/bundle-override-values.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1383,
      "text": "    append_code_bundle_override_file \"$override_file\" \"$bundle_archive_url\" \"$bundle_expected_commit\" \"$bundle_contract_version\" \"$bundle_auth_secret\" \"$bundle_auth_key\" || { rm -f \"$override_file\"; return 1; }"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1398,
        "text": "    helm_args+=(--values \"$override_file\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1401,
        "text": "  if ! render_selected_role \"$role\" \"agent-${role}\" \"$NAMESPACE\" \"$mode\" \"${helm_args[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1413,
        "text": "    --reset-values \"${helm_args[@]}\" --atomic --cleanup-on-fail --wait --timeout \"$AGENT_HELM_TIMEOUT\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1415,
        "text": "  if ! helm \"${helm_args[@]}\"; then"
      }
    ]
  },
  {
    "source": "scripts/bundle-override-values.mjs",
    "caller": {
      "source": "scripts/deploy.sh",
      "line": 1721,
      "text": "  append_code_bundle_override_file \"$prism_bundle_override\" \\"
    },
    "receivers": [
      {
        "source": "scripts/deploy.sh",
        "line": 1722,
        "text": "    \"$prism_bundle_archive_url\" \"$prism_bundle_expected_commit\" \\"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1723,
        "text": "    \"$prism_bundle_contract_version\" \"$prism_bundle_auth_secret\" \"$prism_bundle_auth_key\" || { rm -f \"$prism_bundle_override\"; return 1; }"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1726,
        "text": "  agent_values+=(-f \"$prism_bundle_override\" --set-string \"litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1\")"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1728,
        "text": "    || ! render_selected_role prism-agent agent-prism \"$PRISM_NAMESPACE\" code \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1764,
        "text": "  if ! helm lint \"$CHART_DIR\" \"${agent_values[@]}\"; then"
      },
      {
        "source": "scripts/deploy.sh",
        "line": 1770,
        "text": "    \"${agent_values[@]}\" --atomic --wait --timeout \"$PRISM_HELM_TIMEOUT\" || prism_agent_helm_result=$?"
      }
    ]
  }
];
export function deploymentNodeOutputOccurrences(root, deployBytes) {
  const graph = qualifiedDeploymentYamlScalarGraph(root, 'scripts/deploy.sh', deployBytes, appendSink);
  if (!graph) return null;
  const lines = deployBytes.split('\n');
  const result = [];
  for (const edge of edges) {
    if ([edge.caller, ...edge.receivers].some(o => lines[o.line - 1] !== o.text)) return null;
    for (const contract of contracts.filter(c => c.source === edge.source)) {
      // The delegated graph guard physically checks exact helper bytes, aliases,
      // package scopes and ESM dependencies; bind each returned observation too.
      if (graph.dependencies[edge.source] !== contract.sha256) return null;
      result.push({
        kind: 'selected-deployment-output-occurrence',
        source: edge.source, descriptor: structuredClone(contract.descriptor),
        caller: structuredClone(edge.caller), receivers: structuredClone(edge.receivers),
        dependencies: {...graph.dependencies},
        scope: 'this exact deployment traversal only; not standalone file classification',
        quantityPremise: 'lexical format only; zero and long digits allowed; no viability claim',
      });
    }
  }
  return result;
}
