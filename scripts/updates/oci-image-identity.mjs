import crypto from 'node:crypto';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const INDEX_TYPES = new Set(['application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json']);
const MANIFEST_TYPES = new Set(['application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json']);
const CONFIG_TYPES = new Set(['application/vnd.oci.image.config.v1+json',
  'application/vnd.docker.container.image.v1+json']);

function validDigest(value) {
  return typeof value === 'string' && value.length === 71 && DIGEST.test(value);
}
function descriptor(value, types) {
  if (!value || !validDigest(value.digest) || !Number.isSafeInteger(value.size)
    || value.size < 1 || !types.has(value.mediaType)) throw new Error('OCI_DESCRIPTOR_INVALID');
  return value;
}
function document(bytes, expectedDigest, expectedSize, maximumBytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maximumBytes
    || (expectedSize !== undefined && bytes.length !== expectedSize)) throw new Error('OCI_DESCRIPTOR_SIZE_MISMATCH');
  if (`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== expectedDigest) {
    throw new Error('OCI_DESCRIPTOR_DIGEST_MISMATCH');
  }
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('OCI_DOCUMENT_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OCI_DOCUMENT_INVALID');
  return value;
}
function matchesPlatform(actual, selected) {
  return actual?.os === selected.os && actual?.architecture === selected.architecture
    && (selected.variant === undefined || actual.variant === selected.variant);
}
function platformField(value) {
  return typeof value === 'string' && value === value.trim() && /^[a-z0-9_.-]+$/u.test(value);
}
function platformValue(value) {
  if (!value || !platformField(value.os) || !platformField(value.architecture)
    || (value.variant !== undefined && !platformField(value.variant))) throw new Error('OCI_PLATFORM_REQUIRED');
  return value;
}

async function selectedManifest(root, rootDigest, selected, read, maximumBytes) {
  if (root.schemaVersion !== 2) throw new Error('OCI_SCHEMA_VERSION_UNSUPPORTED');
  if (!INDEX_TYPES.has(root.mediaType)) return { manifest: root, manifestDigest: rootDigest };
  if (!Array.isArray(root.manifests) || root.manifests.length > 1024) throw new Error('OCI_INDEX_INVALID');
  const candidates = root.manifests.filter(entry => matchesPlatform(entry?.platform, selected));
  if (candidates.length !== 1) throw new Error('OCI_PLATFORM_SELECTION_NOT_UNIQUE');
  // Nested indexes are not silently flattened or treated as runnable manifests.
  const child = descriptor(candidates[0], MANIFEST_TYPES);
  const manifest = document(await read('manifest', child.digest), child.digest, child.size, maximumBytes);
  if (manifest.mediaType !== child.mediaType) throw new Error('OCI_DESCRIPTOR_MEDIA_TYPE_MISMATCH');
  return { manifest, manifestDigest: child.digest, indexPlatform: child.platform };
}

function validateRootfs(manifest, config) {
  if (config.rootfs?.type !== 'layers' || !Array.isArray(config.rootfs.diff_ids)
    || config.rootfs.diff_ids.length !== manifest.layers.length
    || config.rootfs.diff_ids.some(digest => !validDigest(digest))) throw new Error('OCI_ROOTFS_CONFIG_INVALID');
  for (const layer of manifest.layers) {
    if (!layer || !validDigest(layer.digest) || !Number.isSafeInteger(layer.size) || layer.size < 0
      || typeof layer.mediaType !== 'string') throw new Error('OCI_LAYER_DESCRIPTOR_INVALID');
  }
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 2 || !MANIFEST_TYPES.has(manifest.mediaType)
    || manifest.artifactType !== undefined || !Array.isArray(manifest.layers)) {
    throw new Error('OCI_RUNNABLE_MANIFEST_REQUIRED');
  }
}

function validateConfigPlatform(config, selected, indexPlatform) {
  platformValue(config);
  if (indexPlatform) {
    if (config.os !== indexPlatform.os || config.architecture !== indexPlatform.architecture
      || (config.variant !== undefined && config.variant !== indexPlatform.variant)) {
      throw new Error('OCI_CONFIG_PLATFORM_MISMATCH');
    }
  } else if (!matchesPlatform(config, selected)) throw new Error('OCI_CONFIG_PLATFORM_MISMATCH');
}

/** Resolve byte-verified descriptor relationships, never a running-container verdict. */
export async function resolveOciImageIdentity({ image, platform, read, maximumBytes = 4 * 1024 * 1024 }) {
  const selected = platformValue(platform);
  const separator = typeof image === 'string' ? image.lastIndexOf('@') : -1;
  const rootDigest = separator < 1 ? undefined : image.slice(separator + 1);
  if (!validDigest(rootDigest)) throw new Error('OCI_IMMUTABLE_IMAGE_REQUIRED');
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 16 * 1024 * 1024) {
    throw new Error('OCI_MAXIMUM_BYTES_INVALID');
  }
  const root = document(await read('manifest', rootDigest), rootDigest, undefined, maximumBytes);
  const { manifest, manifestDigest, indexPlatform } = await selectedManifest(root, rootDigest, selected, read, maximumBytes);
  validateManifest(manifest);
  const configDescriptor = descriptor(manifest.config, CONFIG_TYPES);
  const config = document(await read('blob', configDescriptor.digest), configDescriptor.digest,
    configDescriptor.size, maximumBytes);
  validateConfigPlatform(config, selected, indexPlatform);
  validateRootfs(manifest, config);
  return Object.freeze({ image, platform: Object.freeze({ os: config.os, architecture: config.architecture,
    ...(indexPlatform?.variant === undefined ? {} : { variant: indexPlatform.variant }),
    ...(config.variant === undefined ? {} : { variant: config.variant }) }),
  ...(manifestDigest === rootDigest ? {} : { indexDigest: rootDigest }),
  manifestDigest, configDigest: configDescriptor.digest });
}
