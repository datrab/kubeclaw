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
#   ./deploy.sh agent <name>       Deploy single agent (nova|buster)
#   ./deploy.sh build-local-images [tag]
#                                  Build + push verification images to registry-local
#   ./deploy.sh verify-live [tag]  Build local images, redeploy agents, run pod smoke
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
#   LOCAL_REGISTRY_PUSH  Host-visible push target for build-local-images
#   LOCAL_REGISTRY_PULL  Cluster-visible pull target for verify-live
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

restart_agent_pods_after_deploy() {
  local release="$1"
  local selector="app.kubernetes.io/instance=${release}"

  info "Restarting ${release} pods so the latest image is pulled..."
  kubectl delete pod -n "$NAMESPACE" -l "$selector" --ignore-not-found --wait=true
  kubectl rollout status deployment/"$release" -n "$NAMESPACE" --timeout=180s
  kubectl wait --for=condition=Ready pod -l "$selector" -n "$NAMESPACE" --timeout=180s
}

default_verification_tag() {
  date -u +"live-smoke-%Y%m%d%H%M%S"
}

write_image_override_file() {
  local output_path="$1"
  local image_repo="$2"
  local image_tag="$3"
  local disable_pull_secrets="$4"
  local controller_image_repo="${5:-}"
  local controller_image_tag="${6:-}"

  : > "$output_path"

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

build_local_image() {
  local name="$1"
  local dockerfile="$2"
  local push_repo="$3"
  local tag="$4"

  header "Build: ${name}"
  docker build -f "$REPO_DIR/$dockerfile" -t "$push_repo:$tag" "$REPO_DIR"
  docker push "$push_repo:$tag"
  log "${name} image pushed: $push_repo:$tag"
}

verify_cluster_image_pull() {
  local image="$1"
  local pod="kubeclaw-image-pull-check"
  local wait_output

  info "Preflighting cluster image pull: $image"
  kubectl delete pod "$pod" -n "$NAMESPACE" --ignore-not-found --wait=true >/dev/null
  kubectl run "$pod" \
    -n "$NAMESPACE" \
    --image="$image" \
    --restart=Never \
    --image-pull-policy=Always \
    --command -- sh -c 'sleep 30'

  if wait_output=$(kubectl wait --for=condition=Ready "pod/$pod" -n "$NAMESPACE" --timeout=120s 2>&1); then
    kubectl delete pod "$pod" -n "$NAMESPACE" --ignore-not-found --wait=false >/dev/null
    log "Cluster can pull $image"
    return 0
  fi

  err "Cluster cannot pull $image"
  echo "$wait_output" >&2
  kubectl describe pod "$pod" -n "$NAMESPACE" >&2
  kubectl delete pod "$pod" -n "$NAMESPACE" --ignore-not-found --wait=false >/dev/null
  return 1
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
  local values_file="$VALUES_DIR/${role}-values.yaml"
  local image_repo=""
  local image_tag=""
  local controller_image_repo=""
  local controller_image_tag=""
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

  if [[ -n "$image_repo" || -n "$image_tag" || -n "$controller_image_repo" || -n "$controller_image_tag" || "$disable_pull_secrets" == "1" ]]; then
    override_file="$(mktemp)"
    write_image_override_file "$override_file" "$image_repo" "$image_tag" "$disable_pull_secrets" "$controller_image_repo" "$controller_image_tag"
  fi

  helm_args=(
    upgrade --install "agent-${role}" "$CHART_DIR"
    --namespace "$NAMESPACE"
    --values "$values_file"
    --wait --timeout 180s
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

  info "Deploying agent-${role}..."
  if ! helm "${helm_args[@]}"; then
    if [[ -n "$override_file" ]]; then
      rm -f "$override_file"
    fi
    return 1
  fi

  if [[ -n "$override_file" ]]; then
    rm -f "$override_file"
  fi

  restart_agent_pods_after_deploy "agent-${role}"
  log "agent-${role} deployed"
}

cmd_agents() {
  header "Agents"
  # Nova = orchestrator + Forge/Echo as ACP subagents (all in one pod)
  # Buster = isolated tester (separate pod with Podman sandbox)
  for role in nova buster; do
    deploy_agent "$role"
  done

  echo ""
  log "All agents deployed."
  kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=kubeclaw --no-headers \
    | awk '{print "  " $1 " → " $3}'
}

cmd_build_local_images() {
  local tag="${1:-$(default_verification_tag)}"
  local push_registry="${LOCAL_REGISTRY_PUSH:-}"

  require_command docker
  require_command kubectl

  header "Local verification image build"
  if [[ -z "$push_registry" ]]; then
    err "LOCAL_REGISTRY_PUSH is required because registry-local is ClusterIP by default."
    info "Set it to a private registry endpoint that Docker can push to."
    return 1
  fi
  kubectl get deployment registry-local -n "$NAMESPACE" >/dev/null
  kubectl rollout status deployment/registry-local -n "$NAMESPACE" --timeout=60s
  info "Push registry: $push_registry"
  info "Verification tag: $tag"

  build_local_image "general" "docker/Dockerfile.general" "$push_registry/kubeclaw-general" "$tag"
  build_local_image "sandbox" "docker/Dockerfile.sandbox" "$push_registry/kubeclaw-sandbox" "$tag"
  build_local_image "namespace-controller" "docker/Dockerfile.namespace-controller" "$push_registry/kubeclaw-namespace-controller" "$tag"
}

cmd_verify_live() {
  local tag="${1:-$(default_verification_tag)}"
  local pull_registry="${LOCAL_REGISTRY_PULL:-}"

  require_command docker
  require_command helm
  require_command kubectl

  header "Live deployment verification"
  if [[ -z "$pull_registry" ]]; then
    err "LOCAL_REGISTRY_PULL is required because registry-local is ClusterIP by default."
    info "Set it to the registry endpoint that cluster nodes can pull from."
    return 1
  fi
  info "Preparing local verification images for tag: $tag"
  cmd_build_local_images "$tag"

  local general_image="$pull_registry/kubeclaw-general:$tag"
  local sandbox_image="$pull_registry/kubeclaw-sandbox:$tag"
  local namespace_controller_image="$pull_registry/kubeclaw-namespace-controller:$tag"

  verify_cluster_image_pull "$general_image"
  verify_cluster_image_pull "$sandbox_image"
  verify_cluster_image_pull "$namespace_controller_image"

  GENERAL_IMAGE_REPOSITORY="$pull_registry/kubeclaw-general"
  GENERAL_IMAGE_TAG="$tag"
  SANDBOX_IMAGE_REPOSITORY="$pull_registry/kubeclaw-sandbox"
  SANDBOX_IMAGE_TAG="$tag"
  NAMESPACE_CONTROLLER_IMAGE_REPOSITORY="$pull_registry/kubeclaw-namespace-controller"
  NAMESPACE_CONTROLLER_IMAGE_TAG="$tag"
  DISABLE_IMAGE_PULL_SECRETS=1

  info "Redeploying agents against registry-local tag: $tag"
  cmd_agents
  cmd_smoke
  log "Live deployment verification passed for tag: $tag"
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
  kubectl rollout status deployment/$release -n "$NAMESPACE" --timeout=180s
  kubectl wait --for=condition=Ready pod -l "app.kubernetes.io/instance=$release" -n "$NAMESPACE" --timeout=180s
  kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- openclaw gateway status
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
    if [[ -z "${2:-}" ]]; then
      err "Usage: $0 agent <nova|buster>"
      exit 1
    fi
    deploy_agent "$2"
    ;;
  all)
    cmd_setup
    cmd_infra
    cmd_agents
    echo ""
    header "Deployment Complete"
    cmd_status
    ;;
  build-local-images)
    cmd_build_local_images "${2:-}"
    ;;
  verify-live)
    cmd_verify_live "${2:-}"
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
    echo "  agents             Deploy agents (Nova + Buster)"
    echo "  agent <name>       Deploy single agent (nova|buster)"
    echo "  build-local-images [tag]"
    echo "                     Build + push verification images to registry-local"
    echo "  verify-live [tag]  Build local images, redeploy agents, run pod smoke"
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
    echo "  TAILSCALE_OPERATOR_ENABLED=${TAILSCALE_OPERATOR_ENABLED:-true}"
    echo "  TAILSCALE_OPERATOR_NAMESPACE=$TAILSCALE_OPERATOR_NAMESPACE"
    exit 1
    ;;
esac
