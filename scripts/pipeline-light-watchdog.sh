#!/usr/bin/env bash
set -euo pipefail

status_file=""
run_pid=""
log_file=""
notify_command=""
poll_seconds="${PIPELINE_LIGHT_WATCHDOG_POLL_SECONDS:-15}"
heartbeat_seconds="${PIPELINE_LIGHT_WATCHDOG_HEARTBEAT_SECONDS:-300}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status-file)
      status_file="${2:-}"
      shift 2
      ;;
    --run-pid)
      run_pid="${2:-}"
      shift 2
      ;;
    --log-file)
      log_file="${2:-}"
      shift 2
      ;;
    --notify-command)
      notify_command="${2:-}"
      shift 2
      ;;
    --poll-seconds)
      poll_seconds="${2:-}"
      shift 2
      ;;
    --heartbeat-seconds)
      heartbeat_seconds="${2:-}"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  scripts/pipeline-light-watchdog.sh \
    --run-pid <pid> \
    --status-file <path> \
    --log-file <path> \
    [--notify-command <command>] \
    [--poll-seconds <n>] \
    [--heartbeat-seconds <n>]

Writes heartbeat/status lines to the log file and optionally sends one terminal
notification when the pipeline-light run reaches failed or complete.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$status_file" || -z "$run_pid" || -z "$log_file" ]]; then
  echo "--status-file, --run-pid, and --log-file are required" >&2
  exit 2
fi

mkdir -p "$(dirname "$log_file")"

last_status=""
last_heartbeat_epoch=0
notified_terminal=0

now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

append_log() {
  printf '%s pid=%s %s\n' "$(now_iso)" "$run_pid" "$1" >> "$log_file"
}

read_status_field() {
  jq -r "$1" "$status_file"
}

status_snapshot_line() {
  local status idx total succ fail current
  status="$(read_status_field '.status // "unknown"')"
  idx="$(read_status_field '.currentIndex // 0')"
  total="$(read_status_field '.total // 0')"
  succ="$(read_status_field '(.successes // []) | length')"
  fail="$(read_status_field '(.failures // []) | length')"
  current="$(read_status_field 'if .currentFinding then ((.currentFinding.id // "?") + " " + (.currentFinding.title // "")) else "none" end')"
  printf '%s %s/%s successes=%s failures=%s current=%s' \
    "$status" "$idx" "$total" "$succ" "$fail" "$current"
}

notify_terminal_status() {
  local status progress current branch worktree error message message output exit_code
  [[ -n "$notify_command" ]] || return 0

  status="$(read_status_field '.status // "unknown"')"
  progress="$(read_status_field '((.currentIndex // 0) | tostring) + "/" + ((.total // 0) | tostring)')"
  current="$(read_status_field 'if .currentFinding then ((.currentFinding.id // "?") + " - " + (.currentFinding.title // "")) else "none" end')"
  branch="$(read_status_field '.branch // "n/a"')"
  worktree="$(read_status_field '.worktree // "n/a"')"
  error="$(read_status_field 'if ((.failures // []) | length) > 0 then .failures[-1].error // "" else "" end')"

  message=$'status: '"$status"$'\n'"progress: $progress"$'\n'"current: $current"$'\n'"branch: $branch"$'\n'"worktree: $worktree"
  if [[ -n "$error" ]]; then
    message+=$'\n'"error: $error"
  fi

  append_log "notify status=$status"
  output="$(
    set +e
    PIPELINE_LIGHT_MESSAGE="$message" \
    PIPELINE_LIGHT_LEVEL="$status" \
    PIPELINE_LIGHT_STATUS_FILE="$status_file" \
    PIPELINE_LIGHT_WATCHDOG_LOG_FILE="$log_file" \
    PIPELINE_LIGHT_RUN_PID="$run_pid" \
    "$notify_command" 2>&1
    printf '\n__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=%s\n' "$?"
  )"
  exit_code="$(printf '%s\n' "$output" | sed -n 's/^__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=//p' | tail -n 1)"
  output="$(printf '%s\n' "$output" | sed '/^__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=/d')"
  if [[ -n "$output" ]]; then
    while IFS= read -r line; do
      append_log "notify output=$line"
    done <<< "$output"
  fi
  if [[ "${exit_code:-1}" == "0" ]]; then
    append_log "notify status=$status result=sent"
  else
    append_log "notify status=$status result=failed exit=$exit_code command=$notify_command"
    return 0
  fi
}

emit_snapshot() {
  if [[ -f "$status_file" ]]; then
    append_log "$(status_snapshot_line)"
  else
    append_log "status=pending"
  fi
  last_heartbeat_epoch="$(date +%s)"
}

emit_snapshot

if [[ -f "$status_file" ]]; then
  last_status="$(read_status_field '.status // "unknown"')"
fi

while true; do
  current_epoch="$(date +%s)"
  alive=0
  if kill -0 "$run_pid" 2>/dev/null; then
    alive=1
  fi

  if [[ -f "$status_file" ]]; then
    status="$(read_status_field '.status // "unknown"')"
    if [[ "$status" != "$last_status" ]]; then
      emit_snapshot
      last_status="$status"
    elif (( current_epoch - last_heartbeat_epoch >= heartbeat_seconds )); then
      emit_snapshot
      last_heartbeat_epoch="$current_epoch"
    fi

    if [[ "$notified_terminal" -eq 0 && ( "$status" == "failed" || "$status" == "complete" ) ]]; then
      notify_terminal_status
      notified_terminal=1
    fi
  elif (( current_epoch - last_heartbeat_epoch >= heartbeat_seconds )); then
    emit_snapshot
    last_heartbeat_epoch="$current_epoch"
  fi

  if [[ "$alive" -eq 0 ]]; then
    break
  fi

  sleep "$poll_seconds"
done

emit_snapshot

if [[ -f "$status_file" ]]; then
  status="$(read_status_field '.status // "unknown"')"
  if [[ "$notified_terminal" -eq 0 && ( "$status" == "failed" || "$status" == "complete" ) ]]; then
    notify_terminal_status
    notified_terminal=1
  fi
fi

append_log "exited"
