import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const load = file => import(pathToFileURL(`${process.cwd()}/${file}`));
const files = ['skills/worker/core/worker/ownership-capacity.ts',
  'skills/worker/core/worker/ownership-state.ts', 'skills/worker/core/worker/ownership-children.ts',
  'contracts/pipeline-worker-core/v1/src/digest.ts',
  'contracts/pipeline-observability/v1/src/canonical-json.ts',
  'skills/worker/core/worker/digest.ts', 'skills/worker/core/worker/native-resource-observation.ts'];
const identities = () => Object.fromEntries(files.map(file => [file,
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const before = identities();
const { ownershipTerminalCapacityBytes } = await load(files[0]);
const { validateRecord } = await load(files[1]);
const { canonicalJson } = await load(files[3]);
const { canonicalJson: persistedJson } = await load(files[4]);
const maximum = Number.MAX_SAFE_INTEGER;
const bootId = '00000000-0000-0000-0000-000000000000';
const base = {
  identity: { workerId: 'worker:bound', attemptId: 'attempt:bound', claimId: 'claim:bound',
    generation: 1, profileDigest: `sha256:${'a'.repeat(64)}`, attemptSpecDigest: `sha256:${'b'.repeat(64)}` },
  scopeName: 'worker-00000000-0000-0000-0000-000000000001', revision: 1,
  phase: 'running', binding: { scopeName: 'worker-00000000-0000-0000-0000-000000000001',
    bootId, device: maximum, inode: maximum }, diagnosis: null, finalObservation: null,
  topology: { kind: 'aggregate.v1', children: [
    { name: 'host', limits: { memoryBytes: maximum, tasks: maximum }, binding: null },
    { name: 'helper-00000000-0000-0000-0000-000000000002',
      limits: { memoryBytes: maximum, tasks: maximum }, binding: null },
  ] },
};
validateRecord(base);
const document = records => ({ schemaVersion: 'worker-ownership-store.v3', hostIdentity: null, records });
const budget = ownershipTerminalCapacityBytes(document([base]));
const diagnoses = ['x', '\u0000'.repeat(4096), '\\'.repeat(4096), '"'.repeat(4096),
  '界'.repeat(4096), '😀'.repeat(2048)];
const numbers = [0, 9, 10, 999999999999999, maximum];
let cases = 0;
let largest = 0;
for (const diagnosis of diagnoses) for (const counter of numbers) for (const revision of [1, 10, maximum]) {
  for (const hostIdentity of [null, 'h'.repeat(256)]) {
    const record = structuredClone(base);
    record.phase = 'unresolved'; record.diagnosis = diagnosis; record.revision = revision;
    record.finalObservation = { unit: 'linux-tasks', cpuTimeMicroseconds: counter,
      maximumMemoryBytes: counter, maximumTasks: counter, populated: false,
      oomKills: counter, taskLimitHits: counter };
    record.topology.children.forEach((child, index) => {
      child.binding = { ...base.binding, scopeName: child.name, inode: maximum - index - 1 };
    });
    validateRecord(record);
    const state = { ...document([record]), hostIdentity };
    const serialized = persistedJson(state);
    assert.equal(serialized, canonicalJson(state), 'quota and durable writer serializers diverged');
    const actual = Buffer.byteLength(serialized);
    assert.ok(actual <= budget, `valid lifecycle state exceeds commitment: ${actual} > ${budget}`);
    largest = Math.max(largest, actual); cases++;
  }
}
assert.equal(largest, budget, 'the chosen valid boundary must actually reach the byte commitment');
assert.deepEqual(identities(), before, 'source changed during probe');
console.log(JSON.stringify({ scope: 'serialization boundary only; no filesystem admission or kernel claim',
  cases, budget, largest, sourceIdentities: before }, null, 2));
