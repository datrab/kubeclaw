import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Revision admission is supplied by a caller-owned, explicitly reviewed page
// roster. Mixed immutable evidence is allowed; arbitrary revisions are not.
export function verifySourceEvidencePin(root, {
  page, revision, source, first, last = first, allowedRevisions,
  requireRange = false, maximumSpan = Infinity,
}) {
  assert(/^[0-9a-f]{40}$/u.test(revision) && allowedRevisions.includes(revision),
    `${page} uses an unreviewed source revision for ${source}`);
  assert(source && !path.posix.isAbsolute(source)
    && path.posix.normalize(source) === source && !source.split('/').includes('..'),
  `${page} has an unsafe source path`);
  let pinned;
  try {
    pinned = execFileSync('git', ['-C', root, 'show', `${revision}:${source}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    assert.fail(`${page} cites unavailable revision/source: ${revision}:${source}`);
  }
  const currentPath = path.join(root, source);
  assert(fs.existsSync(currentPath) && fs.lstatSync(currentPath).isFile(),
    `linked source is absent or not a regular file: ${source}`);
  assert.equal(fs.readFileSync(currentPath, 'utf8'), pinned,
    `${source} changed after ${revision}; inspect and repin the affected evidence`);
  assert(!requireRange || first !== undefined, `${page} has a source link without an explicit line range`);
  if (first === undefined) return;
  const start = Number(first), end = Number(last);
  assert(Number.isSafeInteger(start) && Number.isSafeInteger(end)
    && start >= 1 && end >= start && end <= pinned.split('\n').length,
  `${page} has an invalid line range for ${source}`);
  assert(end - start <= maximumSpan,
    `${page} has an evidence range wider than ${maximumSpan} lines for ${source}`);
}
