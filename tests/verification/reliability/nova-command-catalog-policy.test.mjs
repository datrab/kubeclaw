import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy,loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {activate} from '../../../skills/common/plugins/command-runner/src/adapter.ts';
const id='kubeclaw.command-runner:command', executable=fs.realpathSync(process.execPath);
const raw={allowedExecutables:[executable],allowedWorkingRoots:[os.tmpdir()],maxOutputBytes:4096,maxExecutionMs:3000,terminationGraceMs:25};
test('selected catalog capacity reaches actual admission and invocation; capture survives author removal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'command-catalog-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'core.json');
 const publish=n=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,commandCatalog:{maximumEntries:n}}}}}));
 const select=()=>loadCoreRuntimePolicy({file,profile:'selected'});
 const config=(policy,catalog)=>selectedAdapterConfigurations({[id]:{...raw,executableCatalog:catalog}},policy)[id];
 publish(1);const a=select();publish(2);const b=select();
 const catalog={first:executable,second:executable};
 assert.throws(()=>activate({config:config(a,catalog)}),/executableCatalog is invalid/);
 const adapter=activate({config:config(b,catalog)});t.after(()=>adapter.shutdown());
 const invoke=instance=>instance.invoke({confidential:true,signal:new AbortController().signal,request:{capability:'command.execute',operation:'run',resource:{type:'command.executable',canonicalId:'catalog:second'},payload:{workingDirectory:os.tmpdir(),args:['-e','process.stdout.write("selected")']}}});
 assert.equal((await invoke(adapter)).stdout,'selected');
 fs.unlinkSync(file);assert.throws(select,/ENOENT/);
 assert.throws(()=>activate({config:config(a,catalog)}),/executableCatalog is invalid/);
 const restored=activate({config:config(b,catalog)});t.after(()=>restored.shutdown());assert.equal((await invoke(restored)).stdout,'selected');
 assert.equal(a.commandCatalog.maximumEntries,1);assert(Object.isFrozen(a.commandCatalog));
});
test('catalog settings have one required bounded author without expanding executable identity rules',()=>{
 const config=selectedAdapterConfigurations({[id]:raw},TEST_CORE_POLICY)[id];assert.equal(config.maximumCatalogEntries,128);
 for(const value of [undefined,null,0,-1,1.5,'2',129]){
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandCatalog:{maximumEntries:value}}),/INVALID/);
  assert.throws(()=>activate({config:{...config,maximumCatalogEntries:value}}),/maximumCatalogEntries/);
 }
 assert.throws(()=>selectedAdapterConfigurations({[id]:{...raw,maximumCatalogEntries:128}},TEST_CORE_POLICY),/COMMAND_CATALOG_POLICY_COMPETING_AUTHOR/);
 assert.throws(()=>activate({config:{...config,executableCatalog:{'bad name':executable}}}),/executableCatalog is invalid/);
});
