#!/usr/bin/env bash

verification_cleanup() {
  if [[ -n ${TEMP_DIR:-} && -d ${TEMP_DIR:-} ]]; then
    rm -rf "$TEMP_DIR"
  fi
  "$REPO_DIR/tests/verification/lib/cleanup-home-artifacts.sh"
}

verification_initialize() {
  VERIFICATION_PREFIX="$1"
  local script_dir="$2"
  shift 2
  REPO_DIR="$(cd "$script_dir/../.." && pwd)"
  CONTRACT_PATH="$REPO_DIR/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md"
  TEMP_DIR="$(mktemp -d)"
  export REPO_DIR CONTRACT_PATH TEMP_DIR VERIFICATION_OUTPUT_DIR="$TEMP_DIR"
  trap verification_cleanup EXIT
  verification_parse_common_args "$@"
}

verification_require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[$VERIFICATION_PREFIX] missing required command: $command_name" >&2
    return 1
  fi
}

verification_ensure_python() {
  if command -v python >/dev/null 2>&1; then return; fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "[$VERIFICATION_PREFIX] missing required command: python (or python3)" >&2
    return 1
  fi
  ln -sf "$(command -v python3)" "$TEMP_DIR/python"
  export PATH="$TEMP_DIR:$PATH"
  echo "[$VERIFICATION_PREFIX] WARNING: python not found, temporarily aliasing python -> python3" >&2
}

run_step() {
  local label="$1"
  local status
  shift
  verification_run_step "$VERIFICATION_PREFIX" "$label" "$@" || status=$?
  if [[ ${status:-0} != "0" ]]; then exit "$status"; fi
}

verification_verbose_enabled() {
  [[ ${VERIFICATION_VERBOSE:-0} == "1" ]]
}

verification_warn_pattern='(^|[^[:alnum:]_])(WARN|WARNING|WARNINGS|Warning|Warnings)([^[:alnum:]_]|$)|(^|[[:space:]])warning:|"level":"WARN"'

verification_run_step() {
  local prefix="$1"
  local label="$2"
  shift 2

  if verification_verbose_enabled; then
    echo ""
    echo "[$prefix] === $label ==="
    "$@"
    return
  fi

  if [[ -z ${VERIFICATION_OUTPUT_DIR:-} || ! -d $VERIFICATION_OUTPUT_DIR ]]; then
    echo "[$prefix] missing VERIFICATION_OUTPUT_DIR for quiet output capture" >&2
    return 1
  fi

  local safe_label output_path status
  safe_label="$(printf '%s' "$label" | tr -c '[:alnum:]_.-' '_')"
  output_path="$(mktemp "$VERIFICATION_OUTPUT_DIR/${prefix}.${safe_label}.XXXXXX.log")"
  status=0

  "$@" >"$output_path" 2>&1 || status=$?

  if [[ $status == "0" ]]; then
    if grep -Eq "$verification_warn_pattern" "$output_path"; then
      echo "[$prefix] WARNING output from $label:" >&2
      grep -E "$verification_warn_pattern" "$output_path" >&2
    fi
    return 0
  fi

  echo "[$prefix] FAILED: $label" >&2
  if [[ -s $output_path ]]; then
    cat "$output_path" >&2
  else
    echo "[$prefix] command produced no output" >&2
  fi
  return "$status"
}

verification_parse_common_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --verbose)
        export VERIFICATION_VERBOSE=1
        shift
        ;;
      *)
        echo "[verification] unknown wrapper argument: $1" >&2
        return 1
        ;;
    esac
  done
}
