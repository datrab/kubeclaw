#!/usr/bin/env bash
set -euo pipefail

# Runs inside the actual built image, with networking disabled by CI.
role="${1:?role required}"
version="${2:?OpenClaw version required}"
case "$role" in nova|prism-agent|buster-gateway) ;; *) exit 2 ;; esac
if [[ "${3:-}" == runtime ]]; then
  if [[ "$role" == nova ]]; then test "$(id -u)" -eq 0; else test "$(id -u)" -eq 1000; fi
  cd /app
  node -e 'const sdk=require("openclaw/plugin-sdk/diagnostic-runtime"); if(typeof sdk.onDiagnosticEvent!=="function") process.exit(1)'
  if [[ "$role" == prism-agent ]]; then
  PORT=18080 node /opt/kubeclaw-prism/agent-bridge.mjs &
  bridge_pid=$!
  trap 'kill "$bridge_pid" 2>/dev/null || true' EXIT
  node --input-type=module -e '
    import { setTimeout } from "node:timers/promises";
    let lastError;
    for(let attempt=0; attempt<50; attempt++) {
      try {
        const response=await fetch("http://127.0.0.1:18080/health");
        if(response.status!==200 || (await response.json()).status!=="ready") throw Error("Invalid bridge response");
        process.exit(0);
      } catch(error) { lastError=error; await setTimeout(100); }
    }
    throw lastError;
  '
  fi
  exit 0
fi
openclaw --version | awk -v expected="$version" '{ for (i=1; i<=NF; i++) if ($i == expected) found=1; print } END { exit !found }'
cd /app
node -e 'const sdk=require("openclaw/plugin-sdk/diagnostic-runtime"); if(typeof sdk.onDiagnosticEvent!=="function") process.exit(1)'
test -s /app/dist/extensions/kubeclaw-agent-observer/openclaw.plugin.json
test -s /opt/openclaw-plugin-home/.kubeclaw-plugin-cache-version

# Exercise the same offline npm provenance route as the chart, without network access.
export HOME=/tmp/kubeclaw-image-home
export NPM_CONFIG_CACHE=/tmp/kubeclaw-image-cache
export NPM_CONFIG_OFFLINE=true
mkdir -p "$HOME" "$NPM_CONFIG_CACHE"
cp -a /opt/openclaw-plugin-home/npm-cache/. "$NPM_CONFIG_CACHE/"
for plugin in acpx discord; do
  openclaw plugins install "npm:@openclaw/${plugin}@${version}" --force --pin --accept-capabilities
done
openclaw plugins registry --refresh

if [[ "$role" == nova ]]; then
  shellcheck --version
  ruff --version
  semgrep --version
  for executable in buildctl buildkitd playwright lighthouse k6; do
    if command -v "$executable" >/dev/null; then
      echo "Unexpected Buster execution tool in Nova: $executable" >&2
      exit 1
    fi
  done
  test ! -e /ms-playwright
  hadolint --version
  kubeconform -v
  helm version --short
  terraform version -json
  go version
  tsc --version
  test ! -e /app/dist/extensions/kubeclaw-prism
else
  for executable in semgrep ruff mypy shellcheck buildctl terraform tflint; do
    if command -v "$executable" >/dev/null; then
      echo "Unexpected Nova tool in $role: $executable" >&2
      exit 1
    fi
  done
  test ! -e /ms-playwright
fi

if [[ "$role" == prism-agent ]]; then
  node --check /app/dist/extensions/kubeclaw-prism/index.mjs
  node --check /opt/kubeclaw-prism/agent-bridge.mjs

else
  test ! -e /opt/kubeclaw-prism/agent-bridge.mjs
fi
