import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const owners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'];
function seal(directory) {
  fs.chmodSync(directory, 0o755);
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isDirectory()) seal(file);
    else if (stat.isFile()) fs.chmodSync(file, stat.mode & 0o111 ? 0o555 : 0o444);
    else if (stat.isSymbolicLink()) fs.lchownSync(file, 0, 0);
  }
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.chmodSync(file, 0o644);
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
  fs.chmodSync(file, 0o444);
}
async function fixture(t) {
  assert.equal(process.getuid?.(), 0, 'root-owned image-file controls require real UID 0; no identity spoof');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-boot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = path.join(root, 'code'), reader = path.join(code, 'skills/packages/plugin-foundation/config');
  fs.mkdirSync(path.dirname(reader), { recursive: true });
  fs.cpSync(path.join(repo, 'skills/common/plugin-runtime/foundation/config'), reader, { recursive: true });
  for (const file of ['digest.ts', 'errors.ts']) {
    const target = path.join(path.dirname(reader), 'registry', file); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repo, 'skills/common/plugin-runtime/foundation/registry', file), target);
  }
  const sdk = path.join(code, 'skills/packages/plugin-sdk');
  fs.cpSync(path.join(repo, 'skills/common/plugin-runtime/sdk'), sdk, { recursive: true });
  const modules = path.join(code, 'skills/node_modules');
  fs.mkdirSync(path.join(modules, '@kubeclaw'), { recursive: true });
  fs.symlinkSync('../../packages/plugin-sdk', path.join(modules, '@kubeclaw/plugin-sdk'));
  fs.symlinkSync('../../packages/plugin-foundation', path.join(modules, '@kubeclaw/plugin-foundation'));
  const dependencies = ['ms', 'yaml', 'ajv', 'ajv-formats', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string'];
  for (const name of dependencies) fs.cpSync(path.join(repo, 'node_modules', name), path.join(modules, name), { recursive: true, dereference: true });
  fs.writeFileSync(path.join(code, 'skills/runtime.ts'), fs.readFileSync(path.join(repo, 'skills/prism/runtime.ts')));
  seal(code);
  const boot = await import(pathToFileURL(path.join(reader, 'pipeline-boot.mjs')).href);
  const captureModule = await import(pathToFileURL(path.join(reader, 'swarm.ts')).href);
  const receiptModule = await import(pathToFileURL(path.join(reader, 'pipeline-generation.ts')).href);
  const packageModule = await import(pathToFileURL(path.join(reader, 'runtime-bundle-receipt.mjs')).href);
  const codec = await import(pathToFileURL(path.join(sdk, 'src/values.ts')).href);
  const system = path.join(root, 'system'); fs.mkdirSync(path.join(system, 'components'), { recursive: true });
  fs.mkdirSync(path.join(system, 'selections'));
  const selection = { role: 'prism', serviceInstanceId: 'test.release/studio', callerId: 'prism-studio',
    bindings: [{ owner: 'prism-studio', instanceId: 'test.release/studio', profileId: 'standard' }] };
  // Start with the actual sole author, retaining its declared version and root fields.
  // Only the explicit fixture service bindings and copied relative paths change.
  const entry = JSON.parse(fs.readFileSync(path.join(repo, 'config/pipeline.config.json'), 'utf8'));
  entry.components = Object.fromEntries(owners.map(owner => [owner, `components/${owner}.config.json`]));
  entry.bindings = selection.bindings.map(binding => ({ ...binding, role: 'prism' }));
  write(path.join(system, 'pipeline.config.json'), entry);
  for (const owner of owners) {
    const original = JSON.parse(fs.readFileSync(path.join(repo, 'config/components', `${owner}.config.json`), 'utf8'));
    write(path.join(system, `components/${owner}.config.json`), original);
  }
  const files = packageModule.runtimeBundleFiles(code);
  const records = (name, target) => ({ id: name, kind: 'node-package', sourceDigest: hash(Buffer.from(name)),
    packageName: `@kubeclaw/${name}`, files: files.filter(file => file.kind === 'file' && file.path.startsWith(`${target}/`)).length, target });
  const manifest = { schemaVersion: 'pipeline-runtime-bundle.v2', contractVersion: 'test-fixture.v1',
    bundleKind: 'app-skills-package-set', role: 'prism', commit: 'a'.repeat(40), builtAt: '2026-10-14T00:00:00Z',
    runtimeSurface: '/app/prism/skills', entrypoint: '/app/prism/skills/runtime.ts',
    packages: [{ id: 'prism-runtime', kind: 'entrypoint', sourceDigest: hash(Buffer.from('prism-runtime')), files: 1 }, records('plugin-sdk', 'skills/packages/plugin-sdk'), records('plugin-foundation', 'skills/packages/plugin-foundation')],
    plugins: [], dependencies: dependencies.map(name => { const { id: _id, kind: _kind, packageName: _packageName, ...record } = records(name, `skills/node_modules/${name}`); return { name, version: JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'))).version, ...record }; }),
    externalCapabilities: [], files };
  const expectedMount = path.join(root, 'delivery'); fs.mkdirSync(expectedMount);
  fs.mkdirSync(path.join(expectedMount, 'version-A'));
  fs.symlinkSync('version-A', path.join(expectedMount, '..data'));
  function publishReceipts(packageValue = manifest) {
    write(path.join(system, 'package-receipt.json'), packageValue);
    const packageDigest = hash(fs.readFileSync(path.join(system, 'package-receipt.json')));
    const capture = captureModule.captureSwarmSettings(path.join(system, 'pipeline.config.json'), selection);
    const generation = receiptModule.createPipelineGenerationReceipt(capture);
    const service = receiptModule.createPipelineServiceSelection(capture, 'prism-studio', packageDigest);
    write(path.join(system, 'selections/prism-studio.json'), service);
    write(path.join(system, 'image-receipt.json'), { schemaVersion: 'pipeline-image-generation.v1',
      generationDigest: generation.digest, packageReceiptDigest: packageDigest, selectionDigests: { 'prism-studio': service.digest } });
    const expected = { schemaVersion: 'pipeline-expected-delivery.v1', role: 'prism', serviceInstanceId: selection.serviceInstanceId,
      callerId: 'prism-studio', generationDigest: generation.digest, selectionDigest: service.digest,
      packageReceiptDigest: packageDigest, imageReceiptDigest: hash(fs.readFileSync(path.join(system, 'image-receipt.json'))) };
    write(path.join(expectedMount, 'version-A/expected-delivery.json'), expected);
    return { expected, service };
  }
  publishReceipts(); seal(system); seal(expectedMount);
  const load = () => boot.capturePipelineBootReceipts(expectedMount, system, 'prism-studio', code, '/app/prism/skills');
  return { root, code, system, expectedMount, boot, codec, packageModule, manifest, publishReceipts, load };
}

test('readonly packaged-reader core verifies complete receipts and installed code readback', async t => {
  const f = await fixture(t), capture = f.load();
  assert.equal(capture.components['prism-studio'].settings.port, 8080);
  f.boot.assertPipelineBootCapture(capture, 'prism-studio');
  assert.throws(() => f.boot.assertPipelineBootCapture({ ...capture }, 'prism-studio'), /VERIFIED_CAPTURE_REQUIRED/);
  assert.throws(() => f.boot.assertPipelineBootCapture(capture, 'prism-worker'), /VERIFIED_CAPTURE_REQUIRED/);
});

test('self-consistent hashes do not validate a two-field fake package manifest', async t => {
  const f = await fixture(t);
  f.publishReceipts({ schemaVersion: 'pipeline-runtime-bundle.v1', role: 'prism' });
  assert.throws(f.load, /PACKAGE_RECEIPT_INVALID/);
});

test('changed installed code and additional unreceipted code files reject', async t => {
  const f = await fixture(t), file = path.join(f.code, 'skills/runtime.ts');
  fs.chmodSync(file, 0o644);
  fs.writeFileSync(file, '// changed code\n');
  fs.chmodSync(file, 0o444);
  assert.throws(f.load, /PACKAGE_READBACK_MISMATCH/);
});

test('stale expected generation cannot admit changed profile content', async t => {
  const f = await fixture(t), file = path.join(f.system, 'components/prism-studio.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8')); author.profiles.standard.settings.port = 19089;
  write(file, author);
  assert.throws(f.load, /GENERATION_RECEIPT_MISMATCH/);
});

test('writable files and escaping expected-receipt atomic-writer target reject', async t => {
  const f = await fixture(t), file = path.join(f.system, 'image-receipt.json');
  fs.chmodSync(file, 0o664); assert.throws(f.load, /FILE_NOT_TRUSTED/); fs.chmodSync(file, 0o444);
  fs.unlinkSync(path.join(f.expectedMount, '..data'));
  fs.symlinkSync('../system', path.join(f.expectedMount, '..data'));
  assert.throws(f.load, /DELIVERY_ESCAPE/);
});


test('inventory retains early file observations until all members have been read', async t => {
  const f = await fixture(t), first = path.join(f.code, 'a.ts'), last = path.join(f.code, 'z.ts');
  fs.writeFileSync(first, 'first'); fs.writeFileSync(last, 'last'); seal(f.code);
  const original = fs.openSync;
  let mutated = false;
  fs.openSync = function(file, ...args) {
    if (file === last && !mutated) {
      mutated = true; fs.chmodSync(first, 0o644); fs.writeFileSync(first, 'other'); fs.chmodSync(first, 0o444);
    }
    return original.call(this, file, ...args);
  };
  try { assert.throws(() => f.packageModule.runtimeBundleFiles(f.code), /PACKAGE_CHANGED/); }
  finally { fs.openSync = original; }
  assert.equal(mutated, true);
});

test('package observations remain alive until boot capture is branded', async t => {
  const f = await fixture(t), target = path.join(f.code, 'skills/runtime.ts');
  const original = fs.openSync;
  let mutated = false;
  fs.openSync = function(file, ...args) {
    if (file === path.join(f.system, 'selections/prism-studio.json') && !mutated) {
      mutated = true; fs.chmodSync(target, 0o644); fs.writeFileSync(target, '// drift'); fs.chmodSync(target, 0o444);
    }
    return original.call(this, file, ...args);
  };
  try { assert.throws(f.load, /BOOT_RECEIPT_CHANGED/); }
  finally { fs.openSync = original; }
  assert.equal(mutated, true);
});

test('self-consistent receipts reject nonexistent facade and open metadata records', async t => {
  const f = await fixture(t);
  f.publishReceipts({ ...f.manifest, entrypoint: '/app/prism/skills/nonexistent.ts' });
  assert.throws(f.load, /PACKAGE_ENTRYPOINT_INVALID/);
  f.publishReceipts({ ...f.manifest, packages: f.manifest.packages.map(record => ({ ...record, arbitrary: true })) });
  assert.throws(f.load, /PACKAGE_RECORD_INVALID/);
});

test('an off-tree reader copy cannot borrow a genuine installed package receipt', async t => {
  const f = await fixture(t), source = path.join(f.code, 'skills/packages/plugin-foundation/config');
  const shadow = path.join(f.root, 'shadow/config');
  fs.mkdirSync(path.dirname(shadow), { recursive: true });
  fs.cpSync(source, shadow, { recursive: true });
  fs.cpSync(path.join(path.dirname(source), 'registry'), path.join(path.dirname(shadow), 'registry'), { recursive: true });
  fs.symlinkSync(path.join(f.code, 'skills/node_modules'), path.join(f.root, 'shadow/node_modules'));
  seal(path.join(f.root, 'shadow'));
  const offTree = await import(pathToFileURL(path.join(shadow, 'pipeline-boot.mjs')).href);
  assert.throws(() => offTree.capturePipelineBootReceipts(f.expectedMount, f.system, 'prism-studio', f.code,
    '/app/prism/skills'), /READER_RESOLUTION_MISMATCH/);
});

// Atomic-writer aliases are permitted at expected-delivery transport, never
// at the physical system author root. Keep the original generation race here.
test('expected-delivery alias replacement during boot rejects, next boot validates the selected receipt', async t => {
  const f = await fixture(t), originalCapture = f.load();
  const oldFile = path.join(f.expectedMount, 'version-A/expected-delivery.json');
  const replacement = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
  replacement.generationDigest = hash(Buffer.from('different-generation'));
  write(path.join(f.expectedMount, 'version-B/expected-delivery.json'), replacement);
  const oldRead = fs.readFileSync;
  let switched = false;
  fs.readFileSync = function(file, ...args) {
    const bytes = Reflect.apply(oldRead, this, [file, ...args]);
    if (typeof file === 'number' && !switched
      && fs.realpathSync(`/proc/self/fd/${file}`) === oldFile) {
      switched = true;
      fs.symlinkSync('version-B', path.join(f.expectedMount, '..next'));
      fs.renameSync(path.join(f.expectedMount, '..next'), path.join(f.expectedMount, '..data'));
    }
    return bytes;
  };
  try { assert.throws(f.load, /PIPELINE_PACKAGE_CHANGED/); }
  finally { fs.readFileSync = oldRead; }
  assert.equal(switched, true, 'real expected-delivery descriptor read was intercepted');
  assert.throws(f.load, /PIPELINE_IMAGE_RECEIPT_INVALID/);
  fs.symlinkSync('version-A', path.join(f.expectedMount, '..next'));
  fs.renameSync(path.join(f.expectedMount, '..next'), path.join(f.expectedMount, '..data'));
  const restored = f.load();
  assert.deepEqual(restored, originalCapture);
  f.boot.assertPipelineBootCapture(restored, 'prism-studio');
});
