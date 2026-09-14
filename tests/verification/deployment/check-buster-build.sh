#!/usr/bin/env bash
set -euo pipefail
cd /app
mkdir -p /run/user/1000/proof /home/builder/.local/share/buildkit-proof
chown -R builder:builder /run/user/1000/proof /home/builder/.local/share/buildkit-proof
cat > /tmp/buildkit-proof.toml <<'TOML'
[registry."127.0.0.1:5000"]
  http = true
  insecure = true
TOML
export BUILDKIT_HOST=unix:///run/user/1000/proof/buildkit.sock
setpriv --reuid=1000 --regid=1000 --init-groups rootlesskit --net=host buildkitd \
  --config /tmp/buildkit-proof.toml --addr "$BUILDKIT_HOST" \
  --otel-socket-path /run/user/1000/proof/otel-grpc.sock \
  --root /home/builder/.local/share/buildkit-proof --oci-worker-no-process-sandbox \
  --oci-worker-snapshotter=native > /tmp/buildkit-proof.log 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; cat /tmp/buildkit-proof.log' EXIT
ready=false
for attempt in {1..60}; do
  if ! kill -0 "$pid" 2>/dev/null; then wait "$pid"; exit 1; fi
  if buildctl --addr "$BUILDKIT_HOST" debug workers >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
export CONTAINER_BUILD_BUILDKIT_HOST="$BUILDKIT_HOST"
export CONTAINER_BUILD_REGISTRY_REFERENCE=127.0.0.1:5000
export CONTAINER_BUILD_REGISTRY_BASE_URL=http://127.0.0.1:5000
node tests/verification/contracts/check-pipeline-container-build-production.mts
# Buster owns actual browser execution as well as image building.
node --input-type=module -e 'import {chromium} from "playwright"; const b=await chromium.launch({args:["--no-sandbox"]}); try { const p=await b.newPage(); await p.setContent("<h1>Buster browser proof</h1>"); if(await p.locator("h1").textContent()!=="Buster browser proof") throw Error("Browser content mismatch"); } finally { await b.close(); }'
