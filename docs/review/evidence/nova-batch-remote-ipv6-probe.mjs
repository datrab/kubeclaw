import assert from 'node:assert/strict';import fs from 'node:fs';import Ajv2020 from 'ajv/dist/2020.js';import addFormats from 'ajv-formats';
import {activate} from '../../../skills/nova/plugins/remote-test-gate/src/adapter.ts';
const config={endpoint:'http://[::1]:8080',authentication:'spiffe-proxy',sourcePrivateKeySecret:'source',sourceAuthority:'nova',stateRoot:'/tmp/nova-review-unused',allowedRepositoryRoots:[process.cwd()]};
const schema=JSON.parse(fs.readFileSync(new URL('../../../skills/nova/plugins/remote-test-gate/schemas/config.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false});addFormats(ajv);assert.equal(ajv.compile(schema)(config),true);
assert.throws(()=>activate({config}),/REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK/);
console.log(JSON.stringify({schemaAccepted:true,urlHostname:new URL(config.endpoint).hostname,validLoopbackRejected:true}));
