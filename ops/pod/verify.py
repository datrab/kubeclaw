#!/usr/bin/env python3
"""Real in-pod MCP verification; no fixture responses or outage injection."""
import json
import os
import sys
from pathlib import Path
import urllib.request

if 'OPS_MCP_POLICY_FILE' in os.environ:
    # This file is piped to `python3 -`; its source directory is not on sys.path.
    sys.path.insert(0, '/opt/codex')
    from runtime_policy import load_supervisor_policy
    mcp_url, _ = load_supervisor_policy(os.environ['OPS_MCP_POLICY_FILE'])
else:
    mcp_url = 'http://127.0.0.1:8080/mcp'

token = Path('/var/run/kubeclaw-ops/bearer/token').read_text().strip()

def call(method, params):
    request = urllib.request.Request(mcp_url,
        data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode()
        if response.headers.get_content_type() == 'text/event-stream':
            messages = [json.loads(line[5:]) for line in body.splitlines() if line.startswith('data:')]
            reply = next(message for message in messages if message.get('id') == 1)
        else:
            reply = json.loads(body)
    if 'error' in reply or reply.get('result', {}).get('isError'):
        raise SystemExit('MCP returned an error for ' + method + ' ' + str(params.get('name', '')))
    return reply['result']

exec_namespaces = [item for item in os.environ.get('OPS_EXEC_NAMESPACES', '').split(',') if item]
assert Path('/var/run/secrets/kubernetes.io/serviceaccount/token').exists() == bool(exec_namespaces), 'Codex API token mount must match exec configuration'
if exec_namespaces:
    import subprocess
    for namespace in exec_namespaces:
        for verb in ['get', 'create']:
            subprocess.run(['kubectl', 'auth', 'can-i', verb, 'pods', '--subresource=exec', '-n', namespace, '--quiet'], check=True)
tools = call('tools/list', {})['tools']
assert any(tool['name'] == 'namespace_overview' for tool in tools)
call('tools/call', {'name': 'namespace_overview', 'arguments': {'namespace': os.environ['OPS_DEFAULT_NAMESPACE']}})
call('tools/call', {'name': 'platform_cluster_state', 'arguments': {'resource': 'nodes'}})
print('PASS: actual MCP tools, Kubernetes reads and configured Codex exec authorization. No command executed in target pods. Pairing and pipeline health require separate live observation.')
