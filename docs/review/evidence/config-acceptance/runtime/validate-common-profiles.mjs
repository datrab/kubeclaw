import fs from 'node:fs';
import crypto from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const base='docs/review/evidence/config-acceptance/runtime/';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const ajv=new Ajv2020({allErrors:true,strict:false,useDefaults:false,coerceTypes:false});addFormats(ajv);
const profiles=JSON.parse(fs.readFileSync(base+'common-complete-profiles.json','utf8'));
const observations=[];
for (const [plugin,profile] of Object.entries(profiles)) {
 const [owner,registration]=plugin.split(':');
 const schemaPath=`skills/common/plugins/${owner}/schemas/${registration==='openclaw'?'openclaw-config':'config'}.schema.json`;
 const raw=fs.readFileSync(schemaPath);const validate=ajv.compile(JSON.parse(raw));
 const ok=validate(profile);observations.push({plugin,schemaPath,schemaSha256:sha(raw),profileSha256:sha(JSON.stringify(profile)),currentSchemaResult:ok?'passed':'failed',errors:structuredClone(validate.errors),meaning:'C0 definition check of proposed profile against CURRENT schema only; schema acceptance is not consumer/target acceptance. Placeholder path/URI variables not materialized.'});
}
fs.writeFileSync(base+'common-profile-schema-observations.json',JSON.stringify({command:'node '+base+'validate-common-profiles.mjs',node:process.version,validatorSha256:sha(fs.readFileSync(base+'validate-common-profiles.mjs')),observations},null,2)+'\n');
console.log(JSON.stringify(observations,null,2));
