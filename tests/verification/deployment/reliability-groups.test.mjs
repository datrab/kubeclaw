import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { selectTests, nativeTests, serviceTests } from '../../../scripts/reliability-tests.mjs';

test('CI groups cover every reliability test exactly once, including newly added core tests', () => {
  const files = fs.readdirSync('tests/verification/reliability').filter(file => /\.test\.(mts|mjs)$/.test(file));
  files.push('future-regression.test.mts');
  const groups = [...Array.from({ length: 4 }, (_, i) => selectTests(files, 'core', i + 1, 4)),
    selectTests(files, 'native'), selectTests(files, 'services')];
  assert.deepEqual(groups.flat().sort(), files.sort());
  assert.equal(new Set(groups.flat()).size, files.length);
  assert.deepEqual(groups[4], [...nativeTests].sort());
  assert.deepEqual(groups[5], [...serviceTests].sort());
  assert.throws(() => selectTests(files.filter(file => file !== nativeTests[0]), 'core'), /missing/);
  assert.throws(() => selectTests(files, 'core', 0, 4), /Invalid shard/);
});
