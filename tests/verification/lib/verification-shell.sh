#!/usr/bin/env bash

verification_verbose_enabled() {
  [[ "${VERIFICATION_VERBOSE:-0}" == "1" ]]
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

  if [[ -z "${VERIFICATION_OUTPUT_DIR:-}" || ! -d "$VERIFICATION_OUTPUT_DIR" ]]; then
    echo "[$prefix] missing VERIFICATION_OUTPUT_DIR for quiet output capture" >&2
    return 1
  fi

  local safe_label output_path status
  safe_label="$(printf '%s' "$label" | tr -c '[:alnum:]_.-' '_')"
  output_path="$(mktemp "$VERIFICATION_OUTPUT_DIR/${prefix}.${safe_label}.XXXXXX.log")"
  status=0

  "$@" >"$output_path" 2>&1 || status=$?

  if [[ "$status" == "0" ]]; then
    if grep -Eq "$verification_warn_pattern" "$output_path"; then
      echo "[$prefix] WARNING output from $label:" >&2
      grep -E "$verification_warn_pattern" "$output_path" >&2
    fi
    return 0
  fi

  echo "[$prefix] FAILED: $label" >&2
  if [[ -s "$output_path" ]]; then
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
