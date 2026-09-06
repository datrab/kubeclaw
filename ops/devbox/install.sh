#!/usr/bin/env bash
set -euo pipefail
# Run on the dedicated Debian/Ubuntu devbox after reviewing the source and
# running `npm ci --ignore-scripts` in tools/ops-mcp as an unprivileged user.
test "$EUID" -eq 0 || { echo 'Run installer as root on the devbox' >&2; exit 1; }
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
for executable in /usr/bin/node /usr/bin/python3 /usr/bin/ssh /usr/bin/systemctl; do
  test -x "$executable" || { echo "Missing $executable" >&2; exit 1; }
done
/usr/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
test -d "$repo/tools/ops-mcp/node_modules/@modelcontextprotocol/server" || {
  echo 'First install the locked ops-mcp dependencies as an unprivileged user' >&2; exit 1;
}
getent group kubeclaw-mcp-client >/dev/null || groupadd --system kubeclaw-mcp-client
for account in kubeclaw-mcp kubeclaw-codex; do
  id "$account" >/dev/null 2>&1 || useradd --system --user-group --create-home \
    --home-dir "/var/lib/$account" --shell /bin/bash "$account"
  usermod -a -G kubeclaw-mcp-client "$account"
done
install -d -o root -g root -m 0755 /opt/kubeclaw-ops /etc/kubeclaw-ops
install -d -o kubeclaw-mcp -g kubeclaw-mcp -m 0700 /var/lib/kubeclaw-ops
install -d -o kubeclaw-codex -g kubeclaw-codex -m 0700 /var/lib/kubeclaw-codex/workspace
# Stage a complete runtime so deleted source/dependency files cannot survive an
# upgrade. Retain the previous release for operator-controlled rollback.
stage=$(mktemp -d /opt/kubeclaw-ops/.mcp-stage.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
cp -R "$repo/tools/ops-mcp/src" "$repo/tools/ops-mcp/node_modules" "$stage/"
install -m 0644 "$repo/tools/ops-mcp/package.json" "$stage/package.json"
chown -R root:root "$stage"
chmod -R go-w "$stage"
chmod 0755 "$stage"
systemctl stop kubeclaw-ops-mcp.service 2>/dev/null || true
if test -e /opt/kubeclaw-ops/mcp; then
  mv /opt/kubeclaw-ops/mcp "/opt/kubeclaw-ops/mcp.previous.$(date +%s%N)"
fi
mv "$stage" /opt/kubeclaw-ops/mcp
install -m 0755 "$repo/ops/devbox/renew-token.py" "$repo/ops/devbox/codex-remote.sh" /opt/kubeclaw-ops/
for file in "$repo"/ops/devbox/systemd/*; do install -m 0644 "$file" /etc/systemd/system/; done
if ! test -e /etc/kubeclaw-ops/client-token; then
  (umask 0077; /usr/bin/python3 -c 'import secrets; print(secrets.token_urlsafe(48))' > /etc/kubeclaw-ops/client-token)
fi
chown root:kubeclaw-mcp-client /etc/kubeclaw-ops/client-token
chmod 0640 /etc/kubeclaw-ops/client-token
for name in ops.env ssh_config; do
  if ! test -e "/etc/kubeclaw-ops/$name"; then
    install -o root -g kubeclaw-mcp -m 0640 "$repo/ops/devbox/$name.example" "/etc/kubeclaw-ops/$name"
  fi
done
systemctl daemon-reload
echo 'Installed, not started. Complete docs/ops/external-devbox.md activation and acceptance.'
