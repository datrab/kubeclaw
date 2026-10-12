"""Original deploy entry point and actual kubectl; local HTTP API and Helm fixtures only."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import json
import base64
import os
import shutil
import subprocess
import tempfile
import threading

scenario = 'empty'
requests = []
kubectl = shutil.which('kubectl')
assert kubectl
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def reply(self, code, body):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
    def do_GET(self):
        url = urlsplit(self.path)
        requests.append({'method': 'GET', 'path': url.path, 'query': parse_qs(url.query)})
        if url.path == '/api/v1/namespaces':
            assert parse_qs(url.query)['fieldSelector'] == ['metadata.name=guard-test']
            if scenario in ['404', '403']:
                self.reply(int(scenario), {'kind': 'Status', 'apiVersion': 'v1', 'status': 'Failure',
                    'reason': 'NotFound' if scenario == '404' else 'Forbidden', 'code': int(scenario),
                    'message': 'independent simulated API failure'})
                return
            items = [] if scenario == 'empty' else [{'apiVersion': 'v1', 'kind': 'Namespace',
                'metadata': {'name': 'other' if scenario == 'wrong-name' else 'guard-test'}}]
            body = {'kind': 'NamespaceList', 'apiVersion': 'v1', 'items': items}
        elif url.path == '/api/v1':
            body = {'kind': 'APIResourceList', 'apiVersion': 'v1', 'groupVersion': 'v1',
                    'resources': [{'name': 'namespaces', 'singularName': 'namespace',
                     'namespaced': False, 'kind': 'Namespace', 'verbs': ['get', 'list', 'create']}]}
        elif url.path == '/api':
            body = {'kind': 'APIVersions', 'versions': ['v1'], 'serverAddressByClientCIDRs': []}
        else:
            body = {'kind': 'APIGroupList', 'apiVersion': 'v1', 'groups': []}
        self.reply(200, body)
    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        requests.append({'method': 'POST', 'path': self.path,
                         'content_type': self.headers.get('Content-Type'),
                         'body_base64': base64.b64encode(body).decode()})
        self.reply(201, {'apiVersion': 'v1', 'kind': 'Namespace',
                         'metadata': {'name': 'guard-test'}})
server = HTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix='independent-real-kubectl-') as temporary:
        directory = Path(temporary)
        config = directory / 'config'
        config.write_text(json.dumps({'apiVersion': 'v1', 'kind': 'Config',
          'clusters': [{'name': 'fixture', 'cluster': {'server': f'http://127.0.0.1:{server.server_port}'}}],
          'contexts': [{'name': 'fixture', 'context': {'cluster': 'fixture'}}],
          'current-context': 'fixture'}))
        wrapper = directory / 'kubectl'
        wrapper.write_text(f'#!/bin/sh\nexec "{kubectl}" --kubeconfig="{config}" --cache-dir="{directory / "cache"}" "$@"\n')
        wrapper.chmod(0o755)
        helm = directory / 'helm'
        helm.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$HELM_CALLS"\n')
        helm.chmod(0o755)
        calls = directory / 'helm-calls'
        env = dict(os.environ, PATH=str(directory)+':'+os.environ['PATH'],
            NAMESPACE='guard-test', KUBECLAW_WORKSPACE_PROMPT='false',
            KUBECLAW_RUN_SECRET_SETUP='false', HELM_CALLS=str(calls))
        for scenario in ['empty', 'present', 'wrong-name', '404', '403']:
            requests.clear()
            calls.write_text('')
            result = subprocess.run(['bash', str(Path.cwd() / 'scripts/deploy.sh'), 'setup'],
                                    env=env, capture_output=True, text=True, timeout=20)
            helm_calls = calls.read_text().splitlines()
            posts = [request for request in requests if request['method'] == 'POST']
            print(json.dumps({'scenario': scenario, 'exit': result.returncode,
                 'requests': requests, 'helm': helm_calls,
                 'stdout': result.stdout, 'stderr': result.stderr}), flush=True)
            if scenario in ['empty', 'present']:
                assert result.returncode == 0 and len(helm_calls) == 3
                assert len(posts) == (1 if scenario == 'empty' else 0)
                if posts:
                    assert b'guard-test' in base64.b64decode(posts[0]['body_base64'])
                    assert posts[0]['path'] == '/api/v1/namespaces?fieldManager=kubectl-create&fieldValidation=Strict'
            else:
                assert result.returncode != 0 and posts == [] and helm_calls == []
        print('PASS: 5 original deploy.sh scenarios with actual kubectl and local HTTP API fixture')
finally:
    server.shutdown()
