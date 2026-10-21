import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deploymentNodeOutputOccurrences} from './docs-api-deployment-node-occurrences.mjs';

// Two exact CLI use-occurrences, never global roles for raw stdout or the
// public resource-argument function. Only their actual typed consumers qualify.
const profiles = new Map([
  ['scripts/bundle-values-field.mjs', {
    sourceSha256: 'b8a920cbce4fbd538b310bdffd9c7b4ef324bb5bb59c7732459c66048f64d0b0',
    captureLines: [1341, 1345, 1358, 1680, 1684, 1696],
    descriptors: [{line: 12, sink: 'process.stdout.write', expression: '`${value}\\n`'}],
    basis: 'exact-quoted-deployment-scalar-capture',
  }],
  ['scripts/buster-resource-overlay.mjs', {
    sourceSha256: '178b5a326434ef80b45fb1ecc1587610d8db704e667e74e796fe7767f6bf5304',
    captureLines: [1390, 1390],
    descriptors: [
      {line: 21, sink: 'return', expressionSha256: '6f27717931e4e4cc1051d7e5a2bbe0adf41823bba94115805832175ea64bc582'},
      {line: 26, sink: 'process.stdout.write', expressionSha256: '6e0cbaddb0c986d7099cab4ada3a2a7f580719a00317b4aee61d682b880bc887'},
    ],
    basis: 'exact-quoted-Helm-set-json-argument',
  }],
]);
const roots = Object.freeze(['scripts', 'skills', 'ops', 'tools', 'bin', 'cmd', 'docker', 'packaging', 'plugins', 'contracts', 'my-values', '.github/workflows']);
const excludedDirectories = new Set(['node_modules', 'vendor', '.git', 'dist', 'test', 'tests', 'fixtures']);
// Existing Source trust anchors cannot include their own receipt hash. Their
// current implementation remains checked by ordinary documentation custody.
const trustAnchors = new Set(['scripts/docs-deployment-scalar-occurrence-custody.mjs', 'scripts/docs-api-documentation-role-custody.mjs']);
const reviewedSelectedGraphSha256 = '2e92d2cbf7e5992baa69d04181e30449c6d8e70ef926bf3b0bf9a32a454350ac';
const reviewedCallerCensusSha256 = '241e30ba49df0a19d582e2ad90ea2b42069cc3c97a01d69231428f4c2f482d7c';
const hash = value => createHash('sha256').update(value).digest('hex');
const receipts = new WeakSet();
const cache = new Map();
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

// Bind the declared product-root/workflow executable caller domain, not just filename mentions:
// a newly computed helper path in another source must revoke this census too.
// These bytes receive no inertness, module, execution or output-role permission.
export function deploymentScalarCallerFacts(root) {
  const facts = [];
  const visit = relative => {
    const absolute = path.join(root, relative);
    let status;
    try { status = fs.lstatSync(absolute); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (status.isSymbolicLink()) {
      facts.push({path: relative, alias: fs.readlinkSync(absolute)});
      return;
    }
    if (status.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) if (!excludedDirectories.has(entry)) visit(relative + '/' + entry);
      return;
    }
    if (!status.isFile() || trustAnchors.has(relative)) return;
    const selected = /\.(?:[cm]?[jt]sx?|py|sh|bash|c|h|go|rs|rb|pl|php|lua|java)$/u.test(relative)
      || /(?:^|\/)Dockerfile(?:\.|$)/u.test(relative)
      || relative.startsWith('.github/workflows/') || Boolean(status.mode & 0o111);
    if (selected) facts.push({path: relative, sha256: hash(fs.readFileSync(absolute))});
  };
  roots.forEach(visit);
  return facts.sort((a, b) => a.path.localeCompare(b.path));
}

export function deploymentScalarOccurrenceCustody(root, selectedSource, sourceBytes, graph) {
  const profile = profiles.get(selectedSource);
  if (!profile) return null;
  const source = selectedSource;
  const fail = detail => assert.fail(`DEPLOYMENT_SCALAR_OCCURRENCE_UNQUALIFIED: ${source}; ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical root');
  if (hash(sourceBytes) !== profile.sourceSha256) fail('changed selected source');
  if (!graph || graph.edges.some(edge => edge.target === source && edge.source !== source)
    || graph.publicEntries.some(entry => entry.canonicalSource === source && entry.path !== source)) fail('imported or aliased helper entry');
  const census = deploymentScalarCallerFacts(root), censusDigest = hash(JSON.stringify(census));
  if (censusDigest !== reviewedCallerCensusSha256) fail('changed/new executable caller census');
  // Also bind actual selected imports/native entries outside the declared roots
  // (including selected docs/test executables), without admitting unreferenced assets.
  const selectedGraph = [...new Set(graph.closureSources ?? [])].filter(selected => !trustAnchors.has(selected)).sort().map(selected => {
    const absolute = path.join(root, selected), canonical = fs.realpathSync(absolute);
    if (canonical !== absolute || !fs.statSync(absolute).isFile()) fail('redirected selected graph source ' + selected);
    return {path: selected, sha256: hash(fs.readFileSync(absolute))};
  });
  const selectedGraphDigest = hash(JSON.stringify(selectedGraph));
  if (selectedGraphDigest !== reviewedSelectedGraphSha256) fail('changed selected graph closure membership/physical bytes');
  const deploy = path.join(root, 'scripts/deploy.sh');
  if (!fs.existsSync(deploy)) fail('missing original caller');
  const observations = deploymentNodeOutputOccurrences(root, fs.readFileSync(deploy, 'utf8'))?.filter(item => item.source === source);
  if (!observations || JSON.stringify(observations.map(item => item.caller.line)) !== JSON.stringify(profile.captureLines)) fail('source/caller/receiver/dependency or package boundary changed');
  if (observations.some(item => !profile.descriptors.some(expected => descriptorMatches(item.descriptor, expected)))) fail('actual output descriptor');
  // Native package entries are bound by the existing physical graph's exact
  // package pin; that package exposes no standalone invocation of this helper.
  // rootSources enumerates source files for analysis, not evidence of CLI use.
  const inputDigest = hash(JSON.stringify([censusDigest, selectedGraphDigest, observations]));
  const cacheKey = root + ':' + source;
  const prior = cache.get(cacheKey);
  if (prior?.inputDigest === inputDigest) return prior;
  const receipt = freeze({source, inputDigest, canonicalRole: 'unknown',
    occurrences: Object.freeze(observations.map(item => Object.freeze({...item,
      classification: Object.freeze({role: 'non-api', basis: profile.basis,
        scope: 'only this caller/capture/receiver occurrence; not standalone stdout or arbitrary YAML bytes'})}))),
    dependencies: Object.freeze([...new Set(census.map(item => item.path).concat(selectedGraph.map(item => item.path), Object.keys(observations[0].dependencies)))]),
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false});
  receipts.add(receipt); cache.set(cacheKey, receipt); return receipt;
}

function descriptorMatches(role, descriptor) {
  return role.line === descriptor.line && role.sink === descriptor.sink
    && (descriptor.expression !== undefined ? role.expression === descriptor.expression : hash(role.expression) === descriptor.expressionSha256);
}
export function selectedDeploymentScalarOccurrences(role, receipt) {
  if (!receipt || !receipts.has(receipt) || role.role !== 'unknown') return null;
  const selected = receipt.occurrences.filter(item => descriptorMatches(role, item.descriptor));
  return selected.length ? Object.freeze(selected) : null;
}
