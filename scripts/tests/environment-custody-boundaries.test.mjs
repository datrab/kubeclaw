import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { shellHeredocCustody, shellCommandAcquisitions } from '../docs-shell-source-custody.mjs';
import { helmEnvironmentHelperProjectionPlans } from '../docs-helm-environment-projections.mjs';
import ts from 'typescript';
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
const sandbox = { read:file=>fs.readFileSync(path.join(root,file),'utf8'), helmEnvironmentHelperProjectionPlans, shellHeredocCustody, shellCommandAcquisitions, crypto, assert, Buffer, spawnSync, process, path, console, YAML, ts, fs, root,
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
  'environmentProducerOccurrences', 'environmentProducerSetting', 'environmentOccurrences', 'environmentReaderContract', 'verifyEnvironmentConsumerCoverage']) {
  vm.runInContext(declaration(name), sandbox, { filename: `production:${name}` });
}
const reads = (text) => JSON.parse(JSON.stringify(sandbox.pythonEnvironmentReads(text)));
const names = (text) => [...new Set(reads(text).map(item => item.name))].sort();

function nativePython(code, expected) {
  const prefix = "import os,json\nrequested=[]\noriginal=os.getenv\ndef audited(key,*args):\n requested.append(key)\n return original(key,*args)\nos.getenv=audited\n";
  const result = spawnSync('python3', ['-I', '-c', `${prefix}${code}\nprint(json.dumps(requested))`], {
    encoding: 'utf8', env: { ...process.env, DELETE_TARGET_NEW: 'key' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), expected);
}

function rejectBootstrap(code, pattern) {
  sandbox.runtimeTextSources = () => ['ops/pod/bootstrap.py'];
  sandbox.read = () => fs.readFileSync(path.join(root, 'ops/pod/bootstrap.py'), 'utf8') + '\n' + code;
  assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), pattern);
}

test('literal loop-carried keys are not lost after the first iteration', () => {
  const code = "import os\nKEY='OPS_NAMESPACE'\nfor i in (1,2):\n os.getenv(KEY)\n KEY='LOOP_NEW'\n";
  nativePython(code, ['OPS_NAMESPACE', 'LOOP_NEW']);
  assert.deepEqual(names(code), ['LOOP_NEW', 'OPS_NAMESPACE']);
  rejectBootstrap(code, /LOOP_NEW.*ops\/pod\/bootstrap\.py|ops\/pod\/bootstrap\.py.*LOOP_NEW/s);
  assert.deepEqual(names("import os\nKEY='PASSIVE'\nfor i in ():\n os.getenv(KEY)\n KEY='PASSIVE_NEW'\n"), []);
});

test('selected For and comprehension target indices execute, empty paths remain passive', () => {
  for (const [code, key] of [
    ["import os\nbox={}\nfor box[os.getenv('FOR_TARGET_NEW')] in (1,):\n pass\n", 'FOR_TARGET_NEW'],
    ["import os\nbox={}\nx=[1 for box[os.getenv('COMP_TARGET_NEW')] in (1,)]\n", 'COMP_TARGET_NEW'],
  ]) {
    nativePython(code, [key]);
    assert.deepEqual(names(code), [key]);
    rejectBootstrap(code, new RegExp(`${key}.*ops/pod/bootstrap.py|ops/pod/bootstrap.py.*${key}`, 's'));
  }
  for (const code of [
    "import os\nbox={}\nfor box[os.getenv('PASSIVE_TARGET')] in ():\n os.getenv('PASSIVE_BODY')\n",
    "import os\nx=[os.getenv('PASSIVE_RESULT') for i in () if os.getenv('PASSIVE_FILTER')]\n",
    "import os\nbox={}\nx=[os.getenv('PASSIVE_RESULT') for box[os.getenv('PASSIVE_TARGET')] in () for j in [os.getenv('PASSIVE_LATER')]]\n",
    "import os\nx={os.getenv('PASSIVE_KEY'):os.getenv('PASSIVE_VALUE') for i in []}\n",
    "import os\nx={os.getenv('PASSIVE_SET') for i in ()}\n",
  ]) {
    nativePython(code, []);
    assert.deepEqual(names(code), []);
  }
});

test('unaliased os.path import selects the native root module, leaf alias stays separate', () => {
  const code = "import os.path\nos.getenv('SUBMODULE_IMPORT_NEW')\n";
  nativePython(code, ['SUBMODULE_IMPORT_NEW']);
  assert.deepEqual(names(code), ['SUBMODULE_IMPORT_NEW']);
  rejectBootstrap(code, /SUBMODULE_IMPORT_NEW/);
  const passive = "import os.path as selected\nselected.basename('/plain/file')\n";
  nativePython(passive, []);
  assert.deepEqual(names(passive), []);
});

test('class comprehension uses outer reader only for an actual selected item', () => {
  for (const [iterable, expected] of [['[1]', ['CLASS_COMP_NEW']], ['[]', []]]) {
    const code = `import os\nclass Foreign:\n os=None\n values=[os.getenv('CLASS_COMP_NEW') for item in ${iterable}]\n`;
    nativePython(code, expected);
    assert.deepEqual(names(code), expected);
    if (expected.length) rejectBootstrap(code, /CLASS_COMP_NEW/);
  }
});

test('dynamic interpreter rejection does not depend on a literal Python-name marker', () => {
  const code = "\"$RUNNER\" -c 'import os;print(os.getenv(\"DYNAMIC_NO_MARKER_NEW\"))'\n";
  const native = spawnSync('/bin/sh', ['-c', code], {
    encoding: 'utf8', env: { ...process.env, RUNNER: 'python3', DYNAMIC_NO_MARKER_NEW: 'observed' },
  });
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.trim(), 'observed');
  for (const [file, body] of [
    ['scripts/custody.sh', code],
    ['charts/custody.yaml', `command: ${JSON.stringify(['sh', '-c', code])}\n`],
  ]) {
    assert.throws(() => sandbox.environmentOccurrences(file, body), /custody\.(?:sh|yaml).*dynamic interpreter custody/s);
    sandbox.runtimeTextSources = () => [file];
    sandbox.read = () => body;
    assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /custody\.(?:sh|yaml).*dynamic interpreter custody/s);
  }
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('scripts/passive.sh', "echo 'import os;print(os.getenv(\"PASSIVE_FAKE\"))'\n")), []);
});

test('legal Node heredoc command separators retain readers and native source offsets', () => {
  for (const separator of [';', ' | cat', ' && echo completed']) {
    const code = `node <<'NODE'${separator}\nconsole.log(process.env.NODE_SEPARATOR_NEW);\nNODE\n`;
    const native = spawnSync('/bin/sh', ['-c', code], {
      encoding: 'utf8', env: { ...process.env, NODE_SEPARATOR_NEW: 'observed' },
    });
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout.split('\n')[0], 'observed');
    for (const [file, body] of [
      ['scripts/custody.sh', code],
      ['charts/custody.yaml', `command:\n  - sh\n  - -c\n  - |\n${code.split('\n').map(line => `    ${line}`).join('\n')}`],
    ]) {
      const facts = Array.from(sandbox.embeddedNodeEnvironmentReads(file, body));
      assert.deepEqual(facts.map(item => item.name), ['NODE_SEPARATOR_NEW']);
      assert.equal(body.slice(facts[0].index).startsWith('process.env.NODE_SEPARATOR_NEW'), true);
      sandbox.runtimeTextSources = () => [file]; sandbox.read = () => body;
      assert.throws(() => sandbox.verifyEnvironmentConsumerCoverage(), /NODE_SEPARATOR_NEW/);
    }
  }
  const passive = "cat <<'DATA';\nnode <<'NODE';\nconsole.log(process.env.PASSIVE_SEPARATOR_FAKE);\nNODE\nDATA\n";
  assert.deepEqual(Array.from(sandbox.embeddedNodeEnvironmentReads('scripts/passive.sh', passive)), []);
});

test('loop-carried mixed reader authority rejects with exact source instead of undercoverage', () => {
  for (const loop of ['for i in (1,2):', 'i=0\nwhile i<2:']) {
    const code = `import os\nreader=lambda key:'pure'\n${loop}\n reader('LOOP_ALIAS_NEW')\n reader=os.getenv\n${loop.startsWith('i=') ? ' i+=1\n' : ''}`;
    nativePython(code, ['LOOP_ALIAS_NEW']);
    assert.throws(() => sandbox.pythonEnvironmentReads(code, 'ops/pod/bootstrap.py'), /ops\/pod\/bootstrap\.py.*unresolved environment callable authority/s);
    rejectBootstrap(code, /ops\/pod\/bootstrap\.py.*unresolved environment callable authority/s);
  }
});

test('evaluated assignment and deletion target indices retain native readers, stores stay passive', () => {
  for (const [code, key] of [
    ["import os\nbox={}\nbox[os.getenv('TARGET_NEW')]='x'\n", 'TARGET_NEW'],
    ["import os\nbox={'key':'x'}\ndel box[os.getenv('DELETE_TARGET_NEW')]\n", 'DELETE_TARGET_NEW'],
    ["import os\nbox={}\nbox[os.getenv('ANNOTATED_TARGET_NEW')]:str='x'\n", 'ANNOTATED_TARGET_NEW'],
    ["import os\nbox={}\nbox[os.getenv('ANNOTATED_NO_VALUE_NEW')]:str\n", 'ANNOTATED_NO_VALUE_NEW'],
  ]) {
    nativePython(code, [key]);
    assert.deepEqual(names(code), [key]);
    rejectBootstrap(code, new RegExp(key));
  }
  assert.deepEqual(names("import os\nos.environ['WRITE_ONLY']='x'\ndel os.environ['DELETE_ONLY']\nbox={}\nbox['os.getenv(FAKE)']='passive'\n"), []);
  const ordered = "import os\nKEY='OPS_NAMESPACE'\nbox={}\nbox[os.getenv(KEY)]:str=(KEY:='ANNOTATED_ORDER_NEW')\n";
  nativePython(ordered, ['ANNOTATED_ORDER_NEW']);
  assert.deepEqual(names(ordered), ['ANNOTATED_ORDER_NEW']);
  rejectBootstrap(ordered, /ANNOTATED_ORDER_NEW/);
});

test('With-as cannot preserve a stale qualified key or reader alias', () => {
  const code = "import os\nfrom contextlib import nullcontext\nKEY='OPS_NAMESPACE'\nwith nullcontext('WITH_NEW') as KEY:\n os.getenv(KEY)\n";
  nativePython(code, ['WITH_NEW']);
  rejectBootstrap(code, /ops\/pod\/bootstrap\.py.*unresolved environment key at line/s);
  assert.deepEqual(names("import os\nfrom contextlib import nullcontext\nreader=os.getenv\nwith nullcontext(lambda key:'pure') as reader:\n reader('PASSIVE')\n"), []);
  assert.deepEqual(names("import os\nfrom contextlib import nullcontext\nwith nullcontext('plain') as value:\n os.getenv('WITH_DIRECT_NEW')\n"), ['WITH_DIRECT_NEW']);
});

test('ordinary heredoc delimiter whitespace is exact in shell and decoded YAML', () => {
  const active = "python3 - <<'PY';\nimport os\nPY=1\nPY \nprint(os.getenv('DELIMITER_NEW'))\nPY\n";
  const passive = "cat <<'DATA';\n DATA\npython3 -c 'import os; print(os.getenv(\"PASSIVE_FAKE\"))'\nDATA\n";
  for (const [code, expected] of [[active, ['DELIMITER_NEW']], [passive, []]]) {
    const native = spawnSync('/bin/sh', ['-c', code], { encoding: 'utf8', env: { ...process.env, DELIMITER_NEW: 'observed' } });
    assert.equal(native.status, 0, native.stderr);
    if (expected.length) assert.equal(native.stdout.trim(), 'observed');
    for (const [file, body] of [['ops/pod/probe.sh', code], ['charts/ops-pod/templates/probe.yaml', `command: ${JSON.stringify(['sh', '-c', code])}\n`]]) {
      assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads(file, body), item => item.name), expected);
    }
  }
  const tabbed = "python3 - <<-'PY'\n\timport os\n\tprint(os.getenv('TABS_NEW'))\n\tPY\n";
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('ops/pod/probe.sh', tabbed), item => item.name), ['TABS_NEW']);
  const masked = sandbox.maskQuotedShellHeredocs(passive);
  assert.equal(masked.includes('PASSIVE_FAKE'), false);
});

test('expanded non-Python heredoc execution rejects; quoted recipes remain passive', () => {
  const body = "$(python3 -c 'import os; print(os.getenv(\"HEREDOC_SUBST_NEW\"))')\n";
  const expanded = `cat <<DATA\n${body}DATA\n`;
  const native = spawnSync('/bin/sh', ['-c', expanded], { encoding: 'utf8', env: { ...process.env, HEREDOC_SUBST_NEW: 'observed' } });
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.trim(), 'observed');
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('ops/pod/probe.sh', expanded), /ops\/pod\/probe\.sh.*expanded executable heredoc custody/s);
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('ops/pod/probe.sh', `cat <<'DATA'\n${body}DATA\n`)), []);
});

test('dynamic interpreter custody with identifiable Python source never silently vanishes', () => {
  const code = "runner=python3\n\"$runner\" -c 'import os; print(os.getenv(\"DYNAMIC_NEW\"))'\n";
  const native = spawnSync('/bin/sh', ['-c', code], { encoding: 'utf8', env: { ...process.env, DYNAMIC_NEW: 'observed' } });
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.trim(), 'observed');
  assert.throws(() => sandbox.acquiredPythonEnvironmentReads('ops/pod/probe.sh', code), /ops\/pod\/probe\.sh.*dynamic interpreter custody/s);
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('ops/pod/probe.sh', "echo 'runner=python3; \"$runner\" -c import os'\n")), []);
});

test('Node heredoc matching keeps exact delimiter spaces separate from YAML scalar indentation', () => {
  const code = "node <<'NODE'\nconst NODE=1;\nNODE \nconsole.log(process.env.NODE_DELIMITER_NEW);\nNODE\n";
  for (const [file, body] of [['ops/pod/probe.sh', code], ['charts/probe.yaml', `command:\n  - sh\n  - -c\n  - |\n${code.split('\n').map(line => `    ${line}`).join('\n')}`]]) {
    const facts = Array.from(sandbox.embeddedNodeEnvironmentReads(file, body));
    assert.deepEqual(facts.map(item => item.name), ['NODE_DELIMITER_NEW']);
    assert.equal(body.slice(facts[0].index).startsWith('process.env'), true);
  }
  const native = spawnSync('/bin/sh', ['-c', code], { encoding: 'utf8', env: { ...process.env, NODE_DELIMITER_NEW: 'observed' } });
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.trim(), 'observed');
});

test('quoted data heredocs cannot promote nested Node recipes or shell parameters', () => {
  const code = "cat <<'DATA'\n DATA\nnode <<'NODE'\nconsole.log(process.env.PASSIVE_NODE_FAKE);\nNODE\necho $PASSIVE_SHELL_FAKE\nDATA\n";
  assert.deepEqual(Array.from(sandbox.embeddedNodeEnvironmentReads('ops/pod/probe.sh', code)), []);
  assert.equal(sandbox.maskQuotedShellHeredocs(code).includes('PASSIVE_SHELL_FAKE'), false);
  const native = spawnSync('/bin/sh', ['-c', code], { encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.includes('process.env.PASSIVE_NODE_FAKE'), true);
  assert.equal(native.stdout.includes('$PASSIVE_SHELL_FAKE'), true);
});

test('Node command, argv and descriptor custody keeps passive neighbors passive', () => {
  const active = "console.log(process.env.NODE_CUSTODY_NEW);";
  const cases = [
    ["printf 'node ' <<'JS'\n"+active+"\nJS\n", []],
    ["cat <<'DATA'; node <<'JS'\npassive\nDATA\n"+active+"\nJS\n", ['NODE_CUSTODY_NEW']],
    ["node <<'OLD' <<'JS'\nconsole.log(process.env.NODE_OLD_PASSIVE);\nOLD\n"+active+"\nJS\n", ['NODE_CUSTODY_NEW']],
    ["node 3<<'FD3' <<'JS'\nconsole.log(process.env.NODE_FD3_PASSIVE);\nFD3\n"+active+"\nJS\n", ['NODE_CUSTODY_NEW']],
    ["node --version <<'JS'\n"+active+"\nJS\n", []],
    ["cat > /tmp/never-executed-environment-custody.js <<'JS'\n"+active+"\nJS\n", []],
    ["# node -e '"+active+"'\nprintf '%s' 'node -e sample'\n", []],
    ["cat <<'DATA'\nnode -e '"+active+"'\nDATA\n", []],
  ];
  for (const [code, expected] of cases) {
    const native = spawnSync('/bin/sh', ['-c', code], { encoding:'utf8', env:{...process.env,NODE_CUSTODY_NEW:'native-custody'} });
    assert.equal(native.status, 0, native.stderr);
    if (expected.length) assert.equal(native.stdout.split('\n').at(-2), 'native-custody');
    assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/custody.sh', code), item=>item.name), expected);
  }
  const quoted = "cat <<'FIRST' <<'SECOND'\nfirst\nFIRST\n${SHELL_SECOND_PASSIVE}\nSECOND\n";
  const native = spawnSync('/bin/sh', ['-c', quoted], {encoding:'utf8'});
  assert.equal(native.stdout, '${SHELL_SECOND_PASSIVE}\n');
  assert.equal(sandbox.maskQuotedShellHeredocs(quoted).includes('${SHELL_SECOND_PASSIVE}'), false);
});

test('selected Node YAML argv is acquired, ConfigMap recipe data has no execution authority', () => {
  const code='console.log(process.env.NODE_YAML_CUSTODY_NEW)';
  const native=spawnSync(process.execPath,['-e',code],{encoding:'utf8',env:{...process.env,NODE_YAML_CUSTODY_NEW:'observed'}});
  assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'observed\n');
  const active=YAML.stringify({apiVersion:'v1',kind:'Pod',spec:{containers:[{name:'fixture',command:['node','-e',code]}]}});
  const facts=Array.from(sandbox.acquiredNodeEnvironmentReads('charts/argv.yaml',active));
  assert.deepEqual(facts.map(item=>item.name),['NODE_YAML_CUSTODY_NEW']);
  assert.ok(active.slice(facts[0].index).startsWith('process.env.NODE_YAML_CUSTODY_NEW'));
  const passive=YAML.stringify({apiVersion:'v1',kind:'ConfigMap',data:{recipe:"node <<'JS'\n"+code+"\nJS\n"}});
  assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('charts/passive.yaml',passive)),[]);
});

test('dynamic recognizable Node and Python stdin custody rejects with owning source', () => {
  for(const [runner,code,pattern] of [
    ['node','console.log(process.env.DYNAMIC_NODE_NEW)',/NODE_ENVIRONMENT_SHELL_UNSUPPORTED.*scripts\/dynamic.sh/],
    ['python3',"import os;print(os.getenv('DYNAMIC_PYTHON_NEW'))",/PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED/],
  ]) {
    const shell=`runner=${runner}; "$runner" <<'PROGRAM'\n${code}\nPROGRAM\n`;
    const native=spawnSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{...process.env,DYNAMIC_NODE_NEW:'observed',DYNAMIC_PYTHON_NEW:'observed'}});
    assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'observed\n');
    assert.throws(()=>sandbox.environmentOccurrences('scripts/dynamic.sh',shell),pattern);
  }
});

test('Node computed process protocol is acquired and written key or alias authority rejects', () => {
  const code="console.log(process['env']['NODE_BRACKET_NEW'])";
  const native=spawnSync(process.execPath,['-e',code],{encoding:'utf8',env:{...process.env,NODE_BRACKET_NEW:'observed'}});
  assert.equal(native.stdout,'observed\n');
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/bracket.mjs',code),item=>item.name),['NODE_BRACKET_NEW']);
  for(const fixture of [
    "let key='OPS_NAMESPACE'; key='NODE_COMPUTED_NEW'; console.log(process.env[key])",
    "let e=process.env; e={NODE_PURE_NEW:'pure'}; console.log(e.NODE_PURE_NEW)",
  ]) assert.throws(()=>sandbox.nodeEnvironmentReads('scripts/written.mjs',fixture),/NODE_ENVIRONMENT_UNSUPPORTED.*scripts\/written.mjs.*written/);
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/pure.mjs',"let e={}; e={NODE_PURE_NEW:'pure'}; console.log(e.NODE_PURE_NEW)")),[]);
});

test('Python exception handlers include intermediate key states rather than final-body state only', () => {
  const code="import os\nKEY='OPS_NAMESPACE'\ntry:\n KEY='TRY_INTERMEDIATE_NEW'\n raise Exception()\n KEY='OPS_NAMESPACE'\nexcept Exception:\n print(os.getenv(KEY))\n";
  nativePython(code,['TRY_INTERMEDIATE_NEW']);
  assert.ok(names(code).includes('TRY_INTERMEDIATE_NEW'));
  rejectBootstrap(code,/TRY_INTERMEDIATE_NEW/);
});

test('producer qualification cannot borrow a same-name reader from another process', () => {
  const sourceByPath={
    'scripts/host.mjs':'console.log(process.env.TMPDIR)\n',
    'charts/unqualified.yaml':'apiVersion: v1\nkind: Pod\nspec:\n  containers:\n    - name: unrelated\n      env:\n        - name: TMPDIR\n          value: /cache\n',
  };
  sandbox.runtimeTextSources=()=>Object.keys(sourceByPath);sandbox.read=file=>sourceByPath[file];
  assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/TMPDIR:charts\/unqualified.yaml:external boundary/);
});

test('Node command substitutions have executable custody, single-quoted substitution text stays passive', () => {
  const active="value=$(node -e 'console.log(process.env.NODE_SUBSTITUTION_NEW)'); printf '%s\\n' \"$value\"\n";
  const native=spawnSync('/bin/sh',['-c',active],{encoding:'utf8',env:{...process.env,NODE_SUBSTITUTION_NEW:'observed'}});
  assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'observed\n');
  const facts=Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/substitution.sh',active));
  assert.deepEqual(facts.map(item=>item.name),['NODE_SUBSTITUTION_NEW']);
  assert.ok(active.slice(facts[0].index).startsWith('process.env.NODE_SUBSTITUTION_NEW'));
  assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive.sh',"printf '%s' '$(node -e \"console.log(process.env.PASSIVE_SUBSTITUTION)\")'\n")),[]);
});

test('public symbolic-link runtime sources fail explicitly instead of disappearing from traversal', () => {
  const directory=fs.mkdtempSync(path.join('/tmp','environment-public-link-'));
  try {
    fs.mkdirSync(path.join(directory,'scripts'));fs.mkdirSync(path.join(directory,'examples'));
    fs.writeFileSync(path.join(directory,'examples','actual.mjs'),'console.log(process.env.PUBLIC_LINK_NEW)');
    fs.symlinkSync('../examples/actual.mjs',path.join(directory,'scripts','public.mjs'));
    const native=spawnSync(process.execPath,[path.join(directory,'scripts','public.mjs')],{encoding:'utf8',env:{...process.env,PUBLIC_LINK_NEW:'observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    const scope={fs,path,assert,root:directory,EXCLUDED_SEGMENTS:new Set(),relative:absolute=>path.relative(directory,absolute)};
    vm.createContext(scope);vm.runInContext(declaration('walk'),scope);
    assert.throws(()=>scope.walk('scripts'),/CONFIG_RUNTIME_SOURCE_CUSTODY_UNSUPPORTED.*scripts\/public.mjs.*symbolic-link/);
    fs.unlinkSync(path.join(directory,'scripts','public.mjs'));
    fs.symlinkSync('/tmp/outside-environment-source.mjs',path.join(directory,'scripts','public.mjs'));
    assert.throws(()=>scope.walk('scripts'),/CONFIG_RUNTIME_SOURCE_CUSTODY_UNSUPPORTED.*scripts\/public.mjs/);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test('bounded Node lexical receivers do not borrow an environment alias across functions', () => {
  const code="function active(environment=process.env){ return environment.NODE_ACTIVE_SCOPED; }\nfunction pure(environment){ return environment.name; }\nconst config={NODE_ACTIVE_SCOPED:'pure'}; console.log(pure({name:'pure'}));";
  const facts=Array.from(sandbox.nodeEnvironmentReads('scripts/scoped.mjs',code));
  assert.deepEqual(facts.map(item=>item.name),['NODE_ACTIVE_SCOPED']);
  const loop="const NAMES=Object.freeze(['NODE_LOOP_FIRST','NODE_LOOP_SECOND']); for(const key of NAMES){ console.log(process.env[key]); }";
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/loop.mjs',loop),item=>item.name),['NODE_LOOP_FIRST','NODE_LOOP_SECOND']);
  const snapshot="const before={...process.env}; if(Object.entries(before).some(([name,value])=>process.env[name]!==value)) throw Error('changed')";
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/snapshot.mjs',snapshot)),[]);
  assert.throws(()=>sandbox.nodeEnvironmentReads('scripts/not-snapshot.mjs',snapshot.replace('!==value','!==process.argv[2]')),/NODE_ENVIRONMENT_UNSUPPORTED.*runtime-computed/);
});

test('maintained operator contract families preserve actual rejection and selection constraints', () => {
  const scope={environmentContract: fields=>fields};vm.createContext(scope);
  vm.runInContext(declaration('operatorEnvironmentFamilyContract'),scope);
  for(const name of ['NOVA_IMAGE_TAG','GENERAL_IMAGE_TAG','BUSTER_GATEWAY_IMAGE_TAG','BUSTER_CONTROLLER_IMAGE_TAG','NAMESPACE_CONTROLLER_IMAGE_TAG']) {
    const contract=scope.operatorEnvironmentFamilyContract(name);
    assert.equal(contract.acceptedForm,'Leave unset or empty.');assert.match(contract.invalidBehavior,/reject|stops/);
  }
  const auth=scope.operatorEnvironmentFamilyContract('NOVA_CODE_BUNDLE_AUTH_SECRET_KEY');
  assert.match(auth.precedence,/including an explicit environment value.*existingSecretKey/);
  const commit=scope.operatorEnvironmentFamilyContract('BUSTER_CODE_BUNDLE_EXPECTED_COMMIT');
  assert.match(commit.precedence,/SELECTED_RUNTIME_COMMIT.*selected receipt/);
  const version=scope.operatorEnvironmentFamilyContract('PRISM_CODE_BUNDLE_CONTRACT_VERSION');
  assert.match(version.precedence,/without consulting selected Helm values/);
  const preflight=scope.operatorEnvironmentFamilyContract('KUBECLAW_API_PREFLIGHT_IMAGE');
  assert.match(preflight.acceptedForm,/explicit registry, lowercase repository, no tag/);
  assert.match(scope.operatorEnvironmentFamilyContract('OPENCLAW_NOTIFY_AGENT_REPLY_CHANNEL').emptyBehavior,/inherits.*OPENCLAW_NOTIFY_CHANNEL/);
  assert.match(scope.operatorEnvironmentFamilyContract('OPENCLAW_NOTIFY_AGENT_ON_STATUSES').emptyBehavior,/selects `failed`/);
  const deploy=fs.readFileSync(path.join(root,'scripts/deploy.sh'),'utf8');
  const start=deploy.indexOf('normalize_boolish() {'),end=deploy.indexOf('\n}',start)+2;
  const native=spawnSync('/bin/bash',['-c',deploy.slice(start,end)+"\nfor value in TRUE YES enabled unknown false; do normalize_boolish \"$value\"; done"],{encoding:'utf8'});
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'true\ntrue\ntrue\nunknown\nfalse\n');
});

test('maintained configured-key receivers retain exact actual field, guard and conditional custody', () => {
  const file='skills/buster/engine/test-gates/production.ts';const bytes=fs.readFileSync(path.join(root,file),'utf8');
  const facts=Array.from(sandbox.configuredEnvironmentReceiverFacts(file,bytes));
  assert.deepEqual(facts.map(item=>item.configurationField),['tokenEnvironmentVariable','sourceAttestationPublicKeyEnvironmentVariable']);
  assert.match(facts[0].condition,/Only when trustedPeerSpiffeIds is absent/);
  assert.match(facts[1].acceptedForm,/different from the selected token/);
  for(const fact of facts) {
    assert.equal(fact.canonicalPage,'reference/buster-runtime-configuration.md');
    assert.ok(bytes.slice(fact.index).startsWith('environment['));
    for(const key of ['purpose','acceptedForm','defaultBehavior','emptyBehavior','invalidBehavior','precedence','impact','failure']) assert.ok(fact[key]);
    assert.ok(fact.evidence.every(item=>item.path===file && item.line>0 && item.endLine>=item.line));
  }
  assert.doesNotThrow(()=>sandbox.nodeEnvironmentReads(file,bytes));
  for(const changed of [
    bytes.replace("if (!trustedPeerSpiffeIds)","if (trustedPeerSpiffeIds)"),
    bytes.replace("tokenName = value.tokenEnvironmentVariable;","tokenName = value.tokenEnvironmentVariable; tokenName = 'MUTATED_KEY';"),
    bytes.replace("sourceKeyName === tokenName","sourceKeyName !== tokenName"),
    bytes.replace("if (!sourceAttestationPublicKey)","if (sourceAttestationPublicKey)"),
    bytes.replace("'buster-remote-plan-runtime.v1'","'different-runtime.v1'"),
  ]) assert.throws(()=>sandbox.nodeEnvironmentReads(file,changed),/NODE_ENVIRONMENT_UNSUPPORTED.*production.ts.*configured receiver custody/);
  assert.throws(()=>sandbox.nodeEnvironmentReads(file,bytes+'\nconsole.log(process.env[process.argv[2]]);'),/NODE_ENVIRONMENT_UNSUPPORTED.*runtime-computed/);
});

test('Nova and registered Secret mapping configured receivers reject altered guards and selectors', () => {
  for(const [file,expectedFields,mutations] of [
    ['skills/nova/core/test-gates/runtime-config.ts',['tokenEnvironmentVariable','sourceAttestationPrivateKeyEnvironmentVariable'],[
      ["if (authentication === 'bearer')","if (authentication !== 'bearer')"],
      ["parsedSourceKey.asymmetricKeyType !== 'ed25519'","parsedSourceKey.asymmetricKeyType === 'ed25519'"],
      ['token = environment[tokenName];','token = environment[tokenName] || "fallback";'],
    ]],
    ['skills/common/plugins/secret-resolver/src/adapter.ts',['environment{logical secret identifier}'],[
      ["request.operation !== 'resolve'","request.operation === 'resolve'"],
      ['const names = Object.freeze({ ...(mapping as Record<string, string>) });','const names = { ...(mapping as Record<string, string>) };'],
      ['const environmentName = names[request.resource.canonicalId];','let environmentName = names[request.resource.canonicalId];'],
      ['value === undefined || value.length === 0','value === undefined'],
    ]],
  ]) {
    const bytes=fs.readFileSync(path.join(root,file),'utf8');
    const facts=Array.from(sandbox.configuredEnvironmentReceiverFacts(file,bytes));
    assert.deepEqual(facts.map(item=>item.configurationField),expectedFields);
    assert.doesNotThrow(()=>sandbox.nodeEnvironmentReads(file,bytes));
    for(const [from,to] of mutations) {
      assert.ok(bytes.includes(from),from);
      assert.throws(()=>sandbox.nodeEnvironmentReads(file,bytes.replace(from,to)),/NODE_ENVIRONMENT_UNSUPPORTED.*configured receiver custody/);
    }
  }
});

test('escaped inline Node prefix preserves exact actual environment-reader source offset', () => {
  const code='node -e "console.log(\\"prefix\\"); console.log(process.env.NODE_ESCAPED_OFFSET_NEW)"';
  const native=spawnSync('/bin/sh',['-c',code],{encoding:'utf8',env:{...process.env,NODE_ESCAPED_OFFSET_NEW:'observed'}});
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'prefix\nobserved\n');
  const facts=Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/escaped.sh',code));
  assert.deepEqual(facts.map(item=>item.name),['NODE_ESCAPED_OFFSET_NEW']);assert.equal(facts[0].index,code.indexOf('process.env.NODE_ESCAPED_OFFSET_NEW'));
});

test('actual YAML producer custody keeps each inline declaration and detects container/image/command branch changes', () => {
  const file='charts/producer-custody.yaml';
  const bytes="apiVersion: v1\nkind: Pod\nmetadata: {name: fixture}\nspec:\n  containers:\n    - name: receiver\n      image: '{{ .Values.image }}'\n      {{- if .Values.enabled }}\n      command: [node, selected.mjs]\n      {{- end }}\n      env: [{name: FIRST_INPUT, value: one}, {name: SECOND_INPUT, value: two}]\n";
  const rows=Array.from(sandbox.environmentProducerOccurrences(file,bytes));
  assert.deepEqual(rows.map(row=>row.name),['FIRST_INPUT','SECOND_INPUT']);
  for(const row of rows) {
    assert.equal(row.line,11);assert.equal(row.custody.container.name,'receiver');
    assert.match(row.custody.container.image,/Values.image/);
    assert.ok(row.custody.command.guards.some(guard=>guard.expression==='.Values.enabled'));
    assert.equal(row.custody.guards.some(guard=>guard.expression==='.Values.enabled'),false);
  }
  for(const changed of [bytes.replace('name: receiver','name: unrelated'),bytes.replace('.Values.image','.Values.otherImage'),bytes.replace('.Values.enabled','.Values.otherEnabled')]) {
    const next=Array.from(sandbox.environmentProducerOccurrences(file,changed));
    assert.notEqual(next[0].custodyDigest,rows[0].custodyDigest);
  }
  assert.deepEqual(Array.from(sandbox.environmentProducerOccurrences(file,"apiVersion: v1\nkind: ConfigMap\ndata:\n  recipe: |\n    env: [{name: PASSIVE_RECIPE, value: data}]\n")),[]);
});

test('Node stdin numeric descriptor duplication follows the actual acquired body', () => {
  const shell="node - 3<<'ACTIVE' <<'OLD' 0<&3\nconsole.log(process.env.NODE_DESCRIPTOR_NEW)\nACTIVE\nconsole.log(process.env.PASSIVE_DESCRIPTOR_OLD)\nOLD\n";
  const native=spawnSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{...process.env,NODE_DESCRIPTOR_NEW:'observed'}});
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
  const facts=Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/descriptor.sh',shell));
  assert.deepEqual(facts.map(fact=>fact.name),['NODE_DESCRIPTOR_NEW']);
  assert.ok(shell.slice(facts[0].index).startsWith('process.env.NODE_DESCRIPTOR_NEW'));
  assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/descriptor.sh',shell.replace('0<&3','0<&${fd}')),/SHELL_HEREDOC_CUSTODY_UNQUALIFIED.*scripts\/descriptor.sh.*dynamic input descriptor/);
});

test('Node legacy substitutions are acquired while single-quoted recipe text stays passive', () => {
  const shell="value=`node -e 'console.log(process.env.NODE_LEGACY_NEW)'`; printf '%s\\n' \"$value\"";
  const native=spawnSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{...process.env,NODE_LEGACY_NEW:'observed'}});
  assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
  assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/legacy.sh',shell),fact=>fact.name),['NODE_LEGACY_NEW']);
  assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive.sh',"echo 'x=`node -e process.env.PASSIVE_LEGACY`'")),[]);
});

test('Python nested explicit raise preserves the intermediate environment key without simulating reachability', () => {
  const code="import os\nKEY='OPS_NAMESPACE'\ntry:\n if True:\n  KEY='NESTED_TRY_NEW'\n  raise Exception()\n  KEY='OPS_NAMESPACE'\nexcept Exception:\n print(os.getenv(KEY))\n";
  nativePython(code,['NESTED_TRY_NEW']);assert.ok(names(code).includes('NESTED_TRY_NEW'));
});

test('Python dynamic stdin actual executable custody includes argv and rejects no passive variable argument', () => {
  for(const suffix of ['',' -']) {
    const code=`runner=python3; "$runner"${suffix} <<'PY'\nimport os;print(os.getenv('DYNAMIC_ARGV_STDIN_NEW'))\nPY\n`;
    const native=spawnSync('/bin/sh',['-c',code],{encoding:'utf8',env:{...process.env,DYNAMIC_ARGV_STDIN_NEW:'observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'observed\n');
    assert.throws(()=>sandbox.acquiredPythonEnvironmentReads('scripts/dynamic-argv.sh',code),/scripts\/dynamic-argv.sh.*PYTHON_ENVIRONMENT_SHELL_UNSUPPORTED.*dynamic interpreter stdin custody/);
  }
  const passive="runner=unused; cat \"$runner\" <<'PY'\nimport os;print(os.getenv('PASSIVE_DYNAMIC_ARGUMENT'))\nPY\n";
  assert.deepEqual(Array.from(sandbox.acquiredPythonEnvironmentReads('scripts/passive-argv.sh',passive)),[]);
});

test('Node protocol source identity separates lexical process shadows from real imported capability', () => {
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/pure.mjs',"const process={env:{NODE_PURE_PROCESS:'pure'}};console.log(process.env.NODE_PURE_PROCESS)")),[]);
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/pure.mjs',"function pure(process){return process.env.NODE_PURE_PROCESS}")),[]);
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/pure.mjs',"import process from './pure-object.mjs';console.log(process.env.NODE_PURE_PROCESS)")),[]);
  for(const code of ["import proc from 'node:process'; console.log(proc.env.NODE_IMPORTED_NEW)","import {env as variables} from 'node:process'; console.log(variables.NODE_IMPORTED_NEW)"])
    assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/imported.mjs',code),fact=>fact.name),['NODE_IMPORTED_NEW']);
  for(const code of ["const proc=require('node:process');console.log(proc.env.NODE_COMMONJS_NEW)","console.log(require('node:process').env.NODE_COMMONJS_NEW)"])
    assert.throws(()=>sandbox.nodeEnvironmentReads('scripts/commonjs.cjs',code),/NODE_ENVIRONMENT_UNSUPPORTED.*scripts\/commonjs.cjs.*CommonJS process-module/);
  for(const code of ["process.env.NODE_STORED_NEW='pure'", "delete process.env.NODE_DELETED_NEW"])
    assert.throws(()=>sandbox.nodeEnvironmentReads('scripts/stored.mjs',code),/NODE_ENVIRONMENT_UNSUPPORTED.*environment receiver/);
});


test('literal environment name casing is preserved and dynamic names fail source-specifically', () => {
  const file='charts/name-custody.yaml';
  const bytes='kind: Pod\nspec:\n  containers:\n    - name: actual\n      env: [{name: Lowercase_Input, value: selected}]\n';
  assert.deepEqual(Array.from(sandbox.environmentProducerOccurrences(file,bytes),row=>row.name),['Lowercase_Input']);
  assert.throws(()=>sandbox.environmentProducerOccurrences(file,bytes.replace('Lowercase_Input','{{ .Values.selectedName }}')),/ENVIRONMENT_PRODUCER_CUSTODY_UNSUPPORTED: charts\/name-custody.yaml:5/);
});

test('incomplete env-helper callers and dynamic standalone includes fail rather than omit rendered producers', () => {
  for(const [file,helper,definition] of [
    ['charts/kubeclaw/templates/deployment.yaml','kubeclaw.demoReadyClientEnv','_demo-ready-client.tpl'],
    ['charts/kubeclaw/templates/deployment.yaml','kubeclaw.registryContainer','_registry-clients.tpl'],
    ['charts/prism/templates/workloads.yaml','prism.productDecisions.env','_product-decisions.tpl'],
  ]) {
    assert.throws(()=>sandbox.environmentProducerOccurrences(file,`{{- include "${helper}" . | nindent 12 }}\n`),error=>error.message.includes('ENVIRONMENT_PRODUCER_HELPER_CUSTODY_UNQUALIFIED') && error.message.includes(file+':1') );
  }
  assert.throws(()=>sandbox.environmentProducerOccurrences('charts/kubeclaw/templates/deployment.yaml','{{- include .Values.selectedEnvHelper . | nindent 12 }}\n'),/dynamic standalone helper selection/);
  assert.deepEqual(Array.from(sandbox.environmentProducerOccurrences('charts/kubeclaw/templates/deployment.yaml','metadata:\n  annotations:\n    checksum/config: {{ include (print $.Template.BasePath \"/configmap-gateway.yaml\") . | sha256sum }}\n')),[]);
});


test('all three actual helper families acquire every symbolic branch with helper and caller custody', () => {
  sandbox.read=file=>fs.readFileSync(path.join(root,file),'utf8');
  const counts=[];
  for(const file of ['charts/kubeclaw/templates/deployment.yaml','charts/prism/templates/workloads.yaml']) {
    const bytes=fs.readFileSync(path.join(root,file),'utf8');
    const rows=Array.from(sandbox.environmentProducerOccurrences(file,bytes));
    const projected=rows.filter(row=>row.custody.helperProjection);
    counts.push(projected.length);
    for(const row of projected) {
      assert.ok(row.custody.helperProjection.helper.actions.length>0);
      assert.ok(row.custody.helperProjection.dependencies.length>0);
      assert.match(row.custody.statement.sourceDigest,/^[a-f0-9]{64}$/);
      assert.ok(fs.existsSync(path.join(root,row.custodyEvidence.selectedSourcePath)));
      assert.ok(row.custodyEvidence.range[1]>row.custodyEvidence.range[0]);
      assert.ok(row.custody.helperProjection.branch.valueAuthority.kind);
      const owning=sandbox.environmentProducerSetting(row);assert.ok(owning.includes('selected helper'));assert.ok(owning.includes('producing branches'));
      if(row.name==='KUBECLAW_DEMO_READY_ENDPOINT') assert.ok(owning.includes('.Values.busterNamespaceBroker.readyClient.endpoint'));
      if(row.name==='PRISM_PRODUCT_PRIVATE_KEY_FILE') assert.ok(owning.includes('/var/run/prism/product-signing/private-key.pem'));
      if(row.name==='KUBECLAW_REGISTRY_USERNAME') assert.ok(owning.includes('secretKeyRef'));
    }
    if(file.includes('prism/')) {
      assert.ok(projected.every(row=>row.custody.guards.some(guard=>guard.expression==='eq $name "control"')));
      assert.ok(projected.every(row=>row.custody.helperProjection.dependencies[0].invocation.scope==='preceding caller root'));
    } else {
      const credentials=projected.filter(row=>row.name==='KUBECLAW_REGISTRY_USERNAME'||row.name==='KUBECLAW_REGISTRY_PASSWORD');
      assert.equal(credentials.length,2);
      assert.ok(credentials.every(row=>row.secretProvenance && row.custody.helperProjection.branch.finiteKey));
      assert.ok(credentials.every(row=>row.custody.command.mode.includes('transport only')));
      assert.ok(credentials.every(row=>row.custody.helperProjection.incomingContainer.environmentSelector.includes('.container.env')));
    }
  }
  assert.deepEqual(counts,[8,8]);
});

test('finite helper recipes reject declaration, validator, registry merge/key and unknown-helper drift', () => {
  const directory=fs.mkdtempSync(path.join('/tmp','helm-helper-custody-'));
  try {
    for(const chart of ['kubeclaw','prism']) {
      const target=path.join(directory,'charts',chart,'templates');fs.mkdirSync(target,{recursive:true});
      fs.cpSync(path.join(root,'charts',chart,'templates'),target,{recursive:true});
      fs.copyFileSync(path.join(root,'charts',chart,'Chart.yaml'),path.join(directory,'charts',chart,'Chart.yaml'));
    }
    const cases=[
      ['kubeclaw','_demo-ready-client.tpl','readyClient.enabled','readyClient.otherEnabled'],
      ['kubeclaw','_demo-ready-client.tpl','KUBECLAW_DEMO_READY_ENDPOINT','Changed_Endpoint'],
      ['kubeclaw','_demo-ready-client.tpl','(not .Values.serviceAccount.create)','(not .Values.serviceAccount.otherCreate)'],
      ['prism','_product-decisions.tpl','if not .Values.tailscale.enabled','if .Values.tailscale.enabled'],
      ['prism','_product-decisions.tpl','- { name: PRISM_PRODUCT_ISSUER, value: {{ $config.issuer | quote }} }',''],
      ['kubeclaw','_registry-clients.tpl','"USERNAME" $registry.usernameKey','"USERNAME" $registry.otherUsernameKey'],
      ['kubeclaw','_registry-clients.tpl','(concat ($container.env | default list) $env)','$env'],
      ['kubeclaw','_registry-clients.tpl','duplicates the shared registry contract','allows duplicate registry contract'],
    ];
    for(const [chart,name,before,after] of cases) {
      const helper=path.join(directory,'charts',chart,'templates',name),original=fs.readFileSync(helper,'utf8');
      assert.ok(original.includes(before));fs.writeFileSync(helper,original.replace(before,after));
      const file=`charts/${chart}/templates/${chart==='prism'?'workloads':'deployment'}.yaml`;
      assert.throws(()=>helmEnvironmentHelperProjectionPlans({file,text:fs.readFileSync(path.join(root,file),'utf8'),sourceRoot:directory}),error=>error.message.includes('ENVIRONMENT_PRODUCER_HELPER_CUSTODY_UNQUALIFIED')&&error.message.includes(name));
      fs.writeFileSync(helper,original);
    }
    const unknown=path.join(directory,'charts/kubeclaw/templates/_unknown-env.tpl');
    fs.writeFileSync(unknown,'{{- define "unreviewed.env" -}}\n- name: UNKNOWN_NEW\n  value: selected\n{{- end -}}\n');
    assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:'charts/kubeclaw/templates/deployment.yaml',text:'{{ include "unreviewed.env" . }}',sourceRoot:directory}),/missing finite helper recipe/);
    fs.writeFileSync(unknown,'{{- define "unreviewed.env" -}}{{ toYaml .Values.dynamicEnv }}{{- end -}}\n');
    assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:'charts/kubeclaw/templates/deployment.yaml',text:'spec:\n  containers:\n    - name: actual\n      env:\n        {{ include "unreviewed.env" . }}\n',sourceRoot:directory}),/missing finite helper recipe/);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test('helper actual caller validation/context and container/image/command branch drift stays visible', () => {
  const file='charts/prism/templates/workloads.yaml',bytes=fs.readFileSync(path.join(root,file),'utf8');
  const rows=text=>Array.from(sandbox.environmentProducerOccurrences(file,text)).filter(row=>row.custody.helperProjection);
  const baseline=rows(bytes);
  for(const changed of [bytes.replace('if eq $name "control"','if eq $name "studio"'),bytes.replace('$image := index $.Values.images $name','$image := index $.Values.otherImages $name'),bytes.replace('command: ["node", "skills/prism/server/worker.ts"]','command: ["node", "unrelated.ts"]')]) {
    assert.notEqual(rows(changed)[0].custodyDigest,baseline[0].custodyDigest);
  }
  for(const changed of [bytes.replace('{{- include "prism.productDecisions.validate" . }}',''),bytes.replace('{{- include "prism.productDecisions.validate" . }}','{{- if .Values.other }}\n{{- include "prism.productDecisions.validate" . }}\n{{- end }}'),bytes.replace('include "prism.productDecisions.env" $','include "prism.productDecisions.env" .')]) {
    assert.throws(()=>rows(changed),/ENVIRONMENT_PRODUCER_HELPER_CUSTODY_UNQUALIFIED/);
  }
  const registryFile='charts/kubeclaw/templates/deployment.yaml',registryBytes=fs.readFileSync(path.join(root,registryFile),'utf8');
  assert.throws(()=>sandbox.environmentProducerOccurrences(registryFile,registryBytes.replace('(gt (int $registryWorkers) 1)','(gt (int $registryWorkers) 2)')),/changed exact-one-worker registry caller validation/);
  assert.throws(()=>sandbox.environmentProducerOccurrences(registryFile,registryBytes.replace('dict "root" $ "container" .','dict "root" . "container" .')),/changed\/unrecognized env helper caller/);
});

test('native Helm witnesses all optional helper producing branches and preserves incoming environment', t => {
  const availability=spawnSync('helm',['version','--short'],{encoding:'utf8'});
  assert.equal(availability.status,0,'native Helm required for helper branch witnesses');
  const directory=fs.mkdtempSync(path.join('/tmp','helm-helper-native-'));
  const emitted=new Set(),nativeResults=[];
  const helmPath=spawnSync('/bin/sh',['-c','command -v helm'],{encoding:'utf8'}).stdout.trim();
  const nativeBinary={path:helmPath,realpath:fs.realpathSync(helmPath),sha256:crypto.createHash('sha256').update(fs.readFileSync(fs.realpathSync(helmPath))).digest('hex'),version:availability.stdout.trim()};
  try {
    const templates=path.join(directory,'templates');fs.mkdirSync(templates);
    fs.writeFileSync(path.join(directory,'Chart.yaml'),'apiVersion: v2\nname: custody-witness\nversion: 0.1.0\n');
    for(const [chart,name] of [['kubeclaw','_demo-ready-client.tpl'],['kubeclaw','_registry-clients.tpl'],['prism','_product-decisions.tpl']]) fs.copyFileSync(path.join(root,'charts',chart,'templates',name),path.join(templates,name));
    const base={agentRole:'nova',serviceAccount:{create:true},tailscale:{enabled:true},secrets:{runtime:'runtime'},busterNamespaceBroker:{readyClient:{enabled:false,endpoint:'https://ready.example',audience:'ready-audience'}},control:{productDecisions:{enabled:false,issuer:'issuer',origin:'https://origin.example',authorityRevision:'rev',signingSecretName:'separate-signing',signingSecretKey:'private-key',controllerUrl:'https://controller.example',controllerNamespace:'controller',controllerRelease:'controller',controllerCaSecretName:'controller-ca',controllerCaSecretKey:'ca.crt',tokenAudience:'controller',operators:['operator']}},runtimeInfrastructure:{registry:{endpoint:'http://registry.example',transport:'http-lab',authSecretName:'',usernameKey:'username',passwordKey:'password',caSecretName:'',nodeCaFile:''},dockerHubMirror:{endpoint:'',transport:'',caSecretName:'',nodeCaFile:''},localRegistry:null}};
    const demoCall=helmEnvironmentHelperProjectionPlans({file:'charts/kubeclaw/templates/deployment.yaml',text:fs.readFileSync(path.join(root,'charts/kubeclaw/templates/deployment.yaml'),'utf8'),sourceRoot:root})[0].helperProjection.caller.expression;
    const prismCall=helmEnvironmentHelperProjectionPlans({file:'charts/prism/templates/workloads.yaml',text:fs.readFileSync(path.join(root,'charts/prism/templates/workloads.yaml'),'utf8'),sourceRoot:root})[0].helperProjection.caller.expression;
    fs.writeFileSync(path.join(templates,'witness.yaml'),`{{- include "prism.productDecisions.validate" . }}\napiVersion: v1\nkind: Pod\nmetadata: {name: witness}\nspec:\n  containers:\n    - name: gateway\n      env:\n            {{ ${demoCall} }}\n    - name: control\n      env:\n            {{ ${prismCall} }}\n    - {{ include "kubeclaw.registryContainer" (dict "root" $ "container" .Values.incoming) | nindent 6 | trim }}\n`);
    for(const [enabled,transport,ca] of [[false,'http-lab',false],[true,'http-lab',false],[true,'https',false],[true,'https',true]]) {
      const values=structuredClone(base);values.busterNamespaceBroker.readyClient.enabled=enabled;values.control.productDecisions.enabled=enabled;values.runtimeInfrastructure.registry.transport=transport;values.runtimeInfrastructure.registry.endpoint=`${transport==='https'?'https':'http'}://registry.example`;values.runtimeInfrastructure.registry.authSecretName=transport==='https'?'registry-auth':'';
      if(ca) { values.runtimeInfrastructure.registry.caSecretName='registry-ca';values.runtimeInfrastructure.registry.nodeCaFile='/etc/registry-ca.crt'; }
      values.incoming={name:'buster-v2-runtime',image:'selected.example/runtime@sha256:'+ 'a'.repeat(64),command:['/actual/incoming'],env:[{name:'INCOMING_PRESERVED',value:'selected'}]};
      const valuesPath=path.join(directory,'witness-values.yaml');fs.writeFileSync(valuesPath,YAML.stringify(values));
      const result=spawnSync('helm',['template','custody',directory,'-f',valuesPath],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      const document=YAML.parse(result.stdout),containers=document.spec.containers;
      const names=containers.flatMap(container=>(container.env??[]).map(row=>row.name));names.forEach(name=>emitted.add(name));
      nativeResults.push({case:{enabled,transport,ca},args:['template','custody',directory,'-f',valuesPath],status:result.status,names,assertions:['source-acquired union','optional guard presence/absence','incoming env preserved','incoming command preserved','HTTPS auth-config named linkage'],stdoutSha256:crypto.createHash('sha256').update(result.stdout).digest('hex')});
      assert.ok(names.includes('INCOMING_PRESERVED'));assert.equal(containers[2].command[0],'/actual/incoming');
      assert.equal(names.includes('KUBECLAW_DEMO_READY_ENDPOINT'),enabled);assert.equal(names.includes('PRISM_PRODUCT_ISSUER'),enabled);
      assert.equal(names.includes('KUBECLAW_REGISTRY_USERNAME'),transport==='https');assert.equal(names.includes('NODE_EXTRA_CA_CERTS'),ca);
      if(transport==='https') {
        const config=JSON.parse(containers[2].env.find(row=>row.name==='KUBECLAW_REGISTRY_CONFIG').value);
        assert.equal(config.registry.auth.usernameEnvironmentVariable,'KUBECLAW_REGISTRY_USERNAME');
      }
    }
    const projected=['charts/kubeclaw/templates/deployment.yaml','charts/prism/templates/workloads.yaml'].flatMap(file=>helmEnvironmentHelperProjectionPlans({file,text:fs.readFileSync(path.join(root,file),'utf8'),sourceRoot:root}).flatMap(plan=>plan.projections.map(row=>row.name)));
    assert.deepEqual([...emitted].filter(name=>name!=='INCOMING_PRESERVED').sort(),projected.sort());
    // A native duplicate rejection is not silently interpreted as concatenation.
    const duplicate=structuredClone(base);duplicate.incoming={name:'buster-v2-runtime',image:'selected',env:[{name:'KUBECLAW_REGISTRY_CONFIG',value:'override'}]};
    const valuesPath=path.join(directory,'duplicate-values.yaml');fs.writeFileSync(valuesPath,YAML.stringify(duplicate));
    const rejected=spawnSync('helm',['template','custody',directory,'-f',valuesPath],{encoding:'utf8'});
    assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/duplicates the shared registry contract/);
    nativeResults.push({case:'duplicate',args:['template','custody',directory,'-f',valuesPath],status:rejected.status,assertion:'duplicate shared env rejected',stderr:rejected.stderr});
    for(const [mutation,expected] of [
      [values=>{values.busterNamespaceBroker.readyClient.enabled=true;values.agentRole='prism';},/requires the actual Nova release ServiceAccount/],
      [values=>{values.busterNamespaceBroker.readyClient.enabled=true;values.busterNamespaceBroker.readyClient.endpoint='http:\/\/ready.example';},/explicit HTTPS controller endpoint/],
      [values=>{values.control.productDecisions.enabled=true;values.tailscale.enabled=false;},/authenticated Tailscale Studio ingress/],
      [values=>{values.control.productDecisions.enabled=true;values.control.productDecisions.signingSecretName='runtime';},/separate Secret/],
      [values=>{values.control.productDecisions.enabled=true;values.control.productDecisions.operators=[' whitespace '];},/no surrounding whitespace/],
      [values=>{values.runtimeInfrastructure.registry.authSecretName='forbidden';},/HTTP lab registry cannot send credentials/],
      [values=>{values.runtimeInfrastructure.registry.caSecretName='ca';},/requires both caSecretName and nodeCaFile/],
    ]) {
      const invalid=structuredClone(base);invalid.incoming={name:'buster-v2-runtime',image:'selected',env:[]};mutation(invalid);
      fs.writeFileSync(valuesPath,YAML.stringify(invalid));
      const result=spawnSync('helm',['template','custody',directory,'-f',valuesPath],{encoding:'utf8'});
      assert.notEqual(result.status,0);assert.match(result.stderr,expected);
      nativeResults.push({case:'invalid authority',args:['template','custody',directory,'-f',valuesPath],status:result.status,assertion:expected.source,stderr:result.stderr});
    }
    const selectedSources=['charts/kubeclaw/templates/_demo-ready-client.tpl','charts/kubeclaw/templates/_registry-clients.tpl','charts/prism/templates/_product-decisions.tpl','charts/kubeclaw/templates/deployment.yaml','charts/prism/templates/workloads.yaml'];
    t.diagnostic(JSON.stringify({nativeHelmHelperWitness:{binary:nativeBinary,sources:selectedSources.map(file=>({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),witnessTemplateSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(templates,'witness.yaml'))).digest('hex'),results:nativeResults}}));
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});


test('all three validator dependencies bind unconditional execution scope and registry cannot skip physical validation', () => {
  const registryFile='charts/kubeclaw/templates/deployment.yaml',registryText=fs.readFileSync(path.join(root,registryFile),'utf8');
  const block=/\{\{-?\s*\$registryWorkers := 0\s*\}\}[\s\S]*?\{\{-?\s*fail "Buster registry configuration requires exactly one extraContainers entry named buster-v2-runtime"\s*\}\}\s*\{\{-?\s*end\s*\}\}/u.exec(registryText);
  assert.ok(block);
  const plans=helmEnvironmentHelperProjectionPlans({file:registryFile,text:registryText,sourceRoot:root});
  const registry=plans.find(plan=>plan.registry);
  assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:registryFile,text:registryText.replace(block[0],`{{/* ${block[0]} */}}`),sourceRoot:root}),/lacks one unambiguous actual exact-one-worker validation/);
  assert.deepEqual(registry.helperProjection.dependencies[0].callerValidation.execution.guards,[]);
  for(const opening of ['if false','if true','range .Values.extraContainers','with .Values.extraContainers']) {
    const changed=registryText.replace(block[0],`{{- ${opening} }}\n${block[0]}\n{{- end }}`);
    assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:registryFile,text:changed,sourceRoot:root}),/registry exact-one-worker validator execution must be unconditional at caller root/);
  }
  const prismFile='charts/prism/templates/workloads.yaml',prismText=fs.readFileSync(path.join(root,prismFile),'utf8');
  for(const opening of ['if false','range .Values.control.productDecisions.operators','with .Values.control']) {
    const changed=prismText.replace('{{- include "prism.productDecisions.validate" . }}',`{{- ${opening} }}\n{{- include "prism.productDecisions.validate" . }}\n{{- end }}`);
    assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:prismFile,text:changed,sourceRoot:root}),/validation must be an unconditional root invocation|validator execution must be unconditional/);
  }
  const bound=helmEnvironmentHelperProjectionPlans({file:registryFile,text:registryText.replace(block[0],`{{- $custodyMarker := .Values.agentRole }}\n${block[0]}`),sourceRoot:root}).find(plan=>plan.registry);
  assert.notDeepEqual(bound.helperProjection.dependencies[0].callerValidation.execution,registry.helperProjection.dependencies[0].callerValidation.execution);
  const ended=helmEnvironmentHelperProjectionPlans({file:registryFile,text:registryText.replace(block[0],`{{- if false }}{{- $closedScope := .Values.agentRole }}{{- end }}\n${block[0]}`),sourceRoot:root}).find(plan=>plan.registry);
  assert.deepEqual(ended.helperProjection.dependencies[0].callerValidation.execution,registry.helperProjection.dependencies[0].callerValidation.execution);
});

test('complete executable chart namespace rejects competing YAML/NOTES/arbitrary/nested/block definitions and stale additions', () => {
  const directory=fs.mkdtempSync(path.join('/tmp','helm-namespace-custody-'));
  try {
    for(const chart of ['kubeclaw','prism']) fs.cpSync(path.join(root,'charts',chart),path.join(directory,'charts',chart),{recursive:true});
    for(const [chart,helper] of [['kubeclaw','kubeclaw.demoReadyClientEnv'],['kubeclaw','kubeclaw.demoReadyClientValidate'],['kubeclaw','kubeclaw.registryContainer'],['prism','prism.productDecisions.env'],['prism','prism.productDecisions.validate']]) {
      const file=`charts/${chart}/templates/${chart==='prism'?'workloads':'deployment'}.yaml`,text=fs.readFileSync(path.join(root,file),'utf8');
      const probe=()=>helmEnvironmentHelperProjectionPlans({file,text,sourceRoot:directory});
      const baseline=probe();assert.ok(baseline.length>0);
      for(const suffix of ['shadow.yaml','NOTES.txt','_shadow.any','nested/shadow.yamlless']) {
        const shadow=path.join(directory,'charts',chart,'templates',suffix);fs.mkdirSync(path.dirname(shadow),{recursive:true});
        fs.writeFileSync(shadow,`{{- define "${helper}" -}}shadow{{- end -}}\n`);
        assert.throws(probe,error=>error.message.includes('ambiguous named-template')&&error.message.includes(helper)&&error.message.includes(suffix));
        fs.rmSync(shadow);assert.ok(probe().length>0);
      }
      const shadow=path.join(directory,'charts',chart,'templates','shadow.yaml');
      fs.writeFileSync(shadow,`{{- define \`${helper}\` -}}shadow{{- end -}}\n`);assert.throws(probe,/ambiguous named-template/);fs.rmSync(shadow);
      fs.writeFileSync(shadow,`{{- block "${helper}" . -}}shadow{{- end -}}\n`);assert.throws(probe,/ambiguous named-template|unsupported block namespace contribution/);fs.rmSync(shadow);
      // The selected input text itself participates in the namespace, not just
      // its unmodified checked-in sibling on disk.
      assert.throws(()=>helmEnvironmentHelperProjectionPlans({file,text:`${text}\n{{- define "${helper}" -}}shadow{{- end -}}`,sourceRoot:directory}),/ambiguous named-template/);
    }
    const file='charts/kubeclaw/templates/deployment.yaml',text=fs.readFileSync(path.join(root,file),'utf8');
    const probe=()=>helmEnvironmentHelperProjectionPlans({file,text,sourceRoot:directory});
    const shadow=path.join(directory,'charts/kubeclaw/templates/shadow.yaml');
    fs.writeFileSync(shadow,`{{/* {{ define "kubeclaw.demoReadyClientEnv" }}passive{{ end }} */}}\n{{ printf "%s" ${JSON.stringify('{{ define "kubeclaw.registryContainer" }}')} }}\n`);
    assert.ok(probe().length>0);fs.rmSync(shadow);
    fs.writeFileSync(shadow,'{{- define "kubeclaw\\u002eregistryContainer" -}}shadow{{- end -}}\n');assert.throws(probe,/ambiguous named-template/);fs.rmSync(shadow);
    fs.writeFileSync(shadow,'{{- block "new.unqualified" . -}}selected{{- end -}}\n');assert.throws(probe,/unsupported block namespace contribution/);fs.rmSync(shadow);
    fs.writeFileSync(shadow,'{{- define .Values.dynamicName -}}selected{{- end -}}\n');assert.throws(probe,/unsupported named-template definition or block selector/);fs.rmSync(shadow);
    fs.writeFileSync(shadow,'{{ tpl .Values.dynamicTemplates . }}\n');assert.throws(probe,/dynamic tpl namespace compilation/);fs.rmSync(shadow);
    fs.writeFileSync(shadow,'{{- if false }}{{- define "unreviewed.env" -}}selected{{- end -}}{{- end }}\n');assert.throws(probe,/named-template declaration in enclosing execution scope unsupported/);fs.rmSync(shadow);
    fs.writeFileSync(shadow,'{{- define "unreviewed.env" -}}{{- define "nested.env" -}}selected{{- end -}}{{- end -}}\n');assert.throws(probe,/nested named-template namespace contribution unsupported/);fs.rmSync(shadow);
    const hidden=path.join(directory,'charts/kubeclaw/templates/.hidden.yaml');fs.writeFileSync(hidden,'{{- define "kubeclaw.registryContainer" -}}shadow{{- end -}}\n');assert.throws(probe,/hidden template loader exclusion\/execution/);fs.rmSync(hidden);
    for(const [relative,bytes,error] of [['.helmignore','templates/shadow.yaml\n',/ignore\/dependency policy/],['Chart.lock','dependencies: []\n',/ignore\/dependency policy/],['charts/new.tgz','unqualified archive',/subchart\/package template namespace/]]) {
      const added=path.join(directory,'charts/kubeclaw',relative);fs.mkdirSync(path.dirname(added),{recursive:true});fs.writeFileSync(added,bytes);assert.throws(probe,error);fs.rmSync(added);
    }
    const metadata=path.join(directory,'charts/kubeclaw/Chart.yaml'),original=fs.readFileSync(metadata,'utf8');fs.writeFileSync(metadata,original+'\ndependencies: [{name: unqualified, version: "1.0.0", repository: "file://../unqualified"}]\n');assert.throws(probe,/subchart dependency template namespace/);
    fs.writeFileSync(metadata,original.replace('type: application','type: library'));assert.throws(probe,/chart identity or execution type/);
    fs.writeFileSync(metadata,original.replace('type: application\n',''));assert.equal(probe()[0].helperProjection.namespace.dependencyAuthority.chartIdentity.type,null);
    fs.writeFileSync(metadata,original);
    const other=path.join(directory,'charts/kubeclaw/templates/secret.yaml'),otherOriginal=fs.readFileSync(other,'utf8'),beforeExecution=probe()[0].helperProjection.namespace.rootExecution;
    fs.writeFileSync(other,'{{- $_ := set .Values \"agentRole\" \"changed\" }}\n'+otherOriginal);assert.notDeepEqual(probe()[0].helperProjection.namespace.rootExecution,beforeExecution);fs.writeFileSync(other,otherOriginal);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('native Helm witnesses skipped registry validation and executable definitions across suffixes', t => {
  const directory=fs.mkdtempSync(path.join('/tmp','helm-execution-namespace-native-'));
  try {
    const templates=path.join(directory,'templates');fs.mkdirSync(templates);
    fs.writeFileSync(path.join(directory,'Chart.yaml'),'apiVersion: v2\nname: execution-namespace-witness\nversion: 0.1.0\ntype: application\n');
    const helperFile='charts/kubeclaw/templates/_registry-clients.tpl',callerFile='charts/kubeclaw/templates/deployment.yaml';
    const helper=fs.readFileSync(path.join(root,helperFile),'utf8'),caller=fs.readFileSync(path.join(root,callerFile),'utf8');
    fs.writeFileSync(path.join(templates,'_registry-clients.tpl'),helper);
    const block=/\{\{-?\s*\$registryWorkers := 0\s*\}\}[\s\S]*?\{\{-?\s*fail "Buster registry configuration requires exactly one extraContainers entry named buster-v2-runtime"\s*\}\}\s*\{\{-?\s*end\s*\}\}/u.exec(caller);
    assert.ok(block);
    const loopsStart=caller.indexOf('{{- range .Values.extraContainers }}',block.index+block[0].length),loopsEnd=caller.indexOf('{{- if .Values.workerTrust.spiffe.enabled }}',loopsStart);
    const selectedLoop=caller.slice(loopsStart,loopsEnd).trimEnd();
    const values={agentRole:'buster',extraContainers:[{name:'buster-v2-runtime',image:'selected',env:[{name:'INCOMING',value:'preserved'}]},{name:'buster-v2-runtime',image:'selected',env:[]}],runtimeInfrastructure:{registry:{endpoint:'http://registry.example',transport:'http-lab',authSecretName:'',usernameKey:'username',passwordKey:'password',caSecretName:'',nodeCaFile:''},dockerHubMirror:{endpoint:'',transport:'',caSecretName:'',nodeCaFile:''},localRegistry:null}};
    const valuesPath=path.join(directory,'values.yaml');fs.writeFileSync(valuesPath,YAML.stringify(values));
    const witness=validation=>`${validation}\napiVersion: v1\nkind: Pod\nmetadata: {name: witness}\nspec:\n      containers:\n        ${selectedLoop}\n`;
    const command=['template','custody',directory,'-f',valuesPath],results=[];
    fs.writeFileSync(path.join(templates,'witness.yaml'),witness(block[0]));
    const enforced=spawnSync('helm',command,{encoding:'utf8'});assert.notEqual(enforced.status,0);assert.match(enforced.stderr,/requires exactly one extraContainers entry/);
    results.push({case:'actual selected validator enforced',args:command,status:enforced.status,assertion:'duplicate worker count rejected',stderr:enforced.stderr});
    fs.writeFileSync(path.join(templates,'witness.yaml'),witness(`{{- if false }}\n${block[0]}\n{{- end }}`));
    const skipped=spawnSync('helm',command,{encoding:'utf8'});assert.equal(skipped.status,0,skipped.stderr);assert.equal(YAML.parse(skipped.stdout).spec.containers.length,2);
    results.push({case:'physical selected validator wrapped if false',args:command,status:skipped.status,assertion:'native validator skipped; actual2containers emitted',stdoutSha256:crypto.createHash('sha256').update(skipped.stdout).digest('hex')});
    assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:callerFile,text:caller.replace(block[0],`{{- if false }}\n${block[0]}\n{{- end }}`),sourceRoot:root}),/registry exact-one-worker validator execution must be unconditional/);
    values.extraContainers.pop();fs.writeFileSync(valuesPath,YAML.stringify(values));fs.writeFileSync(path.join(templates,'witness.yaml'),witness(block[0]));
    for(const suffix of ['shadow.yaml','NOTES.txt','_shadow.custom','nested/shadow.noextension','_shadow-block.custom']) {
      const shadow=path.join(templates,suffix);fs.mkdirSync(path.dirname(shadow),{recursive:true});
      const declaration=suffix.includes('block')?'block "kubeclaw.registryContainer" .':'define "kubeclaw.registryContainer"';
      fs.writeFileSync(shadow,`{{- ${declaration} -}}name: buster-v2-runtime\nimage: shadow\nenv:\n  - name: SHADOW_EFFECT\n    value: selected\n{{- end -}}\n`);
      const result=spawnSync('helm',command,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
      const names=YAML.parse(result.stdout).spec.containers[0].env.map(row=>row.name);assert.ok(names.includes('KUBECLAW_REGISTRY_CONFIG')||names.includes('SHADOW_EFFECT'));
      results.push({case:`executable namespace contribution ${suffix}`,args:command,status:result.status,assertion:'native named definition/block accepted independently of suffix; namespace competition must be rejected without choosing load order',names,stdoutSha256:crypto.createHash('sha256').update(result.stdout).digest('hex')});
      fs.rmSync(shadow);
    }
    const helmPath=spawnSync('/bin/sh',['-c','command -v helm'],{encoding:'utf8'}).stdout.trim();
    t.diagnostic(JSON.stringify({nativeHelmExecutionNamespaceWitness:{binary:{path:helmPath,realpath:fs.realpathSync(helmPath),sha256:crypto.createHash('sha256').update(fs.readFileSync(fs.realpathSync(helmPath))).digest('hex'),version:spawnSync('helm',['version','--short'],{encoding:'utf8'}).stdout.trim()},sources:[helperFile,callerFile].map(file=>({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),selectedValidatorSourceSha256:crypto.createHash('sha256').update(block[0]).digest('hex'),selectedLoopSourceSha256:crypto.createHash('sha256').update(selectedLoop).digest('hex'),results}}));
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});


test('passive Go strings and comments cannot supply helper invocation or validator custody', () => {
  const file='charts/kubeclaw/templates/deployment.yaml';
  const passive=`metadata:\n  annotations:\n    message: {{ printf "%s" ${JSON.stringify('{{ include "kubeclaw.demoReadyClientEnv" . }}')} }}\n`;
  assert.deepEqual(helmEnvironmentHelperProjectionPlans({file,text:passive,sourceRoot:root}),[]);
  const actual=fs.readFileSync(path.join(root,file),'utf8');
  assert.throws(()=>helmEnvironmentHelperProjectionPlans({file,text:actual.replace('include \"kubeclaw.demoReadyClientEnv\" . | nindent 12','(include .Values.dynamicEnvHelper .) | nindent 12'),sourceRoot:root}),/unknown\/unqualified helper selector <dynamic> in actual environment\/container purpose/);
  assert.deepEqual(helmEnvironmentHelperProjectionPlans({file,text:'{{/* {{ include "kubeclaw.demoReadyClientEnv" . }} */}}\n',sourceRoot:root}),[]);
  const prism='charts/prism/templates/workloads.yaml',text=fs.readFileSync(path.join(root,prism),'utf8');
  const selected='{{- include "prism.productDecisions.validate" . }}';
  const fake=`{{ printf "%s" ${JSON.stringify(selected)} }}`;
  assert.throws(()=>helmEnvironmentHelperProjectionPlans({file:prism,text:text.replace(selected,fake),sourceRoot:root}),/exactly one actual preceding root validation invocation/);
});

test('native Node identifier-shaped literal environment names preserve lowercase mixedcase and underscore across all finite reads', t => {
  const expected=['npm_execpath','MixedCase_Key','_underscoreCase'];
  const values=['native-lowercase','native-MixedCase','native-underscore'];
  const cases=[
    ['direct','const result=[process.env.npm_execpath,process.env.MixedCase_Key,process.env._underscoreCase];'],
    ['literal computed','const result=[process.env["npm_execpath"],process.env[`MixedCase_Key`],process.env["_underscoreCase"]];'],
    ['constant computed','const lower=`npm_execpath`,mixed="MixedCase_Key",under="_underscoreCase";const result=[process.env[lower],process.env[mixed],process.env[under]];'],
    ['destructuring','const {npm_execpath:lower,MixedCase_Key:mixed,_underscoreCase:under}=process.env;const result=[lower,mixed,under];'],
    ['computed destructuring','const key="npm_execpath";const {[key]:lower,["MixedCase_Key"]:mixed,[`_underscoreCase`]:under}=process.env;const result=[lower,mixed,under];'],
    ['constant helper','function read(env,key){return env[key];}const env=process.env;const lower="npm_execpath",mixed=`MixedCase_Key`,under="_underscoreCase";const result=[read(env,lower),read(env,mixed),read(env,under)];'],
    ['literal immutable loop','const keys=Object.freeze(["npm_execpath","MixedCase_Key","_underscoreCase"]);const result=[];for(const key of keys)result.push(process.env[key]);'],
  ];
  const nativeResults=[];
  for(const [mode,code] of cases) {
    const facts=Array.from(sandbox.nodeEnvironmentReads('scripts/node-case-literal.mjs',code));
    assert.deepEqual(facts.map(row=>row.name),expected);
    for(const row of facts) assert.equal(code.slice(row.index).length>0,true);
    const result=spawnSync(process.execPath,['-e',`${code}\nprocess.stdout.write(JSON.stringify(result));`],{encoding:'utf8',env:{...process.env,npm_execpath:values[0],MixedCase_Key:values[1],_underscoreCase:values[2],NPM_EXECPATH:'wrong-uppercase',MIXEDCASE_KEY:'wrong-uppercase',_UNDERSCORECASE:'wrong-uppercase'}});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),values);
    nativeResults.push({mode,source:code,sourceSha256:crypto.createHash('sha256').update(code).digest('hex'),args:['-e',`${code}\nprocess.stdout.write(JSON.stringify(result));`],status:result.status,names:facts.map(row=>row.name),nativeValues:JSON.parse(result.stdout),assertions:['literal spelling exact','distinct uppercase keys not substituted','actual native reads return exact-case values']});
  }
  const binary=fs.realpathSync(process.execPath);
  t.diagnostic(JSON.stringify({nativeNodeEnvironmentCaseWitness:{binary:{path:process.execPath,realpath:binary,sha256:crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),version:process.version,platform:process.platform},results:nativeResults}}));
});

test('Deno explicit literal and constant getters preserve case without dynamic-key exemptions', () => {
  const code='const key="MixedCase_Key";Deno.env.get("npm_execpath");Deno.env.get(key);Deno.env.get(`_underscoreCase`);';
  const facts=Array.from(sandbox.nodeEnvironmentReads('scripts/deno-case-literal.ts',code));
  assert.deepEqual(facts.map(row=>row.name),['npm_execpath','MixedCase_Key','_underscoreCase']);assert.ok(facts.every(row=>row.kind==='deno-env'));
  for(const bad of ['Deno.env.get(process.argv[2]);','Deno.env.get("bad-name");','Deno.env.get("");','Deno.env.get("MixedCase_Key","fallback");','let key="MixedCase_Key";key="other";Deno.env.get(key);']) {
    assert.throws(()=>sandbox.nodeEnvironmentReads('scripts/deno-case-reject.ts',bad),/NODE_ENVIRONMENT_UNSUPPORTED: scripts\/deno-case-reject.ts:1:/);
  }
});

test('finite Node names reject unsupported spelling and selected dynamic helper/destructuring keys source-specifically', () => {
  for(const bad of [
    'process.env["bad-name"];','const key="bad.name";process.env[key];','process.env[""];',
    'const key=process.argv[2];process.env[key];','const {[process.argv[2]]:value}=process.env;',
    'function read(env,key){return env[key];}read(process.env,process.argv[2]);',
    'function read(env,key){return env[key];}read(process.env);',
    'let key="npm_execpath";key="MixedCase_Key";const {[key]:value}=process.env;',
    'const {...rest}=process.env;',
  ]) assert.throws(()=>sandbox.nodeEnvironmentReads('scripts/node-case-reject.mjs',bad),/NODE_ENVIRONMENT_UNSUPPORTED: scripts\/node-case-reject.mjs:1:/);
  assert.deepEqual(Array.from(sandbox.nodeEnvironmentReads('scripts/pure-case-helper.mjs','function read(env,key){return env[key];}const key=unknown;read({ordinary:"data"},key);')),[]);
  const file='charts/case-literal-producer.yaml',producer='spec:\n  containers:\n    - name: actual\n      env: [{name: lower.case-name, value: selected}]\n';
  assert.deepEqual(Array.from(sandbox.environmentProducerOccurrences(file,producer),row=>row.name),['lower.case-name']);
});

test('actual documentation role custody npm caller selector remains an acquired exact-case reader', () => {
  const file='scripts/docs-api-documentation-role-custody.mjs',bytes=fs.readFileSync(path.join(root,file),'utf8');
  const facts=Array.from(sandbox.nodeEnvironmentReads(file,bytes));
  const selected=facts.filter(row=>row.name==='npm_execpath');assert.equal(selected.length,3);
  assert.ok(selected.every(row=>bytes.slice(row.index).startsWith('process.env.npm_execpath')));
  assert.ok(facts.some(row=>row.name==='PATH'));assert.ok(facts.some(row=>row.name==='NODE_OPTIONS'));
});

test('inventory admission regression: nested shell Node paths reject with actual source while data stays passive', () => {
  const shell = `sh -c 'node -e "console.log(process.env.NESTED_NODE_NEW)"'`;
  const native = spawnSync('/bin/sh', ['-c', shell], {encoding:'utf8', env:{...process.env,NESTED_NODE_NEW:'nested-observed'}});
  assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'nested-observed\n');
  assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/nested-node.sh', '\n'+shell), /NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/nested-node.sh:2: nested shell Node acquisition/);
  const yaml = YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command:['sh','-c',shell]}]}});
  const line = yaml.slice(0,yaml.indexOf('node -e')).split('\n').length;
  assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/nested.yaml',yaml), new RegExp(`NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts/nested.yaml:${line}: nested shell Node acquisition`));
  for (const body of [
    `printf '%s' '${shell.replaceAll("'", "'\\''")}'`,
    `cat <<'DATA'\n${shell}\nDATA\n`,
    `sh -c 'printf "%s" "node -e process.env.PASSIVE_NESTED"'`,
    `sh passive-script.sh -c '${shell.replaceAll("'", "'\\''")}'`,
  ]) assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-nested.sh',body)),[]);
  const direct = `node -e 'console.log(process.env.DIRECT_NODE_NEW)'`;
  assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/direct.sh',direct),row=>row.name),['DIRECT_NODE_NEW']);
});

test('inventory admission regression: selected external and inherited Node stdin never silently disappear', () => {
  const directory = fs.mkdtempSync('/tmp/node-stdin-admission-');
  try {
    const input = path.join(directory,'reader.txt');
    fs.writeFileSync(input,'console.log(process.env.STDIN_NODE_NEW)');
    for (const argv of ['node','node -']) {
      const shell = `${argv} < ${input}`;
      const native = spawnSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{...process.env,STDIN_NODE_NEW:'stdin-observed'}});
      assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'stdin-observed\n');
      for (const body of [shell,argv,`${argv} <<< 'console.log(1)'`,`${argv} 0<&3`])
        assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/stdin-node.sh',body), /NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/stdin-node.sh:1: unresolved Node stdin/);
    }
    for (const command of [['node'],['node','-']]) {
      const yaml=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command}]}});
      assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/stdin.yaml',yaml),/NODE_ENVIRONMENT_YAML_UNSUPPORTED: charts\/stdin.yaml:[0-9]+: unresolved Node stdin/);
    }
    assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-argv.sh',`node passive-script.mjs - < ${input}`)),[]);
    const heredoc = "node - <<'JS'\nconsole.log(process.env.SELECTED_STDIN_NEW)\nJS\n";
    assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/heredoc.sh',heredoc),row=>row.name),['SELECTED_STDIN_NEW']);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test('inventory admission regression: mixed quote expansion cannot acquire an incomplete inline program', () => {
  const shell = `node -e 'console.log(process.env.KNOWN_NODE_NEW);'"$BODY"`;
  const native=spawnSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{...process.env,KNOWN_NODE_NEW:'known-observed',EXTRA_NODE_NEW:'extra-observed',BODY:'console.log(process.env.EXTRA_NODE_NEW);'}});
  assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'known-observed\nextra-observed\n');
  for (const body of [shell,`node -e "console.log(process.env.KNOWN_NODE_NEW);$BODY"`,"node -e 'console.log(process.env.KNOWN_NODE_NEW);'`printf true`"])
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/mixed-node.sh',body),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/mixed-node.sh:1: expanded inline program/);
  for (const shell of [
    `node -e 'console.log(process.env.LITERAL_NODE_NEW); console.log("$BODY")'`,
    `node -e "console.log(process.env.LITERAL_NODE_NEW); console.log('\\$BODY')"`,
    `node -e 'console.log(process.env.LITERAL_NODE_NEW);'"console.log('\\$BODY')"`,
  ]) {
    const native=spawnSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{...process.env,LITERAL_NODE_NEW:'literal-observed',BODY:'not-literal'}});
    assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'literal-observed\n$BODY\n');
    assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/literal-node.sh',shell),row=>row.name),['LITERAL_NODE_NEW']);
  }
});

test('inventory admission regression: final grouped sensitivity retains actual helper Secret provenance in either order', () => {
  // Execute the exact production grouping statements, not the publication
  // entrypoint or an imitation of its sensitivity classification.
  const build = declaration('buildRuntimeInputInventory');
  const start = build.indexOf('  const groupedEnvironment = new Map();');
  const end = build.indexOf('  for (const entry of groupedEnvironment.values())');
  assert.ok(start >= 0 && end > start);
  const grouping = vm.runInContext(`(environment) => {\n${build.slice(start,end)}\nreturn [...groupedEnvironment.values()];\n}`,sandbox);
  const file='charts/kubeclaw/templates/deployment.yaml';
  const credentials=Array.from(sandbox.environmentProducerOccurrences(file,fs.readFileSync(path.join(root,file),'utf8')))
    .filter(row=>['KUBECLAW_REGISTRY_USERNAME','KUBECLAW_REGISTRY_PASSWORD'].includes(row.name));
  assert.equal(credentials.length,2); assert.ok(credentials.every(row=>row.secretProvenance));
  const publicRows=['PGUSER','REDIS_USERNAME','PUBLIC_USERNAME'].map(name=>({name,path:'scripts/public.sh',line:1,kind:'node-process-env'}));
  const laterPublic=credentials.map(row=>({name:row.name,path:'scripts/public.sh',line:2,kind:'node-process-env'}));
  for(const occurrences of [[...credentials,...laterPublic,...publicRows],[...laterPublic,...publicRows,...credentials]]) {
    const grouped=grouping(occurrences);
    for(const credential of credentials) {
      const row=grouped.find(row=>row.name===credential.name);
      assert.equal(row.sensitivityClass,'secret-value'); assert.equal(row.sensitive,true);
      assert.ok(row.sensitivityReasons.includes('Kubernetes valueFrom/secretKeyRef provenance'));
    }
    for(const ordinary of publicRows) {
      const row=grouped.find(row=>row.name===ordinary.name);
      assert.equal(row.sensitivityClass,'identity-reference'); assert.equal(row.sensitive,false);
    }
  }
});

test('residual inventory regression: option-bearing selected shell programs reject without promoting script arguments', () => {
  for (const argv of [['sh','-o','errexit','-c'],['bash','--noprofile','-c']]) {
    const program='node -e "console.log(process.env.OPTION_NODE_NEW)"';
    const native=spawnSync(argv[0],[...argv.slice(1),program],{encoding:'utf8',env:{...process.env,OPTION_NODE_NEW:'option-observed'}});
    assert.equal(native.status,0,native.stderr); assert.equal(native.stdout,'option-observed\n');
    const shell=`${argv.join(' ')} '${program}'`;
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/options.sh','\n'+shell),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/options.sh:2: unresolved nested shell argv mode/);
    const yaml=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command:[...argv,program]}]}},{lineWidth:0});
    const line=yaml.slice(0,yaml.indexOf(`- ${argv[0]}\n`)).split('\n').length;
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/options.yaml',yaml),new RegExp(`NODE_ENVIRONMENT_YAML_UNSUPPORTED: charts/options.yaml:${line}: unresolved nested shell argv mode`));
    const nested=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command:['sh','-c',shell]}]}},{lineWidth:0});
    const nestedLine=nested.slice(0,nested.indexOf(`${argv[0]} `)).split('\n').length;
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/nested-options.yaml',nested),new RegExp(`NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts/nested-options.yaml:${nestedLine}: unresolved nested shell argv mode`));
    for(const body of [`${argv[0]} script.sh ${argv.slice(1).join(' ')} '${program}'`, `printf '%s' '${shell.replaceAll("'", "'\\''")}'`, `cat <<'DATA'\n${shell}\nDATA\n`])
      assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-options.sh',body)),[]);
    const passive=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command:[argv[0],'script.sh',...argv.slice(1),program]}]}},{lineWidth:0});
    assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('charts/passive-options.yaml',passive)),[]);
  }
});

test('residual inventory regression: decoded literal Node spelling owns stdin and nested shell custody', () => {
  const directory=fs.mkdtempSync('/tmp/node-decoded-custody-');
  try {
    const input=path.join(directory,'reader.txt');fs.writeFileSync(input,'console.log(process.env.DECODED_NODE_NEW)');
    for(const executable of ['n\\ode','no""de']) for(const suffix of ['', ' -']) {
      const selected=`${executable}${suffix} < ${input}`;
      const native=spawnSync('/bin/sh',['-c',selected],{encoding:'utf8',env:{...process.env,DECODED_NODE_NEW:'decoded-observed'}});
      assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'decoded-observed\n');
      for(const body of [selected,`${executable}${suffix}`])
        assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/decoded.sh','\n'+body),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/decoded.sh:2: unresolved Node stdin/);
      const nested=`sh -c '${selected}'`;
      assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/decoded-nested.sh','\n'+nested),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/decoded-nested.sh:2: nested shell Node acquisition/);
      for(const command of [['sh','-c',selected],['sh','-c',nested]]) {
        const yaml=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command}]}},{lineWidth:0});
        const line=yaml.slice(0,yaml.indexOf(executable)).split('\n').length;
        assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/decoded.yaml',yaml),new RegExp(`NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts/decoded.yaml:${line}: ${command[2]===selected?'unresolved Node stdin':'nested shell Node acquisition'}`));
      }
      const scalar=`command: '${selected}'\n`;
      assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/scalar.yaml',scalar),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts\/scalar.yaml:1: unresolved Node stdin/);
      for(const body of [`printf '%s' '${selected}'`, `# ${selected}\nprintf done\n`, `cat <<'DATA'\n${selected}\nDATA\n`, `${executable} script.mjs - < ${input}`,`sh script.sh -c '${selected}'`])
        assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-decoded.sh',body)),[]);
      const heredoc=`\n${executable}${suffix} <<'JS'\nconsole.log(process.env.DECODED_NODE_NEW)\nJS\n`;
      const facts=Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/decoded-heredoc.sh',heredoc));
      assert.deepEqual(facts.map(row=>row.name),['DECODED_NODE_NEW']);
      assert.equal(heredoc.slice(0,facts[0].index).split('\n').length,3);
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('selector inventory regression: mixed-case command selectors preserve execution and owning positions', t => {
  const program='console.log(process.env.SELECTOR_CASE_NEW)';
  const body=`node -e '${program}'`;
  const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;
  const results=[];
  for(const executable of ['sh','bash']) for(const flag of ['-Cec','-ecC']) {
    const native=spawnSync(executable,[flag,body],{encoding:'utf8',env:{...process.env,SELECTOR_CASE_NEW:'case-observed'}});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'case-observed\n');
    results.push({executable,argv:[flag,body],status:native.status,stdout:native.stdout});
    const shell=`${executable} ${flag} ${quote(body)}`;
    for(const selected of [shell,`sh -c ${quote(shell)}`])
      assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/selector-case.sh','\n'+selected),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/selector-case\.sh:2: nested shell Node acquisition/);
    const yaml=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command:[executable,flag,body]}]}},{lineWidth:0});
    const facts=Array.from(sandbox.acquiredNodeEnvironmentReads('charts/selector-case.yaml',yaml));
    assert.deepEqual(facts.map(row=>row.name),['SELECTOR_CASE_NEW']);
    assert.equal(yaml.slice(0,facts[0].index).split('\n').length,yaml.slice(0,yaml.indexOf('process.env')).split('\n').length);
    const nested=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command:['sh','-c',shell]}]}},{lineWidth:0});
    const line=nested.slice(0,nested.indexOf(`${executable} ${flag}`)).split('\n').length;
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/nested-selector.yaml',nested),new RegExp(`NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts/nested-selector.yaml:${line}: nested shell Node acquisition`));
    const scalar=YAML.stringify({command:shell},{lineWidth:0});
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/scalar-selector.yaml',scalar),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts\/scalar-selector\.yaml:1: nested shell Node acquisition/);
    for(const passive of [`printf '%s' ${quote(shell)}`,`# ${shell}\nprintf done\n`,`cat <<'DATA'\n${shell}\nDATA\n`])
      assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-selector.sh',passive)),[]);
  }
  t.diagnostic(JSON.stringify({nativeMixedCaseSelectorWitness:results}));
});

test('selector inventory regression: option prefixes and terminators keep definite script arguments passive', t => {
  const directory=fs.mkdtempSync('/tmp/pr13-selector-passive-');
  const program='node -e "console.log(process.env.PASSIVE_SELECTOR_NEW)"';
  const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;
  const cases=[['sh',['-o','errexit']],['bash',['--noprofile']],['sh',['-e']],['sh',['-C']],['sh',['-o','errexit','--']],['bash',['--noprofile','--']],['sh',['--']],['bash',['-O','extglob']]];
  const results=[];
  try {
    const script=path.join(directory,'passive.sh');fs.writeFileSync(script,'printf "script:%s\\n" "$1"\n');
    for(const [executable,prefix] of cases) {
      const argv=[...prefix,script,'-c',program];
      const native=spawnSync(executable,argv,{encoding:'utf8',env:{...process.env,PASSIVE_SELECTOR_NEW:'must-not-run'}});
      assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'script:-c\n');
      results.push({executable,argv,status:native.status,stdout:native.stdout});
      const shell=[executable,...argv].map(quote).join(' ');
      for(const body of [shell,`sh -c ${quote(shell)}`])
        assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-prefix.sh','\n'+body)),[]);
      for(const command of [[executable,...argv],['sh','-c',shell]]) {
        const yaml=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',command}]}},{lineWidth:0});
        assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('charts/passive-prefix.yaml',yaml)),[]);
      }
      const scalar=YAML.stringify({command:shell},{lineWidth:0});
      assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('charts/passive-prefix-scalar.yaml',scalar)),[]);
    }
    // After -- the token -c itself is a script filename, not a selector.
    for(const command of [['sh','-o','errexit','--','-c',program],['bash','--noprofile','--','-c',program]]) {
      assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/terminator.sh',command.map(quote).join(' '))),[]);
      const yaml=YAML.stringify({command},{lineWidth:0});
      assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('charts/terminator.yaml',yaml)),[]);
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
  t.diagnostic(JSON.stringify({nativePassivePrefixWitness:results}));
});

test('selector inventory regression: unsupported selected and ambiguous prefixes retain distinct fail-closed diagnostics', () => {
  const body='node -e "console.log(process.env.UNSUPPORTED_SELECTOR_NEW)"';
  for(const [prefix,reason] of [[['-Czc'],'unresolved nested shell argv mode'],[['-Z','-c'],'ambiguous shell option custody'],[['--unknown','script.sh','-c'],'ambiguous shell option custody']]) {
    const shell=`sh ${prefix.join(' ')} '${body}'`;
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/unsupported-selector.sh','\n'+shell),new RegExp(`NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts/unsupported-selector.sh:2: ${reason}`));
    const yaml=YAML.stringify({command:['sh',...prefix,body]},{lineWidth:0});
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/unsupported-selector.yaml',yaml),new RegExp(`NODE_ENVIRONMENT_YAML_UNSUPPORTED: charts/unsupported-selector.yaml:2: ${reason}`));
  }
});

test('post-selector inventory regression: native options retain selected body and coverage cannot silently pass', t => {
  const body='node -e "console.log(process.env.POST_SELECTOR_NEW)"';
  const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;
  const results=[];
  const previousRead=sandbox.read, previousSources=sandbox.runtimeTextSources;
  try {
    for(const executable of ['sh','bash']) for(const flag of ['-c','-ec','-Cec']) for(const suffix of [['-e'],['-C'],['--'],['-e','-C','--']]) {
      const argv=[flag,...suffix,body];
      const native=spawnSync(executable,argv,{encoding:'utf8',timeout:3000,env:{...process.env,POST_SELECTOR_NEW:'post-selected'}});
      assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'post-selected\n');assert.equal(native.stderr,'');
      results.push({executable,argv,status:native.status,stdout:native.stdout});
      const shell=[executable,...argv].map(quote).join(' ');
      for(const selected of [shell,`sh -c ${quote(shell)}`]) {
        const file='scripts/post-selector.sh',text='\n'+selected;
        const reason=/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/post-selector\.sh:2: nested shell Node acquisition/;
        assert.throws(()=>sandbox.acquiredNodeEnvironmentReads(file,text),reason);
        assert.throws(()=>sandbox.environmentOccurrences(file,text),reason);
        sandbox.runtimeTextSources=()=>[file];sandbox.read=()=>text;
        assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),reason);
      }
      // Both a single command array and command/args concatenation own the
      // real body. Reader position and downstream coverage must agree.
      for(const invocation of [{command:[executable,...argv]},{command:[executable,flag],args:[...suffix,body]}]) {
        const file='charts/post-selector.yaml';
        const text=YAML.stringify({kind:'Pod',spec:{containers:[{name:'fixture',...invocation}]}},{lineWidth:0});
        const facts=Array.from(sandbox.acquiredNodeEnvironmentReads(file,text));
        assert.deepEqual(facts.map(row=>row.name),['POST_SELECTOR_NEW']);
        assert.ok(text.slice(facts[0].index).startsWith('process.env.POST_SELECTOR_NEW'));
        const occurrences=Array.from(sandbox.environmentOccurrences(file,text));
        assert.deepEqual(occurrences.map(row=>row.name),['POST_SELECTOR_NEW']);
        assert.equal(occurrences[0].line,text.slice(0,facts[0].index).split('\n').length);
        sandbox.runtimeTextSources=()=>[file];sandbox.read=()=>text;
        assert.throws(()=>sandbox.verifyEnvironmentConsumerCoverage(),/POST_SELECTOR_NEW:charts\/post-selector.yaml/);
      }
      const nested=YAML.stringify({command:['sh','-c',shell]},{lineWidth:0});
      const line=nested.slice(0,nested.indexOf(shell)).split('\n').length;
      assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/post-nested.yaml',nested),new RegExp(`NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts/post-nested.yaml:${line}: nested shell Node acquisition`));
      const scalar=YAML.stringify({command:shell},{lineWidth:0});
      assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/post-scalar.yaml',scalar),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: charts\/post-scalar.yaml:1: nested shell Node acquisition/);
      for(const passive of [`printf '%s' ${quote(shell)}`,`# ${shell}\nprintf done\n`,`cat <<'DATA'\n${shell}\nDATA\n`])
        assert.deepEqual(Array.from(sandbox.acquiredNodeEnvironmentReads('scripts/passive-post-selector.sh',passive)),[]);
    }
  } finally {sandbox.read=previousRead;sandbox.runtimeTextSources=previousSources;}
  t.diagnostic(JSON.stringify({nativePostSelectorWitness:results}));
});

test('post-selector inventory regression: unsupported options and missing operands reject with owning position', () => {
  const body='node -e "console.log(process.env.UNSUPPORTED_POST_SELECTOR_NEW)"';
  const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;
  for(const suffix of [['-o','errexit'],['-O','extglob'],['--rcfile','-c'],['--noprofile'],['+e'],['--unknown'],['-Z']]) {
    const argv=['sh','-c',...suffix,body];
    const shell=argv.map(quote).join(' ');
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/post-unsupported.sh','\n'+shell),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/post-unsupported\.sh:2: unresolved nested shell argv mode/);
    const yaml=YAML.stringify({command:argv},{lineWidth:0});
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/post-unsupported.yaml',yaml),/NODE_ENVIRONMENT_YAML_UNSUPPORTED: charts\/post-unsupported\.yaml:2: unresolved nested shell argv mode/);
  }
  for(const suffix of [[],['-e'],['--'],['-C','--']]) {
    const argv=['sh','-c',...suffix];
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('scripts/post-missing.sh','\n'+argv.join(' ')),/NODE_ENVIRONMENT_SHELL_UNSUPPORTED: scripts\/post-missing\.sh:2: missing selected shell program/);
    assert.throws(()=>sandbox.acquiredNodeEnvironmentReads('charts/post-missing.yaml',YAML.stringify({command:argv},{lineWidth:0})),/NODE_ENVIRONMENT_YAML_UNSUPPORTED: charts\/post-missing\.yaml:2: missing selected shell program/);
  }
  assert.throws(()=>sandbox.nodeShellArgvSelection(['sh','-c','-o'],0,'owning:2'),/owning:2: unresolved nested shell argv mode/);
  // The operand of a recognized option is not itself another selector.
  assert.equal(sandbox.nodeShellArgvSelection(['sh','--rcfile','-c','script.sh',body],0,'owning:2'),null);
  for(const argv of [['sh','--','-c','-e',body],['sh','-e','--','-c',body]])
    assert.equal(sandbox.nodeShellArgvSelection(argv,0,'owning:2'),null);
});
