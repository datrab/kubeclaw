import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readNativeGatewayPruningDurationMs as read } from '../../../skills/common/plugin-runtime/foundation/config/gateway-native-duration.ts';
const root = new URL('../../../', import.meta.url);
test('original pure parser/normalizer and actual installed ms bytes retain exact source identities', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('skills/common/plugin-runtime/foundation/config/gateway-native-duration-sources.json', root), 'utf8'));
  for (const [name, record] of Object.entries(catalog) as [string, any][]) {
    const raw = fs.readFileSync(new URL(record.sourcePath, root));
    assert.equal(createHash('sha256').update(raw).digest('hex'), record.sha256);
    const packaged = name === 'ms' ? new URL(import.meta.resolve('ms')) : new URL('skills/common/plugin-runtime/foundation/config/'+name, root);
    assert.deepEqual(fs.readFileSync(packaged), raw);
  }
});
test('native duration preserves numeric default-minutes/composites/rounding/normalization/zero', () => {
  for (const [raw, expected] of [['5',300000],[' 1H30M ',5400000],['0',0],['0ms',0],['1.5ms',2],['.5s',null],['0.5s',500],['1m0.5s',60500]] as const) {
    if (expected === null) assert.throws(() => read(raw), /DURATION_INVALID/);
    else assert.equal(read(raw), expected);
  }
});
test('invalid/native-unsafe durations reject with no secret/raw-policy text or native fallback', () => {
  for (const raw of ['', '-1m','1h 30m','1h30','100000000000000000000d','private-policy-value']) {
    assert.throws(() => read(raw), error => error instanceof Error && error.message === 'PIPELINE_V10_GATEWAY_DURATION_INVALID');
  }
});
