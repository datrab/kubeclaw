// Exact acquired Semgrep primary schema + generated profile syntax only.
// No Semgrep/ESLint native execution, module import, login, API or image action.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),yaml=require('js-yaml'),Ajv=require('ajv');
const out=__dirname,repo=path.resolve(out,'../../../../..');
const primary=path.join(out,'pinned-lint-reader-bce3f075/cli/src/semgrep/semgrep_interfaces/rule_schema_v1.yaml');
const schema=yaml.load(fs.readFileSync(primary,'utf8'));
const ajv=new Ajv({allErrors:true,strictSchema:false,strictTypes:false});
const validate=ajv.compile(schema),records=[];
for(const profile of ['A','B']){
 const file=path.join(out,'lint-definition-profiles-bce3f075',profile+'.semgrep.yml'),value=yaml.load(fs.readFileSync(file,'utf8'));
 const success=validate(value);records.push({id:'DLV-C0-BCE3-SEMgrep-SCHEMA-'+profile,profile:file.slice(repo.length+1),expected:true,valid:success,errors:validate.errors,result:success?'passed':'failed'});
 for(const [kind,mutate] of [['NO-PATTERN',v=>delete v.rules[0].pattern],['INVALID-SEVERITY',v=>v.rules[0].severity='DELIVERY_INVALID']]){
  const mutant=JSON.parse(JSON.stringify(value));mutate(mutant);const valid=validate(mutant);records.push({id:'DLV-C0-BCE3-SEMgrep-SCHEMA-'+profile+'-'+kind,expected:false,valid,errors:validate.errors,result:valid?'failed':'passed'});
 }
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const output={scope:'selected immutable Semgrep1.170.0 primary JSONschema (YAML) shape only; no native rule/language-pattern parser or tool effects',method:'Existing installed Ajv strictSchema/strictTypes diagnostics disabled for primary schema annotations/union types only; no changed schema bytes, broad object substitute, skipped references or added local rules. Native Semgrep parser remains separate.',records,sourceDigests:{[primary.slice(repo.length+1)]:hash(primary),[__filename.slice(repo.length+1)]:hash(__filename)},toolIdentity:{node:process.version,ajv:require('ajv/package.json').version,'js-yaml':require('js-yaml/package.json').version},acceptance:'INCOMPLETE; structural definition controls only'};
fs.writeFileSync(path.join(out,'definition-syntax-bce3f075.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(records.map(x=>({id:x.id,result:x.result}))));process.exit(records.some(x=>x.result==='failed')?1:0);
