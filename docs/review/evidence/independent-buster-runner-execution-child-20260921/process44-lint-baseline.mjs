import fs from 'node:fs';
import crypto from 'node:crypto';
import { ESLint } from '../../../../node_modules/eslint/lib/api.js';
const eslint=new ESLint({overrideConfigFile:'charts/kubeclaw/files/config/eslint-config.mjs'});
const result=[];
for(const name of ['kubernetes-fixture-runtime.ts','process-input-lifecycle.ts','process-input.ts','tailscale-exposure-runtime.ts']){
 const filePath='skills/buster/engine/test-gates/'+name;
 const row={filePath};
 for(const [label,p] of Object.entries({before:'docs/review/evidence/buster-process-input-policy-20260921/before/'+filePath,current:filePath})){
  const source=fs.readFileSync(p,'utf8');row[label]={sha256:crypto.createHash('sha256').update(source).digest('hex'),messages:(await eslint.lintText(source,{filePath}))[0].messages.map(({ruleId,message,line})=>({ruleId,message,line}))};
 }
 result.push(row);
}
fs.writeFileSync('docs/review/evidence/independent-buster-runner-execution-child-20260921/process44-lint-baseline.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.map(r=>({file:r.filePath,before:r.before.messages.length,current:r.current.messages.length})),null,2));
