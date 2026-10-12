import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const directory='docs/review/evidence/control-route-quality-20260921';
const files=JSON.parse(fs.readFileSync(`${directory}/production-files.json`,'utf8'));
function inventory(source) {
  const ast=ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true);
  const result={sql:[],errors:[],routes:[],regex:[]};
  const visit=node=>{
    if(ts.isStringLiteral(node) && /^(SELECT|INSERT|UPDATE|DELETE) /u.test(node.text))result.sql.push(node.text);
    if(ts.isStringLiteral(node) && /^\/v1\//u.test(node.text))result.routes.push(node.text);
    if(node.kind===ts.SyntaxKind.RegularExpressionLiteral)result.regex.push(node.text);
    if(ts.isNewExpression(node)&&node.expression.getText(ast)==='Error')result.errors.push(node.arguments?.[0]?.getText(ast).replace(/['"]/gu,'').replace(/\s+/gu,' '));
    ts.forEachChild(node,visit);
  };visit(ast);for(const key of Object.keys(result))result[key].sort();return result;
}
const before=inventory(fs.readFileSync(`${directory}/control-server.before.ts`,'utf8'));
const after=inventory(files.map(file=>fs.readFileSync(file,'utf8')).join('\n'));
for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],key);
console.log(JSON.stringify({sql:before.sql.length,errors:before.errors.length,routes:before.routes.length,regex:before.regex.length,claim:'Exact selected syntax inventory; not whole-program equivalence.'},null,2));
