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

// Runtime stage captures must accept the same versioned owner as its author files.
for (const target of ['config.schema.json','repository-audit-config.schema.json']) {
 const file=path.join(root,'skills/nova/plugins/review/schemas',target);
 const stage=JSON.parse(fs.readFileSync(file,'utf8'));
 const expected=ownedPolicyProfilesSchema('#/$defs/reviewOwnedPolicy');
 if(process.argv.includes('--check'))assert.deepEqual(stage.properties.ownedPolicyProfiles,expected,target);
 else {stage.properties.ownedPolicyProfiles=expected;fs.writeFileSync(file,JSON.stringify(stage,null,2)+'\n');}
}
