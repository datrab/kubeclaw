import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {reviewPolicySchema} from '../skills/nova/plugins/review/src/review-policy-contract.ts';
const root=path.resolve(import.meta.dirname,'..');
const policy=structuredClone(reviewPolicySchema);
delete policy.$id;delete policy.$schema;
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',additionalProperties:false,
 required:['schemaVersion','profiles'],properties:{schemaVersion:{const:'review-owned-decision-profiles.v1'},profiles:{type:'object',additionalProperties:false,required:['gate','lean','audit'],properties:Object.fromEntries(['gate','lean','audit'].map(name=>[name,{allOf:[{$ref:'#/$defs/policy'},{type:'object',properties:{profile:{const:name}}}]}]))}},$defs:{policy}};
const targets=['skills/common/plugin-runtime/foundation/config/review-owned-policy.schema.json','skills/nova/plugins/review/schemas/owned-policy.schema.json'];
for(const target of targets){const file=path.join(root,target);if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),schema,target);else fs.writeFileSync(file,JSON.stringify(schema,null,2)+'\n');}
