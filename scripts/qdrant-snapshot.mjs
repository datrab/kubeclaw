import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { qdrantClient } from './qdrant-client.mjs';

const maximumSnapshotBytes = 64 * 1024 * 1024 * 1024;

/** Full single-node storage snapshot. Writers must be fenced for a cutover. */
export async function exportQdrantStorageSnapshot(options) {
  const client = qdrantClient(options);
  const version = (await client.json('/')).version;
  const cluster = (await client.json('/cluster')).result;
  if (cluster.status !== 'disabled' && Object.keys(cluster.peers).length !== 1) throw new Error('QDRANT_FULL_SNAPSHOT_STANDALONE_REQUIRED');
  const collections = (await client.json('/collections')).result.collections;
  const aliases = (await client.json('/aliases')).result.aliases;
  if (cluster.status !== 'disabled') {
    for (const collection of collections) await requireStableLocalShards(client, `/collections/${encodeURIComponent(collection.name)}`);
  }
  const snapshot = (await client.json('/snapshots?wait=true', 'POST')).result;
  if (!/^[A-Za-z0-9_.-]+\.snapshot$/.test(snapshot.name)) throw new Error('QDRANT_SNAPSHOT_NAME_INVALID');
  fs.mkdirSync(options.directory, { mode: 0o700 });
  const digest = await client.download('/snapshots/' + encodeURIComponent(snapshot.name),
    path.join(options.directory, 'storage.snapshot'), maximumSnapshotBytes);
  if (snapshot.size !== digest.size || (snapshot.checksum && snapshot.checksum !== digest.sha256)) throw new Error('QDRANT_SNAPSHOT_DIGEST_MISMATCH');
  const manifest = { schemaVersion: 2, kind: 'full-storage', version, collections, aliases,
    createdAt: new Date().toISOString(), snapshot: { file: 'storage.snapshot', ...digest },
    consistency: 'single-node storage snapshot; cutover requires externally fenced writers and metadata changes' };
  durableWrite(path.join(options.directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  syncDirectory(options.directory); syncDirectory(path.dirname(path.resolve(options.directory)));
  return manifest;
}

async function requireStableLocalShards(client, prefix) {
  const placement = (await client.json(prefix + '/cluster')).result;
  if (placement.remote_shards.length !== 0 || placement.shard_transfers.length !== 0
    || (placement.resharding_operations?.length ?? 0) !== 0
    || placement.local_shards.some(shard => shard.state !== 'Active')) throw new Error('QDRANT_STABLE_LOCAL_SHARDS_REQUIRED');
}

/** Export one collection from the supported single-node deployment. Never delete server snapshots. */
export async function exportQdrantSnapshot(options) {
  const { collection, directory } = options;
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(collection)) throw new Error('QDRANT_COLLECTION_INVALID');
  const client = qdrantClient(options);
  const version = (await client.json('/')).version;
  const cluster = (await client.json('/cluster')).result;
  if (cluster.status !== 'disabled' && Object.keys(cluster.peers).length !== 1) throw new Error('QDRANT_SINGLE_NODE_REQUIRED');
  const prefix = `/collections/${encodeURIComponent(collection)}`;
  if (cluster.status !== 'disabled') await requireStableLocalShards(client, prefix);
  const collectionInfo = (await client.json(prefix)).result;
  const aliases = (await client.json(prefix + '/aliases')).result.aliases;
  const snapshot = (await client.json(prefix + '/snapshots?wait=true', 'POST')).result;
  if (!/^[A-Za-z0-9_.-]+\.snapshot$/.test(snapshot.name)) throw new Error('QDRANT_SNAPSHOT_NAME_INVALID');
  fs.mkdirSync(directory, { mode: 0o700 }); // Exclusive: a previous or incomplete backup is never overwritten.
  const digest = await client.download(prefix + '/snapshots/' + encodeURIComponent(snapshot.name),
    path.join(directory, 'collection.snapshot'), maximumSnapshotBytes);
  if (snapshot.size !== digest.size || (snapshot.checksum && snapshot.checksum !== digest.sha256)) throw new Error('QDRANT_SNAPSHOT_DIGEST_MISMATCH');
  const manifest = { schemaVersion: 1, version, collection, createdAt: new Date().toISOString(),
    snapshot: { file: 'collection.snapshot', ...digest }, aliases, collectionInfo,
    consistency: 'one-collection-snapshot; aliases and counts are observations, not a cross-store transaction' };
  durableWrite(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  syncDirectory(directory);
  syncDirectory(path.dirname(path.resolve(directory)));
  return manifest;
}

/** Validate all bytes before passing a snapshot to an offline fresh-store restore. */
export async function verifyQdrantSnapshot(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (!validManifestIdentity(manifest) || !/^\d+\.\d+\.\d+$/.test(manifest.version)
    || !Number.isSafeInteger(manifest.snapshot.size) || manifest.snapshot.size < 1 || manifest.snapshot.size > maximumSnapshotBytes
    || !/^[a-f0-9]{64}$/.test(manifest.snapshot.sha256)) throw new Error('QDRANT_MANIFEST_INVALID');
  const file = path.join(directory, manifest.snapshot.file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size !== manifest.snapshot.size) throw new Error('QDRANT_SNAPSHOT_SIZE_MISMATCH');
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  if (hash.digest('hex') !== manifest.snapshot.sha256) throw new Error('QDRANT_SNAPSHOT_DIGEST_MISMATCH');
  return manifest;
}

function validManifestIdentity(manifest) {
  if (manifest.schemaVersion === 1) return /^[A-Za-z0-9_-]{1,255}$/.test(manifest.collection) && manifest.snapshot?.file === 'collection.snapshot';
  return manifest.schemaVersion === 2 && manifest.kind === 'full-storage' && manifest.snapshot?.file === 'storage.snapshot'
    && Array.isArray(manifest.collections) && manifest.collections.every(item => /^[A-Za-z0-9_-]{1,255}$/.test(item.name))
    && new Set(manifest.collections.map(item => item.name)).size === manifest.collections.length
    && Array.isArray(manifest.aliases) && manifest.aliases.every(item => /^[A-Za-z0-9_-]{1,255}$/.test(item.alias_name)
      && manifest.collections.some(collection => collection.name === item.collection_name));
}

function durableWrite(file, content) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === 'export' && args.length === 5) {
    const [url, caFile, keyFile, collection, directory] = args;
    const result = await exportQdrantSnapshot({ url, caFile, keyFile, collection, directory });
    process.stdout.write(JSON.stringify({ collection: result.collection, sha256: result.snapshot.sha256 }) + '\n');
  } else if (operation === 'export-storage' && args.length === 4) {
    const [url, caFile, keyFile, directory] = args;
    const result = await exportQdrantStorageSnapshot({ url, caFile, keyFile, directory });
    process.stdout.write(JSON.stringify({ kind: result.kind, collections: result.collections.length, sha256: result.snapshot.sha256 }) + '\n');
  } else if (operation === 'verify' && args.length === 1) {
    const result = await verifyQdrantSnapshot(args[0]);
    process.stdout.write(JSON.stringify({ collection: result.collection, sha256: result.snapshot.sha256 }) + '\n');
  } else throw new Error('Usage: qdrant-snapshot.mjs export HTTPS_ORIGIN CA_FILE KEY_FILE COLLECTION NEW_DIRECTORY | export-storage HTTPS_ORIGIN CA_FILE KEY_FILE NEW_DIRECTORY | verify DIRECTORY');
}
