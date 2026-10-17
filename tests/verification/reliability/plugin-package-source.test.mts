import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { computePackageDigest, computePackageFileSetDigest } from '../../../skills/common/plugin-runtime/foundation/registry/digest.ts';
const root = new URL('../../../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('skills/common/plugin-runtime/foundation/config/pipeline-v10-package-sources.json', root), 'utf8'));
test('all18 full original package byte rosters reproduce existing registry digest, not trust grants', t => {
  const retainedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'original-package-rosters-'));
  t.after(() => fs.rmSync(retainedRoot, { recursive: true, force: true }));
  let count = 0;
  for (const source of Object.values(catalog.packages) as any[]) {
    const currentRoot = new URL(source.sourceRoot+'/', root);
    const packageRoot = path.join(retainedRoot, String(count));
    fs.mkdirSync(packageRoot);
    const entries = source.files.map((row: any) => {
      // The approved catalog describes original bytes, not later production
      // edits. Use the already retained hash-addressed historical member.
      // Missing snapshots still require the current member to match exactly.
      const retained = new URL(`tests/verification/reliability/fixtures/pipeline-v10-retained/${row.sha256}.fixture`, root);
      const bytes = fs.readFileSync(fs.existsSync(retained) ? retained : new URL(row.path, currentRoot));
      assert.equal(bytes.byteLength, row.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
      const target = path.join(packageRoot, row.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      count++; return { relative: row.path, bytes };
    });
    assert.equal(computePackageDigest(packageRoot), source.contentDigest);
    assert.equal(computePackageFileSetDigest(entries.reverse()), source.contentDigest);
    const member = path.join(packageRoot, entries[0].relative);
    fs.appendFileSync(member, 'changed');
    assert.notEqual(computePackageDigest(packageRoot), source.contentDigest);
    fs.writeFileSync(member, entries[0].bytes);
    const extra = path.join(packageRoot, '.unlisted-byte-control');
    fs.writeFileSync(extra, 'unlisted');
    assert.notEqual(computePackageDigest(packageRoot), source.contentDigest);
    fs.unlinkSync(extra);
    assert.equal(computePackageDigest(packageRoot), source.contentDigest);
  }
  assert.equal(Object.keys(catalog.packages).length,18); assert.equal(count,193);
});
