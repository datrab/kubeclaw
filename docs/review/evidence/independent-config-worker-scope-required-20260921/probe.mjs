import assert from 'node:assert/strict';
import { NativeWorkerOwnership } from '../../../../skills/worker/core/worker/native-worker-ownership.ts';
let entered = 0;
const base = { drainTimeoutMs: 1, cgroupRoot: '/definitely-absent-worker-review-root', poolLimits: {}, store: { withSupervisor() { entered++; throw Error('SUPERVISOR_ENTERED'); } } };
for (const value of [undefined, null, false, true, '', '128', [128], {}, 0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  await assert.rejects(NativeWorkerOwnership.supervise({...base, maximumActiveScopes: value}, async()=>{ entered++; }), {message:'WORKER_NATIVE_CAPACITY_INVALID'});
}
for (const value of [1, 7, 129, Number.MAX_SAFE_INTEGER]) {
  await assert.rejects(NativeWorkerOwnership.supervise({...base, maximumActiveScopes: value}, async()=>{ entered++; }), {code:'ENOENT'});
}
assert.equal(entered, 0);
console.log('14 invalid scalar/structured values rejected; four valid capacities reach filesystem validation; no supervisor admission');
