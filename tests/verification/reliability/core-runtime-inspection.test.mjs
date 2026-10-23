import { loadCoreRuntimePolicy } from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import { TEST_CORE_POLICY_SELECTION } from '../../fixtures/core-runtime-policy.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {discoverRuntimeRegistry, inspectRuntimeConfiguration, prepareRuntime} from '../../../skills/nova/core/execution/engine-runtime.ts';

// Local registry fixtures exercise the existing discovery/schema/grant path.
// They are not installed production identities or original-run authority.
function fixture(t, moduleSource) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'core-runtime-inspection-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const plugins=path.join(root,'plugins'), plugin=path.join(plugins,'probe');
  fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
  fs.writeFileSync(path.join(plugin,'package.json'),JSON.stringify({type:'module'}));
  fs.writeFileSync(path.join(plugin,'entry.mjs'),moduleSource);
  const schema={type:'object',additionalProperties:false,required:['selected'],properties:{selected:{type:'string',enum:['A']}}};
  fs.writeFileSync(path.join(plugin,'schemas/config.json'),JSON.stringify(schema));
  fs.writeFileSync(path.join(plugin,'schemas/input.json'),JSON.stringify({type:'object',additionalProperties:false}));
  fs.writeFileSync(path.join(plugin,'schemas/result.json'),JSON.stringify({$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}));
  fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.core-inspection',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',
    stages:[{id:'probe',type:'test.core-inspection',module:'entry.mjs',export:'execute',requiredCapabilities:[],configSchema:'schemas/config.json',
      inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}],observers:[],adapters:[]}));
  const platform={corePolicySelection: TEST_CORE_POLICY_SELECTION,schemaVersion:'pipeline-platform.v2',effectLockTtlMs:300000,installationRoots:[plugins],trustedBuiltinRoots:[plugins],
    externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{},grants:{},adapters:{},activeAdapters:[],observers:{},
    storageRoot:path.join(root,'uncreated-state'),shutdownTimeoutMs:1000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
  const definition={schemaVersion:'pipeline-definition.v2',id:'inspection',maxConcurrency:1,stages:[{id:'probe',type:'test.core-inspection',
    dependsOn:[],config:{selected:'A'},input:{},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:1000}}]};
  return {root,platform,definition};
}

test('original registry inspection validates configuration without executing selected plugin code or creating run storage',async t=>{
  const f=fixture(t,`throw new Error('CORE_INSPECTION_ACTIVATION_SENTINEL');
    export function execute(){return {schemaVersion:'stage-result.v2',outcome:'passed'}}`);
  const before=structuredClone({platform:f.platform,definition:f.definition});
  const inspected=inspectRuntimeConfiguration(f.platform,f.definition);
  assert.equal(inspected.snapshot.stages.has('test.core-inspection'),true);
  assert.equal(Object.hasOwn(inspected,'activated'),false);
  assert.equal(fs.existsSync(f.platform.storageRoot),false);
  assert.deepEqual({platform:f.platform,definition:f.definition},before);
  // Same real installed module is reached by the original activation path.
  await assert.rejects(prepareRuntime(f.platform,f.definition),error=>error.code==='REGISTRY_IMPORT_SIDE_EFFECT'
    && error.details.cause.includes('CORE_INSPECTION_ACTIVATION_SENTINEL'));
  assert.equal(fs.existsSync(f.platform.storageRoot),false);
});

test('schema and owner negatives reject before activation; restored selected settings inspect successfully',t=>{
  const f=fixture(t,`throw new Error('MUST_NOT_IMPORT'); export function execute(){}`);
  for(const config of [{},{selected:'B'},{selected:'A',extra:true}]) {
    const changed=structuredClone(f.definition);changed.stages[0].config=config;
    assert.throws(()=>inspectRuntimeConfiguration(f.platform,changed),/schema/i);
  }
  const missing=structuredClone(f.definition);missing.stages[0].type='test.missing-owner';
  assert.throws(()=>inspectRuntimeConfiguration(f.platform,missing),/PIPELINE_STAGE_OWNER_MISSING/);
  assert.equal(inspectRuntimeConfiguration(f.platform,f.definition).granted.enabledRegistrations.has('test.core-inspection:probe'),true);
  assert.equal(fs.existsSync(f.platform.storageRoot),false);
});

test('prepareRuntime still returns activated registrations and persists selected core policy with the original registry projection',async t=>{
  const f=fixture(t,`export function execute(){return {schemaVersion:'stage-result.v2',outcome:'passed'}}`);
  const inspected=inspectRuntimeConfiguration(f.platform,f.definition), prepared=await prepareRuntime(f.platform,f.definition);
  assert.deepEqual(prepared.configuration,inspected.configuration);
  assert.deepEqual(prepared.configuration,{corePolicy:loadCoreRuntimePolicy(TEST_CORE_POLICY_SELECTION),providers:{},grants:{},adapters:{},activeAdapters:[],observers:{}});
  assert.deepEqual([...prepared.snapshot.packages.keys()],[...inspected.snapshot.packages.keys()]);
  assert.deepEqual([...prepared.granted.enabledRegistrations],[...inspected.granted.enabledRegistrations]);
  assert.deepEqual(await prepared.activated.stages.get('test.core-inspection').execute(),{schemaVersion:'stage-result.v2',outcome:'passed'});
  assert.equal(fs.existsSync(f.platform.storageRoot),false);
});

// Pre-graph acquisition must not depend on current Core settings, a fabricated
// graph, granted capabilities, run storage or executable plugin imports.
test('installed registry is acquired before a graph or Core policy exists, preserving trust rejection',t=>{
  const f=fixture(t,`throw new Error('PRE_GRAPH_ACTIVATION_SENTINEL'); export function execute(){}`);
  const input={installationRoots:f.platform.installationRoots,trustedBuiltinRoots:f.platform.trustedBuiltinRoots,
    externalTrust:f.platform.externalTrust};
  const before=structuredClone(input);
  const snapshot=discoverRuntimeRegistry(input);
  assert.equal(snapshot.stages.has('test.core-inspection'),true);
  assert.equal(snapshot.packages.has('test.core-inspection'),true);
  assert.deepEqual(input,before);
  assert.equal(fs.existsSync(f.platform.storageRoot),false);
  assert.throws(()=>discoverRuntimeRegistry({...input,trustedBuiltinRoots:[]}),error=>error.code==='REGISTRY_PACKAGE_UNTRUSTED');
  assert.throws(()=>discoverRuntimeRegistry({...input,installationRoots:[path.join(f.root,'missing')]}),error=>error.code==='REGISTRY_ROOT_INVALID');
});

// The retained original graph is available before any current runtime policy or
// installed package is needed. Both continuation entries must reject drift there.
for (const version of ['execution-graph-snapshot.v2', 'execution-graph-snapshot.v3']) {
  test(`original graph mismatch rejects before runtime restoration or activation: ${version}`, async t => {
    const {graphSnapshot, writeRunSnapshots} = await import('../../../skills/nova/core/execution/engine-snapshots.ts');
    const {recoverPipeline, resumePipeline} = await import('../../../skills/nova/core/execution/engine-run.ts');
    const {runRoot} = await import('../../../skills/nova/core/execution/run-root.ts');
    const f = fixture(t, `throw new Error('RECOVERY_MUST_NOT_ACTIVATE'); export function execute(){}`);
    const directory = runRoot(f.platform.storageRoot, 'original:A');
    fs.mkdirSync(directory, {recursive:true});
    // Intentionally no retained policy: a foreign graph must not reach even
    // policy restoration, much less current registry discovery or activation.
    writeRunSnapshots(directory, graphSnapshot(f.definition, version), {});
    const snapshot = fs.readFileSync(path.join(directory, 'run-snapshot.json'));
    const changed = structuredClone(f.definition);
    changed.stages[0].config.selected = 'B';
    const before = structuredClone({platform:f.platform, definition:changed});
    await assert.rejects(recoverPipeline(f.platform, changed, 'original:A'), /RECOVERY_GRAPH_DIGEST_MISMATCH/);
    await assert.rejects(resumePipeline(f.platform, changed, 'original:A', {}), /RECOVERY_GRAPH_DIGEST_MISMATCH/);
    assert.deepEqual({platform:f.platform, definition:changed}, before);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'run-snapshot.json')), snapshot);
    assert.deepEqual(fs.readdirSync(directory), ['run-snapshot.json']);
  });
}
