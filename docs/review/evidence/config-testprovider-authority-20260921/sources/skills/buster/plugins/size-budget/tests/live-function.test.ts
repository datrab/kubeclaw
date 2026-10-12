import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'size-budget-provider-'));
const workspace = path.join(root, 'workspace');
const inputRoot = path.join(workspace, 'inputs');
const repository = path.join(workspace, 'repository');
const scratch = path.join(workspace, 'scratch');

function artifact(file: string, artifactId: string, mediaType: string) {
  const bytes = fs.readFileSync(file);
  return { artifactId, type: 'artifact', mediaType,
    contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    sizeBytes: bytes.byteLength, storageUrl: pathToFileURL(file).href };
}

function invocation(output: any, values: any, mode = 'blocking', baseline?: any, attempt = 'one') {
  return { attemptId: `attempt:${attempt}`, testIdentity: 'test:size-budget', mode,
    workspace: { repository: 'repository', scratch: 'scratch', evidence: `evidence-${attempt}` },
    configuration: { values }, inputs: [
      { name: 'build-output', kind: 'artifact', artifact: output },
      ...(baseline ? [{ name: 'baseline', kind: 'artifact', artifact: baseline }] : []),
    ], limits: { artifactBytes: 1024 * 1024, artifactFiles: 4 } };
}

function context(attempt: string, signal = new AbortController().signal) {
  fs.mkdirSync(path.join(workspace, `evidence-${attempt}`), { recursive: true });
  return { workspaceRoot: workspace, signal, log() {}, async invoke() { throw new Error('unexpected capability'); } };
}

try {
  for (const directory of [workspace, inputRoot, repository, scratch]) fs.mkdirSync(directory, { recursive: true });
  const source = path.join(root, 'source'); fs.mkdirSync(path.join(source, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(source, 'index.html'), 'x'.repeat(100));
  fs.writeFileSync(path.join(source, 'assets', 'app.js'), 'y'.repeat(300));
  fs.writeFileSync(path.join(source, 'assets', 'style.css'), 'z'.repeat(200));
  const tar = path.join(inputRoot, 'output.tar');
  const gzip = path.join(inputRoot, 'output.tar.gz');
  execFileSync('tar', ['--format=ustar', '-cf', tar, '-C', source, 'assets', 'index.html']);
  execFileSync('tar', ['--format=ustar', '-czf', gzip, '-C', source, 'assets', 'index.html']);

  const tarArtifact = artifact(tar, 'artifact:tar', 'application/x-tar');
  const passed = await provider().execute(invocation(tarArtifact, { maximumTotalBytes: 600,
    matchingFiles: [{ id: 'scripts', pattern: 'assets/*.js', maximumBytes: 300 }] }, 'blocking', undefined, 'pass'), context('pass'));
  assert.equal(passed.outcome, 'passed');
  assert.equal(passed.providerDetails.values.totalBytes, 600);
  assert.equal(passed.providerDetails.values.fileCount, 3);
  assert.equal(passed.providerDetails.values.largestFiles[0].path, 'assets/app.js');
  assert.equal(passed.outputs[0].name, 'baseline');

  const failed = await provider().execute(invocation(tarArtifact, { maximumTotalBytes: 599,
    matchingFiles: [{ id: 'missing', pattern: 'missing/**', maximumBytes: 0 }] }, 'blocking', undefined, 'fail'), context('fail'));
  assert.equal(failed.outcome, 'failed'); assert.equal(failed.findings.length, 2);

  const tooManyFiles = await provider().execute(invocation(tarArtifact, { maximumFileCount: 2 },
    'blocking', undefined, 'file-count'), context('file-count'));
  assert.equal(tooManyFiles.outcome, 'failed');
  assert.equal(tooManyFiles.findings[0]?.rule, 'size-budget.file-count');

  const gzipArtifact = artifact(gzip, 'artifact:gzip', 'application/gzip');
  const compressed = await provider().execute(invocation(gzipArtifact, {}, 'advisory', undefined, 'gzip'), context('gzip'));
  assert.equal(compressed.outcome, 'passed');
  assert.equal(compressed.providerDetails.values.totalBytes, 600);
  assert.equal(compressed.providerDetails.values.compressedBytes, gzipArtifact.sizeBytes);

  const baselineFile = path.join(workspace, 'evidence-pass', 'size-budget-baseline.json');
  const baselineArtifact = artifact(baselineFile, 'artifact:baseline', 'application/vnd.kubeclaw.size-budget-baseline+json');
  const growth = await provider().execute(invocation(tarArtifact, { maximumGrowthBytes: 0, maximumGrowthPercent: 0 },
    'blocking', baselineArtifact, 'growth'), context('growth'));
  assert.equal(growth.outcome, 'passed');
  assert.deepEqual(growth.providerDetails.values.growth, { bytes: 0, percent: 0 });

  const raceTar = path.join(inputRoot, 'race.tar');
  const replacementTar = path.join(inputRoot, 'replacement.tar');
  fs.copyFileSync(tar, raceTar);
  const replacementSource = path.join(root, 'replacement');
  fs.mkdirSync(replacementSource);
  fs.writeFileSync(path.join(replacementSource, 'payload.bin'), Buffer.alloc(900));
  execFileSync('tar', ['--format=ustar', '-cf', replacementTar, '-C', replacementSource, 'payload.bin']);
  const raceArtifact = artifact(raceTar, 'artifact:race', 'application/x-tar');
  const swappingBaseline = { ...baselineArtifact };
  Object.defineProperty(swappingBaseline, 'mediaType', { get() {
    fs.renameSync(raceTar, `${raceTar}.verified`);
    fs.renameSync(replacementTar, raceTar);
    return 'application/vnd.kubeclaw.size-budget-baseline+json';
  } });
  const race = await provider().execute(invocation(raceArtifact, { maximumTotalBytes: 1_000 },
    'blocking', swappingBaseline, 'race'), context('race'));
  assert.equal(race.providerDetails.values.totalBytes, 600,
    'measurement must consume the descriptor whose bytes were verified, even if its path is replaced');

  const single = path.join(inputRoot, 'application.bin'); fs.writeFileSync(single, Buffer.alloc(32));
  const singleArtifact = artifact(single, 'artifact:binary', 'application/octet-stream');
  const singleResult = await provider().execute(invocation(singleArtifact, { maximumTotalBytes: 32 }, 'blocking', undefined, 'single'), context('single'));
  assert.equal(singleResult.providerDetails.values.totalBytes, 32);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(() => provider().execute(invocation(singleArtifact, { maximumTotalBytes: 32 },
    'blocking', undefined, 'cancelled'), context('cancelled', cancelled.signal)), /SIZE_BUDGET_CANCELLED/u);

  await assert.rejects(() => provider().execute(invocation(tarArtifact, {}, 'blocking', undefined, 'no-limit'), context('no-limit')),
    /SIZE_BUDGET_BLOCKING_LIMIT_REQUIRED/u);
  await assert.rejects(() => provider().execute(invocation({ ...tarArtifact, contentDigest: `sha256:${'0'.repeat(64)}` },
    { maximumTotalBytes: 1000 }, 'blocking', undefined, 'digest'), context('digest')), /SIZE_BUDGET_INPUT_DIGEST_MISMATCH/u);
  await assert.rejects(() => provider().execute(invocation(tarArtifact, { maximumGrowthBytes: 0 }, 'blocking', undefined, 'baseline-required'),
    context('baseline-required')), /SIZE_BUDGET_BASELINE_REQUIRED/u);

  const unsafeSource = path.join(root, 'unsafe'); fs.mkdirSync(unsafeSource); fs.symlinkSync('/etc/passwd', path.join(unsafeSource, 'link'));
  const unsafeTar = path.join(inputRoot, 'unsafe.tar'); execFileSync('tar', ['--format=ustar', '-cf', unsafeTar, '-C', unsafeSource, 'link']);
  await assert.rejects(() => provider().execute(invocation(artifact(unsafeTar, 'artifact:unsafe', 'application/x-tar'),
    { maximumTotalBytes: 1000 }, 'blocking', undefined, 'unsafe'), context('unsafe')), /SIZE_BUDGET_ARCHIVE_ENTRY_DENIED/u);

  const duplicateSource = path.join(root, 'duplicate'); fs.mkdirSync(path.join(duplicateSource, 'empty'), { recursive: true });
  const duplicateTar = path.join(inputRoot, 'duplicate.tar');
  execFileSync('tar', ['--format=ustar', '-cf', duplicateTar, '-C', duplicateSource, 'empty', 'empty']);
  await assert.rejects(() => provider().execute(invocation(artifact(duplicateTar, 'artifact:duplicate', 'application/x-tar'),
    { maximumTotalBytes: 1000 }, 'blocking', undefined, 'duplicate'), context('duplicate')), /SIZE_BUDGET_ARCHIVE_DUPLICATE/u);

  await assert.rejects(() => provider().execute(invocation({ ...singleArtifact, storageUrl: 'https://example.invalid/output' },
    { maximumTotalBytes: 1000 }, 'blocking', undefined, 'url'), context('url')), /SIZE_BUDGET_INPUT_URL_INVALID/u);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, provider: 'size-budget', realArtifacts: ['file', 'tar', 'tar-gzip'], mocks: 0 }));
