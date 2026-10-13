const fs=require('fs'),yaml=require('js-yaml'),Ajv=require('ajv');
const base='docs/review/evidence/config-acceptance/delivery';
const schema=yaml.load(fs.readFileSync(base+'/pinned-lint-reader-bce3f075/cli/src/semgrep/semgrep_interfaces/rule_schema_v1.yaml','utf8'));
const check=new Ajv({allErrors:true,strictSchema:false,strictTypes:false}).compile(schema);
const results=[];
for(const p of ['A','B']){
 const original=yaml.load(fs.readFileSync(base+'/lint-definition-profiles-bce3f075/'+p+'.semgrep.yml','utf8'));
 for(const kind of ['positive','missing-pattern','invalid-severity']){
  const input=structuredClone(original);if(kind==='missing-pattern')delete input.rules[0].pattern;if(kind==='invalid-severity')input.rules[0].severity='DELIVERY_INVALID';
  const valid=check(input);results.push({profile:p,kind,valid,expectedValid:kind==='positive',passed:valid===(kind==='positive'),errors:check.errors});
 }
}
console.log(JSON.stringify({scope:'Exact primary schema shape only; no native rule parser/language semantics or lint execution',results,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length},null,2));
process.exitCode=results.some(x=>!x.passed)?1:0;
