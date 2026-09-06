#!/usr/bin/env python3
"""Real in-pod MCP verification; no fixture responses or outage injection."""
import json
from pathlib import Path
import urllib.request

token = Path('/var/run/kubeclaw-ops/bearer/token').read_text().strip()

def call(method, params):
    request = urllib.request.Request('http://127.0.0.1:8080/mcp',
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

assert not Path('/var/run/secrets/kubernetes.io/serviceaccount/token').exists(), 'Codex must not mount the observer token'
tools = call('tools/list', {})['tools']
assert any(tool['name'] == 'namespace_overview' for tool in tools)
call('tools/call', {'name': 'namespace_overview', 'arguments': {'namespace': 'kubeclaw'}})
call('tools/call', {'name': 'platform_cluster_state', 'arguments': {'resource': 'nodes'}})
print('PASS: actual MCP tools, Kubernetes reads and Codex credential isolation. Pairing and pipeline health require separate live observation.')
