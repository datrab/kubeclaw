#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { compileScalableReview } from '../src/scalable-review-compiler.ts';
import { compareCodeUnits } from '../src/review-ordering.ts';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';
import { resolveRepositoryReviewProfile } from '../src/repository-review-profile.ts';

const grade = process.argv[2] ?? 'standard';
if (!['fast', 'standard', 'deep'].includes(grade)) throw new Error(`unknown review grade: ${grade}`);

const repository = path.resolve(import.meta.dirname, '../../../../..');
const head = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD^{commit}'], { encoding: 'utf8' }).trim();
const fields = execFileSync('git', ['-C', repository, 'ls-tree', '-r', '-l', '-z', head], {
  encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
}).split('\0').filter(Boolean);
const files = fields.map((field) => {
  const match = /^(\d{6}) (blob|commit) ([0-9a-f]{40}|[0-9a-f]{64}) +(\d+|-)\t(.+)$/u.exec(field);
  if (!match) throw new Error(`inventory entry is invalid: ${field}`);
  const gitlink = match[1] === '160000' && match[2] === 'commit' && match[4] === '-';
  if (match[2] !== 'blob' && !gitlink) throw new Error(`inventory entry type is invalid: ${field}`);
  return { mode: match[1] as string, objectId: match[3] as string,
    sizeBytes: gitlink ? 0 : Number(match[4]), path: match[5] as string };
}).sort((left, right) => compareCodeUnits(left.path, right.path));
const { canonicalJson, sha256Text } = await import('@kubeclaw/plugin-sdk');
const snapshot = parseReviewSnapshotInventory({ head, files, inventoryDigest: sha256Text(canonicalJson(files)) });
const documents = snapshot.files.filter(({ included }) => included).map(({ path: file, sizeBytes }) => {
  if (sizeBytes > 4 * 1024 * 1024) throw new Error(`included source exceeds evaluation file limit: ${file}`);
  return { path: file, content: execFileSync('git', ['-C', repository, 'show', `${head}:${file}`], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 + 1,
  }) };
});
const sourceDigests = new Map(documents.map(({ path: file, content }) => [file, sha256Text(content)]));
const profile = resolveRepositoryReviewProfile({ grade: grade as 'fast' | 'standard' | 'deep' });
const started = performance.now();
const compilation = compileScalableReview({ snapshot, documents, sourceDigests,
  budget: profile.componentBudget, profile });
const elapsedMs = performance.now() - started;
process.stdout.write(`${JSON.stringify({
  ok: true, head, snapshotDigest: snapshot.digest, compilationDigest: compilation.digest,
  files: snapshot.files.length, included: compilation.plan.coverage.filesIncluded,
  excluded: compilation.plan.coverage.filesExcluded, relations: compilation.graph.relations.length,
  unresolvedRelations: compilation.graph.unresolvedRelations.length,
  components: compilation.graph.components.length, slices: compilation.plan.slices.length,
  boundaries: compilation.plan.boundaries.length, jobs: compilation.jobs.length,
  accounting: compilation.accounting, profile: compilation.profile,
  coverageComplete: compilation.plan.coverage.complete, elapsedMs: Math.round(elapsedMs),
}, null, 2)}\n`);
