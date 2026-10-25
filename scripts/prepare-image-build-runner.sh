#!/usr/bin/env bash
set -euo pipefail

# This provisions disposable GitHub-hosted build runners, never an operator host.
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo "Image runner preparation requires a disposable GitHub-hosted runner." >&2
  exit 1
fi

# Skip destructive SDK cleanup when the runner already has sufficient space.
# Keep the original 30 GiB capacity invariant for build, export and acceptance.
free_bytes() { df --output=avail -B1 /var/lib/docker | tail -n 1 | tr -d ' '; }
available="$(free_bytes)"
if (( available < 30 * 1024 * 1024 * 1024 )); then
  # Host SDKs are not build inputs. Stop as soon as enough capacity is available.
  for sdk in /usr/local/lib/android /usr/share/dotnet /opt/ghc /usr/local/.ghcup /opt/hostedtoolcache/CodeQL; do
    sudo rm -rf "$sdk"
    available="$(free_bytes)"
    if (( available >= 30 * 1024 * 1024 * 1024 )); then break; fi
  done
fi
df -h /var/lib/docker
if (( available < 30 * 1024 * 1024 * 1024 )); then
  echo "Runtime image builds require at least 30 GiB free for build, export and acceptance." >&2
  exit 1
fi
