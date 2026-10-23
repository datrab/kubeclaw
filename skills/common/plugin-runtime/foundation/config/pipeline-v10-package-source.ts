import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { computePackageFileSetDigest } from '../registry/digest.ts';
const catalog = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-package-sources.json', import.meta.url), 'utf8')) as {
  packages: Record<string, { generationRoot: string; contentDigest: string; files: { path: string; bytes: number; sha256: string }[] }>
};

/** Byte identity prerequisite only. No import/execute/discovery/installation,
 * trusted-first-party classification, registry export or grant is inferred.
 * list rejects symlinks/special files; read retains real nofollow observations.
 */
export function inspectPipelineV10PackageSource(packageId: string, generationRoot: string,
  read: (relative: string) => Buffer, list: (relative: string) => readonly string[]): void {
  const expected = catalog.packages[packageId];
  if (!expected || expected.generationRoot !== generationRoot) throw new Error('PIPELINE_V10_PACKAGE_SOURCE_IDENTITY_REQUIRED');
  const files = [...list(generationRoot)].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected.files.map(row => row.path).sort())) throw new Error('PIPELINE_V10_PACKAGE_SOURCE_FILE_SET');
  const observed = expected.files.map(row => {
    const bytes = read(path.posix.join(generationRoot, row.path));
    if (bytes.byteLength !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
      throw new Error('PIPELINE_V10_PACKAGE_SOURCE_BYTES');
    }
    return { relative: row.path, bytes };
  });
  if (computePackageFileSetDigest(observed) !== expected.contentDigest) throw new Error('PIPELINE_V10_PACKAGE_SOURCE_DIGEST');
}
