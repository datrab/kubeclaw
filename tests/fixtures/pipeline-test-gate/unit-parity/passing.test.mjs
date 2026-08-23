import assert from 'node:assert/strict';
import test from 'node:test';

test('passes', () => assert.equal(1, 1));
test.skip('skips', () => {});
