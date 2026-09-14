import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveOciImageIdentity } from '../../../scripts/updates/oci-image-identity.mjs';
import { ghcrDescriptorReader } from '../../../scripts/updates/ghcr-descriptor-reader.mjs';

const indexType = 'application/vnd.oci.image.index.v1+json';
const manifestType = 'application/vnd.oci.image.manifest.v1+json';
const configType = 'application/vnd.oci.image.config.v1+json';
const selected = { os: 'linux', architecture: 'amd64' };
const reference = digest => `ghcr.io/example/kubeclaw-nova@${digest}`;
const hash = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function contentStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-descriptors-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = digest => path.join(root, digest.replace(':', '-'));
  const put = (value, mediaType, extra = {}) => {
    const bytes = Buffer.from(JSON.stringify(value));
    const digest = hash(bytes);
    fs.writeFileSync(file(digest), bytes);
    return { mediaType, digest, size: bytes.length, ...extra };
  };
  const requests = [];
  const read = async (kind, digest) => {
    requests.push({ kind, digest });
    return fs.readFileSync(file(digest));
  };
  return { put, read, file, requests };
}
function imageTree(store, { platform = selected, configPlatform = platform, configExtra = {}, manifestExtra = {} } = {}) {
  const config = store.put({ ...configPlatform, rootfs: { type: 'layers', diff_ids: [] },
    config: {}, ...configExtra }, configType);
  const manifest = store.put({ schemaVersion: 2, mediaType: manifestType, config, layers: [], ...manifestExtra },
    manifestType, { platform });
  return { config, manifest };
}
function index(store, manifests) {
  return store.put({ schemaVersion: 2, mediaType: indexType, manifests }, indexType);
}
async function resolve(store, root, platform = selected, options = {}) {
  return resolveOciImageIdentity({ image: reference(root.digest), platform, read: store.read, ...options });
}

test('raw OCI bytes prove distinct index, selected manifest and config relationships', async t => {
  const store = contentStore(t);
  const amd = imageTree(store);
  const arm = imageTree(store, { platform: { os: 'linux', architecture: 'arm64' } });
  const root = index(store, [arm.manifest, amd.manifest]);
  const result = await resolve(store, root);
  assert.deepEqual(result, { image: reference(root.digest), platform: selected, indexDigest: root.digest,
    manifestDigest: amd.manifest.digest, configDigest: amd.config.digest });
  assert.equal(new Set([result.indexDigest, result.manifestDigest, result.configDigest]).size, 3);
  assert.deepEqual(store.requests, [{ kind: 'manifest', digest: root.digest },
    { kind: 'manifest', digest: amd.manifest.digest }, { kind: 'blob', digest: amd.config.digest }]);
  assert.equal(result.runningContainerVerified, undefined);
  assert.equal(result.activeBundleVerified, undefined);
});

test('single platform manifest and index variant metadata are supported without inventing an index', async t => {
  const store = contentStore(t);
  const direct = imageTree(store);
  assert.equal((await resolve(store, direct.manifest)).indexDigest, undefined);
  const arm = imageTree(store, { platform: { os: 'linux', architecture: 'arm64', variant: 'v8' },
    configPlatform: { os: 'linux', architecture: 'arm64' } });
  assert.deepEqual((await resolve(store, index(store, [arm.manifest]), arm.manifest.platform)).platform,
    arm.manifest.platform);
  await assert.rejects(resolve(store, arm.manifest, arm.manifest.platform), /OCI_CONFIG_PLATFORM_MISMATCH/u);
});

test('same manifest/config digest is never inferred from a differently hashed document', async t => {
  for (const target of ['root', 'manifest', 'config']) {
    const store = contentStore(t);
    const tree = imageTree(store);
    const root = index(store, [tree.manifest]);
    const chosen = { root, ...tree }[target];
    const bytes = fs.readFileSync(store.file(chosen.digest));
    bytes[0] = 91;
    fs.writeFileSync(store.file(chosen.digest), bytes);
    await assert.rejects(resolve(store, root), /OCI_DESCRIPTOR_DIGEST_MISMATCH/u);
  }
});

test('descriptor sizes, media type and configured platform are independently checked', async t => {
  const store = contentStore(t);
  const tree = imageTree(store);
  await assert.rejects(resolve(store, index(store, [{ ...tree.manifest, size: tree.manifest.size + 1 }])),
    /OCI_DESCRIPTOR_SIZE_MISMATCH/u);
  await assert.rejects(resolve(store, index(store, [{ ...tree.manifest,
    mediaType: 'application/vnd.docker.distribution.manifest.v2+json' }])), /OCI_DESCRIPTOR_MEDIA_TYPE_MISMATCH/u);
  const foreign = imageTree(store, { configPlatform: { os: 'linux', architecture: 'arm64' } });
  await assert.rejects(resolve(store, index(store, [foreign.manifest])), /OCI_CONFIG_PLATFORM_MISMATCH/u);
  await assert.rejects(resolve(store, index(store, [tree.manifest]), selected, { maximumBytes: 1 }),
    /OCI_DESCRIPTOR_SIZE_MISMATCH/u);
});

test('absent, duplicate or nested platform selection cannot silently pick the first descriptor', async t => {
  const store = contentStore(t);
  const tree = imageTree(store);
  await assert.rejects(resolve(store, index(store, [])), /OCI_PLATFORM_SELECTION_NOT_UNIQUE/u);
  await assert.rejects(resolve(store, index(store, [tree.manifest, tree.manifest])), /OCI_PLATFORM_SELECTION_NOT_UNIQUE/u);
  const nested = index(store, [tree.manifest]);
  await assert.rejects(resolve(store, index(store, [{ ...nested, platform: selected }])), /OCI_DESCRIPTOR_INVALID/u);
});

test('artifact configs and malformed rootfs/layer relationships are rejected', async t => {
  const store = contentStore(t);
  for (const options of [
    { manifestExtra: { artifactType: 'application/example' } },
    { configExtra: { rootfs: { type: 'layers', diff_ids: ['not-a-digest'] } } },
    { manifestExtra: { layers: [null] }, configExtra: { rootfs: { type: 'layers', diff_ids: [hash('layer')] } } },
  ]) {
    await assert.rejects(resolve(store, imageTree(store, options).manifest),
      /OCI_(RUNNABLE_MANIFEST_REQUIRED|ROOTFS_CONFIG_INVALID|LAYER_DESCRIPTOR_INVALID)/u);
  }
});

test('registry adapter validates scope and limits before it can contact a registry', () => {
  const image = reference(hash('selected'));
  for (const wrong of [image.replace('ghcr.io', 'foreign.test'), `${image}\n`, image.split('@')[0]]) {
    assert.throws(() => ghcrDescriptorReader(wrong), /OCI_SELECTED_GHCR_IMAGE_REQUIRED/u);
  }
  assert.throws(() => ghcrDescriptorReader(image, { timeoutMs: Infinity }), /OCI_READER_LIMIT_INVALID/u);
  assert.throws(() => ghcrDescriptorReader(image, { maximumBytes: 0 }), /OCI_READER_LIMIT_INVALID/u);
});

test('protocol response fixture keeps token exchange scoped and strips auth from signed blob redirects', async () => {
  const image = reference(hash('selected'));
  const calls = [];
  const responses = [
    new Response('unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer realm="https://foreign.test/token"' } }),
    new Response(JSON.stringify({ token: 'unit-registry-bearer' })),
    new Response('manifest'),
    new Response(null, { status: 307, headers: { location: 'https://pkg-containers.githubusercontent.com/ghcr1/blob?signature=unit-only' } }),
    new Response('config'),
  ];
  const read = ghcrDescriptorReader(image, { fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    assert.ok(response, 'unexpected extra registry request');
    return response;
  } });
  assert.equal((await read('manifest', hash('selected'))).toString(), 'manifest');
  assert.equal((await read('blob', hash('config'))).toString(), 'config');
  assert.equal(new URL(calls[1].url).origin, 'https://ghcr.io');
  assert.equal(new URL(calls[1].url).searchParams.get('scope'), 'repository:example/kubeclaw-nova:pull');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer unit-registry-bearer');
  assert.equal(calls[3].options.headers.Authorization, 'Bearer unit-registry-bearer');
  assert.equal(calls[4].options.headers, undefined);
  assert.equal(calls.every(call => call.options.signal === calls[0].options.signal), true);
});

test('protocol response negatives reject arbitrary redirects and retain explicit credential failure', async () => {
  const image = reference(hash('selected'));
  for (const location of ['https://foreign.test/blob', 'http://pkg-containers.githubusercontent.com/blob',
    'https://user:password@pkg-containers.githubusercontent.com/blob']) {
    let calls = 0;
    const read = ghcrDescriptorReader(image, { fetch: async () => {
      calls += 1;
      return new Response(null, { status: 307, headers: { location } });
    } });
    await assert.rejects(read('blob', hash('config')), /OCI_BLOB_REDIRECT_DENIED/u);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const denied = ghcrDescriptorReader(image, { token: 'explicit-unit-bearer', fetch: async () => {
    calls += 1;
    return new Response('denied', { status: 401 });
  } });
  await assert.rejects(denied('manifest', hash('selected')), /OCI_REGISTRY_HTTP_401/u);
  assert.equal(calls, 1);
  assert.throws(() => ghcrDescriptorReader(image, { token: '' }), /OCI_REGISTRY_TOKEN_INVALID/u);
});

test('actual Response streams are cancelled on size failures and token JSON is not echoed', async () => {
  const image = reference(hash('selected'));
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; } });
  const read = ghcrDescriptorReader(image, { maximumBytes: 4, fetch: async () => new Response(body) });
  await assert.rejects(read('manifest', hash('selected')), /OCI_REGISTRY_RESPONSE_TOO_LARGE/u);
  assert.equal(cancelled, true);
  for (const tokenBody of ['{unit-secret-not-json', 'null', JSON.stringify({ token: '   ' })]) {
    const replies = [new Response(null, { status: 401 }), new Response(tokenBody)];
    const invalid = ghcrDescriptorReader(image, { fetch: async () => replies.shift() });
    await assert.rejects(invalid('manifest', hash('selected')), error =>
      error.message === 'OCI_REGISTRY_TOKEN_INVALID' && !String(error).includes('unit-secret'));
  }
});
