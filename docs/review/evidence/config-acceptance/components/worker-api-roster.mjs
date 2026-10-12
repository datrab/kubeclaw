import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import ts from 'typescript';
const root='skills/worker/core/worker';const roster=[];const fields=[];const env=[];
for(const name of fs.readdirSync(root).sort()){if(!name.endsWith('.ts')&&!name.endsWith('.c'))continue;const file=path.join(root,name);const text=fs.readFileSync(file,'utf8');const sha256=crypto.createHash('sha256').update(text).digest('hex');
if(name.endsWith('.c')){for(const m of text.matchAll(/getenv\("([^"]+)"\)/g))env.push({file,name:m[1],reader:'getenv',sha256});continue;}
const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function loc(node){return source.getLineAndCharacterOfPosition(node.getStart()).line+1;}
function walk(node){
 if(ts.isInterfaceDeclaration(node)){roster.push({file,sha256,line:loc(node),interface:node.name.text,members:node.members.map(m=>({line:loc(m),kind:ts.SyntaxKind[m.kind],name:m.name?.getText(source)??null,optional:!!m.questionToken,type:m.type?.getText(source)??null,parameters:m.parameters?.map(p=>({name:p.name.getText(source),type:p.type?.getText(source)??null,default:p.initializer?.getText(source)??null}))??null}))});}
 if(ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isConstructorDeclaration(node)){for(const p of node.parameters)if(p.initializer)fields.push({file,sha256,line:loc(p),owner:node.name?.getText(source)??'constructor',parameter:p.name.getText(source),default:p.initializer.getText(source),disposition:'source-default candidate; correlate against semantic row or composition/protocol classification, never silent omission'});}
 ts.forEachChild(node,walk);
}walk(source);}
console.log(JSON.stringify({command:'node docs/review/evidence/config-acceptance/components/worker-api-roster.mjs',typescriptVersion:ts.version,roster,parameterDefaults:fields,envReads:env,note:'Complete syntax AST interface/default roster; meaning separately manually classified, not a semantic coverage PASS'},null,2));
