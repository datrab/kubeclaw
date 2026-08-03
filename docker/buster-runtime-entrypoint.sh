#!/bin/sh
set -eu

worker_token="${BUSTER_V2_TOKEN:?BUSTER_V2_TOKEN is required}"
unset BUSTER_V2_TOKEN
socket="${BUILDKIT_HOST:?BUILDKIT_HOST is required}"
address="${socket#unix://}"
state="${BUILDKIT_STATE_DIR:?BUILDKIT_STATE_DIR is required}"
otel_socket="${BUILDKIT_OTEL_SOCKET_PATH:-${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is required}/buildkit/otel-grpc.sock}"
registry="${KUBECLAW_LOCAL_REGISTRY:?KUBECLAW_LOCAL_REGISTRY is required}"
config="${HOME}/.config/buildkit/buildkitd.toml"
mkdir -p "$(dirname "$address")" "$(dirname "$otel_socket")" "$state" "$(dirname "$config")"
cat >"$config" <<EOF
[registry."${registry}"]
  http = true
  insecure = true
EOF
chown root:builder "$config"
chmod 0640 "$config"

setpriv \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  rootlesskit --net=host buildkitd \
  --config "$config" \
  --addr "$socket" \
  --otel-socket-path "$otel_socket" \
  --root "$state" \
  --oci-worker-no-process-sandbox \
  >/tmp/buildkitd.log 2>&1 &
buildkit_pid=$!
worker_pid=""

cleanup() {
  if [ -n "$worker_pid" ]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  kill "$buildkit_pid" 2>/dev/null || true
  wait "$buildkit_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
until buildctl --addr "$socket" debug workers >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    cat /tmp/buildkitd.log >&2
    exit 1
  fi
  sleep 1
done

# BuildKit creates the socket as the non-root builder. Apply its shared-group
# permissions as that owner; the restricted supervisor intentionally does not
# retain CAP_FOWNER.
setpriv \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  chgrp 1002 "$address"
setpriv \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  chmod 0660 "$address"

# The supervisor retains only CHOWN/SETUID/SETGID/SETPCAP. The worker uses
# those capabilities to prepare the job directory and enter the per-job
# identity; worker.ts removes the entire capability set before suite code.
printf '%s' "$worker_token" | node /app/buster-suite-runtime/src/worker.ts &
worker_pid=$!
wait "$worker_pid"
