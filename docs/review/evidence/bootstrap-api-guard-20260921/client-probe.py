"""Actual kubectl against a local API HTTP fixture; no real cluster claim."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit
import threading
import subprocess
import json

scenario = 'empty'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = urlsplit(self.path).path
        code = 200
        if path == '/api/v1/namespaces':
            if scenario == '404':
                code = 404
                body = {'kind': 'Status', 'apiVersion': 'v1', 'status': 'Failure',
                        'reason': 'NotFound', 'code': 404,
                        'message': 'the server could not find the requested resource'}
            else:
                body = {'kind': 'NamespaceList', 'apiVersion': 'v1', 'items': []}
        elif path == '/api/v1':
            body = {'kind': 'APIResourceList', 'apiVersion': 'v1', 'groupVersion': 'v1',
                    'resources': [{'name': 'namespaces', 'singularName': 'namespace',
                                   'namespaced': False, 'kind': 'Namespace', 'verbs': ['get', 'list']}]}
        elif path == '/api':
            body = {'kind': 'APIVersions', 'versions': ['v1'], 'serverAddressByClientCIDRs': []}
        else:
            body = {'kind': 'APIGroupList', 'apiVersion': 'v1', 'groups': []}
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())


server = HTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    for scenario in ['empty', '404']:
        result = subprocess.run(['kubectl', '--server=http://127.0.0.1:' + str(server.server_port),
                                 'get', 'namespaces', '--field-selector', 'metadata.name=guard-test',
                                 '-o', 'json'], capture_output=True, text=True, timeout=15)
        print(json.dumps({'scenario': scenario, 'exit': result.returncode,
                          'stdout': result.stdout, 'stderr': result.stderr}))
        if scenario == 'empty':
            assert result.returncode == 0
            assert json.loads(result.stdout) == {'apiVersion': 'v1', 'kind': 'List',
                                                'items': [], 'metadata': {'resourceVersion': ''}}
        else:
            assert result.returncode != 0
finally:
    server.shutdown()
