import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { validateCompletionRecords } from '../check-ap09-acceptance-contract.mjs';

const revision = 'a'.repeat(40);
function fixture() {
  const record = {
    id: 'pipeline-topic', revision, author: 'writer', reviewer: 'independent-reader',
    gateIds: ['A911-11'], requirementIds: ['REF-001'],
    pages: ['docs/site/reference/workflows.md'], sources: ['scripts/docs-pipeline.mjs'],
    checks: [{ command: 'node relevant-check.mjs', exitCode: 0, observation: 'baseline and selected changes checked' }],
    review: { sourceAccuracy: 'PASS', readerUsability: 'PASS', quality: 'PASS' },
    summary: 'Pipeline reference and drift coverage checked.', limits: ['No deployment claim.'],
    openIssues: [], verdict: 'PASS',
  };
  const matrix = { completionRecords: [record], gates: [{ id: 'A911-11', state: 'accepted' }],
    requirements: [{ id: 'REF-001', state: 'accepted' }] };
  const catalogue = { requirements: [{ id: 'REF-001', canonicalTarget: record.pages[0] }] };
  const rows = [{ id: 'A911-11' }];
  const repo = { git: (...args) => args[0] === 'rev-parse' ? revision : '', trackedFile: () => {} };
  return { record, matrix, catalogue, rows, repo,
    run() { return validateCompletionRecords(matrix, catalogue, rows, repo); } };
}

test('one compact independent topic review accepts related requirements and gates without raw artifacts', () => {
  assert.doesNotThrow(() => fixture().run());
});
test('self review, missing review aspects and failed checks cannot accept content', () => {
  for (const change of [
    x => { x.record.reviewer = ' WRITER '; },
    x => { delete x.record.review.quality; },
    x => { x.record.checks[0].exitCode = 1; },
    x => { x.record.openIssues.push('Incorrect default'); },
  ]) {
    const x = fixture(); change(x); assert.throws(() => x.run());
  }
});
test('unknown IDs, missing canonical page and duplicate acceptance are rejected', () => {
  for (const change of [
    x => { x.record.gateIds.push('A911-99'); },
    x => { x.record.requirementIds.push('UNKNOWN'); },
    x => { x.record.pages = ['docs/site/reference/other.md']; },
    x => { x.matrix.completionRecords.push({ ...x.record, id: 'duplicate' }); },
  ]) {
    const x = fixture(); change(x); assert.throws(() => x.run());
  }
});
test('PASS requires atomic state update, while FAIL cannot close a point', () => {
  for (const change of [
    x => { x.matrix.gates[0].state = 'not-accepted'; },
    x => { x.record.verdict = 'FAIL'; },
    x => { x.matrix.completionRecords = []; },
  ]) {
    const x = fixture(); change(x); assert.throws(() => x.run());
  }
  const x = fixture(); x.record.verdict = 'NOT_READY';
  x.matrix.gates[0].state = 'not-accepted'; x.matrix.requirements[0].state = 'not-accepted';
  assert.doesNotThrow(() => x.run());
});
test('changed relevant files require a scoped recheck, not a new global evidence bundle', () => {
  const x = fixture(); const old = x.repo.git;
  x.repo.git = (...args) => args[0] === 'diff' ? 'scripts/docs-pipeline.mjs' : old(...args);
  assert.throws(() => x.run(), /relevant files changed/);
});
test('unknown revisions and nonexistent sources cannot support PASS', () => {
  const x = fixture(); x.repo.trackedFile = () => { throw new Error('not tracked'); };
  assert.throws(() => x.run(), /not tracked/);
  const y = fixture(); y.repo.git = () => 'b'.repeat(40);
  assert.throws(() => y.run());
});
test('real Git checks commit ancestry and regular files without requiring artifact storage', () => {
  const x = fixture();
  x.record.revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8',
  }).trim();
  x.record.sources = ['package.json'];
  assert.doesNotThrow(() => validateCompletionRecords(x.matrix, x.catalogue, x.rows));
  x.record.sources = ['scripts'];
  assert.throws(() => validateCompletionRecords(x.matrix, x.catalogue, x.rows), /not a regular tracked file/);
});
