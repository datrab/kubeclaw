import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

/** Dated, partial source captures are evidence bytes, not current documentation.
 * The index pins every exception. Changed/missing snapshots fail instead of
 * silently expanding the exclusion; standalone review/report links stay active.
 */
export function reviewSnapshotPaths(root) {
  const index = path.join(root, 'docs/review/source-snapshots.json');
  if (!fs.existsSync(index)) return new Set();
  const value = JSON.parse(fs.readFileSync(index, 'utf8'));
  if (value.schemaVersion !== 'documentation-source-snapshots.v1' || !Array.isArray(value.files)) throw new Error('DOC_SNAPSHOT_INDEX_INVALID');
  const result = new Set();
  for (const entry of value.files) {
    if (typeof entry.path !== 'string' || !entry.path.startsWith('docs/review/evidence/') || !entry.path.endsWith('.md')
      || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..')
      || !/^[a-f0-9]{64}$/.test(entry.sha256) || result.has(entry.path)) throw new Error('DOC_SNAPSHOT_INDEX_INVALID');
    const file = path.join(root, entry.path);
    if (!fs.existsSync(file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== entry.sha256) {
      throw new Error(`DOC_SNAPSHOT_CHANGED:${entry.path}`);
    }
    result.add(entry.path);
  }
  return result;
}
