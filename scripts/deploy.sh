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
#   ./deploy.sh agents             Deploy agents (Nova + Buster)
#   ./deploy.sh agent <name> [--with-code]  Deploy single agent (nova|buster), optionally followed by code deploy
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
#   TAILSCALE_OPERATOR_ENABLED     true|false (default: true)
#   TAILSCALE_OAUTH_CLIENT_ID      Optional bootstrap source for Secret/operator-oauth
#   TAILSCALE_OAUTH_CLIENT_SECRET  Optional bootstrap source for Secret/operator-oauth
#   KUBECLAW_SECRET_SETUP_MODE     auto|interactive|noninteractive (default: auto)
#   KUBECLAW_RUN_SECRET_SETUP      auto|true|false for setup/all (default: auto)
#   KUBECLAW_WORKSPACE_PROMPT      auto|true|false (default: auto)
#   KUBECLAW_DEPLOY_POSTGRESQL    true|false (default: true)
#   KUBECLAW_DEPLOY_QDRANT        true|false (default: true)
#   KUBECLAW_DEPLOY_LITELLM       true|false (default: true)
#   ALLOW_PARTIAL_INFRA           true|false (default: false)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CHART_DIR="$REPO_DIR/charts/kubeclaw"
VALUES_DIR="$REPO_DIR/my-values"
INFRA_DIR="$VALUES_DIR/infra"

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
ALLOW_PARTIAL_INFRA="${ALLOW_PARTIAL_INFRA:-false}"
AGENT_HELM_TIMEOUT="${AGENT_HELM_TIMEOUT:-45m}"
AGENT_ROLLOUT_TIMEOUT="${AGENT_ROLLOUT_TIMEOUT:-45m}"
CODE_BUNDLE_DEFAULT_REF="${CODE_BUNDLE_DEFAULT_REF:-refs/heads/main}"
CODE_BUNDLE_RELEASE_TAG="${CODE_BUNDLE_RELEASE_TAG:-agent-code-bundles}"
CODE_BUNDLE_PREFLIGHT_SKIP="${CODE_BUNDLE_PREFLIGHT_SKIP:-false}"

export NAMESPACE
export KUBECLAW_DEPLOY_POSTGRESQL
export KUBECLAW_DEPLOY_QDRANT
export KUBECLAW_DEPLOY_LITELLM
export ALLOW_PARTIAL_INFRA

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
header() { echo -e "\n${BLUE}═══════════════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════${NC}"; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command not found: $1"
    return 1
  fi
}

is_not_found_error() {
  local text="$1"
  [[ "$text" =~ [Nn]ot[Ff]ound|[Nn]ot\ [Ff]ound|No\ resources\ found ]]
}

warn_nonfatal_failure() {
  local context="$1"
  local detail="${2:-}"

  warn "$context"
  if [[ -n "$detail" ]]; then
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

  if [[ "$output" == *"already exists"* ]]; then
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
    if [[ -n "$output" ]]; then
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
  local selector="app.kubernetes.io/instance=${release}"
  kubectl rollout status deployment/"$release" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  kubectl wait --for=condition=Ready pod -l "$selector" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
}

append_image_override_file() {
  local output_path="$1"
  local image_repo="$2"
  local image_tag="$3"
  local disable_pull_secrets="$4"
  local controller_image_repo="${5:-}"
  local controller_image_tag="${6:-}"

  if [[ -n "$image_repo" || -n "$image_tag" ]]; then
    echo "image:" >> "$output_path"
    if [[ -n "$image_repo" ]]; then
      echo "  repository: \"$image_repo\"" >> "$output_path"
    fi
    if [[ -n "$image_tag" ]]; then
      echo "  tag: \"$image_tag\"" >> "$output_path"
    fi
  fi

  if [[ "$disable_pull_secrets" == "1" ]]; then
    echo "imagePullSecrets: []" >> "$output_path"
  fi

  if [[ -n "$controller_image_repo" || -n "$controller_image_tag" ]]; then
    echo "busterNamespaceBroker:" >> "$output_path"
    echo "  controller:" >> "$output_path"
    echo "    image:" >> "$output_path"
    if [[ -n "$controller_image_repo" ]]; then
      echo "      repository: \"$controller_image_repo\"" >> "$output_path"
    fi
    if [[ -n "$controller_image_tag" ]]; then
      echo "      tag: \"$controller_image_tag\"" >> "$output_path"
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

  cat >> "$output_path" <<EOF
codeBundle:
  enabled: true
  archiveUrl: "$archive_url"
  expectedCommit: "$expected_commit"
  contractVersion: "$contract_version"
EOF

  if [[ -n "$auth_secret" ]]; then
    cat >> "$output_path" <<EOF
  auth:
    existingSecret: "$auth_secret"
    existingSecretKey: "$auth_key"
EOF
  fi
}

yaml_get_section_key() {
  local file="$1"
  local section="$2"
  local key="$3"

  awk -v section="$section" -v key="$key" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      gsub(/^'\''/, "", value)
      gsub(/'\''$/, "", value)
      return value
    }

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
      print trim(value)
      exit
    }
  ' "$file"
}

yaml_get_nested_section_key() {
  local file="$1"
  local section="$2"
  local subsection="$3"
  local key="$4"

  awk -v section="$section" -v subsection="$subsection" -v key="$key" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      gsub(/^'\''/, "", value)
      gsub(/'\''$/, "", value)
      return value
    }

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
      print trim(value)
      exit
    }
  ' "$file"
}

derive_github_repository_from_image_repository() {
  local image_repository="${1:-}"

  if [[ "$image_repository" =~ ^ghcr\.io/([^/]+)/kubeclaw([-.][A-Za-z0-9._-]+)?$ ]]; then
    echo "${BASH_REMATCH[1]}/kubeclaw"
    return 0
  fi

  return 1
}

derive_github_repository() {
  local image_repository="${1:-}"

  if [[ -n "${CODE_BUNDLE_GITHUB_REPOSITORY:-}" ]]; then
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
  if [[ -z "$remote_url" ]]; then
    return 1
  fi

  local repo
  repo="$remote_url"
  repo="${repo#git@github.com:}"
  repo="${repo#ssh://git@github.com/}"
  if [[ "$repo" == "$remote_url" && "$remote_url" =~ ^https?://([^/@]+@)?github\.com/(.+)$ ]]; then
    repo="${BASH_REMATCH[2]}"
  fi
  repo="${repo%.git}"
  if [[ "$repo" == "$remote_url" || "$repo" != */* ]]; then
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
  if [[ -z "$expected_commit" ]]; then
    return 1
  fi

  echo "https://github.com/${repository}/releases/download/${CODE_BUNDLE_RELEASE_TAG}/${role}-${expected_commit}.tgz"
}

default_bundle_expected_commit() {
  local ref="$CODE_BUNDLE_DEFAULT_REF"
  local resolved=""

  if resolved="$(git -C "$REPO_DIR" ls-remote --exit-code origin "$ref" 2>/dev/null | awk 'NR==1 {print $1}')" && [[ -n "$resolved" ]]; then
    echo "$resolved"
    return 0
  fi

  if [[ "$ref" == "refs/heads/main" ]] || [[ "$ref" == "main" ]]; then
    if resolved="$(git -C "$REPO_DIR" rev-parse --verify origin/main 2>/dev/null)" && [[ -n "$resolved" ]]; then
      echo "$resolved"
      return 0
    fi
  fi

  if resolved="$(git -C "$REPO_DIR" rev-parse --verify HEAD 2>/dev/null)" && [[ -n "$resolved" ]]; then
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

  if [[ "${CODE_BUNDLE_PREFLIGHT_SKIP,,}" == "true" ]]; then
    warn "Skipping ${role} bundle archive preflight because CODE_BUNDLE_PREFLIGHT_SKIP=true."
    return 0
  fi

  if [[ -n "$auth_secret" ]]; then
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
      err "Push the commit to main and wait for the bundle publication workflow, or set $(tr '[:lower:]' '[:upper:]' <<< "$role")_CODE_BUNDLE_ARCHIVE_URL explicitly."
      return 1
    fi
  fi

  case "$status" in
    2*|3*)
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
    nova:contract_version) echo "${NOVA_CODE_BUNDLE_CONTRACT_VERSION:-v1}" ;;
    nova:auth_secret) echo "${NOVA_CODE_BUNDLE_AUTH_SECRET:-}" ;;
    nova:auth_key) echo "${NOVA_CODE_BUNDLE_AUTH_SECRET_KEY:-token}" ;;
    buster:archive_url) echo "${BUSTER_CODE_BUNDLE_ARCHIVE_URL:-}" ;;
    buster:expected_commit) echo "${BUSTER_CODE_BUNDLE_EXPECTED_COMMIT:-}" ;;
    buster:contract_version) echo "${BUSTER_CODE_BUNDLE_CONTRACT_VERSION:-v1}" ;;
    buster:auth_secret) echo "${BUSTER_CODE_BUNDLE_AUTH_SECRET:-}" ;;
    buster:auth_key) echo "${BUSTER_CODE_BUNDLE_AUTH_SECRET_KEY:-token}" ;;
    *) return 1 ;;
  esac
}

resolve_deploy_targets() {
  local target="${1:-both}"
  case "$target" in
    both) echo "nova buster" ;;
    nova|buster) echo "$target" ;;
    *)
      err "Usage: $0 code [nova|buster] or $0 image [nova|buster|both]"
      return 1
      ;;
  esac
}

# ─── Setup (namespace + repos) ───────────────────────────────────────────

is_valid_namespace() {
  local value="$1"
  [[ "$value" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ && "${#value}" -le 63 ]]
}

prompt_workspace_namespace_if_needed() {
  local mode
  local workspace
  local prompt_default="$NAMESPACE"

  mode="$(normalize_boolish "$KUBECLAW_WORKSPACE_PROMPT")"
  if [[ -z "$NAMESPACE_WAS_SET" && -f "$KUBECLAW_WORKSPACE_NAMESPACE_FILE" ]]; then
    workspace="$(tr -d '[:space:]' < "$KUBECLAW_WORKSPACE_NAMESPACE_FILE")"
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
    true|auto)
      if [[ "$mode" == "auto" && -n "$NAMESPACE_WAS_SET" ]]; then
        export NAMESPACE
        return 0
      fi
      if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
        if [[ "$mode" == "true" ]]; then
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
    read -r -p "How would you like to name the workspace namespace? [$prompt_default]: " workspace < /dev/tty
    workspace="${workspace:-$prompt_default}"
    if is_valid_namespace "$workspace"; then
      NAMESPACE="$workspace"
      export NAMESPACE
      mkdir -p "$(dirname "$KUBECLAW_WORKSPACE_NAMESPACE_FILE")"
      printf '%s\n' "$NAMESPACE" > "$KUBECLAW_WORKSPACE_NAMESPACE_FILE"
      log "Workspace namespace: $NAMESPACE"
      return 0
    fi
    warn "Use a Kubernetes namespace-safe name: lowercase letters, numbers, hyphens, max 63 chars."
  done
}

component_enabled() {
  local value
  value="$(normalize_boolish "$1")"
  [[ "$value" == "true" ]]
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

  if [[ ! -x "$helper" ]]; then
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
    1|true|yes|on|enabled) echo "true" ;;
    0|false|no|off|disabled) echo "false" ;;
    *) echo "$value" ;;
  esac
}

deploy_tailscale_operator() {
  local mode="${TAILSCALE_OPERATOR_ENABLED:-true}"
  local normalized_mode
  normalized_mode="$(normalize_boolish "$mode")"

  header "Infrastructure: Tailscale Kubernetes Operator"

  require_command kubectl
  require_command helm

  if [[ "$normalized_mode" == "false" ]]; then
    warn "Tailscale operator install disabled by TAILSCALE_OPERATOR_ENABLED=$mode"
    return 0
  fi

  local secret_status=0
  if ensure_tailscale_oauth_secret "$normalized_mode"; then
    secret_status=0
  else
    secret_status=$?
  fi
  if [[ "$secret_status" == "2" ]]; then
    return 0
  fi
  if [[ "$secret_status" != "0" ]]; then
    return "$secret_status"
  fi

  if [[ ! -f "$TAILSCALE_VALUES_FILE" ]]; then
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

  if [[ -n "$client_id" && -n "$client_secret" ]]; then
    kubectl create namespace "$TAILSCALE_OPERATOR_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    kubectl create secret generic "$TAILSCALE_OAUTH_SECRET_NAME" \
      --namespace "$TAILSCALE_OPERATOR_NAMESPACE" \
      --from-literal=client_id="$client_id" \
      --from-literal=client_secret="$client_secret" \
      --dry-run=client -o yaml | kubectl apply -f -
    log "Created Tailscale OAuth secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    return 0
  fi

  if [[ "$normalized_mode" == "true" ]]; then
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
    # LiteLLM config as ConfigMap
    kubectl create configmap litellm-config \
      --namespace "$NAMESPACE" \
      --from-file=config.yaml="$INFRA_DIR/litellm-config.yaml" \
      --dry-run=client -o yaml | kubectl apply -f -

    # LiteLLM Deployment + Service (no Helm chart — plain manifest)
    kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/litellm-deployment.yaml"
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
  kubectl apply -f "$INFRA_DIR/buster-namespace-fence.yaml"
  log "Buster namespace fence applied"

  header "Infrastructure: Network Policies"
  kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/network-policies.yaml"
  log "Network policies applied"

  deploy_tailscale_operator

  echo ""
  log "Infrastructure deployed. Pods:"
  kubectl get pods -n "$NAMESPACE" --no-headers | awk '{print "  " $1 " → " $3}'
}

# ─── Agents ──────────────────────────────────────────────────────────────

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

  if [[ ! -f "$values_file" ]]; then
    err "Values file not found: $values_file"
    return 1
  fi

  case "$role" in
    nova)
      image_repo="${NOVA_IMAGE_REPOSITORY:-${GENERAL_IMAGE_REPOSITORY:-}}"
      image_tag="${NOVA_IMAGE_TAG:-${GENERAL_IMAGE_TAG:-}}"
      ;;
    buster)
      image_repo="${BUSTER_IMAGE_REPOSITORY:-${SANDBOX_IMAGE_REPOSITORY:-}}"
      image_tag="${BUSTER_IMAGE_TAG:-${SANDBOX_IMAGE_TAG:-}}"
      controller_image_repo="${BUSTER_CONTROLLER_IMAGE_REPOSITORY:-${NAMESPACE_CONTROLLER_IMAGE_REPOSITORY:-}}"
      controller_image_tag="${BUSTER_CONTROLLER_IMAGE_TAG:-${NAMESPACE_CONTROLLER_IMAGE_TAG:-}}"
      ;;
  esac

  if [[ -z "$image_repo" ]]; then
    image_repo="$(yaml_get_section_key "$values_file" image repository)"
  fi

  if [[ "$mode" == "code" ]]; then
    bundle_expected_commit="$(bundle_env_for_role "$role" expected_commit)"
    bundle_contract_version="$(bundle_env_for_role "$role" contract_version)"
    bundle_auth_secret="$(bundle_env_for_role "$role" auth_secret)"
    bundle_auth_key="$(bundle_env_for_role "$role" auth_key)"
    bundle_archive_url="$(bundle_env_for_role "$role" archive_url)"

    if [[ -z "$bundle_auth_secret" ]]; then
      bundle_auth_secret="$(yaml_get_nested_section_key "$values_file" codeBundle auth existingSecret)"
    fi
    if [[ -z "$bundle_auth_key" || "$bundle_auth_key" == "token" ]]; then
      local values_auth_key=""
      values_auth_key="$(yaml_get_nested_section_key "$values_file" codeBundle auth existingSecretKey)"
      if [[ -n "$values_auth_key" ]]; then
        bundle_auth_key="$values_auth_key"
      fi
    fi

    if [[ -z "$bundle_expected_commit" ]]; then
      if ! bundle_expected_commit="$(default_bundle_expected_commit)"; then
        err "${role} code deploy requires $(tr '[:lower:]' '[:upper:]' <<< "$role")_CODE_BUNDLE_EXPECTED_COMMIT or a resolvable ${CODE_BUNDLE_DEFAULT_REF}"
        return 1
      fi
      info "Resolved ${role} code bundle commit from ${CODE_BUNDLE_DEFAULT_REF}: ${bundle_expected_commit}"
    fi
    if [[ -z "$bundle_archive_url" ]]; then
      if ! bundle_archive_url="$(default_bundle_archive_url "$role" "$bundle_expected_commit" "$image_repo")"; then
        bundle_archive_url=""
      fi
    fi
    if [[ -z "$bundle_archive_url" ]]; then
      err "${role} code deploy requires $(tr '[:lower:]' '[:upper:]' <<< "$role")_CODE_BUNDLE_ARCHIVE_URL or a derivable GitHub repository"
      return 1
    fi
    verify_bundle_archive_url "$role" "$bundle_archive_url" "$bundle_expected_commit" "$bundle_auth_secret"
  fi

  if [[ -n "$image_repo" || -n "$image_tag" || -n "$controller_image_repo" || -n "$controller_image_tag" || "$disable_pull_secrets" == "1" || "$mode" == "code" ]]; then
    override_file="$(mktemp)"
    : > "$override_file"
  fi

  if [[ -n "$override_file" && ( -n "$image_repo" || -n "$image_tag" || -n "$controller_image_repo" || -n "$controller_image_tag" || "$disable_pull_secrets" == "1" ) ]]; then
    append_image_override_file "$override_file" "$image_repo" "$image_tag" "$disable_pull_secrets" "$controller_image_repo" "$controller_image_tag"
  fi

  if [[ -n "$override_file" && "$mode" == "code" ]]; then
    append_code_bundle_override_file "$override_file" "$bundle_archive_url" "$bundle_expected_commit" "$bundle_contract_version" "$bundle_auth_secret" "$bundle_auth_key"
  fi

  helm_args=(
    upgrade --install "agent-${role}" "$CHART_DIR"
    --namespace "$NAMESPACE"
    --values "$values_file"
    --wait --timeout "$AGENT_HELM_TIMEOUT"
  )

  if ! component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    helm_args+=(--set probes.dependencies.litellm.enabled=false)
  fi
  if ! component_enabled "$KUBECLAW_DEPLOY_QDRANT"; then
    helm_args+=(--set probes.dependencies.qdrant.enabled=false)
  fi

  if [[ -n "$override_file" ]]; then
    helm_args+=(--values "$override_file")
  fi

  info "Deploying agent-${role} (${mode})..."
  if ! helm "${helm_args[@]}"; then
    if [[ -n "$override_file" ]]; then
      rm -f "$override_file"
    fi
    return 1
  fi

  if [[ -n "$override_file" ]]; then
    rm -f "$override_file"
  fi

  wait_for_agent_rollout "agent-${role}"
  log "agent-${role} deployed (${mode})"
}

cmd_agents() {
  header "Agents (image deploy)"
  # Nova = orchestrator + Forge/Echo as ACP subagents (all in one pod)
  # Buster = isolated tester (separate pod with Podman sandbox)
  for role in nova buster; do
    deploy_agent "$role" image
  done

  echo ""
  log "All agents deployed."
  kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=kubeclaw --no-headers \
    | awk '{print "  " $1 " → " $3}'
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

  if [[ -z "$role" ]]; then
    err "Usage: $0 agent <nova|buster> [--with-code]"
    return 1
  fi

  case "$extra_arg" in
    "")
      ;;
    --with-code)
      with_code=1
      ;;
    *)
      err "Usage: $0 agent <nova|buster> [--with-code]"
      return 1
      ;;
  esac

  header "Agent Deploy: ${role}"
  deploy_agent "$role" image

  if [[ "$with_code" == "1" ]]; then
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

  if [[ "$role" != "nova" && "$role" != "buster" ]]; then
    err "Usage: $0 smoke-agent <nova|buster>"
    return 1
  fi

  header "Smoke: ${release}"
  kubectl get deployment "$release" -n "$NAMESPACE" >/dev/null
  kubectl get svc "$release" -n "$NAMESPACE" >/dev/null
  kubectl rollout status deployment/$release -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  kubectl wait --for=condition=Ready pod -l "app.kubernetes.io/instance=$release" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"
  kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- openclaw gateway status
  kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- node /runtime-config/kubeclaw-health.mjs startup-status
  kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- node /runtime-config/kubeclaw-health.mjs readiness
  kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -d /app/skills
  kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -f /home/node/.openclaw/swarm.config.json
  log "${release} smoke passed"
}

cmd_smoke() {
  header "Agent Smoke"
  for role in nova buster; do
    cmd_smoke_agent "$role"
  done
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
      [[ -n "$fallback_output" ]] && echo "$fallback_output"
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
  if [[ -n "$pvcs" ]]; then
    warn "Removing leftover PVCs..."
    while IFS= read -r pvc; do
      [[ -n "$pvc" ]] || continue
      kubectl delete pvc "$pvc" -n "$NAMESPACE"
    done <<< "$pvcs"
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

  if [[ "$destroy_namespace" == "1" ]]; then
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
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi

  run_destructive_teardown 0
}

cmd_teardown_all() {
  echo -e "${RED}WARNING: This will DESTROY namespace '$NAMESPACE' and EVERYTHING in it${NC}"
  echo "Including: all agents, infra, PVCs, secrets, namespace itself"
  echo -e "${YELLOW}You will need to re-run setup-secrets.sh after recreating the namespace.${NC}"
  read -p "Type 'destroy' to confirm: " confirm
  if [[ "$confirm" != "destroy" ]]; then
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
    ;;
  tailscale)
    TAILSCALE_OPERATOR_ENABLED=true deploy_tailscale_operator
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
    cmd_agents
    echo ""
    header "Deployment Complete"
    cmd_status
    ;;
  smoke)
    cmd_smoke
    ;;
  smoke-agent)
    if [[ -z "${2:-}" ]]; then
      err "Usage: $0 smoke-agent <nova|buster>"
      exit 1
    fi
    cmd_smoke_agent "$2"
    ;;
  status)
    cmd_status
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
    echo "KubeClaw — Full Stack Deployment"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup              Create namespace + add helm repos"
    echo "  secrets            Create/copy/prompt required Kubernetes secrets"
    echo "  infra              Deploy required infra plus optional Qdrant/PostgreSQL/LiteLLM"
    echo "  tailscale          Deploy Tailscale Kubernetes Operator"
    echo "  agents             Deploy agents (Nova + Buster) using image/runtime values"
    echo "  agent <name> [--with-code]  Deploy single agent using image/runtime values"
    echo "                    Add --with-code to also smoke, deploy code, and smoke again"
    echo "  image [target]     Image deploy for nova|buster|both (default: both)"
    echo "  code [target]      Code-bundle deploy for all agents by default, or one target (nova|buster)"
    echo "  all                Full deployment (setup + infra + agents)"
    echo "  smoke              Run pod-level smoke checks for Nova + Buster"
    echo "  smoke-agent <name> Run pod-level smoke checks for one agent"
    echo "  status             Show all pods, services, PVCs"
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
    echo "  TAILSCALE_OPERATOR_ENABLED=${TAILSCALE_OPERATOR_ENABLED:-true}"
    echo "  TAILSCALE_OPERATOR_NAMESPACE=$TAILSCALE_OPERATOR_NAMESPACE"
    exit 1
    ;;
esac
