import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';

const source = 'scripts/versions.mjs';
const authorityPath = 'scripts/docs-api-versions-map-output-authority.json';
const authoritySha256 = 'd29fad9dcecad5c4883092514292fd1bbc73860a56d06f09785cde85e65c5769';
// Current package identity only; the captured producer output stays historical.
const currentPackageBinding20261031 = Object.freeze({"path":"package.json","sha256":"0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef","bytes":54287,"historicalSha256":"4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3","historicalBytes":53756});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipts = new WeakSet();
const descriptor = role => Object.fromEntries(['line', 'sink', 'expression', 'sinkContract', 'role'].map(key => [key, role[key] ?? null]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};

// Original pure Map DATA, not execution of versions.mjs or syncVersions. Every
// check runs before the receiving inventories' cache and mutable role fallback.
export function checkedVersionsMapOutputs(root, graph, classify, sources) {
  if (!sources.includes(source)) return null;
  const fail = detail => assert.fail(`API_PRODUCT_VERSIONS_MAP_OUTPUT_UNQUALIFIED: ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical root');
  const read = relative => {
    if (typeof relative !== 'string' || path.posix.isAbsolute(relative) || relative.includes('\\')
      || path.posix.normalize(relative) !== relative || relative.split('/').some(x => x === '..' || x === '.')) fail('relative input');
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) fail(`regular input ${relative}`);
    return fs.readFileSync(absolute);
  };
  const raw = read(authorityPath);
  if (hash(raw) !== authoritySha256) fail('immutable original observation');
  const authority = JSON.parse(raw), buffers = new Map();
  if (authority.schemaVersion !== 'versions-map-original-output-profile.v1' || authority.source !== source) fail('owner');
  const binding = currentPackageBinding20261031;
  const historicalPackage = authority.inputs.filter(input => input.path === 'package.json');
  if (!binding || binding.path !== 'package.json'
    || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(['bytes','historicalBytes','historicalSha256','path','sha256'])
    || historicalPackage.length !== 1 || historicalPackage[0].sha256 !== binding.historicalSha256
    || historicalPackage[0].bytes !== binding.historicalBytes) fail('explicit current package binding');
  const currentPackageBindingDigest = hash(JSON.stringify(binding));
  const currentInputDigest = hash(JSON.stringify([authoritySha256, currentPackageBindingDigest]));
  for (const input of authority.inputs) {
    const bytes = read(input.path);
    const expected = input.path === 'package.json' ? binding : input;
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256 || buffers.has(input.path)) fail(`input ${input.path}`);
    buffers.set(input.path, bytes);
  }
  if (hash(buffers.get(source)) !== authority.sourceSha256) fail('original producer');
  for (const relative of authority.absentPackageBoundaries) {
    try {fs.lstatSync(path.join(root, relative)); fail(`new package boundary ${relative}`);}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
  }
  // Match the original selector, including directory-looking selected names.
  const docker = fs.readdirSync(path.join(root, 'docker')).filter(file => file.startsWith('Dockerfile.')).sort();
  if (!equal(docker, authority.dockerRoster)) fail('Docker selector');
  const runtimeFiles = directory => fs.readdirSync(path.join(root, directory), {withFileTypes: true}).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) fail(`parser alias ${file}`);
    if (entry.isDirectory()) return runtimeFiles(file);
    if (!entry.isFile()) fail(`parser nonregular ${file}`);
    return file.endsWith('.js') ? [file] : [];
  }).sort();
  if (!equal(runtimeFiles('node_modules/yaml/dist'), authority.yamlRuntimeRoster)) fail('maintained parser roster');
  // The supplied profile root can be a fixture. Validate the parser this module
  // actually imported as well: fixture bytes cannot vouch for another loader.
  const importerRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/u, '');
  if (fs.realpathSync(importerRoot) !== importerRoot) fail('actual parser canonical importer');
  const actualEntry = fileURLToPath(import.meta.resolve('yaml'));
  if (actualEntry !== path.join(importerRoot, 'node_modules/yaml/dist/index.js')
    || fs.realpathSync(actualEntry) !== actualEntry) fail('actual parser resolution');
  for (const input of authority.inputs.filter(item => item.path.startsWith('node_modules/yaml/'))) {
    const absolute = path.join(importerRoot, input.path);
    if (!fs.existsSync(absolute) || fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) fail(`actual parser input ${input.path}`);
    const bytes = fs.readFileSync(absolute);
    if (bytes.length !== input.bytes || hash(bytes) !== input.sha256) fail(`actual parser input ${input.path}`);
  }
  const actualRuntime = directory => fs.readdirSync(path.join(importerRoot, directory), {withFileTypes: true}).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) fail(`actual parser member ${file}`);
    if (entry.name === 'package.json') fail(`actual parser package boundary ${file}`);
    return entry.isDirectory() ? actualRuntime(file) : file.endsWith('.js') ? [file] : [];
  }).sort();
  if (!equal(actualRuntime('node_modules/yaml/dist'), authority.yamlRuntimeRoster)) fail('actual parser roster');
  if (!graph || !equal(graph.edges.filter(edge => edge.target === source), authority.incomingEdges)
    || !equal(graph.publicEntries.filter(entry => entry.canonicalSource === source), authority.publicEntries)) fail('caller or alias');
  if (!equal(classify(source).map(role => ({source, ...descriptor(role)})), authority.descriptors)) fail('canonical slot/role roster');
  const native = authority.observation;
  if (native.outer.exitCode !== 0 || native.outer.signal !== null || native.stderr !== ''
    || native.terminal.completed !== true || native.terminal.originalFunctionCalls !== 1
    || native.invocation.selectedExport !== 'versionOutputs' || native.terminal.sealSha256 !== native.approval.sealSha256
    || !equal(native.outer.argv, native.invocation.argv) || !equal(native.outer.environment, native.invocation.environment)) fail('native observation custody');
  const outputs = [], apiRoots = [], members = [];
  for (const [index, member] of authority.members.entries()) {
    const bytes = Buffer.from(member.content, 'utf8');
    if (member.index !== index || bytes.length !== member.bytes || hash(bytes) !== member.sha256
      || !buffers.has(member.path) || !buffers.get(member.path).equals(bytes)) fail(`original output/current member ${member.path}`);
    let values = [], parseKind = 'opaque-code-or-requirements';
    if (/\.ya?ml$/u.test(member.path)) {
      parseKind = 'maintained-js-yaml-loadAll';
      const documents = YAML.parseAllDocuments(member.content);
      if (documents.some(doc => doc.errors.length)) fail(`maintained YAML ${member.path}`);
      values = documents.map(doc => doc.toJS());
    } else if (member.path.endsWith('.json')) {parseKind = 'native-JSON.parse'; values = [JSON.parse(member.content)];}
    const shapes = values.map((value, ordinal) => ({ordinal, type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
      apiVersion: typeof value?.apiVersion === 'string' ? value.apiVersion : null, kind: typeof value?.kind === 'string' ? value.kind : null}));
    if (parseKind !== member.parseKind || !equal(shapes, member.documents)) fail(`parser shape ${member.path}`);
    const collect = (value, document, pointer = '') => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      if (typeof value.apiVersion === 'string' && typeof value.kind === 'string') {
        apiRoots.push({member: index, path: member.path, document, pointer, apiVersion: value.apiVersion, kind: value.kind,
          name: typeof value.metadata?.name === 'string' ? value.metadata.name : null,
          namespace: typeof value.metadata?.namespace === 'string' ? value.metadata.namespace : null});
        outputs.push({value, context: {apiVersion: value.apiVersion, kind: value.kind, path: source, line: 181,
          document: outputs.length, producer: 'node-original-finite-output-profile', profile: 'current-versions-map-member',
          sourceDigest: authority.sourceSha256, publicOutput: member.path, memberOrdinal: index,
          memberDocument: document, memberPointer: pointer, inputDigest: currentInputDigest,
          historicalWitnessDigest: authoritySha256, currentPackageBindingDigest, observationsHistorical: true,
          outputBytesDigest: member.sha256, outputDigest: hash(JSON.stringify(value)),
          runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
          executionLimit: 'Original pure Map observation and exact current member equality only; writer, schema, supported-version, lock, apply and runtime unexecuted.'}});
      }
      if (value.kind === 'List' && Array.isArray(value.items)) value.items.forEach((item, i) => collect(item, document, `${pointer}/items/${i}`));
    };
    values.forEach((value, ordinal) => collect(value, ordinal));
    members.push({index, path: member.path, sha256: member.sha256, purpose: member.memberClass});
  }
  if (!equal(apiRoots, authority.apiRoots) || native.terminal.memberCount !== members.length
    || native.terminal.apiRoots !== apiRoots.length) fail('complete ordered member/API vector');
  for (const output of outputs) output.context.inputs = [authorityPath, ...buffers.keys()];
  const receipt = freeze({witnessDigest: authoritySha256, inputDigest: currentInputDigest, outputs, members,
    currentPackageBinding: binding, currentPackageBindingDigest, observationsHistorical: true,
    dependencies: [authorityPath, ...buffers.keys()], descriptors: authority.descriptors,
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false});
  receipts.add(receipt); return receipt;
}

export function selectedVersionsMapOutput(sourcePath, role, receipt) {
  if (sourcePath !== source) return null;
  assert(receipt && receipts.has(receipt), 'API_PRODUCT_VERSIONS_MAP_OUTPUT_UNQUALIFIED: unacquired receipt');
  const expected = receipt.descriptors.find(item => item.line === role.line && item.sink === role.sink);
  assert(expected && equal(descriptor(expected), descriptor(role)), 'API_PRODUCT_VERSIONS_MAP_OUTPUT_UNQUALIFIED: canonical descriptor');
  if (role.line !== 181) return null;
  return freeze({purpose: 'Original complete mixed versions Map: actual API streams plus exact typed code/config/requirements members',
    canonicalRawRole: 'unknown', witnessDigest: receipt.witnessDigest, inputDigest: receipt.inputDigest,
    currentPackageBindingDigest: receipt.currentPackageBindingDigest, observationsHistorical: true,
    members: receipt.members, runtimeExecutionAuthorized: false, apiApplyAuthorized: false});
}
