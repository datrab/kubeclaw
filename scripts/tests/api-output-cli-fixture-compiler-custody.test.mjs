import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';import ts from 'typescript';
import {reviewedCliTypedFixtureCapability,cliTypedFixtureCompilerTarget,reviewedCliTypedFixtureCaller,qualifyCliTypedFixtureInput,qualifyCliNativeCompilerInput,cliNativeCompilerTarget,rootSelectedCompilerTarget,assertCliTypedFixtureGraphPurpose,cliTypedFixtureAnalysisSeed} from '../docs-api-documentation-role-custody.mjs';
import {discoverScriptInputAcquisition} from '../docs-api-output-discovery.mjs';
const root=fs.realpathSync(new URL('../..',import.meta.url).pathname),source='scripts/lib/cli/typed-cli-ast.mjs',fixture='scripts/tests/docs-cli-typed.test.mjs',driver='scripts/lib/cli/cli-native-driver.mjs',bytes=fs.readFileSync(path.join(root,source),'utf8'),fixtureBytes=fs.readFileSync(path.join(root,fixture),'utf8');
function capability(text=bytes){const tree=ts.createSourceFile(source,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),calls=[];const visit=n=>{if(ts.isCallExpression(n)&&!ts.isCallExpression(n.expression)&&n.expression.getText(tree).startsWith('createRequire'))calls.push(n);ts.forEachChild(n,visit);};visit(tree);assert(calls.length);return reviewedCliTypedFixtureCapability(root,source,text,tree,calls[0]);}
test('only the fixed fixture obtains the separate physical TypeScript provenance',()=>{
 reviewedCliTypedFixtureCaller(fixture,fixtureBytes);const cap=capability();assert.equal(cap.kind,'cli-typed-fixture-compiler-require');assert.equal(cap.runtimeAcquisitionAuthorized,false);const target=cliTypedFixtureCompilerTarget(root,cap);assert.equal(target.canonicalTarget,path.join(root,'node_modules/typescript/lib/typescript.js'));assert.equal(target.capabilityKind,cap.kind);
 assert.throws(()=>cliNativeCompilerTarget(root,cap),/CLI compiler capability/);assert.throws(()=>rootSelectedCompilerTarget(root,cap),/capability identity/);
 for(const change of [{specifier:'other'},{profile:'discoveryNoEmit'},{runtimeAcquisitionAuthorized:true}])assert.throws(()=>cliTypedFixtureCompilerTarget(root,{...cap,...change}),/typed fixture capability/);
});
test('fixture URL context source identity and export changes revoke the exact role',()=>{
 for(const changed of [fixtureBytes.replace("new URL('../../package.json',import.meta.url)","new URL('../package.json',import.meta.url)"),fixtureBytes.replace("new URL('../../package.json',import.meta.url)",'process.cwd()'),fixtureBytes.replace('{requireFrom}','{root:process.cwd()}'),fixtureBytes+'\nexport const publicParser=true;\n']){assert.notEqual(changed,fixtureBytes);assert.throws(()=>reviewedCliTypedFixtureCaller(fixture,changed),/typed fixture/);}
 assert.throws(()=>reviewedCliTypedFixtureCaller('scripts/tests/renamed.test.mjs',fixtureBytes),/typed fixture caller/);
});
test('factory alternatives second acquisition and nonliteral specifiers stay unadmitted',()=>{
 for(const [before,after]of [["context.requireFrom??path.resolve(context.root??'.','package.json')",'context.root'],["('typescript')","('other')"],["('typescript')",'(context.specifier)'],['createRequire(context.requireFrom','createRequire.call(null,context.requireFrom']]){assert(bytes.includes(before));assert.throws(()=>capability(bytes.replace(before,after)),/typed fixture/);}
 assert.throws(()=>capability(bytes+'\nconst extra=createRequire(import.meta.url);\n'),/typed fixture/);
});
test('the fixture cannot repair a missing driver injection',()=>{const text=fs.readFileSync(path.join(root,driver),'utf8');assert(text.includes('typescript:ts'));assert.throws(()=>qualifyCliNativeCompilerInput(driver,text.replace('typescript:ts','typescript:undefined')),/CLI compiler bound input/);});
test('new importer package entry or arbitrary fixture identity is rejected',()=>{
 const graph={installedFoundationDependencies:[{capabilityKind:'cli-typed-fixture-compiler-require'}],edges:[{source:driver,target:source,kind:'import',operation:"import {analyzeTypedCliSources} from './typed-cli-ast.mjs';"},{source:fixture,target:source,kind:'import',operation:"import {analyzeTypedCliSources} from '../lib/cli/typed-cli-ast.mjs';"}]};assertCliTypedFixtureGraphPurpose(root,graph);assert.throws(()=>assertCliTypedFixtureGraphPurpose(root,{...graph,edges:[...graph.edges,{source:'tools/public.mjs',target:source,kind:'import',operation:'new caller'}]}),/two-context importer boundary/);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));for(const mode of ['export','command']){const changed=structuredClone(pkg);if(mode==='export')changed.exports='./'+source;else changed.scripts['run:adapter']='node '+source;assert.throws(()=>qualifyCliNativeCompilerInput('package.json',JSON.stringify(changed)),/CLI compiler bound input/);}
 assert.throws(()=>qualifyCliTypedFixtureInput('scripts/tests/other.test.mjs',fixtureBytes),/typed fixture bound input/);
});
test('foreign roots and the copied adapter without its qualified fixture retain refusal',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'docs-cli-typed-fixture-'));try{assert.throws(()=>cliTypedFixtureCompilerTarget(temp,capability()),/canonical recovery root/);fs.mkdirSync(path.join(temp,'scripts/lib/cli'),{recursive:true});fs.writeFileSync(path.join(temp,'package.json'),'{}');fs.writeFileSync(path.join(temp,source),bytes);assert.throws(()=>discoverScriptInputAcquisition(temp),/unsupported createRequire factory base/);}finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('the exact fixture is a finite analysis seed, never a public graph entry',()=>{
 assert.equal(cliTypedFixtureAnalysisSeed(root,[source,driver]),fixture);assert.equal(cliTypedFixtureAnalysisSeed(root,[source]),null);assert.equal(cliTypedFixtureAnalysisSeed('/tmp',[source,driver]),null);
 const graph={installedFoundationDependencies:[{capabilityKind:'cli-typed-fixture-compiler-require'}],edges:[{source:driver,target:source,kind:'import',operation:"import {analyzeTypedCliSources} from './typed-cli-ast.mjs';"},{source:fixture,target:source,kind:'import',operation:"import {analyzeTypedCliSources} from '../lib/cli/typed-cli-ast.mjs';"}],publicEntries:[{path:fixture,canonicalSource:fixture}]};assert.throws(()=>assertCliTypedFixtureGraphPurpose(root,graph),/cannot become public entry/);
});
