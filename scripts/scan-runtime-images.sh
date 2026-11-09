#!/usr/bin/env bash
set -euo pipefail

readonly TRIVY_VERSION="0.76.1"
readonly TRIVY_AMD64_SHA256="c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0"
readonly TRIVY_ARM64_SHA256="e174dff2a6dba5e3ae41f8d0537a6324405bd08132497340304c6b20e0f16a1f"

usage() {
  cat <<'EOF'
Usage: scripts/scan-runtime-images.sh IMAGE@sha256:DIGEST [IMAGE@sha256:DIGEST ...]

Scan published runtime images with the pinned Trivy release.
Use --executable to install/verify Trivy and print its executable path.

Private GHCR images require TRIVY_USERNAME and TRIVY_PASSWORD, or valid
registry credentials in the local container configuration.

Optional environment variables:
  KUBECLAW_TRIVY_REPORT_DIR  Report directory. Default: dist/trivy
  KUBECLAW_TOOL_CACHE        Tool cache. Default: XDG cache or a temporary cache.
  XDG_CACHE_HOME             Optional cache parent directory.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is unavailable: $1" >&2
    exit 1
  fi
}

install_trivy() {
  local machine="$1"
  local archive_arch archive_sha
  case "$machine" in
    x86_64|amd64)
      archive_arch="64bit"
      archive_sha="$TRIVY_AMD64_SHA256"
      ;;
    aarch64|arm64)
      archive_arch="ARM64"
      archive_sha="$TRIVY_ARM64_SHA256"
      ;;
    *)
      echo "Unsupported architecture: $machine" >&2
      exit 1
      ;;
  esac

  local default_cache="${XDG_CACHE_HOME:-${TMPDIR:-/tmp}/kubeclaw-cache}"
  local cache_parent="${KUBECLAW_TOOL_CACHE:-$default_cache}"
  local install_root="$cache_parent/trivy/v$TRIVY_VERSION"
  local executable="$install_root/trivy"
  if [[ -x $executable ]] && [[ "$($executable --version | awk '/^Version:/ { print $2; exit }')" == "$TRIVY_VERSION" ]]; then
    printf '%s\n' "$executable"
    return
  fi

  require_command curl
  require_command sha256sum
  require_command tar
  mkdir -p "$install_root"
  local temporary
  temporary="$(mktemp -d "${TMPDIR:-/tmp}/kubeclaw-trivy.XXXXXX")"
  trap 'rm -rf -- "$temporary"' RETURN
  local archive="trivy_${TRIVY_VERSION}_Linux-${archive_arch}.tar.gz"
  local attempt
  for attempt in 1 2 3; do
    if curl -fsSL --connect-timeout 15 --max-time 60 \
      "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${archive}?download=1&kubeclaw_retry=$(date +%s)-$attempt" \
      -o "$temporary/$archive"; then
      break
    fi
    if [[ $attempt == 3 ]]; then return 1; fi
    sleep "$((attempt * 5))"
  done
  printf '%s  %s\n' "$archive_sha" "$temporary/$archive" | sha256sum -c - >/dev/null || return 1
  tar --no-same-owner -xzf "$temporary/$archive" -C "$temporary" trivy || return 1
  install -m 0755 "$temporary/trivy" "$executable" || return 1
  printf '%s\n' "$executable"
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  usage
  exit 0
fi

if [[ ${1:-} == "--executable" ]]; then
  install_trivy "$(uname -m)"
  exit 0
fi

if [[ ${1:-} == "--version" ]]; then
  trivy_executable="$(install_trivy "$(uname -m)")"
  "$trivy_executable" --version
  exit 0
fi

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

for image in "$@"; do
  if [[ ! $image =~ @sha256:[a-f0-9]{64}$ ]]; then
    echo "Image reference must use an immutable sha256 digest: $image" >&2
    exit 2
  fi
done

# Authenticate the unchanged pinned upstream before evaluating its consumers.
if node --input-type=module -e 'import {usesOpenclaw} from "./scripts/updates/upstream-security-policy.mjs"; process.exit(process.argv.slice(1).some(usesOpenclaw)?0:1)' "$@"; then
  upstream_reference="$(node --input-type=module -e 'import {openclawReference} from "./scripts/updates/upstream-security-policy.mjs"; console.log(openclawReference())')"
  # This reference cannot match usesOpenclaw, so recursion is bounded to one level.
  bash "${BASH_SOURCE[0]}" "$upstream_reference"
fi

trivy_executable="$(install_trivy "$(uname -m)")"
installed_version="$($trivy_executable --version | awk '/^Version:/ { print $2; exit }')"
if [[ $installed_version != "$TRIVY_VERSION" ]]; then
  echo "Unexpected Trivy version: $installed_version" >&2
  exit 1
fi

report_dir="${KUBECLAW_TRIVY_REPORT_DIR:-dist/trivy}"
default_cache="${XDG_CACHE_HOME:-${TMPDIR:-/tmp}/kubeclaw-cache}"
database_cache="${KUBECLAW_TOOL_CACHE:-$default_cache}/trivy/db"
mkdir -p "$report_dir"
mkdir -p "$database_cache"

scan_failed=0
for image in "$@"; do
  digest="${image##*@sha256:}"
  report="$report_dir/${digest}.json"
  table="$report_dir/${digest}.txt"
  diagnostics="$report_dir/${digest}.stderr.log"
  # Do not let an earlier successful scan hide a failed retry.
  rm -f -- "$report" "$table" "$diagnostics"
  echo "Scanning $image with Trivy $TRIVY_VERSION"
  scanner_exit=0
  if "$trivy_executable" image \
    --cache-dir "$database_cache" \
    --db-repository "${TRIVY_DB_REPOSITORY:-ghcr.io/aquasecurity/trivy-db:2}" \
    --java-db-repository "${TRIVY_JAVA_DB_REPOSITORY:-ghcr.io/aquasecurity/trivy-java-db:1}" \
    --scanners vuln \
    --severity HIGH,CRITICAL \
    --exit-code 1 \
    --format json \
    --output "$report" \
    "$image" 2> >(tee "$diagnostics" >&2); then
    :
  else
    scanner_exit=$?
  fi
  if [[ -s "$report" ]]; then
    if "$trivy_executable" convert --format table --output "$table" "$report"; then
      cat "$table"
    else
      scan_failed=2
    fi
  else
    echo "Scanner produced no report for $image" >&2
    scan_failed=2
  fi
  # Keep the full unfiltered report; only the gate decision exempts unfixed findings.
  gate_exit=0
  node scripts/updates/security-gate.mjs "$image" "$report_dir" "$scanner_exit" || gate_exit=$?
  if (( gate_exit > scan_failed )); then scan_failed=$gate_exit; fi
  echo "Saved report: $report"
done

exit "$scan_failed"
