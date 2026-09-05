#!/usr/bin/env bash
# =============================================================================
# KubeClaw — Full Stack Deployment
# =============================================================================
# Deploys everything from scratch: namespace, secrets, infra, agents.
#
# Usage:
#   ./deploy.sh setup              Create namespace + secrets + helm repos
#   ./deploy.sh secrets            Create/copy/prompt required Kubernetes secrets
#   ./deploy.sh infra              Deploy required infra plus optional Qdrant/PostgreSQL/LiteLLM
#   ./deploy.sh tailscale          Deploy Tailscale Kubernetes Operator
#   ./deploy.sh buildkit-preflight Verify rootless BuildKit support on a cluster node
#   ./deploy.sh nova-buildkit-preflight Build and verify a real image through Nova's v2 capability graph
#   ./deploy.sh nova-kubernetes-fixture-preflight Verify the real Kubernetes fixture lifecycle through Nova and Buster
#   ./deploy.sh nova-http-preflight Verify an in-cluster HTTP service through Nova and Buster
#   ./deploy.sh nova-api-preflight Verify API providers through Nova and Buster
#   ./deploy.sh nova-a11y-preflight Verify real browser accessibility through Nova and Buster
#   ./deploy.sh nova-security-preflight Verify all five security providers through Nova and Buster
#   ./deploy.sh nova-tailscale-preflight Verify a public endpoint through Nova, Buster, Kubernetes, and Tailscale
#   ./deploy.sh nova-production-preflights <image> Run all required proofs after all source cutovers
#   ./deploy.sh buster-infra-smoke Publish a task through Redis for the deployed Buster consumer
#   ./deploy.sh agents             Deploy agents (Nova + Buster)
#   ./deploy.sh agent <name> [--with-code]  Deploy Nova, Buster, or Prism
#   ./deploy.sh image              Deploy both agents using image/runtime values
#   ./deploy.sh image <name>       Deploy one agent using image/runtime values
#   ./deploy.sh code [target]      Deploy code bundles for all agents or one target
#   ./deploy.sh smoke              Run pod-level smoke checks for Nova + Buster
#   ./deploy.sh smoke-agent <name> Run pod-level smoke checks for one agent
#   ./deploy.sh all                Full deployment (setup + infra + agents)
#   ./deploy.sh status             Show all pods and services
#   ./deploy.sh teardown           Remove agents + infra, keep namespace/secrets
#   ./deploy.sh teardown-agents    Remove agents only, keep infra
#   ./deploy.sh teardown-all       Destroy namespace and everything in it
#
# Environment variables:
#   NAMESPACE            Target namespace (default: kubeclaw)
#   AGENT_HELM_TIMEOUT   Helm wait timeout for agent upgrades (default: 45m)
#   AGENT_ROLLOUT_TIMEOUT  Pod/deployment readiness timeout for agents (default: 45m)
#   CODE_BUNDLE_GITHUB_REPOSITORY      owner/repo override for derived GitHub release bundle URLs
#   CODE_BUNDLE_DEFAULT_REF            Git ref to resolve when code deploy omits an explicit expected commit (default: refs/heads/main)
#   CODE_BUNDLE_RELEASE_TAG            GitHub release tag for published bundles (default: agent-code-bundles)
#   CODE_BUNDLE_PREFLIGHT_SKIP         true|false to skip bundle URL existence checks before code deploy (default: false)
#   NOVA_CODE_BUNDLE_ARCHIVE_URL       Resolved Nova bundle archive URL for code deploy
#   NOVA_CODE_BUNDLE_EXPECTED_COMMIT   Expected Nova source commit for code deploy
#   BUSTER_CODE_BUNDLE_ARCHIVE_URL     Resolved Buster bundle archive URL for code deploy
#   BUSTER_CODE_BUNDLE_EXPECTED_COMMIT   Expected Buster source commit for code deploy
#   PRISM_CODE_BUNDLE_ARCHIVE_URL      Resolved Prism bundle archive URL for Prism deploy
#   PRISM_CODE_BUNDLE_EXPECTED_COMMIT  Expected Prism source commit for Prism deploy
#   TAILSCALE_OPERATOR_ENABLED     true|false (default: true)
#   TAILSCALE_OAUTH_CLIENT_ID      Optional bootstrap source for Secret/operator-oauth
#   TAILSCALE_OAUTH_CLIENT_SECRET  Optional bootstrap source for Secret/operator-oauth
#   KUBECLAW_SECRET_SETUP_MODE     auto|interactive|noninteractive (default: auto)
#   KUBECLAW_RUN_SECRET_SETUP      auto|true|false for setup/all (default: auto)
#   KUBECLAW_WORKSPACE_PROMPT      auto|true|false (default: auto)
#   KUBECLAW_DEPLOY_POSTGRESQL    true|false (default: true)
#   KUBECLAW_DEPLOY_QDRANT        true|false (default: true)
#   KUBECLAW_DEPLOY_LITELLM       true|false (default: true)
#   LITELLM_NODE_PORT             LiteLLM Service NodePort (default: 30050)
#   KUBECLAW_DEPLOY_SPIRE         true|false (default: true)
#   ALLOW_PARTIAL_INFRA           true|false (default: false)
#   BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE   Rootless BuildKit probe image (default: moby/buildkit:rootless)
#   BUILDKIT_ROOTLESS_PREFLIGHT_TIMEOUT Probe pod readiness timeout (default: 180s)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CHART_DIR="$REPO_DIR/charts/kubeclaw"
VALUES_DIR="$REPO_DIR/my-values"
INFRA_DIR="$VALUES_DIR/infra"
PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE="/etc/kubeclaw/production-receipt-authority.pub"

NAMESPACE_WAS_SET="${NAMESPACE+x}"
NAMESPACE="${NAMESPACE:-kubeclaw}"
TAILSCALE_OPERATOR_NAMESPACE="${TAILSCALE_OPERATOR_NAMESPACE:-tailscale}"
TAILSCALE_OPERATOR_RELEASE="${TAILSCALE_OPERATOR_RELEASE:-tailscale-operator}"
TAILSCALE_HELM_REPO="${TAILSCALE_HELM_REPO:-https://pkgs.tailscale.com/helmcharts}"
TAILSCALE_OAUTH_SECRET_NAME="${TAILSCALE_OAUTH_SECRET_NAME:-operator-oauth}"
TAILSCALE_VALUES_FILE="${TAILSCALE_VALUES_FILE:-$INFRA_DIR/tailscale-operator-values.yaml}"
KUBECLAW_WORKSPACE_PROMPT="${KUBECLAW_WORKSPACE_PROMPT:-auto}"
KUBECLAW_WORKSPACE_NAMESPACE_FILE="${KUBECLAW_WORKSPACE_NAMESPACE_FILE:-$VALUES_DIR/.workspace-namespace}"
KUBECLAW_DEPLOY_POSTGRESQL="${KUBECLAW_DEPLOY_POSTGRESQL:-true}"
KUBECLAW_DEPLOY_QDRANT="${KUBECLAW_DEPLOY_QDRANT:-true}"
KUBECLAW_DEPLOY_LITELLM="${KUBECLAW_DEPLOY_LITELLM:-true}"
LITELLM_NODE_PORT="${LITELLM_NODE_PORT:-30050}"
KUBECLAW_DEPLOY_SPIRE="${KUBECLAW_DEPLOY_SPIRE:-true}"
SPIFFE_HELM_REPO="${SPIFFE_HELM_REPO:-https://spiffe.github.io/helm-charts-hardened/}"
SPIRE_CRDS_CHART_VERSION="${SPIRE_CRDS_CHART_VERSION:-0.6.0}"
SPIRE_CHART_VERSION="${SPIRE_CHART_VERSION:-0.30.0}"
SPIRE_VALUES_FILE="${SPIRE_VALUES_FILE:-$INFRA_DIR/spire-values.yaml}"
KUBECLAW_DEPLOY_PRISM="${KUBECLAW_DEPLOY_PRISM:-true}"
PRISM_NAMESPACE="${PRISM_NAMESPACE:-$NAMESPACE}"
PRISM_RELEASE="${PRISM_RELEASE:-prism}"
PRISM_VALUES_FILE="${PRISM_VALUES_FILE:-$VALUES_DIR/prism-values.yaml}"
PRISM_AGENT_VALUES_FILE="${PRISM_AGENT_VALUES_FILE:-$VALUES_DIR/prism-agent-values.yaml}"
PRISM_HELM_TIMEOUT="${PRISM_HELM_TIMEOUT:-45m}"
PRISM_ROLLOUT_TIMEOUT="${PRISM_ROLLOUT_TIMEOUT:-45m}"
PRISM_CONTROL_IMAGE_REPOSITORY="${PRISM_CONTROL_IMAGE_REPOSITORY:-}"
PRISM_CONTROL_IMAGE_DIGEST="${PRISM_CONTROL_IMAGE_DIGEST:-}"
PRISM_STUDIO_IMAGE_REPOSITORY="${PRISM_STUDIO_IMAGE_REPOSITORY:-}"
PRISM_STUDIO_IMAGE_DIGEST="${PRISM_STUDIO_IMAGE_DIGEST:-}"
PRISM_WORKER_IMAGE_REPOSITORY="${PRISM_WORKER_IMAGE_REPOSITORY:-}"
PRISM_WORKER_IMAGE_DIGEST="${PRISM_WORKER_IMAGE_DIGEST:-}"
PRISM_INGESTION_IMAGE_REPOSITORY="${PRISM_INGESTION_IMAGE_REPOSITORY:-}"
PRISM_INGESTION_IMAGE_DIGEST="${PRISM_INGESTION_IMAGE_DIGEST:-}"
PRISM_RUNTIME_SECRET_NAME="${PRISM_RUNTIME_SECRET_NAME:-prism-runtime}"
PRISM_DATABASE_SECRET_NAME="${PRISM_DATABASE_SECRET_NAME:-prism-postgresql-auth}"
PRISM_IMAGE_PULL_SECRET_NAME="${PRISM_IMAGE_PULL_SECRET_NAME:-ghcr-secret}"
ALLOW_PARTIAL_INFRA="${ALLOW_PARTIAL_INFRA:-false}"
AGENT_HELM_TIMEOUT="${AGENT_HELM_TIMEOUT:-45m}"
AGENT_ROLLOUT_TIMEOUT="${AGENT_ROLLOUT_TIMEOUT:-45m}"
CODE_BUNDLE_DEFAULT_REF="${CODE_BUNDLE_DEFAULT_REF:-refs/heads/main}"
CODE_BUNDLE_RELEASE_TAG="${CODE_BUNDLE_RELEASE_TAG:-agent-code-bundles}"
CODE_BUNDLE_PREFLIGHT_SKIP="${CODE_BUNDLE_PREFLIGHT_SKIP:-false}"
BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="${BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE:-moby/buildkit:rootless}"
BUILDKIT_ROOTLESS_PREFLIGHT_TIMEOUT="${BUILDKIT_ROOTLESS_PREFLIGHT_TIMEOUT:-180s}"

export NAMESPACE
export KUBECLAW_DEPLOY_POSTGRESQL
export KUBECLAW_DEPLOY_QDRANT
export KUBECLAW_DEPLOY_LITELLM
export LITELLM_NODE_PORT
export KUBECLAW_DEPLOY_SPIRE
export KUBECLAW_DEPLOY_PRISM PRISM_NAMESPACE PRISM_RELEASE PRISM_VALUES_FILE PRISM_AGENT_VALUES_FILE
export ALLOW_PARTIAL_INFRA

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1" >&2; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
header() {
  echo -e "\n${BLUE}═══════════════════════════════════════${NC}"
  echo -e "${BLUE} $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command not found: $1"
    return 1
  fi
}

is_not_found_error() {
  local text="$1"
  [[ $text =~ [Nn]ot[Ff]ound|[Nn]ot\ [Ff]ound|No\ resources\ found ]]
}

require_helm_release_idle() {
  local release="$1"
  local namespace="$2"
  local output status

  if ! output="$(helm status "$release" -n "$namespace" 2>&1)"; then
    if is_not_found_error "$output"; then
      return 0
    fi
    err "Cannot inspect Helm release ${namespace}/${release} before deployment"
    echo "$output" >&2
    return 1
  fi

  status="$(awk -F ':[[:space:]]*' '$1 == "STATUS" { print $2; exit }' <<<"$output")"
  case "$status" in
    pending-install|pending-upgrade|pending-rollback)
      err "Helm release ${namespace}/${release} is ${status}; refusing to start a competing operation"
      info "Inspect local owners: ps -eo pid,ppid,etime,args | grep -E '[h]elm (upgrade|install|rollback)|[d]eploy\\.sh'"
      info "Inspect release state: helm status ${release} -n ${namespace} && helm history ${release} -n ${namespace} --max 10"
      info "Stop a confirmed stale local process first; only then recover the pending Helm revision"
      return 1
      ;;
  esac
}

warn_nonfatal_failure() {
  local context="$1"
  local detail="${2:-}"

  warn "$context"
  if [[ -n $detail ]]; then
    warn "  ${detail//$'\n'/$'\n  '}"
  fi
}

add_helm_repo_once() {
  local name="$1"
  local url="$2"
  local output

  if output=$(helm repo add "$name" "$url" 2>&1); then
    return 0
  fi

  if [[ $output == *"already exists"* ]]; then
    warn "Helm repo '$name' already exists; keeping existing repo definition."
    return 0
  fi

  err "Failed to add Helm repo '$name' ($url)"
  echo "$output" >&2
  return 1
}

wait_for_rollout_required() {
  local description="$1"
  shift
  local output

  if output=$(kubectl rollout status "$@" 2>&1); then
    return 0
  fi

  if component_enabled "$ALLOW_PARTIAL_INFRA"; then
    warn_nonfatal_failure "$description is not ready yet; continuing because ALLOW_PARTIAL_INFRA=$ALLOW_PARTIAL_INFRA." "$output"
    return 0
  fi

  err "$description is not ready. Set ALLOW_PARTIAL_INFRA=1 only for explicit troubleshooting."
  echo "$output" >&2
  return 1
}

show_optional_kubectl_table() {
  local description="$1"
  shift
  local output

  if output=$(kubectl get "$@" 2>&1); then
    if [[ -n $output ]]; then
      echo "$output"
    else
      warn "No $description found"
    fi
    return 0
  fi

  if is_not_found_error "$output"; then
    warn "No $description found"
    return 0
  fi

  warn_nonfatal_failure "Unable to list $description for namespace '$NAMESPACE'. Status output may be incomplete." "$output"
}

delete_namespaced_resource_if_present() {
  local kind="$1"
  local name="$2"
  local output

  if output=$(kubectl get "$kind" "$name" -n "$NAMESPACE" 2>&1); then
    kubectl delete "$kind" "$name" -n "$NAMESPACE"
    log "Removed: $name"
    return 0
  fi

  if is_not_found_error "$output"; then
    return 0
  fi

  err "Failed to check $kind/$name in namespace '$NAMESPACE' before delete"
  echo "$output" >&2
  return 1
}

delete_manifest_if_cluster_resource_present() {
  local kind="$1"
  local name="$2"
  local manifest_path="$3"
  local output

  if output=$(kubectl get "$kind" "$name" 2>&1); then
    kubectl delete -f "$manifest_path"
    log "Removed: $name"
    return 0
  fi

  if is_not_found_error "$output"; then
    return 0
  fi

  err "Failed to check cluster resource $kind/$name before delete"
  echo "$output" >&2
  return 1
}

wait_for_agent_rollout() {
  local release="$1"
  local role="${release#agent-}"
  local selector="app.kubernetes.io/instance=${release},app.kubernetes.io/component=${role}"
  kubectl rollout status deployment/"$release" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  kubectl wait --for=condition=Ready pod -l "$selector" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
}

agent_pod_name() {
  local release="$1"
  local role="${release#agent-}"
  local selector="app.kubernetes.io/instance=${release},app.kubernetes.io/component=${role}"
  local pods=()

  mapfile -t pods < <(kubectl get pods -n "$NAMESPACE" -l "$selector" --field-selector=status.phase=Running -o name)
  if [[ ${#pods[@]} -ne 1 ]]; then
    err "Expected exactly one running agent pod for '$release'; found ${#pods[@]} using selector '$selector'."
    return 1
  fi
  printf '%s\n' "${pods[0]#pod/}"
}

append_image_override_file() {
  local output_path="$1"
  local image_repo="$2"
  local image_tag="$3"
  local disable_pull_secrets="$4"
  local controller_image_repo="${5:-}"
  local controller_image_tag="${6:-}"

  if [[ -n $image_repo || -n $image_tag ]]; then
    echo "image:" >>"$output_path"
    if [[ -n $image_repo ]]; then
      echo "  repository: \"$image_repo\"" >>"$output_path"
    fi
    if [[ -n $image_tag ]]; then
      echo "  tag: \"$image_tag\"" >>"$output_path"
    fi
  fi

  if [[ $disable_pull_secrets == "1" ]]; then
    echo "imagePullSecrets: []" >>"$output_path"
  fi

  if [[ -n $controller_image_repo || -n $controller_image_tag ]]; then
    echo "busterNamespaceBroker:" >>"$output_path"
    echo "  controller:" >>"$output_path"
    echo "    image:" >>"$output_path"
    if [[ -n $controller_image_repo ]]; then
      echo "      repository: \"$controller_image_repo\"" >>"$output_path"
    fi
    if [[ -n $controller_image_tag ]]; then
      echo "      tag: \"$controller_image_tag\"" >>"$output_path"
    fi
  fi

}

append_code_bundle_override_file() {
  local output_path="$1"
  local archive_url="$2"
  local expected_commit="$3"
  local contract_version="$4"
  local auth_secret="${5:-}"
  local auth_key="${6:-token}"

  cat >>"$output_path" <<EOF
codeBundle:
  enabled: true
  archiveUrl: "$archive_url"
  expectedCommit: "$expected_commit"
  contractVersion: "$contract_version"
EOF

  if [[ -n $auth_secret ]]; then
    cat >>"$output_path" <<EOF
  auth:
    existingSecret: "$auth_secret"
    existingSecretKey: "$auth_key"
EOF
  fi
}

yaml_trim_scalar() {
  awk '
    {
      sub(/^[[:space:]]+/, "", $0)
      sub(/[[:space:]]+$/, "", $0)
      gsub(/^"|"$/, "", $0)
      gsub(/^'"'"'|'"'"'$/, "", $0)
      print
    }
  '
}

yaml_get_section_key() {
  local file="$1"
  local section="$2"
  local key="$3"

  awk -v section="$section" -v key="$key" '
    $0 ~ ("^" section ":[[:space:]]*$") {
      in_section = 1
      next
    }

    in_section && $0 ~ /^[^[:space:]]/ {
      in_section = 0
    }

    in_section && $0 ~ ("^[[:space:]]{2}" key ":[[:space:]]*") {
      value = $0
      sub("^[[:space:]]{2}" key ":[[:space:]]*", "", value)
      print value
      exit
    }
  ' "$file" | yaml_trim_scalar
}

yaml_get_nested_section_key() {
  local file="$1"
  local section="$2"
  local subsection="$3"
  local key="$4"

  awk -v section="$section" -v subsection="$subsection" -v key="$key" '
    $0 ~ ("^" section ":[[:space:]]*$") {
      in_section = 1
      in_subsection = 0
      next
    }

    in_section && $0 ~ /^[^[:space:]]/ {
      in_section = 0
      in_subsection = 0
    }

    in_section && $0 ~ ("^[[:space:]]{2}" subsection ":[[:space:]]*$") {
      in_subsection = 1
      next
    }

    in_section && in_subsection && $0 ~ /^[[:space:]]{2}[A-Za-z0-9_-]+:[[:space:]]*$/ && $0 !~ ("^[[:space:]]{2}" subsection ":[[:space:]]*$") {
      in_subsection = 0
    }

    in_section && in_subsection && $0 ~ ("^[[:space:]]{4}" key ":[[:space:]]*") {
      value = $0
      sub("^[[:space:]]{4}" key ":[[:space:]]*", "", value)
      print value
      exit
    }
  ' "$file" | yaml_trim_scalar
}

yaml_get_first_named_list_item() {
  local file="$1"
  local section="$2"

  awk -v section="$section" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      gsub(/^'"'"'/, "", value)
      gsub(/'"'"'$/, "", value)
      return value
    }

    $0 ~ ("^" section ":[[:space:]]*$") {
      in_section = 1
      next
    }

    in_section && $0 ~ /^[^[:space:]]/ {
      in_section = 0
    }

    in_section && $0 ~ /^[[:space:]]*-[[:space:]]+name:[[:space:]]*/ {
      value = $0
      sub(/^[[:space:]]*-[[:space:]]+name:[[:space:]]*/, "", value)
      print trim(value)
      exit
    }
  ' "$file"
}

derive_github_repository_from_image_repository() {
  local image_repository="${1:-}"

  if [[ $image_repository =~ ^ghcr\.io/([^/]+)/kubeclaw([-.][A-Za-z0-9._-]+)?$ ]]; then
    echo "${BASH_REMATCH[1]}/kubeclaw"
    return 0
  fi

  return 1
}

derive_github_repository() {
  local image_repository="${1:-}"

  if [[ -n ${CODE_BUNDLE_GITHUB_REPOSITORY:-} ]]; then
    echo "$CODE_BUNDLE_GITHUB_REPOSITORY"
    return 0
  fi

  if derive_github_repository_from_image_repository "$image_repository" >/dev/null 2>&1; then
    derive_github_repository_from_image_repository "$image_repository"
    return 0
  fi

  local remote_url
  if ! remote_url="$(git -C "$REPO_DIR" config --get remote.origin.url 2>/dev/null)"; then
    return 1
  fi
  if [[ -z $remote_url ]]; then
    return 1
  fi

  local repo
  repo="$remote_url"
  repo="${repo#git@github.com:}"
  repo="${repo#ssh://git@github.com/}"
  if [[ $repo == "$remote_url" && $remote_url =~ ^https?://([^/@]+@)?github\.com/(.+)$ ]]; then
    repo="${BASH_REMATCH[2]}"
  fi
  repo="${repo%.git}"
  if [[ $repo == "$remote_url" || $repo != */* ]]; then
    return 1
  fi
  echo "$repo"
}

default_bundle_archive_url() {
  local role="$1"
  local expected_commit="$2"
  local image_repository="${3:-}"
  local repository

  repository="$(derive_github_repository "$image_repository")" || return 1
  if [[ -z $expected_commit ]]; then
    return 1
  fi

  echo "https://github.com/${repository}/releases/download/${CODE_BUNDLE_RELEASE_TAG}/${role}-${expected_commit}.tgz"
}

default_bundle_expected_commit() {
  local ref="$CODE_BUNDLE_DEFAULT_REF"
  local resolved=""

  if resolved="$(git -C "$REPO_DIR" ls-remote --exit-code origin "$ref" 2>/dev/null | awk 'NR==1 {print $1}')" && [[ -n $resolved ]]; then
    echo "$resolved"
    return 0
  fi

  if [[ $ref == "refs/heads/main" ]] || [[ $ref == "main" ]]; then
    if resolved="$(git -C "$REPO_DIR" rev-parse --verify origin/main 2>/dev/null)" && [[ -n $resolved ]]; then
      echo "$resolved"
      return 0
    fi
  fi

  if resolved="$(git -C "$REPO_DIR" rev-parse --verify HEAD 2>/dev/null)" && [[ -n $resolved ]]; then
    echo "$resolved"
    return 0
  fi

  return 1
}

verify_bundle_archive_url() {
  local role="$1"
  local archive_url="$2"
  local expected_commit="$3"
  local auth_secret="${4:-}"

  if [[ ${CODE_BUNDLE_PREFLIGHT_SKIP,,} == "true" ]]; then
    warn "Skipping ${role} bundle archive preflight because CODE_BUNDLE_PREFLIGHT_SKIP=true."
    return 0
  fi

  if [[ -n $auth_secret ]]; then
    warn "Skipping ${role} bundle archive preflight because runtime auth uses Kubernetes Secret ${auth_secret}."
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    warn "Skipping ${role} bundle archive preflight because curl is not installed."
    return 0
  fi

  local status=""
  local method="HEAD"
  if ! status="$(curl -fsSLI -o /dev/null -w '%{http_code}' "$archive_url" 2>/dev/null)"; then
    method="GET"
    if ! status="$(curl -fsSL -o /dev/null -w '%{http_code}' "$archive_url" 2>/dev/null)"; then
      err "${role} code bundle is not available: ${archive_url}"
      err "Expected published asset: ${role}-${expected_commit}.tgz under release tag ${CODE_BUNDLE_RELEASE_TAG}"
      err "Push the commit to main and wait for the bundle publication workflow, or set $(tr '[:lower:]' '[:upper:]' <<<"$role")_CODE_BUNDLE_ARCHIVE_URL explicitly."
      return 1
    fi
  fi

  case "$status" in
    2* | 3*)
      return 0
      ;;
    *)
      err "${role} code bundle preflight returned HTTP ${status} via ${method}: ${archive_url}"
      return 1
      ;;
  esac
}

bundle_env_for_role() {
  local role="$1"
  local field="$2"

  case "$role:$field" in
    nova:archive_url) echo "${NOVA_CODE_BUNDLE_ARCHIVE_URL:-}" ;;
    nova:expected_commit) echo "${NOVA_CODE_BUNDLE_EXPECTED_COMMIT:-}" ;;
    nova:contract_version) echo "${NOVA_CODE_BUNDLE_CONTRACT_VERSION:-v2}" ;;
    nova:auth_secret) echo "${NOVA_CODE_BUNDLE_AUTH_SECRET:-}" ;;
    nova:auth_key) echo "${NOVA_CODE_BUNDLE_AUTH_SECRET_KEY:-token}" ;;
    buster:archive_url) echo "${BUSTER_CODE_BUNDLE_ARCHIVE_URL:-}" ;;
    buster:expected_commit) echo "${BUSTER_CODE_BUNDLE_EXPECTED_COMMIT:-}" ;;
    buster:contract_version) echo "${BUSTER_CODE_BUNDLE_CONTRACT_VERSION:-v2}" ;;
    buster:auth_secret) echo "${BUSTER_CODE_BUNDLE_AUTH_SECRET:-}" ;;
    buster:auth_key) echo "${BUSTER_CODE_BUNDLE_AUTH_SECRET_KEY:-token}" ;;
    prism:archive_url) echo "${PRISM_CODE_BUNDLE_ARCHIVE_URL:-}" ;;
    prism:expected_commit) echo "${PRISM_CODE_BUNDLE_EXPECTED_COMMIT:-}" ;;
    prism:contract_version) echo "${PRISM_CODE_BUNDLE_CONTRACT_VERSION:-v2}" ;;
    prism:auth_secret) echo "${PRISM_CODE_BUNDLE_AUTH_SECRET:-}" ;;
    prism:auth_key) echo "${PRISM_CODE_BUNDLE_AUTH_SECRET_KEY:-token}" ;;
    *) return 1 ;;
  esac
}

resolve_deploy_targets() {
  local target="${1:-both}"
  case "$target" in
    both) echo "nova buster" ;;
    nova | buster) echo "$target" ;;
    *)
      err "Usage: $0 code [nova|buster] or $0 image [nova|buster|both]"
      return 1
      ;;
  esac
}

# ─── Setup (namespace + repos) ───────────────────────────────────────────

is_valid_namespace() {
  local value="$1"
  [[ $value =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ && ${#value} -le 63 ]]
}

prompt_workspace_namespace_if_needed() {
  local mode
  local workspace
  local prompt_default="$NAMESPACE"

  mode="$(normalize_boolish "$KUBECLAW_WORKSPACE_PROMPT")"
  if [[ -z $NAMESPACE_WAS_SET && -f $KUBECLAW_WORKSPACE_NAMESPACE_FILE ]]; then
    workspace="$(tr -d '[:space:]' <"$KUBECLAW_WORKSPACE_NAMESPACE_FILE")"
    if is_valid_namespace "$workspace"; then
      NAMESPACE="$workspace"
      prompt_default="$workspace"
    else
      warn "Ignoring invalid workspace namespace file: $KUBECLAW_WORKSPACE_NAMESPACE_FILE"
    fi
  fi

  case "$mode" in
    false)
      export NAMESPACE
      return 0
      ;;
    true | auto)
      if [[ $mode == "auto" && -n $NAMESPACE_WAS_SET ]]; then
        export NAMESPACE
        return 0
      fi
      if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
        if [[ $mode == "true" ]]; then
          err "KUBECLAW_WORKSPACE_PROMPT=true requires an interactive terminal."
          return 1
        fi
        export NAMESPACE
        return 0
      fi
      ;;
    *)
      err "Invalid KUBECLAW_WORKSPACE_PROMPT='$KUBECLAW_WORKSPACE_PROMPT' (expected auto, true, or false)"
      return 1
      ;;
  esac

  while true; do
    read -r -p "How would you like to name the workspace namespace? [$prompt_default]: " workspace </dev/tty
    workspace="${workspace:-$prompt_default}"
    if is_valid_namespace "$workspace"; then
      NAMESPACE="$workspace"
      export NAMESPACE
      mkdir -p "$(dirname "$KUBECLAW_WORKSPACE_NAMESPACE_FILE")"
      printf '%s\n' "$NAMESPACE" >"$KUBECLAW_WORKSPACE_NAMESPACE_FILE"
      log "Workspace namespace: $NAMESPACE"
      return 0
    fi
    warn "Use a Kubernetes namespace-safe name: lowercase letters, numbers, hyphens, max 63 chars."
  done
}

component_enabled() {
  local value
  value="$(normalize_boolish "$1")"
  [[ $value == "true" ]]
}

cleanup_buildkit_preflight_pod() {
  local probe_name="$1"
  if kubectl delete pod "$probe_name" -n "$NAMESPACE" --ignore-not-found --wait=true >/dev/null 2>&1; then
    return 0
  fi
  warn "Could not delete temporary BuildKit probe pod '$probe_name'; remove it manually."
  return 1
}

cmd_buildkit_preflight() {
  local probe_name="kubeclaw-buildkit-preflight-$$"
  local socket="unix:///run/user/1000/buildkit/buildkitd.sock"
  local otel_socket="/run/user/1000/buildkit/otel-grpc.sock"
  local probe_image="${1:-$BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE}"
  local pull_secret="${2:-}"
  local pull_secret_yaml=""
  local probe_ready=0

  header "Rootless BuildKit Preflight"
  require_command kubectl

  if [[ ! $probe_image =~ ^[A-Za-z0-9._/@:-]+$ ]]; then
    err "Invalid BuildKit preflight image: $probe_image"
    return 1
  fi
  if [[ -n $pull_secret && ! $pull_secret =~ ^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$ ]]; then
    err "Invalid BuildKit preflight image pull Secret: $pull_secret"
    return 1
  fi
  if [[ -n $pull_secret ]]; then
    pull_secret_yaml="  imagePullSecrets:
    - name: ${pull_secret}"
  fi

  kubectl get namespace "$NAMESPACE" >/dev/null
  info "Starting temporary non-privileged BuildKit probe in namespace '$NAMESPACE'..."
  trap 'cleanup_buildkit_preflight_pod "$probe_name"' EXIT INT TERM

  kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${probe_name}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: kubeclaw-buildkit-preflight
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  securityContext:
    runAsUser: 1000
    runAsGroup: 1000
    runAsNonRoot: true
    fsGroup: 1000
    seccompProfile:
      type: Unconfined
${pull_secret_yaml}
  containers:
    - name: buildkit
      image: "${probe_image}"
      imagePullPolicy: Always
      env:
        - name: XDG_RUNTIME_DIR
          value: /run/user/1000
      command:
        - rootlesskit
      args:
        - --net=host
        - buildkitd
        - --addr
        - ${socket}
        - --otel-socket-path
        - ${otel_socket}
        - --root
        - /tmp/buildkit-state
        - --oci-worker-no-process-sandbox
      securityContext:
        appArmorProfile:
          type: Unconfined
        privileged: false
        allowPrivilegeEscalation: true
        capabilities:
          drop:
            - ALL
          add:
            - SETUID
            - SETGID
      readinessProbe:
        exec:
          command:
            - buildctl
            - --addr
            - ${socket}
            - debug
            - workers
        initialDelaySeconds: 2
        periodSeconds: 2
        timeoutSeconds: 2
        failureThreshold: 60
      volumeMounts:
        - name: buildkit-state
          mountPath: /tmp/buildkit-state
        - name: buildkit-runtime
          mountPath: /run/user/1000
  volumes:
    - name: buildkit-state
      emptyDir: {}
    - name: buildkit-runtime
      emptyDir: {}
EOF

  if kubectl wait --for=condition=Ready "pod/${probe_name}" -n "$NAMESPACE" --timeout="$BUILDKIT_ROOTLESS_PREFLIGHT_TIMEOUT"; then
    if kubectl exec -n "$NAMESPACE" "$probe_name" -c buildkit -- \
      buildctl --addr "$socket" debug workers >/dev/null; then
      probe_ready=1
    fi
  fi

  if [[ $probe_ready == "1" ]]; then
    cleanup_buildkit_preflight_pod "$probe_name"
    trap - EXIT INT TERM
    log "Rootless BuildKit worker initialized successfully."
    return 0
  fi

  err "Rootless BuildKit could not initialize on the scheduled node."
  if ! kubectl describe pod "$probe_name" -n "$NAMESPACE" >&2; then
    warn "Could not describe the failed BuildKit probe pod."
  fi
  if ! kubectl logs "$probe_name" -n "$NAMESPACE" -c buildkit >&2; then
    warn "Could not read logs from the failed BuildKit probe pod."
  fi
  if ! cleanup_buildkit_preflight_pod "$probe_name"; then
    warn "BuildKit preflight cleanup requires operator attention."
  fi
  trap - EXIT INT TERM
  info "Ubuntu/K3s hosts must allow unprivileged user namespaces and an unconfined BuildKit AppArmor profile."
  info "Check: sysctl kernel.unprivileged_userns_clone user.max_user_namespaces kernel.apparmor_restrict_unprivileged_userns"
  info "Node bootstrap, not Helm, owns any required sysctl or AppArmor change."
  return 1
}

cmd_setup() {
  header "Step 1: Namespace"
  local namespace_output

  prompt_workspace_namespace_if_needed

  if namespace_output=$(kubectl get namespace "$NAMESPACE" 2>&1); then
    warn "Namespace '$NAMESPACE' already exists"
  elif is_not_found_error "$namespace_output"; then
    kubectl create namespace "$NAMESPACE"
    log "Created namespace: $NAMESPACE"
  else
    err "Failed to check namespace '$NAMESPACE'"
    echo "$namespace_output" >&2
    return 1
  fi

  header "Step 2: Helm Repos"

  add_helm_repo_once bitnami https://charts.bitnami.com/bitnami
  add_helm_repo_once qdrant https://qdrant.github.io/qdrant-helm
  add_helm_repo_once tailscale "$TAILSCALE_HELM_REPO"
  add_helm_repo_once spiffe "$SPIFFE_HELM_REPO"
  helm repo update >/dev/null
  log "Helm repos ready"

  run_secret_setup_if_enabled

  echo ""
  info "Next: ./deploy.sh infra && ./deploy.sh agents"

  # k3s node registry config — local verification needs an explicit private pull path.
  header "k3s Registry Config (optional local-image verification)"
  K3S_REG_FILE="/etc/rancher/k3s/registries.yaml"
  if [ -f "$K3S_REG_FILE" ] && grep -q "registry-local.${NAMESPACE}.svc.cluster.local" "$K3S_REG_FILE"; then
    log "k3s registries.yaml already configured for registry-local"
  else
    warn "registry-local is ClusterIP by default and has no NodePort."
    warn "Live local-image verification needs an explicit private pull path before containerd can pull those images."
    echo ""
    info "For now, keep using published images or configure a private registry path deliberately."
    echo ""
  fi
}

cmd_secrets() {
  header "Secrets"
  prompt_workspace_namespace_if_needed
  run_secret_setup
}

run_secret_setup_if_enabled() {
  local mode="${KUBECLAW_RUN_SECRET_SETUP:-auto}"
  local normalized_mode
  normalized_mode="$(normalize_boolish "$mode")"

  case "$normalized_mode" in
    false)
      warn "Secret setup skipped by KUBECLAW_RUN_SECRET_SETUP=$mode"
      return 0
      ;;
    true)
      run_secret_setup
      return 0
      ;;
    auto)
      if [[ -r /dev/tty && -w /dev/tty ]]; then
        run_secret_setup
      else
        warn "Secret setup skipped because no TTY is available. Run ./scripts/deploy.sh secrets or set KUBECLAW_RUN_SECRET_SETUP=true."
      fi
      return 0
      ;;
    *)
      err "Invalid KUBECLAW_RUN_SECRET_SETUP='$mode' (expected auto, true, or false)"
      return 1
      ;;
  esac
}

run_secret_setup() {
  local helper="$VALUES_DIR/setup-secrets.sh"

  if [[ ! -x $helper ]]; then
    err "Secret setup helper is not executable: $helper"
    info "Run: chmod +x $helper"
    return 1
  fi

  "$helper"
}

# ─── Infrastructure ──────────────────────────────────────────────────────

normalize_boolish() {
  local value
  value="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1 | true | yes | on | enabled) echo "true" ;;
    0 | false | no | off | disabled) echo "false" ;;
    *) echo "$value" ;;
  esac
}

require_spiffe_csi_driver() {
  if kubectl get csidriver csi.spiffe.io >/dev/null 2>&1; then
    return 0
  fi
  err "Worker Trust requires CSIDriver/csi.spiffe.io, but it is not registered"
  info "Install or repair SPIRE first: ./scripts/deploy.sh infra"
  return 1
}

require_pipeline_source_attestation_secret() {
  local name="pipeline-test-gate-source-attestation"
  local key
  if ! kubectl get secret "$name" -n "$NAMESPACE" >/dev/null 2>&1; then
    err "Worker Trust requires Secret ${NAMESPACE}/${name}"
    info "Create it locally: ./scripts/deploy.sh secrets"
    return 1
  fi
  for key in privateKey publicKey; do
    if ! kubectl get secret "$name" -n "$NAMESPACE" \
      -o "go-template={{ index .data \"${key}\" }}" 2>/dev/null | grep -q .; then
      err "Secret ${NAMESPACE}/${name} is missing required key ${key}"
      info "Repair it locally: KUBECLAW_SECRETS_OVERWRITE=true ./scripts/deploy.sh secrets"
      return 1
    fi
  done
}

require_agent_worker_trust_prerequisites() {
  require_spiffe_csi_driver
  require_pipeline_source_attestation_secret
}

deploy_tailscale_operator() {
  local mode="${TAILSCALE_OPERATOR_ENABLED:-true}"
  local normalized_mode
  normalized_mode="$(normalize_boolish "$mode")"

  header "Infrastructure: Tailscale Kubernetes Operator"

  require_command kubectl
  require_command helm

  if [[ $normalized_mode == "false" ]]; then
    warn "Tailscale operator install disabled by TAILSCALE_OPERATOR_ENABLED=$mode"
    return 0
  fi

  local secret_status=0
  if ensure_tailscale_oauth_secret "$normalized_mode"; then
    secret_status=0
  else
    secret_status=$?
  fi
  if [[ $secret_status == "2" ]]; then
    return 0
  fi
  if [[ $secret_status != "0" ]]; then
    return "$secret_status"
  fi

  if [[ ! -f $TAILSCALE_VALUES_FILE ]]; then
    err "Tailscale values file not found: $TAILSCALE_VALUES_FILE"
    return 1
  fi

  add_helm_repo_once tailscale "$TAILSCALE_HELM_REPO"
  helm repo update >/dev/null

  helm upgrade --install "$TAILSCALE_OPERATOR_RELEASE" tailscale/tailscale-operator \
    --namespace "$TAILSCALE_OPERATOR_NAMESPACE" \
    --create-namespace \
    --values "$TAILSCALE_VALUES_FILE" \
    --wait --timeout 180s

  kubectl wait --for=condition=Ready pod \
    -l "app.kubernetes.io/instance=$TAILSCALE_OPERATOR_RELEASE" \
    -n "$TAILSCALE_OPERATOR_NAMESPACE" \
    --timeout=180s
  kubectl get ingressclass tailscale >/dev/null
  log "Tailscale operator deployed in namespace: $TAILSCALE_OPERATOR_NAMESPACE"
}

ensure_tailscale_oauth_secret() {
  local normalized_mode="$1"
  local client_id="${TAILSCALE_OAUTH_CLIENT_ID:-}"
  local client_secret="${TAILSCALE_OAUTH_CLIENT_SECRET:-}"
  local output

  if output=$(kubectl get secret "$TAILSCALE_OAUTH_SECRET_NAME" -n "$TAILSCALE_OPERATOR_NAMESPACE" 2>&1); then
    log "Using existing Tailscale OAuth secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    return 0
  fi

  if ! is_not_found_error "$output"; then
    err "Failed to check Tailscale OAuth secret '${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}'"
    echo "$output" >&2
    return 1
  fi

  if [[ -n $client_id && -n $client_secret ]]; then
    kubectl create namespace "$TAILSCALE_OPERATOR_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    kubectl create secret generic "$TAILSCALE_OAUTH_SECRET_NAME" \
      --namespace "$TAILSCALE_OPERATOR_NAMESPACE" \
      --from-literal=client_id="$client_id" \
      --from-literal=client_secret="$client_secret" \
      --dry-run=client -o yaml | kubectl apply -f -
    log "Created Tailscale OAuth secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    return 0
  fi

  if [[ $normalized_mode == "true" ]]; then
    err "Tailscale operator install requires Secret/${TAILSCALE_OAUTH_SECRET_NAME} in namespace '${TAILSCALE_OPERATOR_NAMESPACE}' with keys client_id and client_secret."
    info "Create it with:"
    info "  kubectl create namespace ${TAILSCALE_OPERATOR_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -"
    info "  kubectl create secret generic ${TAILSCALE_OAUTH_SECRET_NAME} -n ${TAILSCALE_OPERATOR_NAMESPACE} --from-literal=client_id=... --from-literal=client_secret=..."
    return 1
  fi

  warn "Skipping Tailscale operator install; missing Secret/${TAILSCALE_OAUTH_SECRET_NAME} in namespace '${TAILSCALE_OPERATOR_NAMESPACE}'."
  warn "Final-preview tailnet URLs need that secret or temporary TAILSCALE_OAUTH_CLIENT_ID / TAILSCALE_OAUTH_CLIENT_SECRET bootstrap env vars."
  return 2
}

cmd_infra() {
  if component_enabled "$KUBECLAW_DEPLOY_SPIRE"; then
    header "Infrastructure: SPIFFE/SPIRE workload identity"
    if [[ ! -f $SPIRE_VALUES_FILE ]]; then
      err "SPIRE values file not found: $SPIRE_VALUES_FILE"
      return 1
    fi
    # Existing-cluster Cilium path: policy must precede Helm hook/readiness waits.
    kubectl get namespace spire-server spire-system >/dev/null || {
      err "Prepare SPIRE namespaces and Helm ownership as documented before first Cilium-era SPIRE install"; return 1;
    }
    kubectl apply -f "$INFRA_DIR/spire-network-policies.yaml"
    add_helm_repo_once spiffe "$SPIFFE_HELM_REPO"
    helm repo update >/dev/null
    helm upgrade --install spire-crds spiffe/spire-crds \
      --namespace spire-server --create-namespace \
      --version "$SPIRE_CRDS_CHART_VERSION" \
      --wait --timeout 300s
    helm upgrade --install spire spiffe/spire \
      --namespace spire-server --create-namespace \
      --version "$SPIRE_CHART_VERSION" \
      --values "$SPIRE_VALUES_FILE" \
      --wait --timeout 600s
    kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=agent \
      -n spire-system --timeout=300s
    require_spiffe_csi_driver
    log "SPIRE server, agent, controller manager, and CSI driver deployed"
  else
    warn "Skipping SPIRE by KUBECLAW_DEPLOY_SPIRE=$KUBECLAW_DEPLOY_SPIRE"
  fi

  header "Infrastructure: Redis"
  helm upgrade --install redis bitnami/redis \
    --namespace "$NAMESPACE" \
    --values "$INFRA_DIR/redis-values.yaml" \
    --wait --timeout 120s
  log "Redis deployed"

  if component_enabled "$KUBECLAW_DEPLOY_POSTGRESQL"; then
    header "Infrastructure: PostgreSQL"
    helm upgrade --install postgresql bitnami/postgresql \
      --namespace "$NAMESPACE" \
      --values "$INFRA_DIR/postgresql-values.yaml" \
      --wait --timeout 120s
    log "PostgreSQL deployed"
  else
    warn "Skipping PostgreSQL by KUBECLAW_DEPLOY_POSTGRESQL=$KUBECLAW_DEPLOY_POSTGRESQL"
  fi

  if component_enabled "$KUBECLAW_DEPLOY_QDRANT"; then
    header "Infrastructure: Qdrant"
    helm upgrade --install qdrant qdrant/qdrant \
      --namespace "$NAMESPACE" \
      --values "$INFRA_DIR/qdrant-values.yaml" \
      --wait --timeout 120s
    log "Qdrant deployed"
  else
    warn "Skipping Qdrant by KUBECLAW_DEPLOY_QDRANT=$KUBECLAW_DEPLOY_QDRANT"
  fi

  if component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    header "Infrastructure: LiteLLM"
    if [[ ! $LITELLM_NODE_PORT =~ ^[0-9]+$ ]] \
      || (( LITELLM_NODE_PORT < 30000 || LITELLM_NODE_PORT > 32767 )); then
      err "LITELLM_NODE_PORT must be an integer in the Kubernetes NodePort range 30000-32767."
      return 1
    fi
    # LiteLLM config as ConfigMap
    kubectl create configmap litellm-config \
      --namespace "$NAMESPACE" \
      --from-file=config.yaml="$INFRA_DIR/litellm-config.yaml" \
      --dry-run=client -o yaml | kubectl apply -f -

    # LiteLLM Deployment + Service (no Helm chart — plain manifest)
    kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/litellm-deployment.yaml"
    kubectl patch service litellm -n "$NAMESPACE" --type=merge \
      -p "{\"spec\":{\"ports\":[{\"name\":\"http\",\"port\":4000,\"targetPort\":4000,\"nodePort\":$LITELLM_NODE_PORT,\"protocol\":\"TCP\"}]}}"
    info "Waiting for LiteLLM to be ready..."
    wait_for_rollout_required "LiteLLM" deployment/litellm -n "$NAMESPACE" --timeout=120s
    log "LiteLLM deployed"
  else
    warn "Skipping LiteLLM by KUBECLAW_DEPLOY_LITELLM=$KUBECLAW_DEPLOY_LITELLM"
  fi

  header "Infrastructure: Registry Mirror"
  kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/registry-mirror.yaml"
  info "Waiting for Registry Mirror to be ready..."
  wait_for_rollout_required "Registry Mirror" deployment/registry-mirror -n "$NAMESPACE" --timeout=120s
  log "Registry Mirror deployed"

  header "Infrastructure: Registry Local (writable, buster test images)"
  kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/registry-local.yaml"
  info "Waiting for Registry Local to be ready..."
  wait_for_rollout_required "Registry Local" deployment/registry-local -n "$NAMESPACE" --timeout=60s
  log "Registry Local deployed"

  header "Infrastructure: Buster Namespace Fence (VAP)"
  [[ "$NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ && ${#NAMESPACE} -le 63 ]] || { err "Invalid namespace"; return 1; }
  sed "s/system:serviceaccount:kubeclaw:/system:serviceaccount:${NAMESPACE}:/g" "$INFRA_DIR/buster-namespace-fence.yaml" | kubectl apply -f -
  log "Buster namespace fence applied"

  header "Infrastructure: Network Policies"
  kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/network-policies.yaml"
  kubectl apply -f "$INFRA_DIR/ops-mcp-network-policies.yaml"
  log "Network policies applied"

  deploy_tailscale_operator

  echo ""
  log "Infrastructure deployed. Pods:"
  kubectl get pods -n "$NAMESPACE" --no-headers | awk '{print "  " $1 " → " $3}'
}

# ─── Agents ──────────────────────────────────────────────────────────────

reconcile_nova_retired_trust_mount() {
  local deployment="agent-nova"
  local retired_fields=""

  if ! kubectl get deployment "$deployment" -n "$NAMESPACE" >/dev/null 2>&1; then
    return 0
  fi

  retired_fields="$(kubectl get deployment "$deployment" -n "$NAMESPACE" \
    -o 'jsonpath={range .spec.template.spec.containers[?(@.name=="kubeclaw")].env[?(@.name=="NODE_EXTRA_CA_CERTS")]}{.name}{"\n"}{end}{range .spec.template.spec.containers[?(@.name=="kubeclaw")].volumeMounts[?(@.name=="buster-plan-trust")]}{.name}{"\n"}{end}{range .spec.template.spec.volumes[?(@.name=="buster-plan-trust")]}{.name}{"\n"}{end}')"
  if [[ -z $retired_fields ]]; then
    return 0
  fi

  warn "Reconciling retired Nova direct-TLS trust metadata before Helm upgrade"
  kubectl patch deployment "$deployment" -n "$NAMESPACE" --type=strategic --patch \
    '{"spec":{"template":{"spec":{"containers":[{"name":"kubeclaw","env":[{"name":"NODE_EXTRA_CA_CERTS","$patch":"delete"}],"volumeMounts":[{"mountPath":"/var/run/buster-plan-trust","$patch":"delete"}]}],"volumes":[{"name":"buster-plan-trust","$patch":"delete"}]}}}}'
}

reconcile_buster_runtime_ports() {
  local deployment="agent-buster"
  local runtime_index=""
  local current_ports=""
  local expected_ports=$'plan-runtime:28891:TCP'

  if ! kubectl get deployment "$deployment" -n "$NAMESPACE" >/dev/null 2>&1; then
    return 0
  fi

  runtime_index="$(kubectl get deployment "$deployment" -n "$NAMESPACE" \
    -o 'go-template={{range $index, $container := .spec.template.spec.containers}}{{if eq $container.name "buster-v2-runtime"}}{{$index}}{{end}}{{end}}')"
  if [[ ! $runtime_index =~ ^[0-9]+$ ]]; then
    return 0
  fi

  current_ports="$(kubectl get deployment "$deployment" -n "$NAMESPACE" \
    -o 'jsonpath={range .spec.template.spec.containers[?(@.name=="buster-v2-runtime")].ports[*]}{.name}{":"}{.containerPort}{":"}{.protocol}{"\n"}{end}')"
  if [[ $current_ports == "$expected_ports" ]]; then
    return 0
  fi

  warn "Reconciling stale Buster runtime port metadata before Helm upgrade"
  kubectl patch deployment "$deployment" -n "$NAMESPACE" --type=json --patch \
    "[{\"op\":\"test\",\"path\":\"/spec/template/spec/containers/${runtime_index}/name\",\"value\":\"buster-v2-runtime\"},{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/${runtime_index}/ports\",\"value\":[{\"name\":\"plan-runtime\",\"containerPort\":28891,\"protocol\":\"TCP\"}]}]"
}

verify_buster_port_routing() {
  local runtime_ports=""
  local proxy_ports=""
  local service_ports=""
  local expected_runtime=$'plan-runtime:28891:TCP'
  local expected_proxy=$'buster-plan:18891:TCP'
  local expected_service=$'buster-plan:18891:buster-plan'

  runtime_ports="$(kubectl get deployment agent-buster -n "$NAMESPACE" \
    -o 'jsonpath={range .spec.template.spec.containers[?(@.name=="buster-v2-runtime")].ports[*]}{.name}{":"}{.containerPort}{":"}{.protocol}{"\n"}{end}')"
  proxy_ports="$(kubectl get deployment agent-buster -n "$NAMESPACE" \
    -o 'jsonpath={range .spec.template.spec.containers[?(@.name=="worker-trust-proxy")].ports[*]}{.name}{":"}{.containerPort}{":"}{.protocol}{"\n"}{end}')"
  service_ports="$(kubectl get service agent-buster -n "$NAMESPACE" \
    -o 'jsonpath={range .spec.ports[?(@.name=="buster-plan")]}{.name}{":"}{.port}{":"}{.targetPort}{"\n"}{end}')"

  if [[ $runtime_ports != "$expected_runtime" || $proxy_ports != "$expected_proxy" || $service_ports != "$expected_service" ]]; then
    err "Buster port routing invariant failed"
    err "  runtime: ${runtime_ports//$'\n'/, }"
    err "  proxy:   ${proxy_ports//$'\n'/, }"
    err "  service: ${service_ports//$'\n'/, }"
    return 1
  fi

  log "Buster Service targets Envoy only; runtime ports are distinct"
}

deploy_agent() {
  local role="$1"
  local mode="${2:-image}"
  local values_file="$VALUES_DIR/${role}-values.yaml"
  local image_repo=""
  local image_tag=""
  local controller_image_repo=""
  local controller_image_tag=""
  local bundle_archive_url=""
  local bundle_expected_commit=""
  local bundle_contract_version=""
  local bundle_auth_secret=""
  local bundle_auth_key=""
  local override_file=""
  local disable_pull_secrets="${DISABLE_IMAGE_PULL_SECRETS:-0}"
  local helm_args=()

  if [[ ! -f $values_file ]]; then
    err "Values file not found: $values_file"
    return 1
  fi

  require_agent_worker_trust_prerequisites
  require_helm_release_idle "agent-${role}" "$NAMESPACE"

  case "$role" in
    nova)
      image_repo="${NOVA_IMAGE_REPOSITORY:-${GENERAL_IMAGE_REPOSITORY:-}}"
      image_tag="${NOVA_IMAGE_TAG:-${GENERAL_IMAGE_TAG:-}}"
      ;;
    buster)
      image_repo="${BUSTER_GATEWAY_IMAGE_REPOSITORY:-}"
      image_tag="${BUSTER_GATEWAY_IMAGE_TAG:-}"
      controller_image_repo="${BUSTER_CONTROLLER_IMAGE_REPOSITORY:-${NAMESPACE_CONTROLLER_IMAGE_REPOSITORY:-}}"
      controller_image_tag="${BUSTER_CONTROLLER_IMAGE_TAG:-${NAMESPACE_CONTROLLER_IMAGE_TAG:-}}"
      ;;
  esac

  if [[ -z $image_repo ]]; then
    image_repo="$(yaml_get_section_key "$values_file" image repository)"
  fi

  if [[ $mode == "code" ]]; then
    bundle_expected_commit="$(bundle_env_for_role "$role" expected_commit)"
    bundle_contract_version="$(bundle_env_for_role "$role" contract_version)"
    bundle_auth_secret="$(bundle_env_for_role "$role" auth_secret)"
    bundle_auth_key="$(bundle_env_for_role "$role" auth_key)"
    bundle_archive_url="$(bundle_env_for_role "$role" archive_url)"

    if [[ -z $bundle_auth_secret ]]; then
      bundle_auth_secret="$(yaml_get_nested_section_key "$values_file" codeBundle auth existingSecret)"
    fi
    if [[ -z $bundle_auth_key || $bundle_auth_key == "token" ]]; then
      local values_auth_key=""
      values_auth_key="$(yaml_get_nested_section_key "$values_file" codeBundle auth existingSecretKey)"
      if [[ -n $values_auth_key ]]; then
        bundle_auth_key="$values_auth_key"
      fi
    fi

    if [[ -z $bundle_expected_commit ]]; then
      if ! bundle_expected_commit="$(default_bundle_expected_commit)"; then
        err "${role} code deploy requires $(tr '[:lower:]' '[:upper:]' <<<"$role")_CODE_BUNDLE_EXPECTED_COMMIT or a resolvable ${CODE_BUNDLE_DEFAULT_REF}"
        return 1
      fi
      info "Resolved ${role} code bundle commit from ${CODE_BUNDLE_DEFAULT_REF}: ${bundle_expected_commit}"
    fi
    if [[ -z $bundle_archive_url ]]; then
      if ! bundle_archive_url="$(default_bundle_archive_url "$role" "$bundle_expected_commit" "$image_repo")"; then
        bundle_archive_url=""
      fi
    fi
    if [[ -z $bundle_archive_url ]]; then
      err "${role} code deploy requires $(tr '[:lower:]' '[:upper:]' <<<"$role")_CODE_BUNDLE_ARCHIVE_URL or a derivable GitHub repository"
      return 1
    fi
    verify_bundle_archive_url "$role" "$bundle_archive_url" "$bundle_expected_commit" "$bundle_auth_secret"
  fi

  if [[ -n $image_repo || -n $image_tag || -n $controller_image_repo || -n $controller_image_tag || $disable_pull_secrets == "1" || $mode == "code" ]]; then
    override_file="$(mktemp)"
    : >"$override_file"
  fi

  if [[ -n $override_file && (-n $image_repo || -n $image_tag || -n $controller_image_repo || -n $controller_image_tag || $disable_pull_secrets == "1") ]]; then
    append_image_override_file "$override_file" "$image_repo" "$image_tag" "$disable_pull_secrets" "$controller_image_repo" "$controller_image_tag"
  fi

  if [[ -n $override_file && $mode == "code" ]]; then
    append_code_bundle_override_file "$override_file" "$bundle_archive_url" "$bundle_expected_commit" "$bundle_contract_version" "$bundle_auth_secret" "$bundle_auth_key"
  fi

  if [[ $role == "nova" ]]; then
    reconcile_nova_retired_trust_mount
  elif [[ $role == "buster" ]]; then
    reconcile_buster_runtime_ports
  fi

  helm_args=(
    upgrade --install "agent-${role}" "$CHART_DIR"
    --namespace "$NAMESPACE"
    --reset-values
    --values "$values_file"
    --atomic --cleanup-on-fail --wait --timeout "$AGENT_HELM_TIMEOUT"
  )

  if ! component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    helm_args+=(--set probes.dependencies.litellm.enabled=false)
  fi
  if ! component_enabled "$KUBECLAW_DEPLOY_QDRANT"; then
    helm_args+=(--set probes.dependencies.qdrant.enabled=false)
  fi

  if [[ -n $override_file ]]; then
    helm_args+=(--values "$override_file")
  fi

  info "Deploying agent-${role} (${mode})..."
  if ! helm "${helm_args[@]}"; then
    if [[ -n $override_file ]]; then
      rm -f "$override_file"
    fi
    return 1
  fi

  if [[ -n $override_file ]]; then
    rm -f "$override_file"
  fi

  if [[ $role == "buster" ]]; then
    verify_buster_port_routing
  fi

  if [[ $mode == "image" ]]; then
    kubectl rollout restart deployment -n "$NAMESPACE" -l "app.kubernetes.io/instance=agent-${role}"
  fi
  wait_for_agent_rollout "agent-${role}"
  if [[ $role == "buster" && $mode == "image" ]]; then
    kubectl rollout status deployment/agent-buster-namespace-controller -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  fi
  log "agent-${role} deployed (${mode})"
}

cmd_agents() {
  header "Agents (image deploy)"
  # Nova = orchestrator + Forge/Echo as ACP subagents (all in one pod)
  # Buster = isolated tester (gateway plus rootless BuildKit pipeline sidecar)
  for role in nova buster; do
    deploy_agent "$role" image
  done

  echo ""
  log "All agents deployed."
  kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=kubeclaw --no-headers |
    awk '{print "  " $1 " → " $3}'
}

cmd_image() {
  local roles
  roles="$(resolve_deploy_targets "${1:-both}")" || return 1
  header "Image Deploy"
  for role in $roles; do
    deploy_agent "$role" image
  done
}

cmd_code() {
  local roles
  roles="$(resolve_deploy_targets "${1:-both}")" || return 1
  header "Code Deploy"
  for role in $roles; do
    deploy_agent "$role" code
  done
}

cmd_agent() {
  local role="${1:-}"
  local with_code=0
  local extra_arg="${2:-}"

  if [[ -z $role ]]; then
    err "Usage: $0 agent <nova|buster|prism> [--with-code]"
    return 1
  fi

  if [[ $role == "prism" ]]; then
    if [[ -n $extra_arg ]]; then
      err "Prism uses its dedicated multi-workload release and does not support --with-code"
      return 1
    fi
    cmd_prism
    return
  fi

  case "$role" in
    nova|buster) ;;
    *)
      err "Unknown agent role: $role (expected nova, buster, or prism)"
      return 1
      ;;
  esac

  case "$extra_arg" in
    "")
      ;;
    --with-code)
      with_code=1
      ;;
    *)
      err "Usage: $0 agent <nova|buster|prism> [--with-code]"
      return 1
      ;;
  esac

  header "Agent Deploy: ${role}"
  deploy_agent "$role" image

  if [[ $with_code == "1" ]]; then
    cmd_smoke_agent "$role"
    deploy_agent "$role" code
    cmd_smoke_agent "$role"
  fi
}

# ─── Status ──────────────────────────────────────────────────────────────

cmd_status() {
  header "Pods ($NAMESPACE)"
  show_optional_kubectl_table pods pods -n "$NAMESPACE" -o wide

  echo ""
  header "Services ($NAMESPACE)"
  show_optional_kubectl_table services svc -n "$NAMESPACE"

  echo ""
  header "PVCs ($NAMESPACE)"
  show_optional_kubectl_table PVCs pvc -n "$NAMESPACE"
}

cmd_smoke_agent() {
  local role="$1"
  local release="agent-${role}"
  local selector
  local pod

  if [[ $role != "nova" && $role != "buster" ]]; then
    err "Usage: $0 smoke-agent <nova|buster>"
    return 1
  fi

  header "Smoke: ${release}"
  selector="app.kubernetes.io/instance=${release},app.kubernetes.io/component=${role}"
  kubectl get deployment "$release" -n "$NAMESPACE" >/dev/null
  kubectl get svc "$release" -n "$NAMESPACE" >/dev/null
  kubectl rollout status deployment/"$release" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  kubectl wait --for=condition=Ready pod -l "$selector" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  pod="$(agent_pod_name "$release")"
  kubectl exec -n "$NAMESPACE" "$pod" -c kubeclaw -- openclaw gateway status
  kubectl exec -n "$NAMESPACE" "$pod" -c kubeclaw -- node /runtime-config/kubeclaw-health.mjs startup-status
  kubectl exec -n "$NAMESPACE" "$pod" -c kubeclaw -- node /runtime-config/kubeclaw-health.mjs readiness
  kubectl exec -n "$NAMESPACE" "$pod" -c kubeclaw -- test -d /app/skills
  kubectl exec -n "$NAMESPACE" "$pod" -c kubeclaw -- test -f /home/node/.openclaw/swarm.config.json
  log "${release} smoke passed"
}

cmd_smoke() {
  header "Agent Smoke"
  for role in nova buster; do
    cmd_smoke_agent "$role"
  done
  if component_enabled "$KUBECLAW_DEPLOY_PRISM"; then cmd_prism_smoke; fi
}

# ─── Prism ──────────────────────────────────────────────────────────────

prism_image_overrides() {
  local pairs=(control CONTROL studio STUDIO worker WORKER ingestion INGESTION)
  local index kind upper repository digest selected_digest
  for ((index=0; index<${#pairs[@]}; index+=2)); do
    kind="${pairs[index]}"; upper="${pairs[index+1]}"
    repository="PRISM_${upper}_IMAGE_REPOSITORY"; digest="PRISM_${upper}_IMAGE_DIGEST"
    [[ -z ${!repository:-} ]] || printf '%s\n' --set-string "images.${kind}.repository=${!repository}"
    selected_digest="${!digest:-}"
    if [[ -z $selected_digest ]]; then
      selected_digest="$(yaml_get_nested_section_key "$PRISM_VALUES_FILE" images "$kind" digest)"
    fi
    [[ $selected_digest =~ ^sha256:[0-9a-f]{64}$ ]] || {
      err "Prism ${kind} image digest is missing or invalid; set PRISM_${upper}_IMAGE_DIGEST or images.${kind}.digest in ${PRISM_VALUES_FILE}"
      return 1
    }
    printf '%s\n' --set-string "images.${kind}.digest=${selected_digest}"
    printf '%s\n' --set-string "images.${kind}.pullPolicy=IfNotPresent"
  done
}

prism_validate_values() {
  [[ -f $PRISM_VALUES_FILE ]] || { err "Prism values file is missing: $PRISM_VALUES_FILE"; return 1; }
  [[ -f $PRISM_AGENT_VALUES_FILE ]] || { err "Prism agent values file is missing: $PRISM_AGENT_VALUES_FILE"; return 1; }
}

capture_prism_migration_logs() {
  local output_file="$1" pod="" container=""
  while [[ -z $pod ]]; do
    pod="$(kubectl get pods -n "$PRISM_NAMESPACE" -l app=prism-migrate \
      --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null || true)"
    [[ -n $pod ]] || sleep 1
  done
  for container in bootstrap-database-roles migrate; do
    while ! kubectl get pod "$pod" -n "$PRISM_NAMESPACE" \
      -o "jsonpath={.status.initContainerStatuses[?(@.name=='${container}')].state.running.startedAt}{.status.initContainerStatuses[?(@.name=='${container}')].state.terminated.finishedAt}{.status.containerStatuses[?(@.name=='${container}')].state.running.startedAt}{.status.containerStatuses[?(@.name=='${container}')].state.terminated.finishedAt}" \
      2>/dev/null | grep -q .; do
      kubectl get pod "$pod" -n "$PRISM_NAMESPACE" >/dev/null 2>&1 || return 0
      sleep 1
    done
    {
      printf '\n===== prism-migrate/%s =====\n' "$container"
      kubectl logs "$pod" -n "$PRISM_NAMESPACE" -c "$container" --follow --timestamps 2>&1 || true
    } >>"$output_file"
  done
}

cmd_prism_secrets() {
  kubectl get namespace "$PRISM_NAMESPACE" >/dev/null
  kubectl get secret "$PRISM_IMAGE_PULL_SECRET_NAME" -n "$PRISM_NAMESPACE" >/dev/null 2>&1 \
    || { err "Missing image pull Secret: ${PRISM_NAMESPACE}/${PRISM_IMAGE_PULL_SECRET_NAME}"; return 1; }
  if ! kubectl get secret "$PRISM_DATABASE_SECRET_NAME" -n "$PRISM_NAMESPACE" >/dev/null 2>&1; then
    local password runtime_password migrator_password readonly_password
    password="$(openssl rand -hex 32)"; runtime_password="$(openssl rand -hex 32)"; migrator_password="$(openssl rand -hex 32)"; readonly_password="$(openssl rand -hex 32)"
    kubectl create secret generic "$PRISM_DATABASE_SECRET_NAME" -n "$PRISM_NAMESPACE" \
      --from-literal=password="$password" \
      --from-literal=runtime-password="$runtime_password" \
      --from-literal=migrator-password="$migrator_password" \
      --from-literal=readonly-password="$readonly_password" \
      --from-literal=admin-url="postgresql://postgres:${password}@prism-postgresql:5432/prism" \
      --from-literal=runtime-url="postgresql://prism_runtime:${runtime_password}@prism-postgresql:5432/prism" \
      --from-literal=migrator-url="postgresql://prism_migrator:${migrator_password}@prism-postgresql:5432/prism" \
      --from-literal=readonly-url="postgresql://prism_readonly:${readonly_password}@prism-postgresql:5432/prism"
  fi
  if ! kubectl get secret "$PRISM_RUNTIME_SECRET_NAME" -n "$PRISM_NAMESPACE" >/dev/null 2>&1; then
    kubectl create secret generic "$PRISM_RUNTIME_SECRET_NAME" -n "$PRISM_NAMESPACE" \
      --from-literal=session-secret="$(openssl rand -hex 32)" \
      --from-literal=ingress-secret="$(openssl rand -hex 32)" \
      --from-literal=dispatch-secret="$(openssl rand -hex 32)" \
      --from-literal=worker-secret="$(openssl rand -hex 32)" \
      --from-literal=ingestion-secret="$(openssl rand -hex 32)"
  fi
  local secret_key
  for secret_key in password runtime-password migrator-password readonly-password admin-url runtime-url migrator-url readonly-url; do
    kubectl get secret "$PRISM_DATABASE_SECRET_NAME" -n "$PRISM_NAMESPACE" -o "jsonpath={.data.${secret_key}}" | grep -q . || { err "Secret ${PRISM_DATABASE_SECRET_NAME} is missing ${secret_key}; rotate or repair the Secret"; return 1; }
  done
  for secret_key in session-secret ingress-secret dispatch-secret worker-secret ingestion-secret; do
    kubectl get secret "$PRISM_RUNTIME_SECRET_NAME" -n "$PRISM_NAMESPACE" -o "jsonpath={.data.${secret_key}}" | grep -q . || { err "Secret ${PRISM_RUNTIME_SECRET_NAME} is missing ${secret_key}; rotate or repair the Secret"; return 1; }
  done
  kubectl get secret openclaw-shared-secrets -n "$PRISM_NAMESPACE" >/dev/null 2>&1 \
    || { err "Missing ${PRISM_NAMESPACE}/openclaw-shared-secrets for the Prism OpenClaw gateway; run ./scripts/deploy.sh secrets"; return 1; }
  kubectl get secret openclaw-shared-secrets -n "$PRISM_NAMESPACE" -o jsonpath='{.data.gatewayToken-prism}' | grep -q . \
    || { err "Secret ${PRISM_NAMESPACE}/openclaw-shared-secrets is missing gatewayToken-prism; run ./scripts/deploy.sh secrets"; return 1; }
  if [[ $PRISM_NAMESPACE == "$NAMESPACE" \
    && $PRISM_RUNTIME_SECRET_NAME == prism-runtime \
    && $PRISM_DATABASE_SECRET_NAME == prism-postgresql-auth \
    && $PRISM_IMAGE_PULL_SECRET_NAME == ghcr-secret ]]; then
    prepare_prism_e2e_source_secrets
  fi
  log "Prism secrets are present (values not printed)"
}

cmd_prism() {
  component_enabled "$KUBECLAW_DEPLOY_PRISM" || { info "Prism deployment is disabled"; return 0; }
  require_command kubectl; require_command helm; prism_validate_values
  require_helm_release_idle "$PRISM_RELEASE" "$PRISM_NAMESPACE"
  require_helm_release_idle agent-prism "$PRISM_NAMESPACE"
  require_spiffe_csi_driver
  cmd_prism_secrets
  local prism_agent_image_repo prism_bundle_archive_url prism_bundle_expected_commit
  local prism_bundle_contract_version prism_bundle_auth_secret prism_bundle_auth_key
  local prism_bundle_override
  prism_agent_image_repo="$(yaml_get_section_key "$PRISM_AGENT_VALUES_FILE" image repository)"
  prism_bundle_expected_commit="$(bundle_env_for_role prism expected_commit)"
  prism_bundle_contract_version="$(bundle_env_for_role prism contract_version)"
  prism_bundle_auth_secret="$(bundle_env_for_role prism auth_secret)"
  prism_bundle_auth_key="$(bundle_env_for_role prism auth_key)"
  prism_bundle_archive_url="$(bundle_env_for_role prism archive_url)"
  if [[ -z $prism_bundle_auth_secret ]]; then
    prism_bundle_auth_secret="$(yaml_get_nested_section_key "$PRISM_AGENT_VALUES_FILE" codeBundle auth existingSecret)"
  fi
  if [[ -z $prism_bundle_auth_key || $prism_bundle_auth_key == "token" ]]; then
    local prism_values_auth_key=""
    prism_values_auth_key="$(yaml_get_nested_section_key "$PRISM_AGENT_VALUES_FILE" codeBundle auth existingSecretKey)"
    if [[ -n $prism_values_auth_key ]]; then
      prism_bundle_auth_key="$prism_values_auth_key"
    fi
  fi
  if [[ -z $prism_bundle_expected_commit ]]; then
    if ! prism_bundle_expected_commit="$(default_bundle_expected_commit)"; then
      err "Prism deploy requires PRISM_CODE_BUNDLE_EXPECTED_COMMIT or a resolvable ${CODE_BUNDLE_DEFAULT_REF}"
      return 1
    fi
    info "Resolved Prism code bundle commit from ${CODE_BUNDLE_DEFAULT_REF}: ${prism_bundle_expected_commit}"
  fi
  if [[ -z $prism_bundle_archive_url ]]; then
    prism_bundle_archive_url="$(default_bundle_archive_url prism "$prism_bundle_expected_commit" "$prism_agent_image_repo")" || true
  fi
  if [[ -z $prism_bundle_archive_url ]]; then
    err "Prism deploy requires PRISM_CODE_BUNDLE_ARCHIVE_URL or a derivable GitHub repository"
    return 1
  fi
  verify_bundle_archive_url prism "$prism_bundle_archive_url" "$prism_bundle_expected_commit" "$prism_bundle_auth_secret"
  local override_output
  override_output="$(prism_image_overrides)" || return 1
  local overrides=(); while IFS= read -r item; do [[ -z $item ]] || overrides+=("$item"); done <<<"$override_output"
  overrides+=(--set-string "workerTrust.spiffe.novaNamespace=${NAMESPACE}")
  overrides+=(--set-string "workerTrust.spiffe.novaServiceAccount=agent-nova")
  overrides+=(--set-string "workerTrust.spiffe.agentNamespace=${PRISM_NAMESPACE}")
  overrides+=(--set-string "workerTrust.spiffe.agentServiceAccount=agent-prism")
  overrides+=(--set-string "secrets.runtime=${PRISM_RUNTIME_SECRET_NAME}")
  overrides+=(--set-string "secrets.database=${PRISM_DATABASE_SECRET_NAME}")
  overrides+=(--set-string "postgresql.existingSecret=${PRISM_DATABASE_SECRET_NAME}")
  overrides+=(--set-string "imagePullSecrets[0].name=${PRISM_IMAGE_PULL_SECRET_NAME}")
  helm lint "$REPO_DIR/charts/prism" -f "$PRISM_VALUES_FILE" "${overrides[@]}"
  local migration_log migration_log_pid prism_helm_result=0
  migration_log="$(mktemp)"
  capture_prism_migration_logs "$migration_log" &
  migration_log_pid=$!
  helm upgrade --install "$PRISM_RELEASE" "$REPO_DIR/charts/prism" -n "$PRISM_NAMESPACE" \
    -f "$PRISM_VALUES_FILE" "${overrides[@]}" --atomic --wait --timeout "$PRISM_HELM_TIMEOUT" \
    || prism_helm_result=$?
  kill "$migration_log_pid" >/dev/null 2>&1 || true
  wait "$migration_log_pid" >/dev/null 2>&1 || true
  if [[ $prism_helm_result -ne 0 ]]; then
    err "Prism Helm deployment failed; captured migration output follows"
    if [[ -s $migration_log ]]; then
      cat "$migration_log"
    else
      info "No prism-migrate container output was available before Helm cleanup"
    fi
    rm -f "$migration_log"
    return "$prism_helm_result"
  fi
  rm -f "$migration_log"
  prism_bundle_override="$(mktemp)"
  append_code_bundle_override_file "$prism_bundle_override" \
    "$prism_bundle_archive_url" "$prism_bundle_expected_commit" \
    "$prism_bundle_contract_version" "$prism_bundle_auth_secret" "$prism_bundle_auth_key"
  if ! helm lint "$CHART_DIR" -f "$PRISM_AGENT_VALUES_FILE" -f "$prism_bundle_override" \
    --set-string "litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1"; then
    rm -f "$prism_bundle_override"
    return 1
  fi
  local prism_agent_helm_result=0
  helm upgrade --install agent-prism "$CHART_DIR" -n "$PRISM_NAMESPACE" \
    -f "$PRISM_AGENT_VALUES_FILE" \
    -f "$prism_bundle_override" \
    --set-string "litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1" \
    --atomic --wait --timeout "$PRISM_HELM_TIMEOUT" || prism_agent_helm_result=$?
  rm -f "$prism_bundle_override"
  if [[ $prism_agent_helm_result -ne 0 ]]; then
    return "$prism_agent_helm_result"
  fi
  for workload in prism-postgresql prism-control prism-studio prism-worker; do
    local kind=deployment; [[ $workload == prism-postgresql ]] && kind=statefulset
    kubectl rollout status "$kind/$workload" -n "$PRISM_NAMESPACE" --timeout="$PRISM_ROLLOUT_TIMEOUT"
  done
  kubectl rollout status deployment/agent-prism -n "$PRISM_NAMESPACE" --timeout="$PRISM_ROLLOUT_TIMEOUT"
  cmd_prism_smoke
  kubectl get svc prism-studio -n "$PRISM_NAMESPACE" -o json
}

cmd_prism_smoke() {
  require_command kubectl
  kubectl wait --for=condition=Ready pod -n "$PRISM_NAMESPACE" -l app=prism-control --timeout="$PRISM_ROLLOUT_TIMEOUT"
  kubectl exec -n "$PRISM_NAMESPACE" deployment/prism-control -- node -e \
    "fetch('http://127.0.0.1:8080/ready').then(r=>{if(!r.ok)process.exit(1)})"
  kubectl exec -n "$PRISM_NAMESPACE" deployment/prism-worker -- node -e \
    "fetch('http://127.0.0.1:8080/ready').then(r=>{if(!r.ok)process.exit(1)})"
  kubectl exec -n "$PRISM_NAMESPACE" deployment/agent-prism -c kubeclaw -- openclaw gateway status
  kubectl exec -n "$PRISM_NAMESPACE" statefulset/prism-postgresql -- pg_isready -U postgres -d prism
  log "Prism smoke passed"
}

cmd_prism_status() {
  header "Prism ($PRISM_NAMESPACE)"
  kubectl get deploy,statefulset,job,cronjob,svc,pvc -n "$PRISM_NAMESPACE" -o wide
  helm status "$PRISM_RELEASE" -n "$PRISM_NAMESPACE"
  helm status agent-prism -n "$PRISM_NAMESPACE"
}

prepare_prism_e2e_source_secrets() {
  local password runtime_password migrator_password readonly_password docker_config
  password="$(openssl rand -hex 32)"; runtime_password="$(openssl rand -hex 32)"; migrator_password="$(openssl rand -hex 32)"; readonly_password="$(openssl rand -hex 32)"
  kubectl create secret generic prism-test-postgresql-auth -n "$NAMESPACE" \
    --from-literal=password="$password" \
    --from-literal=runtime-password="$runtime_password" \
    --from-literal=migrator-password="$migrator_password" \
    --from-literal=readonly-password="$readonly_password" \
    --from-literal=admin-url="postgresql://postgres:${password}@prism-postgresql:5432/prism" \
    --from-literal=runtime-url="postgresql://prism_runtime:${runtime_password}@prism-postgresql:5432/prism" \
    --from-literal=migrator-url="postgresql://prism_migrator:${migrator_password}@prism-postgresql:5432/prism" \
    --from-literal=readonly-url="postgresql://prism_readonly:${readonly_password}@prism-postgresql:5432/prism" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl create secret generic prism-test-runtime -n "$NAMESPACE" \
    --from-literal=session-secret="$(openssl rand -hex 32)" \
    --from-literal=ingress-secret="$(openssl rand -hex 32)" \
    --from-literal=dispatch-secret="$(openssl rand -hex 32)" \
    --from-literal=worker-secret="$(openssl rand -hex 32)" \
    --from-literal=ingestion-secret="$(openssl rand -hex 32)" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  docker_config="$(kubectl get secret ghcr-secret -n "$NAMESPACE" -o jsonpath='{.data.\.dockerconfigjson}' 2>/dev/null | base64 -d)"
  [[ -n $docker_config ]] || { err "Cannot prepare Prism E2E pull Secret: ${NAMESPACE}/ghcr-secret is missing .dockerconfigjson"; return 1; }
  printf '%s' "$docker_config" | kubectl create secret generic prism-test-ghcr -n "$NAMESPACE" \
    --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=/dev/stdin --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  log "Prepared isolated Prism E2E source Secrets (values not printed)"
}

cmd_prism_e2e() {
  require_command kubectl; require_command helm; require_command node
  [[ -n ${PRISM_E2E_USER:-} ]] || { err "PRISM_E2E_USER must contain a Tailscale login"; return 1; }
  local original_namespace="$PRISM_NAMESPACE" original_runtime_secret="$PRISM_RUNTIME_SECRET_NAME" original_database_secret="$PRISM_DATABASE_SECRET_NAME"
  local original_pull_secret="$PRISM_IMAGE_PULL_SECRET_NAME" lease_name=""
  if [[ ${PRISM_E2E_USE_LEASE:-true} == "true" ]]; then
    prepare_prism_e2e_source_secrets
    lease_name="test-prism-$(date -u +%Y%m%d%H%M%S)-$RANDOM";local test_namespace="$lease_name"
    kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: kubeclaw.forgestack.ai/v1alpha1
kind: BusterNamespaceLease
metadata: { name: ${lease_name} }
spec:
  namespaceName: ${test_namespace}
  namespacePrefix: test
  runId: ${lease_name}
  project: prism-live-acceptance
  purpose: gate
  capabilityProfile: storage
  cleanupPolicy: delete
  ttlSeconds: 7200
  access: [{ subject: kubeclaw/agent-nova, mode: deployer }]
  secretsToCopy: [prism-test-runtime, prism-test-postgresql-auth, prism-test-ghcr, openclaw-shared-secrets, git-deploy-key-nova]
EOF
    local lease_phase="" lease_message=""
    for _ in {1..120}; do
      lease_phase="$(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
      case "$lease_phase" in
        Ready) break ;;
        Failed|Expired)
          lease_message="$(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" -o jsonpath='{.status.message}' 2>/dev/null || true)"
          err "Prism test namespace lease entered ${lease_phase}: ${lease_message:-no controller message}"
          return 1
          ;;
      esac
      sleep 2
    done
    [[ $lease_phase == Ready ]] || { err "Timed out waiting for Prism test namespace lease (last phase: ${lease_phase:-unset})"; return 1; }
    PRISM_NAMESPACE="$(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" -o jsonpath='{.status.namespaceName}')";export PRISM_NAMESPACE
    [[ $PRISM_NAMESPACE == "$test_namespace" ]]||{ err "Namespace controller did not prepare the Prism test namespace";return 1; }
    PRISM_RUNTIME_SECRET_NAME=prism-test-runtime
    PRISM_DATABASE_SECRET_NAME=prism-test-postgresql-auth
    PRISM_IMAGE_PULL_SECRET_NAME=prism-test-ghcr
    export PRISM_RUNTIME_SECRET_NAME PRISM_DATABASE_SECRET_NAME PRISM_IMAGE_PULL_SECRET_NAME
  fi
  cleanup_prism_e2e(){ [[ -z ${runner_job:-} ]]||kubectl delete job,configmap "$runner_job" -n "$PRISM_NAMESPACE" --ignore-not-found --wait=false >/dev/null 2>&1||true;PRISM_NAMESPACE="$original_namespace";PRISM_RUNTIME_SECRET_NAME="$original_runtime_secret";PRISM_DATABASE_SECRET_NAME="$original_database_secret";PRISM_IMAGE_PULL_SECRET_NAME="$original_pull_secret";export PRISM_NAMESPACE PRISM_RUNTIME_SECRET_NAME PRISM_DATABASE_SECRET_NAME PRISM_IMAGE_PULL_SECRET_NAME;[[ -z $lease_name ]]||kubectl delete busternamespacelease "$lease_name" -n "$NAMESPACE" --wait=false >/dev/null 2>&1||true; }
  trap cleanup_prism_e2e RETURN
  cmd_prism
  local context image_references control_image worker_trust_image runner_job
  context="$(kubectl config current-context)"
  image_references="$(kubectl get deployments prism-control prism-studio prism-worker -n "$PRISM_NAMESPACE" -o jsonpath='{range .items[*]}{.spec.template.spec.containers[0].image}{","}{end}')"
  control_image="$(kubectl get deployment prism-control -n "$PRISM_NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}')"
  worker_trust_image="$(kubectl get deployment prism-control -n "$PRISM_NAMESPACE" -o 'jsonpath={.spec.template.spec.containers[?(@.name=="worker-trust-proxy")].image}')"
  [[ -n $worker_trust_image ]] || { err "Prism production acceptance requires the Worker Trust proxy"; return 1; }
  runner_job="prism-e2e-runner-$(date +%s)"
  kubectl create configmap "$runner_job" -n "$PRISM_NAMESPACE" --from-literal=user="$PRISM_E2E_USER" --from-literal=image-references="$image_references" --from-literal=cluster="$context" --from-literal=namespace="$PRISM_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  kubectl apply -n "$PRISM_NAMESPACE" -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: ${runner_job}, labels: { app: prism-test-runner } }
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 600
  template:
    metadata: { labels: { app: prism-test-runner, kubeclaw.dev/worker-trust: "true" } }
    spec:
      serviceAccountName: prism-test-runner
      automountServiceAccountToken: false
      imagePullSecrets: [{ name: ${PRISM_IMAGE_PULL_SECRET_NAME} }]
      restartPolicy: Never
      securityContext: { runAsNonRoot: true, seccompProfile: { type: RuntimeDefault } }
      initContainers:
        - name: worker-trust-proxy
          restartPolicy: Always
          image: ${worker_trust_image}
          args: ["-c", "/etc/kubeclaw-worker-trust/runner.yaml", "--service-cluster", "prism-test-runner"]
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
          resources: { requests: { cpu: 50m, memory: 64Mi }, limits: { cpu: 500m, memory: 256Mi } }
          volumeMounts:
            - { name: worker-trust-envoy, mountPath: /etc/kubeclaw-worker-trust, readOnly: true }
            - { name: spiffe-workload-api, mountPath: /run/spire/sockets, readOnly: true }
            - { name: worker-trust-tmp, mountPath: /tmp }
      containers:
        - name: runner
          image: ${control_image}
          command: ["node", "/app/prism/tests/verification/live/prism-nova-production-e2e.mjs"]
          env:
            - { name: PRISM_CONTROL_URL, value: "http://127.0.0.1:18443" }
            - { name: PRISM_AGENT_URL, value: "http://127.0.0.1:18444" }
            - name: PRISM_E2E_USER
              valueFrom: { configMapKeyRef: { name: ${runner_job}, key: user } }
            - name: PRISM_E2E_IMAGE_REFERENCES
              valueFrom: { configMapKeyRef: { name: ${runner_job}, key: image-references } }
            - name: CLUSTER_ID
              valueFrom: { configMapKeyRef: { name: ${runner_job}, key: cluster } }
            - name: PRISM_NAMESPACE
              valueFrom: { configMapKeyRef: { name: ${runner_job}, key: namespace } }
            - name: PRISM_E2E_INGRESS_SECRET
              valueFrom: { secretKeyRef: { name: ${PRISM_RUNTIME_SECRET_NAME}, key: ingress-secret } }
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
      volumes:
        - { name: worker-trust-envoy, configMap: { name: prism-worker-trust, defaultMode: 0444 } }
        - name: spiffe-workload-api
          csi: { driver: csi.spiffe.io, readOnly: true }
        - { name: worker-trust-tmp, emptyDir: { sizeLimit: 64Mi } }
EOF
  kubectl wait -n "$PRISM_NAMESPACE" --for=condition=complete "job/$runner_job" --timeout=30m || { kubectl logs -n "$PRISM_NAMESPACE" "job/$runner_job"; return 1; }
  kubectl logs -n "$PRISM_NAMESPACE" "job/$runner_job"
  if [[ ${PRISM_E2E_RUN_FAILURES:-false} == "true" ]]; then
    PRISM_NAMESPACE="$PRISM_NAMESPACE" node "$REPO_DIR/tests/verification/live/prism-production-failures.mjs"
  else
    info "Prism service smoke complete. The Nova, Forge, Buster, and failure gates remain separate required production checks."
  fi
}

cmd_teardown_prism() {
  helm uninstall agent-prism -n "$PRISM_NAMESPACE" --ignore-not-found
  helm uninstall "$PRISM_RELEASE" -n "$PRISM_NAMESPACE" --ignore-not-found
  log "Prism workloads removed. PVCs and Secrets remain in $PRISM_NAMESPACE."
}

sign_and_store_production_receipt() {
  local receipt_tmp=$1 receipt_file=$2 expected_runtime_revision=$3
  local receipt_private_key receipt_public_key buster_runtime_revision observed_buster_revision receipt_signed
  receipt_private_key=${KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE:-}
  receipt_public_key=$PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE
  if [[ -z $receipt_private_key || ! -f $receipt_private_key || ! -f $receipt_public_key ]]; then
    err "Set KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE and install the trusted public key at $PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE."
    return 1
  fi
  receipt_private_key=$(realpath "$receipt_private_key")
  receipt_public_key=$(realpath "$receipt_public_key")
  if [[ $receipt_private_key == "$REPO_DIR"/* || $receipt_public_key == "$REPO_DIR"/* ]]; then
    err "Production receipt keys must be outside the repository."
    return 1
  fi
  buster_runtime_revision=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).busterRuntimeRevision ?? "")' "$receipt_tmp")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The production receipt has no valid Buster runtime revision."
    return 1
  fi
  observed_buster_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-buster -c kubeclaw -- printenv KUBECLAW_BUILD_REVISION)
  if [[ ! $observed_buster_revision =~ ^[a-f0-9]{40,64}$ || $buster_runtime_revision != "$observed_buster_revision" ]]; then
    err "The authenticated worker revision does not match the deployed Buster revision."
    return 1
  fi
  receipt_signed=$(mktemp)
  if ! node "$REPO_DIR/scripts/production-receipt-attestation.mjs" sign \
    "$receipt_tmp" "$receipt_private_key" "$expected_runtime_revision" "$observed_buster_revision" "$receipt_signed" \
    || ! node "$REPO_DIR/scripts/production-receipt-attestation.mjs" verify \
    "$receipt_signed" "$receipt_public_key" "$expected_runtime_revision" "$observed_buster_revision"; then
    rm -f "$receipt_signed"
    return 1
  fi
  mkdir -p "$(dirname "$receipt_file")"
  cp "$receipt_signed" "$receipt_file"
  rm -f "$receipt_signed"
  log "Stored production receipt at $receipt_file"
}

run_nova_production_receipt_preflight() {
  local preflight_file=$1 receipt_file=$2
  local runtime_repo_root runtime_revision receipt_tmp
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    return 1
  fi
  receipt_tmp=$(mktemp)
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    node "$runtime_repo_root/$preflight_file" | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! sign_and_store_production_receipt "$receipt_tmp" "$receipt_file" "$runtime_revision"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  rm -f "$receipt_tmp"
}

cmd_nova_buildkit_preflight() {
  header "Nova → Buster BuildKit Production Preflight"
  require_command kubectl
  run_nova_production_receipt_preflight \
    tests/verification/e2e/nova-buildkit-production-preflight.mts \
    "$REPO_DIR/dist/verification/container-build-production-receipt.json"
  log "Nova → Buster BuildKit production preflight passed"
}

cmd_nova_unit_preflight() {
  header "Nova → Buster Unit Production Preflight"
  require_command kubectl
  run_nova_production_receipt_preflight \
    tests/verification/e2e/nova-unit-production-preflight.mts \
    "$REPO_DIR/dist/verification/unit-production-receipt.json"
  log "Nova → Buster unit production preflight passed"
}

cmd_nova_kubernetes_fixture_preflight() {
  header "Nova → Buster Kubernetes Fixture Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_KUBERNETES_PREFLIGHT_IMAGE:-}}
  local secret_name=${3:-${KUBECLAW_KUBERNETES_PREFLIGHT_SECRET:-kubeclaw-fixture-preflight}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned workload image as argument 2 or KUBECLAW_KUBERNETES_PREFLIGHT_IMAGE."
    return 1
  fi
  if [[ ! $secret_name =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]]; then
    err "Provide a valid approved test Secret name as argument 3 or KUBECLAW_KUBERNETES_PREFLIGHT_SECRET."
    return 1
  fi
  if [[ -z $(kubectl get secret "$secret_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then
    err "The approved test Secret $secret_name does not exist in $NAMESPACE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision
  local buster_runtime_revision lease_name namespace_name
  receipt_tmp=$(mktemp)
  receipt_file="$REPO_DIR/dist/verification/kubernetes-fixture-production-receipt.json"
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    rm -f "$receipt_tmp"
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- env \
    "KUBECLAW_KUBERNETES_PREFLIGHT_IMAGE=$immutable_image" \
    "KUBECLAW_KUBERNETES_PREFLIGHT_SECRET=$secret_name" \
    node "$runtime_repo_root/tests/verification/e2e/nova-kubernetes-fixture-production-preflight.mts" \
    | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.schemaVersion!=="kubernetes-fixture-production-preflight.v1"||v.suite!=="k8s"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.evidenceImported!==true||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.deploymentReadyVerified!==true||v.podReadyVerified!==true||v.manifestAppliedVerified!==true||v.approvedSecretCopyVerified!==false||v.namespaceDeleted!==false||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.secretName!==process.argv[2])process.exit(1)' "$receipt_tmp" "$secret_name"; then
    err "The Kubernetes fixture production receipt is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  lease_name=$(node -e 'const fs=require("node:fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.leaseName)' "$receipt_tmp")
  namespace_name=$(node -e 'const fs=require("node:fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.namespace)' "$receipt_tmp")
  if [[ ! $lease_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ \
    || ! $namespace_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    err "The Kubernetes fixture receipt contains an invalid resource identity."
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" -o json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);if(v.status?.phase!=="Ready"||v.status?.namespaceName!==process.argv[1]||!v.spec?.secretsToCopy?.includes(process.argv[2]))process.exit(1)})' "$namespace_name" "$secret_name" \
    || [[ -z $(kubectl get secret "$secret_name" -n "$namespace_name" --ignore-not-found -o name) ]]; then
    err "The retained fixture does not prove readiness and approved Secret copying."
    kubectl delete busternamespacelease "$lease_name" -n "$NAMESPACE" \
      --ignore-not-found=true --wait=true --timeout=2m >/dev/null 2>&1 || true
    kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m >/dev/null 2>&1 || true
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl delete busternamespacelease "$lease_name" -n "$NAMESPACE" --wait=true --timeout=2m \
    || ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m; then
    err "Timed out while cleaning the retained Kubernetes fixture."
    rm -f "$receipt_tmp"
    return 1
  fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) \
    || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then
    err "The Kubernetes fixture left its namespace or lease in the cluster."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_unsigned=$(mktemp)
  node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],`${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true,approvedSecretCopyVerified:true,namespaceDeleted:true},null,2)}\n`,{mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] \
    || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then
    rm -f "$receipt_tmp" "$receipt_unsigned"
    return 1
  fi
  rm -f "$receipt_tmp" "$receipt_unsigned"
  log "Nova → Buster Kubernetes fixture production preflight passed"
}

cmd_nova_http_preflight() {
  header "Nova → Buster HTTP Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_HTTP_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned HTTP image as argument 2 or KUBECLAW_HTTP_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_signed receipt_private_key receipt_public_key receipt_file
  local runtime_repo_root runtime_revision buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    return 1
  fi
  local -a environment=("KUBECLAW_HTTP_PREFLIGHT_IMAGE=$immutable_image")
  if [[ -n ${KUBECLAW_HTTP_PREFLIGHT_EXPECTED_TEXT:-} ]]; then
    environment+=("KUBECLAW_HTTP_PREFLIGHT_EXPECTED_TEXT=$KUBECLAW_HTTP_PREFLIGHT_EXPECTED_TEXT")
  fi
  receipt_tmp=$(mktemp)
  receipt_file="$REPO_DIR/dist/verification/http-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- env "${environment[@]}" \
    node "$runtime_repo_root/tests/verification/e2e/nova-http-production-preflight.mts" \
    | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(v.schemaVersion!=="nova-http-production-preflight.v1"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.networkRequestVerified!==true||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="http-preflight"||v.resources?.servicePort!==80) process.exit(1)' "$receipt_tmp"; then
    err "The HTTP production receipt is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  lease_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.leaseName)' "$receipt_tmp")
  namespace_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.namespace)' "$receipt_tmp")
  if [[ ! $lease_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ \
    || ! $namespace_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    err "The HTTP production receipt contains an invalid resource identity."
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m \
    || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then
    err "Timed out while waiting for the HTTP production plan cleanup."
    rm -f "$receipt_tmp"
    return 1
  fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) \
    || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then
    err "The HTTP production plan left its namespace or lease in the cluster."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_private_key=${KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE:-}
  receipt_public_key=$PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE
  if [[ -z $receipt_private_key || ! -f $receipt_private_key || ! -f $receipt_public_key ]]; then
    err "Set KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE and install the trusted public key at $PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_private_key=$(realpath "$receipt_private_key")
  receipt_public_key=$(realpath "$receipt_public_key")
  if [[ $receipt_private_key == "$REPO_DIR"/* || $receipt_public_key == "$REPO_DIR"/* ]]; then
    err "Production receipt keys must be outside the repository."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_unsigned=$(mktemp)
  receipt_signed=$(mktemp)
  # JavaScript is intentionally single-quoted for the shell.
  # shellcheck disable=SC2016
  node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], `${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`, {mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The Buster execution result has no valid worker revision."
    rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
    return 1
  fi
  if ! node "$REPO_DIR/scripts/production-receipt-attestation.mjs" sign \
    "$receipt_unsigned" "$receipt_private_key" "$runtime_revision" "$buster_runtime_revision" "$receipt_signed" \
    || ! node "$REPO_DIR/scripts/production-receipt-attestation.mjs" verify \
    "$receipt_signed" "$receipt_public_key" "$runtime_revision" "$buster_runtime_revision"; then
    rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
    return 1
  fi
  mkdir -p "$(dirname "$receipt_file")"
  cp "$receipt_signed" "$receipt_file"
  rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
  log "Stored production receipt at $receipt_file"
  log "Nova → Buster HTTP production preflight passed"
}

cmd_nova_api_preflight() {
  header "Nova → Buster API Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_API_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned port-8080 HTTP image as argument 2 or KUBECLAW_API_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision
  local buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    return 1
  fi
  receipt_tmp=$(mktemp)
  receipt_file="$REPO_DIR/dist/verification/api-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    env "KUBECLAW_API_PREFLIGHT_IMAGE=$immutable_image" \
    node "$runtime_repo_root/tests/verification/e2e/nova-api-production-preflight.mts" | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const providers=[...(v.providersVerified??[])].sort(); if(v.schemaVersion!=="nova-api-production-preflight.v1"||v.suite!=="api"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.immutableImage!==process.argv[2]||!/^sha256:[a-f0-9]{64}$/.test(v.imageDigest??"")||!v.immutableImage.endsWith(`@${v.imageDigest}`)||JSON.stringify(providers)!==JSON.stringify(["kubeclaw.api-flow@1","kubeclaw.http@1","kubeclaw.openapi@1"])||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="api-preflight"||v.resources?.servicePort!==80) process.exit(1)' "$receipt_tmp" "$immutable_image"; then
    err "The API production receipt is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  lease_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.leaseName)' "$receipt_tmp")
  namespace_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.namespace)' "$receipt_tmp")
  if [[ ! $lease_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ \
    || ! $namespace_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    err "The API production receipt contains an invalid resource identity."
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m \
    || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then
    err "Timed out while waiting for the API production plan cleanup."
    rm -f "$receipt_tmp"
    return 1
  fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) \
    || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then
    err "The API production plan left its namespace or lease in the cluster."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_unsigned=$(mktemp)
  # JavaScript is intentionally single-quoted for the shell.
  # shellcheck disable=SC2016
  node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], `${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`, {mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] \
    || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then
    rm -f "$receipt_tmp" "$receipt_unsigned"
    return 1
  fi
  rm -f "$receipt_tmp" "$receipt_unsigned"
  log "Nova → Buster API production preflight passed"
}

cmd_nova_a11y_preflight() {
  header "Nova → Buster Accessibility Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_A11Y_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned port-8080 HTTP image as argument 2 or KUBECLAW_A11Y_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision
  local buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    return 1
  fi
  receipt_tmp=$(mktemp)
  receipt_file="$REPO_DIR/dist/verification/a11y-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    env "KUBECLAW_A11Y_PREFLIGHT_IMAGE=$immutable_image" \
    node "$runtime_repo_root/tests/verification/e2e/nova-a11y-production-preflight.mts" | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const engines=[...(v.browserEnginesVerified??[])].sort(); if(v.schemaVersion!=="nova-a11y-production-preflight.v1"||v.suite!=="a11y"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.immutableImage!==process.argv[2]||!/^sha256:[a-f0-9]{64}$/.test(v.imageDigest??"")||!v.immutableImage.endsWith(`@${v.imageDigest}`)||JSON.stringify(engines)!==JSON.stringify(["chromium","firefox","webkit"])||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="a11y-preflight"||v.resources?.servicePort!==80) process.exit(1)' "$receipt_tmp" "$immutable_image"; then
    err "The accessibility production receipt is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  lease_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.leaseName)' "$receipt_tmp")
  namespace_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.namespace)' "$receipt_tmp")
  if [[ ! $lease_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ \
    || ! $namespace_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    err "The accessibility production receipt contains an invalid resource identity."
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m \
    || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then
    err "Timed out while waiting for the accessibility production plan cleanup."
    rm -f "$receipt_tmp"
    return 1
  fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) \
    || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then
    err "The accessibility production plan left its namespace or lease in the cluster."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_unsigned=$(mktemp)
  # JavaScript is intentionally single-quoted for the shell.
  # shellcheck disable=SC2016
  node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], `${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`, {mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] \
    || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then
    rm -f "$receipt_tmp" "$receipt_unsigned"
    return 1
  fi
  rm -f "$receipt_tmp" "$receipt_unsigned"
  log "Nova → Buster accessibility production preflight passed"
}

cmd_nova_lighthouse_preflight() {
  header "Nova → Buster Lighthouse Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_LIGHTHOUSE_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned port-8080 HTTP image as argument 2 or KUBECLAW_LIGHTHOUSE_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision
  local buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    return 1
  fi
  receipt_tmp=$(mktemp)
  receipt_file="$REPO_DIR/dist/verification/lighthouse-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    env "KUBECLAW_LIGHTHOUSE_PREFLIGHT_IMAGE=$immutable_image" \
    node "$runtime_repo_root/tests/verification/e2e/nova-lighthouse-production-preflight.mts" | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(v.schemaVersion!=="nova-lighthouse-production-preflight.v1"||v.suite!=="perf"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.immutableImage!==process.argv[2]||!/^sha256:[a-f0-9]{64}$/.test(v.imageDigest??"")||!v.immutableImage.endsWith(`@${v.imageDigest}`)||v.lighthouseVersion!=="13.4.1"||v.reportCount!==3||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="lighthouse-preflight"||v.resources?.servicePort!==80) process.exit(1)' "$receipt_tmp" "$immutable_image"; then
    err "The Lighthouse production receipt is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  lease_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.leaseName)' "$receipt_tmp")
  namespace_name=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).resources.namespace)' "$receipt_tmp")
  if [[ ! $lease_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ \
    || ! $namespace_name =~ ^test-[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    err "The Lighthouse production receipt contains an invalid resource identity."
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m \
    || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then
    err "Timed out while waiting for the Lighthouse production plan cleanup."
    rm -f "$receipt_tmp"
    return 1
  fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) \
    || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then
    err "The Lighthouse production plan left its namespace or lease in the cluster."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_unsigned=$(mktemp)
  # JavaScript is intentionally single-quoted for the shell.
  # shellcheck disable=SC2016
  node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], `${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`, {mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] \
    || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then
    rm -f "$receipt_tmp" "$receipt_unsigned"
    return 1
  fi
  rm -f "$receipt_tmp" "$receipt_unsigned"
  log "Nova → Buster Lighthouse production preflight passed"
}

cmd_nova_visual_preflight() {
  header "Nova → Buster Visual Regression Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_VISUAL_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned port-8080 HTTP image as argument 2 or KUBECLAW_VISUAL_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  [[ $runtime_repo_root == /home/node/.openclaw/workspace/git-repo ]] || { err "The deployed Nova REPO_ROOT does not match the chart contract."; return 1; }
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- git -C "$runtime_repo_root" rev-parse --verify HEAD)
  [[ $runtime_revision =~ ^[a-f0-9]{40,64}$ ]] || { err "The deployed Nova source revision is invalid."; return 1; }
  receipt_tmp=$(mktemp); receipt_file="$REPO_DIR/dist/verification/visual-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- env "KUBECLAW_VISUAL_PREFLIGHT_IMAGE=$immutable_image" node "$runtime_repo_root/tests/verification/e2e/nova-visual-production-preflight.mts" | tee "$receipt_tmp"; then rm -f "$receipt_tmp"; return 1; fi
  if ! node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.schemaVersion!=="nova-visual-production-preflight.v1"||v.suite!=="visual-reg"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.immutableImage!==process.argv[2]||!/^sha256:[a-f0-9]{64}$/.test(v.imageDigest??"")||!v.immutableImage.endsWith(`@${v.imageDigest}`)||typeof v.browserVersion!=="string"||!v.browserVersion||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="real-pipeline-e2e-nginx"||v.resources?.servicePort!==80)process.exit(1)' "$receipt_tmp" "$immutable_image"; then err "The visual production receipt is invalid."; rm -f "$receipt_tmp"; return 1; fi
  lease_name=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.resources.leaseName)' "$receipt_tmp"); namespace_name=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.resources.namespace)' "$receipt_tmp")
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then err "Timed out while waiting for visual preflight cleanup."; rm -f "$receipt_tmp"; return 1; fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then err "The visual preflight left cluster resources."; rm -f "$receipt_tmp"; return 1; fi
  receipt_unsigned=$(mktemp); node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],`${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`,{mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then rm -f "$receipt_tmp" "$receipt_unsigned"; return 1; fi
  rm -f "$receipt_tmp" "$receipt_unsigned"; log "Nova → Buster visual production preflight passed"
}

cmd_nova_e2e_preflight() {
  header "Nova → Buster End-to-End Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_E2E_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned port-8080 HTTP image as argument 2 or KUBECLAW_E2E_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  [[ $runtime_repo_root == /home/node/.openclaw/workspace/git-repo ]] || { err "The deployed Nova REPO_ROOT does not match the chart contract."; return 1; }
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- git -C "$runtime_repo_root" rev-parse --verify HEAD)
  [[ $runtime_revision =~ ^[a-f0-9]{40,64}$ ]] || { err "The deployed Nova source revision is invalid."; return 1; }
  receipt_tmp=$(mktemp); receipt_file="$REPO_DIR/dist/verification/e2e-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- env "KUBECLAW_E2E_PREFLIGHT_IMAGE=$immutable_image" node "$runtime_repo_root/tests/verification/e2e/nova-e2e-production-preflight.mts" | tee "$receipt_tmp"; then rm -f "$receipt_tmp"; return 1; fi
  if ! node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.schemaVersion!=="nova-e2e-production-preflight.v1"||v.suite!=="e2e"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.resourceEnforcement!=="cgroup-v2"||v.immutableImage!==process.argv[2]||!/^sha256:[a-f0-9]{64}$/.test(v.imageDigest??"")||!v.immutableImage.endsWith(`@${v.imageDigest}`)||!Array.isArray(v.browserProjects)||v.browserProjects.length<1||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="real-pipeline-e2e-nginx"||v.resources?.servicePort!==18080)process.exit(1)' "$receipt_tmp" "$immutable_image"; then err "The end-to-end production receipt is invalid."; rm -f "$receipt_tmp"; return 1; fi
  lease_name=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.resources.leaseName)' "$receipt_tmp"); namespace_name=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.resources.namespace)' "$receipt_tmp")
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then err "Timed out while waiting for end-to-end preflight cleanup."; rm -f "$receipt_tmp"; return 1; fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then err "The end-to-end preflight left cluster resources."; rm -f "$receipt_tmp"; return 1; fi
  receipt_unsigned=$(mktemp); node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],`${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`,{mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then rm -f "$receipt_tmp" "$receipt_unsigned"; return 1; fi
  rm -f "$receipt_tmp" "$receipt_unsigned"; log "Nova → Buster end-to-end production preflight passed"
}

cmd_nova_security_preflight() {
  header "Nova → Buster Security Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_SECURITY_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned port-8080 HTTP image with the required security headers."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_file runtime_repo_root runtime_revision buster_runtime_revision lease_name namespace_name
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  [[ $runtime_repo_root == /home/node/.openclaw/workspace/git-repo ]] || { err "The deployed Nova REPO_ROOT does not match the chart contract."; return 1; }
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- git -C "$runtime_repo_root" rev-parse --verify HEAD)
  [[ $runtime_revision =~ ^[a-f0-9]{40,64}$ ]] || { err "The deployed Nova source revision is invalid."; return 1; }
  receipt_tmp=$(mktemp); receipt_file="$REPO_DIR/dist/verification/security-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- env "KUBECLAW_SECURITY_PREFLIGHT_IMAGE=$immutable_image" node "$runtime_repo_root/tests/verification/e2e/nova-security-production-preflight.mts" | tee "$receipt_tmp"; then rm -f "$receipt_tmp"; return 1; fi
  if ! node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const expected=["dependency-trivy","headers","image-trivy","kubernetes-policy-trivy","kubernetes-runtime"];if(v.schemaVersion!=="nova-security-production-preflight.v1"||v.suite!=="security"||v.ok!==true||v.decision!=="passed"||v.status!=="completed"||v.runnerCleanupVerified!==true||v.cleanupVerified!==false||v.clusterCleanupObserved!==false||v.evidenceImported!==true||v.immutableImage!==process.argv[2]||!/^sha256:[a-f0-9]{64}$/.test(v.imageDigest??"")||!v.immutableImage.endsWith(`@${v.imageDigest}`)||JSON.stringify([...(v.providersVerified??[])].sort())!==JSON.stringify(expected)||v.mocks!==0||v.emulators!==0||!v.resources?.leaseName||!v.resources?.namespace||v.resources?.serviceName!=="security-preflight"||v.resources?.servicePort!==80)process.exit(1)' "$receipt_tmp" "$immutable_image"; then err "The security production receipt is invalid."; rm -f "$receipt_tmp"; return 1; fi
  lease_name=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.resources.leaseName)' "$receipt_tmp"); namespace_name=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.resources.namespace)' "$receipt_tmp")
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then err "Timed out while waiting for security preflight cleanup."; rm -f "$receipt_tmp"; return 1; fi
  if [[ -n $(kubectl get namespace "$namespace_name" --ignore-not-found -o name) || -n $(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name) ]]; then err "The security preflight left cluster resources."; rm -f "$receipt_tmp"; return 1; fi
  receipt_unsigned=$(mktemp); node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],`${JSON.stringify({...v,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`,{mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  buster_runtime_revision=$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(v.busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]] || ! sign_and_store_production_receipt "$receipt_unsigned" "$receipt_file" "$runtime_revision"; then rm -f "$receipt_tmp" "$receipt_unsigned"; return 1; fi
  rm -f "$receipt_tmp" "$receipt_unsigned"; log "Nova → Buster security production preflight passed"
}

cmd_nova_tailscale_preflight() {
  header "Nova → Buster Tailscale Production Preflight"
  require_command kubectl
  local immutable_image=${2:-${KUBECLAW_TAILSCALE_PREFLIGHT_IMAGE:-}}
  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide a digest-pinned HTTP image as argument 2 or KUBECLAW_TAILSCALE_PREFLIGHT_IMAGE."
    return 1
  fi
  local receipt_tmp receipt_unsigned receipt_signed receipt_private_key receipt_public_key receipt_file
  local runtime_repo_root runtime_revision
  runtime_repo_root=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- printenv REPO_ROOT)
  if [[ $runtime_repo_root != /home/node/.openclaw/workspace/git-repo ]]; then
    err "The deployed Nova REPO_ROOT does not match the chart contract."
    return 1
  fi
  runtime_revision=$(kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- \
    git -C "$runtime_repo_root" rev-parse --verify HEAD)
  if [[ ! $runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The deployed Nova source revision is invalid."
    return 1
  fi
  local -a environment=("KUBECLAW_TAILSCALE_PREFLIGHT_IMAGE=$immutable_image")
  if [[ -n ${KUBECLAW_TAILSCALE_PREFLIGHT_EXPECTED_TEXT:-} ]]; then
    environment+=("KUBECLAW_TAILSCALE_PREFLIGHT_EXPECTED_TEXT=$KUBECLAW_TAILSCALE_PREFLIGHT_EXPECTED_TEXT")
  fi
  receipt_tmp=$(mktemp)
  receipt_file="$REPO_DIR/dist/verification/tailscale-exposure-production-receipt.json"
  if ! kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- env "${environment[@]}" \
    node "$runtime_repo_root/tests/verification/e2e/nova-tailscale-production-preflight.mts" \
    | tee "$receipt_tmp"; then
    rm -f "$receipt_tmp"
    return 1
  fi
  if ! node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(value.schemaVersion!=="nova-tailscale-production-preflight.v1"||value.ok!==true||value.decision!=="passed"||value.status!=="completed"||value.runnerCleanupVerified!==true||value.cleanupVerified!==false||value.clusterCleanupObserved!==false||value.evidenceImported!==true||value.mocks!==0||value.emulators!==0||!value.resources?.leaseName||!value.resources?.namespace) process.exit(1)' "$receipt_tmp"; then
    err "The Tailscale production receipt is invalid."
    rm -f "$receipt_tmp"
    return 1
  fi
  local lease_name namespace_name remaining_namespace remaining_lease
  lease_name=$(node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(value.resources.leaseName)' "$receipt_tmp")
  namespace_name=$(node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(value.resources.namespace)' "$receipt_tmp")
  if ! kubectl wait --for=delete "namespace/$namespace_name" --timeout=2m \
    || ! kubectl wait --for=delete "busternamespacelease/$lease_name" -n "$NAMESPACE" --timeout=2m; then
    err "Timed out while waiting for the production plan cleanup."
    rm -f "$receipt_tmp"
    return 1
  fi
  remaining_namespace=$(kubectl get namespace "$namespace_name" --ignore-not-found -o name)
  remaining_lease=$(kubectl get busternamespacelease "$lease_name" -n "$NAMESPACE" --ignore-not-found -o name)
  if [[ -n $remaining_namespace || -n $remaining_lease ]]; then
    err "The production plan left its namespace or lease in the cluster."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_private_key=${KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE:-}
  receipt_public_key=$PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE
  if [[ -z $receipt_private_key || ! -f $receipt_private_key || ! -f $receipt_public_key ]]; then
    err "Set KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE and install the trusted public key at $PRODUCTION_RECEIPT_TRUSTED_PUBLIC_KEY_FILE."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_private_key=$(realpath "$receipt_private_key")
  receipt_public_key=$(realpath "$receipt_public_key")
  if [[ $receipt_private_key == "$REPO_DIR"/* || $receipt_public_key == "$REPO_DIR"/* ]]; then
    err "Production receipt keys must be outside the repository."
    rm -f "$receipt_tmp"
    return 1
  fi
  receipt_unsigned=$(mktemp)
  receipt_signed=$(mktemp)
  node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], `${JSON.stringify({...value,cleanupVerified:true,clusterCleanupObserved:true},null,2)}\n`, {mode:0o600})' "$receipt_tmp" "$receipt_unsigned"
  local buster_runtime_revision
  buster_runtime_revision=$(node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(value.busterRuntimeRevision)' "$receipt_unsigned")
  if [[ ! $buster_runtime_revision =~ ^[a-f0-9]{40,64}$ ]]; then
    err "The Buster execution result has no valid worker revision."
    rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
    return 1
  fi
  if ! node "$REPO_DIR/scripts/production-receipt-attestation.mjs" sign \
    "$receipt_unsigned" "$receipt_private_key" "$runtime_revision" "$buster_runtime_revision" "$receipt_signed"; then
    rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
    return 1
  fi
  if ! node "$REPO_DIR/scripts/production-receipt-attestation.mjs" verify \
    "$receipt_signed" "$receipt_public_key" "$runtime_revision" "$buster_runtime_revision"; then
    rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
    return 1
  fi
  mkdir -p "$(dirname "$receipt_file")"
  cp "$receipt_signed" "$receipt_file"
  rm -f "$receipt_tmp" "$receipt_unsigned" "$receipt_signed"
  log "Stored production receipt at $receipt_file"
  log "Nova → Buster Tailscale production preflight passed"
}

cmd_nova_production_preflights() {
  header "Nova → Buster Production Suite Preflights"
  require_command node

  local immutable_image=${2:-${KUBECLAW_PRODUCTION_PREFLIGHT_IMAGE:-}}
  local secret_name=${3:-${KUBECLAW_KUBERNETES_PREFLIGHT_SECRET:-kubeclaw-fixture-preflight}}
  local status_file="$REPO_DIR/docs/architecture/pipeline-test-gate-suite-migration-status.json"

  if ! node - "$status_file" <<'NODE'
const fs = require('node:fs');
const status = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const suites = Array.isArray(status.suites) ? status.suites : [];
const expectedSuiteIds = [
  'a11y', 'api', 'build', 'bundle', 'e2e', 'health', 'k8s',
  'manifest', 'perf', 'security', 'tailscale-preview', 'unit', 'visual-reg',
];
const actualSuiteIds = suites.map((suite) => suite.id).sort();
const required = suites.filter((suite) => Object.hasOwn(suite, 'productionAcceptance'))
  .map((suite) => suite.id).sort();
const orchestrated = ['a11y', 'api', 'build', 'e2e', 'health', 'k8s', 'perf', 'security', 'tailscale-preview', 'unit', 'visual-reg'];
const incomplete = suites.filter((suite) => suite.implementation !== 'complete'
  || suite.sourceCutover !== 'complete').map((suite) => suite.id);
if (JSON.stringify(actualSuiteIds) !== JSON.stringify(expectedSuiteIds)) {
  process.stderr.write('Production suite preflights require the exact, unique 13-suite migration status.\n');
  process.exit(1);
}
if (JSON.stringify(required) !== JSON.stringify(orchestrated)) {
  process.stderr.write(`Production suite preflight orchestration is incomplete for: ${required.join(', ')}.\n`);
  process.exit(1);
}
if (incomplete.length > 0) {
  process.stderr.write(`Production suite preflights are blocked until these source cutovers complete: ${incomplete.join(', ')}.\n`);
  process.exit(1);
}
NODE
  then
    return 1
  fi

  if [[ ! $immutable_image =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
    err "Provide one digest-pinned port-8080 HTTP image as argument 2 or KUBECLAW_PRODUCTION_PREFLIGHT_IMAGE."
    return 1
  fi
  cmd_nova_unit_preflight
  cmd_nova_buildkit_preflight
  cmd_nova_kubernetes_fixture_preflight nova-kubernetes-fixture-preflight "$immutable_image" "$secret_name"
  cmd_nova_http_preflight nova-http-preflight "$immutable_image"
  cmd_nova_api_preflight nova-api-preflight "$immutable_image"
  cmd_nova_a11y_preflight nova-a11y-preflight "$immutable_image"
  cmd_nova_lighthouse_preflight nova-lighthouse-preflight "$immutable_image"
  cmd_nova_visual_preflight nova-visual-preflight "$immutable_image"
  cmd_nova_e2e_preflight nova-e2e-preflight "$immutable_image"
  cmd_nova_security_preflight nova-security-preflight "$immutable_image"
  cmd_nova_tailscale_preflight nova-tailscale-preflight "$immutable_image"

  log "All production-required suite preflights passed"
}

cmd_worker_trust_e2e() {
  header "Worker Trust Production E2E"
  require_command kubectl
  NAMESPACE="$NAMESPACE" PRISM_NAMESPACE="$PRISM_NAMESPACE" \
    PRISM_IMAGE_PULL_SECRET_NAME="$PRISM_IMAGE_PULL_SECRET_NAME" \
    bash "$REPO_DIR/tests/verification/live/worker-trust-cluster-e2e.sh"
  cmd_nova_unit_preflight
  log "Worker Trust live identity, mTLS, authorization, spoof resistance, and source-attestation paths passed"
}

cmd_buster_infra_smoke() {
  header "Buster Full Infrastructure Production Smoke"
  require_command kubectl
  require_command node
  node "$REPO_DIR/tests/verification/live/buster-infra-production-smoke.mjs"
  log "Buster full infrastructure production smoke passed"
}

# ─── Teardown ────────────────────────────────────────────────────────────

cmd_teardown_agents() {
  warn "Removing KubeClaw agents from $NAMESPACE..."
  for role in nova buster; do
    uninstall_helm_release_if_present "agent-${role}"
  done
  log "Agents removed. Infrastructure untouched."
}

uninstall_helm_release_if_present() {
  local release="$1"
  local output

  if output=$(helm status "$release" -n "$NAMESPACE" 2>&1); then
    helm uninstall "$release" -n "$NAMESPACE"
    log "Removed: $release"
    return 0
  fi

  if is_not_found_error "$output"; then
    return 0
  fi

  err "Failed to check Helm release '$release' before uninstall"
  echo "$output" >&2
  return 1
}

delete_manifested_resource_if_present() {
  local kind="$1"
  local name="$2"
  local manifest_path="$3"
  local fallback_types="$4"
  local fallback_selector="$5"
  local output
  local fallback_output

  if output=$(kubectl get "$kind" "$name" -n "$NAMESPACE" 2>&1); then
    if kubectl delete -n "$NAMESPACE" -f "$manifest_path"; then
      log "Removed: $name"
      return 0
    fi

    warn "Manifest delete failed for $name; attempting selector fallback ($fallback_types -l $fallback_selector)."
    if fallback_output=$(kubectl delete "$fallback_types" -n "$NAMESPACE" -l "$fallback_selector" 2>&1); then
      [[ -n $fallback_output ]] && echo "$fallback_output"
      log "Removed: $name via selector fallback"
      return 0
    fi

    err "Selector fallback delete failed for $name"
    echo "$fallback_output" >&2
    return 1
  fi

  if is_not_found_error "$output"; then
    return 0
  fi

  err "Failed to check $kind/$name in namespace '$NAMESPACE' before delete"
  echo "$output" >&2
  return 1
}

remove_destructive_infra() {
  for release in qdrant postgresql redis; do
    uninstall_helm_release_if_present "$release"
  done

  delete_manifested_resource_if_present deployment litellm "$INFRA_DIR/litellm-deployment.yaml" \
    "deployment,svc" "app=litellm"
  delete_namespaced_resource_if_present configmap litellm-config

  delete_manifested_resource_if_present deployment registry-mirror "$INFRA_DIR/registry-mirror.yaml" \
    "deployment,svc,pvc" "app=registry-mirror"

  delete_manifested_resource_if_present deployment registry-local "$INFRA_DIR/registry-local.yaml" \
    "deployment,svc" "app=registry-local"

  kubectl delete -n "$NAMESPACE" -f "$INFRA_DIR/network-policies.yaml" --ignore-not-found

  delete_manifest_if_cluster_resource_present validatingadmissionpolicy buster-namespace-fence "$INFRA_DIR/buster-namespace-fence.yaml"
}

cleanup_leftover_pvcs() {
  local pvcs
  local pvc

  pvcs=$(kubectl get pvc -n "$NAMESPACE" --no-headers -o custom-columns=NAME:.metadata.name)
  if [[ -n $pvcs ]]; then
    warn "Removing leftover PVCs..."
    while IFS= read -r pvc; do
      [[ -n $pvc ]] || continue
      kubectl delete pvc "$pvc" -n "$NAMESPACE"
    done <<<"$pvcs"
    log "PVCs removed"
  fi
}

print_remaining_secrets() {
  local output

  if output=$(kubectl get secrets -n "$NAMESPACE" --no-headers 2>&1); then
    echo "$output" | grep -v '^sh.helm' | awk '{print "  " $1}'
    return 0
  fi

  warn_nonfatal_failure "Unable to list remaining secrets after teardown; namespace/secrets may still need manual inspection." "$output"
}

run_destructive_teardown() {
  local destroy_namespace="${1:-0}"

  cmd_teardown_agents
  remove_destructive_infra

  if [[ $destroy_namespace == "1" ]]; then
    warn "Deleting namespace $NAMESPACE (this removes all remaining resources)..."
    kubectl delete namespace "$NAMESPACE" --timeout=120s
    log "Namespace $NAMESPACE deleted."
    return 0
  fi

  cleanup_leftover_pvcs

  log "Teardown complete. Namespace and secrets preserved."
  echo ""
  info "Remaining secrets:"
  print_remaining_secrets
}

cmd_teardown() {
  echo -e "${YELLOW}WARNING: This will remove agents + infrastructure (Helm releases + PVCs)${NC}"
  echo "Keeping: namespace '$NAMESPACE', secrets"
  read -p "Type 'yes' to confirm: " confirm
  if [[ $confirm != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi

  if component_enabled "$KUBECLAW_DEPLOY_PRISM"; then cmd_teardown_prism; fi
  run_destructive_teardown 0
}

cmd_teardown_all() {
  echo -e "${RED}WARNING: This will DESTROY namespace '$NAMESPACE' and EVERYTHING in it${NC}"
  echo "Including: all agents, infra, PVCs, secrets, namespace itself"
  echo -e "${YELLOW}You will need to run ./scripts/deploy.sh secrets after recreating the namespace.${NC}"
  read -p "Type 'destroy' to confirm: " confirm
  if [[ $confirm != "destroy" ]]; then
    echo "Aborted."
    exit 0
  fi

  run_destructive_teardown 1
}

# ─── Main ────────────────────────────────────────────────────────────────

case "${1:-}" in
  setup)
    cmd_setup
    ;;
  infra)
    cmd_infra
    ;;
  secrets)
    cmd_secrets
    if component_enabled "$KUBECLAW_DEPLOY_PRISM"; then cmd_prism_secrets; fi
    ;;
  tailscale)
    TAILSCALE_OPERATOR_ENABLED=true deploy_tailscale_operator
    ;;
  buildkit-preflight)
    cmd_buildkit_preflight "${2:-}" "${3:-}"
    ;;
  buster-buildkit-smoke)
    warn "buster-buildkit-smoke is retained as an alias; use nova-buildkit-preflight."
    cmd_nova_buildkit_preflight
    ;;
  nova-buildkit-preflight)
    cmd_nova_buildkit_preflight
    ;;
  nova-unit-preflight)
    cmd_nova_unit_preflight
    ;;
  nova-kubernetes-fixture-preflight)
    cmd_nova_kubernetes_fixture_preflight "$@"
    ;;
  nova-http-preflight)
    cmd_nova_http_preflight "$@"
    ;;
  nova-a11y-preflight)
    cmd_nova_a11y_preflight "$@"
    ;;
  nova-api-preflight)
    cmd_nova_api_preflight "$@"
    ;;
  nova-lighthouse-preflight)
    cmd_nova_lighthouse_preflight "$@"
    ;;
  nova-visual-preflight)
    cmd_nova_visual_preflight "$@"
    ;;
  nova-e2e-preflight)
    cmd_nova_e2e_preflight "$@"
    ;;
  nova-security-preflight)
    cmd_nova_security_preflight "$@"
    ;;
  nova-tailscale-preflight)
    cmd_nova_tailscale_preflight "$@"
    ;;
  nova-production-preflights)
    cmd_nova_production_preflights "$@"
    ;;
  worker-trust-e2e)
    cmd_worker_trust_e2e
    ;;
  buster-infra-smoke)
    cmd_buster_infra_smoke
    ;;
  agents)
    cmd_agents
    ;;
  agent)
    cmd_agent "${2:-}" "${3:-}"
    ;;
  image)
    cmd_image "${2:-both}"
    ;;
  code)
    cmd_code "${2:-both}"
    ;;
  all)
    cmd_setup
    cmd_infra
    if component_enabled "$KUBECLAW_DEPLOY_PRISM"; then cmd_prism; fi
    cmd_agents
    echo ""
    header "Deployment Complete"
    cmd_status
    ;;
  smoke)
    cmd_smoke
    ;;
  smoke-agent)
    if [[ -z ${2:-} ]]; then
      err "Usage: $0 smoke-agent <nova|buster>"
      exit 1
    fi
    cmd_smoke_agent "$2"
    ;;
  status)
    cmd_status
    if component_enabled "$KUBECLAW_DEPLOY_PRISM"; then cmd_prism_status; fi
    ;;
  prism)
    cmd_prism
    ;;
  prism-smoke)
    cmd_prism_smoke
    ;;
  prism-e2e)
    cmd_prism_e2e
    ;;
  prism-status)
    cmd_prism_status
    ;;
  teardown-prism)
    cmd_teardown_prism
    ;;
  teardown)
    cmd_teardown
    ;;
  teardown-agents)
    cmd_teardown_agents
    ;;
  teardown-all)
    cmd_teardown_all
    ;;
  *)
    if [[ -n ${1:-} ]]; then
      err "Unknown deployment command: $1"
    fi
    echo "KubeClaw — Deployment CLI"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup              Create namespace + add helm repos"
    echo "  secrets            Create/copy/prompt required Kubernetes secrets"
    echo "  infra              Deploy required infra plus optional Qdrant/PostgreSQL/LiteLLM"
    echo "  tailscale          Deploy Tailscale Kubernetes Operator"
    echo "  buildkit-preflight [image] [pull-secret]"
    echo "                    Verify rootless BuildKit support with a temporary pod"
    echo "  nova-buildkit-preflight Build, publish, deploy, and verify an image through Nova and Buster v2"
    echo "  nova-unit-preflight Run a real unit process through Nova and Buster v2"
    echo "  nova-kubernetes-fixture-preflight [image] [secret-name]"
    echo "                    Verify a retained Kubernetes fixture through Nova and Buster v2"
    echo "  nova-http-preflight [image]"
    echo "                    Verify an in-cluster HTTP service through Nova and Buster v2"
    echo "  nova-api-preflight [image]"
    echo "                    Verify real API providers through Nova and Buster"
    echo "  nova-a11y-preflight [image]"
    echo "                    Verify Chromium, Firefox, WebKit, and Axe through Nova and Buster v2"
    echo "  nova-lighthouse-preflight [image]"
    echo "                    Verify real Lighthouse performance through Nova and Buster v2"
    echo "  nova-visual-preflight [image]"
    echo "                    Verify real browser visual comparison through Nova and Buster v2"
    echo "  nova-e2e-preflight [image]"
    echo "                    Verify real Playwright end-to-end execution through Nova and Buster v2"
    echo "  nova-security-preflight [image]"
    echo "                    Verify all five real security providers through Nova and Buster v2"
    echo "  nova-tailscale-preflight [image]"
    echo "                    Verify Kubernetes and Tailscale through Nova and Buster v2"
    echo "  nova-production-preflights [image]"
    echo "                    Run all production-required suite proofs after all 13 source cutovers"
    echo "  worker-trust-e2e  Prove SPIRE identity, mTLS, authorization, and source attestation on-cluster"
    echo "  buster-buildkit-smoke Deprecated alias for nova-buildkit-preflight"
    echo "  buster-infra-smoke  Test Redis → deployed Buster → BuildKit → deploy → completion"
    echo "  agents             Deploy agents (Nova + Buster) using image/runtime values"
    echo "  agent <name> [--with-code]  Deploy Nova, Buster, or the dedicated Prism release"
    echo "                    Add --with-code to also smoke, deploy code, and smoke again"
    echo "  image [target]     Image deploy for nova|buster|both (default: both)"
    echo "  code [target]      Code-bundle deploy for all agents by default, or one target (nova|buster)"
    echo "  all                Full deployment (setup + infra + agents)"
    echo "  smoke              Run pod-level smoke checks for Nova + Buster"
    echo "  smoke-agent <name> Run pod-level smoke checks for one agent"
    echo "  status             Show all pods, services, PVCs"
    echo "  prism              Install or upgrade standalone Prism"
    echo "  prism-smoke        Test the real deployed Prism services"
    echo "  prism-e2e          Run the Nova-started Prism E2E journey"
    echo "  prism-status       Show Prism workloads, storage, and release"
    echo "  teardown-prism     Remove Prism workloads and keep its data"
    echo "  teardown           Remove agents + infra, keep namespace + secrets"
    echo "  teardown-agents    Remove agents only, keep infra"
    echo "  teardown-all       DESTROY namespace and everything in it"
    echo ""
    echo "Environment:"
    echo "  NAMESPACE=$NAMESPACE"
    echo "  NOVA_CODE_BUNDLE_ARCHIVE_URL=${NOVA_CODE_BUNDLE_ARCHIVE_URL:-}"
    echo "  NOVA_CODE_BUNDLE_EXPECTED_COMMIT=${NOVA_CODE_BUNDLE_EXPECTED_COMMIT:-}"
    echo "  BUSTER_CODE_BUNDLE_ARCHIVE_URL=${BUSTER_CODE_BUNDLE_ARCHIVE_URL:-}"
    echo "  BUSTER_CODE_BUNDLE_EXPECTED_COMMIT=${BUSTER_CODE_BUNDLE_EXPECTED_COMMIT:-}"
    echo "  PRISM_CODE_BUNDLE_ARCHIVE_URL=${PRISM_CODE_BUNDLE_ARCHIVE_URL:-}"
    echo "  PRISM_CODE_BUNDLE_EXPECTED_COMMIT=${PRISM_CODE_BUNDLE_EXPECTED_COMMIT:-}"
    echo "  TAILSCALE_OPERATOR_ENABLED=${TAILSCALE_OPERATOR_ENABLED:-true}"
    echo "  TAILSCALE_OPERATOR_NAMESPACE=$TAILSCALE_OPERATOR_NAMESPACE"
    exit 1
    ;;
esac

