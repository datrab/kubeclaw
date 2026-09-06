#!/usr/bin/python3
"""Read-only live checks. Run as kubeclaw-mcp after setting ops.env in the shell.

This never induces an outage. Disaster drills and mobile pairing remain separate.
"""
import json
import os
import subprocess
import tempfile
import urllib.request

def run(args):
    return subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=30, check=False)

api = os.environ['KUBERNETES_API_URL']
config = {
    'apiVersion': 'v1', 'kind': 'Config', 'current-context': 'external-observer',
    'clusters': [{'name': 'direct-host', 'cluster': {'server': api, 'certificate-authority': os.environ['KUBERNETES_CA_FILE']}}],
    'users': [{'name': 'observer', 'user': {'tokenFile': os.environ['KUBERNETES_TOKEN_FILE']}}],
    'contexts': [{'name': 'external-observer', 'context': {'cluster': 'direct-host', 'user': 'observer', 'namespace': 'kubeclaw'}}],
}
checks = []
with tempfile.NamedTemporaryFile(mode='w') as stream:
    json.dump(config, stream)
    stream.flush()
    base = ['kubectl', '--kubeconfig', stream.name, '--request-timeout=15s']
    for command in [['get', 'pods', '-n', 'kubeclaw', '-o', 'name'], ['get', 'nodes', '-o', 'name'],
                    ['get', 'applications.argoproj.io', '-n', 'argocd', '-o', 'name']]:
        result = run(base + command)
        checks.append({'check': ' '.join(command), 'passed': result.returncode == 0})
    for verb, resource, namespace in [('get', 'secrets', 'kubeclaw'), ('create', 'pods/exec', 'kubeclaw'),
            ('patch', 'deployments', 'kubeclaw'), ('get', 'pods', 'paperless'),
            ('create', 'serviceaccounts/token', 'kubeclaw-ops'), ('patch', 'applications.argoproj.io', 'argocd'),
            ('get', 'nodes/proxy', 'default')]:
        result = run(base + ['auth', 'can-i', verb, resource, '-n', namespace])
        checks.append({'check': f'deny {verb} {resource} in {namespace}',
                       'passed': result.returncode == 1 and result.stdout.strip() == b'no'})
result = run(['/usr/bin/ssh', '-F', '/etc/kubeclaw-ops/ssh_config', '-T', 'kubeclaw-diagnostics'])
try:
    report = json.loads(result.stdout)
    checks.append({'check': 'independent SSH host snapshot', 'passed': result.returncode == 0 and bool(report['hostname'])})
except (ValueError, KeyError):
    checks.append({'check': 'independent SSH host snapshot', 'passed': False})
token = open(os.environ['OPS_MCP_BEARER_TOKEN_FILE']).read().strip()
request = urllib.request.Request('http://127.0.0.1:8080/mcp',
    data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'host_diagnostics', 'arguments': {}}}).encode(),
    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
try:
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read().decode()
        if response.headers.get_content_type() == 'text/event-stream':
            messages = [json.loads(line[5:]) for line in body.splitlines() if line.startswith('data:')]
            reply = next(message for message in messages if message.get('id') == 1)
        else:
            reply = json.loads(body)
        checks.append({'check': 'real MCP host tool round trip', 'passed': bool(reply.get('result')) and not reply['result'].get('isError', False)})
except Exception:
    checks.append({'check': 'real MCP host tool round trip', 'passed': False})
print(json.dumps({'checks': checks, 'scope': 'Live read-only acceptance; no outage, restore or mobile pairing proof'}, indent=2))
raise SystemExit(0 if all(check['passed'] for check in checks) else 1)
