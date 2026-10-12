import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import crypto from 'node:crypto';
const roots=['skills','tests','scripts','docker'];
const rows=[], calls=[], platforms=[], templates=[];
function visit(dir) { for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
 const file=path.join(dir,item.name); if(item.isDirectory())visit(file); else if(item.isFile()&& /\.(?:[cm]?[jt]s|sh|json|md)$/.test(file)){
  const source=fs.readFileSync(file,'utf8'); if(!/EffectCoordinator|pipeline-platform\.v2/.test(source))continue;
  rows.push({path:file,sha256:crypto.createHash('sha256').update(source).digest('hex')});
  if(/\.[cm]?[jt]s$/.test(file)){
   const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
   function walk(node){
    if(ts.isNewExpression(node)&&/(?:^|\.)EffectCoordinator$/.test(node.expression.getText(ast)))calls.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,arguments:node.arguments?.length??0,source:node.getText(ast)});
    if(ts.isObjectLiteralExpression(node)&&node.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast).replace(/['"]/g,'')==='schemaVersion'&&p.initializer.getText(ast).includes('pipeline-platform.v2')))platforms.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,hasTtl:node.properties.some(p=>p.name?.getText(ast).replace(/['"]/g,'')==='effectLockTtlMs')});
    if((ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateExpression(node))&&/EffectCoordinator|pipeline-platform\.v2/.test(node.getText(ast)))templates.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,source:node.getText(ast)});
    ts.forEachChild(node,walk);
   }walk(ast);
  }
 }
}}
roots.forEach(visit);
console.log(JSON.stringify({rows,calls,platforms,templates},null,2));
