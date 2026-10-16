import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {reviewPolicySchema} from '../skills/nova/plugins/review/src/review-policy-contract.ts';
import {ownedPolicyProfilesSchema} from '../skills/nova/plugins/review/src/review-owned-policy-schema.ts';
const root=path.resolve(import.meta.dirname,'..');
const policy=structuredClone(reviewPolicySchema);
delete policy.$id;delete policy.$schema;
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',...ownedPolicyProfilesSchema('#/$defs/policy'),$defs:{policy}};
const targets=['skills/common/plugin-runtime/foundation/config/review-owned-policy.schema.json','skills/nova/plugins/review/schemas/owned-policy.schema.json'];
for(const target of targets){const file=path.join(root,target);if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),schema,target);else fs.writeFileSync(file,JSON.stringify(schema,null,2)+'\n');}
