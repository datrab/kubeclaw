import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript'); // Genuine selected compiler, no program/checker APIs.
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const parentPath='scripts/docs-platform-surface-inventory.mjs';
const custodyPath='scripts/docs-api-documentation-role-custody.mjs';
const parent=fs.readFileSync(path.join(root,parentPath),'utf8');
const custody=fs.readFileSync(path.join(root,custodyPath),'utf8');
function parse(source,text){
 const tree=ts.createSourceFile(source,text,ts.ScriptTarget.Latest,true);
 assert.equal(tree.parseDiagnostics.length,0,`invalid selected source ${source}`);return tree;
}
const parentTree=parse(parentPath,parent),custodyTree=parse(custodyPath,custody);
function selectedFunction(tree,name){
 const matches=tree.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 assert.equal(matches.length,1,`missing/ambiguous function ${name}`);return matches[0];
}
function functionSyntax(tree,name){
 const node=selectedFunction(tree,name),syntax=node.getText(tree);
 if(node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)){
  assert.ok(syntax.startsWith('export function '));return syntax.slice('export '.length);
 }
 return syntax;
}
const guardSyntax=functionSyntax(custodyTree,'assertReviewedVariableDocumentationChild');
const helperSyntax=functionSyntax(custodyTree,'documentationChildSourceAuthority');
const recipeStatements=custodyTree.statements.filter(node=>ts.isVariableStatement(node)
 &&node.declarationList.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text==='reviewedVariableDocumentationChildren'));
assert.equal(recipeStatements.length,1,'missing/ambiguous source-owned variable-child recipe');
assert.ok(recipeStatements[0].declarationList.flags&ts.NodeFlags.Const);
const actual={assert,fs,path,createHash,ts};vm.createContext(actual);
vm.runInContext([guardSyntax,recipeStatements[0].getText(custodyTree),helperSyntax].join('\n'),actual,{filename:'actual-source-variable-child-custody'});
const actualAcquire=vm.runInContext('documentationChildSourceAuthority',actual);
// Normalize only finite path/canonical/hash data across VM realms for strict assertions.
const acquire=(...args)=>JSON.parse(JSON.stringify(actualAcquire(...args)));
const owner=functionSyntax(parentTree,'deployedStaticObjects');

const namespace='fixture-namespace',recordingRoot='/finite-fixture-root';
function execute(syntax){
 const calls=[],consumers=[];
 const sandbox={root:recordingRoot,process:Object.freeze({execPath:'/bound-node-fixture'}),
  execFileSync:(binary,argv,options)=>{
   const index=calls.length;assert.ok(index<2,'UNEXPECTED_BRANCH:third subprocess');
   assert.equal(binary,'/bound-node-fixture');
   const expected=index===0?['scripts/render-litellm-deployment.mjs','my-values/infra/litellm-config.yaml','my-values/infra/litellm-deployment.yaml']:
    ['scripts/render-postgresql-recovery.mjs',namespace,'my-values/infra/postgresql-recovery.yaml','my-values/infra/postgresql-values.yaml','my-values/infra/litellm-deployment.yaml','postgresql'];
   assert.deepEqual(Array.from(argv),expected);
   assert.deepEqual(JSON.parse(JSON.stringify(options)),{cwd:recordingRoot,encoding:'utf8',maxBuffer:16777216});
   calls.push({binary,argv:Array.from(argv),options:JSON.parse(JSON.stringify(options))});
   return index===0?'FINITE_LITELLM_DOCUMENT':'FINITE_RECOVERY_DOCUMENT';
  },
  objects:(rendered,source,ns)=>{
   assert.equal(ns,namespace);consumers.push({rendered,source});
   if(rendered==='FINITE_LITELLM_DOCUMENT'){assert.equal(source,'my-values/infra/litellm-deployment.yaml');return [{value:{kind:'Service'}}];}
   assert.equal(rendered,'FINITE_RECOVERY_DOCUMENT');assert.equal(source,'scripts/render-postgresql-recovery.mjs');return [{value:{kind:'CronJob'}}];
  },
  literalLocation:()=>{throw new Error('UNEXPECTED_BRANCH:literalLocation');},
 };
 vm.createContext(sandbox);vm.runInContext(syntax,sandbox);const result=sandbox.deployedStaticObjects(namespace);
 assert.equal(calls.length,2);assert.equal(consumers.length,2);assert.equal(result.length,2);return calls;
}
test('exact docs argv omits preflight and retains resource consumer/options',()=>{const calls=execute(owner);assert.ok(!calls[1].argv.includes('--preflight'));});
test('reintroduced documentation preflight flag fails recording argv contract',()=>{
 const changed=owner.replace("recoverySource,\n    namespace,","recoverySource,\n    '--preflight',\n    namespace,");assert.notEqual(changed,owner);assert.throws(()=>execute(changed));
});

const source=parentPath;
 function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-variable-child-'));fs.chmodSync(root,0o700);
  try{
   for(const [name,bytes]of [[source,parent],['scripts/render-postgresql-recovery.mjs','// finite child one'],['scripts/render-litellm-deployment.mjs','// finite literal child']]){
    const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);
   }
   run(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
 test('actual child helper acquires exact variable child and unchanged literal neighbor',()=>fixture(root=>{
  const facts=acquire(root,source);for(const child of ['scripts/render-postgresql-recovery.mjs','scripts/render-litellm-deployment.mjs']){
   const fact=facts.find(item=>item.path===child);assert.ok(fact);assert.equal(fact.canonical,child);assert.equal(fact.sha256,hash(fs.readFileSync(path.join(root,child))));
  }
 }));
 test('actual child-byte change invalidates old equality without changing parent',()=>fixture(root=>{
  const before=acquire(root,source);fs.appendFileSync(path.join(root,'scripts/render-postgresql-recovery.mjs'),'\n// mutation');
  const after=acquire(root,source);assert.notDeepEqual(after,before);assert.throws(()=>assert.deepEqual(after,before));assert.equal(fs.readFileSync(path.join(root,source),'utf8'),parent);
 }));
 for(const [kind,mutate]of [
  ['let',s=>s.replace('const recoverySource','let recoverySource')],
  ['name',s=>s.replaceAll('recoverySource','otherSource')],
  ['path',s=>s.replace("recoverySource = 'scripts/render-postgresql-recovery.mjs'","recoverySource = 'scripts/other.mjs'")],
  ['absolute',s=>s.replace("recoverySource = 'scripts/render-postgresql-recovery.mjs'","recoverySource = '/outside.mjs'")],
  ['escape',s=>s.replace("recoverySource = 'scripts/render-postgresql-recovery.mjs'","recoverySource = '../outside.mjs'")],
  ['computed',s=>s.replace("recoverySource = 'scripts/render-postgresql-recovery.mjs'","recoverySource = process.env.CHILD")],
  ['mutation',s=>s.replace('const recoveryRendered =',"recoverySource = 'scripts/other.mjs'; const recoveryRendered =")],
  ['alias',s=>s.replace('const recoveryRendered =','const alias = recoverySource; const recoveryRendered =')],
  ['shadow',s=>s.replace('const recoveryRendered =','{ const recoverySource = "shadow"; } const recoveryRendered =')],
  ['addedcall',s=>s.replace('const recoveryRendered =','execFileSync(process.execPath,[recoverySource]); const recoveryRendered =')],
  ['cwd',s=>s.replaceAll('cwd: root','cwd: process.cwd()')],
  ['import',s=>s.replace("{ execFileSync }","{ execFileSync as spawnAlias }")],
  ['ownerremoved',s=>s.replace('function deployedStaticObjects','function replacedOwner')],
  ['preflight',s=>s.replace("recoverySource,\n    namespace,","recoverySource,\n    '--preflight',\n    namespace,")],
 ])test(`finite known-source child recipe rejects ${kind}`,()=>fixture(root=>{
  const changed=mutate(parent);assert.notEqual(changed,parent);fs.writeFileSync(path.join(root,source),changed);
  assert.throws(()=>acquire(root,source),/finite variable child custody/);
 }));
 test('unknown-source variable does not inherit singular source recipe',()=>fixture(root=>{
  const other='scripts/unknown.mjs';fs.writeFileSync(path.join(root,other),parent);const facts=acquire(root,other);
  assert.ok(!facts.some(item=>item.path==='scripts/render-postgresql-recovery.mjs'));
 }));
 test('unrelated literal-only acquisition remains unchanged',()=>fixture(root=>{
  const other='scripts/literal.mjs';fs.writeFileSync(path.join(root,other),"import {execFileSync} from 'node:child_process'; execFileSync(process.execPath,['scripts/render-litellm-deployment.mjs']);");
  const facts=acquire(root,other);assert.equal(facts.length,1);assert.equal(facts[0].path,'scripts/render-litellm-deployment.mjs');
 }));
 test('missing variable child remains null-denial fact',()=>fixture(root=>{
  fs.unlinkSync(path.join(root,'scripts/render-postgresql-recovery.mjs'));const fact=acquire(root,source).find(item=>item.path==='scripts/render-postgresql-recovery.mjs');assert.deepEqual(fact,{path:'scripts/render-postgresql-recovery.mjs',canonical:null,sha256:null});
 }));
 test('nonfile child and escaping symlink reject canonical authority',()=>fixture(root=>{
  const file=path.join(root,'scripts/render-postgresql-recovery.mjs');fs.unlinkSync(file);fs.mkdirSync(file);assert.throws(()=>acquire(root,source),/child\/source authority escapes repository/);fs.rmdirSync(file);
  const external=fs.mkdtempSync(path.join(os.tmpdir(),'docs-variable-child-outside-'));try{const target=path.join(external,'child.mjs');fs.writeFileSync(target,'// outside');fs.symlinkSync(target,file);assert.throws(()=>acquire(root,source),/child\/source authority escapes repository/);}finally{fs.rmSync(external,{recursive:true,force:true});}
 }));
