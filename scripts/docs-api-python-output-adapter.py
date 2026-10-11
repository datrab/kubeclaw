"""Execute original producer functions with no process, credential or network access."""
import ast
import contextlib
import copy
import io
import ipaddress
import hashlib
import json
import sys
import types
from pathlib import Path

source = Path(sys.argv[1]).read_text()
tree = ast.parse(source)
# Closed AST recipes bind each selected constructor, transfer and public sink.
# They are deliberately finite: an unfamiliar source construct requires review,
# even after generated artifacts or registry source digests are refreshed. These
# recipes are compared as syntax trees, never as a module/source hash approval.
BOOTSTRAP_RECIPES = r'''
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
context = os.environ['KUBE_CONTEXT']
namespace = os.environ.get('OPS_NAMESPACE', 'kubeclaw-ops')
base = ['kubectl', '--context', context, '--request-timeout=20s']
def kube(args, data=None):
    result = subprocess.run(base + args, input=data, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise SystemExit('kubectl failed during Ops Pod setup; check context, permissions and named resource availability')
    return result.stdout
def get(kind, name, ns=None):
    args = ['get', kind, name, '--ignore-not-found', '-o', 'json']
    if ns:
        args += ['-n', ns]
    text = kube(args).strip()
    return json.loads(text) if text else None
def apply_secret(name, values):
    kube(['apply', '-f', '-'], json.dumps({'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': name, 'namespace': namespace}, 'type': 'Opaque', 'stringData': values}))
def discover():
    endpoints = get('endpoints', 'kubernetes', 'default')
    service = get('service', 'kubernetes', 'default')
    if not endpoints or not service:
        raise SystemExit('Kubernetes API endpoint discovery failed')
    addresses = [a['ip'] for s in endpoints.get('subsets', []) for a in s.get('addresses', [])]
    addresses += service['spec'].get('clusterIPs', [service['spec']['clusterIP']])
    cidrs = sorted({str(ipaddress.ip_network(ipaddress.ip_address(address))) for address in addresses})
    ports = {p['port'] for s in endpoints.get('subsets', []) for p in s.get('ports', []) if p.get('name') == 'https'}
    if not cidrs or len(ports) != 1:
        raise SystemExit('Expected ready Kubernetes API addresses and one https endpoint port')
    namespaces = [namespace]
    requested = os.environ.get('OPS_READ_NAMESPACES', 'kubeclaw,argocd,kube-system,cilium,tailscale,spire-server,spire-system').split(',')
    for name in requested:
        name = name.strip()
        if not name:
            continue
        if get('namespace', name):
            namespaces.append(name)
    cilium = get('crd', 'ciliumnetworkpolicies.cilium.io') is not None
    return {'rbac': {'namespaces': list(dict.fromkeys(namespaces))}, 'networkPolicy': {'apiServerCIDRs': cidrs, 'apiServerPort': ports.pop(), 'cilium': cilium}}
def setup_secrets():
    if not get('secret', 'codex-ops-bearer', namespace):
        apply_secret('codex-ops-bearer', {'token': secrets.token_urlsafe(48)})
    if os.environ.get('OPS_COPY_PULL_SECRET', '1') == '1' and (not get('secret', 'ghcr-secret', namespace)):
        source = get('secret', 'ghcr-secret', os.environ.get('OPS_PULL_SECRET_SOURCE_NAMESPACE', 'kubeclaw'))
        if not source:
            raise SystemExit('Missing ghcr-secret. Create it in the Ops namespace or select a valid source namespace.')
        kube(['apply', '-f', '-'], json.dumps({'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': 'ghcr-secret', 'namespace': namespace}, 'type': source['type'], 'data': source['data']}))
    for variable, name, key in [('OPS_GITHUB_TOKEN_FILE', 'codex-ops-github', 'token'), ('OPS_TAILSCALE_AUTHKEY_FILE', 'codex-ops-tailscale', 'authkey')]:
        if os.environ.get(variable):
            value = Path(os.environ[variable]).read_text().strip()
            if not value:
                raise SystemExit(variable + ' contains an empty credential')
            apply_secret(name, {key: value})
    print('Ops credentials prepared; existing bearer and pull credentials retained')
if __name__ == '__main__':
    if sys.argv[1:] == ['discover']:
        print(json.dumps(discover(), indent=2))
    elif sys.argv[1:] == ['secrets']:
        setup_secrets()
    else:
        raise SystemExit('Usage: bootstrap.py discover|secrets')
'''

def bootstrap_credential_recipe(actual, recipe):
    """A finite constructor/roundtrip language; actual bytes still reach stubs."""
    normalized = copy.deepcopy(actual)
    dump = lambda node: ast.dump(node, include_attributes=False)
    def finite_value(node):
        if isinstance(node, ast.Constant): return isinstance(node.value, (str, int, float, bool, type(None)))
        if isinstance(node, ast.Name): return node.id in ('name', 'namespace', 'values')
        if isinstance(node, ast.Subscript): return isinstance(node.value, ast.Name) and node.value.id == 'source' and isinstance(node.slice, ast.Constant) and node.slice.value in ('type', 'data')
        if isinstance(node, (ast.List, ast.Tuple)): return all(finite_value(value) for value in node.elts)
        if isinstance(node, ast.Dict): return all(isinstance(key, ast.Constant) and isinstance(key.value, str) and finite_value(value) for key, value in zip(node.keys, node.values))
        return False
    # Preserve producer flow/branch/caller syntax, but evaluate all supported
    # literal resource fields from actual source rather than freezing their bytes.
    if actual.name in ('apply_secret', 'setup_secrets'):
        expected_dicts = [node for node in ast.walk(recipe) if isinstance(node, ast.Dict) and any(isinstance(key, ast.Constant) and key.value == 'apiVersion' for key in node.keys)]
        actual_dicts = [node for node in ast.walk(normalized) if isinstance(node, ast.Dict) and any(isinstance(key, ast.Constant) and key.value == 'apiVersion' for key in node.keys)]
        if len(actual_dicts) != len(expected_dicts): return False
        for constructor, selected in zip(actual_dicts, expected_dicts):
            if not finite_value(constructor): return False
            keys = [key.value for key in constructor.keys]
            if len(keys) != len(set(keys)): return False
            fields = dict(zip(keys, constructor.values))
            if not all(isinstance(fields.get(key), ast.Constant) and fields[key].value == value for key, value in (('apiVersion', 'v1'), ('kind', 'Secret'))): return False
            if not {'metadata', 'type'} <= set(fields) or not ({'stringData', 'data'} & set(fields)): return False
            constructor.keys, constructor.values = copy.deepcopy(selected.keys), copy.deepcopy(selected.values)
    if actual.name == 'kube':
        # Optional data-only JSON roundtrip mutations before original transport.
        # The mutable payload is derived only from original data; literal field
        # changes are recaptured at the real subprocess input boundary.
        if normalized.body and isinstance(normalized.body[0], ast.If) and dump(normalized.body[0].test) == dump(ast.Name(id='data', ctx=ast.Load())):
            branch = normalized.body[0]
            if branch.orelse or len(branch.body) < 3: return False
            start, finish = branch.body[0], branch.body[-1]
            if dump(start) != dump(ast.parse('payload = json.loads(data)').body[0]) or dump(finish) != dump(ast.parse('data = json.dumps(payload)').body[0]): return False
            for item in branch.body[1:-1]:
                if not isinstance(item, ast.Assign) or len(item.targets) != 1: return False
                target = item.targets[0]
                if not isinstance(target, ast.Subscript) or not isinstance(target.value, ast.Name) or target.value.id != 'payload' or not isinstance(target.slice, ast.Constant) or not isinstance(target.slice.value, str) or target.slice.value in ('apiVersion', 'kind') or not finite_value(item.value): return False
            normalized.body.pop(0)
        actual_calls = [node for node in ast.walk(normalized) if isinstance(node, ast.Call) and ast.unparse(node.func) == 'subprocess.run']
        expected_call = next(node for node in ast.walk(recipe) if isinstance(node, ast.Call) and ast.unparse(node.func) == 'subprocess.run')
        if len(actual_calls) != 1 or len(actual_calls[0].args) != 1: return False
        command = actual_calls[0].args[0]
        # Command construction always passes the original offline transport
        # guard. A finite literal replacement cannot run a real process and
        # must still fail that guard rather than gain an output exemption.
        if dump(command) != dump(expected_call.args[0]) and not (isinstance(command, ast.List) and all(isinstance(value, ast.Constant) and isinstance(value.value, str) for value in command.elts)): return False
        actual_calls[0].args[0] = copy.deepcopy(expected_call.args[0])
    return dump(normalized) == dump(recipe)

def bootstrap_audit_facts():
    expected = ast.parse(BOOTSTRAP_RECIPES)
    dump = lambda node: ast.dump(node, include_attributes=False)
    actual_functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
    expected_functions = {node.name: node for node in expected.body if isinstance(node, ast.FunctionDef)}
    facts = {}
    for symbol, recipe in expected_functions.items():
        nodes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == symbol]
        actual = actual_functions.get(symbol)
        facts[symbol] = {'symbol': symbol, 'operation': dump(actual) if actual else '',
                         'sha256': hashlib.sha256(dump(actual).encode()).hexdigest() if actual else None,
                         'qualified': len(nodes) == 1 and actual is not None and bootstrap_credential_recipe(actual, recipe)}
    # Immutable imports, selected module inputs and the actual command dispatcher
    # form separate dependencies. Reject shadowing/rebinding and module effects.
    expected_module = [node for node in expected.body if not isinstance(node, ast.FunctionDef)]
    actual_module = [node for node in tree.body if not isinstance(node, ast.FunctionDef) and not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str))]
    module = ast.Module(body=actual_module, type_ignores=[])
    normalized_module = copy.deepcopy(module)
    for node in normalized_module.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'namespace' and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            node.value = copy.deepcopy(next(item.value for item in expected_module if isinstance(item, ast.Assign) and isinstance(item.targets[0], ast.Name) and item.targets[0].id == 'namespace'))
    facts['public-dispatch-and-bindings'] = {'symbol': 'public-dispatch-and-bindings', 'operation': dump(module),
        'sha256': hashlib.sha256(dump(module).encode()).hexdigest(),
        'qualified': dump(normalized_module) == dump(ast.Module(body=expected_module, type_ignores=[])) and sorted(actual_functions) == sorted(expected_functions)}
    groups = {'discover': ['discover', 'get', 'kube', 'public-dispatch-and-bindings'],
              'secrets': ['setup_secrets', 'apply_secret', 'get', 'kube', 'public-dispatch-and-bindings']}
    entries = {name: all(facts[symbol]['qualified'] for symbol in symbols) for name, symbols in groups.items()}
    return facts, groups, entries

def patch_profiles():
    """Run original patch construction and argv at the subprocess boundary."""
    assignments = [node for node in tree.body if isinstance(node, ast.Assign)]
    for node in assignments:
        ast.literal_eval(node.value)  # no module-side process or file effects
    program = ast.Module(body=assignments + [node for node in tree.body if isinstance(node, ast.FunctionDef)], type_ignores=[])
    results, outcomes = [], []
    for profile in ('reverse-apply', 'ordered', 'reverse-dry-run', 'unexpected', 'missing-context', 'transport-failure'):
        env = {} if profile == 'missing-context' else {'KUBE_CONTEXT': 'synthetic-offline'}
        inputs, submitted = [], []
        class Parser:
            def __init__(self, **kwargs): pass
            def add_argument(self, *args, **kwargs):
                assert args == ('--apply',) and kwargs.get('action') == 'store_true', 'API_PRODUCT_PYTHON_PATCH_OPTIONS_UNQUALIFIED'
            def parse_args(self): return types.SimpleNamespace(apply=profile != 'reverse-dry-run')
        def read(command, text=None):
            assert command[:3] == ['kubectl', '--context', env['KUBE_CONTEXT']] and command[3:5] == ['get', 'validatingwebhookconfiguration'] and command[6:] == ['-o', 'json'] and text is True, 'API_PRODUCT_PYTHON_PATCH_RECEIVER_UNQUALIFIED'
            receiver = {'apiVersion': 'admissionregistration.k8s.io/v1', 'kind': 'ValidatingWebhookConfiguration', 'resource': command[4], 'name': command[5], 'patchType': 'json'}
            inputs.append({'command': command, 'receiver': receiver})
            names = list(namespace['ORDER'])
            if profile != 'ordered': names.reverse()
            if profile == 'unexpected': names[0] = 'unexpected.synthetic'
            return json.dumps({'metadata': {'resourceVersion': 'synthetic-version'}, 'webhooks': [{'name': name, 'clientConfig': {'caBundle': 'synthetic-ca'}} for name in names]})
        def run(command, check=None):
            assert check is True and len(command) == 9 and command[:3] == ['kubectl', '--context', env['KUBE_CONTEXT']] and command[3:5] == ['patch', 'validatingwebhookconfiguration'] and command[6:8] == ['--type=json', '-p'], 'API_PRODUCT_PYTHON_PATCH_TRANSPORT_UNQUALIFIED'
            assert inputs and command[5] == inputs[-1]['receiver']['name'], 'API_PRODUCT_PYTHON_PATCH_RECEIVER_UNQUALIFIED'
            operations = json.loads(command[8])
            assert isinstance(operations, list) and operations, 'API_PRODUCT_PYTHON_PATCH_BODY_UNQUALIFIED'
            for operation in operations:
                assert isinstance(operation, dict) and operation.get('op') in ('test', 'move', 'copy', 'add', 'replace', 'remove'), 'API_PRODUCT_PYTHON_PATCH_OPERATION_UNQUALIFIED'
                required = {'op', 'path'} | ({'from'} if operation['op'] in ('move','copy') else {'value'} if operation['op'] in ('test','add','replace') else set())
                assert set(operation) == required, 'API_PRODUCT_PYTHON_PATCH_OPERATION_UNQUALIFIED'
                for key in ('path', 'from'):
                    if key not in operation: continue
                    pointer = operation[key]
                    assert isinstance(pointer, str) and pointer.startswith('/') and all('~' not in token.replace('~0','').replace('~1','') for token in pointer[1:].split('/')), 'API_PRODUCT_PYTHON_PATCH_POINTER_UNQUALIFIED'
            record = {'value': operations, 'profile': profile, 'inputs': list(inputs), 'environment': env, 'receiver': inputs[-1]['receiver'], 'patchOperations': operations}
            submitted.append(record)
            if profile == 'transport-failure': raise RuntimeError('synthetic transport failure')
            results.append(record)
        namespace = {'__builtins__': {name: getattr(__import__('builtins'), name) for name in ('print','list','set','len','ValueError','SystemExit')}, '__doc__': 'offline selected patch', 'argparse': types.SimpleNamespace(ArgumentParser=Parser), 'json': json, 'os': types.SimpleNamespace(environ=env), 'subprocess': types.SimpleNamespace(check_output=read, run=run)}
        exec(compile(program, sys.argv[1], 'exec'), namespace)
        try:
            with contextlib.redirect_stdout(io.StringIO()): namespace['main']()
            outcome = 'success'
        except (ValueError, SystemExit, RuntimeError) as error:
            outcome = type(error).__name__ + ': ' + str(error)
        outcomes.append({'profile': profile, 'outcome': outcome, 'submissions': [dict(item) for item in submitted], 'inputs': inputs})
        expected = {'unexpected':'ValueError', 'missing-context':'SystemExit', 'transport-failure':'RuntimeError'}.get(profile, 'success')
        assert outcome.startswith(expected), 'API_PRODUCT_PYTHON_PATCH_BRANCH_UNQUALIFIED'
    assert len(results) == 1, 'API_PRODUCT_PYTHON_PATCH_PUBLICATION_UNQUALIFIED'
    results[0]['profileOutcomes'] = outcomes
    return results

def bootstrap_discover_profiles():
    """Run the original selected public main through offline read boundaries."""
    facts, groups, entries = bootstrap_audit_facts()
    assert all(entries.values()), 'API_PRODUCT_PYTHON_BOOTSTRAP_PUBLIC_FLOW_UNQUALIFIED'
    program = ast.Module(body=[node for node in tree.body if isinstance(node, ast.Assign) or isinstance(node, ast.FunctionDef) and node.name in ('kube', 'get', 'discover') or isinstance(node, ast.If)], type_ignores=[])
    results = []
    for profile in ('ready', 'dual-stack', 'missing-endpoints', 'missing-service', 'empty-addresses', 'missing-port', 'multiple-ports', 'transport-failure', 'namespace-crd-absent'):
        env = {'KUBE_CONTEXT': 'synthetic-offline', 'OPS_NAMESPACE': 'discovery-ops',
               'OPS_READ_NAMESPACES': ' synthetic-present, ,synthetic-absent,synthetic-present '}
        reads = []
        def run(command, input=None, text=None, stdout=None, stderr=None):
            prefix = ['kubectl', '--context', env['KUBE_CONTEXT'], '--request-timeout=20s']
            assert isinstance(command, list) and command[:len(prefix)] == prefix and input is None and text is True and stdout == -1 and stderr == -1, 'API_PRODUCT_PYTHON_DISCOVER_TRANSPORT_UNQUALIFIED'
            args = command[len(prefix):]
            assert args[:1] == ['get'] and args[3:6] == ['--ignore-not-found', '-o', 'json'] and len(args) in (6, 8), 'API_PRODUCT_PYTHON_DISCOVER_READ_UNQUALIFIED'
            if len(args) == 8: assert args[6] == '-n', 'API_PRODUCT_PYTHON_DISCOVER_NAMESPACE_UNQUALIFIED'
            kind, name = args[1:3]
            if kind == 'endpoints' and name == 'kubernetes':
                assert args[-2:] == ['-n', 'default'], 'API_PRODUCT_PYTHON_DISCOVER_RECEIVER_UNQUALIFIED'
                addresses = [] if profile == 'empty-addresses' else [{'ip': '192.0.2.1'}] + ([{'ip': '2001:db8::1'}] if profile == 'dual-stack' else [])
                ports = [] if profile == 'missing-port' else [{'name': 'https', 'port': 6443}] + ([{'name': 'https', 'port': 443}] if profile == 'multiple-ports' else [])
                response = None if profile == 'missing-endpoints' else {'subsets': [{'addresses': addresses, 'ports': ports}]}
            elif kind == 'service' and name == 'kubernetes':
                assert args[-2:] == ['-n', 'default'], 'API_PRODUCT_PYTHON_DISCOVER_RECEIVER_UNQUALIFIED'
                ips = [] if profile == 'empty-addresses' else ['192.0.2.2'] + (['2001:db8::2'] if profile == 'dual-stack' else [])
                response = None if profile == 'missing-service' else {'spec': {'clusterIP': '192.0.2.2', 'clusterIPs': ips}}
            elif kind == 'namespace':
                assert len(args) == 6 and name in ('synthetic-present', 'synthetic-absent'), 'API_PRODUCT_PYTHON_DISCOVER_RECEIVER_UNQUALIFIED'
                response = {'metadata': {'name': name}} if name == 'synthetic-present' and profile != 'namespace-crd-absent' else None
            elif kind == 'crd':
                assert len(args) == 6 and name == 'ciliumnetworkpolicies.cilium.io', 'API_PRODUCT_PYTHON_DISCOVER_RECEIVER_UNQUALIFIED'
                response = None if profile == 'namespace-crd-absent' else {'metadata': {'name': name}}
            else: raise AssertionError('API_PRODUCT_PYTHON_DISCOVER_RECEIVER_UNQUALIFIED')
            reads.append({'command': command, 'response': response})
            return types.SimpleNamespace(returncode=1 if profile == 'transport-failure' else 0,
                                         stdout=json.dumps(response) if response is not None else '', stderr='synthetic-sensitive-error')
        namespace = {'__builtins__': {name: getattr(__import__('builtins'), name) for name in ('print','list','dict','set','sorted','str','len','SystemExit')},
                     '__name__': '__main__', 'sys': types.SimpleNamespace(argv=['bootstrap.py', 'discover']),
                     'json': json, 'ipaddress': ipaddress, 'os': types.SimpleNamespace(environ=env),
                     'subprocess': types.SimpleNamespace(run=run, PIPE=-1)}
        capture = io.StringIO()
        try:
            with contextlib.redirect_stdout(capture): exec(compile(program, sys.argv[1], 'exec'), namespace)
            outcome = 'success'
        except SystemExit as error:
            outcome = 'SystemExit: ' + str(error)
        expected = {'missing-endpoints': 'SystemExit: Kubernetes API endpoint discovery failed', 'missing-service': 'SystemExit: Kubernetes API endpoint discovery failed',
                    'empty-addresses': 'SystemExit: Expected ready Kubernetes API addresses', 'missing-port': 'SystemExit: Expected ready Kubernetes API addresses',
                    'multiple-ports': 'SystemExit: Expected ready Kubernetes API addresses', 'transport-failure': 'SystemExit: kubectl failed'}.get(profile, 'success')
        assert outcome.startswith(expected), 'API_PRODUCT_PYTHON_DISCOVER_BRANCH_UNQUALIFIED'
        public_bytes = capture.getvalue()
        value = json.loads(public_bytes) if public_bytes else None
        assert outcome == 'success' or not public_bytes, 'API_PRODUCT_PYTHON_DISCOVER_ERROR_PUBLICATION_UNQUALIFIED'
        results.append({'profile': profile, 'outcome': outcome, 'value': value, 'publicBytes': public_bytes, 'inputs': reads, 'environment': env,
                        'dependencies': [facts[symbol] for symbol in groups['discover']],
                        'coverageLimitations': ['synthetic API read responses prove original public control/serialization only; no live permission, endpoint reachability or served CRD acceptance']})
    return results

if len(sys.argv) > 2 and sys.argv[2] == '--discover':
    print(json.dumps(bootstrap_discover_profiles()))
    sys.exit(0)
if len(sys.argv) > 2 and sys.argv[2] == '--patch':
    print(json.dumps(patch_profiles()))
    sys.exit(0)
if len(sys.argv) > 2 and sys.argv[2] in ('--classify', '--audit'):
    # Bind names to their lexical owner. A parameter or local assignment masks
    # every outer binding, including imports; unrelated functions never qualify it.
    parents = {}
    def index(node):
        for child in ast.iter_child_nodes(node):
            parents[child] = node
            index(child)
    index(tree)
    scopes = (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
    def owner(node):
        node = parents.get(node)
        while node is not None and not isinstance(node, scopes): node = parents.get(node)
        return node
    bindings = {}
    def bind(scope, name, value): bindings.setdefault((scope, name), []).append(value)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bind(owner(node), node.name, node)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            for arg in node.args.posonlyargs + node.args.args + node.args.kwonlyargs:
                bind(node, arg.arg, None)
            for arg in (node.args.vararg, node.args.kwarg):
                if arg: bind(node, arg.arg, None)
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                name = alias.asname or (alias.name.split('.')[0] if isinstance(node, ast.Import) else alias.name)
                bind(owner(node), name, ('import', alias.name if isinstance(node, ast.Import) else (node.module or '') + '.' + alias.name))
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                for item in ast.walk(target):
                    if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store): bind(owner(node), item.id, node.value)
        if isinstance(node, (ast.AugAssign, ast.For, ast.AsyncFor, ast.With, ast.AsyncWith, ast.ExceptHandler)):
            target = getattr(node, 'target', None)
            if target:
                for item in ast.walk(target):
                    if isinstance(item, ast.Name): bind(owner(node), item.id, None)
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            for name in node.names: bind(owner(node), name, None)
    def lookup(node):
        scope = owner(node)
        while scope is not None:
            values = bindings.get((scope, node.id))
            if values is not None:
                return values[0] if len(values) == 1 else None
            scope = owner(scope)
        return ('builtin', node.id) if node.id == 'print' else None
    serializers = {'json.dumps', 'json.dump', 'yaml.dump', 'yaml.safe_dump'}
    methods = {'write', 'writelines', 'write_text', 'write_bytes'}
    def capability(node, seen=frozenset()):
        if node is None or node in seen: return None
        seen = seen | {node}
        if isinstance(node, ast.Name):
            value = lookup(node)
            if isinstance(value, tuple):
                return value[1] if value[0] == 'import' or value == ('builtin', 'print') else None
            return capability(value, seen)
        if isinstance(node, ast.Attribute):
            if node.attr in methods: return 'writer'
            if node.attr in ('dump', 'dumps', 'safe_dump') and not capability(node.value, seen): return 'unknown-serializer'
            base = capability(node.value, seen)
            return base + '.' + node.attr if base else None
        return None
    def sink(node):
        name = capability(node)
        return name in ('print', 'writer', 'unknown-serializer') or name in serializers
    def root(node, seen=frozenset()):
        if isinstance(node, ast.Name) and node not in seen:
            value = lookup(node)
            if isinstance(value, ast.AST): return root(value, seen | {node})
        if isinstance(node, (ast.Dict, ast.List, ast.Tuple)): return node
        return None
    pure = serializers | {'print', 'len', 'str', 'sorted'}
    def projection(node):
        if isinstance(node, ast.Name): return root(node), []
        if isinstance(node, (ast.Attribute, ast.Subscript)):
            value, path = projection(node.value)
            member = node.attr if isinstance(node, ast.Attribute) else node.slice.value if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, (str, int)) else None
            return value, path + [member]
        return None, []
    def changed(value, publication):
        # Fixed nested envelope members can change without changing API identity.
        # Unknown root keys, root updates and escaping aliases remain explicit gaps.
        for item in ast.walk(tree):
            if getattr(item, 'lineno', 0) <= getattr(value, 'end_lineno', 0) or getattr(item, 'lineno', 0) >= publication.lineno: continue
            if owner(item) is not owner(publication): continue
            if isinstance(item, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Delete)):
                targets = getattr(item, 'targets', [getattr(item, 'target', None)])
                for target in targets:
                    actual, path = projection(target)
                    if actual is value and (not path or path[0] is None or len(path) == 1 and path[0] in ('apiVersion', 'kind') or isinstance(item, ast.AugAssign)): return True
            if isinstance(item, ast.Call):
                if isinstance(item.func, ast.Attribute):
                    actual, path = projection(item.func.value)
                    if actual is value and not path: return True
                if capability(item.func) not in pure and any(root(arg) is value for arg in item.args): return True
        return False
    def role(node, publication, seen=frozenset()):
        if node is None or node in seen: return 'unknown'
        seen = seen | {node}
        if isinstance(node, ast.Call) and capability(node.func) in serializers and node.args: return role(node.args[0], publication, seen)
        if isinstance(node, ast.Call) and capability(node.func) in ('pathlib.Path', 'Path', 'tempfile.mkdtemp'):
            values = node.args + [keyword.value for keyword in node.keywords]
            return 'non-api' if values and all(role(value, publication, seen) == 'non-api' for value in values) else 'unknown'
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            function = lookup(node.func)
            if isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
                values = [role(item.value, item, seen) for item in ast.walk(function) if isinstance(item, ast.Return) and owner(item) is function]
                return 'unknown' if not values or 'unknown' in values else 'api' if 'api' in values else 'non-api'
        if isinstance(node, ast.Name):
            value = lookup(node)
            return role(value, publication, seen) if isinstance(value, ast.AST) else 'unknown'
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Div)):
            left, right = role(node.left, publication, seen), role(node.right, publication, seen)
            return 'unknown' if 'unknown' in (left, right) else 'api' if 'api' in (left, right) else 'non-api'
        if isinstance(node, ast.Dict) and all(isinstance(key, ast.Constant) and isinstance(key.value, str) for key in node.keys):
            if changed(node, publication): return 'unknown'
            keys = [key.value for key in node.keys]
            return 'api' if 'apiVersion' in keys and 'kind' in keys else 'non-api'
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str) and ('apiVersion' in node.value or node.value.lstrip().startswith(('{', '[', '---'))): return 'unknown'
            return 'non-api'
        if isinstance(node, (ast.List, ast.Tuple)):
            if changed(node, publication): return 'unknown'
            values = [role(item, publication, seen) for item in node.elts]
            return 'unknown' if 'unknown' in values else 'api' if 'api' in values else 'non-api'
        return 'unknown'
    outputs = []
    def systemd_unit_flow(publication):
        # Bind the selected byte constructor, not an entire module exemption.
        # Both original and corrected text must originate in the fixed unit;
        # the selected repair helper is a separately reviewed closed transform.
        if not isinstance(publication, ast.Call) or not publication.args:
            return None
        value = lookup(publication.args[0]) if isinstance(publication.args[0], ast.Name) else None
        helper = None
        if isinstance(value, ast.Call) and isinstance(value.func, ast.Name):
            helper = lookup(value.func)
            if not isinstance(helper, ast.FunctionDef) or helper.name != 'repair' or len(value.args) != 1 or value.keywords:
                return None
            value = lookup(value.args[0]) if isinstance(value.args[0], ast.Name) else None
        if not isinstance(value, ast.Call) or not isinstance(value.func, ast.Attribute) or value.func.attr != 'read_text' or value.args or value.keywords:
            return None
        unit = lookup(value.func.value) if isinstance(value.func.value, ast.Name) else None
        if not isinstance(unit, ast.Call) or capability(unit.func) != 'pathlib.Path' or len(unit.args) != 1 or unit.keywords or not isinstance(unit.args[0], ast.Constant) or unit.args[0].value != '/etc/systemd/system/k3s.service':
            return None
        if helper:
            values_ref = next((node for node in ast.walk(helper) if isinstance(node, ast.Name) and node.id == 'VALUES'), None)
            values = lookup(values_ref) if values_ref else None
            if not isinstance(values, ast.List) or [item.value if isinstance(item, ast.Constant) else None for item in values.elts] != ['system-reserved=cpu=500m,memory=1024Mi', 'kube-reserved=cpu=500m,memory=512Mi'] or changed(values, publication):
                return None
            for name in ('re', 'shlex'):
                reference = next((node for node in ast.walk(helper) if isinstance(node, ast.Name) and node.id == name), None)
                if reference is None or lookup(reference) != ('import', name):
                    return None
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Delete)):
                for target in getattr(node, 'targets', [getattr(node, 'target', None)]):
                    while isinstance(target, (ast.Attribute, ast.Subscript)):
                        target = target.value
                    if isinstance(target, ast.Name) and target.id in ('re', 'shlex', 'pathlib'):
                        return None
        return {'sourcePath': unit.args[0].value, 'transform': 'repair' if helper else 'original', 'helperDigest': hashlib.sha256(ast.dump(helper, include_attributes=False).encode()).hexdigest() if helper else None}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and sink(node.func):
            names = capability(node.func)
            values = node.args if names == 'print' else node.args[:1]
            roles = [role(value, node) for value in values]
            published = 'unknown' if not roles or 'unknown' in roles else 'api' if 'api' in roles else 'non-api'
            outputs.append({'line': node.lineno, 'expression': ast.unparse(node), 'role': published})
        if isinstance(node, ast.Return) and node.value is not None and role(node.value, node) == 'api':
            outputs.append({'line': node.lineno, 'expression': ast.unparse(node), 'role': 'api', 'gap': 'public-api-return'})
        # Writer references in containers, returns, callback arguments, attributes,
        # or mutable bindings leave the supported direct immutable-alias grammar.
        if isinstance(node, (ast.Name, ast.Attribute)) and sink(node):
            parent = parents.get(node)
            allowed = isinstance(parent, ast.Call) and parent.func is node
            if isinstance(parent, ast.Assign) and parent.value is node and len(parent.targets) == 1 and isinstance(parent.targets[0], ast.Name):
                allowed = len(bindings.get((owner(parent), parent.targets[0].id), [])) == 1
            if not allowed and not isinstance(parent, ast.Attribute):
                outputs.append({'line': node.lineno, 'expression': ast.unparse(node), 'role': 'unknown', 'gap': 'capability-escape'})
    # A JSON Patch is an API submission even though it is a list without
    # apiVersion/kind. Bind the exact serialized argument to original argv.
    patch_sinks = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and ast.unparse(node.func) == 'subprocess.run' and node.args and any(isinstance(item, ast.Constant) and item.value == 'patch' for item in ast.walk(node.args[0]))]
    if patch_sinks:
        records = patch_profiles()
        for publication in patch_sinks:
            for serializer in ast.walk(publication.args[0]):
                if isinstance(serializer, ast.Call) and capability(serializer.func) in serializers:
                    found = next((item for item in outputs if item['line'] == serializer.lineno and item['expression'] == ast.unparse(serializer)), None)
                    assert found is not None, 'API_PRODUCT_PYTHON_PATCH_SERIALIZER_UNQUALIFIED'
                    found['role'] = 'api-patch'
                    found['patchReceiver'] = records[0]['receiver']
                    found['patchOperations'] = records[0]['patchOperations']
    for output in outputs:
        matching = next((node for node in ast.walk(tree) if isinstance(node, (ast.Call, ast.Return, ast.Name, ast.Attribute)) and getattr(node, 'lineno', None) == output['line'] and ast.unparse(node) == output['expression']), None)
        scope = owner(matching) if matching else None
        output['function'] = getattr(scope, 'name', '<module>')
        output['operation'] = ast.dump(scope, include_attributes=False) if scope else ''
        if output['expression'] in ("(backup / 'original.service').write_text(original)", 'staged.write_text(corrected)'):
            output['systemdUnitFlow'] = systemd_unit_flow(matching)
        if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)):
            callers = [call for call in ast.walk(tree) if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and lookup(call.func) is scope]
            output['callerArguments'] = [{'expression': ast.unparse(call), 'positionalRoles': [role(arg, call) for arg in call.args], 'keywordNames': [keyword.arg for keyword in call.keywords], 'expandedKeys': [[key.value for key in keyword.value.keys] if isinstance(keyword.value, ast.Dict) and all(isinstance(key, ast.Constant) and isinstance(key.value, str) for key in keyword.value.keys) else None for keyword in call.keywords if keyword.arg is None]} for call in callers]
            output['capabilityEscapes'] = any(isinstance(ref, ast.Name) and lookup(ref) is scope and not (isinstance(parents.get(ref), ast.Call) and parents[ref].func is ref) for ref in ast.walk(tree))
    # Recognize this adapter family from actual declarations, not its filename.
    # All public outputs in that family must join a closed producer/sink recipe.
    bootstrap_family = any(isinstance(node, ast.FunctionDef) and node.name in ('discover', 'setup_secrets', 'apply_secret') for node in tree.body)
    if bootstrap_family:
        facts, groups, entries = bootstrap_audit_facts()
        for output in outputs:
            entry = None
            kind = None
            if output['function'] == 'apply_secret' and output['expression'].startswith('json.dumps('):
                entry, kind = 'secrets', 'credential-submission'
            elif output['function'] in ('setup_secrets', 'kube') and output['expression'].startswith('json.dumps('):
                entry, kind = 'secrets', 'credential-submission'
            elif output['function'] == 'setup_secrets' and output['expression'] == "print('Ops credentials prepared; existing bearer and pull credentials retained')":
                entry, kind = 'secrets', 'credential-diagnostic'
            elif output['function'] == '<module>' and output['expression'] in ('print(json.dumps(discover(), indent=2))', 'json.dumps(discover(), indent=2)'):
                entry, kind = 'discover', 'config-info'
            if entry and entries[entry]:
                producer = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == ('discover' if entry == 'discover' else output['function']))
                publication = next(node for node in ast.walk(tree) if isinstance(node, ast.Call) and node.lineno == output['line'] and ast.unparse(node) == output['expression'])
                constructor = next(node for node in ast.walk(producer) if isinstance(node, ast.Return)).value if entry == 'discover' else publication.args[0]
                transport = publication
                if kind == 'credential-submission':
                    transfer = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'kube')
                    transport = next(node for node in ast.walk(transfer) if isinstance(node, ast.Call) and ast.unparse(node.func) == 'subprocess.run')
                enclosing = []
                ancestor = parents.get(publication)
                while ancestor is not None:
                    if isinstance(ancestor, ast.If): enclosing.append({'kind': 'if', 'line': ancestor.lineno, 'test': ast.unparse(ancestor.test)})
                    if isinstance(ancestor, ast.For): enclosing.append({'kind': 'for', 'line': ancestor.lineno, 'target': ast.unparse(ancestor.target), 'iterable': ast.unparse(ancestor.iter)})
                    ancestor = parents.get(ancestor)
                output['bootstrapFlow'] = {'kind': kind, 'qualified': True, 'selectedEntryPoint': entry,
                    'expression': output['expression'], 'producerLine': constructor.lineno, 'producerFunction': producer.name,
                    'producerExpression': ast.unparse(constructor), 'consumerLine': transport.lineno, 'serializerLine': output['line'],
                    'transportLine': transport.lineno, 'transportExpression': ast.unparse(transport), 'conditions': enclosing,
                    'dependencies': [facts[symbol] for symbol in groups[entry]]}
                output['role'] = 'api' if kind == 'credential-submission' else 'non-api'
            else:
                # An unresolved dynamic identity cannot inherit config/diagnostic
                # acceptance. Retain concrete API roles and expose every other gap.
                if output['role'] != 'api': output['role'] = 'unknown'
                output['gap'] = 'bootstrap-public-output-unqualified'
        audit = {'kind': 'bootstrap-public-output-audit', 'qualified': all(entries.values()) and all(output.get('bootstrapFlow', {}).get('qualified') for output in outputs),
                 'entryPoints': entries, 'dependencies': list(facts.values()), 'outputs': outputs}
    else:
        audit = {'kind': 'non-bootstrap-output-audit', 'qualified': False, 'entryPoints': {}, 'dependencies': [], 'outputs': outputs}
    print(json.dumps(audit if sys.argv[2] == '--audit' else outputs))
    sys.exit(0)
# Compile only function definitions. Imports, module initialization and main
# never execute. Every external capability is provided by an offline stub.
facts, groups, entries = bootstrap_audit_facts()
assert entries['secrets'] and entries['discover'], 'API_PRODUCT_PYTHON_BOOTSTRAP_PUBLIC_FLOW_UNQUALIFIED'
initializers = [node for node in tree.body if isinstance(node, ast.Assign)]
for node in initializers:
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            assert isinstance(child.func, ast.Attribute) and ast.unparse(child.func) == 'os.environ.get', 'API_PRODUCT_PYTHON_INITIALIZER_UNQUALIFIED'
functions = ast.Module(body=initializers + [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('kube', 'get', 'apply_secret', 'setup_secrets')], type_ignores=[])
outputs = []
outcomes = []
for profile in ['missing', 'optional', 'retained', 'copy-disabled', 'custom-source', 'absent-source', 'empty-file', 'empty-tailscale', 'retained-optional', 'copy-noncanonical', 'transport-failure']:
    env = {'KUBE_CONTEXT': 'synthetic-offline', 'OPS_NAMESPACE': 'discovery-ops', 'OPS_COPY_PULL_SECRET': '0' if profile == 'copy-disabled' else '1'}
    if profile in ('optional', 'empty-file', 'empty-tailscale', 'retained-optional'):
        env.update(OPS_GITHUB_TOKEN_FILE='synthetic/github', OPS_TAILSCALE_AUTHKEY_FILE='synthetic/tailscale')
    if profile == 'custom-source': env['OPS_PULL_SECRET_SOURCE_NAMESPACE'] = 'custom-source'
    if profile == 'copy-noncanonical': env['OPS_COPY_PULL_SECRET'] = 'true'
    inputs, submitted = [], []
    def offline_run(command, input=None, text=None, stdout=None, stderr=None):
        # Keep the original kube function: collect bytes only after its actual
        # argument and serialization transformations, at the external boundary.
        prefix = ['kubectl', '--context', env['KUBE_CONTEXT'], '--request-timeout=20s']
        assert isinstance(command, list) and command[:len(prefix)] == prefix, 'API_PRODUCT_PYTHON_TRANSPORT_UNQUALIFIED'
        assert text is True and stdout == -1 and stderr == -1, 'API_PRODUCT_PYTHON_TRANSPORT_OPTIONS_UNQUALIFIED'
        args = command[len(prefix):]
        if profile == 'transport-failure': return types.SimpleNamespace(returncode=1, stdout='', stderr='synthetic-secret-sensitive-error')
        inputs.append({'args': args, 'command': command, 'response': 'synthetic'})
        if args == ['apply', '-f', '-']:
            value = json.loads(input)
            assert isinstance(value, dict) and value.get('apiVersion') and value.get('kind'), 'API_PRODUCT_PYTHON_RESOURCE_IDENTITY_UNQUALIFIED'
            record = {'value': value, 'profile': profile, 'inputs': list(inputs), 'environment': env}
            submitted.append(record)
            if profile in ('missing', 'optional', 'retained', 'copy-disabled'): outputs.append(record)
            return types.SimpleNamespace(returncode=0, stdout='')
        assert input is None and len(args) == 8 and args[:2] == ['get', 'secret'] and args[3:7] == ['--ignore-not-found', '-o', 'json', '-n'], 'API_PRODUCT_PYTHON_TRANSPORT_OPERATION_UNQUALIFIED'
        if args[:3] == ['get', 'secret', 'ghcr-secret'] and args[-1] == env.get('OPS_PULL_SECRET_SOURCE_NAMESPACE', 'kubeclaw'):
            if profile == 'absent-source': return types.SimpleNamespace(returncode=0, stdout='')
            return types.SimpleNamespace(returncode=0, stdout=json.dumps({'type': 'kubernetes.io/dockerconfigjson', 'data': {'.dockerconfigjson': 'c3ludGhldGlj'}}))
        assert args[2] in ['codex-ops-bearer', 'ghcr-secret'] and args[-1] == namespace['namespace'], 'API_PRODUCT_PYTHON_TRANSPORT_READ_UNQUALIFIED'
        if profile in ('retained', 'retained-optional'):
            return types.SimpleNamespace(returncode=0, stdout=json.dumps({'metadata': {'name': args[2]}}))
        return types.SimpleNamespace(returncode=0, stdout='')
    class SyntheticPath:
        def __init__(self, name):
            self.name = name
            assert name in ['synthetic/github', 'synthetic/tailscale'], 'API_PRODUCT_PYTHON_FILE_UNQUALIFIED'
        def read_text(self):
            return '   ' if profile == 'empty-file' or profile == 'empty-tailscale' and self.name == 'synthetic/tailscale' else ' synthetic-safe-payload\n'
    namespace = {'__builtins__': {name: getattr(__import__('builtins'), name) for name in ['print','list','dict','set','sorted','str','len','SystemExit','RuntimeError']}, 'json': json, 'os': types.SimpleNamespace(environ=env), 'namespace': 'discovery-ops',
                 'Path': SyntheticPath, 'secrets': types.SimpleNamespace(token_urlsafe=lambda size: 'synthetic-token'),
                 'subprocess': types.SimpleNamespace(run=offline_run, PIPE=-1), 'base': []}
    exec(compile(functions, sys.argv[1], 'exec'), namespace)
    try:
        with contextlib.redirect_stdout(io.StringIO()): namespace['setup_secrets']()
        outcome = 'success'
    except SystemExit as error:
        outcome = 'SystemExit: ' + str(error)
    expected = {'absent-source': 'SystemExit: Missing ghcr-secret.', 'empty-file': 'SystemExit: OPS_GITHUB_TOKEN_FILE contains an empty credential', 'empty-tailscale': 'SystemExit: OPS_TAILSCALE_AUTHKEY_FILE contains an empty credential', 'transport-failure': 'SystemExit: kubectl failed'}.get(profile, 'success')
    assert outcome.startswith(expected), 'API_PRODUCT_PYTHON_BRANCH_UNQUALIFIED'
    outcomes.append({'profile': profile, 'outcome': outcome, 'submissions': [dict(record) for record in submitted], 'inputs': inputs, 'environment': env})
for output in outputs:
    output['profileOutcomes'] = outcomes
    output['coverageLimitations'] = ['bootstrap discover endpoint/service/IP/namespace/CRD branches are not executed by this credential adapter; profile outcomes prove setup_secrets only', 'synthetic files/tokens/read responses do not prove live permissions or credential acceptance']
print(json.dumps(outputs))
