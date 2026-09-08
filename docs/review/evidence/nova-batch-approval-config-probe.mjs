import fs from 'node:fs';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseApprovalConfig } from '../../../skills/nova/plugins/human-approval/src/approval.ts';
const schema=JSON.parse(fs.readFileSync(new URL('../../../skills/nova/plugins/human-approval/schemas/config.schema.json',import.meta.url),'utf8'));
const config={target:'ops',issuerId:'operator:ops',agentRole:'nova'};
assert.equal(new Ajv2020({strict:false}).compile(schema)(config),true);
assert.throws(()=>parseApprovalConfig(config),/APPROVAL_CONFIG_UNKNOWN_FIELD:agentRole/);
console.log(JSON.stringify({schemaAccepted:true,runtimeRejected:'APPROVAL_CONFIG_UNKNOWN_FIELD:agentRole'}));
