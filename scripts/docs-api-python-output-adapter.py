"""Execute original producer functions with no process, credential or network access."""
import ast
import contextlib
import io
import json
import sys
import types
from pathlib import Path

source = Path(sys.argv[1]).read_text()
tree = ast.parse(source)
if len(sys.argv) > 2 and sys.argv[2] == '--classify':
    declarations = {node.targets[0].id: node.value for node in ast.walk(tree) if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)}
    serializers = {'json.dumps', 'json.dump', 'yaml.dump', 'yaml.safe_dump'}
    for item in ast.walk(tree):
        if isinstance(item, ast.Import):
            for alias in item.names:
                if alias.name in ('json', 'yaml'):
                    serializers.update((alias.asname or alias.name) + '.' + method for method in (('dumps', 'dump') if alias.name == 'json' else ('dump', 'safe_dump')))
        if isinstance(item, ast.ImportFrom) and item.module in ('json', 'yaml'):
            for alias in item.names:
                if alias.name in ('dumps', 'dump', 'safe_dump'): serializers.add(alias.asname or alias.name)
    def serializer(node, seen=frozenset()):
        if ast.unparse(node) in serializers: return True
        return isinstance(node, ast.Name) and node.id in declarations and node.id not in seen and serializer(declarations[node.id], seen | {node.id})
    def output_sink(node, seen=frozenset()):
        if serializer(node) or ast.unparse(node) == 'print' or isinstance(node, ast.Attribute) and node.attr in ('write', 'write_text', 'write_bytes'): return True
        return isinstance(node, ast.Name) and node.id in declarations and node.id not in seen and output_sink(declarations[node.id], seen | {node.id})
    def role(node, seen=frozenset()):
        if isinstance(node, ast.Call) and serializer(node.func) and node.args: return role(node.args[0], seen)
        if isinstance(node, ast.Name) and node.id in declarations and node.id not in seen:
            return role(declarations[node.id], seen | {node.id})
        if isinstance(node, ast.Dict) and all(isinstance(key, ast.Constant) and isinstance(key.value, str) for key in node.keys):
            keys = [key.value for key in node.keys]
            return 'api' if 'apiVersion' in keys and 'kind' in keys else 'non-api'
        if isinstance(node, (ast.Constant, ast.List, ast.Tuple)):
            if isinstance(node, ast.Constant): return 'non-api'
            roles = [role(item, seen) for item in node.elts]
            return 'unknown' if 'unknown' in roles else 'api' if 'api' in roles else 'non-api'
        return 'unknown'
    outputs = [{'line': node.lineno, 'expression': ast.unparse(node), 'role': role(node.args[0]) if node.args else 'unknown'} for node in ast.walk(tree) if isinstance(node, ast.Call) and output_sink(node.func)]
    print(json.dumps(outputs))
    sys.exit(0)
# Compile only function definitions. Imports, module initialization and main
# never execute. Every external capability is provided by an offline stub.
initializers = [node for node in tree.body if isinstance(node, ast.Assign)]
for node in initializers:
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            assert isinstance(child.func, ast.Attribute) and ast.unparse(child.func) == 'os.environ.get', 'API_PRODUCT_PYTHON_INITIALIZER_UNQUALIFIED'
functions = ast.Module(body=initializers + [node for node in tree.body if isinstance(node, ast.FunctionDef)], type_ignores=[])
outputs = []
for profile in ['missing', 'optional', 'retained', 'copy-disabled']:
    env = {'KUBE_CONTEXT': 'synthetic-offline', 'OPS_NAMESPACE': 'discovery-ops', 'OPS_COPY_PULL_SECRET': '0' if profile == 'copy-disabled' else '1'}
    if profile == 'optional':
        env.update(OPS_GITHUB_TOKEN_FILE='synthetic/github', OPS_TAILSCALE_AUTHKEY_FILE='synthetic/tailscale')
    inputs = []
    def kube(args, data=None):
        inputs.append({'args': args, 'response': 'synthetic'})
        if args[0] == 'apply':
            outputs.append({'value': json.loads(data), 'profile': profile, 'inputs': list(inputs), 'environment': env})
            return ''
        if args[:3] == ['get', 'secret', 'ghcr-secret'] and args[-1] == 'kubeclaw':
            return json.dumps({'type': 'kubernetes.io/dockerconfigjson', 'data': {'.dockerconfigjson': 'c3ludGhldGlj'}})
        if profile == 'retained':
            return json.dumps({'metadata': {'name': args[2]}})
        return ''
    class SyntheticPath:
        def __init__(self, name):
            assert name in ['synthetic/github', 'synthetic/tailscale'], 'API_PRODUCT_PYTHON_FILE_UNQUALIFIED'
        def read_text(self):
            return 'synthetic-safe-payload'
    def blocked(*args, **kwargs):
        raise RuntimeError('API_PRODUCT_PYTHON_EXTERNAL_EFFECT_BLOCKED')
    namespace = {'__builtins__': {name: getattr(__import__('builtins'), name) for name in ['print','list','dict','set','sorted','str','len','SystemExit','RuntimeError']}, 'json': json, 'os': types.SimpleNamespace(environ=env), 'namespace': 'discovery-ops',
                 'Path': SyntheticPath, 'secrets': types.SimpleNamespace(token_urlsafe=lambda size: 'synthetic-token'),
                 'subprocess': types.SimpleNamespace(run=blocked), 'base': [], 'kube': kube}
    exec(compile(functions, sys.argv[1], 'exec'), namespace)
    namespace['kube'] = kube
    with contextlib.redirect_stdout(io.StringIO()):
        namespace['setup_secrets']()
print(json.dumps(outputs))
