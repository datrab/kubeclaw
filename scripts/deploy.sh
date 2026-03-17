#!/usr/bin/env bash
# =============================================================================
# KubeClaw — Full Stack Deployment
# =============================================================================
# Deploys everything from scratch: namespace, secrets, infra, agents.
#
# Usage:
#   ./deploy.sh setup              Create namespace + secrets + helm repos
#   ./deploy.sh infra              Deploy Redis, Qdrant, PostgreSQL, LiteLLM
#   ./deploy.sh agents             Deploy agents (Nova + Buster)
#   ./deploy.sh agent <name>       Deploy single agent (nova|buster)
#   ./deploy.sh all                Full deployment (setup + infra + agents)
#   ./deploy.sh status             Show all pods and services
#   ./deploy.sh teardown           Remove agents + infra, keep namespace/secrets
#   ./deploy.sh teardown-agents    Remove agents only, keep infra
#   ./deploy.sh teardown-all       Destroy namespace and everything in it
#
# Environment variables:
#   NAMESPACE    Target namespace (default: kubeclaw)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CHART_DIR="$REPO_DIR/charts/kubeclaw"
VALUES_DIR="$REPO_DIR/my-values"
INFRA_DIR="$VALUES_DIR/infra"

NAMESPACE="${NAMESPACE:-kubeclaw}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
header() { echo -e "\n${BLUE}═══════════════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════${NC}"; }

# ─── Setup (namespace + repos) ───────────────────────────────────────────

cmd_setup() {
  header "Step 1: Namespace"

  if kubectl get namespace "$NAMESPACE" &>/dev/null; then
    warn "Namespace '$NAMESPACE' already exists"
  else
    kubectl create namespace "$NAMESPACE"
    log "Created namespace: $NAMESPACE"
  fi

  header "Step 2: Helm Repos"

  helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
  helm repo add qdrant https://qdrant.github.io/qdrant-helm 2>/dev/null || true
  helm repo update >/dev/null
  log "Helm repos ready"

  echo ""
  info "Next: create your secrets (see README for required secrets)"
  info "Then: ./deploy.sh infra && ./deploy.sh agents"
}

# ─── Infrastructure ──────────────────────────────────────────────────────

cmd_infra() {
  header "Infrastructure: Redis"
  helm upgrade --install redis bitnami/redis \
    --namespace "$NAMESPACE" \
    --values "$INFRA_DIR/redis-values.yaml" \
    --wait --timeout 120s
  log "Redis deployed"

  header "Infrastructure: PostgreSQL"
  helm upgrade --install postgresql bitnami/postgresql \
    --namespace "$NAMESPACE" \
    --values "$INFRA_DIR/postgresql-values.yaml" \
    --wait --timeout 120s
  log "PostgreSQL deployed"

  header "Infrastructure: Qdrant"
  helm upgrade --install qdrant qdrant/qdrant \
    --namespace "$NAMESPACE" \
    --values "$INFRA_DIR/qdrant-values.yaml" \
    --wait --timeout 120s
  log "Qdrant deployed"

  header "Infrastructure: LiteLLM"
  # LiteLLM config as ConfigMap
  kubectl create configmap litellm-config \
    --namespace "$NAMESPACE" \
    --from-file=config.yaml="$INFRA_DIR/litellm-config.yaml" \
    --dry-run=client -o yaml | kubectl apply -f -

  # LiteLLM Deployment + Service (no Helm chart — plain manifest)
  kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/litellm-deployment.yaml"
  info "Waiting for LiteLLM to be ready..."
  kubectl rollout status deployment/litellm -n "$NAMESPACE" --timeout=120s 2>/dev/null || warn "LiteLLM not ready yet (may need litellm-secrets or google-sa-key)"
  log "LiteLLM deployed"

  echo ""
  log "Infrastructure deployed. Pods:"
  kubectl get pods -n "$NAMESPACE" --no-headers | awk '{print "  " $1 " → " $3}'
}

# ─── Agents ──────────────────────────────────────────────────────────────

deploy_agent() {
  local role="$1"
  local values_file="$VALUES_DIR/${role}-values.yaml"

  if [[ ! -f "$values_file" ]]; then
    err "Values file not found: $values_file"
    return 1
  fi

  info "Deploying agent-${role}..."
  helm upgrade --install "agent-${role}" "$CHART_DIR" \
    --namespace "$NAMESPACE" \
    --values "$values_file" \
    --wait --timeout 180s
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

# ─── Status ──────────────────────────────────────────────────────────────

cmd_status() {
  header "Pods ($NAMESPACE)"
  kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || warn "No pods found"

  echo ""
  header "Services ($NAMESPACE)"
  kubectl get svc -n "$NAMESPACE" 2>/dev/null || warn "No services found"

  echo ""
  header "PVCs ($NAMESPACE)"
  kubectl get pvc -n "$NAMESPACE" 2>/dev/null || warn "No PVCs found"
}

# ─── Teardown ────────────────────────────────────────────────────────────

cmd_teardown_agents() {
  warn "Removing KubeClaw agents from $NAMESPACE..."
  for role in nova buster; do
    if helm status "agent-${role}" -n "$NAMESPACE" &>/dev/null; then
      helm uninstall "agent-${role}" -n "$NAMESPACE"
      log "Removed: agent-${role}"
    fi
  done
  log "Agents removed. Infrastructure untouched."
}

cmd_teardown() {
  echo -e "${YELLOW}WARNING: This will remove agents + infrastructure (Helm releases + PVCs)${NC}"
  echo "Keeping: namespace '$NAMESPACE', secrets"
  read -p "Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi

  # Agents
  cmd_teardown_agents

  # Infrastructure — Helm releases
  for release in qdrant postgresql redis; do
    if helm status "$release" -n "$NAMESPACE" &>/dev/null; then
      helm uninstall "$release" -n "$NAMESPACE"
      log "Removed: $release"
    fi
  done

  # Infrastructure — LiteLLM (plain manifest, not Helm)
  if kubectl get deployment litellm -n "$NAMESPACE" &>/dev/null; then
    kubectl delete -n "$NAMESPACE" -f "$INFRA_DIR/litellm-deployment.yaml" 2>/dev/null || \
      kubectl delete deployment,svc -n "$NAMESPACE" -l app=litellm
    kubectl delete configmap litellm-config -n "$NAMESPACE" 2>/dev/null || true
    log "Removed: litellm"
  fi

  # Clean up PVCs left behind by Helm resource-policy=keep
  local pvcs
  pvcs=$(kubectl get pvc -n "$NAMESPACE" --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null || true)
  if [[ -n "$pvcs" ]]; then
    warn "Removing leftover PVCs..."
    echo "$pvcs" | xargs -r kubectl delete pvc -n "$NAMESPACE"
    log "PVCs removed"
  fi

  log "Teardown complete. Namespace and secrets preserved."
  echo ""
  info "Remaining secrets:"
  kubectl get secrets -n "$NAMESPACE" --no-headers 2>/dev/null | grep -v '^sh.helm' | awk '{print "  " $1}'
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

  # Agents
  cmd_teardown_agents

  # Infrastructure — Helm releases
  for release in qdrant postgresql redis; do
    if helm status "$release" -n "$NAMESPACE" &>/dev/null; then
      helm uninstall "$release" -n "$NAMESPACE"
      log "Removed: $release"
    fi
  done

  # Infrastructure — LiteLLM (plain manifest, not Helm)
  if kubectl get deployment litellm -n "$NAMESPACE" &>/dev/null; then
    kubectl delete -n "$NAMESPACE" -f "$INFRA_DIR/litellm-deployment.yaml" 2>/dev/null || \
      kubectl delete deployment,svc -n "$NAMESPACE" -l app=litellm
    kubectl delete configmap litellm-config -n "$NAMESPACE" 2>/dev/null || true
    log "Removed: litellm"
  fi

  # Namespace (takes everything with it)
  warn "Deleting namespace $NAMESPACE (this removes all remaining resources)..."
  kubectl delete namespace "$NAMESPACE" --timeout=120s
  log "Namespace $NAMESPACE deleted."
}

# ─── Main ────────────────────────────────────────────────────────────────

case "${1:-}" in
  setup)
    cmd_setup
    ;;
  infra)
    cmd_infra
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
    echo "  infra              Deploy Redis, Qdrant, PostgreSQL, LiteLLM"
    echo "  agents             Deploy agents (Nova + Buster)"
    echo "  agent <name>       Deploy single agent (nova|buster)"
    echo "  all                Full deployment (setup + infra + agents)"
    echo "  status             Show all pods, services, PVCs"
    echo "  teardown           Remove agents + infra, keep namespace + secrets"
    echo "  teardown-agents    Remove agents only, keep infra"
    echo "  teardown-all       DESTROY namespace and everything in it"
    echo ""
    echo "Environment:"
    echo "  NAMESPACE=$NAMESPACE"
    exit 1
    ;;
esac
