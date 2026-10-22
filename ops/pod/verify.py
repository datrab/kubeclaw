#!/usr/bin/env python3
"""Real in-pod MCP verification; no fixture responses or outage injection."""
import json
import os
from pathlib import Path
import urllib.request
import ssl
context = ssl.create_default_context(cafile='/var/run/kubeclaw-ops/ca/ca.crt')

token = Path('/var/run/kubeclaw-ops/bearer/token').read_text().strip()

def call(method, params):
    request = urllib.request.Request(os.environ['OPS_MCP_URL'],
        data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
    with urllib.request.urlopen(request, timeout=60, context=context) as response:
        body = response.read().decode()
        if response.headers.get_content_type() == 'text/event-stream':
            messages = [json.loads(line[5:]) for line in body.splitlines() if line.startswith('data:')]
            reply = next(message for message in messages if message.get('id') == 1)
        else:
            reply = json.loads(body)
    if 'error' in reply or reply.get('result', {}).get('isError'):
        raise SystemExit('MCP returned an error for ' + method + ' ' + str(params.get('name', '')))
    return reply['result']

assert not Path('/var/run/secrets/kubernetes.io/serviceaccount/token').exists(), 'Codex must have no Kubernetes token'
assert not os.environ.get('KUBECONFIG'), 'Codex must have no injected kubeconfig'
tools = call('tools/list', {})['tools']
assert any(tool['name'] == 'namespace_overview' for tool in tools)
call('tools/call', {'name': 'namespace_overview', 'arguments': {'namespace': os.environ['OPS_DEFAULT_NAMESPACE']}})
call('tools/call', {'name': 'platform_cluster_state', 'arguments': {'resource': 'nodes'}})
print('PASS: central MCP tools, mediated Kubernetes reads and absence of a Codex API token. No command executed in target pods. Pairing and pipeline health require separate live observation.')
