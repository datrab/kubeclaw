import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = JSON.parse(await readFile(new URL('../schemas/pipeline-worker-core.v2.schema.json', import.meta.url), 'utf8'));
// V1 and V2 remain immutable historical protocols; V3 explicitly names the new unit.
function migrate(value) {
  if (Array.isArray(value)) return value.map(migrate);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, child]) => [key === 'maximumProcesses' ? 'maximumTasks' : key, migrate(child)]));
  if (value === 'maximumProcesses') return 'maximumTasks';
  return value;
}
const schema = migrate(source), defs = schema.$defs;
schema.$id = 'https://kubeclaw.dev/contracts/pipeline-worker-core/v3/schema.json';
schema.title = 'KubeClaw native attempt tree resources with explicit Linux task units';
for (const [name, version] of Object.entries({ workerProfile: 'worker-profile.v3', workerAttemptEnvelope: 'worker-attempt-envelope.v3',
  workerAttemptResult: 'worker-attempt-result.v3', resourceCapabilities: 'worker-resource-capabilities.v2',
  resourceBudgets: 'worker-resource-budgets.v2', resourceAccounting: 'worker-resource-accounting.v2' })) {
  defs[name].properties.schemaVersion.const = version;
}
for (const [metric, unit] of Object.entries({ cpuTimeMs: 'milliseconds', maximumMemoryBytes: 'bytes', maximumTasks: 'linux-tasks' })) {
  defs.resourceCapabilities.properties[metric] = { type: 'object', additionalProperties: false,
    required: ['scope', 'unit', 'measurement'], properties: { scope: { const: 'native-attempt-tree' }, unit: { const: unit }, measurement: { const: 'measured' } } };
}
const generated = JSON.stringify(schema, null, 2) + '\n';
const output = new URL('../schemas/pipeline-worker-core.v3.schema.json', import.meta.url);
if (process.argv.includes('--check')) assert.equal(await readFile(output, 'utf8'), generated, 'generated V3 schema is stale');
else await writeFile(output, generated);
