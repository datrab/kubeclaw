#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended cluster context}"
namespace=${OPS_NAMESPACE:-kubeclaw-ops}
release=${OPS_RELEASE:-codex-ops}
k=(kubectl --context "$KUBE_CONTEXT")
pod="$release-0"
case ${1:-help} in
  deploy)
    : "${OPS_CODEX_IMAGE:?Set immutable OPS_CODEX_IMAGE from the build summary}"
    : "${OPS_MCP_IMAGE:?Set immutable OPS_MCP_IMAGE from the build summary}"
    for value in "$OPS_CODEX_IMAGE" "$OPS_MCP_IMAGE"; do
      [[ $value =~ ^.+@sha256:[a-f0-9]{64}$ ]] || { echo 'Images must use sha256 digests' >&2; exit 1; }
    done
    export OPS_NAMESPACE="$namespace" OPS_RELEASE="$release"
    temporary=$(mktemp -d)
    trap 'rm -rf -- "$temporary"' EXIT
    python3 "$repo/ops/pod/bootstrap.py" discover > "$temporary/discovered.json"
    values=(-f "$temporary/discovered.json")
    if [[ -n ${OPS_POD_VALUES:-} ]]; then values+=(-f "$OPS_POD_VALUES"); fi
    values+=(--set-string "codexImage=$OPS_CODEX_IMAGE" --set-string "mcpImage=$OPS_MCP_IMAGE")
    if [[ -n ${OPS_GITHUB_TOKEN_FILE:-} ]]; then values+=(--set-string githubSecret=codex-ops-github); fi
    if [[ -n ${OPS_TAILSCALE_AUTHKEY_FILE:-} ]]; then values+=(--set tailscale.enabled=true); fi
    # Validate the full render before creating namespaces or credentials.
    helm template "$release" "$repo/charts/ops-pod" -n "$namespace" "${values[@]}" > "$temporary/rendered.yaml"
    "${k[@]}" create namespace "$namespace" --dry-run=client -o yaml | "${k[@]}" apply -f -
    python3 "$repo/ops/pod/bootstrap.py" secrets
    helm upgrade --install "$release" "$repo/charts/ops-pod" --kube-context "$KUBE_CONTEXT" \
      --namespace "$namespace" "${values[@]}" --history-max 5
    echo "Deployed. Run: $0 login; $0 github-login; $0 pair; $0 verify"
    echo 'No redeploy is needed after authentication/pairing. Readiness waits for Codex login.'
    ;;
  login) "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- codex login --device-auth ;;
  github-login)
    "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- gh auth login --hostname github.com --git-protocol https --web
    ;;
  pair) "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- codex remote-control pair ;;
  shell) "${k[@]}" -n "$namespace" exec -it "$pod" -c codex -- bash ;;
  status)
    "${k[@]}" -n "$namespace" get pod "$pod" -o wide
    "${k[@]}" -n "$namespace" exec "$pod" -c codex -- cat /tmp/codex-ops-status.json
    ;;
  verify)
    "${k[@]}" -n "$namespace" exec -i "$pod" -c codex -- python3 - < "$repo/ops/pod/verify.py"
    # Negative control uses the MCP's REAL mounted observer token. Only a 403
    # counts as success; missing files, network failure and 401 fail the check.
    "${k[@]}" -n "$namespace" exec "$pod" -c ops-mcp -- node --input-type=module -e \
      'import {createKubeRequest} from "/app/src/kubernetes.mjs"; try {await createKubeRequest()("/api/v1/namespaces/" + encodeURIComponent(process.env.OPS_DEFAULT_NAMESPACE) + "/secrets");process.exit(1)} catch(e) {if(!e.message.includes("Kubernetes API 403:"))throw e; console.log("PASS: observer Secret access denied by API");}'
    ;;
  *) echo "Usage: $0 deploy|login|github-login|pair|shell|status|verify"; exit 1 ;;
esac
