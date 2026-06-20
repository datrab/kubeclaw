#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

role="${1:-}"
output_path="${2:-}"
commit="${3:-${GITHUB_SHA:-}}"
contract_version="${4:-v1}"
built_at="${5:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

if [[ -z "$role" || -z "$output_path" ]]; then
  echo "Usage: $0 <nova|buster> <output-path.tgz> [commit] [contract-version] [built-at]" >&2
  exit 1
fi

if [[ "$role" != "nova" && "$role" != "buster" ]]; then
  echo "Unsupported role: $role" >&2
  exit 1
fi

if [[ -z "$commit" ]]; then
  echo "Commit SHA is required as argument 3 or GITHUB_SHA" >&2
  exit 1
fi

bundle_root_name="${role}-${commit}"
temp_root="$(mktemp -d)"
bundle_root="${temp_root}/${bundle_root_name}"
skills_root="${bundle_root}/skills"
role_source="${REPO_DIR}/skills/${role}"
common_source="${REPO_DIR}/skills/common"

mkdir -p "$skills_root"

# The runtime contract is the effective /app/skills tree:
# role-specific files land first, then shared common files overwrite the
# compatibility facades in matching paths.
cp -R "${role_source}/." "$skills_root/"
cp -R "${common_source}/." "$skills_root/"

cat > "${bundle_root}/manifest.json" <<EOF
{
  "contractVersion": "${contract_version}",
  "bundleKind": "app-skills-overlay",
  "runtimeSurface": "/app/skills",
  "agent": "${role}",
  "commit": "${commit}",
  "builtAt": "${built_at}",
  "sourceSubpaths": [
    "skills/${role}",
    "skills/common"
  ],
  "overlayOrder": [
    "skills/${role}",
    "skills/common"
  ],
  "healthcheckVersion": "v1"
}
EOF

mkdir -p "$(dirname "$output_path")"
tar --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 --group=0 --numeric-owner \
  -czf "$output_path" \
  -C "$temp_root" \
  "$bundle_root_name"

rm -rf "$temp_root"
