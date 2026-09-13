import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, dump } from 'js-yaml';
import { verifyQdrantSnapshot } from './qdrant-snapshot.mjs';
import { validateQdrantCredentials, validateQdrantCertificate } from './qdrant-secrets.mjs';

export function requireQdrantRestoreVersion(manifest, actualVersion, selectedVersion) {
  if (selectedVersion === undefined) {
    if (actualVersion !== manifest.version) throw new Error('QDRANT_RESTORE_VERSION_MISMATCH');
    return;
  }
  if (manifest.kind !== 'full-storage' || !/^\d+\.\d+\.\d+$/.test(selectedVersion)
    || selectedVersion !== actualVersion) throw new Error('QDRANT_FULL_STORAGE_MIGRATION_REQUIRED');
  const source = manifest.version.split('.').map(Number); const target = selectedVersion.split('.').map(Number);
  if (source[0] !== target[0] || target[1] < source[1] || target[1] > source[1] + 1
    || (target[1] === source[1] && target[2] <= source[2])) throw new Error('QDRANT_CONSECUTIVE_FORWARD_UPGRADE_REQUIRED');
}

/** Start a fresh isolated peer; version changes require explicit full-storage migration. */
export async function startQdrantSnapshotRestore(options) {
  const { backup, binary, directory, httpPort, grpcPort, tls, keyFile, readOnlyKeyFile } = options;
  for (const port of [httpPort, grpcPort]) {
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('QDRANT_RESTORE_PORT_INVALID');
  }
  if (httpPort === grpcPort || !path.isAbsolute(binary)) throw new Error('QDRANT_RESTORE_CONFIGURATION_INVALID');
  const manifest = await verifyQdrantSnapshot(backup);
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
  if (!/^qdrant \d+\.\d+\.\d+$/.test(version)) throw new Error('QDRANT_BINARY_VERSION_INVALID');
  requireQdrantRestoreVersion(manifest, version.slice('qdrant '.length), options.migrateToVersion);
  const auth = { 'api-key': fs.readFileSync(keyFile, 'utf8').trim(), 'read-only-api-key': fs.readFileSync(readOnlyKeyFile, 'utf8').trim() };
  validateQdrantCredentials(auth);
  for (const key of ['cert', 'key', 'ca_cert']) {
    if (!path.isAbsolute(tls[key])) throw new Error('QDRANT_RESTORE_TLS_PATH_INVALID');
    fs.accessSync(tls[key], fs.constants.R_OK);
  }
  validateQdrantCertificate({ 'tls.crt': fs.readFileSync(tls.cert, 'utf8'), 'tls.key': fs.readFileSync(tls.key, 'utf8'),
    'ca.crt': fs.readFileSync(tls.ca_cert, 'utf8') }, 'localhost');
  const base = load(fs.readFileSync(new URL('../my-values/infra/qdrant-values.yaml', import.meta.url), 'utf8')).config;
  fs.mkdirSync(directory, { mode: 0o700 }); // Never merge, truncate, or force-replace an existing store.
  const imported = path.join(directory, 'verified-backup');
  fs.mkdirSync(imported, { mode: 0o700 });
  fs.copyFileSync(path.join(backup, manifest.snapshot.file), path.join(imported, manifest.snapshot.file), fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(imported, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
  await verifyQdrantSnapshot(imported); // Launch from the private copy, not from a replaceable shared backup path.
  const config = { ...base, telemetry_disabled: true, tls,
    service: { ...base.service, host: '127.0.0.1', http_port: httpPort, grpc_port: grpcPort },
    cluster: { enabled: false }, storage: { storage_path: path.resolve(directory, 'storage'),
      snapshots_path: path.resolve(directory, 'snapshots'), performance: { max_search_threads: 2, max_optimization_threads: 1 } } };
  const file = path.resolve(directory, 'restore.yaml');
  fs.writeFileSync(file, dump(config), { flag: 'wx', mode: 0o600 });
  const snapshot = path.resolve(imported, manifest.snapshot.file);
  const restore = manifest.kind === 'full-storage' ? ['--storage-snapshot', snapshot] : ['--snapshot', snapshot + ':' + manifest.collection];
  return spawn(binary, ['--config-path', file, ...restore], {
    cwd: path.resolve(directory), stdio: ['ignore', 'pipe', 'pipe'],
    env: { QDRANT__SERVICE__API_KEY: auth['api-key'], QDRANT__SERVICE__READ_ONLY_API_KEY: auth['read-only-api-key'] },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: qdrant-restore.mjs OPTIONS_JSON_FILE');
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const child = await startQdrantSnapshotRestore(options);
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
  process.on('SIGINT', () => child.kill('SIGINT')); process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', () => { process.stderr.write('QDRANT_RESTORE_PROCESS_FAILED\n'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code === 0 ? 0 : 1; });
}
