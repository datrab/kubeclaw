import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-repository-'));
const repository = path.join(temporary, 'repository');
const outside = path.join(temporary, 'outside.txt');
fs.mkdirSync(path.join(repository, 'nested'), { recursive: true });
fs.writeFileSync(path.join(repository, 'nested/file.txt'), 'real repository content');
fs.writeFileSync(path.join(repository, 'nested/file.ts'), 'export default 1;\n');
fs.writeFileSync(path.join(repository, 'nested/caller.ts'), "import value from './file.js';\nexport default value;\n");
fs.writeFileSync(path.join(repository, 'nested/caller-two.ts'), "export { default } from './file.js';\n");
fs.writeFileSync(path.join(repository, 'nested/caller-three.ts'),
  "import { /* rationale; */ default as value } from './file.js';\nexport default value;\n");
fs.writeFileSync(path.join(repository, 'nested/noisy.ts'), "export const fileName = 'file';\n");
for (let index = 0; index < 9; index += 1) {
  fs.writeFileSync(path.join(repository, `nested/noise-${index}.ts`), "export const fileName = 'file';\n");
}
fs.writeFileSync(path.join(repository, 'large.txt'), 'x'.repeat(65));
fs.writeFileSync(outside, 'outside');
fs.symlinkSync(outside, path.join(repository, 'escape.txt'));
execFileSync('git', ['init', '-q', repository]);
execFileSync('git', ['-C', repository, 'config', 'user.email', 'test@example.invalid']);
execFileSync('git', ['-C', repository, 'config', 'user.name', 'Test']);
execFileSync('git', ['-C', repository, 'add', '.']);
execFileSync('git', ['-C', repository, 'commit', '-qm', 'base']);
const base = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(repository, 'nested/file.txt'), 'updated repository content');
fs.writeFileSync(path.join(repository, 'added.txt'), 'added');
execFileSync('git', ['-C', repository, 'add', '.']);
execFileSync('git', ['-C', repository, 'commit', '-qm', 'head']);

const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const adapter = activate({
  registration: {},
  config: { repositoryRoot: repository, maxFileBytes: 64, maxChangedPaths: 8 },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const fenced = { fence: { assertCurrent() {} } };
function invoke(operation, canonicalId, payload = {}, signal = new AbortController().signal, requestAttempt = attempt) {
  return adapter.invoke({
    ...fenced,
    request: {
      requestId: `request:${canonicalId}`,
      idempotencyKey: `read:${canonicalId}`,
      attempt: requestAttempt,
      capability: 'git.repository.read',
      operation,
      resource: { type: 'git.repository.path', canonicalId },
      payload,
    },
    signal,
  });
}
const read = (canonicalId, signal) => invoke('read_text', canonicalId, {}, signal);

try {
  await adapter.ready();
  assert.deepEqual(await read('nested/file.txt'), {
    content: 'updated repository content',
    sizeBytes: 26,
    path: 'nested/file.txt',
  });
  await assert.rejects(read('../outside.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  await assert.rejects(read('escape.txt'), /REPOSITORY_PATH_FORBIDDEN/);
  await assert.rejects(read('missing.txt'), /REPOSITORY_FILE_NOT_FOUND/);
  await assert.rejects(read('nested'), /REPOSITORY_NOT_A_FILE/);
  await assert.rejects(read('large.txt'), /REPOSITORY_FILE_TOO_LARGE/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(read('nested/file.txt', cancelled.signal), /ADAPTER_CANCELLED/);
  fs.writeFileSync(path.join(repository, 'late.txt'), 'committed after adapter activation');
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'late stage change']);
  const stageHead = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const frozen = await invoke('freeze_head', '.');
  assert.deepEqual(await invoke('verify_ancestry', '.', { base, head: frozen.head, proof: frozen.proof }),
    { base, head: frozen.head, ancestryVerified: true });
  assert.equal(frozen.head, stageHead, 'head freezes when review starts, not when the adapter activates');
  assert.match(frozen.proof, /^[0-9a-f]{64}$/u);
  const revision = { head: frozen.head, proof: frozen.proof };
  fs.writeFileSync(path.join(repository, 'after-freeze.txt'), 'not part of the frozen review');
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'after freeze']);
  const manifest = await invoke('changed_manifest', '.', { base, ...revision, allowedPrefixes: ['.'] });
  assert.equal(manifest.base, base);
  assert.equal(manifest.head, stageHead);
  assert.deepEqual(manifest.changedPaths, [
    { path: 'added.txt', status: 'added' },
    { path: 'late.txt', status: 'added' },
    { path: 'nested/file.txt', status: 'modified' },
  ]);
  const scopedManifest = await invoke('changed_manifest', '.', {
    base, ...revision, allowedPrefixes: ['nested'],
  });
  assert.deepEqual(scopedManifest.changedPaths, [
    { path: 'nested/file.txt', status: 'modified' },
  ]);
  await assert.rejects(
    invoke('changed_manifest', '.', { base, ...revision }), /REPOSITORY_SCOPE_INVALID/u,
  );
  assert.match(manifest.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
  const listed = await invoke('list_revision_paths', '.', {
    ...revision, allowedPrefixes: ['nested'], maxPaths: 16,
  });
  assert.equal(listed.head, stageHead);
  assert.equal(listed.paths.includes('nested/caller.ts'), true);
  assert.equal(listed.paths.includes('nested/file.ts'), true);
  assert.equal(listed.pathsDigest, sha256Text(canonicalJson(listed.paths)));
  const inventory = await invoke('inventory_revision', '.', {
    ...revision, allowedPrefixes: ['nested'], maxPaths: 32,
  });
  assert.equal(inventory.head, stageHead);
  assert.deepEqual(inventory.files.map(({ path: file }) => file), listed.paths);
  assert.equal(inventory.files.every(({ objectId, mode, sizeBytes }) => (
    /^[0-9a-f]{40}$/u.test(objectId) && /^\d{6}$/u.test(mode)
      && Number.isSafeInteger(sizeBytes) && sizeBytes >= 0
  )), true);
  assert.equal(inventory.inventoryDigest, sha256Text(canonicalJson(inventory.files)));
  const references = await invoke('find_revision_references', '.', {
    ...revision, allowedPrefixes: ['.'], sourcePaths: ['nested/file.ts'], maxPaths: 16,
  });
  assert.deepEqual(references.references, [
    { path: 'nested/caller-three.ts', sourcePath: 'nested/file.ts' },
    { path: 'nested/caller-two.ts', sourcePath: 'nested/file.ts' },
    { path: 'nested/caller.ts', sourcePath: 'nested/file.ts' },
  ]);
  assert.equal(references.referencesDigest, sha256Text(canonicalJson(references.references)));
  await assert.rejects(invoke('find_revision_references', '.', {
    ...revision, allowedPrefixes: ['.'], sourcePaths: ['nested/file.ts'], maxPaths: 1,
  }), /REPOSITORY_REFERENCE_LIMIT_EXCEEDED/u);
  const frozenObjectId = execFileSync('git', ['-C', repository, 'rev-parse', `${stageHead}:nested/file.txt`],
    { encoding: 'utf8' }).trim();
  assert.deepEqual(await invoke('read_revision_text', 'nested/file.txt', {
    ...revision, allowedPrefixes: ['nested'], expectedObjectId: frozenObjectId, expectedSizeBytes: 26,
  }), {
    path: 'nested/file.txt', head: stageHead, content: 'updated repository content',
    objectId: frozenObjectId, sizeBytes: 26,
    digest: sha256Text('updated repository content'),
  });
  await assert.rejects(invoke('read_revision_text', 'nested/file.txt', {
    ...revision, allowedPrefixes: ['nested'], expectedObjectId: '0'.repeat(40), expectedSizeBytes: 26,
  }), /REPOSITORY_OBJECT_ID_MISMATCH/u);
  await assert.rejects(invoke('read_revision_text', 'nested/file.txt', {
    ...revision, allowedPrefixes: ['nested'], expectedObjectId: frozenObjectId, expectedSizeBytes: 25,
  }), /REPOSITORY_FILE_SIZE_MISMATCH/u);
  await assert.rejects(invoke('read_revision_text', 'added.txt', {
    ...revision, allowedPrefixes: ['nested'],
  }), /REPOSITORY_PATH_OUT_OF_SCOPE/u);
  assert.deepEqual(await invoke('changed_line_ranges', 'nested/file.txt', { base, ...revision }), {
    base, head: stageHead, path: 'nested/file.txt', ranges: [{ start: 1, end: 1 }],
    rangesDigest: sha256Text(canonicalJson([{ start: 1, end: 1 }])),
  });
  assert.deepEqual(await invoke('changed_line_ranges', 'added.txt', { base, ...revision }), {
    base, head: stageHead, path: 'added.txt', ranges: [{ start: 1, end: 1 }],
    rangesDigest: sha256Text(canonicalJson([{ start: 1, end: 1 }])),
  });
  await assert.rejects(
    invoke('changed_line_ranges', 'nested/file.txt', { base, head: stageHead, proof: '0'.repeat(64) }),
    /REPOSITORY_REVISION_PROOF_INVALID/u,
  );
  await assert.rejects(
    invoke('read_revision_text', 'nested/file.txt', { head: base, proof: frozen.proof, allowedPrefixes: ['nested'] }),
    /REPOSITORY_REVISION_PROOF_INVALID/u,
  );
  await assert.rejects(
    invoke('read_revision_text', 'nested/file.txt', { head: stageHead, proof: '0'.repeat(64), allowedPrefixes: ['nested'] }),
    /REPOSITORY_REVISION_PROOF_INVALID/u,
  );
  await assert.rejects(
    invoke('read_revision_text', 'nested/file.txt', { ...revision, allowedPrefixes: ['nested'] }, new AbortController().signal, {
      ...attempt, attemptId: 'attempt:other',
    }),
    /REPOSITORY_REVISION_PROOF_INVALID/u,
    'a frozen revision proof is private to one pipeline attempt',
  );
} finally {
  await adapter.shutdown();
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.repository-adapter', suite: 'live-function' }));
