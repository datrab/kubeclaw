import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadAll} from 'js-yaml';
import {fileURLToPath} from 'node:url';

const source = 'scripts/render-kubernetes-api-probe.mjs';
const helper = 'scripts/kubernetes-api-probe.mjs';
const authorityPath = 'scripts/docs-api-probe39-original-authority.json';
const authoritySha256 = '9456ac654f9f28d3891889f906b37d2f91e421c884b9707ff0c0778742f097cc';
const hash = value => createHash('sha256').update(value).digest('hex');
const receipts = new WeakSet();
const descriptor = role => Object.fromEntries(['source', 'line', 'sink', 'expression', 'sinkContract', 'role'].map(key => [key, role[key] ?? null]));
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};

// Replay one original terminal capture, never execute the renderer or the
// network probe embedded in its ConfigMap. Fixture identity is not live identity.
export function checkedOriginalProbe39Output(root, graph, classify, sources) {
  if (!sources.includes(source)) return null;
  const fail = detail => assert.fail(`API_PRODUCT_PROBE39_ORIGINAL_OUTPUT_UNQUALIFIED: ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical root');
  const read = relative => {
    const file = path.join(root, relative);
    if (!fs.existsSync(file) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail('physical input ' + relative);
    return fs.readFileSync(file);
  };
  const bytes = read(authorityPath);
  if (hash(bytes) !== authoritySha256) fail('immutable original capture and fixture authority');
  const authority = JSON.parse(bytes);
  for (const [file, digest] of Object.entries(authority.inputs)) if (hash(read(file)) !== digest) fail('changed original source/input/parser ' + file);
  // Fixtures may live in another physical root; bind the parser actually loaded
  // by THIS adapter as well as the supplied root's pinned parser bytes.
  const parser = fileURLToPath(import.meta.resolve('js-yaml'));
  const parserPackage = path.resolve(path.dirname(parser), '../package.json');
  for (const [file, digest] of [[parser, authority.inputs['node_modules/js-yaml/dist/js-yaml.mjs']],
    [parserPackage, authority.inputs['node_modules/js-yaml/package.json']]]) {
    if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile() || hash(fs.readFileSync(file)) !== digest) fail('actual loaded parser closure');
  }
  try {fs.lstatSync(path.join(path.dirname(parser), 'package.json')); fail('actual parser loader boundary');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}

  for (const relative of authority.absentBoundaries) {
    try {fs.lstatSync(path.join(root, relative)); fail('new loader boundary ' + relative);}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
  }
  const selected = [source, helper];
  if (!graph || JSON.stringify(graph.edges.filter(edge => selected.includes(edge.target))) !== JSON.stringify(authority.incomingEdges)
    || JSON.stringify(graph.publicEntries.filter(entry => selected.includes(entry.canonicalSource))) !== JSON.stringify(authority.publicEntries)) fail('changed caller or public entry');
  const roles = classify(source);
  if (roles.length !== 1 || JSON.stringify(descriptor({source, ...roles[0]})) !== JSON.stringify(authority.descriptor)) fail('native role/slot/descriptor');
  const observation = authority.observation;
  if (observation.result.status !== 0 || observation.result.signal !== null || observation.result.error !== null
    || observation.stderr !== '' || hash(observation.stdout) !== observation.result.stdoutSha256 || hash(observation.stderr) !== observation.result.stderrSha256) fail('original terminal streams');
  const values = loadAll(observation.stdout);
  if (JSON.stringify(values) !== JSON.stringify(observation.parsedValues)
    || values.length !== 2 || values[0]?.apiVersion !== 'v1' || values[0]?.kind !== 'ConfigMap'
    || values[1]?.apiVersion !== 'batch/v1' || values[1]?.kind !== 'Job') fail('ordered actual original members');
  if (values[0].data['probe.mjs'] !== read(helper).toString('utf8')) fail('embedded original helper');
  const inputDigest = hash(bytes), dependencies = [authorityPath, ...Object.keys(authority.inputs)];
  const outputs = values.map((value, index) => ({value, context: {
    apiVersion: value.apiVersion, kind: value.kind, path: source, line: 39, document: index,
    producer: 'node-original-captured-stdout', profile: authority.profile,
    sourceDigest: authority.inputs[source], inputs: dependencies, inputDigest,
    outputDigest: hash(JSON.stringify(value)), originalStreamDigest: observation.result.stdoutSha256,
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false, actualPodObserved: false,
    executionLimit: authority.limits.join(' '),
  }}));
  const receipt = freeze({descriptor: authority.descriptor, outputs, dependencies, inputDigest,
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false});
  receipts.add(receipt);
  return receipt;
}

export function selectedOriginalProbe39Output(selectedSource, role, receipt) {
  if (selectedSource !== source) return null;
  assert(receipt && receipts.has(receipt), 'API_PRODUCT_PROBE39_ORIGINAL_OUTPUT_UNQUALIFIED: unacquired receipt');
  assert.equal(JSON.stringify(descriptor({source, ...role})), JSON.stringify(receipt.descriptor),
    'API_PRODUCT_PROBE39_ORIGINAL_OUTPUT_UNQUALIFIED: changed native role/slot/descriptor');
  return receipt;
}
