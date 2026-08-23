#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache_dir="${NPM_CONFIG_CACHE:-/tmp/kubeclaw-prism-npm-cache}"
npm ci --prefix "$repo_dir" --include=dev --ignore-scripts --no-audit --no-fund --cache "$cache_dir"
for package in puck-adapter mobile-editor preview-isolation postgres-retrieval; do
  npm ci --prefix "$repo_dir/spikes/prism/$package" --include=dev --ignore-scripts --no-audit --no-fund --cache "$cache_dir"
done
