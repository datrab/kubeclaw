import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
export const definitions = {
  vulnerability: { repository: 'ghcr.io/aquasecurity/trivy-db', tag: '2', directory: 'db', file: 'trivy.db', schema: 2,
    mediaType: 'application/vnd.aquasec.trivy.db.layer.v1.tar+gzip' },
  java: { repository: 'ghcr.io/aquasecurity/trivy-java-db', tag: '1', directory: 'java-db', file: 'trivy-java.db', schema: 1,
    mediaType: 'application/vnd.aquasec.trivy.javadb.layer.v1.tar+gzip' },
};
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function requireThat(value, message) { if (!value) throw new Error(`TRIVY_DB_${message}`); }
function descriptor(value, maximum) {
  requireThat(value && digestPattern.test(value.digest) && Number.isSafeInteger(value.size)
    && value.size > 0 && value.size <= maximum, 'DESCRIPTOR_INVALID');
}
export function validateDatabaseInputs(inputs) {
  requireThat(inputs && Object.keys(inputs).sort().join(',') === 'java,vulnerability', 'KINDS_INVALID');
  for (const [kind, definition] of Object.entries(definitions)) {
    const entry = inputs[kind];
    requireThat(entry && entry.repository === definition.repository, 'REPOSITORY_INVALID');
    descriptor(entry.manifest, 1048576); descriptor(entry.layer, 2 ** 31);
    requireThat(Object.keys(entry.files ?? {}).sort().join(',') === [definition.file, 'metadata.json'].sort().join(','), 'FILES_INVALID');
    for (const identity of Object.values(entry.files)) descriptor(identity, 8 * 2 ** 30);
  }
}
export function databaseLock(versions) {
  requireThat(/^\d+\.\d+\.\d+$/.test(versions.buildArgs?.TRIVY_VERSION), 'SCANNER_VERSION_INVALID');
  validateDatabaseInputs(versions.trivyDatabases);
  return { schemaVersion: 'trivy-database-lock.v1', scannerVersion: versions.buildArgs.TRIVY_VERSION, databases: versions.trivyDatabases };
}
function request(url, token, output, maximum = 1048576) {
  // Match the existing infrastructure OCI downloader: HTTPS only, bounded curl,
  // bearer token via stdin (never argv), no registry or tag fallback.
  return execFileSync('curl', ['--config', '-', '--fail', '--silent', '--show-error', '--location',
    '--proto', '=https', '--proto-redir', '=https', '--max-time', '600', '--max-filesize', String(maximum),
    '--header', 'Accept: application/vnd.oci.image.manifest.v1+json', ...(output ? ['--output', output] : []), url],
  { input: token ? `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}\n` : '', maxBuffer: 1048576,
    stdio: ['pipe', 'pipe', 'pipe'] });
}
export function registryReader(repository) {
  requireThat(Object.values(definitions).some(d => d.repository === repository), 'REPOSITORY_INVALID');
  const name = repository.slice('ghcr.io/'.length);
  const token = JSON.parse(request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${name}:pull`)).token;
  requireThat(typeof token === 'string' && /^[A-Za-z0-9._=-]+$/u.test(token), 'TOKEN_INVALID');
  return (kind, reference, output, maximum) => request(`https://ghcr.io/v2/${name}/${kind}/${reference}`, token, output, maximum);
}
export async function fileIdentity(file) {
  const digest = createHash('sha256'); let size = 0;
  for await (const bytes of fs.createReadStream(file)) { digest.update(bytes); size += bytes.length; }
  return { digest: `sha256:${digest.digest('hex')}`, size };
}
export function manifestLayer(bytes, expected, definition) {
  requireThat(bytes.length === expected.size && hash(bytes) === expected.digest, 'MANIFEST_DIGEST_MISMATCH');
  const value = JSON.parse(bytes);
  requireThat(value.schemaVersion === 2 && value.mediaType === 'application/vnd.oci.image.manifest.v1+json'
    && value.layers?.length === 1 && value.layers[0].mediaType === definition.mediaType, 'MANIFEST_INVALID');
  descriptor(value.layers[0], 2 ** 31);
  return { digest: value.layers[0].digest, size: value.layers[0].size };
}
function same(actual, expected, code) {
  requireThat(actual.digest === expected.digest && actual.size === expected.size, code);
}
export async function extractDatabase(archive, output, definition, files) {
  const options = { encoding: 'utf8', maxBuffer: 1048576 };
  const names = execFileSync('tar', ['-tzf', archive], options).trim().split('\n');
  const verbose = execFileSync('tar', ['-tzvf', archive], options).trim().split('\n');
  requireThat(names.sort().join(',') === [definition.file, 'metadata.json'].sort().join(',')
    && verbose.length === 2 && verbose.every(line => line.startsWith('-')), 'ARCHIVE_MEMBERS_INVALID');
  fs.mkdirSync(output);
  execFileSync('tar', ['-xzf', archive, '-C', output, '--no-same-owner', '--no-same-permissions']);
  const identities = {};
  for (const name of names) {
    const file = path.join(output, name);
    requireThat(fs.lstatSync(file).isFile(), 'EXTRACTED_FILE_INVALID');
    identities[name] = await fileIdentity(file);
    if (files) same(identities[name], files[name], 'FILE_DIGEST_MISMATCH');
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(output, 'metadata.json'), 'utf8'));
  requireThat(metadata.Version === definition.schema && Number.isFinite(Date.parse(metadata.UpdatedAt))
    && Date.parse(metadata.NextUpdate) > Date.parse(metadata.UpdatedAt), 'METADATA_INVALID');
  return identities;
}
export async function downloadDatabase(kind, entry, stage, read = registryReader(entry.repository)) {
  const definition = definitions[kind];
  const manifest = read('manifests', entry.manifest.digest);
  const layer = manifestLayer(manifest, entry.manifest, definition);
  same(layer, entry.layer, 'LAYER_DESCRIPTOR_MISMATCH');
  fs.writeFileSync(path.join(stage, `${kind}-manifest.json`), manifest);
  const archive = path.join(stage, `${kind}.tar.gz`);
  read('blobs', layer.digest, archive, layer.size);
  same(await fileIdentity(archive), layer, 'LAYER_DIGEST_MISMATCH');
  await extractDatabase(archive, path.join(stage, definition.directory), definition, entry.files);
}
export async function installDatabases(lock, destination, scannerVersion, readerFactory = registryReader) {
  requireThat(lock.schemaVersion === 'trivy-database-lock.v1', 'LOCK_VERSION_INVALID');
  requireThat(typeof scannerVersion === 'string' && /^\d+\.\d+\.\d+$/.test(scannerVersion)
    && lock.scannerVersion === scannerVersion, 'SCANNER_VERSION_MISMATCH');
  validateDatabaseInputs(lock.databases);
  const exists = () => { try { fs.lstatSync(destination); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
  requireThat(!exists(), 'DESTINATION_EXISTS');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const guard = `${destination}.installing`;
  fs.mkdirSync(guard);
  let temporary;
  try {
    requireThat(!exists(), 'DESTINATION_EXISTS');
    temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.trivy-lock-'));
    for (const [kind, entry] of Object.entries(lock.databases)) await downloadDatabase(kind, entry, temporary, readerFactory(entry.repository));
    // Both databases must pass before any cache is published. No timestamp edits.
    for (const name of fs.readdirSync(temporary)) if (!['db', 'java-db'].includes(name)) fs.rmSync(path.join(temporary, name));
    requireThat(!exists(), 'DESTINATION_EXISTS');
    fs.renameSync(temporary, destination);
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmdirSync(guard);
  }
}
export async function resolveDatabaseInputs(evidence) {
  fs.mkdirSync(evidence);
  const inputs = {};
  for (const [kind, definition] of Object.entries(definitions)) {
    const read = registryReader(definition.repository);
    const tagged = read('manifests', definition.tag);
    const manifest = { digest: hash(tagged), size: tagged.length };
    // Resolve the mutable tag once, then fetch the content-addressed manifest.
    const pinned = read('manifests', manifest.digest);
    const layer = manifestLayer(pinned, manifest, definition);
    fs.writeFileSync(path.join(evidence, `${kind}-manifest.json`), pinned);
    const archive = path.join(evidence, `${kind}.tar.gz`);
    read('blobs', layer.digest, archive, layer.size);
    same(await fileIdentity(archive), layer, 'LAYER_DIGEST_MISMATCH');
    const files = await extractDatabase(archive, path.join(evidence, definition.directory), definition);
    inputs[kind] = { repository: definition.repository, manifest, layer, files };
  }
  validateDatabaseInputs(inputs);
  return inputs;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, target, scannerVersion] = process.argv.slice(2);
  requireThat((mode === '--install' && process.argv.length === 5) || (mode === '--resolve' && process.argv.length === 4), 'USAGE: --install CACHE SCANNER_VERSION | --resolve NEW_EVIDENCE_DIRECTORY');
  if (mode === '--install') {
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'docker/trivy-databases.lock.json'), 'utf8'));
    const authored = databaseLock(JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8')));
    requireThat(JSON.stringify(lock) === JSON.stringify(authored), 'AUTHORING_DRIFT');
    await installDatabases(lock, path.resolve(target), scannerVersion);
  }
  else {
    const inputs = await resolveDatabaseInputs(path.resolve(target));
    fs.writeFileSync(path.join(target, 'trivy-databases.json'), JSON.stringify(inputs, null, 2) + '\n');
    console.log('Resolved and byte-verified both databases. Review trivy-databases.json before updating versions.json.');
  }
}
