#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended cluster context}"
policy_file=${OPS_DEPLOYMENT_POLICY_FILE-$repo/charts/ops-pod/deployment-policy.json}
for legacy in OPS_NAMESPACE OPS_RELEASE OPS_READ_NAMESPACES OPS_COPY_PULL_SECRET OPS_PULL_SECRET_SOURCE_NAMESPACE; do
  if [[ -v $legacy ]]; then echo "OPS_DEPLOYMENT_POLICY_COMPETING_AUTHOR:$legacy" >&2; exit 1; fi
done
policy_capture_dir=$(mktemp -d)
temporary=""
trap 'rm -rf -- "$policy_capture_dir"; if [[ -n ${temporary:-} ]]; then rm -rf -- "$temporary"; fi' EXIT
policy_values=$(node "$repo/scripts/ops-deployment-policy.mjs" "$policy_file" "$policy_capture_dir/policy.json")
mapfile -t selected_policy <<< "$policy_values"
namespace=${selected_policy[0]}
release=${selected_policy[1]}
export OPS_DEPLOYMENT_POLICY_FILE="$policy_capture_dir/policy.json"
k=(kubectl --context "$KUBE_CONTEXT")
pod="$release-0"
case ${1:-help} in
  deploy|render)
    node "$repo/scripts/updates/deployment-release.mjs" verify "$repo" ops >/dev/null
    temporary=$(mktemp -d)
    if [[ ${1:-} == render ]]; then
      : "${OPS_DISCOVERY_VALUES:?Set OPS_DISCOVERY_VALUES to an explicit discovery values file for local rendering}"
      cp -- "$OPS_DISCOVERY_VALUES" "$temporary/discovered.json"
    else
      python3 "$repo/ops/pod/bootstrap.py" discover > "$temporary/discovered.json"
    fi
    values=(-f "$temporary/discovered.json" -f "$repo/releases/values/ops.yaml")
    if [[ -n ${selected_policy[3]:-} && -n ${OPS_POD_VALUES:-} ]]; then echo 'OPS_DEPLOYMENT_POLICY_COMPETING_AUTHOR:OPS_POD_VALUES' >&2; exit 1; fi
    selected_overlay=${selected_policy[3]:-${OPS_POD_VALUES:-}}
    if [[ -n $selected_overlay ]]; then values+=(-f "$selected_overlay"); fi
    [[ -z ${OPS_CODEX_IMAGE:-} ]] || values+=(--set-string "codexImage=$OPS_CODEX_IMAGE")
    [[ -z ${OPS_MCP_IMAGE:-} ]] || values+=(--set-string "mcpImage=$OPS_MCP_IMAGE")
    if [[ -n ${OPS_GITHUB_TOKEN_FILE:-} ]]; then values+=(--set-string githubSecret=codex-ops-github); fi
    if [[ -n ${OPS_TAILSCALE_AUTHKEY_FILE:-} ]]; then values+=(--set tailscale.enabled=true); fi
    # Validate the full render before creating namespaces or credentials.
    node "$repo/scripts/updates/deployment-release.mjs" render "$repo" ops ops "$release" "$namespace" \
      "--discovery=$temporary/discovered.json" -- "${values[@]}" > "$temporary/rendered.yaml"
    if [[ ${1:-} == render ]]; then cat "$temporary/rendered.yaml"; exit 0; fi
    "${k[@]}" create namespace "$namespace" --dry-run=client -o yaml | "${k[@]}" apply -f -
    python3 "$repo/ops/pod/bootstrap.py" secrets
    helm upgrade --install "$release" "$repo/charts/ops-pod" --kube-context "$KUBE_CONTEXT" \
      --namespace "$namespace" "${values[@]}" --history-max "${selected_policy[2]}"
    echo "Deployed. Run: $0 login; $0 github-login; $0 pair; $0 verify"
    echo 'No redeploy is needed after authentication/pairing. Readiness waits for Codex login.'
    ;;
  login) "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- codex login --device-auth ;;
  github-login)
    "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- gh auth login --hostname github.com --git-protocol https --web
    ;;
  pair) "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- codex remote-control pair ;;
  shell) "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- bash /opt/codex/shell.sh ;;
  status)
    "${k[@]}" -n "$namespace" get pod "$pod" -o wide
    "${k[@]}" -n "$namespace" exec "$pod" -c codex -- cat /tmp/codex-ops-status.json
    ;;
  verify)
    "${k[@]}" -n "$namespace" exec -i "$pod" -c codex -- python3 - < "$repo/ops/pod/verify.py"
    # Negative control uses the MCP's REAL mounted observer token. Only a 403
    # counts as success; missing files, network failure and 401 fail the check.
    "${k[@]}" -n "$namespace" exec "$pod" -c ops-mcp -- node --input-type=module -e \
      'import {createKubeRequest} from "/app/src/kubernetes.mjs"; import {loadOpsMcpConfig} from "/app/src/config.mjs"; const config=loadOpsMcpConfig(); try {await createKubeRequest(config.kubernetes)("/api/v1/namespaces/" + encodeURIComponent(config.defaultNamespace) + "/secrets");process.exit(1)} catch(e) {if(!e.message.includes("Kubernetes API 403:"))throw e; console.log("PASS: observer Secret access denied by API");}'
    ;;
  *) echo "Usage: $0 deploy|render|login|github-login|pair|shell|status|verify"; exit 1 ;;
esac
