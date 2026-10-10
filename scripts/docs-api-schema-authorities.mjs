import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { yamlFieldPath, yamlFieldPathTokens } from './yaml-field-path.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authorityDirectory = path.join(repositoryRoot, 'scripts/vendor/api-authorities');
const manifestPath = path.join(repositoryRoot, 'scripts/docs-api-authority-lock.json');
const checksumPath = path.join(repositoryRoot, 'scripts/docs-api-authority-lock.sha256');
const kubernetesVersion = 'v1.35.0';
const kubernetesUrl = `https://raw.githubusercontent.com/kubernetes/kubernetes/${kubernetesVersion}/api/openapi-spec/swagger.json`;

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
};

if (process.argv.includes('--refresh-api-authorities')) {
  const response = await fetch(kubernetesUrl);
  assert(response.ok, `failed to download Kubernetes OpenAPI authority: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentSha256 = sha256(bytes);
  const compressed = gzipSync(bytes, { level: 9, mtime: 0 });
  fs.mkdirSync(authorityDirectory, { recursive: true });
  const relative = `scripts/vendor/api-authorities/${contentSha256}.json.gz`;
  fs.writeFileSync(path.join(repositoryRoot, relative), compressed);
  const ciliumCrds = {};
  for (const [kind, fileName] of Object.entries({
    CiliumNetworkPolicy: 'ciliumnetworkpolicies.yaml',
    CiliumClusterwideNetworkPolicy: 'ciliumclusterwidenetworkpolicies.yaml',
  })) {
    const source = `https://raw.githubusercontent.com/cilium/cilium/v1.20.1/pkg/k8s/apis/cilium.io/client/crds/v2/${fileName}`;
    const crdResponse = await fetch(source);
    assert(crdResponse.ok, `failed to download ${kind} CRD authority: ${crdResponse.status}`);
    const crdBytes = Buffer.from(await crdResponse.arrayBuffer());
    const crdSha256 = sha256(crdBytes);
    const crdCompressed = gzipSync(crdBytes, { level: 9, mtime: 0 });
    const crdRelative = `scripts/vendor/api-authorities/${crdSha256}.yaml.gz`;
    fs.writeFileSync(path.join(repositoryRoot, crdRelative), crdCompressed);
    ciliumCrds[kind] = {
      source,
      contentSha256: crdSha256,
      compressedSha256: sha256(crdCompressed),
      compressedSize: crdCompressed.length,
      path: crdRelative,
    };
  }
  const manifest = {
    version: 1,
    kubernetes: {
      version: kubernetesVersion,
      source: kubernetesUrl,
      contentSha256,
      compressedSha256: sha256(compressed),
      compressedSize: compressed.length,
      path: relative,
    },
    customResources: {
      argoproj: { chartKey: 'argocd', chart: 'argo-cd', version: '10.8.0' },
      cilium: { chartKey: 'cilium', chart: 'cilium', version: '1.20.1', crds: ciliumCrds },
    },
  };
  const manifestBytes = `${JSON.stringify(stable(manifest), null, 2)}\n`;
  fs.writeFileSync(manifestPath, manifestBytes);
  fs.writeFileSync(checksumPath, `${sha256(manifestBytes)}  ${path.basename(manifestPath)}\n`);
}

assert(fs.existsSync(manifestPath) && fs.existsSync(checksumPath), 'CONFIG_YAML_AUTHORITY_DRIFT: scripts/docs-api-authority-lock.json or scripts/docs-api-authority-lock.sha256 is missing; run this module with --refresh-api-authorities');
const manifestBytes = fs.readFileSync(manifestPath);
const [manifestChecksum, manifestName] = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/u);
assert.equal(manifestName, path.basename(manifestPath), 'CONFIG_YAML_AUTHORITY_DRIFT: scripts/docs-api-authority-lock.sha256 names the wrong manifest; expected scripts/docs-api-authority-lock.json');
assert.equal(sha256(manifestBytes), manifestChecksum, 'CONFIG_YAML_AUTHORITY_DRIFT: scripts/docs-api-authority-lock.json API authority manifest bytes changed');
const manifest = JSON.parse(manifestBytes);
const kubernetesIdentity = `Kubernetes ${manifest.kubernetes.version} OpenAPI ${manifest.kubernetes.source} (${manifest.kubernetes.path})`;
const kubernetesCompressed = fs.readFileSync(path.join(repositoryRoot, manifest.kubernetes.path));
assert.equal(kubernetesCompressed.length, manifest.kubernetes.compressedSize, `CONFIG_YAML_AUTHORITY_DRIFT: ${kubernetesIdentity}: compressed byte count changed`);
assert.equal(sha256(kubernetesCompressed), manifest.kubernetes.compressedSha256, `CONFIG_YAML_AUTHORITY_DRIFT: ${kubernetesIdentity}: compressed bytes changed`);
const kubernetesBytes = gunzipSync(kubernetesCompressed);
assert.equal(sha256(kubernetesBytes), manifest.kubernetes.contentSha256, `CONFIG_YAML_AUTHORITY_DRIFT: ${kubernetesIdentity}: source bytes changed`);
const kubernetesOpenApi = JSON.parse(kubernetesBytes);

const builtinDefinitions = new Map([
  ['v1/ConfigMap', 'io.k8s.api.core.v1.ConfigMap'],
  ['v1/Namespace', 'io.k8s.api.core.v1.Namespace'],
  ['v1/Pod', 'io.k8s.api.core.v1.Pod'],
  ['v1/PersistentVolumeClaim', 'io.k8s.api.core.v1.PersistentVolumeClaim'],
  ['v1/Secret', 'io.k8s.api.core.v1.Secret'],
  ['v1/Service', 'io.k8s.api.core.v1.Service'],
  ['v1/ServiceAccount', 'io.k8s.api.core.v1.ServiceAccount'],
  ['apps/v1/Deployment', 'io.k8s.api.apps.v1.Deployment'],
  ['networking.k8s.io/v1/Ingress', 'io.k8s.api.networking.v1.Ingress'],
  ['networking.k8s.io/v1/NetworkPolicy', 'io.k8s.api.networking.v1.NetworkPolicy'],
  ['admissionregistration.k8s.io/v1/ValidatingAdmissionPolicy', 'io.k8s.api.admissionregistration.v1.ValidatingAdmissionPolicy'],
  ['admissionregistration.k8s.io/v1/ValidatingAdmissionPolicyBinding', 'io.k8s.api.admissionregistration.v1.ValidatingAdmissionPolicyBinding'],
  ['rbac.authorization.k8s.io/v1/ClusterRole', 'io.k8s.api.rbac.v1.ClusterRole'],
  ['rbac.authorization.k8s.io/v1/ClusterRoleBinding', 'io.k8s.api.rbac.v1.ClusterRoleBinding'],
  ['rbac.authorization.k8s.io/v1/Role', 'io.k8s.api.rbac.v1.Role'],
  ['rbac.authorization.k8s.io/v1/RoleBinding', 'io.k8s.api.rbac.v1.RoleBinding'],
]);

let customResourceSchemas = null;
function loadCustomResourceSchemas() {
  if (customResourceSchemas) return customResourceSchemas;
  customResourceSchemas = new Map();
  const archiveManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'scripts/external-helm-archives.json')));
  for (const authority of Object.values(manifest.customResources)) {
    const archive = archiveManifest.charts[authority.chartKey];
    assert(archive && archive.chart === authority.chart && archive.version === authority.version,
      `CONFIG_YAML_AUTHORITY_DRIFT: scripts/external-helm-archives.json#charts.${authority.chartKey}: custom-resource authority ${authority.chart}@${authority.version} does not match the vendored chart`);
    const archiveIdentity = `${authority.chartKey} ${authority.chart}@${authority.version} (${archive.path})`;
    const archiveBytes = fs.readFileSync(path.join(repositoryRoot, archive.path));
    assert.equal(archiveBytes.length, archive.size, `CONFIG_YAML_AUTHORITY_DRIFT: ${archiveIdentity}: chart archive byte count changed`);
    assert.equal(sha256(archiveBytes), archive.sha256, `CONFIG_YAML_AUTHORITY_DRIFT: ${archiveIdentity}: chart archive bytes changed`);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-api-crd-'));
    try {
      const unpack = spawnSync('tar', ['-xzf', path.join(repositoryRoot, archive.path), '-C', temporary], { encoding: 'utf8' });
      assert.equal(unpack.status, 0, `${authority.chartKey}: cannot extract vendored CRD authority`);
      const documents = [];
      if (authority.crds) {
        for (const [kind, crd] of Object.entries(authority.crds)) {
          const crdIdentity = `${authority.chartKey} ${authority.chart}@${authority.version} ${kind} ${crd.source} (${crd.path})`;
          const compressed = fs.readFileSync(path.join(repositoryRoot, crd.path));
          assert.equal(compressed.length, crd.compressedSize, `CONFIG_YAML_AUTHORITY_DRIFT: ${crdIdentity}: compressed CRD byte count changed`);
          assert.equal(sha256(compressed), crd.compressedSha256, `CONFIG_YAML_AUTHORITY_DRIFT: ${crdIdentity}: compressed CRD bytes changed`);
          const bytes = gunzipSync(compressed);
          assert.equal(sha256(bytes), crd.contentSha256, `CONFIG_YAML_AUTHORITY_DRIFT: ${crdIdentity}: CRD source bytes changed`);
          documents.push(...YAML.parseAllDocuments(bytes.toString('utf8'), { prettyErrors: false }).map((document) => ({ document, source: crd.source })));
        }
      } else {
        const chartDirectory = fs.readdirSync(temporary).map((name) => path.join(temporary, name)).find((candidate) => fs.statSync(candidate).isDirectory());
        const rendered = spawnSync('helm', ['template', 'api-authority', chartDirectory, '--include-crds', '--set', 'crds.install=true'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        assert.equal(rendered.status, 0, `${authority.chartKey}: cannot render vendored CRD authority: ${rendered.stderr}`);
        documents.push(...YAML.parseAllDocuments(rendered.stdout, { prettyErrors: false }).map((document) => ({ document, source: `${authority.chart}@${authority.version} rendered CRDs` })));
      }
      for (const item of documents) {
        const { document } = item;
          if (document.errors.length) continue;
          const value = document.toJS();
          if (value?.kind !== 'CustomResourceDefinition') continue;
          for (const version of value.spec?.versions ?? []) {
            const key = `${value.spec.group}/${version.name}/${value.spec.names.kind}`;
            customResourceSchemas.set(key, {
              schema: version.schema?.openAPIV3Schema,
              authority: item.source,
              archiveSha256: authority.crds
                ? Object.values(authority.crds).find((crd) => crd.source === item.source)?.contentSha256
                : archive.sha256,
            });
          }
      }
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  return customResourceSchemas;
}

function resolveReference(schema) {
  let current = schema;
  const visited = new Set();
  while (current?.$ref) {
    assert(current.$ref.startsWith('#/definitions/'), `unsupported OpenAPI reference ${current.$ref}`);
    assert(!visited.has(current.$ref), `cyclic OpenAPI reference ${current.$ref}`);
    visited.add(current.$ref);
    current = kubernetesOpenApi.definitions[current.$ref.slice('#/definitions/'.length)];
    assert(current, `missing OpenAPI definition ${[...visited].at(-1)}`);
  }
  return current;
}

// Keep the reference edge as well as its target. OpenAPI field descriptions
// beside $ref contain defaults and conditions that the definition alone lacks.
// Legacy scalar authorities keep their existing resolver and identity shape.
function resolveCollectionReference(schema) {
  if (!schema?.$ref) return schema;
  let current = schema;
  const references = [], siblings = {};
  while (current?.$ref) {
    assert(current.$ref.startsWith('#/definitions/'), `unsupported OpenAPI reference ${current.$ref}`);
    assert(!references.includes(current.$ref), `cyclic OpenAPI reference ${current.$ref}`);
    references.push(current.$ref);
    for (const [key, value] of Object.entries(current)) if (key !== '$ref' && !Object.hasOwn(siblings, key)) siblings[key] = value;
    current = kubernetesOpenApi.definitions[current.$ref.slice('#/definitions/'.length)];
    assert(current, `missing OpenAPI definition ${references.at(-1)}`);
  }
  for (const [key, value] of Object.entries(siblings)) if (!['description', 'title'].includes(key) && Object.hasOwn(current, key)) {
    assert.deepEqual(value, current[key], `API_SCHEMA_REFERENCE_CONFLICT: ${references[0]} sibling ${key} conflicts with its definition`);
  }
  return { ...current, ...siblings, schemaReferenceChain: references, referencedContract: apiSchemaNodeContract(current) };
}

export function apiFieldSchemaAuthority(apiVersion, kind, fieldPath, { includeCollectionContract = false } = {}) {
  if (fieldPath === 'apiVersion' || fieldPath === 'kind') return {
    authority: `Kubernetes ${manifest.kubernetes.version} object envelope plus ${apiVersion}/${kind} selected API contract`,
    authoritySha256: manifest.kubernetes.contentSha256,
    apiVersion,
    kind,
    fieldPath,
    resolvedPath: fieldPath,
    type: 'string',
    enum: [fieldPath === 'apiVersion' ? apiVersion : kind],
    default: '<no schema default>',
    format: null,
    minimum: null,
    maximum: null,
    requiredBySchema: true,
    nullable: false,
    descriptionSha256: null,
  };
  const builtin = builtinDefinitions.get(`${apiVersion}/${kind}`);
  let schema;
  let authority;
  let authoritySha256;
  let fieldTokens = yamlFieldPathTokens(fieldPath).map((token) => typeof token === 'number' ? '[]' : token);
  if (fieldTokens[0] === 'metadata') {
    schema = kubernetesOpenApi.definitions['io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta'];
    authority = `Kubernetes ${manifest.kubernetes.version} OpenAPI io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta`;
    authoritySha256 = manifest.kubernetes.contentSha256;
    fieldTokens = fieldTokens.slice(1);
  } else if (builtin) {
    schema = kubernetesOpenApi.definitions[builtin];
    authority = `Kubernetes ${manifest.kubernetes.version} OpenAPI ${builtin}`;
    authoritySha256 = manifest.kubernetes.contentSha256;
  } else {
    const custom = loadCustomResourceSchemas().get(`${apiVersion}/${kind}`);
    assert(custom?.schema, `API_SCHEMA_AUTHORITY_MISSING: ${apiVersion}/${kind}`);
    schema = custom.schema;
    authority = custom.authority;
    authoritySha256 = custom.archiveSha256;
  }
  const resolve = includeCollectionContract ? resolveCollectionReference : resolveReference;
  let current = resolve(schema);
  const resolved = [];
  let requiredBySchema = false;
  let parent = null;
  const parentContracts = [];
  for (let index = 0; index < fieldTokens.length; index += 1) {
    const token = fieldTokens[index];
    current = resolve(current);
    parent = current;
    if (includeCollectionContract) parentContracts.push({ path: yamlFieldPath(resolved, { root: false, arrayWildcard: true }), ...apiSchemaNodeContract(parent) });
    if (token === '[]') {
      if (includeCollectionContract) requiredBySchema = false;
      current = resolve(current?.items);
    }
    else if (current?.properties?.[token]) {
      requiredBySchema = Array.isArray(current.required) && current.required.includes(token);
      current = resolve(current.properties[token]);
    }
    else if (typeof current?.additionalProperties === 'object') {
      current = resolve(current.additionalProperties);
      resolved.push(...fieldTokens.slice(index));
      index = fieldTokens.length;
      break;
    } else current = null;
    assert(current, `API_SCHEMA_FIELD_MISSING: ${apiVersion}/${kind} ${fieldPath} stopped at ${resolved.join('.') || '<root>'}`);
    resolved.push(token);
  }
  return {
    authority,
    authoritySha256,
    apiVersion,
    kind,
    fieldPath,
    resolvedPath: yamlFieldPath(resolved, { root: false, arrayWildcard: true }),
    type: current.type ?? (current.properties ? 'object' : null),
    enum: current.enum ?? null,
    default: Object.hasOwn(current, 'default') ? current.default : '<no schema default>',
    format: current.format ?? null,
    minimum: current.minimum ?? null,
    maximum: current.maximum ?? null,
    requiredBySchema,
    nullable: current.nullable === true,
    descriptionSha256: current.description ? sha256(current.description) : null,
    ...(includeCollectionContract ? {
      contract: apiSchemaNodeContract(current),
      children: Object.fromEntries(Object.entries(current.properties ?? {}).map(([name, child]) => [name, apiSchemaNodeContract(resolve(child))])),
      item: current.items ? apiSchemaNodeContract(resolve(current.items)) : null,
      itemChildren: Object.fromEntries(Object.entries(resolve(current.items)?.properties ?? {}).map(([name, child]) => [name, apiSchemaNodeContract(resolve(child))])),
      mapValue: typeof current.additionalProperties === 'object' ? apiSchemaNodeContract(resolve(current.additionalProperties)) : null,
      parent: parent ? apiSchemaNodeContract(parent) : null,
      parentContracts,
      contractScope: 'Exact pinned schema contracts only. Descriptions can state controller behavior; a missing description or schema default does not prove a controller fallback. API patch annotations do not select the apply mode used by a client.',
    } : {}),
  };
}

// Preserve complete constraint and composition fragments. Resolve only the
// requested node and its direct children, so recursive definitions stay finite.
function apiSchemaNodeContract(schema) {
  if (!schema) return null;
  const keywords = ['type', 'description', 'default', 'nullable', 'enum', 'const', 'format', 'pattern',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'minProperties',
    'maxProperties', 'required', 'additionalProperties', 'oneOf', 'anyOf', 'allOf',
    'not', 'if', 'then', 'else', 'dependencies', 'dependentRequired', 'dependentSchemas',
    'contains', 'minContains', 'maxContains', 'propertyNames', 'patternProperties', 'prefixItems',
    'additionalItems', 'unevaluatedProperties', 'unevaluatedItems', 'readOnly', 'writeOnly',
    'deprecated', 'title', 'example', 'examples', '$schema', '$id', '$comment',
    'schemaReferenceChain', 'referencedContract'];
  // Properties and items are exposed through the named child/item boundaries.
  // Unknown keywords cannot silently disappear from an "exact" contract.
  const structural = ['properties', 'items'];
  // This vocabulary is qualified against the pinned Kubernetes and Cilium
  // authorities. A new vendor keyword needs an explicit contract review;
  // accepting an arbitrary prefix would hide a newly introduced constraint.
  const kubernetesKeywords = ['x-kubernetes-action', 'x-kubernetes-embedded-resource',
    'x-kubernetes-group-version-kind', 'x-kubernetes-int-or-string',
    'x-kubernetes-list-map-keys', 'x-kubernetes-list-type', 'x-kubernetes-map-type',
    'x-kubernetes-patch-merge-key', 'x-kubernetes-patch-strategy',
    'x-kubernetes-preserve-unknown-fields', 'x-kubernetes-unions',
    'x-kubernetes-validations'];
  for (const key of Object.keys(schema)) assert(keywords.includes(key) || structural.includes(key)
    || kubernetesKeywords.includes(key), `API_SCHEMA_COLLECTION_KEYWORD_UNQUALIFIED: ${key}`);
  return { ...Object.fromEntries(Object.entries(schema).filter(([key]) => keywords.includes(key)
    || kubernetesKeywords.includes(key))), observedSchemaKeywords: [...new Set([
      ...Object.keys(schema).filter((key) => !['schemaReferenceChain', 'referencedContract'].includes(key)),
      ...(schema.schemaReferenceChain ? ['$ref'] : []),
    ])].sort() };
}

export function apiFieldCollectionAuthority(apiVersion, kind, fieldPath) {
  return apiFieldSchemaAuthority(apiVersion, kind, fieldPath, { includeCollectionContract: true });
}

// Enumerate schema boundaries independently of the selected manifest values.
// A receiver registry can join these paths to authored semantics, so an unused
// alternative or a newly added nested field cannot silently escape coverage.
// This is schema evidence only; enumeration does not qualify runtime behavior.
export function apiResourceFieldBoundaries(apiVersion, kind) {
  const builtin = builtinDefinitions.get(`${apiVersion}/${kind}`);
  const schema = builtin ? kubernetesOpenApi.definitions[builtin]
    : loadCustomResourceSchemas().get(`${apiVersion}/${kind}`)?.schema;
  assert(schema, `API_SCHEMA_AUTHORITY_MISSING: ${apiVersion}/${kind}`);
  const authority = apiFieldCollectionAuthority(apiVersion, kind, '$');
  const boundaries = [];
  function hasStructure(branch) {
    if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return false;
    if (branch.$ref || branch.properties || branch.patternProperties || branch.items
      || typeof branch.additionalProperties === 'object') return true;
    return ['allOf', 'anyOf', 'oneOf'].some((key) => (branch[key] ?? []).some(hasStructure))
      || ['not', 'if', 'then', 'else'].some((key) => hasStructure(branch[key]))
      || ['dependentSchemas', 'dependencies'].some((key) => Object.values(branch[key] ?? {}).some(hasStructure));
  }
  function visit(raw, tokens, ancestors) {
    const identity = resolveReference(raw);
    const fieldPath = yamlFieldPath(tokens, { arrayWildcard: true });
    assert(identity, `API_SCHEMA_BOUNDARY_MISSING: ${apiVersion}/${kind} ${fieldPath}`);
    assert(!ancestors.has(identity), `API_SCHEMA_RECURSIVE_BOUNDARY_UNQUALIFIED: ${apiVersion}/${kind} ${fieldPath}`);
    const node = resolveCollectionReference(raw);
    const contract = apiSchemaNodeContract(node);
    // The pinned Cilium direction alternatives redeclare existing properties
    // as {} and require their presence. They add no child boundary; retain the
    // complete alternative in the parent contract. Other structural variants
    // need a separately qualified traversal, rather than silent flattening.
    assert(!Object.keys(node.patternProperties ?? {}).length,
      `API_SCHEMA_PATTERN_BOUNDARY_UNQUALIFIED: ${apiVersion}/${kind} ${fieldPath}`);
    const alternatives = [
      ...['allOf', 'anyOf', 'oneOf'].flatMap((key) => (node[key] ?? []).map((branch) => [key, branch])),
      ...['not', 'if', 'then', 'else'].filter((key) => node[key]).map((key) => [key, node[key]]),
      ...['dependentSchemas', 'dependencies'].flatMap((key) => Object.values(node[key] ?? {}).map((branch) => [key, branch])),
    ];
    for (const [keyword, branch] of alternatives) {
      if (!hasStructure(branch)) continue;
      const presenceOnly = Object.keys(branch).every((key) => ['properties', 'required'].includes(key))
        && Object.entries(branch.properties ?? {}).every(([name, child]) =>
          Object.hasOwn(node.properties ?? {}, name) && Object.keys(child).length === 0)
        && (branch.required ?? []).every((name) => Object.hasOwn(node.properties ?? {}, name));
      assert(presenceOnly,
        `API_SCHEMA_COMPOSITION_BOUNDARY_UNQUALIFIED: ${apiVersion}/${kind} ${fieldPath} ${keyword}`);
    }
    boundaries.push({ apiVersion, kind, fieldPath, authority: authority.authority,
      authoritySha256: authority.authoritySha256, contract });
    const next = new Set(ancestors).add(identity);
    for (const [name, child] of Object.entries(node.properties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      visit(child, [...tokens, name], next);
    }
    if (node.items) {
      assert(!Array.isArray(node.items), `API_SCHEMA_TUPLE_BOUNDARY_UNQUALIFIED: ${apiVersion}/${kind} ${fieldPath}`);
      visit(node.items, [...tokens, '[]'], next);
    }
    if (typeof node.additionalProperties === 'object') visit(node.additionalProperties, [...tokens, '*'], next);
  }
  visit(schema, [], new Set());
  return boundaries;
}

export function apiAuthorityLock() {
  return manifest;
}
