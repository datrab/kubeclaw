#!/bin/sh
set -eu

socket="${BUILDKIT_HOST:-unix:///run/user/1000/buildkit/buildkitd.sock}"
address="${socket#unix://}"
otel_socket="${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is required}/buildkit/otel-grpc.sock"
mkdir -p "$(dirname "$address")" "$(dirname "$otel_socket")" "${BUILDKIT_STATE_DIR:-/home/builder/.local/share/buildkit}"
config_dir="${HOME}/.config/buildkit"
mkdir -p "$config_dir"
registry="${KUBECLAW_LOCAL_REGISTRY:?KUBECLAW_LOCAL_REGISTRY is required}"
apparmor_userns_policy=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
if [ -r "$apparmor_userns_policy" ] && [ "$(cat "$apparmor_userns_policy")" = "1" ]; then
  echo "Buster rootless BuildKit cannot start: kernel.apparmor_restrict_unprivileged_userns=1 on this node." >&2
  echo "Set kernel.apparmor_restrict_unprivileged_userns=0 in node bootstrap, then redeploy Buster." >&2
  exit 78
fi
cat >"${config_dir}/buildkitd.toml" <<EOF
[registry."${registry}"]
  http = true
  insecure = true
EOF

rootlesskit \
  --net=host \
  buildkitd \
  --config "${config_dir}/buildkitd.toml" \
  --addr "$socket" \
  --otel-socket-path "$otel_socket" \
  --root "${BUILDKIT_STATE_DIR:-/home/builder/.local/share/buildkit}" \
  --oci-worker-no-process-sandbox \
  >/tmp/buildkitd.log 2>&1 &
buildkit_pid=$!

cleanup() {
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

exec node /app/skills/buster-pipeline.ts
