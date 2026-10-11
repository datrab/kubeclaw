import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import * as nodeModule from 'node:module';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {discoverScriptApiOutputs,producerAdapterOperationRecipe} from '../docs-api-output-discovery.mjs';
import {assertProductApiContexts} from '../docs-api-product-scope.mjs';
import {receiverContracts} from '../docs-kubernetes-pv-selected-receiver-contracts.mjs';

const qualified='scripts/docs-kubernetes-pv-selected-receiver-contracts.mjs';
const consumer='scripts/docs-api-product-scope.mjs';
const entry='scripts/check-config-authority.mjs';
const authority='scripts/docs-api-producer-adapter-authorities.json';
const pvSource=fs.readFileSync(new URL('../docs-kubernetes-pv-selected-receiver-contracts.mjs',import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const importOperation="import { receiverContracts as pvSelectedReceiverContracts } from './docs-kubernetes-pv-selected-receiver-contracts.mjs';";
function fixture(run) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'documentation-tool-qualification-'));
  const write=(source,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),bytes);};
  const read=source=>fs.readFileSync(path.join(root,source),'utf8');
  const registry=()=>JSON.parse(read(authority));
  const updateRegistry=change=>{const value=registry();change(value);write(authority,JSON.stringify(value));};
  const refreshDigest=()=>updateRegistry(value=>{value.documentationToolBoundary.qualifications[0].sha256=sha(read(qualified));});
  try {
    write(qualified,pvSource);
    write(consumer,`${importOperation}\nexport const selected=pvSelectedReceiverContracts;\n`);
    const edge="import {selected} from './docs-api-product-scope.mjs';";
    write(entry,`${edge}\nexport {selected};\n`);
    const scripts={'docs:inventory:config':`node ${entry}`,'verify:docs:pv':`node ${entry} --check`};
    write('package.json',JSON.stringify({scripts}));
    const record={kind:'static-receiver-descriptions/v1',source:qualified,sha256:sha(pvSource),namedExports:['receiverContracts'],
      operationRecipe:producerAdapterOperationRecipe(qualified,pvSource),
      graphEdges:[{source:consumer,target:qualified,kind:'import',operation:importOperation},{source:entry,target:consumer,kind:'import',operation:edge}],
      documentationEntries:Object.entries(scripts).map(([name,command])=>({name,command,source:entry})),dynamicGraphOperations:[],unresolvedModuleOperations:[]};
    write(authority,JSON.stringify({documentationToolBoundary:{sources:[qualified,consumer,entry],qualificationRequiredSources:[qualified],qualifications:[record]}}));
    run({root,write,read,registry,updateRegistry,refreshDigest,discover:()=>discoverScriptApiOutputs(root)});
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}

test('the exact PV receiver is excluded through reviewed documentation authority and check-prefix entrypoints',()=> {
  assert.equal(receiverContracts.length,7);
  assert.deepEqual(receiverContracts.map(record=>record.authoritySelector.fieldPath),['$','$.spec','$.spec.claimRef','$.spec.claimRef.name','$.spec.claimRef.namespace','$.spec.claimRef.uid','$.spec.persistentVolumeReclaimPolicy']);
  fixture(({discover})=>assert.deepEqual(discover(),[]));
});

test('missing qualification cannot silently retain a registered PV exemption',()=> {
  fixture(({discover,updateRegistry})=> {
    assert.deepEqual(discover(),[]);
    updateRegistry(value=>{value.documentationToolBoundary.qualifications=[];});
    assert.throws(discover,/DOCUMENTATION_TOOL_QUALIFICATION_MISSING/);
  });
});

test('PV source changes, API emission and unknown writers invalidate the frozen recipe even after digest refresh',()=> {
  for(const mutation of [
    source=>source.replace("kind: 'PersistentVolume', fieldPath","kind: 'ConfigMap', fieldPath"),
    source=>source+"\nconsole.log(JSON.stringify({apiVersion:'v1',kind:'ConfigMap',metadata:{name:'new'}}));\n",
    source=>source+'\nprocess.stdout.write(process.argv[2]);\n',
    source=>source.replace('export const receiverContracts','export const changedContracts'),
  ])fixture(({discover,write,refreshDigest})=> {
    assert.deepEqual(discover(),[]);
    write(qualified,mutation(pvSource));
    assert.throws(discover,/DOCUMENTATION_TOOL_QUALIFICATION_SOURCE_DRIFT/);
    refreshDigest();
    assert.throws(discover,/DOCUMENTATION_TOOL_QUALIFICATION_OPERATION_DRIFT/);
  });
});

test('changed documentation edge aliases, removed edges and renamed modules invalidate the reviewed graph',()=> {
  for(const change of [
    ({write,read})=>write(consumer,read(consumer).replaceAll('pvSelectedReceiverContracts','renamedSelector')),
    ({write})=>write(consumer,'export const selected=[];'),
    ({write,read})=>write(entry,read(entry).replace("'./docs-api-product-scope.mjs'","'./other.mjs'")),
  ])fixture(state=> {
    assert.deepEqual(state.discover(),[]);change(state);state.refreshDigest();
    assert.throws(state.discover,/DOCUMENTATION_TOOL_(?:QUALIFICATION_GRAPH_DRIFT|PUBLIC_CONSUMER_UNQUALIFIED|GRAPH_UNQUALIFIED)/);
  });
  fixture(({root,discover})=> {
    fs.renameSync(path.join(root,qualified),path.join(root,'scripts/renamed.mjs'));
    assert.throws(discover,/DOCUMENTATION_TOOL_QUALIFICATION_SOURCE_DRIFT/);
  });
});

test('direct, transitive, re-exported and require product consumers cannot use the qualified documentation source',()=> {
  for(const source of [
    `import {receiverContracts} from '../${qualified}';export {receiverContracts};`,
    `export * from '../${qualified}';`,
    `const load=require;load('../${qualified}');`,
    `import {createRequire} from 'node:module';const load=createRequire(import.meta.url);load('../${qualified}');`,
    `import {selected} from '../${consumer}';export {selected};`,
  ])fixture(({write,discover,refreshDigest})=> {
    assert.deepEqual(discover(),[]);
    write('tools/new-product.mjs',source);refreshDigest();
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  fixture(({write,discover,read})=> {
    const pkg=JSON.parse(read('package.json'));pkg.scripts['product:start']=`node ${consumer}`;write('package.json',JSON.stringify(pkg));
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
});

test('Node module loader capabilities and call/apply forwarding invalidate cached documentation qualification',()=> {
  const target=`'../${qualified}'`;
  for(const source of [
    `import * as module from 'node:module';const r=module.createRequire(import.meta.url);r(${target});`,
    "import module from 'node:module';const r=module.createRequire(import.meta.url);r(process.argv[2]);",
    "import * as module from 'node:module';const {createRequire:factory}=module;const r=factory(import.meta.url);r(process.env.MODULE_PATH);",
    `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);r.call(null,${target});`,
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);r.apply(null,[process.argv[2]]);",
    `import module from 'module';const alias=module;const factory=alias['createRequire'];const loader=factory(import.meta.url);loader.apply(null,[${target}]);`,
    `import module from 'node:module';const {createRequire}=module;const r=createRequire.call(null,import.meta.url);r['call'](null,${target});`,
    `const {createRequire:factory}=require('node:module');const r=factory(import.meta.url);const alias=r;alias(${target});`,
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);r.apply(null,process.argv.slice(2));",
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);r.apply(null,[...process.argv.slice(2)]);",
    `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);const bound=r.bind(null);bound(${target});`,
    `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);const bound=r.bind(null,${target});bound();`,
    `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);const invoke=r.call;invoke(r,null,${target});`,
    `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);const invoke=r.apply;invoke(r,null,[${target}]);`,
    `import * as module from 'node:module';const r=module.default.createRequire(import.meta.url);r(${target});`,
    `import * as module from 'node:module';const {['createRequire']:factory}=module;const r=factory(import.meta.url);r(${target});`,
    `import * as module from 'node:module';const {...namespace}=module;const r=namespace.createRequire(import.meta.url);r(${target});`,
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);r.apply();",
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);r.apply(null,[]);",
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);Reflect.apply(r,null,[process.argv[2]]);",
    `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);const invoke=Reflect.apply;invoke(r,null,[${target}]);`,
    `const module=await import('node:module');const r=module.createRequire(import.meta.url);r(${target});`,
    "const {createRequire}=await import('module');const r=createRequire(import.meta.url);r(process.env.MODULE_PATH);",
    "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);publishLoader(r);",
    `import module from 'node:module';const r=Reflect.apply(module.createRequire,module,[import.meta.url]);r(${target});`,
    `import {createRequire} from 'node:module';const invoke=createRequire.call;const r=invoke(createRequire,null,import.meta.url);r(${target});`,
    `import module from 'node:module';const copy=Object.assign({},module);const r=copy.createRequire(import.meta.url);r(${target});`,
  ])fixture(({discover,write,refreshDigest})=> {
    assert.deepEqual(discover(),[]);write('tools/new-loader.mjs',source);refreshDigest();
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:PUBLIC_CONSUMER_UNQUALIFIED|GRAPH_UNQUALIFIED)/);
  });
});

test('unsupported loader custody and builtin Promise continuations cannot disappear from the graph',()=> {
  const target=`'../${qualified}'`,prefix="import {createRequire} from 'node:module';const r=createRequire(import.meta.url);";
  for(const source of [
    prefix+`function expose(){return r;}expose()(${target});`,
    `import {createRequire} from 'node:module';function expose(){return createRequire;}expose()(import.meta.url)(${target});`,
    `import * as module from 'node:module';function expose(){return module;}expose().createRequire(import.meta.url)(${target});`,
    prefix+`const object={r};object.r(${target});`,
    prefix+`const object={load:r};object.load(${target});`,
    prefix+`const object={};object.load=r;object.load(${target});`,
    prefix+`const array=[r];array[0](${target});`,
    prefix+'export {r};',prefix+'export default r;',prefix+'export const load=r;',
    `import {createRequire} from 'node:module';const object={createRequire};object.createRequire(import.meta.url)(${target});`,
    `import * as module from 'node:module';const object={...module};object.createRequire(import.meta.url)(${target});`,
    prefix+`const load=process.argv[2]?r:r;load(${target});`,
    prefix+`const load=r||r;load(${target});`,
    `const object={load:require};object.load(${target});`,
    `function expose(){return require;}expose()(${target});`,
    `import('node:module').then(module=>module.createRequire(import.meta.url)(${target}));`,
    `const promise=import('module');promise.then(module=>module.createRequire(import.meta.url)(${target}));`,
    prefix+`let load;({load}={load:r});load(${target});`,
    "export {createRequire} from 'node:module';",
    "export * as module from 'module';",
    `import {Module as module} from 'node:module';const r=module.createRequire(import.meta.url);const object={r};object.r(${target});`,
  ])fixture(({discover,write,refreshDigest})=> {
    assert.deepEqual(discover(),[]);write('tools/escaped-loader.mjs',source);refreshDigest();
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  });
  fixture(({discover,write,refreshDigest})=> {
    assert.deepEqual(discover(),[]);
    write('tools/namespace-constructor.mjs',`import * as module from 'node:module';const {Module:constructor}=module;const r=constructor.createRequire(import.meta.url);r(${target});`);
    refreshDigest();assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
});

test('binding admission and awaited builtin Promise aliases preserve capability custody',()=> {
  for(const acquisition of ["import * as m from 'node:module';", "import m from 'module';", "const m=await import('node:module');", "const m=require('module');"])for(const destination of ["'../"+qualified+"'",'process.env.MODULE'])fixture(({discover,write})=> {
    assert.deepEqual(discover(),[]);
    write('tools/nested-binding.mjs',acquisition+`const {Module:{createRequire:load}}=m;load(import.meta.url)(${destination});`);
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*unsupported node-module custody/);
  });
  for(const transfer of ["const m=await p;", "const alias=p;const m=await alias;", "let alias;alias=p;const m=await alias;"])fixture(({discover,write})=> {
    assert.deepEqual(discover(),[]);
    write('tools/saved-promise.mjs',"const p=import('node:module');"+transfer+`m.createRequire(import.meta.url)('../${qualified}');`);
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  for(const acquisition of ["const m=require.apply(null,['node:module']);", "const m=require.call(null,'module');"])fixture(({discover,write})=> {
    assert.deepEqual(discover(),[]);
    write('tools/forwarded-builtin.mjs',acquisition+`m.createRequire(import.meta.url)('../${qualified}');`);
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  fixture(({discover,write})=> {
    assert.deepEqual(discover(),[]);
    write('tools/promise-binding.mjs',"const {then}=import('node:module');then(m=>m.createRequire(import.meta.url)(process.env.MODULE));");
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*unsupported node-module-promise custody/);
  });
  fixture(({discover,write})=> {
    assert.deepEqual(discover(),[]);
    write('tools/saved-promise-unknown.mjs',"const p=import('node:module');const alias=p;const m=await alias;m.createRequire(import.meta.url)(process.env.MODULE);");
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  });
});

test('refreshable unresolved-operation fingerprints cannot authorize a public dynamic consumer',()=> {
  fixture(({discover,write,updateRegistry})=> {
    assert.deepEqual(discover(),[]);
    const expression='import(process.env.MODULE)';write('tools/public.mjs',`await ${expression};`);
    updateRegistry(value=>value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations.push({source:'tools/public.mjs',expression,operationSha256:sha(expression),hints:[]}));
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*no reviewed semantic input authority/);
  });
});

test('reviewed finite module authority binds primary Source and selected input custody independently of fingerprints',()=> {
  const registry=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8'));
  const recipe=registry.documentationToolBoundary.unresolvedModuleInputAuthorities.find(record=>record.source==='scripts/check-ap08-effectful-guide.mjs');
  const source=fs.readFileSync(new URL('../check-ap08-effectful-guide.mjs',import.meta.url),'utf8');
  for(const mutation of ['source','recipe','selected-import','selected-symlink'])fixture(({root,write,discover,read,updateRegistry})=> {
    write(recipe.source,source);for(const target of recipe.inputConstraints.modulePaths)write(target,'export {};');
    updateRegistry(value=> {
      value.documentationToolBoundary.unresolvedModuleInputAuthorities=[recipe];
      value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations=recipe.operations.map(operation=>({...operation,source:recipe.source,hints:['..',operation.expression.match(/'([^']+)'/u)[1]]}));
    });
    assert.deepEqual(discover(),[]);
    if(mutation==='source') {
      write(recipe.source,source+'\nawait import(process.env.MODULE);');
      updateRegistry(value=>value.documentationToolBoundary.unresolvedModuleInputAuthorities[0].sourceSha256=sha(read(recipe.source)));
    } else if(mutation==='recipe') {
      updateRegistry(value=>value.documentationToolBoundary.unresolvedModuleInputAuthorities[0].inputConstraints.modulePaths.push(qualified));
    } else if(mutation==='selected-import') {
      write(recipe.inputConstraints.modulePaths[0],`import '${path.posix.relative(path.posix.dirname(recipe.inputConstraints.modulePaths[0]),qualified)}';`);
    } else {
      fs.unlinkSync(path.join(root,recipe.inputConstraints.modulePaths[0]));
      fs.symlinkSync(path.join(root,qualified),path.join(root,recipe.inputConstraints.modulePaths[0]));
    }
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
  });
});

test('finite selected module closure binds every local bridge and canonical dependency across cache hits',()=> {
  const registry=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8'));
  const source='scripts/docs-lint-policy-reference.mjs',recipe=registry.documentationToolBoundary.unresolvedModuleInputAuthorities.find(record=>record.source===source);
  for(const mode of ['import','reexport','await','unknown','nested-binding','saved-promise','bridge-cache','second-bridge-cache','symlink-cache','missing','escape'])fixture(({root,write,read,discover,updateRegistry})=> {
    write(source,fs.readFileSync(new URL('../../'+source,import.meta.url),'utf8'));
    for(const selected of recipe.inputConstraints.modulePaths)write(selected,'export default [];');
    const pkg=JSON.parse(read('package.json'));pkg.scripts['docs:finite']=`node ${source}`;write('package.json',JSON.stringify(pkg));
    updateRegistry(value=> {
      value.documentationToolBoundary.sources.push(source);
      value.documentationToolBoundary.unresolvedModuleInputAuthorities=[recipe];
      value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations=registry.documentationToolBoundary.qualifications[0].unresolvedModuleOperations.filter(operation=>operation.source===source);
    });
    assert.deepEqual(discover(),[]);
    const directory='charts/kubeclaw/files/config/',first=directory+'bridge.mjs',second=directory+'second.mjs';
    write(directory+'eslint.config.mjs',"import './bridge.mjs';export default [];");
    write(first,"export * from './second.mjs';");write(second,'export {};');
    assert.deepEqual(discover(),[]); // all later changes affect only a bridge
    const target=path.posix.relative(directory,qualified);
    if(mode==='symlink-cache') {
      write(directory+'replacement.mjs',`import '${target}';`);
      fs.unlinkSync(path.join(root,second));fs.symlinkSync(path.join(root,directory+'replacement.mjs'),path.join(root,second));
    } else if(mode==='escape') {
      fs.unlinkSync(path.join(root,second));fs.symlinkSync(process.execPath,path.join(root,second));
    } else if(mode==='missing')write(second,"import './absent.mjs';");
    else if(mode==='unknown')write(second,'await import(process.env.MODULE);');
    else if(mode==='nested-binding')write(second,"import * as m from 'node:module';const {Module:{createRequire:load}}=m;load(import.meta.url)(process.env.MODULE);");
    else if(mode==='saved-promise')write(second,`const p=import('node:module');const m=await p;m.createRequire(import.meta.url)('${target}');`);
    else if(mode==='bridge-cache')write(first,`import '${target}';`);
    else write(second,mode==='reexport'?`export * from '${target}';`:mode==='await'?`await import('${target}');`:`import '${target}';`);
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
  });
});

test('caller authority changes invalidate a cached recipe even when JSON authority digests are refreshed',()=> {
  const registry=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8'));
  const sources=['scripts/check-platform-specialist-guides.mjs','scripts/docs-lint-policy-reference.mjs'];
  const recipes=registry.documentationToolBoundary.unresolvedModuleInputAuthorities.filter(record=>sources.includes(record.source));
  const operations=registry.documentationToolBoundary.qualifications[0].unresolvedModuleOperations.filter(record=>sources.includes(record.source));
  fixture(({write,read,discover,updateRegistry})=> {
    for(const recipe of recipes) {
      write(recipe.source,fs.readFileSync(new URL('../../'+recipe.source,import.meta.url),'utf8'));
      for(const target of recipe.inputConstraints.modulePaths)write(target,'export {};');
    }
    const pkg=JSON.parse(read('package.json'));sources.forEach((source,index)=>{pkg.scripts[`docs:bounded:${index}`]=`node ${source}`;});write('package.json',JSON.stringify(pkg));
    updateRegistry(value=> {
      value.documentationToolBoundary.sources.push(...sources);
      value.documentationToolBoundary.unresolvedModuleInputAuthorities=recipes;
      value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations=operations;
    });
    assert.deepEqual(discover(),[]);
    write(sources[1],read(sources[1])+'\n// changed caller authority\n');
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*authority changed/);
    updateRegistry(value=> {
      for(const recipe of value.documentationToolBoundary.unresolvedModuleInputAuthorities) {
        if(recipe.source===sources[1])recipe.sourceSha256=sha(read(sources[1]));
        for(const input of recipe.authorityInputs)if(input.path===sources[1])input.sha256=sha(read(sources[1]));
      }
    });
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*no reviewed semantic input authority/);
  });
});

test('package aliases and public symlink exposure are part of consumer invalidation',()=> {
  fixture(({write,read,discover})=> {
    const pkg=JSON.parse(read('package.json'));pkg.imports={'#pv':`./${qualified}`};write('package.json',JSON.stringify(pkg));
    write('tools/new-product.mjs',"import {receiverContracts} from '#pv';export {receiverContracts};");
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  fixture(({write,read,discover})=> {
    const pkg=JSON.parse(read('package.json'));pkg.imports={'#pv':{import:`./${qualified}`}};write('package.json',JSON.stringify(pkg));
    write('tools/new-product.mjs',"import {receiverContracts} from '#pv';export {receiverContracts};");
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  });
  fixture(({root,discover})=> {
    fs.mkdirSync(path.join(root,'tools'));fs.symlinkSync('../'+qualified,path.join(root,'tools/public-pv.mjs'));
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  fixture(({root,discover})=> {
    assert.deepEqual(discover(),[]);
    fs.mkdirSync(path.join(root,'tools'));fs.symlinkSync('../scripts',path.join(root,'tools/public-docs'));
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  for(const publication of [{bin:{pv:'./'+qualified}},{exports:{'.':{import:'./'+consumer}}},{main:'./'+entry}])fixture(({read,write,discover})=> {
    assert.deepEqual(discover(),[]);write('package.json',JSON.stringify({...JSON.parse(read('package.json')),...publication}));
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
});

test('unresolved relevant dynamic imports and changed documentation loaders fail closed',()=> {
  for(const source of ["await import(process.env.MODULE_PATH);","import {createRequire} from 'node:module';const loader=createRequire(import.meta.url);loader(process.argv[2]);"])fixture(({write,discover,refreshDigest})=> {
    assert.deepEqual(discover(),[]);write('scripts/new-runtime.mjs',source);refreshDigest();
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  });
  fixture(({write,discover,refreshDigest})=> {
    write('scripts/new-product.mjs',"const variant=process.argv[2];await import('./docs-kubernetes-pv-selected-receiver-contracts'+variant);");refreshDigest();
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  });
  fixture(({write,read,discover})=> {
    write(consumer,read(consumer)+"\nawait import(process.argv[2]);\n");
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  });
  fixture(({write,discover})=> {
    write('tools/new-product.mjs',`const target='../${qualified}';await import(target);`);
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
});

test('documentation invocation names confer no exemption on new API producers or unknown publishers',()=> {
  fixture(({write,read,discover,updateRegistry,root})=> {
    write('scripts/docs-new-api.mjs',"const body={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'new'},immutable:true};console.log(JSON.stringify(body));");
    const pkg=JSON.parse(read('package.json'));pkg.scripts['docs:new-api']='node scripts/docs-new-api.mjs';write('package.json',JSON.stringify(pkg));
    const outputs=discover();assert(outputs.some(output=>output.value.kind==='ConfigMap'&&output.value.immutable===true));
    assert.throws(()=>assertProductApiContexts([],root),/API_PRODUCT_DISCOVERY_DRIFT/);
    // Even a legacy path registration grants no exclusion without docs reachability.
    write('tools/unreachable.mjs',"const body={apiVersion:'v1',kind:'Secret',metadata:{name:'unreachable'}};");
    updateRegistry(value=>value.documentationToolBoundary.sources.push('tools/unreachable.mjs'));
    assert(discover().some(output=>output.context.path==='tools/unreachable.mjs'));
  });
  fixture(({write,read,discover})=> {
    write('scripts/docs-unknown.mjs','process.stdout.write(process.argv[2]);');
    const pkg=JSON.parse(read('package.json'));pkg.scripts['verify:docs:unknown']='node scripts/docs-unknown.mjs';write('package.json',JSON.stringify(pkg));
    assert.throws(discover,/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/);
  });
});

test('generic conservative producer semantics remain intact outside the qualified graph',()=> {
  fixture(({write,discover})=> {
    write('tools/public.mjs',"export function build(){return {apiVersion:'v1',kind:'ConfigMap',metadata:{name:'root'},immutable:true}};const record={body:{apiVersion:'v1',kind:'Secret',metadata:{name:'nested'}}};console.log(JSON.stringify(record.body));");
    const outputs=discover();assert(outputs.some(output=>output.value.kind==='ConfigMap'&&output.value.immutable===true));assert(outputs.some(output=>output.value.kind==='Secret'));
  });
  fixture(({write,discover})=> {
    write('tools/public.mjs',"const body={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'mutation'},immutable:true};if(process.argv[2])body.immutable=false;console.log(JSON.stringify(body));");
    assert.throws(discover,/API_PRODUCT_SCRIPT_MUTATION_BRANCH_UNQUALIFIED/);
  });
});


test('node:module named admission is finite across actual and unknown exports before any transfer',()=> {
  const reviewed=new Set(['createRequire','Module','default','builtinModules','stripTypeScriptTypes','syncBuiltinESMExports']);
  for(const selected of [...Object.keys(nodeModule).filter(name=>!reviewed.has(name)),'futureUnreviewedLoader'])for(const specifier of ['module','node:module'])fixture(({discover,write,updateRegistry})=> {
    assert.deepEqual(discover(),[]);
    write('tools/named-admission.mjs',`import {${selected} as capability} from '${specifier}';const container={capability};`);
    // A refreshable operation inventory cannot expand builtin admission.
    updateRegistry(value=>value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations=[]);
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*unreviewed node:module named admission/);
  });
  for(const selected of ['_load','register','futureUnreviewedLoader'])fixture(({discover,write})=> {
    assert.deepEqual(discover(),[]);
    write('tools/binding-admission.mjs',`const m=await import('node:module');const {${selected}:capability}=m;const container={capability};`);
    assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED.*unsupported node-module custody/);
  });
  fixture(({discover,write,root})=> {
    const source="import {builtinModules as names,stripTypeScriptTypes as strip,syncBuiltinESMExports as sync} from 'node:module';import fs,{readFile} from 'node:fs';const denied=()=>{throw Error('denied');};fs.readFile=denied;const text=strip('const x: number = 1;');sync();export const verified=names.includes('fs') && text.includes('const x') && !text.includes(': number') && readFile===denied;";
    write('tools/reviewed-nonloaders.mjs',source);assert.deepEqual(discover(),[]);
    const runtime=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(pathToFileURL(path.join(root,'tools/reviewed-nonloaders.mjs')).href)});if(!m.verified)process.exit(1);`],{encoding:'utf8'});
    assert.equal(runtime.status,0,runtime.stderr);
  });
});

test('canonical finite seeds resolve actual siblings and bind alias retargeting without forbidding safe symlinks',()=> {
  const registry=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8'));
  const source='scripts/docs-lint-policy-reference.mjs',recipe=registry.documentationToolBoundary.unresolvedModuleInputAuthorities.find(record=>record.source===source);
  for(const mode of ['safe','decoy','canonical-mutation','retarget','cycle','shared-root','vendor-escape','repository-escape'])fixture(({root,write,read,discover,updateRegistry})=> {
    write(source,fs.readFileSync(new URL('../../'+source,import.meta.url),'utf8'));
    for(const selected of recipe.inputConstraints.modulePaths)write(selected,'export default [];');
    const pkg=JSON.parse(read('package.json'));pkg.scripts['docs:finite']=`node ${source}`;write('package.json',JSON.stringify(pkg));
    updateRegistry(value=> {
      value.documentationToolBoundary.sources.push(source);
      value.documentationToolBoundary.unresolvedModuleInputAuthorities=[recipe];
      value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations=registry.documentationToolBoundary.qualifications[0].unresolvedModuleOperations.filter(operation=>operation.source===source);
    });
    const selected='charts/kubeclaw/files/config/eslint.config.mjs';
    write('charts/actual/eslint.mjs',"export {receiverContracts} from './bridge.mjs';");
    write('charts/actual/bridge.mjs','export const receiverContracts=[];');
    write('charts/kubeclaw/files/config/bridge.mjs','export const receiverContracts=[];');
    fs.unlinkSync(path.join(root,selected));fs.symlinkSync('../../../actual/eslint.mjs',path.join(root,selected));
    assert.deepEqual(discover(),[]);assert.deepEqual(discover(),[]);
    const run=()=>spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(pathToFileURL(path.join(root,selected)).href)});console.log(m.receiverContracts.length);`],{encoding:'utf8'});
    const safe=run();assert.equal(safe.status,0,safe.stderr);assert.equal(safe.stdout.trim(),'0');
    if(mode==='safe')return;
    const exposure=`export {receiverContracts} from '../../${qualified}';`;
    if(mode==='retarget') {
      write('charts/replacement/eslint.mjs',"export {receiverContracts} from './bridge.mjs';");write('charts/replacement/bridge.mjs',exposure);
      fs.unlinkSync(path.join(root,selected));fs.symlinkSync('../../../replacement/eslint.mjs',path.join(root,selected));
    } else if(mode==='cycle') {
      write('charts/actual/bridge.mjs',"import './second.mjs';export {receiverContracts} from './second.mjs';");write('charts/actual/second.mjs',"import './bridge.mjs';"+exposure);
    } else if(mode==='shared-root') {
      write('charts/actual/bridge.mjs',"export {receiverContracts} from '../../tools/shared.mjs';");write('tools/shared.mjs',`export {receiverContracts} from '../${qualified}';`);
    } else if(mode==='vendor-escape'||mode==='repository-escape') {
      if(mode==='vendor-escape')write('vendor/eslint.mjs','export const receiverContracts=[];');
      fs.unlinkSync(path.join(root,selected));fs.symlinkSync(mode==='vendor-escape'?path.join(root,'vendor/eslint.mjs'):process.execPath,path.join(root,selected));
    } else write('charts/actual/bridge.mjs',exposure);
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
    if(!mode.endsWith('escape')){const actual=run();assert.equal(actual.status,0,actual.stderr);assert.equal(actual.stdout.trim(),'7');}
  });
});


function finiteModuleFixture(run) {
  const registry=JSON.parse(fs.readFileSync(new URL('../docs-api-producer-adapter-authorities.json',import.meta.url),'utf8'));
  const source='scripts/docs-lint-policy-reference.mjs',recipe=registry.documentationToolBoundary.unresolvedModuleInputAuthorities.find(record=>record.source===source);
  fixture(state=> {
    state.write(source,fs.readFileSync(new URL('../../'+source,import.meta.url),'utf8'));
    for(const selected of recipe.inputConstraints.modulePaths)state.write(selected,'export default [];');
    const pkg=JSON.parse(state.read('package.json'));pkg.scripts['docs:finite']=`node ${source}`;state.write('package.json',JSON.stringify(pkg));
    state.updateRegistry(value=> {
      value.documentationToolBoundary.sources.push(source);
      value.documentationToolBoundary.unresolvedModuleInputAuthorities=[recipe];
      value.documentationToolBoundary.qualifications[0].unresolvedModuleOperations=registry.documentationToolBoundary.qualifications[0].unresolvedModuleOperations.filter(operation=>operation.source===source);
    });
    assert.deepEqual(state.discover(),[]);run(state);
  });
}

const finiteSelected='charts/kubeclaw/files/config/eslint.config.mjs';
const moduleWitness=(root,selected)=>spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(pathToFileURL(path.join(root,selected)).href)});console.log((m.receiverContracts??m.default.receiverContracts).length);`],{encoding:'utf8'});

test('every supported JS and TS executable class keeps canonical seed, closure and cache custody',()=> {
  for(const extension of ['mjs','cjs','js','ts','mts','cts'])for(const placement of ['bridge','canonical-seed'])finiteModuleFixture(({root,write,discover})=> {
    const common=['cjs','cts'].includes(extension),directory=placement==='bridge'?'charts/kubeclaw/files/config/':'charts/actual/',target=directory+'bridge.'+extension;
    const relative=path.posix.relative(directory,qualified);
    const safe=common?'module.exports={receiverContracts:[]};':'export const receiverContracts=[];';
    write(target,safe);
    if(placement==='canonical-seed'){fs.unlinkSync(path.join(root,finiteSelected));fs.symlinkSync(path.join(root,target),path.join(root,finiteSelected));}
    else write(finiteSelected,common?`import bridge from './bridge.${extension}';export const receiverContracts=bridge.receiverContracts;`:`export {receiverContracts} from './bridge.${extension}';`);
    assert.deepEqual(discover(),[]);assert.deepEqual(discover(),[]);
    const baseline=moduleWitness(root,finiteSelected);assert.equal(baseline.status,0,baseline.stderr);assert.equal(baseline.stdout.trim(),'0');
    write(target,common?`module.exports=require('${relative}');`:`export {receiverContracts} from '${relative}';`);
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
    const runtime=moduleWitness(root,finiteSelected);assert.equal(runtime.status,0,runtime.stderr);assert.equal(runtime.stdout.trim(),'7');
  });
});

test('CommonJS fallback inputs are scanned at first transfer and changed bridge-only success cannot survive',()=> {
  for(const filename of ['bridge.txt','bridge.yaml','bridge','.json'])finiteModuleFixture(({root,write,discover})=> {
    const directory='charts/kubeclaw/files/config/';
    write(finiteSelected,"import bridge from './gateway.cjs';export const receiverContracts=bridge.receiverContracts;");
    write(directory+'gateway.cjs',`module.exports=require('./${filename}');`);write(directory+filename,'module.exports={receiverContracts:[]};');
    assert.deepEqual(discover(),[]);assert.deepEqual(discover(),[]);
    const baseline=moduleWitness(root,finiteSelected);assert.equal(baseline.status,0,baseline.stderr);assert.equal(baseline.stdout.trim(),'0');
    write(directory+filename,`module.exports=require('../../../../${qualified}');`);
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
    const runtime=moduleWitness(root,finiteSelected);assert.equal(runtime.status,0,runtime.stderr);assert.equal(runtime.stdout.trim(),'7');
  });
  for(const filename of ['public.txt','public','public.yaml'])fixture(({write,read,discover})=> {
    const source='tools/'+filename,pkg=JSON.parse(read('package.json'));pkg.scripts['run:consumer']='node -- ./tools/../'+source;write('package.json',JSON.stringify(pkg));
    write(source,'module.exports={};');assert.deepEqual(discover(),[]);
    write(source,`module.exports=require('../${qualified}');`);
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
  for(const extension of ['mts','cts'])fixture(({write,discover})=> {
    write('tools/public.'+extension,extension==='mts'?`export {receiverContracts} from '../${qualified}';`:`module.exports=require('../${qualified}');`);
    assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
  });
});

test('passive JSON follows canonical loader semantics and native or unsupported transfers fail intrinsically',()=> {
  for(const mode of ['ordinary','canonical-json','apparent-json','retarget','invalid-json','esm-unknown','native'])finiteModuleFixture(({root,write,discover})=> {
    const directory='charts/kubeclaw/files/config/';
    write(finiteSelected,"import bridge from './gateway.cjs';export const receiverContracts=bridge.receiverContracts;");
    write(directory+'gateway.cjs',"module.exports=require('./data.json');");
    write(directory+'data.json',JSON.stringify({receiverContracts:[],code:`require('../../../../${qualified}')`}));
    assert.deepEqual(discover(),[]);assert.equal(moduleWitness(root,finiteSelected).stdout.trim(),'0');
    if(mode==='ordinary')return;
    if(mode==='canonical-json') {
      write(directory+'gateway.cjs',"module.exports=require('./apparent.txt');");fs.symlinkSync('data.json',path.join(root,directory+'apparent.txt'));
      assert.deepEqual(discover(),[]);assert.equal(moduleWitness(root,finiteSelected).stdout.trim(),'0');return;
    }
    if(mode==='apparent-json'||mode==='retarget') {
      write(directory+'executable.cjs',`module.exports=require('../../../../${qualified}');`);
      fs.unlinkSync(path.join(root,directory+'data.json'));fs.symlinkSync('executable.cjs',path.join(root,directory+'data.json'));
    } else if(mode==='invalid-json')write(directory+'data.json',`module.exports=require('../../../../${qualified}');`);
    else if(mode==='esm-unknown'){write(finiteSelected,"export * from './unknown.yaml';");write(directory+'unknown.yaml','export const safe=1;');}
    else {write(directory+'gateway.cjs',"module.exports=require('./addon.node');");write(directory+'addon.node','not an addon');}
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
    if(mode==='apparent-json'||mode==='retarget'){const runtime=moduleWitness(root,finiteSelected);assert.equal(runtime.status,0,runtime.stderr);assert.equal(runtime.stdout.trim(),'7');}
  });
});

test('new executable formats retain public output discovery and unknown publication checks',()=> {
  for(const extension of ['mts','cts'])fixture(({write,discover})=> {
    write('tools/public.'+extension,"const body={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'new-class'},immutable:true};console.log(JSON.stringify(body));");
    assert(discover().some(output=>output.context.path==='tools/public.'+extension&&output.value.kind==='ConfigMap'));
    write('tools/public.'+extension,'process.stdout.write(process.argv[2]);');
    assert.throws(discover,/API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED/);
  });
});


test('synthetic native tests bind their actual Source and caller and cannot acquire product reachability',()=> {
  const corpus='skills/prism/integration/corpus-pool.mts',capture='skills/prism/integration/engine-capture-retention.mts';
  for(const mode of ['baseline','source','caller','contract','missing','public-import','public-transitive','public-symlink','package-invocation','package-normalized-invocation','package-export','new-unreviewed-test'])fixture(({root,write,read,discover})=> {
    for(const source of [corpus,capture,'skills/prism/package.json','scripts/docs-runtime-consumer-contracts.mjs'])write(source,fs.readFileSync(new URL('../../'+source,import.meta.url),'utf8'));
    assert.deepEqual(discover(),[]);
    if(mode==='baseline')return;
    if(mode==='source')write(corpus,read(corpus)+"\nawait import(process.env.NEW_MODULE);\n");
    else if(mode==='caller')write('skills/prism/package.json',read('skills/prism/package.json')+'\n');
    else if(mode==='contract')write('scripts/docs-runtime-consumer-contracts.mjs',read('scripts/docs-runtime-consumer-contracts.mjs')+'\n');
    else if(mode==='missing')fs.unlinkSync(path.join(root,corpus));
    else if(mode==='public-import')write('tools/public.mts',`import '../${corpus}';`);
    else if(mode==='public-transitive'){write('tools/gateway.cts',"require('../charts/actual/public.txt');");write('charts/actual/public.txt',`require('../../${corpus}');`);}
    else if(mode==='public-symlink'){fs.mkdirSync(path.join(root,'tools'),{recursive:true});fs.symlinkSync(path.join(root,corpus),path.join(root,'tools/public.mts'));}
    else if(mode==='new-unreviewed-test')write('skills/prism/integration/new-test.mts','await import(process.env.NEW_MODULE);');
    else {const pkg=JSON.parse(read('package.json'));if(mode==='package-invocation')pkg.scripts['test:unreviewed']='node '+corpus;else if(mode==='package-normalized-invocation')pkg.scripts['run:public']='node -- ./skills/prism/../prism/integration/corpus-pool.mts';else pkg.exports='./'+corpus;write('package.json',JSON.stringify(pkg));}
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
  });
});

test('a transferred CommonJS fallback producer is discovered without treating arbitrary data files as executables',()=> {
  fixture(({write,discover})=> {
    write('tools/gateway.cjs',"require('./publisher.txt');");
    write('tools/publisher.txt',"const body={apiVersion:'v1',kind:'ConfigMap',metadata:{name:'transferred-class'}};console.log(JSON.stringify(body));");
    assert(discover().some(output=>output.context.path==='tools/publisher.txt'&&output.value.kind==='ConfigMap'));
  });
  fixture(({write,discover})=> {
    write('tools/data.txt','This file is ordinary repository data, not a transferred Node module.');assert.deepEqual(discover(),[]);
  });
});


test('new executable classes share cycle, root, canonical-retarget and containment admission',()=> {
  for(const mode of ['mts-cycle','cts-shared','unknown-cycle','seed-retarget','vendor','repository'])finiteModuleFixture(({root,write,discover})=> {
    write('charts/actual/seed.mts',"export {receiverContracts} from './bridge.mts';");write('charts/actual/bridge.mts','export const receiverContracts=[];');
    fs.unlinkSync(path.join(root,finiteSelected));fs.symlinkSync(path.join(root,'charts/actual/seed.mts'),path.join(root,finiteSelected));
    assert.deepEqual(discover(),[]);assert.deepEqual(discover(),[]);
    if(mode==='mts-cycle') {
      write('charts/actual/bridge.mts',"import './second.mts';export {receiverContracts} from './second.mts';");write('charts/actual/second.mts',`import './bridge.mts';export {receiverContracts} from '../../${qualified}';`);
    } else if(mode==='cts-shared') {
      write('charts/actual/bridge.mts',"import shared from '../../tools/shared.cts';export const receiverContracts=shared.receiverContracts;");write('tools/shared.cts',`module.exports=require('../${qualified}');`);
    } else if(mode==='unknown-cycle') {
      write('charts/actual/bridge.mts',"import shared from './gateway.cjs';export const receiverContracts=shared.receiverContracts;");write('charts/actual/gateway.cjs',"module.exports=require('./a.txt');");write('charts/actual/a.txt',"require('./b.yaml');module.exports=require('./b.yaml');");write('charts/actual/b.yaml',`require('./a.txt');module.exports=require('../../${qualified}');`);
    } else if(mode==='seed-retarget') {
      write('charts/actual/replacement.cts',`module.exports=require('../../${qualified}');`);fs.unlinkSync(path.join(root,finiteSelected));fs.symlinkSync(path.join(root,'charts/actual/replacement.cts'),path.join(root,finiteSelected));
    } else {
      if(mode==='vendor')write('vendor/seed.mts','export const receiverContracts=[];');
      fs.unlinkSync(path.join(root,finiteSelected));fs.symlinkSync(mode==='vendor'?path.join(root,'vendor/seed.mts'):process.execPath,path.join(root,finiteSelected));
    }
    assert.throws(discover,/DOCUMENTATION_TOOL_(?:GRAPH_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED)/);
    if(mode==='mts-cycle'||mode==='cts-shared'||mode==='seed-retarget'){const runtime=moduleWitness(root,finiteSelected);assert.equal(runtime.status,0,runtime.stderr);assert.equal(runtime.stdout.trim(),'7');}
  });
});
