#!/usr/bin/env bash
set -euo pipefail

# This provisions disposable GitHub-hosted build runners, never an operator host.
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo "Image runner preparation requires a disposable GitHub-hosted runner." >&2
  exit 1
fi

# Runtime SDKs live inside the images. These host SDKs are not build inputs.
sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc /usr/local/.ghcup /opt/hostedtoolcache/CodeQL
df -h /var/lib/docker
available="$(df --output=avail -B1 /var/lib/docker | tail -n 1 | tr -d ' ')"
if (( available < 30 * 1024 * 1024 * 1024 )); then
  echo "Runtime image builds require at least 30 GiB free for build, export and acceptance." >&2
  exit 1
fi
