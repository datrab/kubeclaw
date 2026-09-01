#!/usr/bin/env bash
# =============================================================================
# Personal: Setup secrets for kubeclaw namespace
# =============================================================================
# Creates required Kubernetes Secrets from one of:
#   1. existing target namespace Secrets
#   2. SOPS file
#   3. source namespace copies
#   4. interactive operator prompts
#
# Usage:
#   ./my-values/setup-secrets.sh
#
# Environment:
#   NAMESPACE                         Target app namespace (default: kubeclaw)
#   SRC_NS                            Namespace to copy existing app Secrets from (default: default)
#   KUBECLAW_SECRET_SETUP_MODE        auto|interactive|noninteractive (default: auto)
#   KUBECLAW_SECRETS_OVERWRITE        true|false (default: false)
#   TAILSCALE_OPERATOR_NAMESPACE      Tailscale namespace (default: tailscale)
#   TAILSCALE_OAUTH_CLIENT_ID         Optional bootstrap value for tailscale/operator-oauth
#   TAILSCALE_OAUTH_CLIENT_SECRET     Optional bootstrap value for tailscale/operator-oauth
#   KUBECLAW_DEPLOY_POSTGRESQL        true|false (default: true)
#   KUBECLAW_DEPLOY_QDRANT            true|false (default: true; no Secret required)
#   KUBECLAW_DEPLOY_LITELLM           true|false (default: true)
#   TAILSCALE_OPERATOR_ENABLED        true|false (default: true)
# =============================================================================
set -euo pipefail

NAMESPACE="${NAMESPACE:-kubeclaw}"
SRC_NS="${SRC_NS:-default}"
TAILSCALE_OPERATOR_NAMESPACE="${TAILSCALE_OPERATOR_NAMESPACE:-tailscale}"
TAILSCALE_OAUTH_SECRET_NAME="${TAILSCALE_OAUTH_SECRET_NAME:-operator-oauth}"
SOPS_FILE="${SOPS_FILE:-$HOME/openclaw-swarm/ansible/group_vars/production/secrets.yml}"
SECRET_NAME="openclaw-shared-secrets"
SECRET_SETUP_MODE="${KUBECLAW_SECRET_SETUP_MODE:-auto}"
SECRETS_OVERWRITE="${KUBECLAW_SECRETS_OVERWRITE:-false}"
KUBECLAW_DEPLOY_POSTGRESQL="${KUBECLAW_DEPLOY_POSTGRESQL:-true}"
KUBECLAW_DEPLOY_QDRANT="${KUBECLAW_DEPLOY_QDRANT:-true}"
KUBECLAW_DEPLOY_LITELLM="${KUBECLAW_DEPLOY_LITELLM:-true}"
TAILSCALE_OPERATOR_ENABLED="${TAILSCALE_OPERATOR_ENABLED:-true}"
POSTGRES_LITELLM_PASSWORD=""
SHARED_LITELLM_API_KEY=""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

TMP_FILES=()
cleanup_tmp_files() {
  local file
  for file in "${TMP_FILES[@]}"; do
    if [[ -n $file && -f $file ]]; then
      rm -f "$file"
    fi
  done
}
trap cleanup_tmp_files EXIT

is_not_found_error() {
  local text="$1"
  [[ $text =~ [Nn]ot[Ff]ound|[Nn]ot\ [Ff]ound|not\ found|No\ resources\ found ]]
}

normalize_boolish() {
  local value
  value="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1 | true | yes | on | enabled) echo "true" ;;
    0 | false | no | off | disabled) echo "false" ;;
    *) echo "$value" ;;
  esac
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command not found: $1"
    return 1
  fi
}

component_enabled() {
  local value
  value="$(normalize_boolish "$1")"
  [[ $value == "true" ]]
}

interactive_enabled() {
  local mode
  mode="$(normalize_boolish "$SECRET_SETUP_MODE")"

  case "$mode" in
    interactive | true) [[ -r /dev/tty && -w /dev/tty ]] ;;
    noninteractive | false) return 1 ;;
    auto) [[ -r /dev/tty && -w /dev/tty ]] ;;
    *)
      err "Invalid KUBECLAW_SECRET_SETUP_MODE='$SECRET_SETUP_MODE' (expected auto, interactive, or noninteractive)"
      exit 1
      ;;
  esac
}

secret_exists() {
  local namespace="$1"
  local name="$2"
  local output

  if output=$(kubectl get secret "$name" -n "$namespace" 2>&1); then
    return 0
  fi

  if is_not_found_error "$output"; then
    return 1
  fi

  err "Failed to check secret '${namespace}/${name}'"
  echo "$output" >&2
  exit 1
}

target_secret_ready() {
  local name="$1"
  local status

  if secret_exists "$NAMESPACE" "$name"; then
    if [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" == "true" ]]; then
      warn "Overwriting existing Secret: ${NAMESPACE}/${name}"
      return 1
    fi
    log "Using existing Secret: ${NAMESPACE}/${name}"
    return 0
  fi
  status=$?
  if [[ $status == "2" ]]; then
    exit 1
  fi
  return 1
}

operator_secret_ready() {
  local name="$1"
  local status

  if secret_exists "$TAILSCALE_OPERATOR_NAMESPACE" "$name"; then
    if [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" == "true" ]]; then
      warn "Overwriting existing Secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${name}"
      return 1
    fi
    log "Using existing Secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${name}"
    return 0
  fi
  status=$?
  if [[ $status == "2" ]]; then
    exit 1
  fi
  return 1
}

load_secret_key() {
  local namespace="$1"
  local name="$2"
  local key="$3"
  local out_var="$4"
  local encoded

  if encoded=$(kubectl get secret "$name" -n "$namespace" -o "go-template={{ with index .data \"$key\" }}{{ . }}{{ end }}" 2>&1); then
    if [[ -z $encoded ]]; then
      return 1
    fi
    printf -v "$out_var" '%s' "$(printf '%s' "$encoded" | base64 -d)"
    return 0
  fi

  if is_not_found_error "$encoded"; then
    return 1
  fi

  err "Failed to read key '$key' from Secret '${namespace}/${name}'"
  echo "$encoded" >&2
  return 2
}

secret_key_present() {
  local namespace="$1"
  local name="$2"
  local key="$3"
  local encoded

  if encoded=$(kubectl get secret "$name" -n "$namespace" -o "go-template={{ with index .data \"$key\" }}{{ . }}{{ end }}" 2>&1); then
    [[ -n $encoded ]]
    return
  fi

  if is_not_found_error "$encoded"; then
    return 1
  fi

  err "Failed to read key '$key' from Secret '${namespace}/${name}'"
  echo "$encoded" >&2
  exit 1
}

secret_missing_keys() {
  local namespace="$1"
  local name="$2"
  shift 2
  local key
  local missing=()

  for key in "$@"; do
    if ! secret_key_present "$namespace" "$name" "$key"; then
      missing+=("$key")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf '%s\n' "${missing[@]}"
  fi
}

join_by_comma() {
  local joined=""
  local item

  for item in "$@"; do
    if [[ -z $joined ]]; then
      joined="$item"
    else
      joined="${joined}, ${item}"
    fi
  done
  printf '%s' "$joined"
}

patch_secret_literal() {
  local namespace="$1"
  local name="$2"
  local key="$3"
  local value="$4"
  local encoded

  encoded="$(printf '%s' "$value" | base64 -w0)"
  kubectl patch secret "$name" -n "$namespace" --type merge -p "{\"data\":{\"$key\":\"$encoded\"}}" >/dev/null
}

patch_secret_file() {
  local namespace="$1"
  local name="$2"
  local key="$3"
  local path="$4"
  local encoded

  encoded="$(base64 -w0 "$path")"
  kubectl patch secret "$name" -n "$namespace" --type merge -p "{\"data\":{\"$key\":\"$encoded\"}}" >/dev/null
}

existing_secret_complete() {
  local namespace="$1"
  local name="$2"
  shift 2
  local missing
  mapfile -t missing < <(secret_missing_keys "$namespace" "$name" "$@")

  if [[ ${#missing[@]} == "0" ]]; then
    log "Using existing Secret: ${namespace}/${name}"
    return 0
  fi

  warn "Secret ${namespace}/${name} exists but is missing keys: $(join_by_comma "${missing[@]}")"
  return 1
}

sops_get() {
  local key="$1"
  local err_file

  err_file="$(mktemp)"
  TMP_FILES+=("$err_file")
  if sops --decrypt --extract "[\"$key\"]" "$SOPS_FILE" 2>"$err_file"; then
    rm -f "$err_file"
    return 0
  fi

  err "Failed to read '$key' from SOPS file: $SOPS_FILE"
  if [[ -s $err_file ]]; then
    sed 's/^/  /' "$err_file" >&2
  fi
  rm -f "$err_file"
  return 1
}

sops_get_first() {
  local key
  local err_file

  for key in "$@"; do
    err_file="$(mktemp)"
    TMP_FILES+=("$err_file")
    if sops --decrypt --extract "[\"$key\"]" "$SOPS_FILE" 2>"$err_file"; then
      rm -f "$err_file"
      return 0
    fi
    rm -f "$err_file"
  done

  err "None of these keys were readable from SOPS file '$SOPS_FILE': $*"
  return 1
}

copy_secret_from_source() {
  local name="$1"
  local target_namespace="${2:-$NAMESPACE}"
  local source_name="${3:-$name}"
  local output

  if output=$(kubectl get secret "$source_name" -n "$SRC_NS" 2>&1); then
    kubectl get secret "$source_name" -n "$SRC_NS" -o yaml |
      sed "s/namespace: ${SRC_NS}/namespace: ${target_namespace}/" |
      kubectl apply -n "$target_namespace" -f - >/dev/null
    log "Copied: ${target_namespace}/${name}"
    return 0
  fi

  if is_not_found_error "$output"; then
    warn "Optional source secret not found in ${SRC_NS}: $source_name"
    return 2
  fi

  err "Failed to check source secret '$source_name' in namespace '$SRC_NS'"
  echo "$output" >&2
  exit 1
}

generate_secret_value() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  head -c 32 /dev/urandom | base64 | tr -d '\n'
  echo ""
}

prompt_hidden() {
  local prompt="$1"
  local out_var="$2"
  local input_value=""

  read -r -s -p "$prompt: " input_value </dev/tty
  echo "" >/dev/tty
  printf -v "$out_var" '%s' "$input_value"
}

prompt_plain() {
  local prompt="$1"
  local out_var="$2"
  local input_value=""

  read -r -p "$prompt: " input_value </dev/tty
  printf -v "$out_var" '%s' "$input_value"
}

prompt_secret_required() {
  local prompt="$1"
  local out_var="$2"
  local captured_value=""

  while true; do
    prompt_hidden "$prompt" captured_value
    if [[ -n $captured_value ]]; then
      printf -v "$out_var" '%s' "$captured_value"
      return 0
    fi
    warn "Value is required. Press Ctrl-C to stop setup if you need to fetch it."
  done
}

prompt_secret_or_generate() {
  local prompt="$1"
  local out_var="$2"
  local captured_value=""

  prompt_hidden "$prompt (blank = generate)" captured_value
  if [[ -z $captured_value ]]; then
    captured_value="$(generate_secret_value)"
    log "Generated secret value for: $prompt"
  fi
  printf -v "$out_var" '%s' "$captured_value"
}

prompt_file_or_paste() {
  local prompt="$1"
  local out_var="$2"
  local path
  local tmp_file
  local line

  prompt_plain "$prompt file path (blank = paste, finish with EOF on its own line)" path
  if [[ -n $path ]]; then
    if [[ ! -f $path ]]; then
      err "File not found: $path"
      return 1
    fi
    printf -v "$out_var" '%s' "$path"
    return 0
  fi

  tmp_file="$(mktemp)"
  TMP_FILES+=("$tmp_file")
  info "Paste $prompt now. Finish with a line containing only EOF."
  while IFS= read -r line </dev/tty; do
    if [[ $line == "EOF" ]]; then
      break
    fi
    printf '%s\n' "$line" >>"$tmp_file"
  done

  if [[ ! -s $tmp_file ]]; then
    err "$prompt was empty"
    return 1
  fi

  printf -v "$out_var" '%s' "$tmp_file"
}

create_namespace_if_needed() {
  local namespace="$1"
  kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
}

create_shared_secret_from_sops() {
  local kubectl_args
  require_command sops
  info "Creating $SECRET_NAME from SOPS..."

  kubectl_args=(
    create secret generic "$SECRET_NAME"
    --namespace "$NAMESPACE"
    --from-literal="gatewayToken-forge=$(sops_get openclaw_gateway_token_forge)"
    --from-literal="gatewayToken-echo=$(sops_get openclaw_gateway_token_echo)"
    --from-literal="gatewayToken-buster=$(sops_get openclaw_gateway_token_buster)"
    --from-literal="busterV2Token=$(sops_get buster_v2_token)"
    --from-literal="gatewayToken-nova=$(sops_get openclaw_gateway_token_nova)"
    --from-literal="gatewayToken-prism=$(sops_get openclaw_gateway_token_prism 2>/dev/null || generate_secret_value)"
    --from-literal="anthropicApiKey=$(sops_get_first anthropic_api_key claude_code_oauth_token anthropicApiKey)"
    --from-literal="stitchApiKey=$(sops_get_first stitch_api_key stitchApiKey)"
    --from-literal="discordToken-forge=$(sops_get forge_discord_secret)"
    --from-literal="discordToken-echo=$(sops_get echo_discord_secret)"
    --from-literal="discordToken-buster=$(sops_get buster_discord_secret)"
    --from-literal="discordToken-nova=$(sops_get nova_discord_secret)"
    --from-literal="discordWebhook=$(sops_get swarm_log_webhook)"
  )

  if component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    kubectl_args+=(--from-literal="litellmApiKey=$(sops_get litellm_master_key)")
  fi
  kubectl_args+=(--dry-run=client -o yaml)

  kubectl "${kubectl_args[@]}" | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: $SECRET_NAME"
}

create_shared_secret_interactive() {
  local gateway_forge gateway_echo gateway_buster gateway_nova gateway_prism buster_v2_token
  local anthropic_api_key stitch_api_key litellm_api_key
  local discord_forge discord_echo discord_buster discord_nova discord_webhook

  header "Secret: ${NAMESPACE}/${SECRET_NAME}"
  info "Paste required OpenClaw, model, Discord, and gateway values. Blank gateway/LiteLLM values are generated."

  prompt_secret_or_generate "OpenClaw gateway token for Forge" gateway_forge
  prompt_secret_or_generate "OpenClaw gateway token for Echo" gateway_echo
  prompt_secret_or_generate "OpenClaw gateway token for Buster" gateway_buster
  prompt_secret_or_generate "Buster v2 worker token" buster_v2_token
  prompt_secret_or_generate "OpenClaw gateway token for Nova" gateway_nova
  prompt_secret_or_generate "OpenClaw gateway token for Prism" gateway_prism
  prompt_secret_required "Anthropic/Claude credential for agents" anthropic_api_key
  prompt_secret_required "Stitch API key" stitch_api_key
  if component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    prompt_secret_or_generate "LiteLLM master key" litellm_api_key
  else
    litellm_api_key="$(generate_secret_value)"
  fi
  prompt_secret_required "Discord bot token for Forge" discord_forge
  prompt_secret_required "Discord bot token for Echo" discord_echo
  prompt_secret_required "Discord bot token for Buster" discord_buster
  prompt_secret_required "Discord bot token for Nova" discord_nova
  prompt_secret_required "Discord webhook URL" discord_webhook

  kubectl create secret generic "$SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-literal="gatewayToken-forge=$gateway_forge" \
    --from-literal="gatewayToken-echo=$gateway_echo" \
    --from-literal="gatewayToken-buster=$gateway_buster" \
    --from-literal="busterV2Token=$buster_v2_token" \
    --from-literal="gatewayToken-nova=$gateway_nova" \
    --from-literal="gatewayToken-prism=$gateway_prism" \
    --from-literal="anthropicApiKey=$anthropic_api_key" \
    --from-literal="stitchApiKey=$stitch_api_key" \
    --from-literal="litellmApiKey=$litellm_api_key" \
    --from-literal="discordToken-forge=$discord_forge" \
    --from-literal="discordToken-echo=$discord_echo" \
    --from-literal="discordToken-buster=$discord_buster" \
    --from-literal="discordToken-nova=$discord_nova" \
    --from-literal="discordWebhook=$discord_webhook" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/${SECRET_NAME}"
}

patch_shared_secret_interactive() {
  local key value

  header "Secret keys: ${NAMESPACE}/${SECRET_NAME}"
  info "Only missing keys will be added."

  for key in "$@"; do
    case "$key" in
      gatewayToken-forge) prompt_secret_or_generate "OpenClaw gateway token for Forge" value ;;
      gatewayToken-echo) prompt_secret_or_generate "OpenClaw gateway token for Echo" value ;;
      gatewayToken-buster) prompt_secret_or_generate "OpenClaw gateway token for Buster" value ;;
      busterV2Token) prompt_secret_or_generate "Buster v2 worker token" value ;;
      gatewayToken-nova) prompt_secret_or_generate "OpenClaw gateway token for Nova" value ;;
      gatewayToken-prism) prompt_secret_or_generate "OpenClaw gateway token for Prism" value ;;
      anthropicApiKey) prompt_secret_required "Anthropic/Claude credential for agents" value ;;
      stitchApiKey) prompt_secret_required "Stitch API key" value ;;
      litellmApiKey) prompt_secret_or_generate "LiteLLM master key" value ;;
      discordToken-forge) prompt_secret_required "Discord bot token for Forge" value ;;
      discordToken-echo) prompt_secret_required "Discord bot token for Echo" value ;;
      discordToken-buster) prompt_secret_required "Discord bot token for Buster" value ;;
      discordToken-nova) prompt_secret_required "Discord bot token for Nova" value ;;
      discordWebhook) prompt_secret_required "Discord webhook URL" value ;;
      *)
        err "Unknown openclaw-shared-secrets key: $key"
        return 1
        ;;
    esac
    patch_secret_literal "$NAMESPACE" "$SECRET_NAME" "$key" "$value"
    log "Added key: ${SECRET_NAME}/${key}"
  done
}

setup_shared_secret() {
  local required_keys
  required_keys=(
    gatewayToken-forge
    gatewayToken-echo
    gatewayToken-buster
    busterV2Token
    gatewayToken-nova
    gatewayToken-prism
    anthropicApiKey
    stitchApiKey
    discordToken-forge
    discordToken-echo
    discordToken-buster
    discordToken-nova
    discordWebhook
  )
  local missing

  if component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    required_keys+=(litellmApiKey)
  fi

  if secret_exists "$NAMESPACE" "$SECRET_NAME" && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" "$SECRET_NAME" "${required_keys[@]}")
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/${SECRET_NAME}"
    elif interactive_enabled; then
      warn "Secret ${NAMESPACE}/${SECRET_NAME} exists but is missing keys: $(join_by_comma "${missing[@]}")"
      patch_shared_secret_interactive "${missing[@]}"
    else
      warn "Secret ${NAMESPACE}/${SECRET_NAME} is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    if component_enabled "$KUBECLAW_DEPLOY_LITELLM" && ! load_secret_key "$NAMESPACE" "$SECRET_NAME" litellmApiKey SHARED_LITELLM_API_KEY; then
      warn "Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value."
    fi
    return 0
  fi

  if [[ -f $SOPS_FILE ]]; then
    create_shared_secret_from_sops
    if component_enabled "$KUBECLAW_DEPLOY_LITELLM" && ! load_secret_key "$NAMESPACE" "$SECRET_NAME" litellmApiKey SHARED_LITELLM_API_KEY; then
      warn "Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value."
    fi
    return 0
  fi

  if copy_secret_from_source "$SECRET_NAME"; then
    if component_enabled "$KUBECLAW_DEPLOY_LITELLM" && ! load_secret_key "$NAMESPACE" "$SECRET_NAME" litellmApiKey SHARED_LITELLM_API_KEY; then
      warn "Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value."
    fi
    return 0
  fi

  if interactive_enabled; then
    create_shared_secret_interactive
    if component_enabled "$KUBECLAW_DEPLOY_LITELLM" && ! load_secret_key "$NAMESPACE" "$SECRET_NAME" litellmApiKey SHARED_LITELLM_API_KEY; then
      warn "Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value."
    fi
    return 0
  fi

  warn "Missing required Secret: ${NAMESPACE}/${SECRET_NAME}"
  warn "Run with KUBECLAW_SECRET_SETUP_MODE=interactive to paste values, or create/copy the Secret before deployment."
}

setup_pipeline_source_attestation_secret() {
  local name="pipeline-test-gate-source-attestation"
  local private_file public_file temporary
  if secret_exists "$NAMESPACE" "$name" && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    local missing
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" "$name" privateKey publicKey)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/${name}"
      return 0
    fi
    warn "Repairing Secret ${NAMESPACE}/${name}; missing keys: $(join_by_comma "${missing[@]}")"
  fi
  if copy_secret_from_source "$name"; then
    local copied_missing
    mapfile -t copied_missing < <(secret_missing_keys "$NAMESPACE" "$name" privateKey publicKey)
    if [[ ${#copied_missing[@]} == "0" ]]; then
      return 0
    fi
    warn "Replacing incomplete copied Secret ${NAMESPACE}/${name}; missing keys: $(join_by_comma "${copied_missing[@]}")"
  fi
  require_command openssl
  temporary="$(mktemp -d)"
  private_file="$temporary/private.pem"
  public_file="$temporary/public.pem"
  trap 'rm -rf "${temporary:-}"' RETURN
  openssl genpkey -algorithm ED25519 -out "$private_file"
  openssl pkey -in "$private_file" -pubout -out "$public_file"
  chmod 0600 "$private_file" "$public_file"
  kubectl create secret generic "$name" \
    --namespace "$NAMESPACE" \
    --from-file="privateKey=$private_file" \
    --from-file="publicKey=$public_file" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  rm -rf "$temporary"
  trap - RETURN
  log "Created: ${NAMESPACE}/${name}"
}

setup_redis_secret() {
  local redis_password
  local missing

  if secret_exists "$NAMESPACE" redis-secrets && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" redis-secrets redis-password)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/redis-secrets"
    elif interactive_enabled; then
      warn "Secret ${NAMESPACE}/redis-secrets exists but is missing keys: $(join_by_comma "${missing[@]}")"
      prompt_secret_or_generate "Redis password" redis_password
      patch_secret_literal "$NAMESPACE" redis-secrets redis-password "$redis_password"
      log "Added key: redis-secrets/redis-password"
    else
      warn "Secret ${NAMESPACE}/redis-secrets is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    return 0
  fi
  if copy_secret_from_source redis-secrets; then
    return 0
  fi
  if ! interactive_enabled; then
    warn "Missing required Secret: ${NAMESPACE}/redis-secrets"
    return 0
  fi

  header "Secret: ${NAMESPACE}/redis-secrets"
  prompt_secret_or_generate "Redis password" redis_password
  kubectl create secret generic redis-secrets \
    --namespace "$NAMESPACE" \
    --from-literal="redis-password=$redis_password" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/redis-secrets"
}

setup_postgresql_secret() {
  local postgres_password litellm_password
  local missing key

  if secret_exists "$NAMESPACE" postgresql-secrets && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" postgresql-secrets postgres-password litellm-password)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/postgresql-secrets"
    elif interactive_enabled; then
      warn "Secret ${NAMESPACE}/postgresql-secrets exists but is missing keys: $(join_by_comma "${missing[@]}")"
      for key in "${missing[@]}"; do
        case "$key" in
          postgres-password)
            prompt_secret_or_generate "PostgreSQL admin password" postgres_password
            patch_secret_literal "$NAMESPACE" postgresql-secrets postgres-password "$postgres_password"
            ;;
          litellm-password)
            prompt_secret_or_generate "PostgreSQL litellm user password" litellm_password
            POSTGRES_LITELLM_PASSWORD="$litellm_password"
            patch_secret_literal "$NAMESPACE" postgresql-secrets litellm-password "$litellm_password"
            ;;
        esac
        log "Added key: postgresql-secrets/${key}"
      done
    else
      warn "Secret ${NAMESPACE}/postgresql-secrets is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    if ! load_secret_key "$NAMESPACE" postgresql-secrets litellm-password POSTGRES_LITELLM_PASSWORD; then
      warn "Secret ${NAMESPACE}/postgresql-secrets is missing litellm-password; LiteLLM setup may prompt or generate a separate value."
    fi
    return 0
  fi
  if copy_secret_from_source postgresql-secrets; then
    if ! load_secret_key "$NAMESPACE" postgresql-secrets litellm-password POSTGRES_LITELLM_PASSWORD; then
      warn "Secret ${NAMESPACE}/postgresql-secrets is missing litellm-password; LiteLLM setup may prompt or generate a separate value."
    fi
    return 0
  fi
  if ! interactive_enabled; then
    warn "Missing required Secret: ${NAMESPACE}/postgresql-secrets"
    return 0
  fi

  header "Secret: ${NAMESPACE}/postgresql-secrets"
  prompt_secret_or_generate "PostgreSQL admin password" postgres_password
  prompt_secret_or_generate "PostgreSQL litellm user password" litellm_password
  POSTGRES_LITELLM_PASSWORD="$litellm_password"
  kubectl create secret generic postgresql-secrets \
    --namespace "$NAMESPACE" \
    --from-literal="postgres-password=$postgres_password" \
    --from-literal="litellm-password=$litellm_password" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/postgresql-secrets"
}

setup_litellm_secret() {
  local litellm_master_key litellm_password database_url
  local missing key

  if secret_exists "$NAMESPACE" litellm-secrets && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" litellm-secrets LITELLM_MASTER_KEY DATABASE_URL)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/litellm-secrets"
    elif interactive_enabled; then
      warn "Secret ${NAMESPACE}/litellm-secrets exists but is missing keys: $(join_by_comma "${missing[@]}")"
      for key in "${missing[@]}"; do
        case "$key" in
          LITELLM_MASTER_KEY)
            if [[ -n $SHARED_LITELLM_API_KEY ]]; then
              litellm_master_key="$SHARED_LITELLM_API_KEY"
              log "Using LiteLLM master key from ${NAMESPACE}/${SECRET_NAME}: litellmApiKey"
            else
              prompt_secret_or_generate "LiteLLM master key" litellm_master_key
            fi
            patch_secret_literal "$NAMESPACE" litellm-secrets LITELLM_MASTER_KEY "$litellm_master_key"
            ;;
          DATABASE_URL)
            if ! component_enabled "$KUBECLAW_DEPLOY_POSTGRESQL"; then
              prompt_secret_required "LiteLLM DATABASE_URL" database_url
            elif [[ -n $POSTGRES_LITELLM_PASSWORD ]]; then
              litellm_password="$POSTGRES_LITELLM_PASSWORD"
              log "Using PostgreSQL litellm password from ${NAMESPACE}/postgresql-secrets"
              database_url="postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm"
            else
              prompt_secret_or_generate "PostgreSQL litellm user password for LiteLLM DATABASE_URL" litellm_password
              database_url="postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm"
            fi
            patch_secret_literal "$NAMESPACE" litellm-secrets DATABASE_URL "$database_url"
            ;;
        esac
        log "Added key: litellm-secrets/${key}"
      done
    else
      warn "Secret ${NAMESPACE}/litellm-secrets is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    return 0
  fi
  if copy_secret_from_source litellm-secrets; then
    return 0
  fi
  if ! interactive_enabled; then
    warn "Missing required Secret: ${NAMESPACE}/litellm-secrets"
    return 0
  fi

  header "Secret: ${NAMESPACE}/litellm-secrets"
  if [[ -n $SHARED_LITELLM_API_KEY ]]; then
    litellm_master_key="$SHARED_LITELLM_API_KEY"
    log "Using LiteLLM master key from ${NAMESPACE}/${SECRET_NAME}: litellmApiKey"
  else
    prompt_secret_or_generate "LiteLLM master key" litellm_master_key
  fi
  if ! component_enabled "$KUBECLAW_DEPLOY_POSTGRESQL"; then
    prompt_secret_required "LiteLLM DATABASE_URL" database_url
  elif [[ -n $POSTGRES_LITELLM_PASSWORD ]]; then
    litellm_password="$POSTGRES_LITELLM_PASSWORD"
    log "Using PostgreSQL litellm password from ${NAMESPACE}/postgresql-secrets"
    database_url="postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm"
  else
    prompt_secret_or_generate "PostgreSQL litellm user password for LiteLLM DATABASE_URL" litellm_password
    database_url="postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm"
  fi
  kubectl create secret generic litellm-secrets \
    --namespace "$NAMESPACE" \
    --from-literal="LITELLM_MASTER_KEY=$litellm_master_key" \
    --from-literal="DATABASE_URL=$database_url" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/litellm-secrets"
}

rewrite_litellm_database_url_namespace() {
  local litellm_check old_url new_url

  if litellm_check=$(kubectl get secret litellm-secrets -n "$NAMESPACE" 2>&1); then
    old_url=$(kubectl get secret litellm-secrets -n "$NAMESPACE" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
    if echo "$old_url" | grep -q "${SRC_NS}"; then
      require_command jq
      new_url=$(echo "$old_url" | sed "s/${SRC_NS}/${NAMESPACE}/g")
      kubectl get secret litellm-secrets -n "$NAMESPACE" -o json |
        jq --arg val "$(echo -n "$new_url" | base64 -w0)" '.data.DATABASE_URL = $val' |
        kubectl apply -n "$NAMESPACE" -f - >/dev/null
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
}

setup_google_sa_key() {
  local credentials_file
  local missing

  if secret_exists "$NAMESPACE" google-sa-key && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" google-sa-key credentials.json)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/google-sa-key"
    elif interactive_enabled; then
      warn "Secret ${NAMESPACE}/google-sa-key exists but is missing keys: $(join_by_comma "${missing[@]}")"
      prompt_file_or_paste "Google service account JSON" credentials_file
      patch_secret_file "$NAMESPACE" google-sa-key credentials.json "$credentials_file"
      log "Added key: google-sa-key/credentials.json"
    else
      warn "Secret ${NAMESPACE}/google-sa-key is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    return 0
  fi
  if copy_secret_from_source google-sa-key; then
    return 0
  fi
  if ! interactive_enabled; then
    warn "Missing required Secret: ${NAMESPACE}/google-sa-key"
    return 0
  fi

  header "Secret: ${NAMESPACE}/google-sa-key"
  prompt_file_or_paste "Google service account JSON" credentials_file
  kubectl create secret generic google-sa-key \
    --namespace "$NAMESPACE" \
    --from-file="credentials.json=$credentials_file" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/google-sa-key"
}

setup_ghcr_secret() {
  local username token email
  local missing

  if secret_exists "$NAMESPACE" ghcr-secret && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" ghcr-secret .dockerconfigjson)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/ghcr-secret"
      return 0
    fi
    if ! interactive_enabled; then
      warn "Secret ${NAMESPACE}/ghcr-secret is missing keys: $(join_by_comma "${missing[@]}")"
      return 0
    fi
    warn "Secret ${NAMESPACE}/ghcr-secret exists but is missing keys: $(join_by_comma "${missing[@]}")"
  elif ! secret_exists "$NAMESPACE" ghcr-secret; then
    if copy_secret_from_source ghcr-secret; then
      return 0
    fi
    if ! interactive_enabled; then
      warn "Missing required Secret: ${NAMESPACE}/ghcr-secret"
      return 0
    fi
  else
    warn "Overwriting existing Secret: ${NAMESPACE}/ghcr-secret"
  fi

  header "Secret: ${NAMESPACE}/ghcr-secret"
  prompt_plain "GHCR username" username
  while [[ -z $username ]]; do
    warn "GHCR username is required."
    prompt_plain "GHCR username" username
  done
  prompt_secret_required "GHCR token/password" token
  prompt_plain "GHCR email (blank = noreply@example.com)" email
  if [[ -z $email ]]; then
    email="noreply@example.com"
  fi

  kubectl create secret docker-registry ghcr-secret \
    --namespace "$NAMESPACE" \
    --docker-server=ghcr.io \
    --docker-username="$username" \
    --docker-password="$token" \
    --docker-email="$email" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/ghcr-secret"
}

setup_git_deploy_key() {
  local name="$1"
  local label="$2"
  local key_file
  local missing

  if secret_exists "$NAMESPACE" "$name" && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$NAMESPACE" "$name" id_rsa)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${NAMESPACE}/${name}"
    elif interactive_enabled; then
      warn "Secret ${NAMESPACE}/${name} exists but is missing keys: $(join_by_comma "${missing[@]}")"
      prompt_file_or_paste "$label Git deploy private key" key_file
      patch_secret_file "$NAMESPACE" "$name" id_rsa "$key_file"
      log "Added key: ${name}/id_rsa"
    else
      warn "Secret ${NAMESPACE}/${name} is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    return 0
  fi

  if copy_secret_from_source "$name"; then
    return 0
  fi
  if ! interactive_enabled; then
    warn "Missing required Secret: ${NAMESPACE}/${name}"
    return 0
  fi

  header "Secret: ${NAMESPACE}/${name}"
  prompt_file_or_paste "$label Git deploy private key" key_file
  kubectl create secret generic "$name" \
    --namespace "$NAMESPACE" \
    --from-file="id_rsa=$key_file" \
    --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
  log "Created: ${NAMESPACE}/${name}"
}

setup_tailscale_oauth_secret() {
  local client_id="${TAILSCALE_OAUTH_CLIENT_ID:-}"
  local client_secret="${TAILSCALE_OAUTH_CLIENT_SECRET:-}"
  local missing key

  if [[ "$(normalize_boolish "$TAILSCALE_OPERATOR_ENABLED")" == "false" ]]; then
    warn "Skipping Tailscale OAuth secret by TAILSCALE_OPERATOR_ENABLED=$TAILSCALE_OPERATOR_ENABLED"
    return 0
  fi

  if secret_exists "$TAILSCALE_OPERATOR_NAMESPACE" "$TAILSCALE_OAUTH_SECRET_NAME" && [[ "$(normalize_boolish "$SECRETS_OVERWRITE")" != "true" ]]; then
    mapfile -t missing < <(secret_missing_keys "$TAILSCALE_OPERATOR_NAMESPACE" "$TAILSCALE_OAUTH_SECRET_NAME" client_id client_secret)
    if [[ ${#missing[@]} == "0" ]]; then
      log "Using existing Secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    elif interactive_enabled; then
      warn "Secret ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME} exists but is missing keys: $(join_by_comma "${missing[@]}")"
      for key in "${missing[@]}"; do
        case "$key" in
          client_id)
            prompt_secret_required "Tailscale OAuth client ID" client_id
            patch_secret_literal "$TAILSCALE_OPERATOR_NAMESPACE" "$TAILSCALE_OAUTH_SECRET_NAME" client_id "$client_id"
            ;;
          client_secret)
            prompt_secret_required "Tailscale OAuth client secret" client_secret
            patch_secret_literal "$TAILSCALE_OPERATOR_NAMESPACE" "$TAILSCALE_OAUTH_SECRET_NAME" client_secret "$client_secret"
            ;;
        esac
        log "Added key: ${TAILSCALE_OAUTH_SECRET_NAME}/${key}"
      done
    else
      warn "Secret ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME} is missing keys: $(join_by_comma "${missing[@]}")"
    fi
    return 0
  fi

  create_namespace_if_needed "$TAILSCALE_OPERATOR_NAMESPACE"

  if [[ -n $client_id && -n $client_secret ]]; then
    kubectl create secret generic "$TAILSCALE_OAUTH_SECRET_NAME" \
      --namespace "$TAILSCALE_OPERATOR_NAMESPACE" \
      --from-literal=client_id="$client_id" \
      --from-literal=client_secret="$client_secret" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    log "Created: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    return 0
  fi

  if copy_secret_from_source "$TAILSCALE_OAUTH_SECRET_NAME" "$TAILSCALE_OPERATOR_NAMESPACE"; then
    log "Copied: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    return 0
  fi

  if ! interactive_enabled; then
    warn "Missing required Secret for final-preview Tailscale: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
    warn "Run with KUBECLAW_SECRET_SETUP_MODE=interactive, set TAILSCALE_OAUTH_CLIENT_ID/SECRET, or pre-create it."
    return 0
  fi

  header "Secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
  prompt_secret_required "Tailscale OAuth client ID" client_id
  prompt_secret_required "Tailscale OAuth client secret" client_secret
  kubectl create secret generic "$TAILSCALE_OAUTH_SECRET_NAME" \
    --namespace "$TAILSCALE_OPERATOR_NAMESPACE" \
    --from-literal=client_id="$client_id" \
    --from-literal=client_secret="$client_secret" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  log "Created: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}"
}

main() {
  local tailscale_secret_list

  echo "Setting up secrets for namespace: $NAMESPACE"
  echo ""

  require_command kubectl
  create_namespace_if_needed "$NAMESPACE"

  if interactive_enabled; then
    info "Interactive secret setup enabled. Existing Secrets are reused unless KUBECLAW_SECRETS_OVERWRITE=true."
  else
    info "Interactive secret setup disabled. Using SOPS/source copies/env bootstrap only."
  fi

  setup_shared_secret
  setup_pipeline_source_attestation_secret
  setup_redis_secret

  if component_enabled "$KUBECLAW_DEPLOY_POSTGRESQL"; then
    setup_postgresql_secret
  else
    warn "Skipping optional postgresql-secrets by KUBECLAW_DEPLOY_POSTGRESQL=$KUBECLAW_DEPLOY_POSTGRESQL"
  fi

  if component_enabled "$KUBECLAW_DEPLOY_LITELLM"; then
    setup_litellm_secret
    rewrite_litellm_database_url_namespace
    setup_google_sa_key
  else
    warn "Skipping optional LiteLLM/Google secrets by KUBECLAW_DEPLOY_LITELLM=$KUBECLAW_DEPLOY_LITELLM"
  fi

  setup_ghcr_secret
  setup_git_deploy_key git-deploy-key-nova Nova
  setup_git_deploy_key git-deploy-key-buster Buster
  setup_tailscale_oauth_secret

  echo ""
  log "Done. Secrets in $NAMESPACE:"
  kubectl get secrets -n "$NAMESPACE" --no-headers | awk '{print "  " $1}'
  echo ""
  info "Tailscale operator secrets in $TAILSCALE_OPERATOR_NAMESPACE:"
  if tailscale_secret_list=$(kubectl get secrets -n "$TAILSCALE_OPERATOR_NAMESPACE" --no-headers 2>&1); then
    echo "$tailscale_secret_list" | awk '{print "  " $1}'
  elif is_not_found_error "$tailscale_secret_list"; then
    warn "No Tailscale operator namespace found; operator install will be skipped unless the OAuth secret is created later."
  else
    err "Failed to list Tailscale operator secrets in namespace '$TAILSCALE_OPERATOR_NAMESPACE'"
    echo "$tailscale_secret_list" >&2
    return 1
  fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
