#!/usr/bin/env bash
set -euo pipefail

readonly TRIVY_VERSION="0.74.0"
readonly TRIVY_AMD64_SHA256="2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a"
readonly TRIVY_ARM64_SHA256="b94ce1976bbf3c15b514b605ee88be7c6d94a29be2302847ff01cb794d47aad5"

usage() {
  cat <<'EOF'
Usage: scripts/scan-runtime-images.sh IMAGE@sha256:DIGEST [IMAGE@sha256:DIGEST ...]

Scan published runtime images with the pinned Trivy release.

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
  curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${archive}" \
    -o "$temporary/$archive"
  printf '%s  %s\n' "$archive_sha" "$temporary/$archive" | sha256sum -c - >/dev/null
  tar --no-same-owner -xzf "$temporary/$archive" -C "$temporary" trivy
  install -m 0755 "$temporary/trivy" "$executable"
  printf '%s\n' "$executable"
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  usage
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

for image in "$@"; do
  digest="${image##*@sha256:}"
  report="$report_dir/${digest}.txt"
  echo "Scanning $image with Trivy $TRIVY_VERSION"
  "$trivy_executable" image \
    --cache-dir "$database_cache" \
    --scanners vuln \
    --severity HIGH,CRITICAL \
    --ignore-unfixed \
    --exit-code 1 \
    --format table \
    --output "$report" \
    "$image"
  cat "$report"
  echo "Saved report: $report"
done
