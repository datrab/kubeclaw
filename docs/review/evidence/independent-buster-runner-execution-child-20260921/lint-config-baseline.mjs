import fs from 'node:fs';
import { ESLint } from '../../../../node_modules/eslint/lib/api.js';
const filePath='charts/kubeclaw/files/config/eslint.config.mjs';
const eslint=new ESLint({overrideConfigFile:filePath});
const results={};
for(const [name,path] of Object.entries({before:'docs/review/evidence/provider-child-session-simplicity-20260921/boundary-before/'+filePath,current:filePath})){
 results[name]=(await eslint.lintText(fs.readFileSync(path,'utf8'),{filePath}))[0].messages.map(({ruleId,message})=>({ruleId,message}));
}
console.log(JSON.stringify(results,null,2));
if(JSON.stringify(results.before)!==JSON.stringify(results.current))process.exitCode=1;
