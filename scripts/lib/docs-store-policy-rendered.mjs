import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { extractStorePolicySource } from './docs-store-policy-source.mjs';

const fail = message => assert.fail(`DOC_DRIFT_STORE_POLICY: ${message}`);
const digest = value => createHash('sha256').update(value).digest('hex');
function ownPath(value, parts) {
  if (!Array.isArray(parts) || !parts.length) fail('native resource path must be explicit');
  for (const part of parts) {
    if (!(typeof part === 'string' && part && !['__proto__', 'constructor', 'prototype'].includes(part)
      || Number.isSafeInteger(part) && part >= 0)) fail('invalid native resource path component');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) {
      fail(`missing native resource field: ${parts.join('.')}`);
    }
    value = value[part];
  }
  if (value === undefined) fail('undefined native resource value');
  return value;
}

// Receives only the native producer's already acquired resources. This function
// does not invoke Helm, import a runtime owner, or reconstruct a missing profile.
export function extractRenderedStorePolicy(source, text, selector, resources) {
  if (!Array.isArray(resources)) fail('native resource acquisition is required');
  const wanted = selector.resource;
  if (selector.kind !== 'rendered-resource' || typeof selector.origin !== 'string'
    || !selector.origin || !wanted || !['kind', 'name', 'namespace'].every(key =>
      typeof wanted[key] === 'string' && wanted[key])) fail('explicit native resource identity required');
  const matches = resources.filter(item => item.source === source && item.origin === selector.origin
    && item.value?.kind === wanted.kind && item.value?.metadata?.name === wanted.name
    && item.value?.metadata?.namespace === wanted.namespace);
  if (matches.length !== 1) fail(`expected one exact native resource, found ${matches.length}: ${source}`);
  const selected = matches[0];
  if (!Number.isSafeInteger(selected.line) || selected.line < 1) fail('native resource source location missing');
  const expectations = selector.identityExpectations ?? [];
  if (!Array.isArray(expectations)) fail('invalid nested native resource identities');
  for (const expected of expectations) {
    if (typeof expected.equals !== 'string' || !expected.equals) fail('explicit nested identity required');
    if (ownPath(selected.value, expected.path) !== expected.equals) fail('nested native resource identity changed');
  }
  let value = ownPath(selected.value, selector.path), embedded;
  if (selector.embeddedYaml !== undefined) {
    if (typeof value !== 'string') fail('embedded YAML authority must be a string');
    const docs = YAML.parseAllDocuments(value, { uniqueKeys: true });
    if (docs.length !== 1 || docs[0].errors.length) fail('expected one valid embedded YAML document');
    YAML.visit(docs[0], { Alias() { fail('embedded YAML aliases are not supported'); } });
    embedded = { fieldPath: selector.path, sourceTextSha256: digest(value),
      selectedPath: selector.embeddedYaml.path };
    value = ownPath(docs[0].toJSON(), selector.embeddedYaml.path);
  }
  // Preserve full outer source authentication, not a pseudo-source digest of
  // the inner string or a rendered offset falsely labelled as template text.
  const whole = extractStorePolicySource(source, text, { kind: 'complete-source' });
  const { expression: _wholeBody, ...reference } = whole;
  if (selected.line > whole.endLine) fail('native resource source location exceeds authority');
  return { ...reference, selector, startLine: selected.line, endLine: selected.line,
    representation: 'selected-native-resource-value', value,
    resourceProvenance: { origin: selected.origin, source,
      identity: wanted, namespaceAuthority: selected.namespaceAuthority,
      activationState: selected.activationState ?? 'active',
      ...(selected.activationCondition ? { activationCondition: selected.activationCondition } : {}),
      sourceLocationMeaning: 'Native resource declaration; not the selected field offset',
      resourceJsonSha256: digest(JSON.stringify(selected.value)),
      ...(selected.policyComparisonFixture ? { policyComparisonFixture: selected.policyComparisonFixture } : {}),
      ...(embedded ? { embeddedYaml: embedded } : {}) } };
}
