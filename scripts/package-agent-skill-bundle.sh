#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

role="${1:-}"
output_path="${2:-}"
commit="${3:-${GITHUB_SHA:-}}"
contract_version="${4:-v2}"
built_at="${5:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

if [[ -z $role || -z $output_path ]]; then
  echo "Usage: $0 <nova|buster|prism> <output-path.tgz> [commit] [contract-version] [built-at]" >&2
  exit 1
fi
if [[ $role != "nova" && $role != "buster" && $role != "prism" ]]; then
  echo "Unsupported role: $role" >&2
  exit 1
fi
if [[ -z $commit ]]; then
  echo "Commit SHA is required as argument 3 or GITHUB_SHA" >&2
  exit 1
fi

bundle_root_name="${role}-${commit}"
temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT

node "${SCRIPT_DIR}/build-runtime-role-bundle.mjs" \
  "$role" \
  "${temp_root}/${bundle_root_name}" \
  "$commit" \
  "$contract_version" \
  "$built_at" >/dev/null

mkdir -p "$(dirname "$output_path")"
tar --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 --group=0 --numeric-owner \
  -cf - \
  -C "$temp_root" \
  "$bundle_root_name" \
  | gzip -n >"$output_path"
