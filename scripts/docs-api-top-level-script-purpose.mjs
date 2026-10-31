import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const authorityPath = 'scripts/docs-api-top-level-script-purpose-authority.json';
const authoritySha256 = 'a0cf010ffc16a1c952879698d9ede2ce38364807ec3a4996cf68c8fed26d0d1b';
const currentPurposeInputBindings20261031 = Object.freeze([
  {
    "path": "docs/site/extend/lint.md",
    "sha256": "a1c0a7ba491dcb60690e38e50d813d477ce33894492a43629b10e12c60cbd53e",
    "historicalSha256": "8e84ad80f6b9fff4557073d77796f64e6374c170ad23d261c1a3ae6b0dac461e"
  },
  {
    "path": "scripts/plugin-registration-dependencies.mjs",
    "sha256": "7f473538623aedb9f0c49477c72c54b5eda5a3e20456074becfd7ef73cd5ccca",
    "historicalSha256": "0e5cc4599edcd642b3c7c6190be62b869d8f57aa5fc45d0acd9bd5a78e7e28b2"
  },
  {
    "path": "scripts/docs-publication.mjs",
    "sha256": "c96741df38af067044811d38e0c0513dd9512e383493d08e984cf62e538b1bd5",
    "historicalSha256": "2e44d7a367bfce370229a00af8b0352690983029f763020608e938ba8fd35943"
  }
].map(Object.freeze));
const hash = value => createHash('sha256').update(value).digest('hex');
const receipts = new WeakSet();
const selectedSources = Object.freeze([
  'scripts/lint-baseline-update.mjs', 'scripts/observability-retirement-plan.mjs',
  'scripts/recover-openclaw-audit-input.mjs', 'scripts/render-kubernetes-api-probe.mjs',
  'scripts/render-stateful-network-policies.mjs', 'scripts/updates/check-upstream-refresh.mjs',
  'scripts/updates/deployment-release.mjs', 'scripts/updates/materialize-release.mjs',
  'scripts/updates/refresh-versions.mjs', 'scripts/updates/release-images.mjs', 'scripts/versions.mjs',
  'scripts/generate-plugin-dependency-aggregate.mjs',
]);
const descriptor = role => Object.fromEntries(['line', 'sink', 'expression', 'sinkContract', 'role'].map(key => [key, role[key] ?? null]));
const purposes = Object.freeze({
  "scripts/generate-plugin-dependency-aggregate.mjs:21": "Exact native aggregate write/check occurrence: fresh extension discovery and ownership assertions precede the strict declaration report; raw native manifests and bounded schema-reference documents are serialized only to fixed docs/blueprint/generated/plugin-dependency-aggregate.json, or compared read-only to that same file. Nested schema/examples remain arbitrary raw data, not globally non-API or observed provider DATA. No API submission, schema-semantic validation, runtime role, credential or operational-owner grant.",
  'scripts/lint-baseline-update.mjs:74': 'selected local lint-baseline configuration rewrite after report/baseline digest, findings and approval-argument checks; not API submission',
  'scripts/lint-baseline-update.mjs:75': 'raw tool name and approved-fingerprint count status following the local lint-baseline write; unbounded text remains UNKNOWN',
  'scripts/observability-retirement-plan.mjs:138': 'fixed observability-retirement-plan envelope with retain-all blockers; nested inventory data, not a release/delete operation',
  'scripts/updates/check-upstream-refresh.mjs:20': 'typed versions.json input in an exclusively created temporary Git regression fixture; no permission to run the later network regression',
  'scripts/updates/deployment-release.mjs:177': 'full validated40hex selected code/image commit scalar after selected-release checks; not observed materialization or Helm success',
  'scripts/recover-openclaw-audit-input.mjs:70': 'exact sanitized JSONL archive bytes to exclusive recovery temporary descriptor then identity/hash-guarded rename to fixed audit raw archive; not API submission or successful doctor import/checkpoint',
  'scripts/updates/materialize-release.mjs:50': 'selected runtime/ops Helm-values projection to five finite releases/values role files; source-preserving write branch, not check success, rendered Kubernetes resources or deployment',
  'scripts/updates/refresh-versions.mjs:140': 'raw upstream verification progress before validation with arbitrary version text including LF; not API classification or permission to run upstream requests',
  'scripts/updates/refresh-versions.mjs:151': 'source-preserving versions.json staging BEFORE downstream versionOutputs and lock validation; not a fully validated update or mixed-member API output grant',
  'scripts/updates/refresh-versions.mjs:155': 'catch-path exact original versions.json bytes restored to the same file then original error rethrown; not atomic rollback of generated files, locks or network effects',
  'scripts/updates/release-images.mjs:29': 'fixed schemaVersion/commit/images/sourceRunId/sourceRunAttempt receipt file constructor for the two finite CLI families; not authenticated build identity',
  'scripts/render-stateful-network-policies.mjs:68': 'original API-capable YAML stream forwarded by deploy.sh to kubectl apply; the separate mandatory discoverTransformedApiOutputs path executes the original locked-chart renderer and retains every resource document. Not a non-API classification, arbitrary-profile closure or live apply claim',
});

// Whole Source/caller/receiver and canonical descriptors are checked afresh
// BEFORE the receiving inventories' caches and ordinary mutable role fallback.
// No product module is imported, invoked or fabricated by this qualification.
export function checkedTopLevelScriptPurposes(root, graph, classify, sources) {
  if (!sources.some(source => selectedSources.includes(source))) return null;
  const fail = detail => assert.fail(`API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical checkout root');
  const read = relative => {
    const file = path.join(root, relative);
    if (!fs.existsSync(file) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail(`physical Source input ${relative}`);
    return fs.readFileSync(file);
  };
  const bytes = read(authorityPath);
  if (hash(bytes) !== authoritySha256) fail('immutable Source-purpose authority');
  const authority = JSON.parse(bytes);
  if (JSON.stringify(Object.keys(authority.sourcePins)) !== JSON.stringify(selectedSources)) fail('source roster');
  if (!selectedSources.every(source => sources.includes(source))) fail('missing selected source from native census');
  const approvedCurrentPaths = ["docs/site/extend/lint.md", "scripts/plugin-registration-dependencies.mjs", "scripts/docs-publication.mjs"];
  const bindings = currentPurposeInputBindings20261031;
  if (JSON.stringify(bindings.map(binding => binding?.path)) !== JSON.stringify(approvedCurrentPaths)) fail('current binding exact ordered roster');
  for (const binding of bindings) {
    if (!binding || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(['historicalSha256','path','sha256'])
      || !/^[a-f0-9]{64}$/u.test(binding.sha256) || !/^[a-f0-9]{64}$/u.test(binding.historicalSha256)) fail('current binding shape');
    const historical = authority.inputs.filter(input => input.path === binding.path);
    if (historical.length !== 1 || historical[0].sha256 !== binding.historicalSha256) fail('current binding historical identity');
  }
  const currentPurposeInputBindingDigest = hash(JSON.stringify(bindings));
  const facts = [];
  for (const input of authority.inputs) {
    const content = read(input.path);
    const binding = bindings.find(binding => binding.path === input.path);
    const expected = binding ? binding.sha256 : input.sha256;
    if (hash(content) !== expected) fail(`changed Source/caller/receiver/input ${input.path}`);
    facts.push({...input, sha256: expected});
  }
  for (const source of selectedSources) if (hash(read(source)) !== authority.sourcePins[source]) fail(`producer Source ${source}`);
  for (const relative of authority.absentPackageBoundaries) {
    try { fs.lstatSync(path.join(root, relative)); fail(`new package boundary ${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!graph || JSON.stringify(graph.edges.filter(edge => selectedSources.includes(edge.target))) !== JSON.stringify(authority.incomingEdges)
    || JSON.stringify(graph.publicEntries.filter(entry => selectedSources.includes(entry.canonicalSource))) !== JSON.stringify(authority.publicEntries)) fail('changed caller or aliased public entry');
  const actual = selectedSources.flatMap(source => classify(source).map(role => ({source, ...descriptor(role)})));
  if (JSON.stringify(actual) !== JSON.stringify(authority.descriptors)) fail('canonical native slot/role roster; registry relabel or missing/new slot');
  const receipt = Object.freeze({
    witnessDigest: authoritySha256, inputDigest: hash(JSON.stringify(facts)), currentPurposeInputBindingDigest,
    dependencies: Object.freeze([authorityPath, ...facts.map(input => input.path)]),
    descriptors: Object.freeze(authority.descriptors.map(Object.freeze)),
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
  });
  receipts.add(receipt);
  return receipt;
}

export function selectedTopLevelScriptPurpose(source, role, receipt) {
  if (!selectedSources.includes(source)) return null;
  assert(receipt && receipts.has(receipt), 'API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: unacquired receipt');
  const expected = receipt.descriptors.find(item => item.source === source && item.line === role.line && item.sink === role.sink);
  assert(expected && JSON.stringify(descriptor(expected)) === JSON.stringify(descriptor(role)),
    'API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: changed canonical slot or role');
  const purpose = purposes[`${source}:${role.line}`];
  if (!purpose) return null; // Raw/API/mixed streams still need their own finite adapters.
  return Object.freeze({purpose, canonicalRawRole: role.role, witnessDigest: receipt.witnessDigest, inputDigest: receipt.inputDigest,
    currentPurposeInputBindingDigest: receipt.currentPurposeInputBindingDigest,
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
    limit: 'Source-owned output purpose only; runtime inputs/results unobserved; arbitrary embedded tool/status bytes are not globally non-API.'});
}
