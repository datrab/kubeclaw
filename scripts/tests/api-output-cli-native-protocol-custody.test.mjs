import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {discoverScriptInputAcquisition,nativeOutputConsumerMatches} from '../docs-api-output-discovery.mjs';
import {assertCliNativeCompilerGraphPurpose} from '../docs-api-documentation-role-custody.mjs';
const root=path.resolve(import.meta.dirname,'../..'),modulePath='scripts/docs-api-output-discovery.mjs';
const code=fs.readFileSync(path.join(root,modulePath),'utf8'),tree=ts.createSourceFile(modulePath,code,ts.ScriptTarget.Latest,true);
const graph=discoverScriptInputAcquisition(root),sha=x=>createHash('sha256').update(x).digest('hex');
const profileStatement=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)==='reviewedCliStaticAstProtocols'));
const names=['cliStaticAstDescriptor','assertCliStaticAstSourcePurpose','assertCliStaticAstOutputVector'];
const declarations=names.map(name=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(tree);});
assert(profileStatement);
const pySource='scripts/lib/cli/python_cli_ast.py',goSource='scripts/lib/cli/go_cli_ast.go';
const python=JSON.parse(execFileSync('python3',[path.join(root,'scripts/docs-api-python-output-adapter.py'),path.join(root,pySource),'--classify'],{encoding:'utf8'}));
const go=JSON.parse(execFileSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',path.join(root,'scripts/docs-api-go-output-role-adapter.go')],{input:JSON.stringify([{path:path.join(root,goSource)}]),encoding:'utf8'}));
const contracts=JSON.parse(fs.readFileSync(path.join(root,'scripts/docs-api-producer-adapter-authorities.json'))).nativeLanguageSerializationContracts;
const outputsFor=source=>contracts.filter(c=>c.source===source).flatMap(c=>c.outputs);
function privateVerifier({overrides=new Map(),cwd=root,selectedGraph=graph,warm=false}={}){
 const reader={...fs,readFileSync:(file,...args)=>overrides.has(String(file))?(args[0]?overrides.get(String(file)).toString(args[0]):overrides.get(String(file))):fs.readFileSync(file,...args)};
 const cachePrefix=JSON.stringify([root]).slice(0,-1)+',';
 const hash=value=>warm&&typeof value==='string'&&value.startsWith(cachePrefix)?'known-warm-key':sha(value);
 const context=vm.createContext({assert,fs:reader,path,URL,process:{cwd:()=>cwd,env:{}},hash,documentationGraphCache:new Map([[root,selectedGraph]]),assertCliNativeCompilerGraphPurpose,walkProductSources:()=>[goSource],documentationToolSources:()=>new Set(),goOutputCache:new Map([[root,{key:'known-warm-key',result:['known-cached-result']} ]])});
 vm.runInContext(profileStatement.getText(tree)+'\n'+declarations.join('\n')+'\nglobalThis.api={source:assertCliStaticAstSourcePurpose,vector:assertCliStaticAstOutputVector};',context);
 const vector=(source,rows)=>{context.input=JSON.stringify(rows);return context.api.vector(root,source,vm.runInContext('JSON.parse(input)',context));};
 if(warm){const roots=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)==='producerRoots'));assert(roots);vm.runInContext(roots.getText(tree),context);const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='discoverGoApiOutputs');assert(node);vm.runInContext(node.getText(tree).replace('export function','function').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.join(root,modulePath)).href))+'\nglobalThis.warmGo=discoverGoApiOutputs;',context);}
 return {source:(selectedRoot,source)=>context.api.source(selectedRoot,source),vector,warmGo:()=>context.warmGo(root)};
}
test('two exact protocols keep canonical UNKNOWN and seven Python states never match serializer contracts',()=>{
 const verify=privateVerifier();
 assert.equal(verify.vector(pySource,python).source,pySource);
 assert.equal(verify.vector(goSource,go).source,goSource);
 assert.equal(python.length,8);assert.equal(go.length,4);
 assert(python.every(o=>o.role==='unknown'));assert(go.every(o=>o.role==='unknown'&&o.authorityQualified));
 assert.equal(python.filter(o=>o.gap).length,7);
 for(const output of python)assert.equal(nativeOutputConsumerMatches({...output,cliStaticAstOwner:pySource},outputsFor(pySource),root),!output.gap);
 assert.equal(nativeOutputConsumerMatches(python[0],outputsFor(pySource),root),false);
 assert.equal(nativeOutputConsumerMatches({...python[0],cliStaticAstOwner:'scripts/foreign.py'},outputsFor(pySource),root),false);
 for(const output of go)assert.equal(nativeOutputConsumerMatches(output,outputsFor(goSource),root),true);
 for(const source of [pySource,goSource])assert.equal(outputsFor(source).length,source===pySource?1:4);
});
test('complete eight/four descriptor rosters reject new missing reordered renamed role and operation observations',()=>{
 for(const [source,rows]of [[pySource,python],[goSource,go]]){
  for(const mutate of [
   a=>a.slice(1),a=>[...a,a[0]],a=>[...a].reverse(),
   a=>a.map((o,i)=>i?o:{...o,expression:o.expression+' unreviewed'}),
   a=>a.map((o,i)=>i?o:{...o,operation:o.operation+'\nunknown()'}),
   a=>a.map((o,i)=>i?o:{...o,role:'non-api'}),
   a=>a.map((o,i)=>i?o:{...o,function:'foreign'}),
   a=>a.map((o,i)=>i?o:{...o,line:o.line+1}),
  ])assert.throws(()=>privateVerifier().vector(source,mutate(structuredClone(rows))),/CLI_STATIC_AST_PROTOCOL_UNQUALIFIED/);
 }
 const extra={...python[1],expression:'import unreviewed'};
 assert.equal(nativeOutputConsumerMatches(extra,outputsFor(pySource),root),false);
 assert.throws(()=>privateVerifier().vector(pySource,[python[0],extra,...python.slice(2)]),/CLI_STATIC_AST_PROTOCOL_UNQUALIFIED/);
});
test('helper and selected driver stdio/parser/offline/version/cleanup/source-text constraints are fresh byte-bound',()=>{
 const driver='scripts/lib/cli/cli-native-driver.mjs',driverBytes=fs.readFileSync(path.join(root,driver),'utf8');
 const cases=[
  [pySource,text=>text.replace("json.dump({'sources':","json.dump({'resource':")],
  [pySource,text=>text.replace('qualify_selected_argparse_prerequisite()','void_prerequisite()')],
  [pySource,text=>text+"\nprint('unreviewed')\n"],
  [goSource,text=>text.replace('Encode(out)','Encode(resource)')],
  [goSource,text=>text+"\n// added serializer or unreviewed source\n"],
  [driver,text=>text.replace("['-I',path.join(producerDirectory,'python_cli_ast.py')]","[path.join(producerDirectory,'python_cli_ast.py')]")],
  [driver,text=>text.replace("Number(pythonVersion.split('.')[1])!==11","Number(pythonVersion.split('.')[1])!==10")],
  [driver,text=>text.replace("GOPROXY:'off'","GOPROXY:'direct'")],
  [driver,text=>text.replace("includes('go'+versions.GO_VERSION)","includes('go0.0.0')")],
  [driver,text=>text.replace('finally{fs.rmSync(scratch','finally{void fs.rmSync(scratch')],
  [driver,text=>text.replace('({path,text})=>({path,text})','({path,text})=>({path})')],
  [driver,text=>text.replace("producerDirectory=path.join(root,'scripts/lib/cli')","producerDirectory='/tmp/other'")],
 ];
 for(const [source,mutate]of cases){const before=source===driver?driverBytes:fs.readFileSync(path.join(root,source),'utf8'),after=mutate(before);assert.notEqual(after,before,source);const overrides=new Map([[path.join(root,source),Buffer.from(after)]]);assert.throws(()=>privateVerifier({overrides}).vector(pySource,python),/CLI_STATIC_AST_PROTOCOL_UNQUALIFIED/);}
});
test('root cwd caller package public entry and private driver graph stay closed',()=>{
 assert.throws(()=>privateVerifier().source('/tmp',pySource),/canonical root\/cwd/);
 assert.throws(()=>privateVerifier({cwd:'/tmp'}).source(root,pySource),/canonical root\/cwd/);
 assert.throws(()=>privateVerifier().source(root,'scripts/foreign.py'),/source/);
 const caller='scripts/docs-inventory.mjs',before=fs.readFileSync(path.join(root,caller),'utf8'),after=before.replace('generateNativeCliModel(root)',"generateNativeCliModel(root,{producerDirectory:'/tmp'})");assert.notEqual(before,after);
 assert.throws(()=>privateVerifier({overrides:new Map([[path.join(root,caller),Buffer.from(after)]])}).source(root,pySource),/bound input/);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));pkg.scripts['run:foreign-cli-helper']='python3 scripts/lib/cli/python_cli_ast.py';
 assert.throws(()=>privateVerifier({overrides:new Map([[path.join(root,'package.json'),Buffer.from(JSON.stringify(pkg))]])}).source(root,pySource),/bound input/);
 const changed=structuredClone(graph);changed.edges.push({source:'tools/foreign.mjs',target:'scripts/lib/cli/cli-native-driver.mjs',kind:'import',operation:"import driver from '../scripts/lib/cli/cli-native-driver.mjs';"});
 assert.throws(()=>privateVerifier({selectedGraph:changed}).source(root,pySource),/CLI compiler private importer boundary/);
 const noFoundation=structuredClone(graph);noFoundation.installedFoundationDependencies=[];
 assert.throws(()=>privateVerifier({selectedGraph:noFoundation}).source(root,pySource),/existing injected compiler/);
});
test('Go consumed encoder and helper stderr cannot become independent publication or target exit authority',()=>{
 for(const original of go){
  const changed={...original,operation:original.operation.replace('.Encode(out)','.Encode(arbitrary)')};
  const refreshed=outputsFor(goSource).map(c=>({...c,operationDigest:sha(changed.operation)}));
  assert.equal(nativeOutputConsumerMatches(changed,refreshed,root),false);
 }
 const constructor=go.find(o=>o.expression==='json.NewEncoder(os.Stdout)');
 assert(constructor);
 assert.equal(nativeOutputConsumerMatches({...constructor,role:'api'},outputsFor(goSource),root),false);
 for(const original of go.filter(o=>o.expression.startsWith('fmt.Fprintln')))assert.equal(nativeOutputConsumerMatches({...original,function:'targetProgram'},outputsFor(goSource),root),false);
});

test('actual Go cache path rechecks the closed caller profile before returning a warm result',()=>{
 assert.deepEqual([...privateVerifier({warm:true}).warmGo()],['known-cached-result']);
 const source='scripts/lib/cli/cli-native-driver.mjs',before=fs.readFileSync(path.join(root,source),'utf8'),changed=before.replace("GOPROXY:'off'","GOPROXY:'direct'");assert.notEqual(before,changed);
 assert.throws(()=>privateVerifier({warm:true,overrides:new Map([[path.join(root,source),Buffer.from(changed)]])}).warmGo(),/CLI_STATIC_AST_PROTOCOL_UNQUALIFIED: bound input/);
});
