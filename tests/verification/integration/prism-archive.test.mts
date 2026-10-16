import {loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContentAddressedArtifactStore } from '../../../skills/prism/storage/index.ts';
import { verifyBaselineArchive } from '../../../skills/nova/plugins/prism-design/src/archive.ts';

// Archive transport/integrity contract; no design generation or render acceptance is claimed.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-archive-'));
const store = new ContentAddressedArtifactStore(root);
const digest = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const png = new PNG({ width: 1, height: 1 });
png.data.fill(255);
const pngBytes = PNG.sync.write(png);
async function archive(extra: Record<string, string> = {}) {
  const textFiles: Record<string, string> = {
    'design-document.json': JSON.stringify({ ...JSON.parse(fs.readFileSync(new URL('../../../contracts/prism/v1/fixtures/minimal-web.json', import.meta.url), 'utf8')), meta: { ...JSON.parse(fs.readFileSync(new URL('../../../contracts/prism/v1/fixtures/minimal-web.json', import.meta.url), 'utf8')).meta, projectId: 'project' } }), 'design-specification.md': '# Approved design',
    'acceptance-criteria.json': JSON.stringify({ schema: 'prism.acceptance-criteria.v1', criteria: [{ id: 'home-visible', category: 'visual', requirement: 'Home is visible.', targets: [{ view: 'home', state: 'default' }], priority: 'required', verification: ['visual'] }] }),
    'previews/home.aria.txt': 'Home',
    'previews/index.json': JSON.stringify({ schema: 'prism.preview-index.v1', previews: [{ id: 'home', view: 'home', state: 'default', viewport: 'wide', path: 'previews/home.png', width: 1, height: 1, digest: digest(pngBytes), fidelity: 'intent', ariaPath: 'previews/home.aria.txt', ariaDigest: digest('Home'), renderer: { name: 'contract-fixture' } }] }), ...extra,
  };
  const files = Object.fromEntries([...Object.entries(textFiles).map(([name, value]) => [name, digest(value)]), ['previews/home.png', digest(pngBytes)]].sort(([a], [b]) => a!.localeCompare(b!)));
  const bundleDigest = digest(JSON.stringify(files));
  const manifest = { schema: 'prism.baseline-bundle.v1', digest: bundleDigest, projectId: 'project', bundleId: 'baseline', revision: 1, createdAt: '2026-09-06T00:00:00Z',
    designDocument: { path: 'design-document.json', schema: 'prism.design-document.v1', revision: 1 }, designSpecification: { path: 'design-specification.md' },
    acceptanceCriteria: { path: 'acceptance-criteria.json' }, previews: { path: 'previews/index.json' }, assets: {} };
  textFiles['checksums.json'] = JSON.stringify({ algorithm: 'sha256', files });
  textFiles['manifest.json'] = JSON.stringify(manifest);
  const bytes = Buffer.from(JSON.stringify({ schema: 'prism.baseline-archive.v1', manifest, textFiles, binaryFiles: { 'previews/home.png': pngBytes.toString('base64') } }));
  const stored = await store.put(bytes);
  return { artifactId: stored.artifactId, bundleDigest, archiveBase64: Buffer.from(await store.get(stored.artifactId)).toString('base64') };
}
try {
  const response = await archive();
  assert.throws(() => verifyBaselineArchive(response, response.bundleDigest, 'project', undefined as any), /BUDGET_REQUIRED/);
  assert.throws(() => verifyBaselineArchive(response, response.bundleDigest, 'project', {...TEST_CORE_POLICY.prismDesignBudgets, maximumArchiveBytes: 1}), /SIZE_EXCEEDED/);
  assert.throws(() => verifyBaselineArchive(response, response.bundleDigest, 'project', {...TEST_CORE_POLICY.prismDesignBudgets, maximumArchiveFiles: 1}), /FILE_SET_INVALID/);
  assert.equal(verifyBaselineArchive(response, response.bundleDigest, 'project', TEST_CORE_POLICY.prismDesignBudgets).archive.textFiles['design-specification.md'], '# Approved design');
  // Real content-addressed bytes: exact selected transport/file ceilings pass,
  // their adjacent lower values reject, and restoring A restores the positive.
  const archiveBytes = Buffer.from(response.archiveBase64, 'base64');
  const archiveValue = JSON.parse(archiveBytes.toString('utf8'));
  const fileCount = Object.keys(archiveValue.textFiles).length + Object.keys(archiveValue.binaryFiles).length;
  const ownerFile = path.join(root, 'selected-core.json');
  const publish = (maximumArchiveBytes: number, maximumArchiveFiles: number) => fs.writeFileSync(ownerFile, JSON.stringify({schemaVersion: 'nova-core-runtime-policy.v1', profiles: {selected: {settings: {...TEST_CORE_POLICY, prismDesignBudgets: {...TEST_CORE_POLICY.prismDesignBudgets, maximumArchiveBytes, maximumArchiveFiles}}}}}));
  publish(archiveBytes.length, fileCount);
  const selectedA = loadCoreRuntimePolicy({file: ownerFile, profile: 'selected'}).prismDesignBudgets;
  assert.equal(verifyBaselineArchive(response, response.bundleDigest, 'project', selectedA).artifactId, response.artifactId);
  publish(archiveBytes.length - 3, fileCount);
  assert.throws(() => verifyBaselineArchive(response, response.bundleDigest, 'project', loadCoreRuntimePolicy({file: ownerFile, profile: 'selected'}).prismDesignBudgets), /SIZE_EXCEEDED/);
  publish(archiveBytes.length, fileCount - 1);
  assert.throws(() => verifyBaselineArchive(response, response.bundleDigest, 'project', loadCoreRuntimePolicy({file: ownerFile, profile: 'selected'}).prismDesignBudgets), /FILE_SET_INVALID/);
  fs.unlinkSync(ownerFile);
  assert.equal(verifyBaselineArchive(response, response.bundleDigest, 'project', selectedA).artifactId, response.artifactId);
  assert.throws(() => loadCoreRuntimePolicy({file: ownerFile, profile: 'selected'}), /ENOENT/);

  assert.throws(() => verifyBaselineArchive(response, response.bundleDigest, 'other', TEST_CORE_POLICY.prismDesignBudgets), /MANIFEST_MISMATCH/);
  assert.throws(() => verifyBaselineArchive({ ...response, artifactId: 'artifact:sha256:' + '0'.repeat(64) }, response.bundleDigest, 'project', TEST_CORE_POLICY.prismDesignBudgets), /DIGEST_MISMATCH/);
  assert.throws(() => verifyBaselineArchive({ ...response, archiveBase64: undefined }, response.bundleDigest, 'project', TEST_CORE_POLICY.prismDesignBudgets), /SIZE_EXCEEDED/);
  const traversal = await archive({ '../outside': 'malicious' });
  assert.throws(() => verifyBaselineArchive(traversal, traversal.bundleDigest, 'project', TEST_CORE_POLICY.prismDesignBudgets), /PATH_INVALID/);
  const changed = JSON.parse(Buffer.from(response.archiveBase64, 'base64').toString());
  changed.textFiles['design-specification.md'] = 'Altered after approval';
  const changedBytes = Buffer.from(JSON.stringify(changed));
  const stored = await store.put(changedBytes);
  assert.throws(() => verifyBaselineArchive({ ...response, artifactId: stored.artifactId, archiveBase64: changedBytes.toString('base64') }, response.bundleDigest, 'project', TEST_CORE_POLICY.prismDesignBudgets), /FILE_DIGEST_MISMATCH/);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, suite: 'prism-real-archive-integrity', designGeneration: false }));
