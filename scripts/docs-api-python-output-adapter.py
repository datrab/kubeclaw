"""Execute original producer functions with no process, credential or network access."""
import ast
import contextlib
import io
import hashlib
import json
import sys
import types
from pathlib import Path

source = Path(sys.argv[1]).read_text()
tree = ast.parse(source)
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

if len(sys.argv) > 2 and sys.argv[2] == '--patch':
    print(json.dumps(patch_profiles()))
    sys.exit(0)
if len(sys.argv) > 2 and sys.argv[2] == '--classify':
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
