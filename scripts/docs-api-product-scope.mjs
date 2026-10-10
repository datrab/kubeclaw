import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { receiverContracts as networkingReceiverContracts } from './docs-kubernetes-network-receiver-contracts.mjs';
import { receiverContracts as admissionReceiverContracts } from './docs-kubernetes-admission-receiver-contracts.mjs';
import { receiverContracts as admissionStatusReceiverContracts } from './docs-kubernetes-admission-status-contracts.mjs';
import { receiverContracts as deploymentReceiverContracts } from './docs-kubernetes-apps-receiver-contracts.mjs';
import { receiverContracts as coreReceiverContracts } from './docs-kubernetes-core-receiver-contracts.mjs';
import { receiverContracts as argoReceiverContracts } from './docs-argo-receiver-contracts.mjs';
import { receiverContracts as ciliumReceiverContracts } from './docs-cilium-receiver-contracts.mjs';
import { receiverContracts as envelopeReceiverContracts } from './docs-kubernetes-envelope-receiver-contracts.mjs';
import { receiverContracts as metadataReceiverContracts, implicitKubernetesObjectMetaReferences } from './docs-kubernetes-metadata-receiver-contracts.mjs';

import { apiResourceFieldBoundaries, apiFieldSchemaAuthority } from './docs-api-schema-authorities.mjs';
import { yamlFieldPath, yamlFieldPathTokens } from './yaml-field-path.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const tokens = value => yamlFieldPathTokens(value.replaceAll('[<exact-key>]', '["*"]'));
const canonical = value => yamlFieldPath(tokens(value), { arrayWildcard: true });
// These are additional omission mechanisms, never an allowlist for actual
// fields. Every authored boundary above is selected independently. Each hook
// requires the exact receiver omission and its pinned receiving-function source.
export function relevantRuntimeOmission(kind, fieldPath, record) {
  const hooks = {
    'PersistentVolumeClaim/$.spec.storageClassName': {
      source: /(?:plugin\/pkg\/admission\/storage\/storageclass|pkg\/controller\/volume\/persistentvolume)\//u,
      meaning: /DefaultStorageClass|default (?:storage )?class/iu,
      reason: 'The present claim spec omits its class. Admission or the binding controller can select a cluster class; observe the stored claim and class before relying on storage placement.',
    },
    'PersistentVolumeClaim/$.spec.volumeMode': {
      source: /pkg\/apis\/core\/v1\/defaults\.go/u,
      meaning: /Filesystem/u,
      reason: 'The present claim spec omits volume mode. The typed default selects Filesystem; driver support and stored volume mode remain separate checks.',
    },
  };
  const hook = hooks[`${kind}/${fieldPath}`];
  if (!hook || !record) return null;
  assert(hook.meaning.test(record.omitted), `API_PRODUCT_OMISSION_MEANING_DRIFT: ${kind} ${fieldPath}`);
  const evidence = record.evidence.filter(item => hook.source.test(item.url));
  assert(evidence.length, `API_PRODUCT_OMISSION_SOURCE_MISSING: ${kind} ${fieldPath}`);
  return { reason: hook.reason, omission: record.omitted, evidence };
}
const matches = (schema, actual) => schema.length === actual.length && schema.every((token, index) =>
  token === '*' || token === actual[index] || token === '[]' && typeof actual[index] === 'number');
export const productScopeLimits = [
  'Discovery reparses every inventoried raw YAML resource, including nondefault checked-in profiles. Local Helm values and recursive KubeClaw schemas retain their separate exhaustive inventories.',
  'Helm template branches, controller-produced objects and supported script/render overrides require their existing configuration and procedure inventories; this raw-resource selection does not establish complete discovery of those outputs.',
  'Omission discovery includes pinned schema defaults/requirements and explicit PVC storage-class and volume-mode runtime omission hooks under a present spec. Other runtime defaults and omissions require additional source-qualified applicability hooks; this inventory does not establish their complete discovery.',
];

export function discoverProductApiContexts(root) {
  const contexts = [];
  const excluded = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'tests', 'test', 'fixtures']);
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name)) continue;
      const source = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(source);
      else if (entry.isFile() && /\.ya?ml$/u.test(source)
        && (!source.startsWith('charts/') || /(?:^|\/)(?:ci-)?values\.ya?ml$/u.test(source))) {
        const bytes = fs.readFileSync(path.join(root, source), 'utf8');
        YAML.parseAllDocuments(bytes).forEach((document, index) => {
          if (document.errors.length) return;
          const value = document.toJS();
          if (value?.apiVersion && value?.kind) contexts.push({ apiVersion: value.apiVersion, kind: value.kind,
            path: source, document: index, sourceDigest: digest(bytes) });
        });
      }
    }
  }
  for (const directory of ['charts', 'examples', 'gitops', 'my-values', 'releases/values']) visit(directory);
  return contexts;
}

export function assertProductApiContexts(resources, root) {
  const normalize = rows => rows.map(({ apiVersion, kind, path, document, sourceDigest }) =>
    JSON.stringify([apiVersion, kind, path, document, sourceDigest])).sort();
  const actual = resources.flatMap(resource => resource.sourceContexts.map(context =>
    ({ ...context, apiVersion: resource.apiVersion, kind: resource.kind })));
  assert.deepEqual(normalize(actual), normalize(discoverProductApiContexts(root)), 'API_PRODUCT_DISCOVERY_DRIFT: resource or source document omitted, added or changed');
}

// Re-read source documents, not a stored totals/selected-path assertion. Each
// context digest binds changes, removals and renames to the maintenance gate.
export function apiProductSelection(apiVersion, kind, contexts, receivers, root = process.cwd()) {
  const authority = apiResourceFieldBoundaries(apiVersion, kind);
  const records = new Map(receivers.filter(record => record.kind === kind).map(record => [canonical(record.fieldPath), record]));
  const selected = new Map();
  const metadataPaths = new Set();
  const add = (boundary, evidence) => {
    if (!selected.has(boundary.fieldPath)) selected.set(boundary.fieldPath, []);
    selected.get(boundary.fieldPath).push(evidence);
  };
  for (const context of contexts) {
    const bytes = fs.readFileSync(path.resolve(root, context.path), 'utf8');
    assert.equal(digest(bytes), context.sourceDigest, `API_PRODUCT_SOURCE_DRIFT: ${context.path}`);
    const document = YAML.parseAllDocuments(bytes)[context.document];
    assert(document && !document.errors.length, `API_PRODUCT_DOCUMENT_MISSING: ${context.path}#${context.document}`);
    const value = document.toJS();
    assert(value?.apiVersion === apiVersion && value?.kind === kind, `API_PRODUCT_RESOURCE_DRIFT: ${context.path}#${context.document}`);
    const present = new Set();
    function visit(node, actual = []) {
      const actualPath = yamlFieldPath(actual);
      if (actual[0] === 'metadata') metadataPaths.add(canonical(actualPath));
      const boundary = authority.find(row => matches(tokens(row.fieldPath), actual));
      if (!boundary && actual.length) {
        if (actual[0] === 'metadata') apiFieldSchemaAuthority(apiVersion, kind, actualPath);
        else {
          const ancestors = authority.filter(row => {
            const parts = tokens(row.fieldPath);
            return parts.length < actual.length && matches(parts, actual.slice(0, parts.length));
          }).sort((a, b) => tokens(b.fieldPath).length - tokens(a.fieldPath).length);
          const parent = ancestors[0];
          const parts = parent && tokens(parent.fieldPath);
          const opaque = parent && !authority.some(row => {
            const child = tokens(row.fieldPath);
            return child.length > parts.length && matches(parts, child.slice(0, parts.length));
          });
          assert(opaque, `API_PRODUCT_FIELD_OUTSIDE_AUTHORITY: ${apiVersion}/${kind} ${actualPath}`);
        }
      }
      if (boundary && actual.length) {
        present.add(boundary.fieldPath);
        add(boundary, { reason: 'authored-resource-field', path: context.path, document: context.document, fieldPath: actualPath, sourceDigest: context.sourceDigest });
      }
      if (Array.isArray(node)) node.forEach((item, index) => visit(item, [...actual, index]));
      else if (node && typeof node === 'object') Object.entries(node).forEach(([key, item]) => visit(item, [...actual, key]));
    }
    visit(value);
    // Only immediate children of present objects participate. An omitted
    // alternative never materializes an entire unused subtree.
    for (const boundary of authority) {
      if (present.has(boundary.fieldPath)) continue;
      const parts = tokens(boundary.fieldPath);
      if (!parts.length || parts.at(-1) === '*' || parts.at(-1) === '[]') continue;
      const parentPath = yamlFieldPath(parts.slice(0, -1), { arrayWildcard: true });
      if (!present.has(parentPath)) continue;
      const parent = authority.find(row => row.fieldPath === parentPath);
      const record = records.get(boundary.fieldPath);
      const required = (parent.contract.required ?? []).includes(parts.at(-1));
      const defaulted = Object.hasOwn(boundary.contract, 'default');
      const receiverDefault = relevantRuntimeOmission(kind, boundary.fieldPath, record);
      if (required || defaulted || receiverDefault) add(boundary, {
        reason: required ? 'required-under-present-parent' : defaulted ? 'schema-default-under-present-parent' : 'receiver-default-under-present-parent',
        path: context.path, document: context.document, parentPath, sourceDigest: context.sourceDigest,
        ...(receiverDefault ? { mechanism: receiverDefault.reason, omission: receiverDefault.omission, evidence: receiverDefault.evidence } : {}),
      });
    }
  }
  return { version: 1, fieldPaths: [...selected.keys()].sort(), applicability: Object.fromEntries([...selected].sort(([a], [b]) => a.localeCompare(b))), metadataPaths: [...metadataPaths].sort(), limits: productScopeLimits };
}

export const versionedApiReceiverRegistries = new Map([
  ['v1', coreReceiverContracts],
  ['apps/v1', [...deploymentReceiverContracts, ...envelopeReceiverContracts.filter(record => record.authoritySelector.apiVersion === 'apps/v1')]],
  ['argoproj.io/v1alpha1', argoReceiverContracts],
  ['cilium.io/v2', ciliumReceiverContracts],
  ['networking.k8s.io/v1', [...networkingReceiverContracts, ...envelopeReceiverContracts.filter(record => record.authoritySelector.apiVersion === 'networking.k8s.io/v1')]],
  ['admissionregistration.k8s.io/v1', [...admissionReceiverContracts, ...admissionStatusReceiverContracts, ...envelopeReceiverContracts.filter(record => record.authoritySelector.apiVersion === 'admissionregistration.k8s.io/v1')]],
]);
for (const [apiVersion, records] of versionedApiReceiverRegistries) {
  versionedApiReceiverRegistries.set(apiVersion, [...records,
    ...metadataReceiverContracts.filter(record => record.authoritySelector.apiVersion === apiVersion)]);
}


export function productMetadataReferences(resources) {
  return implicitKubernetesObjectMetaReferences.flatMap(reference => {
    const resource = resources.find(item => item.apiVersion === reference.apiVersion && item.kind === reference.kind);
    if (!resource) return [];
    if (!resource.productSelection) return [reference];
    const actual = resource.productSelection.metadataPaths.map(tokens);
    const contracts = reference.contracts.filter(record => actual.some(parts => matches(tokens(record.fieldPath), parts)));
    return contracts.length ? [{ ...reference, contracts }] : [];
  });
}
