import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { computePackageDigest, computePackageFileSetDigest } from '../../../skills/common/plugin-runtime/foundation/registry/digest.ts';
const root = new URL('../../../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('skills/common/plugin-runtime/foundation/config/pipeline-v10-package-sources.json', root), 'utf8'));
test('all18 full original package byte rosters reproduce existing registry digest, not trust grants', () => {
  let count = 0;
  for (const source of Object.values(catalog.packages) as any[]) {
    const packageRoot = new URL(source.sourceRoot+'/', root);
    const entries = source.files.map((row: any) => {
      const bytes = fs.readFileSync(new URL(row.path, packageRoot));
      assert.equal(bytes.byteLength, row.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
      count++; return { relative: row.path, bytes };
    });
    assert.equal(computePackageDigest(packageRoot.pathname), source.contentDigest);
    assert.equal(computePackageFileSetDigest(entries.reverse()), source.contentDigest);
  }
  assert.equal(Object.keys(catalog.packages).length,18); assert.equal(count,193);
});
