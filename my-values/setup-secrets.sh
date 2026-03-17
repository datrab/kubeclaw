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

sops_get() {
  sops --decrypt --extract "[\"$1\"]" "$SOPS_FILE" 2>/dev/null || {
    err "Failed to read '$1' from SOPS"; return 1
  }
}

copy_secret() {
  if kubectl get secret "$1" -n "$SRC_NS" &>/dev/null; then
    kubectl get secret "$1" -n "$SRC_NS" -o yaml \
      | sed "s/namespace: ${SRC_NS}/namespace: ${NAMESPACE}/" \
      | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    log "Copied: $1"
  else
    warn "Not found in ${SRC_NS}: $1"
  fi
}

echo "Setting up secrets for namespace: $NAMESPACE"
echo ""

# ── Shared secret (from SOPS or copy) ──
if [[ -f "$SOPS_FILE" ]]; then
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
if kubectl get secret litellm-secrets -n "$NAMESPACE" &>/dev/null; then
  OLD_URL=$(kubectl get secret litellm-secrets -n "$NAMESPACE" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
  if echo "$OLD_URL" | grep -q "${SRC_NS}"; then
    NEW_URL=$(echo "$OLD_URL" | sed "s/${SRC_NS}/${NAMESPACE}/g")
    kubectl get secret litellm-secrets -n "$NAMESPACE" -o json \
      | jq --arg val "$(echo -n "$NEW_URL" | base64 -w0)" '.data.DATABASE_URL = $val' \
      | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    log "Fixed DATABASE_URL: ${SRC_NS} → ${NAMESPACE}"
  else
    log "DATABASE_URL already correct (no ${SRC_NS} reference)"
  fi
fi

copy_secret "google-sa-key"
copy_secret "ghcr-secret"
copy_secret "git-deploy-key-nova"
copy_secret "git-deploy-key-buster"

echo ""
log "Done. Secrets in $NAMESPACE:"
kubectl get secrets -n "$NAMESPACE" --no-headers | awk '{print "  " $1}'
