import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import ts from 'typescript';
import { shellHeredocCustody, shellCommandAcquisitions } from '../docs-shell-source-custody.mjs';
import { helmEnvironmentHelperProjectionPlans, helmGatewayCommandProjection } from '../docs-helm-environment-projections.mjs';
import { nativeSupervisorEnvironmentProducer } from '../lib/docs-owned-process-environment.mjs';
import { runtimeConsumerContract, maintainedEnvironmentBindings, qualifiedProducerBindings,
  externalProducerContract, assertRuntimeConsumerContract } from '../docs-runtime-consumer-contracts.mjs';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const source = fs.readFileSync(path.join(root, 'scripts/docs-configuration-inventory.mjs'), 'utf8');
// Exercise the production functions without triggering inventory publication or
// unrelated API acquisition. Boundaries are declarations in the actual source.
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing production function ${name}`);
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(end > start);
  return source.slice(start, end);
}
const sandbox = { nativeSupervisorEnvironmentProducer, helmGatewayCommandProjection, helmEnvironmentHelperProjectionPlans, shellHeredocCustody, shellCommandAcquisitions, crypto, ts, assert, Buffer, spawnSync, process, path, console, YAML, fs, root,
  runtimeConsumerContract, maintainedEnvironmentBindings, qualifiedProducerBindings,
  externalProducerContract, assertRuntimeConsumerContract,
  ENVIRONMENT_CONTRACTS: new Map(), ENVIRONMENT_CONSUMER_CONTRACTS: new Map(),
  operatorEnvironmentFamilyContract: () => null,
  sourceOwner: () => ({ component: 'operations' }),
};
vm.createContext(sandbox);
vm.runInContext(source.match(/^const SENSITIVE_ENV_NAME = .*;$/mu)[0], sandbox);
const contractStart = source.indexOf('const environmentContract = ');
const contractEnd = source.indexOf('\n});', contractStart) + 4;
vm.runInContext(source.slice(contractStart, contractEnd), sandbox);
const kubeContextContract = source.match(/^\s+KUBE_CONTEXT: (environmentContract\(.*\)),/mu)?.[1];
assert.ok(kubeContextContract, 'missing maintained native KUBE_CONTEXT authority');
vm.runInContext(`ENVIRONMENT_CONTRACTS.set('KUBE_CONTEXT', ${kubeContextContract});`, sandbox);
for (const name of ['configuredSecretResolverFacts', 'configuredEnvironmentReceiverFacts', 'nodeEnvironmentReads', 'lineAt', 'maskQuotedShellHeredocs', 'quotedProgramToken',
  'pythonEnvironmentReads', 'pythonArgvMode', 'pythonInterpreterIndex', 'pythonShellPrograms', 'pythonYamlPrograms', 'acquiredPythonEnvironmentReads', 'embeddedPythonEnvironmentReads', 'nodeArgvSelection', 'nodeShellArgvSelection', 'nodeShellPrograms', 'acquiredNodeEnvironmentReads', 'inlineProgramEnvironmentReads', 'embeddedNodeEnvironmentReads', 'shellParameterValue',
  'environmentProducerOccurrences', 'environmentOccurrences', 'environmentReaderContract', 'verifyEnvironmentConsumerCoverage']) {
  vm.runInContext(declaration(name), sandbox, { filename: `production:${name}` });
}
// The production coverage guard also requires the real owned-launcher receiver.
// Keep that prerequisite in every focused fixture instead of bypassing the guard.
const ownedReceiverSource = 'skills/worker/core/worker/native-worker-launcher.c';
const productionInventoryTree = ts.createSourceFile('docs-configuration-inventory.mjs', source, ts.ScriptTarget.Latest, true);
const ownedReceiverContractCall = productionInventoryTree.statements
  .filter(ts.isExpressionStatement).map(statement => statement.expression)
  .find(node => ts.isCallExpression(node) && node.expression.getText(productionInventoryTree) === 'addEnvironmentConsumerContract'
    && node.arguments[0]?.text === 'KUBECLAW_NATIVE_SUPERVISOR_PID' && node.arguments[1]?.text === ownedReceiverSource);
assert(ownedReceiverContractCall, 'missing real owned receiver contract');
vm.runInContext('ENVIRONMENT_CONSUMER_CONTRACTS.set(' + JSON.stringify('KUBECLAW_NATIVE_SUPERVISOR_PID:' + ownedReceiverSource)
  + ', ' + ownedReceiverContractCall.arguments[2].getText(productionInventoryTree) + ');', sandbox);

const productionEnvironmentOccurrences = sandbox.environmentOccurrences;
const productionVerifyEnvironmentConsumerCoverage = sandbox.verifyEnvironmentConsumerCoverage;
sandbox.verifyEnvironmentConsumerCoverage = () => {
  const fixtureSources = sandbox.runtimeTextSources, fixtureRead = sandbox.read, fixtureOccurrences = sandbox.environmentOccurrences;
  sandbox.runtimeTextSources = () => [...new Set([...fixtureSources(), ownedReceiverSource])];
  sandbox.read = sourcePath => sourcePath === ownedReceiverSource
    ? fs.readFileSync(path.join(root, sourcePath), 'utf8') : fixtureRead(sourcePath);
  sandbox.environmentOccurrences = (sourcePath, text) => sourcePath === ownedReceiverSource
    ? productionEnvironmentOccurrences(sourcePath, text) : fixtureOccurrences(sourcePath, text);
  try { return productionVerifyEnvironmentConsumerCoverage(); }
  finally { sandbox.runtimeTextSources = fixtureSources; sandbox.read = fixtureRead; sandbox.environmentOccurrences = fixtureOccurrences; }
};
const reads = (text) => JSON.parse(JSON.stringify(sandbox.pythonEnvironmentReads(text)));
const names = (text) => [...new Set(reads(text).map(item => item.name))].sort();

// Qualify the interpreter actually used by production, not a private executable.
const capabilityProbe = spawnSync('python3', ['-I', '-c',
  "import sys,json,importlib.util; print(json.dumps({'version':list(sys.version_info[:3]),'annotationlib':importlib.util.find_spec('annotationlib') is not None}))"], { encoding: 'utf8' });
assert.equal(capabilityProbe.status, 0, capabilityProbe.stderr);
const pythonCapability = JSON.parse(capabilityProbe.stdout);
const lazyAnnotations = pythonCapability.version[0] > 3 || pythonCapability.version[1] >= 14;
test('native Python annotation capability is recorded', async t => {
  t.diagnostic(JSON.stringify({ pythonCapability, annotationSemantics: lazyAnnotations ? 'lazy' : 'eager' }));
});
// The scanner and receiving-source assertions always run. Only native witnesses
// requiring a real annotationlib are separately reported as unavailable. Do not
// replace that module with a shim or claim those witnesses passed on older Python.
async function nativePython(t, args, options) {
  const code = args[args.length - 1];
  if (!pythonCapability.annotationlib && /annotationlib\./.test(code)) {
    await t.test(`Python 3.14 annotationlib native witness ${++nativeUnavailable}`, {
      skip: `python3 ${pythonCapability.version.join('.')} has no annotationlib; shared custody assertions executed`,
    }, () => {});
    t.diagnostic(JSON.stringify({ nativeUnavailable: true, requirement: 'Python 3.14 annotationlib', code }));
    return null;
  }
  // Some shared witnesses import annotationlib without using it. Their lawful
  // eager native variant needs only the imports actually exercised by the row.
  const nativeCode = !pythonCapability.annotationlib
    ? code.replace(/import annotationlib\n/g, '').replace(/,\s*annotationlib\b/g, '') : code;
  if (nativeCode !== code) t.diagnostic(JSON.stringify({ eagerNativeVariant: nativeCode, originalCode: code }));
  return spawnSync('python3', [...args.slice(0, -1), nativeCode], options);
}
let nativeUnavailable = 0;

test('native eager/lazy annotations retain definition and access-time key witnesses', async t => {
  const code = `import os,json
requested=[]
original=os.getenv
def audited(key,*args):
    requested.append(key)
    return original(key,*args)
os.getenv=audited
KEY='ANNOTATION_DEFINITION_REAL'
def selected(value:os.getenv(KEY)):pass
KEY='ANNOTATION_ACCESS_REAL'
resolved=selected.__annotations__
print(json.dumps(requested))
`;
  const native = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const expected = lazyAnnotations ? 'ANNOTATION_ACCESS_REAL' : 'ANNOTATION_DEFINITION_REAL';
  assert.deepEqual(JSON.parse(native.stdout), [expected]);
  const scannerCode = `import os\nKEY='ANNOTATION_DEFINITION_REAL'\ndef selected(value:os.getenv(KEY)):pass\nKEY='ANNOTATION_ACCESS_REAL'\nselected.__annotations__\n`;
  assert.ok(names(scannerCode).includes(expected), 'conservative discovery must retain the native annotation key');
  t.diagnostic(JSON.stringify({ pythonCapability, code, expected, exit: native.status, stdout: native.stdout, stderr: native.stderr }));
});
test('native Python 3.14 lazy late-binding witness', {
  skip: lazyAnnotations ? false : `python3 ${pythonCapability.version.join('.')} uses eager annotations; lazy witness requires Python 3.14`,
}, () => {
  const code = "def selected(value:operating.getenv('LATE_ANNOTATION_REAL')):pass\nimport os as operating\nselected.__annotations__\n";
  assert.deepEqual(names(code), ['LATE_ANNOTATION_REAL']);
  const native = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const classCode = "import os\nclass Selected:\n    reader: local.getenv('LATE_CLASS_ANNOTATION_REAL')\n    import os as local\nSelected.__annotations__\n";
  assert.deepEqual(names(classCode), ['LATE_CLASS_ANNOTATION_REAL']);
  const nativeClass = spawnSync('python3', ['-I', '-c', classCode], { encoding: 'utf8' });
  assert.equal(nativeClass.status, 0, nativeClass.stderr);
});

test('native AST excludes comments and passive literals, retaining formatted expressions', () => {
  const text = `import os
# os.getenv('COMMENT_FAKE')
"""os.environ['DOCSTRING_FAKE']"""
recipe = r'''os.environ.get('RECIPE_FAKE')'''
ordinary = "os.getenv('STRING_FAKE')"
formatted = f"literal os.getenv('FSTRING_FAKE') {os.getenv('FORMATTED_REAL')}"
`;
  assert.deepEqual(names(text), ['FORMATTED_REAL']);
});

test('native imports, aliases, parenthesized multiline calls and static keys remain readers', () => {
  assert.deepEqual(names(`import os as operating
from os import getenv as lookup, environ as environment
alias = operating.environ
get = alias.get
KEY = 'STATIC_REAL'
a = (operating.getenv)(
  'MULTILINE_REAL'
)
b = lookup('IMPORT_REAL')
c = environment['SUBSCRIPT_REAL']
d = get(KEY)
write = environment['READ_BEFORE_WRITE']
environment['WRITE_ONLY'] = 'value'
`), ['IMPORT_REAL', 'MULTILINE_REAL', 'READ_BEFORE_WRITE', 'STATIC_REAL', 'SUBSCRIPT_REAL']);
});

test('rebound aliases and environment-like foreign APIs do not claim process readers', () => {
  assert.deepEqual(names(`import os
reader = os.getenv
reader = lambda key: key
reader('REBOUND_FAKE')
class Foreign:
    pass
other = Foreign()
other.getenv('FOREIGN_FAKE')
def example(os):
    return os.getenv('PARAMETER_FAKE')
`), []);
});

test('original recipe adapter has zero process reads and operational bootstrap retains seven keys', () => {
  assert.deepEqual(names(fs.readFileSync(path.join(root, 'scripts/docs-api-python-output-adapter.py'), 'utf8')), []);
  const bootstrap = fs.readFileSync(path.join(root, 'ops/pod/bootstrap.py'), 'utf8');
  assert.deepEqual(names(bootstrap), ['KUBE_CONTEXT', 'OPS_COPY_PULL_SECRET', 'OPS_GITHUB_TOKEN_FILE',
    'OPS_NAMESPACE', 'OPS_PULL_SECRET_SOURCE_NAMESPACE', 'OPS_READ_NAMESPACES', 'OPS_TAILSCALE_AUTHKEY_FILE']);
  for (const fact of reads(bootstrap)) {
    assert.match(bootstrap.slice(fact.index), /^os\.(?:environ|getenv)/);
  }
});

test('Unicode UTF-8 columns map back to exact JavaScript UTF-16 source indices', () => {
  const text = `import os\nprefix = '🔎é'; answer = os.getenv('UNICODE_REAL')\n`;
  assert.equal(reads(text)[0].index, text.indexOf('os.getenv'));
  assert.equal(sandbox.lineAt(text, reads(text)[0].index), 2);
});

test('shell -c and quoted heredoc bodies parse executable Python while recipe text stays passive', () => {
  const text = `python3 -c 'import os; print(os.getenv("INLINE_REAL"))'\npython3 - <<'PY'\nimport os\nrecipe = "os.getenv('HEREDOC_FAKE')"\nprint(os.environ['HEREDOC_REAL'])\nPY\n`;
  const facts = [...sandbox.inlineProgramEnvironmentReads('fixture.sh', text),
    ...sandbox.embeddedPythonEnvironmentReads('fixture.sh', text)];
  assert.deepEqual(Array.from(facts, item => item.name), ['INLINE_REAL', 'HEREDOC_REAL']);
  for (const fact of facts) assert.match(text.slice(fact.index), /^os\./);
  const doubleQuoted = 'python3 -c "import os; label = \\"🔎\\"; print(os.getenv(\\"ESCAPED_REAL\\"))"\n';
  const escaped = sandbox.inlineProgramEnvironmentReads('fixture.sh', doubleQuoted)[0];
  assert.equal(escaped.index, doubleQuoted.indexOf('os.getenv'));
});

test('invalid source fails closed and inspected executable effects never run', () => {
  assert.throws(() => reads("import os\nos.getenv('BROKEN'"), /PYTHON_ENVIRONMENT_PARSE_FAILED/);
  assert.deepEqual(names(`import os\nraise RuntimeError('must never execute')\nprint(os.getenv('STATIC_AFTER_RAISE'))\n`), ['STATIC_AFTER_RAISE']);
});

test('real new operational Python setting fails exact receiving-source coverage', () => {
  const file = 'ops/pod/bootstrap.py';
  const baseline = fs.readFileSync(path.join(root, file), 'utf8');
  sandbox.runtimeTextSources = () => [file];
  sandbox.read = () => baseline;
  assert.doesNotThrow(() => sandbox.verifyEnvironmentConsumerCoverage());
  sandbox.read = () => baseline + `new = os.getenv('PYTHON_NEW_OPERATIONAL_SETTING')\n`;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(),
    /CONFIG_SEMANTIC_GAP:.*PYTHON_NEW_OPERATIONAL_SETTING:ops\/pod\/bootstrap.py/);
  sandbox.read = () => baseline + `recipe = "os.getenv('PYTHON_NEW_OPERATIONAL_SETTING')"\n`;
  assert.doesNotThrow(() => sandbox.verifyEnvironmentConsumerCoverage());
});

test('executable heredocs preserve tab-stripped and YAML indentation source positions', () => {
  for (const [file, text] of [
    ['fixture.sh', "python3 - <<-'PY'\n\timport os\n\tprint(os.getenv('TABBED_REAL'))\n\tPY\n"],
    ['fixture.yaml', "command: |\n  python3 - <<'PY'\n  import os\n  print(os.getenv('TABBED_REAL'))\n  PY\n"],
  ]) {
    const facts = sandbox.embeddedPythonEnvironmentReads(file, text);
    assert.equal(facts.length, 1);
    assert.equal(facts[0].index, text.indexOf('os.getenv'));
  }
  assert.equal(sandbox.inlineProgramEnvironmentReads('fixture.sh', "# python3 -c 'import os; os.getenv(\"COMMENT_FAKE\")'\n").length, 0);
  assert.equal(sandbox.embeddedPythonEnvironmentReads('fixture.sh', "# python3 - <<'PY'\nimport os\nos.getenv('COMMENT_FAKE')\nPY\n").length, 0);
});

test('class bodies have separate bindings and methods retain enclosing lexical readers', () => {
  assert.deepEqual(names(`import os
class Foreign:
    os = None
    def method(self):
        return os.getenv('METHOD_REAL')
    callback = lambda: os.getenv('CLASS_LAMBDA_REAL')
    values = [os.getenv('CLASS_COMPREHENSION_REAL') for item in [1]]
os.getenv('AFTER_CLASS_REAL')
`), ['AFTER_CLASS_REAL', 'CLASS_COMPREHENSION_REAL', 'CLASS_LAMBDA_REAL', 'METHOD_REAL']);
  assert.deepEqual(names(`import os
class Local:
    os = None
    class Nested:
        value = os.getenv('NESTED_CLASS_REAL')
def enclosing():
    import os as local
    class Inner:
        local = None
        def method(self):
            return local.getenv('FUNCTION_CLASS_REAL')
`), ['FUNCTION_CLASS_REAL', 'NESTED_CLASS_REAL']);
});

test('lambda and all comprehension targets shadow only their own lexical scope', () => {
  assert.deepEqual(names(`import os
lookup = lambda os: os.getenv('LAMBDA_FAKE')
variadic = lambda *os: os.getenv('VARARGS_FAKE')
keyword = lambda **os: os.getenv('KWARGS_FAKE')
values = [os.getenv('LIST_FAKE') for os in []]
values = {os.getenv('SET_FAKE') for os in []}
values = {os.getenv('DICT_FAKE'): item for os, item in []}
values = (os.getenv('GENERATOR_FAKE') for os in [])
values = [item for os in [] for item in [os.getenv('LATER_ITERABLE_FAKE')] if os.getenv('FILTER_FAKE')]
values = [item for os in [os.getenv('OUTER_ITERABLE_REAL')] for item in []]
defaulted = lambda os=os.getenv('LAMBDA_DEFAULT_REAL'): os.getenv('DEFAULT_PARAMETER_FAKE')
os.getenv('AFTER_SHADOW_REAL')
`), ['AFTER_SHADOW_REAL', 'LAMBDA_DEFAULT_REAL', 'OUTER_ITERABLE_REAL']);
});

test('finite conditional keys and aliases conservatively retain every supported branch', () => {
  assert.deepEqual(names(`import os
KEY = 'BRANCH_A'
if condition:
    KEY = 'BRANCH_B'
os.getenv(KEY)
if condition:
    KEY = 'BRANCH_C'
else:
    if nested:
        KEY = 'BRANCH_D'
    else:
        KEY = 'BRANCH_E'
os.environ[KEY]
os.getenv('EXPRESSION_A' if condition else 'EXPRESSION_B')
reader = os.getenv
if condition:
    reader = None
reader('CONDITIONAL_ALIAS_REAL')
`), ['BRANCH_A', 'BRANCH_B', 'BRANCH_C', 'BRANCH_D', 'BRANCH_E',
    'CONDITIONAL_ALIAS_REAL', 'EXPRESSION_A', 'EXPRESSION_B']);
});

test('new class-adjacent real reader and both finite branches fail exact-source authority', () => {
  const file = 'ops/pod/bootstrap.py';
  const baseline = fs.readFileSync(path.join(root, file), 'utf8');
  sandbox.runtimeTextSources = () => [file];
  sandbox.read = () => baseline + `\nclass Foreign:\n    os = None\nos.getenv('AFTER_CLASS_NEW_SETTING')\n`;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(),
    /CONFIG_SEMANTIC_GAP:.*AFTER_CLASS_NEW_SETTING:ops\/pod\/bootstrap.py/);
  sandbox.read = () => baseline + `\nKEY = 'CONDITIONAL_NEW_A'\nif condition:\n    KEY = 'CONDITIONAL_NEW_B'\nos.getenv(KEY)\n`;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), (error) => {
    assert.match(error.message, /CONFIG_SEMANTIC_GAP:/);
    assert.match(error.message, /CONDITIONAL_NEW_A:ops\/pod\/bootstrap.py/);
    assert.match(error.message, /CONDITIONAL_NEW_B:ops\/pod\/bootstrap.py/);
    return true;
  });
  sandbox.read = () => baseline + `\nlookup = lambda os: os.getenv('LAMBDA_FAKE')\nvalues = [os.getenv('COMPREHENSION_FAKE') for os in []]\n`;
  assert.doesNotThrow(() => sandbox.verifyEnvironmentConsumerCoverage());
});

test('empty literal loops retain aliases, direct receivers and entry keys without visiting body', () => {
  assert.deepEqual(names(`import os
reader = os.getenv
KEY = 'EMPTY_KEY_REAL'
for reader in ():
    reader = None
for item in []:
    KEY = 'LOOP_BODY_FAKE'
    os.getenv('UNEXECUTED_BODY_FAKE')
for os in ():
    pass
reader('EMPTY_ALIAS_REAL')
os.getenv(KEY)
os.getenv('EMPTY_DIRECT_REAL')
`), ['EMPTY_ALIAS_REAL', 'EMPTY_DIRECT_REAL', 'EMPTY_KEY_REAL']);
  assert.deepEqual(names(`import os
reader = os.getenv if condition else None
(reader := os.getenv)('WALRUS_CALL_REAL')
reader('WALRUS_AFTER_REAL')
`), ['WALRUS_AFTER_REAL', 'WALRUS_CALL_REAL']);
});

test('function analysis resolves later global imports and direct call snapshots, erasing local shadows', () => {
  assert.deepEqual(names(`def reader():
    return os.getenv('LATE_GLOBAL_REAL')
import os
reader()
`), ['LATE_GLOBAL_REAL']);
  assert.deepEqual(names(`import os
def reader():
    return os.getenv('EARLY_CALL_REAL')
reader()
os = None
reader()
`), ['EARLY_CALL_REAL']);
  assert.deepEqual(names(`import os
def stale():
    return os.getenv('STALE_GLOBAL_FAKE')
def local():
    os.getenv('UNBOUND_FAKE')
    os = None
os = None
stale()
`), []);
  assert.deepEqual(names(`class Native:
    def method(self):
        return os.getenv('LATE_METHOD_REAL')
import os
`), ['LATE_METHOD_REAL']);
});

test('non-future annotations are potential evaluated readers; local annotations stay passive', () => {
  assert.deepEqual(names(`import os
value: os.getenv('VARIABLE_ANNOTATION_REAL') = 1
def reader(arg: os.getenv('ARG_ANNOTATION_REAL')) -> os.getenv('RETURN_ANNOTATION_REAL'):
    local: os.getenv('LOCAL_ANNOTATION_FAKE') = 1
class Native:
    import os as local
    value: local.getenv('CLASS_ANNOTATION_REAL')
    def method(arg: local.getenv('CLASS_ARG_ANNOTATION_REAL')):
        pass
resolved = reader.__annotations__
`), ['ARG_ANNOTATION_REAL', 'CLASS_ANNOTATION_REAL', 'CLASS_ARG_ANNOTATION_REAL',
    'RETURN_ANNOTATION_REAL', 'VARIABLE_ANNOTATION_REAL']);
  const future = `from __future__ import annotations
import os
import annotationlib as annotations
def reader(arg: os.getenv('FUTURE_EVALUATED_REAL')):
    pass
strings = reader.__annotations__
`;
  assert.deepEqual(names(future), []);
  assert.deepEqual(names(future + `annotations.get_annotations(reader, eval_str=True)\n`), ['FUTURE_EVALUATED_REAL']);
});

test('shell acquisition excludes echo recipes and all passive heredoc bodies', () => {
  for (const text of [
    `echo 'python3 -c "import os; os.getenv(\\"SHELL_LITERAL_FAKE\\")"'\n`,
    `cat <<'EXAMPLE'\npython3 - <<'PY'\nimport os\nos.getenv('PASSIVE_HEREDOC_FAKE')\nPY\nEXAMPLE\n`,
  ]) assert.deepEqual(JSON.parse(JSON.stringify(sandbox.environmentOccurrences('fixture.sh', text))), []);
  const text = `echo "$(python3 -c 'import os; os.getenv("SUBSTITUTION_REAL")')"\npython3 - <<'PY'\nimport os\nos.getenv('HEREDOC_REAL')\nPY\n`;
  const facts = sandbox.environmentOccurrences('fixture.sh', text);
  assert.deepEqual(Array.from(facts, item => item.name), ['HEREDOC_REAL', 'SUBSTITUTION_REAL']);
  for (const fact of facts) assert.equal(fact.line, sandbox.lineAt(text, text.indexOf(`os.getenv('${fact.name}')`) >= 0
    ? text.indexOf(`os.getenv('${fact.name}')`) : text.indexOf(`os.getenv("${fact.name}")`)));
});

test('actual chart readiness argv acquires new literal Python key with exact source position', () => {
  const file = 'charts/ops-pod/templates/workload.yaml';
  const baseline = fs.readFileSync(path.join(root, file), 'utf8');
  const text = baseline.replace('import json; s=json.load', "import os,json; os.getenv('YAML_ARGV_REAL'); s=json.load");
  const facts = sandbox.environmentOccurrences(file, text).filter(item => item.kind === 'embedded-python-process-env');
  assert.deepEqual(Array.from(facts, item => item.name), ['YAML_ARGV_REAL']);
  const raw = sandbox.acquiredPythonEnvironmentReads(file, text)[0];
  assert.equal(raw.index, text.indexOf('os.getenv'));
  assert.equal(facts[0].line, 80);
  for (const passive of [
    `description: "python3 -c import os; os.getenv('YAML_FAKE')"\n`,
    `description: {command: [python3, -c, "import os; os.getenv('YAML_FAKE')"]}\n`,
  ]) assert.deepEqual(JSON.parse(JSON.stringify(sandbox.acquiredPythonEnvironmentReads('fixture.yaml', passive))), []);
});

test('YAML split command/args and block sequences preserve decoded body positions', () => {
  for (const text of [
    `command: [python3]\nargs: [-c, "import os; prefix='é'; os.getenv('SPLIT_REAL')"]\n`,
    `command:\n - python3\n - -c\n - |\n    import os\n    os.getenv('SPLIT_REAL')\n`,
    `command: [python3, -c, 'import os; os.getenv(''SPLIT_REAL'')']\n`,
  ]) {
    const facts = sandbox.acquiredPythonEnvironmentReads('fixture.yaml', text);
    assert.deepEqual(Array.from(facts, item => item.name), ['SPLIT_REAL']);
    assert.equal(facts[0].index, text.indexOf('os.getenv'));
  }
});

test('unresolved environment keys and dynamic executable bodies fail explicitly', () => {
  assert.throws(() => reads(`import os\nos.getenv(unknown_key)\n`), /PYTHON_ENVIRONMENT_UNSUPPORTED: unresolved environment key/);
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', `python3 -c "$DYNAMIC_PROGRAM"\n`), /PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED/);
});

test('actual receiving-source mutation gate rejects all introduced F1/F2/F4/F5 readers', () => {
  const file = 'ops/pod/bootstrap.py';
  const baseline = fs.readFileSync(path.join(root, file), 'utf8');
  for (const append of [
    `reader = os.getenv\nfor reader in ():\n    pass\nreader('NEW_EMPTY_ALIAS')\n`,
    `KEY = 'NEW_EMPTY_KEY'\nfor item in ():\n    KEY = 'OPS_NAMESPACE'\nos.getenv(KEY)\n`,
    `for os in ():\n    pass\nos.getenv('NEW_EMPTY_DIRECT')\n`,
    `def fresh(value: os.getenv('NEW_ANNOTATION')):\n    pass\nresolved = fresh.__annotations__\n`,
    `def fresh_late():\n    return operating.getenv('NEW_LATE_GLOBAL')\nimport os as operating\nfresh_late()\n`,
  ]) {
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => baseline + '\n' + append;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*NEW_/);
  }
  const yamlFile = 'charts/ops-pod/templates/workload.yaml';
  const chart = fs.readFileSync(path.join(root, yamlFile), 'utf8').replace('import json; s=json.load', "import os,json; os.getenv('NEW_YAML_ARGV'); s=json.load");
  sandbox.runtimeTextSources = () => [yamlFile];
  sandbox.read = () => chart;
  // Isolate the actual Python receiving-source mutation from unrelated chart
  // producers, whose complete authority is checked by the environment-only gate.
  const actualOccurrences = sandbox.environmentOccurrences;
  sandbox.environmentOccurrences = (source, text) => actualOccurrences(source, text).filter(item => item.kind === 'embedded-python-process-env');
  try { assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*NEW_YAML_ARGV:charts\/ops-pod\/templates\/workload.yaml/); }
  finally { sandbox.environmentOccurrences = actualOccurrences; }
});

test('lazy annotations resolve final globals and class namespaces; ambiguity fails with source custody', () => {
  assert.deepEqual(names(`${lazyAnnotations ? '' : 'import os as operating\n'}def reader(value: operating.getenv('LATE_ANNOTATION_REAL')):
    pass
import os as operating
resolved = reader.__annotations__
`), ['LATE_ANNOTATION_REAL']);
  assert.deepEqual(names(`import os
class Native:
${lazyAnnotations ? '' : '    import os as local\n'}    reader: local.getenv('LATE_CLASS_ANNOTATION_REAL')
    import os as local
resolved = Native.__annotations__
`), ['LATE_CLASS_ANNOTATION_REAL']);
  assert.throws(() => reads(`lookup = lambda: operating.getenv('AMBIGUOUS_LAMBDA')\nimport os as operating\n`), /PYTHON_ENVIRONMENT_UNSUPPORTED: unresolved lexical os binding/);
  assert.throws(() => sandbox.pythonEnvironmentReads(`import os\nos.getenv(unknown)`, 'ops/private.py'), /PYTHON_ENVIRONMENT_PARSE_FAILED: ops\/private.py/);
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('ops/private.sh', `python3 - <<'PY'\nimport os\n`), /ops\/private.sh: PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED/);
  assert.deepEqual(names(`import os\nfor os in ():\n    pass\nwhile False:\n    os = None\nos.getenv('ZERO_WHILE_REAL')\n`), ['ZERO_WHILE_REAL']);
});

test('F1/F3/F4 invocation snapshots and AugAssign retain exact read positions', () => {
  for (const text of [
    `import os\ndef reader(x: os.getenv('TIMED_NEW')):\n    pass\nresolved = reader.__annotations__\nos = None\n`,
    `import os, annotationlib\ndef reader(x: os.getenv('TIMED_NEW')):\n    pass\nannotationlib.get_annotations(reader, eval_str=True)\nos = None\n`,
    `import os\nclass Reader:\n    @staticmethod\n    def read():\n        return os.getenv('TIMED_NEW')\nReader.read()\nos = None\n`,
    `import os\nos.environ['TIMED_NEW'] += '-suffix'\n`,
  ]) {
    assert.deepEqual(names(text), ['TIMED_NEW']);
    assert.equal(reads(text)[0].index, text.indexOf('os.get') >= 0 ? text.indexOf('os.get') : text.indexOf('os.environ'));
    const file = 'ops/pod/bootstrap.py';
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => fs.readFileSync(path.join(root, file), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*TIMED_NEW:ops\/pod\/bootstrap.py/);
  }
});

test('F2 string evaluation rejects explicitly while future one-layer and local strings stay passive', () => {
  const string = `import os, annotationlib\ndef reader(x: "os.getenv('STRING_NEW')"):\n    local: os.getenv('LOCAL_FAKE')\nannotationlib.get_annotations(reader, eval_str=True)\n`;
  assert.throws(() => reads(string), /PYTHON_ENVIRONMENT_UNSUPPORTED: evaluated string annotation at line 2/);
  assert.deepEqual(names('from __future__ import annotations\n' + string), []);
  assert.deepEqual(names(string.replace('annotationlib.get_annotations(reader, eval_str=True)', 'reader()')), []);
  const file = 'ops/pod/bootstrap.py';
  sandbox.runtimeTextSources = () => [file];
  sandbox.read = () => fs.readFileSync(path.join(root, file), 'utf8') + '\n' + string;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /evaluated string annotation/);
});

test('F5 backticks and env wrappers acquire source; here-string and unresolved wrappers reject', () => {
  for (const text of [
    'echo `python3 -c \'import os; os.getenv("SHELL_NEW")\'`\n',
    'env -i python3 -c \'import os; os.getenv("SHELL_NEW")\'\n',
    'env -u OMITTED -- python3 -c \'import os; os.getenv("SHELL_NEW")\'\n',
  ]) {
    const facts = sandbox.acquiredPythonEnvironmentReads('fixture.sh', text);
    assert.deepEqual(Array.from(facts, item => item.name), ['SHELL_NEW']);
    assert.equal(facts[0].index, text.indexOf('os.getenv'));
    sandbox.runtimeTextSources = () => ['fixture.sh']; sandbox.read = () => text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*SHELL_NEW:fixture.sh/);
  }
  for (const text of [
    `python3 <<< 'import os; os.getenv("HERESTRING_NEW")'\n`,
    `env --split-string python3 -c 'import os; os.getenv("WRAPPER_NEW")'\n`,
  ]) {
    assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', text), /fixture.sh: PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED/);
    sandbox.runtimeTextSources = () => ['fixture.sh']; sandbox.read = () => text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED/);
  }
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh', 'echo \'`python3 -c "import os; os.getenv(FAKE)"`\'\n')), []);
});

test('F6 heredocs require stdin argv, fd zero and the winning stdin source', async t => {
  for (const command of ['python3 script.py', 'python3 -m module', 'python3 3', 'python3 -c "pass"']) {
    const text = `${command} <<'DATA'\nimport os\nos.getenv('PASSIVE_NEW')\nDATA\n`;
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh', text)), []);
  }
  const unresolvedFd0 = `python3 3<<'DATA'\nimport os\nos.getenv('FD3_FAKE')\nDATA\n`;
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', unresolvedFd0), error =>
    error.stack.includes('fixture.sh') && /unresolved Python stdin source custody/.test(error.stack));
  const passiveFd3 = `python3 3<<'DATA' <<'INPUT'\nimport os\nos.getenv('FD3_FAKE')\nDATA\npass\nINPUT\n`;
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh', passiveFd3)), []);
  const native = spawnSync('sh', ['-c', passiveFd3], { encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);assert.equal(native.stdout, '');
  t.diagnostic(JSON.stringify({ results: [{ name: 'fd3-passive-with-winning-fd0', code: passiveFd3, exit: native.status, stdout: native.stdout, stderr: native.stderr }] }));
  const text = `python3 0<<'FIRST' <<'SECOND'\nimport os\nos.getenv('FIRST_FAKE')\nFIRST\nimport os\nos.getenv('SECOND_NEW')\nSECOND\n`;
  const facts = sandbox.acquiredPythonEnvironmentReads('fixture.sh', text);
  assert.deepEqual(Array.from(facts, item => item.name), ['SECOND_NEW']);
  assert.equal(facts[0].index, text.indexOf("os.getenv('SECOND_NEW')"));
  sandbox.runtimeTextSources = () => ['fixture.sh']; sandbox.read = () => text;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*SECOND_NEW:fixture.sh/);
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', `python3 <<'DATA' </dev/null\nimport os\nos.getenv('REPLACED_FAKE')\nDATA\n`), /Python stdin source is not a regular repository file/);
});

test('external stdin has finite repository custody and rejects readers with target-source identity', () => {
  const actual = fs.readFileSync(path.join(root, 'ops/pod/test-image.sh'), 'utf8');
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('ops/pod/test-image.sh', actual)), []);
  const selected = path.join(root, 'synthetic/external.py');
  const text = `python3 -I - < "${selected}"\n`;
  const original = sandbox.fs;
  const qualify = (code, overrides = {}) => {
    sandbox.fs = { ...fs, existsSync: (file) => file === selected,
      lstatSync: () => ({ isFile: () => true }), realpathSync: (file) => file,
      readFileSync: (file) => { assert.equal(file, selected); return code; }, ...overrides };
    return sandbox.acquiredPythonEnvironmentReads('synthetic/invoke.sh', text);
  };
  try {
    assert.deepEqual(Array.from(qualify(`raise RuntimeError('never execute')\n`)), []);
    assert.throws(() => qualify(`import os\nos.getenv('EXTERNAL_NEW')\n`),
      /external stdin readers require exact receiving-source qualification:.*synthetic\/external.py: EXTERNAL_NEW/);
    assert.throws(() => qualify('', { existsSync: () => false }), /not a regular repository file/);
    assert.throws(() => qualify('', { realpathSync: () => '/outside/external.py' }), /not a regular repository file/);
    assert.throws(() => sandbox.acquiredPythonEnvironmentReads('synthetic/invoke.sh', 'python3 - < "$UNKNOWN"\n'), /unresolved Python stdin file path/);
    assert.throws(() => sandbox.acquiredPythonEnvironmentReads('synthetic/invoke.sh', 'python3 - < ../../outside.py\n'), /unresolved working directory/);
  } finally { sandbox.fs = original; }
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh', `python3 script.py -c "import os; os.getenv('PASSIVE_ARGV')"\n`)), []);
});

test('unknown key alternatives survive finite joins, expressions, aliases and loops', () => {
  for (const text of [
    `import os\ndef compute_key(): return 'NEW_UNKNOWN_KEY'\nKEY='OPS_NAMESPACE'\nif os.getenv('OPS_NAMESPACE'): KEY=compute_key()\nos.getenv(KEY)\n`,
    `import os\nKEY='OPS_NAMESPACE' if condition else unknown_key\nos.getenv(KEY)\n`,
    `import os\nos.getenv('OPS_NAMESPACE' if condition else compute_key())\n`,
    `import os\nKEY='OPS_NAMESPACE'\nif condition: KEY=unknown_key\nCOPY=KEY\nos.environ[COPY]\n`,
    `import os\nfor KEY in ('OPS_NAMESPACE', None): os.getenv(KEY)\n`,
    `import os\nif condition: KEY='OPS_NAMESPACE'\nos.getenv(KEY)\n`,
  ]) {
    assert.throws(() => reads(text), /PYTHON_ENVIRONMENT_UNSUPPORTED: unresolved environment key/);
    const file = 'ops/pod/bootstrap.py';
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => fs.readFileSync(path.join(root, file), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /unresolved environment key/);
  }
  assert.deepEqual(names(`import os\nKEY=unknown\nKEY='RESOLVED_KEY'\nos.getenv(KEY)\n`), ['RESOLVED_KEY']);
});

test('finite function and method aliases retain selected invocation state and passive shadows', () => {
  for (const text of [
    `import os\ndef selected(): return os.getenv('ALIAS_NEW')\naliased=selected\nsecond=aliased\nsecond()\nos=object()\n`,
    `import os\ndef selected(): return os.getenv('ALIAS_NEW')\naliased=selected if condition else None\naliased()\nos=None\n`,
    `import os\nclass Selected:\n    @staticmethod\n    def read(): return os.getenv('ALIAS_NEW')\naliased=Selected.read\naliased()\nos=None\n`,
  ]) {
    assert.deepEqual(names(text), ['ALIAS_NEW']);
    assert.equal(reads(text)[0].index, text.indexOf('os.getenv'));
    const file = 'ops/pod/bootstrap.py';
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => fs.readFileSync(path.join(root, file), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*ALIAS_NEW/);
  }
  assert.deepEqual(names(`import os\ndef selected(): return os.getenv('REBOUND_FAKE')\naliased=selected\naliased=lambda: None\nos=None\naliased()\n`), []);
  assert.deepEqual(names(`import os\ndef selected(): return os.getenv('SHADOW_FAKE')\ndef shadow(selected): selected()\nos=None\nshadow(None)\n`), []);
  assert.deepEqual(names(`import os\ndef recursive():\n    os.getenv('RECURSIVE_REAL')\n    recursive()\nrecursive()\n`), ['RECURSIVE_REAL']);
});

test('lazy class annotations merge evaluation globals with actual class-owned bindings', () => {
  for (const tail of ['Selected.__annotations__', 'annotationlib.get_annotations(Selected)']) {
    const text = `import annotationlib\n${lazyAnnotations ? 'os=object()' : 'import os'}\nclass Selected:\n    value: os.getenv('CLASS_TIMING_NEW')\nimport os\n${tail}\nos=None\n`;
    assert.deepEqual(names(text), ['CLASS_TIMING_NEW']);
    assert.equal(reads(text)[0].index, text.indexOf('os.getenv'));
    const file = 'ops/pod/bootstrap.py';
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => fs.readFileSync(path.join(root, file), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*CLASS_TIMING_NEW/);
  }
  assert.deepEqual(names(`import os\nclass Selected:\n    os=None\n    value: os.getenv('CLASS_SHADOW_FAKE')\nSelected.__annotations__\n`), []);
  assert.deepEqual(names(`class Selected:\n    import os as local\n    value: local.getenv('CLASS_LOCAL_REAL')\nlocal=None\nSelected.__annotations__\n`), ['CLASS_LOCAL_REAL']);
  assert.deepEqual(names(`from __future__ import annotations\nimport os\nclass Selected:\n    value: os.getenv('FUTURE_CLASS_FAKE')\nSelected.__annotations__\n`), []);
  const classString = `import os, annotationlib\nclass Selected:\n    value: \"os.getenv('CLASS_STRING_NEW')\"\nannotationlib.get_annotations(Selected, eval_str=True)\n`;
  if (lazyAnnotations) assert.throws(() => names(classString), /evaluated string annotation/);
  else assert.deepEqual(names(classString), []);
  assert.deepEqual(names(`import os\nclass Selected:\n    os: str\n    value: os.getenv('ANNOTATED_ONLY_REAL')\nSelected.__annotations__\n`), ['ANNOTATED_ONLY_REAL']);
});

test('output redirection operators and operands never become Python argv', () => {
  for (const redirect of ['> /dev/null', '2>/dev/null', '>> /dev/null', '2>>/dev/null', '2>&1']) {
    const text = `python3 ${redirect} <<'PY'\nimport os\nos.getenv('OUTPUT_NEW')\nPY\n`;
    const facts = sandbox.acquiredPythonEnvironmentReads('fixture.sh', text);
    assert.deepEqual(Array.from(facts, item => item.name), ['OUTPUT_NEW']);
    assert.equal(facts[0].index, text.indexOf('os.getenv'));
    sandbox.runtimeTextSources = () => ['fixture.sh']; sandbox.read = () => text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*OUTPUT_NEW:fixture.sh/);
  }
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh', `python3 script.py 2>/dev/null <<'PY'\nimport os\nos.getenv('SCRIPT_FAKE')\nPY\n`)), []);
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', `python3 <&3\n`), /unresolved Python stdin descriptor duplication/);
});

test('heredoc quoting separates passive literal syntax from unresolved shell expansion', () => {
  for (const body of [`os.getenv('$SELECTED_KEY')`, `os.getenv("$(printf NEW_KEY)")`, 'os.getenv("`printf NEW_KEY`")']) {
    const text = `python3 <<PY\nimport os\n${body}\nPY\n`;
    assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', text), /expanded Python heredoc custody/);
    sandbox.runtimeTextSources = () => ['fixture.sh']; sandbox.read = () => text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /expanded Python heredoc custody/);
    // Quoting suppresses shell expansion, not the genuine Python reader.
    // These literal keys are outside the maintained known-name grammar.
    assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', text.replace('<<PY', "<<'PY'")),
      error => error.message.includes('fixture.sh') && /unsupported statically known environment name/.test(error.message));
  }
  for (const delimiter of ['PY', "'PY'", '"PY"', '\\PY']) {
    const text = `python3 <<${delimiter}\nimport os\nos.getenv('UNEXPANDED_REAL')\nPY\n`;
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh', text), item => item.name), ['UNEXPANDED_REAL']);
  }
});

test('synthetic native witnesses establish unknown, alias, annotation and redirect execution', (t) => {
  const version = spawnSync('python3', ['-I', '-c', 'import sys; print(".".join(map(str,sys.version_info[:3])))'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  const lazy = Number(version.stdout.trim().split('.')[1]) >= 14;
  const results = [];
  for (const [name, code] of [
    ['unknown', `import os\nos.environ['NATIVE_KEY']='observed'\ndef compute_key(): return 'NATIVE_KEY'\nKEY='OPS_NAMESPACE'\nif True: KEY=compute_key()\nprint(os.getenv(KEY))\n`],
    ['alias', `import os\nos.environ['NATIVE_KEY']='observed'\ndef selected(): return os.getenv('NATIVE_KEY')\naliased=selected\nprint(aliased())\nos=object()\n`],
    ['class', `${lazy ? 'os=object()' : 'import os'}\nclass Selected:\n    value: os.getenv('NATIVE_KEY')\nimport os\nos.environ['NATIVE_KEY']='observed'\n${lazy ? "print(Selected.__annotations__['value'])" : "print('observed')"}\n`],
  ]) {
    const result = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'observed\n');
    results.push({ name, code, exit: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  for (const [name, code, expectedStdout, expectedStderr] of [
    ['stdout', `python3 > /dev/null <<'PY'\nimport os,sys\nprint(os.getenv('NATIVE_KEY'),file=sys.stderr)\nPY\n`, '', 'observed\n'],
    ['stderr', `python3 2>/dev/null <<'PY'\nimport os\nprint(os.getenv('NATIVE_KEY'))\nPY\n`, 'observed\n', ''],
    ['expansion', `python3 <<PY\nimport os\nprint(os.getenv('$SELECTED_KEY'))\nPY\n`, 'observed\n', ''],
  ]) {
    const result = spawnSync('bash', ['-c', code], { encoding: 'utf8', env: { ...process.env, NATIVE_KEY: 'observed', SELECTED_KEY: 'NATIVE_KEY' } });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, expectedStdout); assert.equal(result.stderr, expectedStderr);
    results.push({ name, code, exit: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.sh', `python3 &>/dev/null <<'PY'\nimport os\nos.getenv('COMBINED_NEW')\nPY\n`), /combined Python output redirection custody/);
  t.diagnostic(JSON.stringify({ pythonVersion: version.stdout.trim(), lazyClassWitness: lazy, results }));
});

test('annotation identities survive chained and conditional aliases with access-time namespaces', () => {
  const cases = [
    `import os\ndef selected(x: os.getenv('IDENTITY_NEW')): pass\na=selected\nb=a\nb.__annotations__\nos=None\n`,
    `import os, annotationlib\ndef selected(x: os.getenv('IDENTITY_NEW')): pass\na=selected if condition else None\nannotationlib.get_annotations(a)\nos=None\n`,
    `import os\nclass Selected:\n    value: os.getenv('IDENTITY_NEW')\na=Selected\nb=a\nb.__annotations__\nos=None\n`,
    `import os, annotationlib\nclass Selected:\n    value: os.getenv('IDENTITY_NEW')\na=Selected\nannotationlib.get_annotations(a)\nos=None\n`,
    `import os\nclass Selected:\n    def method(self, x: os.getenv('IDENTITY_NEW')): pass\nSelected.method.__annotations__\nos=None\n`,
    `import annotationlib\nclass Selected:\n    import os as local\n    def method(self, x: local.getenv('IDENTITY_NEW')): pass\na=Selected\nb=a.method\nlocal=None\nannotationlib.get_annotations(b)\n`,
    `import os\ndef selected(x: os.getenv('IDENTITY_NEW')): pass\na=selected\nselected=None\na.__annotations__\nos=None\n`,
  ];
  for (const text of cases) {
    assert.deepEqual(names(text), ['IDENTITY_NEW']);
    assert.equal(reads(text)[0].index, text.indexOf('os.getenv') >= 0 ? text.indexOf('os.getenv') : text.indexOf('local.getenv'));
    const file = 'ops/pod/bootstrap.py';
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => fs.readFileSync(path.join(root, file), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*IDENTITY_NEW:ops\/pod\/bootstrap.py/);
  }
  assert.deepEqual(names(`import os\ndef selected(x: os.getenv('REBOUND_ANNOTATION_FAKE')): pass\na=selected\na=None\nos=None\n`), lazyAnnotations ? [] : ['REBOUND_ANNOTATION_FAKE']);
  assert.throws(() => reads(`import os\ndef selected(x: os.getenv('UNRESOLVED_NEW')): pass\na=unknown(selected)\na.__annotations__\nos=None\n`), /helper environment capability argument/);
});

test('executable YAML wrappers share shell finite argv modes and passive operands', () => {
  for (const command of ['env, python3', 'env, -i, python3', 'env, -u, OMITTED, --, python3', 'env, env, python3', 'sudo, --, python3']) {
    const text = `command: [${command}, -I]\nargs: [-c, 'import os; os.getenv("YAML_WRAPPER_NEW")']\n`;
    const facts = sandbox.acquiredPythonEnvironmentReads('fixture.yaml', text);
    assert.deepEqual(Array.from(facts, item => item.name), ['YAML_WRAPPER_NEW']);
    assert.equal(facts[0].index, text.indexOf('os.getenv'));
    sandbox.runtimeTextSources = () => ['fixture.yaml']; sandbox.read = () => text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /CONFIG_SEMANTIC_GAP:.*YAML_WRAPPER_NEW:fixture.yaml/);
  }
  for (const mode of ['-m, module', 'script.py', '-I, -m, module', 'env, python3, script.py']) {
    const text = `command: [${mode.startsWith('env') ? '' : 'python3, '}${mode}, -c, 'import os; os.getenv("PASSIVE_YAML_ARGV")']\n`;
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml', text)), []);
  }
  for (const text of [
    `command: [env, --split-string, python3, -c, 'pass']\n`,
    `command: [python3, -W, ignore, -c, 'pass']\n`,
    `command: [python3, -c]\n`,
  ]) assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.yaml', text), /fixture.yaml.*PYTHON_ENVIRONMENT_YAML_UNSUPPORTED|PYTHON_ENVIRONMENT_YAML_UNSUPPORTED: fixture.yaml/);
});

test('recognizable unsupported environment reflection, star imports and returned capabilities reject at receivers', () => {
  const cases = [
    [`import os\ngetattr(os, 'getenv')('UNSUPPORTED_NEW')\n`, 'reflected environment capability'],
    [`import os as operating\ne=operating.environ\ngetattr(e, 'get')('UNSUPPORTED_NEW')\n`, 'reflected environment capability'],
    [`import os\nreflect=getattr\nreflect(os, 'getenv')('UNSUPPORTED_NEW')\n`, 'reflected environment capability'],
    [`import os, builtins\nbuiltins.getattr(os, 'getenv')('UNSUPPORTED_NEW')\n`, 'reflected environment capability'],
    [`from os import *\ngetenv('UNSUPPORTED_NEW')\n`, 'os star-import capability'],
    [`import os\ndef helper(): return os.getenv\na=helper()\na('UNSUPPORTED_NEW')\n`, 'helper-returned environment capability'],
    [`from os import environ as e\ndef helper():\n    reader=e.get\n    return reader\nhelper()('UNSUPPORTED_NEW')\n`, 'helper-returned environment capability'],
    [`import os\ndef helper(): return os.environ\nhelper()['UNSUPPORTED_NEW']\n`, 'helper-returned environment capability'],
    [`import os\nhelper=lambda: os.getenv\nhelper()('UNSUPPORTED_NEW')\n`, 'helper-returned environment capability'],
    [`import os\ndef helper(): return [os.getenv]\nhelper()[0]('UNSUPPORTED_NEW')\n`, 'helper-returned environment capability'],
    [`import os\ndef helper(reader): return reader\nhelper(os.getenv)('UNSUPPORTED_NEW')\n`, 'helper environment capability argument'],
    [`import os\ndef selected(): return os.getenv('UNSUPPORTED_NEW')\ndef helper(): return selected\na=helper()\na()\nos=None\n`, 'helper-returned environment capability'],
  ];
  for (const [text, reason] of cases) {
    assert.throws(() => sandbox.pythonEnvironmentReads(text, 'ops/pod/bootstrap.py'), error => error.message.includes('ops/pod/bootstrap.py') && error.message.includes(reason));
    sandbox.runtimeTextSources = () => ['ops/pod/bootstrap.py'];
    sandbox.read = () => fs.readFileSync(path.join(root, 'ops/pod/bootstrap.py'), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), error => error.message.includes('ops/pod/bootstrap.py') && error.message.includes(reason));
  }
  assert.deepEqual(names(`class Foreign: pass\nforeign=Foreign()\ngetattr(foreign, 'getenv')('FOREIGN_FAKE')\ndef helper(): return 'PASSIVE_STRING'\nhelper()\n`), []);
});

test('native Python establishes explicit alias and method annotation and unsupported capability reads', async t => {
  const results = [];
  for (const [name, body] of [
    ['function-alias', `def selected(x: os.getenv('NATIVE_KEY')): pass\na=selected\nprint(a.__annotations__['x'])\nos=None\n`],
    ['class-alias', `class Selected:\n    value: os.getenv('NATIVE_KEY')\na=Selected\nprint(a.__annotations__['value'])\nos=None\n`],
    ['method-annotation', `class Selected:\n    def method(self, x: os.getenv('NATIVE_KEY')): pass\nprint(Selected.method.__annotations__['x'])\nos=None\n`],
    ['method-local-annotation', `class Selected:\n    import os as local\n    def method(self, x: local.getenv('NATIVE_KEY')): pass\na=Selected.method\nprint(a.__annotations__['x'])\n`],
    ['reflection', `print(getattr(os, 'getenv')('NATIVE_KEY'))\n`],
    ['star', `from os import *\nprint(getenv('NATIVE_KEY'))\n`],
    ['helper', `def helper(): return os.getenv\nreader=helper()\nprint(reader('NATIVE_KEY'))\n`],
    ['container-helper', `def helper(): return [os.getenv]\nprint(helper()[0]('NATIVE_KEY'))\n`],
    ['parameter-helper', `def helper(reader): return reader\nprint(helper(os.getenv)('NATIVE_KEY'))\n`],
    ['callback-helper', `def selected(): return os.getenv('NATIVE_KEY')\ndef helper(): return selected\nreader=helper()\nprint(reader())\nos=None\n`],
  ]) {
    const code = `import os\nos.environ['NATIVE_KEY']='observed'\n` + body;
    const result = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'observed\n');
    results.push({ name, code, exit: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  t.diagnostic(JSON.stringify({ results }));
});

test('conditional class aliases retain all method annotation identities and unknown YAML custody rejects', () => {
  const text = `import os\nclass Left:\n    def read(self, x: os.getenv('LEFT_METHOD_NEW')): pass\nclass Right:\n    def read(self, x: os.getenv('RIGHT_METHOD_NEW')): pass\nselected=Left if condition else Right\nselected.read.__annotations__\nos=None\n`;
  assert.deepEqual(names(text), ['LEFT_METHOD_NEW', 'RIGHT_METHOD_NEW']);
  sandbox.runtimeTextSources = () => ['ops/pod/bootstrap.py'];
  sandbox.read = () => fs.readFileSync(path.join(root, 'ops/pod/bootstrap.py'), 'utf8') + '\n' + text;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), error => error.message.includes('LEFT_METHOD_NEW') && error.message.includes('RIGHT_METHOD_NEW'));
  for (const yaml of [
    `command: [env, null, python3, -c, 'pass']\n`,
    `command: [python3]\nargs: null\n`,
  ]) assert.throws(() => sandbox.acquiredPythonEnvironmentReads('fixture.yaml', yaml), /PYTHON_ENVIRONMENT_YAML_UNSUPPORTED: fixture.yaml/);
});

test('callable and literal-container helper arguments fail closed through finite aliases', () => {
  for (const text of [
    `import os\ndef selected(): return os.getenv('CALLBACK_ARGUMENT_NEW')\ndef invoke(callback): return callback()\ninvoke(selected)\nos=None\n`,
    `import os\ndef selected(): return os.getenv('CALLBACK_ARGUMENT_NEW')\nalias=selected\ndef invoke(callback): return callback()\ninvoke(callback=alias)\nos=None\n`,
    `import os\ndef invoke(callbacks): return callbacks[0]('CONTAINER_ARGUMENT_NEW')\ninvoke([os.getenv])\nos=None\n`,
    `import os\ndef invoke(callbacks): return callbacks['reader']('CONTAINER_ARGUMENT_NEW')\ninvoke({'reader':os.getenv})\nos=None\n`,
    `import os\nhandlers=[os.getenv]\nalias=handlers\ndef invoke(callbacks): return callbacks[0]('CONTAINER_ARGUMENT_NEW')\ninvoke(alias)\nos=None\n`,
    `import os\nhandlers={'reader':os.getenv}\nalias=handlers if condition else {'reader':None}\ndef invoke(callbacks): return callbacks['reader']('CONTAINER_ARGUMENT_NEW')\ninvoke(alias)\nos=None\n`,
    `import os\ndef invoke(module): return module.getenv('MODULE_ARGUMENT_NEW')\ninvoke(os)\nos=None\n`,
    `import os\nalias=[{'reader':os.environ.get}]\ndef invoke(readers): return readers[0]['reader']('CONTAINER_ARGUMENT_NEW')\ninvoke(alias)\nos=None\n`,
    `import os\ndef invoke(callback): return callback('STARRED_ARGUMENT_NEW')\ninvoke(*(os.getenv,))\nos=None\n`,
  ]) {
    assert.throws(() => sandbox.pythonEnvironmentReads(text, 'ops/pod/bootstrap.py'), /ops\/pod\/bootstrap.py.*read-only Python environment discovery failed[\s\S]*helper environment capability argument/);
    sandbox.runtimeTextSources = () => ['ops/pod/bootstrap.py'];
    sandbox.read = () => fs.readFileSync(path.join(root, 'ops/pod/bootstrap.py'), 'utf8') + '\n' + text;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /helper environment capability argument/);
  }
  assert.throws(() => reads(`import os\nreader,=[os.getenv]\nreader('UNPACK_ARGUMENT_NEW')\n`), /environment capability unpacking/);
  assert.deepEqual(names(`import os\nhandlers=[os.getenv]\nhandlers=['passive']\ndef invoke(values): return values[0]\ninvoke(handlers)\nos=None\n`), []);
  assert.deepEqual(names(`def invoke(values): return values[0]\nitems=['ordinary', {'number':3}]\nalias=items\ninvoke(alias)\n`), []);
  assert.throws(() => reads(`import os\ndef invoke(key): return os.getenv(key)\n`), /unresolved environment key/);
});

test('annotation readers retain explicit callable/class/method target custody; ordinary calls stay finite', () => {
  for (const [definition, target] of [
    [`def selected(x: os.getenv('ANNOTATION_TARGET_NEW')): pass`, 'selected'],
    [`class Selected:\n    value: os.getenv('ANNOTATION_TARGET_NEW')`, 'Selected'],
    [`class Selected:\n    def method(self, x: os.getenv('ANNOTATION_TARGET_NEW')): pass`, 'Selected.method'],
  ]) {
    for (const access of [`annotationlib.get_annotations(${target})`, `get_annotations(obj=${target})`]) {
      const text = `import os, annotationlib\nfrom annotationlib import get_annotations\n${definition}\n${access}\nos=None\n`;
      assert.deepEqual(names(text), ['ANNOTATION_TARGET_NEW']);
    }
  }
  assert.deepEqual(names(`import os\ndef selected(): return os.getenv('ORDINARY_CALL_NEW')\nalias=selected\nalias()\nos=None\n`), ['ORDINARY_CALL_NEW']);
  assert.deepEqual(names(`def selected(value): return value\nselected('plain')\nselected(['ordinary', {'number':3}])\n`), []);
});

test('native callable/list/dict and aliased-container argument witnesses establish real reads', async t => {
  const results=[];
  for (const [name, body] of [
    ['callback', `def selected(): return os.getenv('NATIVE_KEY')\ndef invoke(callback): return callback()\nprint(invoke(selected))\nos=None\n`],
    ['list', `def invoke(callbacks): return callbacks[0]('NATIVE_KEY')\nprint(invoke([os.getenv]))\nos=None\n`],
    ['dict', `def invoke(callbacks): return callbacks['reader']('NATIVE_KEY')\nprint(invoke({'reader':os.getenv}))\nos=None\n`],
    ['alias', `handlers=[os.getenv]\nalias=handlers\ndef invoke(callbacks): return callbacks[0]('NATIVE_KEY')\nprint(invoke(alias))\nos=None\n`],
    ['snapshot-helper', `env={**os.environ}\ndef invoke(environment): return environment['NATIVE_KEY']\nprint(invoke(env))\nos=None\n`],
    ['module-helper', `def invoke(module): return module.getenv('NATIVE_KEY')\nprint(invoke(os))\nos=None\n`],
  ]) {
    const code=`import os\nos.environ['NATIVE_KEY']='observed'\n${body}`;
    const result=await nativePython(t,['-I','-c',code],{encoding:'utf8'});
    if (!result) continue;
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'observed\n');
    results.push({name,code,exit:result.status,stdout:result.stdout,stderr:result.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('pure callbacks and subprocess snapshots remain data; opaque environment snapshot transfer rejects', () => {
  assert.deepEqual(names(`def selected(): return 'plain'\ndef invoke(callback): return callback()\ninvoke(selected)\n`), []);
  assert.deepEqual(names(`class Parser:\n    def parse(self): return 'plain'\ndef constructor(factory): return factory()\nconstructor(Parser)\n`), []);
  assert.deepEqual(names(`def selected(): return [selected]\ndef invoke(callback): return callback()\ninvoke(selected)\n`), []);
  for (const text of [
    `import os, subprocess\nenv={**os.environ,'CUSTOM':'plain'}\nsubprocess.Popen(['synthetic'],env=env)\n`,
    `import os\nimport subprocess as process\nenv={**os.environ,'CUSTOM':'plain'}\nalias=env\nprocess.run(['synthetic'],env=alias)\n`,
  ]) assert.deepEqual(names(text), []);
  for (const text of [
    `import os\nenv={**os.environ,'CUSTOM':'plain'}\ndef invoke(environment): return environment['SNAPSHOT_HELPER_NEW']\ninvoke(env)\nos=None\n`,
    `import os\nenv={**os.environ,'CUSTOM':'plain'}\nalias=env\ndef invoke(environment): return environment.get('SNAPSHOT_HELPER_NEW')\ninvoke(alias)\nos=None\n`,
    `import os, subprocess\nsubprocess.run(['synthetic'],env={'reader':os.getenv})\nos=None\n`,
  ]) {
    assert.throws(() => reads(text), /helper environment capability argument/);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+text;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(), /helper environment capability argument/);
  }
});

test('native pure callback and subprocess environment snapshot controls execute only synthetic programs', async t => {
  const results=[];
  for (const [name,code] of [
    ['pure-callback', `def selected(): return 'plain'\ndef invoke(callback): return callback()\nprint(invoke(selected))\n`],
    ['snapshot-sink', `import os,subprocess,sys\nenv={**os.environ,'SYNTHETIC_MARKER':'plain'}\nsubprocess.run([sys.executable,'-I','-c','print("plain")'],env=env,check=True)\n`],
  ]) {
    const result=await nativePython(t,['-I','-c',code],{encoding:'utf8'});
    if (!result) continue;
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'plain\n');
    results.push({name,code,exit:result.status,stdout:result.stdout,stderr:result.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('recognized capability containers reject unmodeled selection, mutation and iteration custody', () => {
  for (const text of [
    `import os\nhandlers=[os.getenv]\nreader=handlers[0]\nreader('CONTAINER_USE_NEW')\nos=None\n`,
    `import os\nhandlers=[os.getenv]\nreader=handlers.pop()\nreader('CONTAINER_USE_NEW')\nos=None\n`,
    `import os\nhandlers=[os.getenv]\nfor reader in handlers: reader('CONTAINER_USE_NEW')\nos=None\n`,
    `import os\nhandlers={}\nhandlers['reader']=os.getenv\nhandlers['reader']('CONTAINER_USE_NEW')\nos=None\n`,
  ]) {
    assert.throws(() => reads(text), /environment capability container|environment capability assignment receiver/);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+text;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(), /environment capability container|environment capability assignment receiver/);
  }
  assert.deepEqual(names(`values=['plain']\nalias=values\nitem=alias[0]\nalias.pop()\nfor value in values: pass\nvalues[0]='plain'\n`),[]);
});

test('annotation and subprocess exemptions require complete singleton authority across finite branches', async t => {
  const cases=[
    ['annotation-module-union', `import os,annotationlib,types\ndef selected():return os.getenv('NATIVE_KEY')\nother=types.SimpleNamespace(get_annotations=lambda callback:callback())\ncondition=False\nmodule=annotationlib if condition else other\nprint(module.get_annotations(selected))\nos=None\n`],
    ['snapshot-value-union', `import os,subprocess\ncallbacks={'reader':os.getenv}\ncondition=False\nsource=os.environ if condition else callbacks\nenvironment={**source}\nsubprocess.Popen([],env=environment)\nos=None\n`],
    ['annotation-known', `import os,annotationlib\ndef selected():return os.getenv('NATIVE_KEY')\ndef invoke(callback):return callback()\ncondition=False\nreader=annotationlib.get_annotations if condition else invoke\nprint(reader(selected))\nos=None\n`],
    ['annotation-opaque', `import os,annotationlib\ndef selected():return os.getenv('NATIVE_KEY')\ninvoke=lambda callback:callback()\ncondition=False\nreader=annotationlib.get_annotations if condition else invoke\nprint(reader(selected))\nos=None\n`],
    ['annotation-statement-join', `import os,annotationlib\ndef selected():return os.getenv('NATIVE_KEY')\ninvoke=lambda callback:callback()\nreader=annotationlib.get_annotations\nif True:reader=invoke\nprint(reader(selected))\nos=None\n`],
    ['snapshot-known', `import os,subprocess\nclass Other:\n    @staticmethod\n    def Popen(args,env=None):return env.get('NATIVE_KEY')\nenvironment={**os.environ}\ncondition=False\nprocess=subprocess if condition else Other\nprint(process.Popen([],env=environment))\nos=None\n`],
    ['snapshot-opaque', `import os,subprocess,types\nother=types.SimpleNamespace(Popen=lambda args,env=None:env.get('NATIVE_KEY'))\nenvironment={**os.environ}\ncondition=False\nprocess=subprocess if condition else other\nprint(process.Popen([],env=environment))\nos=None\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'), /helper environment capability argument/);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(), /helper environment capability argument/);
    const nativePayload=name==='snapshot-value-union' ? code.replace('subprocess.Popen([],env=environment)', `print(environment['reader']('NATIVE_KEY'))`) : code;
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${nativePayload}`;
    const result=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!result) continue;
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:result.status,stdout:result.stdout,stderr:result.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('known custody receiver mutations reject before annotation or snapshot exemptions', async t => {
  const results=[];
  for(const [name,code] of [
    ['annotation-mutation', `import os,annotationlib\ndef selected():return os.getenv('NATIVE_KEY')\nannotationlib.get_annotations=lambda callback:callback()\nprint(annotationlib.get_annotations(selected))\nos=None\n`],
    ['snapshot-mutation', `import os,subprocess\nsubprocess.Popen=lambda args,env=None:env.get('NATIVE_KEY')\nenvironment={**os.environ}\nprint(subprocess.Popen([],env=environment))\nos=None\n`],
  ]) {
    assert.throws(()=>reads(code), /known environment custody receiver mutation/);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(), /known environment custody receiver mutation/);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const result=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!result) continue;
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:result.status,stdout:result.stdout,stderr:result.stderr});
  }
  for(const code of [
    `import annotationlib\nannotationlib.get_annotations: object=lambda callback:callback()\n`,
    `import subprocess\nsubprocess.run += []\n`,
    `import subprocess\ndel subprocess.Popen\n`,
  ]) assert.throws(()=>reads(code), /known environment custody receiver mutation/);
  t.diagnostic(JSON.stringify({results}));
});

test('finite role combinations retain recognizable capability custody through every supported projection', async t => {
  const cases=[
    ['passed-exemption-module', `import os,subprocess\ndef mutate(module):module.Popen=lambda args,env=None:env.get('NATIVE_KEY')\nmutate(subprocess)\nenvironment={**os.environ}\nprint(subprocess.Popen([],env=environment))\nos=None\n`, /helper environment capability argument/],
    ['copied-snapshot', `import os\nenvironment=os.environ.copy()\ndef invoke(env):return env.get('NATIVE_KEY')\nprint(invoke(environment))\nos=None\n`, /helper environment capability argument/],
    ['class-instance-projection', `import os\nclass Selected:\n    def read(self):return os.getenv('NATIVE_KEY')\ninstance=Selected()\nprint(instance.read())\nos=None\n`, /environment capability container access/],
    ['reflected-sink-mutation', `import os,subprocess\nmutator=setattr\nmutator(subprocess,'Popen',lambda args,env=None:env.get('NATIVE_KEY'))\nenvironment={**os.environ}\nprint(subprocess.Popen([],env=environment))\nos=None\n`, /known environment custody receiver mutation/],
    ['default-reader', `import os\ndef invoke(reader=os.getenv):return reader('NATIVE_KEY')\nprint(invoke())\nos=None\n`, /helper environment capability default argument/],
    ['default-lambda-reader', `import os\ninvoke=lambda reader=os.getenv:reader('NATIVE_KEY')\nprint(invoke())\nos=None\n`, /helper environment capability default argument/],
    ['exception-container', `import os\nhandlers=[os.getenv]\ntry:pass\nexcept Exception:handlers=[]\ndef invoke(callbacks):return callbacks[0]('NATIVE_KEY')\nprint(invoke(handlers))\nos=None\n`, /helper environment capability argument/],
    ['match-container', `import os\nhandlers=[os.getenv]\nmatch 'keep':\n    case 'replace':handlers=[]\ndef invoke(callbacks):return callbacks[0]('NATIVE_KEY')\nprint(invoke(handlers))\nos=None\n`, /helper environment capability argument/],
    ['boolean-callback', `import os\ndef selected():return os.getenv('NATIVE_KEY')\ndef invoke(callback):return callback()\ncallback=None or selected\nprint(invoke(callback))\nos=None\n`, /helper environment capability argument/],
    ['boolean-container', `import os\nhandlers=[] or [os.getenv]\ndef invoke(callbacks):return callbacks[0]('NATIVE_KEY')\nprint(invoke(handlers))\nos=None\n`, /helper environment capability argument/],
    ['concatenated-container', `import os\nhandlers=[os.getenv]+[]\ndef invoke(callbacks):return callbacks[0]('NATIVE_KEY')\nprint(invoke(handlers))\nos=None\n`, /helper environment capability argument/],
    ['comprehension-container', `import os\nhandlers=[os.getenv for item in [1]]\ndef invoke(callbacks):return callbacks[0]('NATIVE_KEY')\nprint(invoke(handlers))\nos=None\n`, /helper environment capability argument/],
    ['comprehension-iteration', `import os\nhandlers=[os.getenv]\nprint([reader('NATIVE_KEY') for reader in handlers][0])\nos=None\n`, /environment capability container iteration/],
    ['augmented-container', `import os\nhandlers=[]\nhandlers += [os.getenv]\nprint(handlers[0]('NATIVE_KEY'))\nos=None\n`, /environment capability augmented assignment/],
    ['annotated-capability-assignment', `import os,types\nother=types.SimpleNamespace()\nother.reader: object=os.getenv\nprint(other.reader('NATIVE_KEY'))\nos=None\n`, /environment capability assignment receiver/],
    ['unpacked-container', `import os\nreader,=[os.getenv]\nprint(reader('NATIVE_KEY'))\nos=None\n`, /environment capability unpacking/],
    ['mixed-reader-projection', `import os,types\nother=types.SimpleNamespace(getenv=lambda key:os.getenv(key))\ncondition=False\nmodule=os if condition else other\nprint(module.getenv('NATIVE_KEY'))\nos=None\n`, /unresolved environment callable authority|helper environment capability argument/],
    ['lambda-callback', `import os\nselected=lambda:os.getenv('NATIVE_KEY')\ndef invoke(callback):return callback()\nprint(invoke(selected))\nos=None\n`, /helper environment capability argument/],
  ];
  const results=[];
  for(const [name,code,reason] of cases){
    const eagerCached = !lazyAnnotations && name === 'class-key-mutation';
    if (eagerCached) assert.deepEqual(names(code), ['OPS_NAMESPACE']);
    else assert.throws(()=>reads(code),reason);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    if (eagerCached) sandbox.verifyEnvironmentConsumerCoverage();
    else assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),reason);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const result=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!result) continue;
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:result.status,stdout:result.stdout,stderr:result.stderr});
  }
  assert.deepEqual(names(`def selected():return 'plain'\ndef invoke(callback):return callback()\ninvoke(None or selected)\nvalues=['plain']+[]\nvalues += ['data']\ncopy=[item for item in values]\n`),[]);
  assert.deepEqual(names(`import os,subprocess\nenvironment=os.environ.copy()\nsubprocess.run(['synthetic'],env=environment)\n`),[]);
  assert.throws(()=>reads(`import os,annotationlib\ndef selected(x:os.getenv('NATIVE_KEY')):pass\nother=object()\ntarget=selected if condition else other\nannotationlib.get_annotations(target)\n`),/unresolved annotation evaluation target/);
  t.diagnostic(JSON.stringify({results}));
});

test('snapshot producer keys and exact forwarding helpers retain finite data custody', async t => {
  const positive=`import os,subprocess\nenvironment=os.environ.copy()\nalias=environment\nalias['SYNTHETIC_WRITTEN']='plain'\nprint(environment['SYNTHETIC_WRITTEN'])\ndef forward(command, env):return subprocess.Popen(command,env=env)\nforward(['synthetic'],environment)\n`;
  assert.deepEqual(names(positive),[]);
  assert.deepEqual(names(`import os,subprocess\nenvironment={**os.environ,'SYNTHETIC_WRITTEN':'plain'}\nprint(environment['SYNTHETIC_WRITTEN'])\ndef forward(*, env):return subprocess.run(['synthetic'],env=env)\nforward(env=environment)\n`),[]);
  const negatives=[
    ['snapshot-mixed-receiver-write', `import os\nfirst=os.environ.copy()\nsecond=os.environ.copy()\ncondition=False\nchosen=first if condition else second\nchosen['NATIVE_KEY']='plain'\nprint(first['NATIVE_KEY'])\nos=None\n`, /unresolved environment snapshot producer receiver/],
    ['snapshot-mixed-key-write', `import os\nenvironment=os.environ.copy()\ncondition=False\nkey='NATIVE_KEY' if condition else 'OTHER'\nenvironment[key]='plain'\nprint(environment['NATIVE_KEY'])\nos=None\n`, /unresolved environment snapshot producer key/],
    ['snapshot-unwritten', `import os\nenvironment=os.environ.copy()\nprint(environment['NATIVE_KEY'])\nos=None\n`, /environment capability container access/],
    ['snapshot-conditional-write', `import os\nenvironment=os.environ.copy()\nif False:environment['NATIVE_KEY']='plain'\nprint(environment['NATIVE_KEY'])\nos=None\n`, /environment capability container access/],
    ['snapshot-deleted-write', `import os\nenvironment=os.environ.copy()\nenvironment['NATIVE_KEY']='plain'\ndel environment['NATIVE_KEY']\ndef invoke(env):return env.get('NATIVE_KEY','observed')\nprint(invoke(environment))\nos=None\n`, /helper environment capability argument/],
    ['snapshot-reader-forwarder', `import os,subprocess\nenvironment=os.environ.copy()\ndef forward(command,env):return env.get('NATIVE_KEY')\nprint(forward([],environment))\nos=None\n`, /helper environment capability argument/],
  ];
  const results=[];
  for(const [name,code,reason] of negatives){
    const eagerCached = !lazyAnnotations && name === 'class-key-mutation';
    if (eagerCached) assert.deepEqual(names(code), ['OPS_NAMESPACE']);
    else assert.throws(()=>reads(code),reason);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    if (eagerCached) sandbox.verifyEnvironmentConsumerCoverage();
    else assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),reason);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const result=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!result) continue;
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:result.status,stdout:result.stdout,stderr:result.stderr,nativeMeaning:name==='snapshot-deleted-write'?'explicit ordinary fallback after deleting copied value':'actual copied environment value read'});
  }
  assert.throws(()=>reads(`import os,subprocess\nenvironment=os.environ.copy()\ndef forward(command,env):return subprocess.Popen(command,env=env)\nforward(*[],environment)\n`),/helper environment capability argument/);
  const nativePositive=positive.replace("forward(['synthetic'],environment)", `forward([__import__('sys').executable,'-I','-c','print("plain")'],environment).wait()`);
  const native=await nativePython(t,['-I','-c',nativePositive],{encoding:'utf8'});
  assert.ok(native, 'this witness has no version-specific dependency');
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'plain\nplain\n');
  results.push({name:'snapshot-forward-positive',code:nativePositive,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  t.diagnostic(JSON.stringify({results}));
});

test('snapshot forwarding excludes decorated and implicitly bound method argument orders', async t => {
  const code=`import os,subprocess\nclass Forward:\n    @classmethod\n    def launch(cls,command):\n        print(command.get('NATIVE_KEY'))\n        return subprocess.Popen(['synthetic-do-not-execute'],env=cls)\nenvironment=os.environ.copy()\nForward.launch(environment)\nos=None\n`;
  assert.throws(()=>reads(code),/helper environment capability argument/);
  sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
  sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
  assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/helper environment capability argument/);
  const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
  const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
  assert.ok(native, 'this witness has no version-specific dependency');
  assert.notEqual(native.status,0);assert.equal(native.stdout,'observed\n');assert.match(native.stderr,/items|mapping|iterable/);
  t.diagnostic(JSON.stringify({name:'classmethod-binding',code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr,nativeMeaning:'Actual copied environment value read precedes invalid class-valued subprocess env; no child program executes.'}));
  assert.throws(()=>reads(`import os,subprocess\ndef decorator(callback):return callback\n@decorator\ndef forward(command,env):return subprocess.Popen(command,env=env)\nenvironment=os.environ.copy()\nforward(['synthetic'],environment)\n`),/helper environment capability argument/);
});

test('known receiver namespace and bound mutation reflection cannot erase exemption custody', async t => {
  const results=[];
  for(const [name,mutation] of [
    ['namespace-mutation', `subprocess.__dict__['Popen']=lambda args,env=None:env.get('NATIVE_KEY')`],
    ['bound-mutation', `subprocess.__setattr__('Popen',lambda args,env=None:env.get('NATIVE_KEY'))`],
  ]) {
    const code=`import os,subprocess\n${mutation}\nenvironment=os.environ.copy()\nprint(subprocess.Popen([],env=environment))\nos=None\n`;
    assert.throws(()=>reads(code),/known environment custody receiver reflection/);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/known environment custody receiver reflection/);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('snapshot receiver authority uses definition and closure scopes instead of caller globals', async t => {
  const foreign=`class Foreign:\n    @staticmethod\n    def Popen(command,env=None):return env.get('NATIVE_KEY')\n`;
  const cases=[
    ['global-callback-export', `import os\ncallback=None\ndef create():\n    global callback\n    def selected():return os.getenv('NATIVE_KEY')\n    callback=selected\ncreate()\nprint(callback())\nos=None\n`, /global or nonlocal environment authority write/],
    ['late-global-reader-callback-export', `callback=None\ndef selected():return getenv('NATIVE_KEY')\ndef create():\n    global callback\n    callback=selected\ncreate()\nfrom os import getenv\nprint(callback())\ngetenv=None\n`, /global or nonlocal environment authority write/],
    ['parameter-shadow', `import os,subprocess\n${foreign}def forward(command,env,subprocess):return subprocess.Popen(command,env=env)\nenvironment=os.environ.copy()\nprint(forward([],environment,Foreign))\nos=None\n`, /helper environment capability argument/],
    ['local-shadow', `import os,subprocess\n${foreign}def forward(command,env):\n    subprocess=Foreign\n    return subprocess.Popen(command,env=env)\nenvironment=os.environ.copy()\nprint(forward([],environment))\nos=None\n`, /helper environment capability argument/],
    ['global-write', `import os,subprocess\n${foreign}def forward(command,env):\n    global subprocess\n    subprocess=Foreign\n    return subprocess.Popen(command,env=env)\nenvironment=os.environ.copy()\nprint(forward([],environment))\nos=None\n`, /helper environment capability argument|global or nonlocal environment authority write/],
    ['callee-module-global', `import os,subprocess\n${foreign}subprocess=Foreign\nenvironment=os.environ.copy()\ndef selected():return subprocess.Popen([],env=environment)\ndef caller():\n    import subprocess\n    environment={}\n    return selected()\nprint(caller())\nos=None\n`, /helper environment capability argument/],
    ['closure-owner-shadow', `import os,subprocess\n${foreign}def outer():\n    subprocess=Foreign\n    environment=os.environ.copy()\n    def forward(command,env):return subprocess.Popen(command,env=env)\n    return forward([],environment)\nprint(outer())\nos=None\n`, /helper environment capability argument/],
    ['closure-parameter', `import os,subprocess\n${foreign}def outer(subprocess):\n    environment=os.environ.copy()\n    def forward(command,env):return subprocess.Popen(command,env=env)\n    return forward([],environment)\nprint(outer(Foreign))\nos=None\n`, /helper environment capability argument/],
    ['nonlocal-write', `import os\n${foreign}def outer():\n    import subprocess\n    def change():\n        nonlocal subprocess\n        subprocess=Foreign\n    def forward(command,env):return subprocess.Popen(command,env=env)\n    environment=os.environ.copy()\n    change()\n    return forward([],environment)\nprint(outer())\nos=None\n`, /global or nonlocal environment authority write|helper environment capability argument/],
    ['global-key-write', `import os\nKEY='OPS_NAMESPACE'\ndef change():\n    global KEY\n    KEY='NATIVE_KEY'\nchange()\nprint(os.getenv(KEY))\nos=None\n`, /global or nonlocal environment authority write/],
    ['global-module-import', `os=None\ndef change():\n    global os\n    import os\nchange()\nprint(os.getenv('NATIVE_KEY'))\nos=None\n`, /global or nonlocal environment authority write/],
  ];
  const results=[];
  for(const [name,code,reason] of cases){
    const eagerCached = !lazyAnnotations && name === 'class-key-mutation';
    if (eagerCached) assert.deepEqual(names(code), ['OPS_NAMESPACE']);
    else assert.throws(()=>reads(code),reason);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    if (eagerCached) sandbox.verifyEnvironmentConsumerCoverage();
    else assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),reason);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('unbound, reassigned and ambiguous snapshot module bindings reject with source identity', () => {
  for(const code of [
    `import os\ndef forward(command,env):\n    subprocess.Popen(command,env=env)\n    import subprocess\nenvironment=os.environ.copy()\nforward([],environment)\n`,
    `import os\ndef forward(command,env):\n    import subprocess\n    subprocess.Popen(command,env=env)\n    subprocess=object()\nenvironment=os.environ.copy()\nforward([],environment)\n`,
    `import os\ndef forward(command,env):\n    if condition:import subprocess\n    return subprocess.Popen(command,env=env)\nenvironment=os.environ.copy()\nforward([],environment)\n`,
    `import os,subprocess\ndef forward(command,env,process=subprocess):return process.Popen(command,env=env)\nenvironment=os.environ.copy()\nforward([],environment)\n`,
    `import os,subprocess\nmodule=subprocess\ndef change():\n    module.Popen=lambda command,env=None:env.get('NATIVE_KEY')\ndef forward(command,env):return subprocess.Popen(command,env=env)\nenvironment=os.environ.copy()\nchange()\nforward([],environment)\n`,
  ]) {
    assert.throws(()=>reads(code),/helper environment capability|known environment custody receiver/);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/helper environment capability|known environment custody receiver/);
  }
});

test('exact module, local alias and closure snapshot producers preserve owning namespace controls', async t => {
  const cases=[
    ['caller-shadow-control', `import os,subprocess,sys\ndef forward(command,env):return subprocess.Popen(command,env=env)\ndef caller():\n    subprocess=object()\n    environment=os.environ.copy()\n    return forward([sys.executable,'-I','-c','print("plain")'],environment).wait()\ncaller()\n`],
    ['local-import-control', `import os,sys\ndef forward(command,env):\n    import subprocess as process\n    return process.Popen(command,env=env)\nenvironment=os.environ.copy()\nforward([sys.executable,'-I','-c','print("plain")'],environment).wait()\n`],
    ['local-alias-control', `import os,subprocess,sys\ndef forward(command,env):\n    process=subprocess\n    return process.Popen(command,env=env)\nenvironment=os.environ.copy()\nforward([sys.executable,'-I','-c','print("plain")'],environment).wait()\n`],
    ['closure-module-control', `import os,sys\ndef outer():\n    import subprocess as process\n    environment=os.environ.copy()\n    def forward(command,env):return process.Popen(command,env=env)\n    return forward([sys.executable,'-I','-c','print("plain")'],environment).wait()\nouter()\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.deepEqual(names(code),[]);
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'plain\n');
    results.push({name,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  const alias=`import os\ndef selected():return os.getenv('LEXICAL_OWNER_NEW')\nalias=selected\ndef caller():\n    os=None\n    return alias()\ncaller()\nos=None\n`;
  assert.deepEqual(names(alias),['LEXICAL_OWNER_NEW']);
  const nativeCode=`import os\nos.environ['LEXICAL_OWNER_NEW']='observed'\nprinted=[]\n${alias.replace('return alias()', 'print(alias());return None')}`;
  const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
  assert.ok(native, 'this witness has no version-specific dependency');
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
  results.push({name:'ordinary-alias-owning-global',code:alias,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  t.diagnostic(JSON.stringify({results}));
});

test('opaque imported helpers cannot inherit caller subprocess authority or execute during discovery', async t => {
  const code=`import os,subprocess\nfrom synthetic_foreign import forward\nenvironment=os.environ.copy()\nprint(forward(environment))\nos=None\n`;
  assert.throws(()=>reads(code),/helper environment capability argument/);
  sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
  sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
  assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/helper environment capability argument/);
  const nativeCode=`import os,tempfile,pathlib,sys\nos.environ['NATIVE_KEY']='observed'\nwith tempfile.TemporaryDirectory(prefix='synthetic-module-') as directory:\n    pathlib.Path(directory,'synthetic_foreign.py').write_text("class Foreign:\\n    @staticmethod\\n    def Popen(env):return env.get('NATIVE_KEY')\\nsubprocess=Foreign\\ndef forward(env):return subprocess.Popen(env)\\n")\n    sys.path.insert(0,directory)\n    exec(${JSON.stringify(code)})\n`;
  const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
  assert.ok(native, 'this witness has no version-specific dependency');
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
  t.diagnostic(JSON.stringify({name:'imported-owning-module',code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr}));
});

test('fixture Secret array and item meanings distinguish object copying, projections and admission', () => {
  vm.runInContext(declaration('schemaFieldPathComponents'),sandbox);
  vm.runInContext(declaration('schemaNamedSegments'),sandbox);
  vm.runInContext(declaration('webProviderTargetRules'),sandbox);
  vm.runInContext(declaration('schemaSpecificPurpose'),sandbox);
  const authority='skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json';
  for(const field of ['$.secretReferences','$.secretReferences[]']) {
    const meaning=sandbox.schemaSpecificPurpose(authority,field,'the Kubernetes fixture');
    assert.match(meaning,/Secret object.*copy/);assert.match(meaning,/source namespace.*lease namespace/);
    assert.match(meaning,/allowedSecretReferences.*BUSTER_ALLOWED_SOURCE_SECRETS/);
    assert.match(meaning,/checked workload manifest.*projections/);
    assert.doesNotMatch(meaning,/mounted into/);
  }
  assert.equal(sandbox.schemaSpecificPurpose('other/schema.json','$.secretReferences','another owner'),null);
});

test('annotation access evaluates owning globals and defining closure bindings across caller shadows', async t => {
  const cases=[
    ['function-owner', `import os\ndef selected(value:os.getenv('NATIVE_KEY')):pass\ndef caller():\n    os=None\n    return selected.__annotations__['value']\nprint(caller())\nos=None\n`],
    ['class-owner', `import os\nclass Selected:\n    value:os.getenv('NATIVE_KEY')\ndef caller():\n    os=None\n    return Selected.__annotations__['value']\nprint(caller())\nos=None\n`],
    ['method-owner', `import os\nclass Selected:\n    def method(self,value:os.getenv('NATIVE_KEY')):pass\ndef caller():\n    os=None\n    return Selected.method.__annotations__['value']\nprint(caller())\nos=None\n`],
    ['annotation-reader-owner', `import os,annotationlib\ndef selected(value:os.getenv('NATIVE_KEY')):pass\ndef caller():\n    os=None\n    return annotationlib.get_annotations(selected)['value']\nprint(caller())\nos=None\n`],
    ['defining-closure-owner', `def outer():\n    import os as module\n    def selected(value:module.getenv('NATIVE_KEY')):pass\n    return selected.__annotations__['value']\nprint(outer())\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.deepEqual(names(code),['NATIVE_KEY']);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  const metaCode=`import os\nclass Meta(type):\n    @property\n    def __annotations__(self):return {'value':os.getenv('NATIVE_KEY')}\nclass Selected(metaclass=Meta):pass\nprint(Selected.__annotations__['value'])\nos=None\n`;
  assert.throws(()=>reads(metaCode),/unmodeled environment class construction authority/);
  const metaNative=`import os\nos.environ['NATIVE_KEY']='observed'\n${metaCode}`;
  const meta=spawnSync('python3',['-I','-c',metaNative],{encoding:'utf8'});
  assert.equal(meta.status,0,meta.stderr);assert.equal(meta.stdout,'observed\n');
  results.push({name:'custom-metaclass-reader',code:metaCode,nativeCode:metaNative,exit:meta.status,stdout:meta.stdout,stderr:meta.stderr});
  assert.throws(()=>reads(`from synthetic_base import Base\nclass Selected(Base):pass\nSelected.__annotations__\n`),/unresolved class annotation protocol/);
  t.diagnostic(JSON.stringify({results}));
});

test('metadata namespace mutation and returned reader capabilities reject rather than using stale annotation custody', async t => {
  const cases=[
    ['method-return-key-mutation', `import os\nclass Selected:\n    KEY='OPS_NAMESPACE'\n    def method(self)->os.getenv(KEY):pass\nSelected.KEY='NATIVE_KEY'\nprint(Selected.method.__annotations__['return'])\nos=None\n`, /class annotation authority mutation/],
    ['class-key-mutation', `import os\nclass Selected:\n    KEY='OPS_NAMESPACE'\n    value:os.getenv(KEY)\nalias=Selected\nalias.KEY='NATIVE_KEY'\nprint(Selected.__annotations__['value'])\nos=None\n`, /class annotation authority mutation/],
    ['annotation-reader-export', `import os,annotationlib\ndef selected(value:os.getenv):pass\ndef invoke(readers):return readers['value']('NATIVE_KEY')\nprint(invoke(annotationlib.get_annotations(selected)))\nos=None\n`, /annotation-returned environment capability/],
    ['class-reader-export', `import os\nclass Selected:\n    value:os.getenv\nprint(Selected.__annotations__['value']('NATIVE_KEY'))\nos=None\n`, /annotation-returned environment capability/],
  ];
  const results=[];
  for(const [name,code,reason] of cases){
    const eagerCached = !lazyAnnotations && name === 'class-key-mutation';
    if (eagerCached) assert.deepEqual(names(code), ['OPS_NAMESPACE']);
    else assert.throws(()=>reads(code),reason);
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    if (eagerCached) sandbox.verifyEnvironmentConsumerCoverage();
    else assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),reason);
    const nativeCode=`import os\nos.environ['NATIVE_KEY']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout, !lazyAnnotations && ['method-return-key-mutation', 'class-key-mutation'].includes(name) ? 'None\n' : 'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  assert.throws(()=>reads(`from synthetic_external import getter\ndef selected():pass\nselected.__annotate__=getter\nselected.__annotations__\n`),/callable annotation authority mutation/);
  assert.throws(()=>reads(`from synthetic_external import method\nclass Selected:\n    def method(self):pass\nSelected.method=method\nSelected.method.__annotations__\n`),/class annotation authority mutation/);
  t.diagnostic(JSON.stringify({results}));
});

test('recognizable reflected modules, readers and annotation identities reject without losing actual reads', async t => {
  const cases = [
    ['module-dictionary', `import os\nos.__dict__['getenv']('REFLECTED_NATIVE')\n`],
    ['module-bound-accessor', `import os\nos.__getattribute__('getenv')('REFLECTED_NATIVE')\n`],
    ['module-alias-dictionary', `import os as module\nalias=module\nnamespace=alias.__dict__\nnamespace['getenv']('REFLECTED_NATIVE')\n`],
    ['module-accessor-alias', `import os\naccessor=os.__getattribute__\naccessor('getenv')('REFLECTED_NATIVE')\n`],
    ['environment-bound-accessor', `import os\nreader=os.environ.__getattribute__('get')\nprint(reader('REFLECTED_NATIVE'))\n`],
    ['reader-bound-accessor', `from os import getenv\nreader=getenv.__getattribute__('__call__')\nprint(reader('REFLECTED_NATIVE'))\n`],
    ['function-annotation', `import os\ndef selected(value:os.getenv('REFLECTED_NATIVE')):pass\nselected.__getattribute__('__annotations__')\nos=None\n`],
    ['method-annotation', `import os\nclass Selected:\n    def method(value:os.getenv('REFLECTED_NATIVE')):pass\nSelected.method.__getattribute__('__annotations__')\nos=None\n`],
    ['function-accessor-alias', `import os\ndef selected(value:os.getenv('REFLECTED_NATIVE')):pass\nalias=selected\naccessor=alias.__getattribute__\naccessor('__annotations__')\nos=None\n`],
    ['method-accessor-alias', `import os\nclass Selected:\n    def method(value:os.getenv('REFLECTED_NATIVE')):pass\nalias=Selected.method\naccessor=alias.__getattribute__\naccessor('__annotations__')\nos=None\n`],
    ['active-closure-annotation', `def outer():\n    import os as module\n    def selected(value:module.getenv('REFLECTED_NATIVE')):pass\n    return selected.__getattribute__('__annotations__')\nouter()\n`],
  ];
  const results=[];
  for (const [name,code] of cases) {
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      /ops\/pod\/bootstrap\.py/.test(error.message) && /reflected environment capability/.test(error.message));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/reflected environment capability/);
    const nativeCode=`import os\nos.environ['REFLECTED_NATIVE']='observed'\nactual_getenv=os.getenv\nrequested=[]\ndef audited_getenv(key,*args):\n    requested.append(key)\n    return actual_getenv(key,*args)\nos.getenv=audited_getenv\n${code}\nprint(requested)\n`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);
    if(name==='environment-bound-accessor') assert.equal(native.stdout,"observed\n[]\n");
    else assert.match(native.stdout,/\['REFLECTED_NATIVE'\]/);
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('reflection guards retain ordinary dictionaries, pure callbacks, passive strings and direct annotations', () => {
  assert.deepEqual(names(`class Ordinary:\n    value='plain'\nordinary=Ordinary()\nordinary.__dict__\nordinary.__getattribute__('value')\ndef callback(value:int):return value\ncallback.__dict__\ncallback.__getattribute__('__annotations__')\nclass Pure:\n    def method(value:int):return value\nPure.method.__getattribute__('__annotations__')\npassive="os.__dict__['getenv']('PASSIVE_FAKE')"\n`),[]);
  assert.deepEqual(names(`import os\ndef selected(value:os.getenv('DIRECT_REFLECTION_CONTROL')):pass\nselected.__annotations__\nos=None\n`),['DIRECT_REFLECTION_CONTROL']);
  for(const code of [
    `import os\nreader=os.getenv\nreader.__dict__\n`,
    `import os\ndef selected(value:os.getenv('REFLECTED_NATIVE')):pass\nselected.__dict__\nos=None\n`,
    `import os\nclass Selected:\n    def method(value:os.getenv('REFLECTED_NATIVE')):pass\nSelected.method.__dict__\nos=None\n`,
    `import os\nalias=os if condition else object()\nalias.__getattribute__('getenv')\n`,
  ]) assert.throws(()=>reads(code),/reflected environment capability/);
});

test('reader, mapping and annotation-getter protocols retain or reject complete capability custody', async t => {
  const key='CUSTODY_PROTOCOL_NEW';
  const cases=[
    ['reader-call',`import os\nos.getenv.__call__('${key}')\n`,key],
    ['mapping-item',`import os\nos.environ.__getitem__('${key}')\n`,key],
    ['mapping-setdefault',`import os\nos.environ.setdefault('${key}','fallback')\n`,key],
    ['reader-globals-mapping',`import os\nos.getenv.__globals__['environ'].get('${key}')\n`,/reflected environment capability/],
    ['reader-globals-reader',`import os\nos.getenv.__globals__['getenv']('${key}')\n`,/reflected environment capability/],
    ['reader-alias-call',`from os import getenv as reader\nalias=reader.__call__\nalias('${key}')\n`,key],
    ['mapping-alias-item',`from os import environ\nalias=environ.__getitem__\nalias('${key}')\n`,key],
    ['function-call',`import os\ndef selected():return os.getenv('${key}')\nselected.__call__()\nos=None\n`,key],
    ['method-call',`import os\nclass Selected:\n    def method(self):return os.getenv('${key}')\nSelected.method.__call__(None)\nos=None\n`,key],
    ['annotation-function-call',`import os,annotationlib\ndef selected(value:"os.getenv('${key}')"):pass\nannotationlib.get_annotations.__call__(selected,eval_str=True)\n`,/evaluated string annotation/],
    ['annotation-class-call',`import os,annotationlib\nclass Selected:\n    value:"os.getenv('${key}')"\nannotationlib.get_annotations.__call__(Selected,eval_str=True)\n`,lazyAnnotations ? /evaluated string annotation/ : null],
    ['annotation-method-call',`import os,annotationlib\nclass Selected:\n    def method(value:"os.getenv('${key}')"):pass\nannotationlib.get_annotations.__call__(Selected.method,eval_str=True)\n`,/evaluated string annotation/],
    ['annotation-reflected-call',`import os,annotationlib\ndef selected(value:"os.getenv('${key}')"):pass\nannotationlib.get_annotations.__getattribute__('__call__')(selected,eval_str=True)\n`,/reflected environment capability/],
    ['annotation-passed-getter',`import os,annotationlib\ndef selected(value:"os.getenv('${key}')"):pass\ndef use(reader,obj):return reader(obj,eval_str=True)\nuse(annotationlib.get_annotations,selected)\n`,/helper environment capability argument/],
    ['annotation-returned-getter',`import os,annotationlib\ndef selected(value:"os.getenv('${key}')"):pass\ndef acquire():return annotationlib.get_annotations\nacquire()(selected,eval_str=True)\n`,/helper-returned environment capability/],
    ['annotation-container-getter',`import os,annotationlib\ndef selected(value:"os.getenv('${key}')"):pass\nreaders=[annotationlib.get_annotations]\ndef use(readers,obj):return readers[0](obj,eval_str=True)\nuse(readers,selected)\n`,/helper environment capability argument/],
    ['annotation-alias-call',`import os,annotationlib\ndef selected(value:"os.getenv('${key}')"):pass\nreader=annotationlib.get_annotations\ncall=reader.__call__\ncall(selected,eval_str=True)\n`,/evaluated string annotation/],
    ['future-function-getter',`from __future__ import annotations\nimport os,annotationlib\ndef selected(value:os.getenv('${key}')):pass\nannotationlib.get_annotations.__call__(selected,eval_str=True)\n`,key],
    ['future-class-getter',`from __future__ import annotations\nimport os,annotationlib\nclass Selected:\n    value:os.getenv('${key}')\nannotationlib.get_annotations.__call__(Selected,eval_str=True)\n`,/evaluated future class annotation/],
  ];
  const results=[];
  for(const [name,code,expected] of cases){
    if(expected === null) assert.deepEqual(names(code), []);
    else if(typeof expected==='string') assert.deepEqual(names(code),[key]);
    else assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      expected.test(error.message) && /ops\/pod\/bootstrap\.py/.test(error.message));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    if (expected === null) sandbox.verifyEnvironmentConsumerCoverage();
    else assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),typeof expected==='string'?/CONFIG_SEMANTIC_GAP:.*CUSTODY_PROTOCOL_NEW:ops\/pod\/bootstrap\.py/:expected);
    const nativeCode=`${code.startsWith('from __future__')?'from __future__ import annotations\n':''}import os,json\nos.environ['${key}']='synthetic-value'\noriginal_item=type(os.environ).__getitem__\nrequested=[]\ndef audited_item(self,key):\n    if key=='${key}':requested.append(key)\n    return original_item(self,key)\ntype(os.environ).__getitem__=audited_item\n${code.replace('from __future__ import annotations\n','')}\nprint(json.dumps(requested))\n`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.ok(JSON.parse(native.stdout).includes(key),name);
    results.push({name,code,expected:expected === null ? 'eager class metadata remains passive' : typeof expected==='string'?expected:expected.source,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('capability protocol rules preserve foreign objects, passive strings, safe metadata and direct getters', () => {
  assert.deepEqual(names(`class Foreign:\n    def __call__(self,key):return key\n    def __getitem__(self,key):return key\n    def setdefault(self,key,value):return value\nforeign=Foreign()\nforeign.__call__('PASSIVE_PROTOCOL')\nforeign.__getitem__('PASSIVE_PROTOCOL')\nforeign.setdefault('PASSIVE_PROTOCOL','plain')\nimport os,annotationlib\nos.getenv.__name__\nannotationlib.get_annotations.__doc__\ndef selected(value:"os.getenv('PASSIVE_STRING')"):pass\nannotationlib.get_annotations.__call__(selected)\n`),[]);
  assert.deepEqual(names(`import os,annotationlib\ndef selected(value:os.getenv('DIRECT_GETTER_NEW')):pass\nannotationlib.get_annotations.__call__(selected)\nos=None\n`),['DIRECT_GETTER_NEW']);
  for(const code of [
    `import os\nos.environ.items()\n`,
    `import os\nos.environ.pop('UNKNOWN_MAPPING_KEY')\n`,
    `import os,annotationlib\nreader=annotationlib.get_annotations\ndef use(reader):return reader\nuse(reader)\n`,
    `import annotationlib\nreader=annotationlib.get_annotations.__globals__\n`,
  ]) assert.throws(()=>reads(code),/environment mapping protocol|environment capability argument|reflected environment capability/);
});

test('executable YAML applies finite env wrappers to the selected shell and preserves argv source positions', async t => {
  const key='CUSTODY_WRAPPER_NEW';
  const program=`python3 -I -c 'import os;print(os.getenv("${key}"))'`;
  const cases=[
    ['direct-shell',['sh','-c',program]],
    ['env-shell',['env','sh','-c',program]],
    ['clean-env-shell',['env','-i',`${key}=synthetic-value`,'sh','-c',program]],
    ['env-options-shell',['env','-u','UNRELATED_KEY','--','sh','-ec',program]],
  ];
  const results=[];
  for(const [name,argv] of cases){
    const code=`readinessProbe:\n  exec:\n    command: ${JSON.stringify(argv)}\n`;
    const facts=Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',code));
    assert.deepEqual(facts.map(item=>item.name),[key]);assert.match(code.slice(facts[0].index),/^os\.getenv/);
    sandbox.runtimeTextSources=()=>['fixture.yaml'];sandbox.read=()=>code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/CONFIG_SEMANTIC_GAP:.*CUSTODY_WRAPPER_NEW:fixture.yaml/);
    const native=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',env:{...process.env,[key]:'synthetic-value'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'synthetic-value\n');
    results.push({name,argv,code,exit:native.status,stdout:native.stdout,stderr:native.stderr,facts});
  }
  for(const argv of [
    ['env','sh','script.sh','-c',program],
    ['env','sh','-c',`python3 -m synthetic_module -c 'import os;os.getenv("PASSIVE_WRAPPER_ARGV")'`],
    ['env','sh','-c',`python3 synthetic_script.py -c 'import os;os.getenv("PASSIVE_WRAPPER_ARGV")'`],
  ]) assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',`command: ${JSON.stringify(argv)}\n`)),[]);
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',`description:\n  command: ${JSON.stringify(['env','sh','-c',program])}\n`)),[]);
  assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('fixture.yaml',`command: ${JSON.stringify(['env','sh','-o','opaque','-c',program])}\n`),/fixture.yaml.*unresolved shell argv mode/);
  t.diagnostic(JSON.stringify({results}));
});

test('recognized reader protocols fail closed when key custody is hidden in kwargs expansion', async t => {
  const cases=[
    ['protocol-kwargs',`import os\nprint(os.getenv.__call__(**{'key':'PROTOCOL_KWARGS_NEW'}))\n`],
    ['mapping-kwargs',`import os\nprint(os.environ.setdefault(**{'key':'PROTOCOL_KWARGS_NEW','value':'fallback'}))\n`],
    ['direct-reader-kwargs',`from os import getenv as reader\narguments={'key':'PROTOCOL_KWARGS_NEW'}\nprint(reader(**arguments))\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      /unresolved environment reader arguments/.test(error.message) && /ops\/pod\/bootstrap\.py/.test(error.message));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/unresolved environment reader arguments/);
    const nativeCode=`import os\nos.environ['PROTOCOL_KWARGS_NEW']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  assert.deepEqual(names(`class Foreign:\n    def __call__(self,**arguments):return arguments['key']\nForeign().__call__(**{'key':'PASSIVE_KWARGS'})\n`),[]);
  assert.deepEqual(names(`import os\nos.getenv.__call__(key='EXPLICIT_KEYWORD_NEW')\n`),['EXPLICIT_KEYWORD_NEW']);
  t.diagnostic(JSON.stringify({results}));
});

test('finite absolute wrappers and nested literal shell bodies retain executable Python and decoded offsets', async t => {
  const key='BINDING_WRAPPER_NEW';
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const python=`python3 -I -c ${quote(`import os;print(os.getenv("${key}"))`)}`;
  const cases=[
    ['absolute-env-shell',['/usr/bin/env','sh','-c',python]],
    ['nested-shell',['env','sh','-c',`sh -c ${quote(python)}`]],
    ['nested-env-shell',['env','sh','-c',`env sh -c ${quote(python)}`]],
    ['direct-env-shell',['env','sh','-c',python]],
  ];
  const results=[];
  for(const [name,argv] of cases){
    const code=`readinessProbe:\n  exec:\n    command: ${JSON.stringify(argv)}\n`;
    const facts=Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',code));
    assert.deepEqual(facts.map(item=>item.name),[key]);assert.match(code.slice(facts[0].index),/^os\.getenv/);
    sandbox.runtimeTextSources=()=>['fixture.yaml'];sandbox.read=()=>code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/CONFIG_SEMANTIC_GAP:.*BINDING_WRAPPER_NEW:fixture.yaml/);
    const native=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',env:{...process.env,[key]:'observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,argv,code,facts,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const wrapper of ['/bin/env','/usr/bin/sudo','/bin/sudo']){
    const code=`command: ${JSON.stringify([wrapper,'sh','-c',python])}\n`;
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',code),fact=>fact.name),[key]);
  }
  const inherited=`sh -c 'python3' <<'PY'\nimport os;print(os.getenv('${key}'))\nPY\n`;
  assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('fixture.sh',inherited),/fixture.sh.*unresolved nested shell stdin custody/);
  const native=spawnSync('sh',['-c',inherited],{encoding:'utf8',env:{...process.env,[key]:'observed'}});
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
  results.push({name:'nested-inherited-stdin-rejected',code:inherited,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  for(const text of [
    `sh -c ${quote(`printf '%s' 'python3 -c os.getenv("PASSIVE_RECIPE")'`)}`,
    `sh -c ${quote(`sh script.sh -c ${quote(python)}`)}`,
    `sh -c ${quote(`env sh -c ${quote(`python3 -m synthetic_module -c 'import os;os.getenv("PASSIVE_MODULE")'`)}`)}`,
    `sh -c ${quote(`python3 synthetic_script.py -c 'import os;os.getenv("PASSIVE_SCRIPT")'`)}`,
  ]) assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',text)),[]);
  t.diagnostic(JSON.stringify({results}));
});

test('named expressions reject global and nonlocal writes of known readers, mappings and annotation getters', async t => {
  const key='BINDING_WALRUS_NEW';
  const getterSetup=`import os,annotationlib\ngetter=None\ndef setup():\n    global getter\n    (getter:=annotationlib.get_annotations)\nsetup()\n`;
  const cases=[
    ['global-function-getter',`${getterSetup}def selected(value:"print(os.getenv('${key}'))"):pass\ngetter(selected,eval_str=True)\n`],
    ['global-class-getter',`${getterSetup}class Selected:\n    value:"print(os.getenv('${key}'))"\ngetter(Selected,eval_str=True)\n`],
    ['global-method-getter',`${getterSetup}class Selected:\n    def method(value:"print(os.getenv('${key}'))"):pass\ngetter(Selected.method,eval_str=True)\n`],
    ['global-reader',`import os\ngetter=None\ndef setup():\n    global getter\n    (getter:=os.getenv)\nsetup()\nprint(getter('${key}'))\n`],
    ['global-mapping',`import os\ngetter=None\ndef setup():\n    global getter\n    (getter:=os.environ)\nsetup()\nprint(getter.get('${key}'))\n`],
    ['nonlocal-active-getter',`import os,annotationlib\ndef outer():\n    getter=None\n    def setup():\n        nonlocal getter\n        (getter:=annotationlib.get_annotations)\n    setup()\n    def selected(value:"print(os.getenv('${key}'))"):pass\n    getter(selected,eval_str=True)\nouter()\n`],
    ['ordinary-assignment-sensitivity',`${getterSetup.replace('(getter:=annotationlib.get_annotations)','getter=annotationlib.get_annotations')}def selected(value:"print(os.getenv('${key}'))"):pass\ngetter(selected,eval_str=True)\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      /global or nonlocal environment authority write/.test(error.message) && /ops\/pod\/bootstrap\.py/.test(error.message));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/global or nonlocal environment authority write/);
    const nativeCode=`import os\nos.environ['${key}']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  assert.deepEqual(names(`import os\n(getter:=os.getenv)('LOCAL_NAMED_READER')\n`),['LOCAL_NAMED_READER']);
  assert.deepEqual(names(`value=None\ndef setup():\n    global value\n    (value:='plain')\nsetup()\n`),[]);
  assert.deepEqual(names(`def outer():\n    value=None\n    def setup():\n        nonlocal value\n        (value:='plain')\n    setup()\nouter()\n`),[]);
  t.diagnostic(JSON.stringify({results}));
});

test('nested shell stdin custody survives dollar and backtick substitutions with rendered source diagnostics', async t => {
  const key='COMPREHENSION_CUSTODY_NEW';
  const results=[];
  for(const inner of ['python3','echo $(python3)','echo `python3`','echo $(echo $(python3))']) {
    const shell=`sh -c '${inner}' <<'PY'\nimport os;print(os.getenv('${key}'))\nPY\n`;
    const file='charts/ops-pod/templates/workload.yaml';
    const code=`readinessProbe:\n  exec:\n    command: ${JSON.stringify(['sh','-c',shell])}\n`;
    assert.throws(()=>sandbox.acquiredPythonEnvironmentReads(file,code),error=>
      error.stack.includes(file) && /unresolved nested shell stdin custody/.test(error.stack));
    const native=spawnSync('sh',['-c',shell],{encoding:'utf8',env:{...process.env,[key]:'observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({inner,shell,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const shell of ["python3 -c", "python3 -c \"$UNKNOWN_BODY\"", "python3 <<'PY'\nunterminated\n"]) {
    assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell),error=>
      error.stack.includes('fixture.sh') && /PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED/.test(error.stack));
  }
  for(const shell of ["printf '%s' '$(python3)'", "printf '%s' '`python3`'", "echo $(python3 script.py)", "echo `python3 -m passive_module`"])
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell)),[]);
  for(const shell of [`echo $(python3 -c 'import os;os.getenv("${key}")')`, `echo \`python3 -c 'import os;os.getenv("${key}")'\``]) {
    const facts=Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell));
    assert.deepEqual(facts.map(f=>f.name),[key]);assert.match(shell.slice(facts[0].index),/^os\.getenv/);
  }
  t.diagnostic(JSON.stringify({results}));
});

test('comprehension walrus capabilities reject before containing reader or annotation getter custody is lost', async t => {
  const key='COMPREHENSION_CUSTODY_NEW';
  const getter=`import os,annotationlib\ngetter=None\n[(getter:=annotationlib.get_annotations) for _ in [1]]\n`;
  const cases=[
    ['list-reader',`import os\nlookup=None\n[(lookup:=os.getenv) for _ in [1]]\nprint(lookup('${key}'))\n`],
    ['set-reader',`import os\nlookup=None\n{(lookup:=os.getenv) for _ in [1]}\nprint(lookup('${key}'))\n`],
    ['dict-reader',`import os\nlookup=None\n{_: (lookup:=os.getenv) for _ in [1]}\nprint(lookup('${key}'))\n`],
    ['generator-reader',`import os\nlookup=None\nitems=((lookup:=os.getenv) for _ in [1])\nnext(items)\nprint(lookup('${key}'))\n`],
    ['function-getter',`${getter}def f(value:"print(os.getenv('${key}'))"):pass\ngetter(f,eval_str=True)\n`],
    ['class-getter',`${getter}class C:\n    value:"print(os.getenv('${key}'))"\ngetter(C,eval_str=True)\n`],
    ['method-getter',`${getter}class C:\n    def f(value:"print(os.getenv('${key}'))"):pass\ngetter(C.f,eval_str=True)\n`],
    ['filter-reader',`import os\nlookup=None\n[_ for _ in [1] if (lookup:=os.getenv)]\nprint(lookup('${key}'))\n`],
    ['nested-reader',`import os\nlookup=None\n[[(lookup:=os.getenv) for _ in [1]] for outer in [1]]\nprint(lookup('${key}'))\n`],
  ];
  const results=[];
  for(const [name,code] of cases) {
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      /comprehension containing-scope environment authority write/.test(error.message) && /ops\/pod\/bootstrap\.py/.test(error.message));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/comprehension containing-scope environment authority write/);
    const nativeCode=`import os\nos.environ['${key}']='observed'\n${code}`;
    const native=await nativePython(t,['-I','-c',nativeCode],{encoding:'utf8'});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({name,code,nativeCode,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  assert.deepEqual(names(`import os\n[0 for _ in os.getenv('FIRST_ITERABLE_NEW')]\n`),['FIRST_ITERABLE_NEW']);
  assert.throws(()=>names(`import os\n[(lambda: (lookup:=os.getenv)('LAMBDA_LOCAL_NEW'))() for _ in [1]]\n`),/unresolved environment callable authority/);
  assert.deepEqual(names(`value=None\n[(value:='plain') for _ in [1]]\n{(value:='plain') for _ in [1]}\n{_: (value:='plain') for _ in [1]}\nlist((value:='plain') for _ in [1])\nclass Foreign:\n    def get(self,key):return key\n[(lookup:=Foreign().get) for _ in [1]]\nlookup('FOREIGN_PASSIVE')\nrecipe="[(lookup:=os.getenv) for _ in [1]]"\n`),[]);
  assert.deepEqual(names(`import os\n(lookup:=os.getenv)('DIRECT_NAMED_NEW')\n`),['DIRECT_NAMED_NEW']);
  t.diagnostic(JSON.stringify({results}));
});

test('literal substitution nesting enforces the shared finite shell depth with native and source sensitivity', async t => {
  const program=`python3 -I -c 'import os;print(os.getenv("BOUNDED_DEPTH_NEW"))'`;
  const nest=(body,count)=>{for(let i=0;i<count;i++)body=`echo $(${body})`;return body;};
  const results=[];
  for(const count of [0,2,15,16,20]) {
    const shell=nest(program,count);
    if(count<16) {
      const facts=Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell));
      assert.deepEqual(facts.map(f=>f.name),['BOUNDED_DEPTH_NEW']);assert.match(shell.slice(facts[0].index),/^os\.getenv/);
    } else assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell),error=>
      error.stack.includes('fixture.sh') && /literal shell nesting limit/.test(error.stack));
    const native=spawnSync('sh',['-c',shell],{encoding:'utf8',env:{...process.env,BOUNDED_DEPTH_NEW:'observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    results.push({count,shell,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  const backtick=`echo \`${program}\``;
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',backtick),f=>f.name),['BOUNDED_DEPTH_NEW']);
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',`printf '%s' '${nest('python3',20)}'`)),[]);
  t.diagnostic(JSON.stringify({results}));
});

test('comprehension walrus writes to recognized environment keys reject stale enclosing key claims', async t => {
  const expressions=["[(key:='CURRENT_KEY_NEW') for _ in [1]]", "{(key:='CURRENT_KEY_NEW') for _ in [1]}", "{_: (key:='CURRENT_KEY_NEW') for _ in [1]}", "items=((key:='CURRENT_KEY_NEW') for _ in [1])\nnext(items)"];
  const results=[];
  for(const [index,expression] of expressions.entries()) {
    const code=`import os\nkey='KUBE_CONTEXT'\n${expression}\nprint(os.getenv(key))\n`;
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      /comprehension containing-scope environment authority write/.test(error.message) && error.message.includes('ops/pod/bootstrap.py'));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];
    sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/comprehension containing-scope environment authority write/);
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8',env:{...process.env,KUBE_CONTEXT:'prior-value',CURRENT_KEY_NEW:'current-observed'}});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'current-observed\n');
    results.push({index,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const reader of ["from os import getenv as lookup\n", "import os\nlookup=os.getenv\n", "import os\nlookup=os.environ.get\n"]) {
    assert.throws(()=>names(`${reader}key='PRIOR_KEY'\n[(key:='CURRENT_KEY_NEW') for _ in [1]]\nlookup(key)\n`),/comprehension containing-scope environment authority write/);
  }
  assert.throws(()=>names(`import os\nkey='PRIOR_KEY'\n[(key:='CURRENT_KEY_NEW') for _ in [1]]\nos.environ[key]\n`),/comprehension containing-scope environment authority write/);
  assert.deepEqual(names(`import os\nkey='PRIOR_KEY'\n(key:='CURRENT_KEY_NEW')\nos.getenv(key)\n`),['CURRENT_KEY_NEW']);
  assert.deepEqual(names(`unused='PRIOR_KEY'\n[(unused:='CURRENT_KEY_NEW') for _ in [1]]\nclass Foreign:\n    def getenv(self,key):return key\nforeign=Foreign()\nkey='FOREIGN_PRIOR'\n[(key:='FOREIGN_CURRENT') for _ in [1]]\nforeign.getenv(key)\n`),[]);
  assert.throws(()=>names(`import os\nkey='PRIOR_KEY'\ndef change():\n    global key\n    key='CURRENT_KEY_NEW'\nchange()\nos.getenv(key)\n`),/global or nonlocal environment authority write/);
  t.diagnostic(JSON.stringify({results}));
});

test('containing comprehension writes invalidate supported dependent key aliases and reader slots', async t => {
  const setup=`import os,annotationlib\nkey='KUBE_CONTEXT'\n[(key:='DEPENDENT_KEY_NEW') for _ in [1]]\n`;
  const cases=[
    ['alias-after-write',`${setup}chosen=key\nprint(os.getenv(chosen))\n`],
    ['conditional-key',`${setup}print(os.getenv(key if True else 'KUBE_CONTEXT'))\n`],
    ['mapping-conditional',`${setup}print(os.environ[key if True else 'KUBE_CONTEXT'])\n`],
    ['getitem-key',`${setup}print(os.environ.__getitem__(key))\n`],
    ['keyword-key',`${setup}print(os.getenv(key=key))\n`],
    ['function-conditional-key',`${setup}def f(value:os.getenv(key if True else 'KUBE_CONTEXT')):pass\nprint(annotationlib.get_annotations(f)['value'])\n`],
    ['class-conditional-key',`${setup}class C:\n    value:os.getenv(key if True else 'KUBE_CONTEXT')\nprint(annotationlib.get_annotations(C)['value'])\n`],
    ['method-conditional-key',`${setup}class C:\n    def f(value:os.getenv(key if True else 'KUBE_CONTEXT')):pass\nprint(annotationlib.get_annotations(C.f)['value'])\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      error.message.includes('ops/pod/bootstrap.py') && /unresolved environment key|comprehension containing-scope environment authority write/.test(error.message));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/unresolved environment key|comprehension containing-scope environment authority write/);
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8',env:{...process.env,KUBE_CONTEXT:'prior-value',DEPENDENT_KEY_NEW:'dependent-observed'}});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'dependent-observed\n');
    results.push({name,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const expression of ["{(key:='DEPENDENT_KEY_NEW') for _ in [1]}","{_: (key:='DEPENDENT_KEY_NEW') for _ in [1]}","items=((key:='DEPENDENT_KEY_NEW') for _ in [1])\nnext(items)","[[(key:='DEPENDENT_KEY_NEW') for _ in [1]] for outer in [1]]"])
    assert.throws(()=>names(`import os\nkey='KUBE_CONTEXT'\n${expression}\nchosen=key\nos.getenv(chosen)\n`),/unresolved environment key|comprehension containing-scope environment authority write/);
  assert.deepEqual(names(`import os\nkey='KUBE_CONTEXT'\nkey='DEPENDENT_KEY_NEW'\nchosen=key\nos.getenv(chosen)\n`),['DEPENDENT_KEY_NEW']);
  assert.deepEqual(names(`import os\nkey='KUBE_CONTEXT'\n[(key:='unused') for _ in [1]]\nkey='DEPENDENT_KEY_NEW'\nchosen=key\nos.getenv(chosen)\n`),['DEPENDENT_KEY_NEW']);
  assert.deepEqual(names(`class Foreign:\n    def getenv(self,key):return key\nforeign=Foreign()\nkey='OLD'\n[(key:='NEW') for _ in [1]]\nforeign.getenv(key if True else 'OLD')\nchosen=key\nforeign.getenv(key=chosen)\nunused=None\n[(unused:='plain') for _ in [1]]\n`),[]);
  t.diagnostic(JSON.stringify({results}));
});

test('YAML shell forwarding preserves passive and active finite file-stdin custody without decoded positions', async t => {
  const privateRoot=fs.mkdtempSync('/tmp/python-yaml-file-custody-');
  const savedRoot=sandbox.root;
  const passive=path.join(privateRoot,'passive.py'),active=path.join(privateRoot,'active.py');
  fs.writeFileSync(passive,'pass\n');fs.writeFileSync(active,"import os;print(os.getenv('FILE_STDIN_NEW'))\n");
  sandbox.root=privateRoot;
  try {
    const shell=`python3 < '${passive}'`;
    const code=`readinessProbe:\n  exec:\n    command: ${JSON.stringify(['sh','-c',shell])}\n`;
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',code)),[]);
    assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell)),[]);
    const native=spawnSync('sh',['-c',shell],{encoding:'utf8'});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'');
    for(const file of ['fixture.sh','fixture.yaml']) {
      const activeShell=`python3 < '${active}'`;
      const text=file.endsWith('.yaml')?`command: ${JSON.stringify(['sh','-c',activeShell])}\n`:activeShell;
      assert.throws(()=>sandbox.acquiredPythonEnvironmentReads(file,text),error=>
        error.stack.includes(file) && error.stack.includes(active) && /external stdin readers require exact receiving-source qualification.*FILE_STDIN_NEW/.test(error.stack));
    }
    const mixed=`${shell}; python3 -c 'import os;os.getenv("INLINE_FILE_ADJACENT")'`;
    const mixedYaml=`command: ${JSON.stringify(['sh','-c',mixed])}\n`;
    const facts=Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',mixedYaml));
    assert.deepEqual(facts.map(f=>f.name),['INLINE_FILE_ADJACENT']);assert.match(mixedYaml.slice(facts[0].index),/^os\.getenv/);
    const heredoc=`python3 <<'PY'\nimport os;os.getenv('HEREDOC_FILE_ADJACENT')\nPY\n`;
    const heredocYaml=`command: ${JSON.stringify(['sh','-c',heredoc])}\n`;
    const heredocFacts=Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',heredocYaml));
    assert.deepEqual(heredocFacts.map(f=>f.name),['HEREDOC_FILE_ADJACENT']);assert.match(heredocYaml.slice(heredocFacts[0].index),/^os\.getenv/);
    assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('fixture.yaml',`command: ${JSON.stringify(['sh','-c',"python3 < 'relative.py'"])}\n`),/fixture.yaml.*unresolved working directory/);
    const activeNative=spawnSync('sh',['-c',`python3 < '${active}'`],{encoding:'utf8',env:{...process.env,FILE_STDIN_NEW:'file-observed'}});
    assert.equal(activeNative.status,0,activeNative.stderr);assert.equal(activeNative.stdout,'file-observed\n');
    t.diagnostic(JSON.stringify({results:[{name:'yaml-passive-file-stdin',shell,code,exit:native.status,stdout:native.stdout,stderr:native.stderr},
      {name:'yaml-active-file-stdin',shell:`python3 < '${active}'`,exit:activeNative.status,stdout:activeNative.stdout,stderr:activeNative.stderr}]}));
  } finally {sandbox.root=savedRoot;fs.rmSync(privateRoot,{recursive:true,force:true});}
});

test('global and nonlocal finite-key dependency writes reject before helper state restoration', async t => {
  const setup=`import os,annotationlib\nkey='KUBE_CONTEXT'\ndef change():\n    global key\n    [(key:='GLOBAL_KEY_NEW') for _ in [1]]\nchange()\n`;
  const cases=[
    ['global-comprehension-dependent-key',`${setup}chosen=key\nprint(os.getenv(chosen))\n`],
    ['global-direct-dependent-key',`${setup.replace("[(key:='GLOBAL_KEY_NEW') for _ in [1]]","key='GLOBAL_KEY_NEW'")}chosen=key\nprint(os.getenv(chosen))\n`],
    ['nonlocal-dependent-key',`import os\ndef outer():\n    key='KUBE_CONTEXT'\n    def change():\n        nonlocal key\n        [(key:='GLOBAL_KEY_NEW') for _ in [1]]\n    change()\n    chosen=key\n    print(os.getenv(chosen))\nouter()\n`],
    ['global-function-annotation',`${setup}def f(value:os.getenv(key if True else 'KUBE_CONTEXT')):pass\nprint(annotationlib.get_annotations(f)['value'])\n`],
    ['global-class-annotation',`${setup}class C:\n    value:os.getenv(key if True else 'KUBE_CONTEXT')\nprint(annotationlib.get_annotations(C)['value'])\n`],
    ['global-method-annotation',`${setup}class C:\n    def f(value:os.getenv(key if True else 'KUBE_CONTEXT')):pass\nprint(annotationlib.get_annotations(C.f)['value'])\n`],
  ];
  const results=[];
  for(const [name,code] of cases){
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,'ops/pod/bootstrap.py'),error=>
      /global or nonlocal environment authority write/.test(error.message) && error.message.includes('ops/pod/bootstrap.py'));
    sandbox.runtimeTextSources=()=>['ops/pod/bootstrap.py'];sandbox.read=()=>fs.readFileSync(path.join(root,'ops/pod/bootstrap.py'),'utf8')+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/global or nonlocal environment authority write/);
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8',env:{...process.env,KUBE_CONTEXT:'prior-value',GLOBAL_KEY_NEW:'new-observed'}});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'new-observed\n');
    results.push({name,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const read of ["os.getenv(key=chosen)","os.environ[chosen if True else 'KUBE_CONTEXT']","os.environ.__getitem__(chosen)","os.getenv.__call__(chosen)"])
    assert.throws(()=>names(`${setup}chosen=key\n${read}\n`),/global or nonlocal environment authority write/);
  assert.deepEqual(names(`import os\nkey='KUBE_CONTEXT'\nkey='GLOBAL_KEY_NEW'\nchosen=key\nos.getenv(chosen)\n`),['GLOBAL_KEY_NEW']);
  assert.deepEqual(names(`import os\nkey='KUBE_CONTEXT'\n[(key:='unused') for _ in [1]]\nkey='GLOBAL_KEY_NEW'\nchosen=key\nos.getenv(chosen)\n`),['GLOBAL_KEY_NEW']);
  const foreign=`class Foreign:\n    def getenv(self,key):return key\nf=Foreign()\nkey='OLD'\ndef change():\n    global key\n    [(key:='NEW') for _ in [1]]\nchange()\nprint(f.getenv(key))\n`;
  assert.deepEqual(names(foreign),[]);
  assert.deepEqual(names(`unused='old'\ndef change():\n    global unused\n    unused='plain'\nchange()\n`),[]);
  assert.deepEqual(names(`def outer():\n    unused='old'\n    def change():\n        nonlocal unused\n        unused='plain'\n    change()\nouter()\n`),[]);
  const direct=`import os\nkey='KUBE_CONTEXT'\nkey='GLOBAL_KEY_NEW'\nchosen=key\nprint(os.getenv(chosen))\n`;
  for(const [name,code,expected] of [['module-direct-alias-sensitivity',direct,'new-observed\n'],['global-foreign-passive',foreign,'NEW\n']]){
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8',env:{...process.env,GLOBAL_KEY_NEW:'new-observed'}});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,expected);results.push({name,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('top-level shell and YAML handoffs reject recognized unresolved Python stdin while passive pipes stay passive', async t => {
  const active=`printf '%s\\n' 'import os; print(os.getenv("PIPE_KEY_NEW"))' | python3 -`;
  const passive=active.replace('python3 -','python3 -c "pass"');
  const results=[];
  for(const [name,file,shell,expected] of [
    ['pipe-shell-active','ops/pod/shell.sh',active,'pipe-observed\n'],
    ['pipe-yaml-active','charts/ops-pod/templates/workload.yaml',active,'pipe-observed\n'],
    ['pipe-shell-passive','ops/pod/shell.sh',passive,''],
    ['pipe-yaml-passive','charts/ops-pod/templates/workload.yaml',passive,''],
  ]){
    const code=file.endsWith('.yaml')?`command: ${JSON.stringify(['sh','-c',shell])}\n`:shell;
    if(name.endsWith('active'))assert.throws(()=>sandbox.acquiredPythonEnvironmentReads(file,code),error=>
      error.stack.includes(file) && /unresolved Python stdin source custody/.test(error.stack));
    else assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads(file,code)),[]);
    const native=spawnSync('sh',['-c',shell],{encoding:'utf8',env:{...process.env,PIPE_KEY_NEW:'pipe-observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,expected);
    results.push({name,file,code,shell,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const argv of [['python3'],['python3','-'],['sh','-c','python3 -']])assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('fixture.yaml',`command: ${JSON.stringify(argv)}\n`),/fixture.yaml.*unresolved Python stdin source custody/);
  for(const shell of [active.replace('python3 -','python3 script.py -c "os.getenv(\"PASSIVE_NEW\")"'),active.replace('python3 -','python3 -m passive_module -c "os.getenv(\"PASSIVE_NEW\")"')])assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',shell)),[]);
  const winning=`printf '%s\\n' 'import os;os.getenv("IGNORED_PIPE_NEW")' | python3 - <<'PY'\npass\nPY\n`;
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.sh',winning)),[]);
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('fixture.yaml',`command: ${JSON.stringify(['sh','-c',winning])}\n`)),[]);
  t.diagnostic(JSON.stringify({results}));
});

test('supported protocol and named getter aliases retain external finite-key sensitivity', async t => {
  const file='ops/pod/bootstrap.py';
  const baseline=fs.readFileSync(path.join(root,file),'utf8');
  const setup=getter=>`import os,annotationlib\nkey='KUBE_CONTEXT'\n${getter}\ndef change():\n    global key\n    key='PROTOCOL_ALIAS_NEW'\nchange()\nchosen=key\n`;
  const cases=[];
  for(const getter of ['os.getenv.__call__','os.environ.__getitem__','os.environ.get.__call__','os.environ.setdefault']) {
    const argument=getter.endsWith('setdefault')?", 'fallback'":'';
    cases.push([getter,setup(`getter=${getter}`)+`print(getter(chosen${argument}))\n`]);
  }
  cases.push(['namedexpr',setup('(getter:=os.getenv)')+'print(getter(chosen))\n']);
  cases.push(['nonlocal',`import os\ndef outer():\n    key='KUBE_CONTEXT'\n    getter=os.getenv.__call__\n    def change():\n        nonlocal key\n        key='PROTOCOL_ALIAS_NEW'\n    change()\n    chosen=key\n    print(getter(chosen))\nouter()\n`]);
  for(const [name,definition,target] of [
    ['function','def f(value:getter(chosen)):pass','f'],
    ['class','class C:\n    value:getter(chosen)','C'],
    ['method','class C:\n    def f(self,value:getter(chosen)):pass','C.f'],
  ])cases.push([name,setup('getter=os.getenv.__call__')+`${definition}\nprint(annotationlib.get_annotations(${target})['value'])\n`]);
  const results=[];
  for(const [name,code] of cases) {
    assert.throws(()=>sandbox.pythonEnvironmentReads(code,file),error=>error.message.includes(file)&&/global or nonlocal environment authority write/.test(error.message));
    sandbox.runtimeTextSources=()=>[file];sandbox.read=()=>baseline+'\n'+code;
    assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),error=>error.message.includes(file)&&/global or nonlocal environment authority write/.test(error.message));
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8',env:{...process.env,KUBE_CONTEXT:'prior-value',PROTOCOL_ALIAS_NEW:'alias-observed'}});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'alias-observed\n');
    results.push({name,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const getter of ['os.getenv.__call__','os.environ.__getitem__','os.environ.get.__call__','os.environ.setdefault']) {
    const argument=getter.endsWith('setdefault')?", 'fallback'":'';
    const direct=`import os\ngetter=${getter}\nkey='KUBE_CONTEXT'\nkey='PROTOCOL_ALIAS_NEW'\nchosen=key\nprint(getter(chosen${argument}))\n`;
    assert.deepEqual(names(direct),['PROTOCOL_ALIAS_NEW']);
    assert.deepEqual(names(direct.replace("key='PROTOCOL_ALIAS_NEW'", "[(key:='unused') for _ in [1]]\nkey='PROTOCOL_ALIAS_NEW'")),['PROTOCOL_ALIAS_NEW']);
    const native=await nativePython(t,['-I','-c',direct],{encoding:'utf8',env:{...process.env,PROTOCOL_ALIAS_NEW:'alias-observed'}});
    if (!native) continue;
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'alias-observed\n');
    results.push({name:'direct-'+getter,code:direct,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  assert.deepEqual(names(`import os\n(getter:=os.getenv.__call__)\nkey='KUBE_CONTEXT'\nkey='PROTOCOL_ALIAS_NEW'\nprint(getter(key))\n`),['PROTOCOL_ALIAS_NEW']);
  const passives=[
    `import os\ngetter=os.getenv.__call__\nkey='KUBE_CONTEXT'\ndef change():\n    global key\n    key='PROTOCOL_ALIAS_NEW'\nchange()\nprint('unused')\n`,
    `class Foreign:\n    def get(self,key):return key\ngetter=Foreign().get.__call__\nkey='KUBE_CONTEXT'\ndef change():\n    global key\n    key='PROTOCOL_ALIAS_NEW'\nchange()\nprint(getter(key))\n`,
    `import os\ngetter=os.getenv.__call__\ngetter=lambda key:'pure'\nprint(getter('PASSIVE_KEY'))\n`,
  ];
  for(const [index,code] of passives.entries()) {
    assert.deepEqual(names(code),[]);sandbox.read=()=>baseline+'\n'+code;assert.doesNotThrow(()=>sandbox.verifyEnvironmentConsumerCoverage());
    const native=await nativePython(t,['-I','-c',code],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);
    if (!native) continue;
    assert.equal(native.stdout,['unused\n','PROTOCOL_ALIAS_NEW\n','pure\n'][index]);
    results.push({name:'passive-'+index,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  t.diagnostic(JSON.stringify({results}));
});

test('pending heredocs keep original receiver, fd0 winner and passive body ownership across separators', async t => {
  const results=[];
  const shellFile='ops/pod/shell.sh',yamlFile='charts/ops-pod/templates/workload.yaml';
  const shellBaseline=fs.readFileSync(path.join(root,shellFile),'utf8');
  const yamlBaseline=fs.readFileSync(path.join(root,yamlFile),'utf8');
  const occurrences=sandbox.environmentOccurrences;
  const checkReceiver=(file,code,active)=>{
    const full=file===shellFile?shellBaseline+'\n'+code:yamlBaseline.replace(/(readinessProbe:[\s\S]*?\n\s+command:)[^\n]*/u,`$1 ${JSON.stringify(['sh','-c',code])}`);
    sandbox.runtimeTextSources=()=>[file];sandbox.read=()=>full;
    sandbox.environmentOccurrences=(source,text)=>occurrences(source,text).filter(item=>item.kind==='embedded-python-process-env');
    try {
      if(active)assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),error=>error.message.includes(file)&&/CONFIG_SEMANTIC_GAP:.*PENDING_HEREDOC_NEW/.test(error.message));
      else assert.doesNotThrow(()=>sandbox.verifyEnvironmentConsumerCoverage());
    } finally {sandbox.environmentOccurrences=occurrences;}
  };
  for(const tail of ['', ';', ' | cat', ' && true']) {
    const code=`python3 - <<'PY'${tail}\nimport os\nprint(os.getenv('PENDING_HEREDOC_NEW'))\nPY\n`;
    for(const file of [shellFile,yamlFile]) {
      const text=file===shellFile?code:`command: ${JSON.stringify(['sh','-c',code])}\n`;
      const facts=Array.from(sandbox.acquiredPythonEnvironmentReads(file,text));
      assert.deepEqual(facts.map(f=>f.name),['PENDING_HEREDOC_NEW']);assert.equal(facts[0].index,text.indexOf('os.getenv'));
      checkReceiver(file,code,true);
    }
    const native=spawnSync('sh',['-c',code],{encoding:'utf8',env:{...process.env,PENDING_HEREDOC_NEW:'heredoc-observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'heredoc-observed\n');
    results.push({name:'active-'+tail,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  for(const tail of ['', ';', ' | cat', ' && true']) {
    const recipe=`python3 -c 'import os;print(os.getenv("PASSIVE_RECIPE_NEW"))'\n`;
    const code=`cat <<'DATA'${tail}\n${recipe}DATA\n`;
    for(const file of [shellFile,yamlFile]) {
      const text=file===shellFile?code:`command: ${JSON.stringify(['sh','-c',code])}\n`;
      assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads(file,text)),[]);checkReceiver(file,code,false);
    }
    const native=spawnSync('sh',['-c',code],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,recipe);
    results.push({name:'passive-'+tail,code,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  }
  // Bodies are consumed in lexical redirect order, with each command retaining
  // its own last fd0 redirect. Earlier/fd3 bodies remain data after a separator.
  const ordered=`cat <<'DATA'; python3 3<<'FD3' <<'OLD' <<-'PY';\npython3 -c 'import os;os.getenv("PASSIVE_RECIPE_NEW")'\nDATA\nimport os;os.getenv('PASSIVE_FD3_NEW')\nFD3\nimport os;os.getenv('PASSIVE_OLD_NEW')\nOLD\n\timport os\n\tprint(os.getenv('PENDING_HEREDOC_NEW'))\n\tPY\n`;
  for(const file of [shellFile,yamlFile]) {
    const text=file===shellFile?ordered:`command: ${JSON.stringify(['sh','-c',ordered])}\n`;
    const facts=Array.from(sandbox.acquiredPythonEnvironmentReads(file,text));
    assert.deepEqual(facts.map(f=>f.name),['PENDING_HEREDOC_NEW']);assert.equal(facts[0].index,text.indexOf("os.getenv('PENDING_HEREDOC_NEW')"));
  }
  const native=spawnSync('sh',['-c',ordered],{encoding:'utf8',env:{...process.env,PENDING_HEREDOC_NEW:'heredoc-observed'}});
  assert.equal(native.status,0,native.stderr);assert.match(native.stdout,/heredoc-observed\n$/);
  results.push({name:'multiple-owner-redirect-order',code:ordered,exit:native.status,stdout:native.stdout,stderr:native.stderr});
  // Use literal single quotes to keep the nested shell body unexpanded.
  const nestedLiteral="sh -c '"+"python3 - <<\"PY\";\nimport os;print(os.getenv(\"PENDING_HEREDOC_NEW\"))\nPY\n"+"'";
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads(shellFile,nestedLiteral),f=>f.name),['PENDING_HEREDOC_NEW']);
  assert.throws(()=>sandbox.acquiredPythonEnvironmentReads(shellFile,"python3 <<'PY';\nimport os\n"),/unterminated heredoc/);
  t.diagnostic(JSON.stringify({results}));
});


// Known-name grammar is finite: unsupported static spellings must reject at
// actual reader, occurrence and coverage boundaries rather than disappear.
for (const [name, code] of [
  ['lowercase_new', "import os; os.getenv('lowercase_new')"],
  ['MixedCase_New', "import os; os.environ['MixedCase_New']"],
  ['_PRIVATE_NEW', "import os; os.getenv('_PRIVATE_NEW')"],
]) test(`Python known-name custody rejects ${name} at occurrence and coverage`, () => {
  const file = 'ops/pod/bootstrap.py';
  const diagnostic = error => error.message.includes(file)
    && error.message.includes('PYTHON_ENVIRONMENT_UNSUPPORTED: unsupported statically known environment name')
    && error.message.includes(name);
  assert.throws(() => sandbox.environmentOccurrences(file, code), diagnostic);
  const previousSources = sandbox.runtimeTextSources, previousRead = sandbox.read;
  try {
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = source => { assert.equal(source, file); return code; };
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), diagnostic);
  } finally { sandbox.runtimeTextSources = previousSources; sandbox.read = previousRead; }
});

test('Python known-name custody passive unsupported spellings remain no-read coverage', () => {
  const file = 'ops/pod/bootstrap.py';
  const code = "label = \"os.getenv('lowercase_new')\"\nother = 'MixedCase_New _PRIVATE_NEW'\n";
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.environmentOccurrences(file, code))), []);
  const previousSources = sandbox.runtimeTextSources, previousRead = sandbox.read;
  try {
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = source => { assert.equal(source, file); return code; };
    assert.doesNotThrow(() => sandbox.verifyEnvironmentConsumerCoverage());
  } finally { sandbox.runtimeTextSources = previousSources; sandbox.read = previousRead; }
});

test('Python known-name custody retains uppercase facts and unresolved-key denial', () => {
  const file = 'ops/pod/bootstrap.py', code = "import os; os.getenv('UPPERCASE_NEW')";
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.pythonEnvironmentReads(code, file))).map(item => item.name), ['UPPERCASE_NEW']);
  const facts = JSON.parse(JSON.stringify(sandbox.environmentOccurrences(file, code)));
  assert.deepEqual(facts.map(item => ({ name: item.name, path: item.path, kind: item.kind })),
    [{ name: 'UPPERCASE_NEW', path: file, kind: 'python-process-env' }]);
  assert.throws(() => sandbox.pythonEnvironmentReads("import os; os.getenv(input())", file),
    error => error.message.includes(file) && error.message.includes('PYTHON_ENVIRONMENT_UNSUPPORTED: unresolved environment key'));
});
