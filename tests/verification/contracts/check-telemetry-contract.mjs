#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TELEMETRY_PAYLOAD_EVENT_TYPES } from '../../../skills/common/pipeline/services/telemetry/payload-schema.ts';

const catalog=JSON.parse(fs.readFileSync('contracts/telemetry/v1/catalog.json','utf8'));
assert.deepEqual([...catalog.event_types].sort(),[...TELEMETRY_PAYLOAD_EVENT_TYPES].sort());
assert.equal(catalog.event_types.length,53);
for(const type of catalog.event_types){
  const schema=JSON.parse(fs.readFileSync(`contracts/telemetry/v1/events/${type}.schema.json`,'utf8'));
  assert.equal(schema.additionalProperties,false,`${type} must reject unknown fields`);
  assert.equal(schema.properties.type.const,type);
  assert.equal(schema.properties.schema_version.const,'telemetry_envelope.v1');
}
const contract=fs.readFileSync('docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md','utf8');
assert.match(contract,/contracts\/telemetry\/v1/);
assert.doesNotMatch(contract,/legacy compatibility|compatibility envelope|buster:telemetry/i);
execFileSync(process.execPath,['scripts/generate-telemetry-contracts.mjs','--check'],{stdio:'pipe'});
console.log(JSON.stringify({ok:true,event_types:catalog.event_types.length,schema_version:'telemetry_envelope.v1'}));
