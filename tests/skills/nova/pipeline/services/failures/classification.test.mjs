import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeFailureClass,
  normalizeGitFailureClass,
} from '../../../../../../skills/nova/pipeline/services/failure-semantics.ts';
import {
  classifyPreTestFailure,
  parsePreTestVerdict,
} from '../../../../../../skills/nova/pipeline/services/failures/classification.ts';
import { buildPreTestDiscordFields } from '../../../../../../skills/nova/pipeline/services/failures/presentation.ts';

const malformedVerdicts = [
  'null',
  '[]',
  '{"suites":null}',
];

test('malformed-but-valid pre-test verdict payloads normalize to empty suites', () => {
  for (const verdict of malformedVerdicts) {
    assert.deepEqual(parsePreTestVerdict({ verdict }), { suites: {} });
  }
});

test('pre-test classification and presentation tolerate malformed verdict shapes', () => {
  for (const verdict of malformedVerdicts) {
    const classification = classifyPreTestFailure({ reason: 'pretest failed', verdict });
    assert.equal(classification.kind, 'code');
    assert.equal(classification.detail, 'pretest failed');

    assert.deepEqual(buildPreTestDiscordFields({ verdict }), [
      { name: 'Passed Suites', value: '—', inline: true },
      { name: 'Failed Suites', value: '—', inline: true },
    ]);
  }
});

test('Git failures normalize to concrete operation failure classes before broad buckets', () => {
  assert.equal(normalizeGitFailureClass('Permission denied (publickey).'), 'git_credential_failed');
  assert.equal(normalizeGitFailureClass('! [rejected] main -> main (non-fast-forward)'), 'git_non_fast_forward');
  assert.equal(normalizeGitFailureClass('GIT_REBASE_CONFLICT: CONFLICT (content): merge conflict'), 'git_rebase_conflict');
  assert.equal(normalizeGitFailureClass('git commit failed: pre-commit hook declined'), 'git_commit_failed');
  assert.equal(normalizeGitFailureClass('git push failed: Network is unreachable'), 'git_push_unreachable');
  assert.equal(normalizeGitFailureClass('git sync failed before buster handoff'), 'git_sync_failed');
});

test('generic failure normalization preserves exact Git root cause', () => {
  assert.equal(
    normalizeFailureClass('forge', 'git push failed: Network is unreachable after retry'),
    'git_push_unreachable',
  );
  assert.equal(
    normalizeFailureClass('forge', 'git commit failed: pre-commit hook declined'),
    'git_commit_failed',
  );
});
