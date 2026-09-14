#!/usr/bin/env bash
set -euo pipefail
# Real container smoke: no credentials/model calls, and no fake CLI executable.
image=${1:?Usage: test-image.sh image}
temp=$(mktemp -d)
chmod 0755 "$temp"
printf '%s\n' 'image-smoke-only-not-a-production-token-0123456789' > "$temp/token"
chmod 0444 "$temp/token"
container=""
cleanup() { if [[ -n $container ]]; then docker rm -fv "$container" >/dev/null; fi; rm -rf -- "$temp"; }
trap cleanup EXIT
container=$(docker run -d --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,uid=1000,gid=1000,mode=1777 \
  -v /home/node -v /workspace -v "$temp:/var/run/kubeclaw-ops/bearer:ro" "$image")
for attempt in {1..30}; do
  if docker exec "$container" python3 -c "import json; assert json.load(open('/tmp/codex-ops-status.json'))['phase']=='waiting-for-login'" 2>/dev/null; then
    docker exec "$container" gh --version
    docker exec "$container" kubectl version --client -o json | python3 -c '
import json, sys
expected = json.load(open(sys.argv[1]))["imageOverrides"]["ops-pod"]["KUBECTL_VERSION"]
actual = json.load(sys.stdin)["clientVersion"]["gitVersion"]
assert actual == expected, (actual, expected)
' "$(dirname -- "${BASH_SOURCE[0]}")/../../versions.json"
    docker exec "$container" helm version --short
    docker exec "$container" npm --version
    docker exec "$container" codex remote-control pair --help >/dev/null
    docker exec "$container" codex mcp list --json | python3 -c "import json,sys; assert any(x['name']=='kubeclaw_ops' for x in json.load(sys.stdin))"
    docker exec "$container" bash /opt/codex/shell.sh -c 'test "$KUBECLAW_MCP_TOKEN" = "$(cat /var/run/kubeclaw-ops/bearer/token)" && codex mcp list --json' | python3 -c "import json,sys; assert any(x['name']=='kubeclaw_ops' for x in json.load(sys.stdin))"
    mv "$temp/token" "$temp/saved-token"
    if docker exec "$container" bash /opt/codex/shell.sh -c 'exit 0' >/dev/null 2>&1; then
      echo 'FAIL: exec shell opened without the mounted MCP bearer' >&2
      exit 1
    fi
    echo 'PASS: exec shell exports the mounted MCP bearer and refuses a missing credential'
    echo 'PASS: real non-root read-only container remains available for first login and loads MCP config'
    exit 0
  fi
  sleep 1
done
docker logs "$container"
exit 1
