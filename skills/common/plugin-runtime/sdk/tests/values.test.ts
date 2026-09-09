import assert from 'node:assert/strict';
import { canonicalJson, portableJson, sha256Text } from '../src/values.ts';

const golden = '{"a":[null,true,2],"z":"ok"}';
assert.equal(canonicalJson({ z: 'ok', a: [null, true, 2] }), golden);
assert.equal(sha256Text(canonicalJson({ z: 'ok', a: [null, true, 2] })), sha256Text(golden));
assert.equal(canonicalJson(Object.assign(Object.create(null), { a: 1 })), '{"a":1}');
assert.equal(canonicalJson({ Z: 1, a: [null, true], 'é': 2 }), '{"a":[null,true],"é":2,"Z":1}');
assert.equal(portableJson({ Z: 1, a: [null, true], 'é': 2 }), '{"Z":1,"a":[null,true],"é":2}');
assert.equal(portableJson({'2':2,'10':10,'😀':1,'𐀀':2}), '{"10":10,"2":2,"𐀀":2,"😀":1}');
const shared = { a: 1 };
assert.equal(canonicalJson([shared, shared]), '[{"a":1},{"a":1}]');
const cycle: Record<string, unknown> = {};
cycle.self = cycle;
const sparseExtra = Object.assign(new Array(1), { extra: 'lost' });
let calls = 0;
const getter = { get evidence() { calls++; return calls; } };
const getterArray = Object.defineProperty([0], '0', { get() { calls++; return calls; } });
const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
for (const value of [undefined, { x: undefined }, NaN, Infinity, -Infinity, 1n, Symbol(), () => 1,
  Array(2), sparseExtra, Object.assign([1], { extra: 2 }), getter, getterArray, hidden,
  { [Symbol('evidence')]: 1 }, new Date(), new Map(), new Set(), /x/, cycle,
  new Proxy({}, { ownKeys() { calls++; return []; } }),
]) {
  assert.throws(() => canonicalJson(value), /CANONICAL_JSON_/);
  assert.throws(() => portableJson(value), /CANONICAL_JSON_/);
}
assert.equal(calls, 0, 'validation must not execute accessors or proxy traps');
assert.notEqual(canonicalJson({ x: null }), canonicalJson({}));
console.log('SDK JSON domain and accepted-byte regressions passed');
