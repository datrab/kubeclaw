#!/usr/bin/env bash
# kubectl exec does not inherit the supervisor's child-process environment.
set -euo pipefail
KUBECLAW_MCP_TOKEN=$(cat /var/run/kubeclaw-ops/bearer/token)
if (( ${#KUBECLAW_MCP_TOKEN} < 32 )); then
  echo 'MCP bearer is missing or too short; check the mounted Secret' >&2
  exit 1
fi
export KUBECLAW_MCP_TOKEN
# Explicit environment-backed config is used by the supervised daemon. Update
# only this named server for interactive sessions on an existing persistent home.
python3 - <<'PYCONFIG'
import json, os, re
from pathlib import Path
p = Path.home() / '.codex/config.toml'
s = p.read_text()
section = '[mcp_servers.kubeclaw_ops]\nurl = ' + json.dumps(os.environ.get('OPS_MCP_URL', 'https://codex-ops-mcp.kubeclaw-ops.svc:8080/mcp')) + '\nbearer_token_env_var = "KUBECLAW_MCP_TOKEN"\n'
s = re.sub(r'(?ms)^\[mcp_servers\.kubeclaw_ops\]\n.*?(?=^\[|\Z)', lambda _: section + '\n', s) if '[mcp_servers.kubeclaw_ops]' in s else s + '\n' + section
p.write_text(s)
PYCONFIG
exec bash "$@"
