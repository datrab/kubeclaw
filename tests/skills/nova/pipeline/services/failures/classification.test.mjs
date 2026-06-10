import assert from 'node:assert/strict';
import test from 'node:test';

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
