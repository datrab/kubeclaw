#!/usr/bin/env bash
# =============================================================================
# Personal: Setup secrets for kubeclaw namespace
# =============================================================================
# Copies secrets from default namespace and/or creates from SOPS.
# This file is in my-values/ and git-ignored — it's personal config.
#
# Usage: ./my-values/setup-secrets.sh
# =============================================================================
set -euo pipefail

NAMESPACE="${NAMESPACE:-kubeclaw}"
SRC_NS="${SRC_NS:-default}"
SOPS_FILE="${SOPS_FILE:-$HOME/openclaw-swarm/ansible/group_vars/production/secrets.yml}"
SECRET_NAME="openclaw-shared-secrets"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

is_not_found_error() {
  local text="$1"
  [[ "$text" =~ [Nn]ot[Ff]ound|[Nn]ot\ [Ff]ound|not\ found|No\ resources\ found ]]
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command not found: $1"
    return 1
  fi
}

sops_get() {
  local key="$1"
  local err_file

  err_file="$(mktemp)"
  if sops --decrypt --extract "[\"$key\"]" "$SOPS_FILE" 2>"$err_file"; then
    rm -f "$err_file"
    return 0
  fi

  err "Failed to read '$key' from SOPS file: $SOPS_FILE"
  if [[ -s "$err_file" ]]; then
    sed 's/^/  /' "$err_file" >&2
  fi
  rm -f "$err_file"
  return 1
}

copy_secret() {
  local name="$1"
  local output

  if output=$(kubectl get secret "$name" -n "$SRC_NS" 2>&1); then
    kubectl get secret "$name" -n "$SRC_NS" -o yaml \
      | sed "s/namespace: ${SRC_NS}/namespace: ${NAMESPACE}/" \
      | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    log "Copied: $name"
    return 0
  fi

  if is_not_found_error "$output"; then
    warn "Optional source secret not found in ${SRC_NS}: $name"
    return 0
  fi

  err "Failed to check source secret '$name' in namespace '$SRC_NS'"
  echo "$output" >&2
  return 1
}

echo "Setting up secrets for namespace: $NAMESPACE"
echo ""

require_command kubectl

# ── Shared secret (from SOPS or copy) ──
if [[ -f "$SOPS_FILE" ]]; then
  require_command sops
  info "Creating $SECRET_NAME from SOPS..."
  kubectl create secret generic "$SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-literal="gatewayToken-forge=$(sops_get openclaw_gateway_token_forge)" \
    --from-literal="gatewayToken-echo=$(sops_get openclaw_gateway_token_echo)" \
    --from-literal="gatewayToken-buster=$(sops_get openclaw_gateway_token_buster)" \
    --from-literal="gatewayToken-nova=$(sops_get openclaw_gateway_token_nova)" \
    --from-literal="litellmApiKey=$(sops_get litellm_master_key)" \
    --from-literal="discordToken-forge=$(sops_get forge_discord_secret)" \
    --from-literal="discordToken-echo=$(sops_get echo_discord_secret)" \
    --from-literal="discordToken-buster=$(sops_get buster_discord_secret)" \
    --from-literal="discordToken-nova=$(sops_get nova_discord_secret)" \
    --from-literal="discordWebhook=$(sops_get swarm_log_webhook)" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f -
  log "Created: $SECRET_NAME"
else
  warn "SOPS not found ($SOPS_FILE) — copying from $SRC_NS"
  copy_secret "$SECRET_NAME"
fi

# ── File-based secrets ──
info "Copying remaining secrets from $SRC_NS..."
copy_secret "redis-secrets"
copy_secret "postgresql-secrets"
copy_secret "litellm-secrets"

# Fix DATABASE_URL in litellm-secrets: rewrite namespace reference
if litellm_check=$(kubectl get secret litellm-secrets -n "$NAMESPACE" 2>&1); then
  OLD_URL=$(kubectl get secret litellm-secrets -n "$NAMESPACE" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
  if echo "$OLD_URL" | grep -q "${SRC_NS}"; then
    require_command jq
    NEW_URL=$(echo "$OLD_URL" | sed "s/${SRC_NS}/${NAMESPACE}/g")
    kubectl get secret litellm-secrets -n "$NAMESPACE" -o json \
      | jq --arg val "$(echo -n "$NEW_URL" | base64 -w0)" '.data.DATABASE_URL = $val' \
      | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    log "Fixed DATABASE_URL: ${SRC_NS} → ${NAMESPACE}"
  else
    log "DATABASE_URL already correct (no ${SRC_NS} reference)"
  fi
elif is_not_found_error "$litellm_check"; then
  warn "litellm-secrets not present in $NAMESPACE; skipping DATABASE_URL namespace rewrite."
else
  err "Failed to check litellm-secrets in namespace '$NAMESPACE'"
  echo "$litellm_check" >&2
  exit 1
fi

copy_secret "google-sa-key"
copy_secret "ghcr-secret"
copy_secret "git-deploy-key-nova"
copy_secret "git-deploy-key-buster"

echo ""
log "Done. Secrets in $NAMESPACE:"
kubectl get secrets -n "$NAMESPACE" --no-headers | awk '{print "  " $1}'
