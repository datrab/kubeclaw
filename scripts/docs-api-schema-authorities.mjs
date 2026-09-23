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

assert(fs.existsSync(manifestPath) && fs.existsSync(checksumPath), 'version-bound API authority lock is missing; run this module with --refresh-api-authorities');
const manifestBytes = fs.readFileSync(manifestPath);
const [manifestChecksum, manifestName] = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/u);
assert.equal(manifestName, path.basename(manifestPath), 'API authority checksum names the wrong manifest');
assert.equal(sha256(manifestBytes), manifestChecksum, 'API authority manifest bytes changed');
const manifest = JSON.parse(manifestBytes);
const kubernetesCompressed = fs.readFileSync(path.join(repositoryRoot, manifest.kubernetes.path));
assert.equal(kubernetesCompressed.length, manifest.kubernetes.compressedSize, 'Kubernetes OpenAPI compressed byte count changed');
assert.equal(sha256(kubernetesCompressed), manifest.kubernetes.compressedSha256, 'Kubernetes OpenAPI compressed bytes changed');
const kubernetesBytes = gunzipSync(kubernetesCompressed);
assert.equal(sha256(kubernetesBytes), manifest.kubernetes.contentSha256, 'Kubernetes OpenAPI source bytes changed');
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
      `${authority.chartKey}: custom-resource authority does not match the vendored chart`);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-api-crd-'));
    try {
      const unpack = spawnSync('tar', ['-xzf', path.join(repositoryRoot, archive.path), '-C', temporary], { encoding: 'utf8' });
      assert.equal(unpack.status, 0, `${authority.chartKey}: cannot extract vendored CRD authority`);
      const documents = [];
      if (authority.crds) {
        for (const crd of Object.values(authority.crds)) {
          const compressed = fs.readFileSync(path.join(repositoryRoot, crd.path));
          assert.equal(compressed.length, crd.compressedSize, `${authority.chartKey}: compressed CRD byte count changed`);
          assert.equal(sha256(compressed), crd.compressedSha256, `${authority.chartKey}: compressed CRD bytes changed`);
          const bytes = gunzipSync(compressed);
          assert.equal(sha256(bytes), crd.contentSha256, `${authority.chartKey}: CRD source bytes changed`);
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

export function apiFieldSchemaAuthority(apiVersion, kind, fieldPath) {
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
  let current = resolveReference(schema);
  const resolved = [];
  let requiredBySchema = false;
  for (let index = 0; index < fieldTokens.length; index += 1) {
    const token = fieldTokens[index];
    current = resolveReference(current);
    if (token === '[]') current = resolveReference(current?.items);
    else if (current?.properties?.[token]) {
      requiredBySchema = Array.isArray(current.required) && current.required.includes(token);
      current = resolveReference(current.properties[token]);
    }
    else if (typeof current?.additionalProperties === 'object') {
      current = resolveReference(current.additionalProperties);
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
  };
}

export function apiAuthorityLock() {
  return manifest;
}
