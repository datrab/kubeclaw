#!/usr/bin/env bash
set -euo pipefail

channel="${OPENCLAW_NOTIFY_CHANNEL:-discord}"
target="${OPENCLAW_NOTIFY_TARGET:-}"
session_key="${OPENCLAW_NOTIFY_SESSION_KEY:-}"
session_mode="${OPENCLAW_NOTIFY_SESSION_MODE:-now}"
account="${OPENCLAW_NOTIFY_ACCOUNT:-default}"
silent="${OPENCLAW_NOTIFY_SILENT:-0}"
agent_id="${OPENCLAW_NOTIFY_AGENT_ID:-main}"
agent_session_key="${OPENCLAW_NOTIFY_AGENT_SESSION_KEY:-}"
agent_on_statuses="${OPENCLAW_NOTIFY_AGENT_ON_STATUSES:-failed}"
agent_timeout_seconds="${OPENCLAW_NOTIFY_AGENT_TIMEOUT_SECONDS:-180}"
agent_deliver="${OPENCLAW_NOTIFY_AGENT_DELIVER:-1}"
agent_reply_channel="${OPENCLAW_NOTIFY_AGENT_REPLY_CHANNEL:-$channel}"
agent_reply_target="${OPENCLAW_NOTIFY_AGENT_REPLY_TARGET:-$target}"
agent_reply_account="${OPENCLAW_NOTIFY_AGENT_REPLY_ACCOUNT:-$account}"

message="${PIPELINE_LIGHT_MESSAGE:-}"
level="${PIPELINE_LIGHT_LEVEL:-info}"
status_file="${PIPELINE_LIGHT_STATUS_FILE:-}"
watchdog_log_file="${PIPELINE_LIGHT_WATCHDOG_LOG_FILE:-}"
run_pid="${PIPELINE_LIGHT_RUN_PID:-}"

if [[ -z "$target" && -z "$session_key" && -z "$agent_session_key" ]]; then
  echo "OPENCLAW_NOTIFY_TARGET, OPENCLAW_NOTIFY_SESSION_KEY, or OPENCLAW_NOTIFY_AGENT_SESSION_KEY is required" >&2
  exit 2
fi

if [[ -z "$message" ]]; then
  echo "PIPELINE_LIGHT_MESSAGE is required" >&2
  exit 2
fi

prefix="[pipeline-light:${level}]"
payload="${prefix}"$'\n'"${message}"

required_attempted=0
required_sent=0
supplemental_attempted=0
supplemental_sent=0

normalize_csv_token() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

level_matches_agent_policy() {
  local want token
  want="$(normalize_csv_token "$level")"
  IFS=',' read -r -a statuses <<< "$agent_on_statuses"
  for token in "${statuses[@]}"; do
    if [[ "$(normalize_csv_token "$token")" == "$want" ]]; then
      return 0
    fi
  done
  return 1
}

print_json_summary() {
  local label output jq_expr
  label="$1"
  output="$2"
  jq_expr="$3"
  if jq -er "$jq_expr" >/dev/null 2>&1 <<< "$output"; then
    printf '%s %s\n' "$label" "$(jq -r "$jq_expr" <<< "$output")"
  elif [[ -n "$output" ]]; then
    printf '%s %s\n' "$label" "$(printf '%s' "$output" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g; s/[[:space:]]*$//')"
  else
    printf '%s no-output\n' "$label"
  fi
}

if [[ -n "$session_key" ]]; then
  supplemental_attempted=$((supplemental_attempted + 1))
  session_output="$(openclaw system event --session-key "$session_key" --mode "$session_mode" --text "$payload" --json 2>&1 || true)"
  if jq -e '.ok == true' >/dev/null 2>&1 <<< "$session_output"; then
    supplemental_sent=$((supplemental_sent + 1))
    print_json_summary "session_event ok" "$session_output" '".ok=\(.ok)"'
  else
    print_json_summary "session_event failed" "$session_output" '.'
  fi
fi

if [[ -n "$target" ]]; then
  required_attempted=$((required_attempted + 1))
  argv=(
    openclaw
    message
    send
    --account "$account"
    --channel "$channel"
    --target "$target"
    --message "$payload"
    --json
  )

  if [[ "$silent" == "1" ]]; then
    argv+=(--silent)
  fi

  message_output="$("${argv[@]}" 2>&1 || true)"
  if jq -e '.payload.ok == true and ((.payload.result.messageId // "") | length > 0)' >/dev/null 2>&1 <<< "$message_output"; then
    required_sent=$((required_sent + 1))
    print_json_summary "channel_message ok" "$message_output" '".message_id=\(.payload.result.messageId) channel_id=\(.payload.result.channelId)"'
  else
    print_json_summary "channel_message failed" "$message_output" '.'
  fi
fi

if [[ -n "$agent_session_key" ]] && level_matches_agent_policy; then
  required_attempted=$((required_attempted + 1))
  agent_message=$'Pipeline-light terminal alert received.\n'
  agent_message+="${payload}"
  if [[ -n "$status_file" ]]; then
    agent_message+=$'\n'"status_file: $status_file"
  fi
  if [[ -n "$watchdog_log_file" ]]; then
    agent_message+=$'\n'"watchdog_log: $watchdog_log_file"
  fi
  if [[ -n "$run_pid" ]]; then
    agent_message+=$'\n'"watchdog_pid: $run_pid"
  fi
  if [[ "$(normalize_csv_token "$level")" == "failed" ]]; then
    agent_message+=$'\n'"Inspect the workspace failure context, continue the clawpatch pipeline if it is safe to do so, and post a concise status update."
  else
    agent_message+=$'\n'"Post a concise status update."
  fi

  agent_argv=(
    openclaw
    agent
    --agent "$agent_id"
    --session-key "$agent_session_key"
    --message "$agent_message"
    --timeout "$agent_timeout_seconds"
    --json
  )
  if [[ "$agent_deliver" == "1" && -n "$agent_reply_target" ]]; then
    agent_argv+=(
      --deliver
      --reply-account "$agent_reply_account"
      --reply-channel "$agent_reply_channel"
      --reply-to "$agent_reply_target"
    )
  fi

  agent_output="$("${agent_argv[@]}" 2>&1 || true)"
  if jq -e 'type == "object"' >/dev/null 2>&1 <<< "$agent_output"; then
    required_sent=$((required_sent + 1))
    print_json_summary "agent_wake ok" "$agent_output" '".json=true"'
  else
    print_json_summary "agent_wake failed" "$agent_output" '.'
  fi
fi

if (( required_attempted > 0 )); then
  if [[ "$required_sent" -eq "$required_attempted" ]]; then
    exit 0
  fi
  exit 1
fi

if (( supplemental_attempted > 0 && supplemental_sent == supplemental_attempted )); then
  exit 0
fi

exit 1
