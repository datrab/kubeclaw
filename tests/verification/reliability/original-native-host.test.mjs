import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { declaredPipelineServices, materializePipelineGeneration } from '../../../scripts/updates/pipeline-generation.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

test('delivered INITIAL host capture uses immutable selected preparation before native lookup, never generated runtime/source policy', async t => {
  assert.equal(process.getuid?.(), 0, 'actual root, not spoofed native host acceptance');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'initial-native-host-role-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = path.join(root, 'role'), author = path.join(root, 'author'), output = path.join(root, 'generation');
  const publisher = path.join(root, 'publish');
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', path.join(repo, 'scripts/pipeline-publish.c'), '-o', publisher]);
  execFileSync(process.execPath, [path.join(repo, 'scripts/build-runtime-role-bundle.mjs'), 'buster', code,
    'a'.repeat(40), 'config-initial-native-host-fixture', '2026-10-14T00:00:00Z'], { cwd: repo, stdio: 'pipe' });
  fs.cpSync(path.join(repo, 'config'), author, { recursive: true });
  const services = declaredPipelineServices(author, { role: 'buster', namespace: 'kubeclaw', releaseName: 'agent-buster' });
  const materialized = await materializePipelineGeneration({ authorRoot: author, packageRoot: code, output, services, publisher });
  const foundation = path.join(code, 'skills/packages/plugin-foundation/config');
  const boot = await import(pathToFileURL(path.join(foundation, 'pipeline-boot.mjs')).href);
  const projection = await import(pathToFileURL(path.join(foundation, 'pipeline-composition.ts')).href);
  const closure = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-boot-closure.ts')).href);
  const config = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-config.ts')).href);
  const mount = path.join(root, 'transport'); fs.mkdirSync(mount);
  fs.cpSync(path.join(output, 'expected/buster-preparation'), path.join(mount, 'version-A'), { recursive: true });
  fs.symlinkSync('version-A', path.join(mount, '..data'));
  const capture = boot.capturePipelineBootReceipts(mount, path.join(output, 'system'), 'buster-preparation', code, '/app/skills');
  const inputCodec = await import(pathToFileURL(path.join(foundation, 'pipeline-input-set.ts')).href);
  assert.equal(materialized.inputGenerationSha256, inputCodec.hashPipelineInputSet(capture.identity.files.map(file => ({ relativePath: file.name, byteLength: file.byteLength, sha256: file.sha256 }))));
  const settings = projection.projectBusterSettings(capture, 'buster-preparation').preparation;
  assert.equal(settings.maximumOwnershipBytes, 16777216, 'original ownership cap is never enlarged');
  const lookedUp = [];
  const absentNative = new Proxy({}, { get(_target, name) { lookedUp.push(name); return undefined; } });
  assert.throws(() => closure.captureInitialBusterNativeHostFacts(capture, absentNative), /BUSTER_NATIVE_POOL_POLICY_REQUIRED/);
  assert.deepEqual(lookedUp, ['BUSTER_NATIVE_POOL_POLICY_FILE'], 'no runtime, source-key or authority ENV fallback before genuine host evidence');
  lookedUp.length = 0;
  assert.throws(() => closure.captureInitialBusterNativeHostFacts({ ...capture }, absentNative), /PIPELINE_VERIFIED_CAPTURE_REQUIRED/);
  assert.deepEqual(lookedUp, [], 'shape-identical receipt cannot probe native inputs');
  let forgedNativeRead = false;
  const fakeNative = { get pool() { forgedNativeRead = true; throw new Error('forged native getter'); } };
  assert.throws(() => config.originalNativeBusterHostPoolFile(fakeNative, settings), /VERIFIED_TRUST_CAPTURE_REQUIRED/);
  assert.throws(() => closure.captureOriginalBusterNativeHostFacts(capture, fakeNative), /VERIFIED_TRUST_CAPTURE_REQUIRED/);
  assert.equal(forgedNativeRead, false);
  for (const fake of [{ schemaVersion: 'buster-native-host-boot-facts.v1' }, { schemaVersion: 'buster-native-boot-facts.v1' }]) {
    assert.throws(() => closure.assertOriginalBusterNativeHostFacts(fake), /VERIFIED_HOST_FACTS_REQUIRED/);
    assert.throws(() => closure.assertOriginalBusterNativeBootFacts(fake), /VERIFIED_BOOT_FACTS_REQUIRED/);
  }
  // Real emitted immutable code/owner/source receipt route, but actual installed
  // host/node/cgroup/binaries are intentionally not fabricated here. No native
  // positive, publication/activation, replay or complete INITIAL acceptance.
});
