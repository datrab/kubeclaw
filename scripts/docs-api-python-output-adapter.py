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
import importlib.util
sys.dont_write_bytecode = True
from pathlib import Path

_receipt_spec = importlib.util.spec_from_file_location('docs_python_ast_v1', Path(__file__).with_name('docs-api-python-ast-v1.py'))
_receipt = importlib.util.module_from_spec(_receipt_spec)
_receipt_spec.loader.exec_module(_receipt)
def receipt(node):
    return _receipt.serialize(node, sys.argv[1])

source = Path(sys.argv[1]).read_text()
tree = ast.parse(source, filename=sys.argv[1])
receipt(tree) # reject unknown source syntax before any finite offline adapter dispatch
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
    dump = lambda node: receipt(node)
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
    dump = lambda node: receipt(node)
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

PATCH_RECIPE = r'''
#!/usr/bin/env python3
"""Align the existing webhook list with chart 0.30.0 without replacing entries."""
import argparse
import json
import os
import subprocess

NAME = "spire-server-spire-controller-manager-webhook"
ORDER = ["vclusterfederatedtrustdomain.kb.io", "vclusterspiffeid.kb.io"]


def order_patch(live):
    hooks = live.get("webhooks", [])
    names = [hook.get("name") for hook in hooks]
    if len(names) != 2 or set(names) != set(ORDER):
        raise ValueError("Unexpected webhook names; refusing to modify the list")
    if names == ORDER:
        return []
    # Reject a concurrent controller update instead of overwriting a CA rotation.
    return [
        {"op": "test", "path": "/metadata/resourceVersion", "value": live["metadata"]["resourceVersion"]},
        {"op": "test", "path": "/webhooks/0/name", "value": ORDER[1]},
        {"op": "test", "path": "/webhooks/1/name", "value": ORDER[0]},
        {"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply the guarded list move")
    args = parser.parse_args()
    context = os.environ.get("KUBE_CONTEXT")
    if not context:
        raise SystemExit("Set KUBE_CONTEXT first")
    command = ["kubectl", "--context", context]
    live = json.loads(subprocess.check_output(command + ["get", "validatingwebhookconfiguration", NAME, "-o", "json"], text=True))
    patch = order_patch(live)
    if not patch:
        print("PASS: webhook order already matches the chart; no change needed")
    elif not args.apply:
        print("Reorder required; rerun with --apply to move the existing entries without changing their contents")
    else:
        subprocess.run(command + ["patch", "validatingwebhookconfiguration", NAME, "--type=json", "-p", json.dumps(patch)], check=True)
        print("PASS: existing webhook entries reordered; contents unchanged")


if __name__ == "__main__":
    main()
'''

def patch_source_custody():
    """Closed public/helper grammar, with data-only operation constructors."""
    expected = ast.parse(PATCH_RECIPE)
    actual = copy.deepcopy(tree)
    def without_doc(module):
        module.body = [n for n in module.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))]
    without_doc(actual); without_doc(expected)
    functions = [n for n in actual.body if isinstance(n, ast.FunctionDef)]
    if [n.name for n in functions] != ['order_patch', 'main']: return False
    selected = next(n for n in expected.body if isinstance(n, ast.FunctionDef) and n.name == 'order_patch')
    constructor = functions[0].body[-1]
    if not isinstance(constructor, ast.Return) or not isinstance(constructor.value, ast.List): return False
    def data(node):
        if isinstance(node, ast.Constant): return type(node.value) in (str, int, float, bool, type(None))
        if isinstance(node, (ast.List, ast.Tuple)): return all(data(n) for n in node.elts)
        if isinstance(node, ast.Dict): return all(isinstance(k, ast.Constant) and isinstance(k.value, str) and data(v) for k,v in zip(node.keys,node.values))
        return receipt(node) in [receipt(ast.parse(expr, mode='eval').body) for expr in ('live["metadata"]["resourceVersion"]', 'ORDER[0]', 'ORDER[1]')]
    if not constructor.value.elts or not all(isinstance(n, ast.Dict) and data(n) for n in constructor.value.elts): return False
    constructor.value = copy.deepcopy(selected.body[-1].value)
    # Public flow, helper controls, bindings, decorators/defaults and the full
    # module dispatch must match before any FunctionDef is compiled or called.
    return receipt(actual) == receipt(expected)

def patch_profiles():
    """Run original patch construction and argv at the subprocess boundary."""
    if not patch_source_custody():
        raise ValueError("API_PRODUCT_PYTHON_PATCH_SOURCE_UNQUALIFIED: " + sys.argv[1])
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
        namespace = {'__builtins__': {name: getattr(__import__('builtins'), name) for name in ('print','list','set','len','ValueError','SystemExit')}, '__doc__': 'offline selected patch', 'argparse': types.SimpleNamespace(ArgumentParser=Parser), 'json': types.SimpleNamespace(loads=json.loads, dumps=json.dumps), 'os': types.SimpleNamespace(environ=env), 'subprocess': types.SimpleNamespace(check_output=read, run=run)}
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
    scopes = (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
    def owner(node):
        child = node
        ancestors = {node}
        node = parents.get(node)
        while node is not None:
            if isinstance(node, scopes):
                # Definition-time defaults/decorators/bases are evaluated in
                # the enclosing scope, not a future function/class body.
                definition_input = isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and child not in node.body
                definition_input |= isinstance(node, ast.Lambda) and child is not node.body
                # Only the first comprehension iterable uses the enclosing
                # scope; its targets and remaining expressions are local.
                definition_input |= isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)) and node.generators[0].iter in ancestors
                if not definition_input: return node
            ancestors.add(node)
            child = node
            node = parents.get(node)
        return None
    # Finite scope declarations: Global refers to the module import authority,
    # including stores. Nonlocal is an explicitly unsupported custody escape.
    global_names = {}
    for declaration in ast.walk(tree):
        if isinstance(declaration, ast.Global):
            global_names.setdefault(owner(declaration), set()).update(declaration.names)
    bindings = {}
    def bind(scope, name, value):
        if name in global_names.get(scope, set()): scope = tree
        bindings.setdefault((scope, name), []).append(value)
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
            binding_scope = owner(node)
            if isinstance(node, ast.NamedExpr):
                while isinstance(binding_scope, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)): binding_scope = owner(binding_scope)
            for target in targets:
                for item in ast.walk(target):
                    if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store): bind(binding_scope, item.id, node.value)
        if isinstance(node, (ast.AugAssign, ast.For, ast.AsyncFor, ast.With, ast.AsyncWith, ast.ExceptHandler)):
            target = getattr(node, 'target', None)
            if target:
                for item in ast.walk(target):
                    if isinstance(item, ast.Name): bind(owner(node), item.id, None)
        # These lexical binders use string fields or non-statement targets,
        # not ordinary assignment Name Store nodes. Never inherit an import
        # through an exception, pattern, with or comprehension capture.
        if isinstance(node, ast.Delete):
            for target in node.targets:
                for item in ast.walk(target):
                    if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Del): bind(owner(node), item.id, None)
        if isinstance(node, ast.ExceptHandler) and node.name: bind(owner(node), node.name, None)
        if isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name: bind(owner(node), node.name, None)
        if isinstance(node, ast.MatchMapping) and node.rest: bind(owner(node), node.rest, None)
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if item.optional_vars:
                    for target in ast.walk(item.optional_vars):
                        if isinstance(target, ast.Name) and isinstance(target.ctx, ast.Store): bind(owner(node), target.id, None)
        if isinstance(node, ast.comprehension):
            for target in ast.walk(node.target):
                if isinstance(target, ast.Name) and isinstance(target.ctx, ast.Store): bind(owner(node), target.id, None)
        if isinstance(node, ast.Nonlocal):
            for name in node.names: bind(owner(node), name, None)
    def lookup(node):
        scope = owner(node)
        namespace_scope = scope if isinstance(scope, ast.ClassDef) else None
        while scope is not None:
            # Class namespaces do not supply closure bindings to methods or
            # comprehension bodies. Enclosing function/module authority does.
            if isinstance(scope, ast.ClassDef) and scope is not namespace_scope:
                scope = owner(scope); continue
            if node.id in global_names.get(scope, set()): scope = tree
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
    def imported_capability_state_issues():
        protected = ('json', 'yaml', 'time', 'pathlib.Path')
        issues = []
        frame_access = {'_getframe', '_current_frames', 'currentframe', 'getouterframes', 'getinnerframes', 'stack', 'trace', 'f_globals', 'f_locals', 'f_builtins', 'gi_frame', 'cr_frame', 'ag_frame', 'tb_frame'}
        reflective = {'getattr', 'setattr', 'delattr', 'vars', 'globals', 'locals', 'eval', 'exec', '__import__'}
        def protected_value(node):
            value = capability(node)
            return value and any(value == p or value.startswith(p + '.') for p in protected)
        reviewed_imports = {'argparse', 'hashlib', 'ipaddress', 'json', 'os', 'pathlib', 're', 'secrets', 'shlex', 'shutil', 'signal', 'socket', 'subprocess', 'sys', 'tempfile', 'threading', 'time', 'urllib.request'}
        reviewed_from = {'pathlib.Path', 'json.dump', 'json.dumps', 'json.loads', 'time.time', 'time.monotonic'}
        for item in ast.walk(tree):
            if isinstance(item, ast.Import) and any(a.name not in reviewed_imports for a in item.names): issues.append(item)
            if isinstance(item, ast.ImportFrom) and (item.level or any((item.module or '') + '.' + a.name not in reviewed_from for a in item.names)): issues.append(item)
            if isinstance(item, ast.Global):
                for name in item.names:
                    values = bindings.get((tree, name), [])
                    if any(isinstance(value, tuple) and value[0] == 'import' and any(value[1] == p or value[1].startswith(p + '.') for p in protected) or isinstance(value, ast.AST) and protected_value(value) for value in values) and len(values) != 1:
                        issues.append(item)
            if isinstance(item, ast.Nonlocal): issues.append(item)
            if isinstance(item, ast.Attribute) and (item.attr.startswith('__') or item.attr == 'modules' or item.attr in frame_access): issues.append(item)
            if isinstance(item, ast.Call):
                if capability(item.func) in {'importlib.import_module'} | {'builtins.' + name for name in reflective}: issues.append(item)
                # Builtin reflection aliases are deliberately not supported.
                func = item.func
                seen = set()
                while isinstance(func, ast.Name) and func not in seen:
                    seen.add(func)
                    if func.id in reflective:
                        issues.append(item); break
                    value = lookup(func)
                    if not isinstance(value, ast.AST): break
                    func = value
            if isinstance(item, (ast.Name, ast.Attribute, ast.Subscript)) and protected_value(item):
                parent = parents.get(item)
                if isinstance(item, ast.Attribute) and item.attr.startswith('__'):
                    issues.append(item); continue
                if isinstance(item, (ast.Attribute, ast.Subscript)) and isinstance(item.ctx, (ast.Store, ast.Del)):
                    issues.append(item); continue
                allowed = isinstance(parent, ast.Attribute) and parent.value is item and not parent.attr.startswith('__')
                allowed |= isinstance(parent, ast.Call) and parent.func is item
                if isinstance(parent, ast.Assign) and parent.value is item and len(parent.targets) == 1 and isinstance(parent.targets[0], ast.Name):
                    allowed |= len(bindings.get((owner(parent), parent.targets[0].id), [])) == 1
                if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store) and isinstance(parent, ast.Assign) and len(parent.targets) == 1 and parent.targets[0] is item:
                    allowed |= len(bindings.get((owner(parent), item.id), [])) == 1 and protected_value(parent.value)
                if not allowed: issues.append(item)
        return issues
    capability_state_issues = imported_capability_state_issues()
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
    def serializer_options_qualified(node):
        name = capability(node.func)
        # A serializer's data root is authoritative only under its finite call
        # grammar. Duck encoders are callable authority even without inheritance.
        if name not in ('json.dumps', 'json.dump'):
            return not node.keywords and len(node.args) == 1
        if len(node.args) != (2 if name == 'json.dump' else 1): return False
        options = {}
        for keyword in node.keywords:
            if keyword.arg is None:
                expanded = keyword.value
                if isinstance(expanded, ast.Name): expanded = lookup(expanded)
                if not isinstance(expanded, ast.Dict): return False
                if changed(expanded, node): return False
                for operation in ast.walk(tree):
                    if isinstance(operation, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Delete)) and getattr(operation, 'lineno', 0) > getattr(expanded, 'end_lineno', 0):
                        for target in getattr(operation, 'targets', [getattr(operation, 'target', None)]):
                            actual, path = projection(target)
                            if actual is expanded: return False
                # A fixed option dict cannot escape through a container,
                # callback or returned alias and then borrow unchanged keys.
                for reference in ast.walk(tree):
                    if not isinstance(reference, ast.Name) or root(reference) is not expanded: continue
                    parent = parents.get(reference)
                    declaration = isinstance(parent, (ast.Assign, ast.AnnAssign)) and getattr(parent, 'value', None) is expanded and isinstance(reference.ctx, ast.Store)
                    caller = parents.get(parent)
                    expansion = isinstance(parent, ast.keyword) and parent.arg is None and parent.value is reference and isinstance(caller, ast.Call) and capability(caller.func) in serializers
                    if not declaration and not expansion: return False
                pairs = []
                for key, value in zip(expanded.keys, expanded.values):
                    if not isinstance(key, ast.Constant) or not isinstance(key.value, str): return False
                    pairs.append((key.value, value))
            else: pairs = [(keyword.arg, keyword.value)]
            for key, value in pairs:
                if key in options: return False
                options[key] = value
        for key, value in options.items():
            if isinstance(value, ast.Name): value = lookup(value)
            if key == 'separators':
                if not isinstance(value, (ast.Tuple, ast.List)) or len(value.elts) != 2 or not all(isinstance(item, ast.Constant) and type(item.value) is str for item in value.elts): return False
                for item, token in zip(value.elts, (',', ':')):
                    if not item.value.startswith(token) or any(character not in ' \t\r\n' for character in item.value[1:]): return False
                continue
            if not isinstance(value, ast.Constant): return False
            actual = value.value
            if key in ('cls', 'default'):
                if actual is not None: return False
            elif key in ('skipkeys', 'ensure_ascii', 'check_circular', 'allow_nan', 'sort_keys'):
                if type(actual) is not bool: return False
            elif key == 'indent':
                if actual is not None and type(actual) not in (int, str): return False
                if type(actual) is str and any(character not in ' \t\r\n' for character in actual): return False
            else: return False
        return True
    def role(node, publication, seen=frozenset()):
        if node is None or node in seen: return 'unknown'
        seen = seen | {node}
        if isinstance(node, ast.Call) and capability(node.func) in serializers and node.args:
            return role(node.args[0], publication, seen) if serializer_options_qualified(node) else 'unknown'
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
        return {'sourcePath': unit.args[0].value, 'transform': 'repair' if helper else 'original', 'helperDigest': hashlib.sha256(receipt(helper).encode()).hexdigest() if helper else None}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and sink(node.func):
            names = capability(node.func)
            values = node.args if names == 'print' else node.args[:1]
            roles = [role(value, node) for value in values]
            published = 'unknown' if names == 'unknown-serializer' or names in serializers and not serializer_options_qualified(node) or not roles or 'unknown' in roles else 'api' if 'api' in roles else 'non-api'
            outputs.append({'line': node.lineno, 'expression': ast.unparse(node), 'role': published, **({'gap': 'serializer-option-authority-unqualified', 'sourceIdentity': sys.argv[1]} if names in serializers and not serializer_options_qualified(node) else {})})
        if isinstance(node, ast.Return) and node.value is not None and role(node.value, node) == 'api':
            outputs.append({'line': node.lineno, 'expression': ast.unparse(node), 'role': 'api', 'gap': 'public-api-return'})
        # Writer references in containers, returns, callback arguments, attributes,
        # or mutable bindings leave the supported direct immutable-alias grammar.
        if isinstance(node, (ast.Name, ast.Attribute)) and sink(node):
            parent = parents.get(node)
            allowed = isinstance(parent, ast.Call) and parent.func is node
            if isinstance(parent, ast.Assign) and parent.value is node and len(parent.targets) == 1 and isinstance(parent.targets[0], ast.Name):
                allowed = len(bindings.get((owner(parent), parent.targets[0].id), [])) == 1
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and isinstance(parent, ast.Assign) and len(parent.targets) == 1 and parent.targets[0] is node:
                allowed = len(bindings.get((owner(parent), node.id), [])) == 1 and sink(parent.value)
            if not allowed and not isinstance(parent, ast.Attribute):
                outputs.append({'line': node.lineno, 'expression': ast.unparse(node), 'role': 'unknown', 'gap': 'capability-escape'})
    for issue in capability_state_issues:
        outputs.append({'line': issue.lineno, 'expression': ast.unparse(issue), 'role': 'unknown',
                        'gap': 'imported-capability-state-unqualified', 'sourceIdentity': sys.argv[1]})
    if capability_state_issues:
        for output in outputs:
            if output['role'] == 'non-api': output['role'] = 'unknown'
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
    def native_state_custody(scope):
        # Finite selected supervisor serializer/writer dependencies. No module
        # execution or imported serializer substitution can inherit this role.
        module_recipe = ast.parse("""
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import threading
import time
stop = threading.Event()
child = None
state_file = Path('/tmp/codex-ops-status.json')
signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
""")
        actual_module = ast.Module(body=[n for n in tree.body if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))], type_ignores=[])
        # Original public entry dispatch calls main; it is not a serializer binding.
        actual_module.body = [n for n in actual_module.body if not (isinstance(n, ast.If) and receipt(n) == receipt(ast.parse("if __name__ == '__main__':\n    main()").body[0]))]
        if capability_state_issues or receipt(actual_module) != receipt(module_recipe): return False
        expected = {'json': ('import', 'json'), 'time': ('import', 'time'),
                    'Path': ('import', 'pathlib.Path')}
        for name, authority in expected.items():
            refs = [n for n in ast.walk(scope) if isinstance(n, ast.Name) and n.id == name]
            if name == 'Path':
                refs = [n for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id == name]
            if not refs or any(lookup(ref) != authority for ref in refs): return False
        state_refs = [n for n in ast.walk(scope) if isinstance(n, ast.Name) and n.id == 'state_file']
        state_recipe = ast.parse("Path('/tmp/codex-ops-status.json')", mode='eval').body
        if not state_refs or any(not isinstance(lookup(ref), ast.AST) or receipt(lookup(ref)) != receipt(state_recipe) for ref in state_refs): return False
        protected = {'json', 'time', 'Path', 'state_file'}
        for item in ast.walk(tree):
            if isinstance(item, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Delete, ast.NamedExpr)):
                for target in getattr(item, 'targets', [getattr(item, 'target', None)]):
                    base = target
                    while isinstance(base, (ast.Attribute, ast.Subscript)): base = base.value
                    if isinstance(base, ast.Name) and base.id in protected:
                        if base is not target or base.id != 'state_file' or owner(item) is not tree or not isinstance(item, ast.Assign): return False
            if isinstance(item, ast.Call):
                if isinstance(item.func, ast.Name) and item.func.id in ('__import__', 'exec', 'eval', 'globals', 'locals', 'vars'): return False
                base = item.func
                while isinstance(base, ast.Attribute): base = base.value
                if isinstance(base, ast.Name) and base.id in ('json', 'time', 'Path'):
                    allowed = {'json': {'json.dumps'}, 'time': {'time.time', 'time.monotonic'}, 'Path': {'Path', 'Path.home'}}
                    if ast.unparse(item.func) not in allowed[base.id]: return False
                for argument in item.args + [k.value for k in item.keywords]:
                    if isinstance(argument, ast.Name) and argument.id in protected:
                        # Actual state replacement is the sole selected reference
                        # passed as an argument; passing module capabilities escapes.
                        if not (argument.id == 'state_file' and ast.unparse(item.func) == 'temp.replace' and owner(item) is scope): return False
        return True

    for output in outputs:
        matching = next((node for node in ast.walk(tree) if isinstance(node, (ast.Call, ast.Return, ast.Name, ast.Attribute)) and getattr(node, 'lineno', None) == output['line'] and ast.unparse(node) == output['expression']), None)
        scope = owner(matching) if matching else None
        output['function'] = getattr(scope, 'name', '<module>')
        output['serializationProtocol'] = _receipt.VERSION
        output['operation'] = receipt(scope) if scope else ''
        if output['function'] == 'status':
            output['nativeStateQualified'] = native_state_custody(scope)
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
                 'serializationProtocol': _receipt.VERSION, 'entryPoints': entries, 'dependencies': list(facts.values()), 'outputs': outputs}
    else:
        audit = {'kind': 'non-bootstrap-output-audit', 'serializationProtocol': _receipt.VERSION, 'qualified': False, 'entryPoints': {}, 'dependencies': [], 'outputs': outputs}
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
