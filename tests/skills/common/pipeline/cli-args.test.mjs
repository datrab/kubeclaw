import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArgs } from '../../../../skills/common/pipeline/cli-args.ts';

test('cli parser rejects flags inherited from Object.prototype', () => {
  assert.throws(
    () => parseCliArgs(['--toString', 'x'], { flags: {} }),
    /Unknown flag: --toString/,
  );
  assert.throws(
    () => parseCliArgs(['--__proto__', 'x'], { flags: {} }),
    /Unknown flag: --__proto__/,
  );
});

test('cli parser returns values without Object.prototype inheritance', () => {
  const { values } = parseCliArgs(['--name', 'value'], {
    flags: { name: { type: 'string' } },
  });

  assert.equal(Object.getPrototypeOf(values), null);
  assert.equal(values.name, 'value');
});
