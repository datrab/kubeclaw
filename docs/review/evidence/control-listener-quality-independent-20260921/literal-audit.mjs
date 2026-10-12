import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const original='docs/review/evidence/control-route-quality-20260921/control-server.before.ts';
const dir='skills/prism/server';
const files=fs.readdirSync(dir).filter(n=>/^(control-(server|context|http)|.*-routes?|baseline-.*|publication-.*)\.ts$/.test(n)).map(n=>`${dir}/${n}`);
function literals(file){
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const values=[];
 function walk(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) values.push(n.text);ts.forEachChild(n,walk);}walk(ast);return values;
}
const before=literals(original),after=files.flatMap(literals);
const sql=x=>/^(SELECT |INSERT INTO |UPDATE |DELETE FROM )/.test(x);
const sqlBefore=before.filter(sql).sort(),sqlAfter=after.filter(sql).sort();
const missing=sqlBefore.filter((v,i)=>sqlBefore.slice(0,i+1).filter(x=>x===v).length>sqlAfter.filter(x=>x===v).length);
const result={scope:'AST string-literal inventory; not semantic equivalence or execution proof',files,originalSql:sqlBefore.length,currentSql:sqlAfter.length,missing};
fs.writeFileSync('docs/review/evidence/control-listener-quality-independent-20260921/literal-audit.json',JSON.stringify(result,null,2)+'\n');assert.deepEqual(sqlAfter,sqlBefore);
