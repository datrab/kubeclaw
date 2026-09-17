import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { originalFindingIds, renderStatus, validateStatus } from '../docs-status.mjs';

const load = () => JSON.parse(fs.readFileSync(new URL('../../docs/status/open-issues.json', import.meta.url), 'utf8'));
const loadIdentities = () => JSON.parse(fs.readFileSync(new URL('../../docs/status/finding-identities.json', import.meta.url), 'utf8'));

test('closure provenance cannot replace an original identity while preserving all counts', () => {
  const identities = loadIdentities();
  assert.equal(originalFindingIds(identities).size, 154);
  identities.original_findings[1].id = identities.original_findings[0].id;
  assert.throws(() => originalFindingIds(identities), /154 unique original IDs/);
});

test('each open finding retains actionable work and an evidence boundary in the rendered view', () => {
  const data = load();
  const page = renderStatus(data);
  for (const issue of data.issues) {
    assert.ok(page.includes(`**${issue.title}**`));
    for (const field of ['problem', 'impact', 'current_state', 'live_validation']) assert.ok(page.includes(issue[field]));
    for (const field of ['remaining_work', 'reproduction', 'acceptance_criteria']) {
      for (const value of issue[field]) assert.ok(page.includes(value));
    }
  }
});

test('duplicate IDs cannot hide a missing original finding behind the same count', () => {
  const data = load();
  data.issues[1].id = data.issues[0].id;
  assert.throws(() => validateStatus(data), /Duplicate issue/);
});

test('local closures and additional work cannot silently alter the original denominator', () => {
  const data = load();
  data.issues[0].origin = 'additional';
  assert.throws(() => validateStatus(data), /counts/);
  const closed = load();
  closed.status_semantics.verified = 'Locally closed';
  closed.issues[0].status = 'verified';
  assert.throws(() => validateStatus(closed), /closed finding/);
});

test('a moving source branch or dangling dependency fails validation', () => {
  const data = load();
  data.issues[0].sources[0].url = 'https://github.com/datrab/kubeclaw/blob/main/README.md';
  assert.throws(() => validateStatus(data), /immutable/);
  const missing = load();
  missing.issues[0].dependencies = ['MISSING-FINDING'];
  assert.throws(() => validateStatus(missing), /unresolved dependency/);
});

test('an issue without a reproduction or completion criterion is not an actionable handoff', () => {
  for (const field of ['reproduction', 'acceptance_criteria']) {
    const data = load();
    data.issues[0][field] = [];
    assert.throws(() => validateStatus(data), new RegExp(`incomplete ${field}`));
  }
});

test('metadata and the original 154-finding denominator cannot drift', () => {
  const changed = load();
  changed.scope.original_total += 1;
  changed.scope.original_locally_verified += 1;
  assert.throws(() => validateStatus(changed), /counts/);
  const undated = load();
  delete undated.updated_at;
  assert.throws(() => validateStatus(undated), /baseline/);
  const disguisedClosure = load();
  disguisedClosure.status_semantics['lokal verifiziert'] = 'Closed';
  disguisedClosure.issues[0].status = 'lokal verifiziert';
  assert.throws(() => validateStatus(disguisedClosure), /closed finding/);
});

test('reader status keeps useful evidence without publishing migration accounting', () => {
  const data = load();
  data.issues[0].evidence.source_run_commit = 'a'.repeat(40);
  data.issues[0].evidence.original_scope = 'Only the selected original run';
  const page = renderStatus(data);
  assert.ok(page.includes(data.issues[0].evidence.source_run_commit));
  assert.ok(!page.includes(data.scope.counting_policy));
  assert.ok(!page.includes(data.issues[0].evidence.original_scope));
});

test('invented or reclassified original IDs cannot preserve apparently valid counts', () => {
  const data = load();
  data.issues.find(issue => issue.id === 'IFR-29-001').id = 'INVENTED-REPLACEMENT';
  assert.throws(() => validateStatus(data), /membership/);
});

test('mutable evidence requires a real observation date and publishes it', () => {
  const data = load();
  const source = data.issues.find(issue => issue.id === 'GITHUB-7').sources[0];
  delete source.observed_at;
  assert.throws(() => validateStatus(data), /observation date/);
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-9-1', '9999-01-01']) {
    source.observed_at = invalid;
    assert.throws(() => validateStatus(data), /observation date/);
  }
  source.observed_at = data.updated_at;
  assert.ok(renderStatus(data).includes(`Observed: ${data.updated_at}.`));
});

test('a later closure requires matching provenance, not only adjusted counts', () => {
  const data = load();
  data.issues = data.issues.filter(issue => issue.id !== 'IFR-29-001');
  data.scope.original_incomplete--;
  data.scope.original_locally_verified++;
  data.scope.total_open--;
  assert.throws(() => validateStatus(data), /local disposition/);
  const identities = loadIdentities();
  identities.original_findings.find(item => item.id === 'IFR-29-001').disposition = 'Locally verified';
  validateStatus(data, identities);
});

test('a closed original ID cannot replace an open ID with unchanged counts', () => {
  const data = load();
  data.issues.find(issue => issue.id === 'IFR-29-001').id = 'IFR-27-001';
  assert.throws(() => validateStatus(data), /membership|local disposition/);
});

test('the five inherited integration closures cannot become an invented count', () => {
  const data = load();
  data.scope.additional_integration_locally_verified = 999;
  assert.throws(() => validateStatus(data), /Integration closure counts/);
});
