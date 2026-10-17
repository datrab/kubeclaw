import fs from 'node:fs';
import vm from 'node:vm';
function objectAt(source,needle){const start=source.indexOf('{',source.indexOf(needle));let level=0,quote=null,escape=false;for(let i=start;i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}if("'\"`".includes(c)){quote=c;continue;}if(c==='{')level++;if(c==='}'&&--level===0)return source.slice(start,i+1);}throw new Error('unclosed literal');}
const gradePath='skills/nova/plugins/review/src/repository-review-profile.ts',policyPath='skills/nova/plugins/review/src/review-policy-profiles.ts';
const gradeSource=fs.readFileSync(gradePath,'utf8'),policySource=fs.readFileSync(policyPath,'utf8');
const lenses=['architecture','contracts','security','lifecycle','resilience','deployment','simplification'];
const grades=vm.runInNewContext('('+objectAt(gradeSource,'const DEFAULTS:').replace(/Object\.freeze<[^>]+>/g,'Object.freeze')+')',{ALL_LENSES:lenses});
const policies={};for(const name of ['gate','lean','audit'])policies[name]=vm.runInNewContext('('+objectAt(policySource,'const '+name+' = checked(')+')',{priorityWeights:{P0:1000,P1:500,P2:100,P3:10},categoryWeights:{correctness:1000,security:1000,contract:900,architecture:100,simplification:10},SIMPLIFICATION_RULE_IDS:['SIM001','SIM002','SIM003','SIM004','SIM005','SIM006','SIM007','SIM008']});
fs.writeFileSync('docs/review/evidence/config-acceptance/runtime/extracted-profile-values.json',JSON.stringify({grades:{path:gradePath,values:grades},policies:{path:policyPath,values:policies}},null,2)+'\n');
console.log(JSON.stringify({grades:Object.keys(grades),policies:Object.keys(policies)}));
