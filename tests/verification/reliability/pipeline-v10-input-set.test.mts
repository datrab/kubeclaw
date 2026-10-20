import { preparationEnvelope, preparationProfile, preparationOperationSettings } from '../../../skills/buster/engine/test-gates/preparation-envelope.ts';
import { validateBusterClusterInvokerSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';
import { inspectPipelineV10BusterServiceSelection, inspectPipelineV10BusterRuntimeSourceIdentity } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-receiver.ts';
import { resolveTestPlan } from '../../../skills/nova/core/test-gates/resolver.ts';
import { validatePipelineTestGateContract } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { QUALITY_TASK_SCHEMA_DIGEST, remotePlanDigest } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { inspectPipelineV10QualityRegistryConfiguration, inspectPipelineV10QualityServiceSelection } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-receiver.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { composePipelineV10InputSet as compose, capturePipelineV10DeclaredInputSet as capture } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-input-set.ts';
import { inspectPipelineV10Receiver, inspectPipelineV10NovaSourceIdentity, inspectPipelineV10NovaRegistryIdentity, inspectPipelineV10SelectedSourceIdentity, inspectPipelineV10InfrastructureSourceIdentity, inspectPipelineV10NetworkAdapterSourceIdentity, inspectPipelineV10CoreSourceIdentity, inspectPipelineV10CoreSourceClosure } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-receiver.ts';
import {buildRegistry} from '../../../skills/common/plugin-runtime/foundation/registry/build.ts';
import {discoverPackages} from '../../../skills/common/plugin-runtime/foundation/registry/discovery.ts';
import { inspectCapturedCoreProjectCandidate } from '../../../skills/nova/project/core-project-candidate.ts';
import { compileProject, compileProjectWithCompilerPolicyCandidate, moduleStagesWithCompilerPolicy, type ModuleContext } from '../../../skills/nova/project/compiler.ts';
import { resolveProjectCompilerPolicy } from '../../../skills/nova/project/compiler-policy.ts';
import { cumulativeStages, cumulativeStagesWithExecutionGroups } from '../../../skills/nova/project/coverage.ts';
import { demoStages, demoStagesWithExecutionGroups } from '../../../skills/nova/project/demo.ts';
import { resolvedTestPlanDigest, stableTestIdentity } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { sourceStages, sourceStagesWithExecutionGroups } from '../../../skills/nova/project/source.ts';
import { resolveCompilerExecutionGroups } from '../../../skills/nova/project/execution-group-policy.ts';
import { loadPlatformConfig, resolvePlatformConfigValue } from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import { hashPipelineInputSet, capturePipelineInputSet } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-input-set.ts';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const base = path.join(repository,'docs/review/evidence/config-acceptance/c0-completion-20261013');
const read = (p: string) => JSON.parse(fs.readFileSync(p,'utf8'));
const contract = read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-input-contract.json'));
const approved = read(path.join(base,'PACKAGE-GENERATION-CONTRACT.json'));
function patched(original: any, operations: any[]) {
  const result = structuredClone(original);
  for (const op of operations) {
    const parts = op.path.split('/').slice(1), key = parts.pop()!;
    const parent = parts.reduce((v: any,k: string) => v[k], result);
    if (op.op === 'test') assert.deepEqual(parent[key],op.value);
    else if (Array.isArray(parent) && key === '-') parent.push(structuredClone(op.value));
    else parent[key] = structuredClone(op.value);
  }
  return Buffer.from(JSON.stringify(result,null,2)+'\n');
}
const rootBytes = patched(read(path.join(repository,approved.baseRoot.path)),approved.rootPatch);
const schemaBytes = patched(read(path.join(repository,approved.baseRootSchema.path)),approved.rootSchemaPatch);
const row = (relativePath: string, bytes: Buffer) => ({relativePath,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const replacements = [row('config/pipeline.config.json',rootBytes),row('schemas/pipeline-entry.schema.json',schemaBytes)];
function tree(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'v10-whole-input-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write = (relative: string, bytes: Buffer) => { const p=path.join(root,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes); };
  for (const m of contract.base.members) write(m.relativePath,fs.readFileSync(path.join(base,'same-entry-agent-role-binding-01',m.relativePath.startsWith('schemas/')?'':'stand',m.relativePath)));
  // Historical capture must use the declared historical bytes, not later WIP.
  // Neither these public fixtures nor matching hashes grant activation authority.
  for (const m of [...contract.additions,...contract.packageSources]) {
    const retained = path.join(repository,'tests/verification/reliability/fixtures/pipeline-v10-retained',m.sha256+'.fixture');
    const bytes = fs.readFileSync(fs.existsSync(retained) ? retained : path.join(repository,m.sourcePath));
    assert.equal(bytes.length,m.byteLength,`historical fixture size: ${m.sourcePath}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256,`historical fixture identity: ${m.sourcePath}`);
    write(m.relativePath,bytes);
  }
  write(replacements[0]!.relativePath,rootBytes);write(replacements[1]!.relativePath,schemaBytes);
  return root;
}
test('complete declared composition conserves all376 inherited identities and explicit before/after records', () => {
  const c=compose(replacements), original=read(path.join(base,'same-entry-agent-role-binding-01/file-set-stand.json'));
  assert.equal(contract.packageContractSha256,createHash('sha256').update(fs.readFileSync(path.join(base,'PACKAGE-GENERATION-CONTRACT.json'))).digest('hex'));
  assert.equal(hashPipelineInputSet(contract.base.members),original.inputGenerationSha256);
  const changed=new Map(c.replacements.map(x=>[x.before.relativePath,x]));
  for(const m of original.inputMembers) {
    const current=c.members.find(x=>x.relativePath===m.relativePath);assert.ok(current);
    const prior=changed.get(m.relativePath)?.before??current;
    assert.deepEqual(prior,{relativePath:m.relativePath,byteLength:m.byteLength,sha256:m.sha256});
  }
  assert.equal(c.members.length,376+c.additions.length);assert.equal(c.activationAllowed,false);
  assert.equal(c.inputGenerationSha256,hashPipelineInputSet(c.members));
  assert.equal(Object.isFrozen(c.members),true);
});
test('root/schema descriptors are explicit, exact, nonduplicate and never mixed with legacy root names', () => {
  assert.throws(()=>compose([replacements[0]!]),/ROOT_SET/);
  assert.throws(()=>compose([replacements[0]!,replacements[0]!]),/MEMBER_INVALID/);
  assert.throws(()=>compose([replacements[0]!,{...replacements[1]!,relativePath:'config/swarm.config.json'}]),/ROOT_SET/);
  assert.throws(()=>compose([{...replacements[0]!,relativePath:'../root'},replacements[1]!]),/MEMBER_INVALID/);
});
test('actual full declared physical capture retains all raw files, no v4 receipt or authorization returned', t => {
  const root=tree(t),result=capture(root,replacements);t.after(result.capture.close);
  assert.equal(result.activationAllowed,false);assert.equal(result.capture.inputGenerationSha256,result.composition.inputGenerationSha256);
  assert.ok(result.composition.members.length>376);result.capture.assertCurrent();
  // Public output candidate proves only same retained input linkage, not source/issuer/native authorization.
  const candidate=read(path.join(base,'same-entry-agent-role-binding-01/outputs/nova/kubeclaw.runtime-dispatch-openclaw.json'));
  candidate.binding.rootVersion='pipeline-entry.v10';candidate.binding.rootRawSha256=createHash('sha256').update(rootBytes).digest('hex');
  candidate.binding.inputGenerationSha256=result.capture.inputGenerationSha256;
  const inspected=inspectPipelineV10Receiver('nova',Buffer.from(JSON.stringify(candidate)),result.capture);
  assert.equal(inspected.activationAllowed,false);assert.equal(inspected.inputGenerationSha256,result.composition.inputGenerationSha256);
  const raw=result.capture.read('config/pipeline.config.json');assert.deepEqual(raw,rootBytes);
  raw.fill(0);assert.deepEqual(result.capture.read('config/pipeline.config.json'),rootBytes);
  const file=path.join(root,'schemas/pipeline-entry.schema.json'),before=fs.readFileSync(file);
  fs.appendFileSync(file,' ');assert.throws(result.capture.assertCurrent,/INPUT_CHANGED/);result.capture.close();fs.writeFileSync(file,before);
  const restored=capture(root,replacements);restored.capture.assertCurrent();restored.capture.close();
});
test('missing inherited unselected schema never becomes partial seven-file or source-only capture', t => {
  const root=tree(t),file=path.join(root,'schemas/browser/axe.task.schema.json');fs.unlinkSync(file);
  assert.throws(()=>capture(root,replacements),{code:'ENOENT'});
});

test('EXISTING real role materializer enumerates all v10 inputs before source denial and emits no legacy outputs', async t => {
  const { execFileSync } = await import('node:child_process');
  const { materializePipelineGeneration } = await import('../../../scripts/updates/pipeline-generation.mjs');
  const root=tree(t), code=path.join(root,'role'), output=path.join(root,'must-not-publish');
  execFileSync(process.execPath,[path.join(repository,'scripts/build-runtime-role-bundle.mjs'),'buster',code,
    'a'.repeat(40),'config-v10-materializer-input-test','2026-10-15T00:00:00Z'],{cwd:repository,stdio:'pipe'});
  const document=JSON.parse(rootBytes.toString()), binding=document.bindings.find((b: any)=>b.owner==='buster-engine' && b.instanceId==='fixture.service.buster-runtime');
  const service={role:'buster',callerId:'buster-preparation',serviceInstanceId:binding.instanceId,
    bindings:document.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === binding.instanceId).map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId }))};
  const child = { ...service, callerId: 'buster-runtime', bindings: document.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === binding.instanceId).map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) };
  const complete = [service, child];
  const run=(services: any[] = complete)=>materializePipelineGeneration({authorRoot:path.join(root,'config'),packageRoot:code,output,services,publisher:path.join(root,'NONEXISTENT-MUST-NOT-EXECUTE')});
  for (const services of [[service], [child], [service, child, child], [service, { ...child, role: 'prism' }],
    [service, { ...child, callerId: 'unknown-caller' }], [null, child]]) {
    await assert.rejects(() => run(services), /PIPELINE_RELEASE_(?:COMPOSITION_INVALID|CALLER_CLOSURE_REQUIRED)/);
    assert.equal(fs.existsSync(output), false);
  }
  const other = document.bindings.find((b: any) => b.owner === 'buster-engine' && b.instanceId === 'fixture.service.buster-security-runtime');
  await assert.rejects(() => run([{ ...service, serviceInstanceId: other.instanceId, bindings: document.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === other.instanceId).map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) }, child]), /PIPELINE_BUSTER_HANDOFF_SELECTION_MISMATCH/);
  assert.equal(fs.existsSync(output), false);

  // Exact release bindings must agree with the original selected root even
  // before the still-closed source/caller gate; denial alone is not this join.
  for (const index of [0, 1]) {
    const changed = structuredClone(complete);
    changed[index]!.bindings[0]!.profileId = 'foreign-profile';
    await assert.rejects(() => run(changed), /PIPELINE_RELEASE_BINDING_MISMATCH/);
    assert.equal(fs.existsSync(output), false);
  }
  const missingParentWorker = structuredClone(service);
  missingParentWorker.bindings = missingParentWorker.bindings.filter((b: any) => b.owner !== 'worker-core');
  await assert.rejects(() => run([missingParentWorker, child]), /WORKER_CORE_VERSIONED_SELECTION_REQUIRED/);
  const wrongWorker = structuredClone(child);
  wrongWorker.bindings.find((binding: any) => binding.owner === 'worker-core').profileId = 'foreign-worker';
  await assert.rejects(() => run([service, wrongWorker]), /PIPELINE_RELEASE_BINDING_MISMATCH/);
  await assert.rejects(() => run([service, { ...child, bindings: [...child.bindings].reverse() }]), /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
  for (const bindings of [[], [...child.bindings, child.bindings[0]],
    child.bindings.map((binding: any) => ({ ...binding, instanceId: 'foreign-instance' }))]) {
    await assert.rejects(() => run([service, { ...child, bindings }]), /SWARM_CONFIG_SELECTION_OWNERS_INVALID/);
    assert.equal(fs.existsSync(output), false);
  }
  await assert.rejects(() => run(),/PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);assert.equal(fs.existsSync(output),false);
  const schema=path.join(root,'schemas/browser/axe.task.schema.json'),original=fs.readFileSync(schema);fs.unlinkSync(schema);
  await assert.rejects(() => run(),{code:'ENOENT'});assert.equal(fs.existsSync(output),false);
  fs.writeFileSync(schema,original);await assert.rejects(() => run(),/PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
  assert.equal(fs.readdirSync(root).some(name=>name.startsWith('.pipeline-stage-')),false);
});


// Exact root/profile concordance is shared by all release callers, not just
// the Buster parent/child pair. This is inspection, never source admission.
test('real Prism v10 release callers preserve exact original owner bindings before source admission', async t => {
  const { execFileSync } = await import('node:child_process');
  const { materializePipelineGeneration } = await import('../../../scripts/updates/pipeline-generation.mjs');
  const root = tree(t), code = path.join(root, 'prism-role'), output = path.join(root, 'must-not-publish');
  execFileSync(process.execPath, [path.join(repository, 'scripts/build-runtime-role-bundle.mjs'), 'prism', code,
    'a'.repeat(40), 'config-v10-prism-binding-test', '2026-10-20T00:00:00Z'], { cwd: repository, stdio: 'pipe' });
  const document = JSON.parse(rootBytes.toString());
  const owners: Record<string, string[]> = {
    'prism-control': ['prism-control', 'prism-execution'],
    'prism-worker': ['prism-worker', 'prism-control', 'prism-execution'],
    'prism-studio': ['prism-studio'], 'prism-ingestion': ['prism-control'],
    'prism-agent-bridge': ['prism-control'],
  };
  const selected = (callerId: string) => {
    const serviceInstanceId = `fixture.service.${['prism-ingestion', 'prism-agent-bridge'].includes(callerId) ? 'prism-control' : callerId}`;
    return { role: 'prism', callerId, serviceInstanceId,
      bindings: document.bindings.filter((b: any) => b.role === 'prism' && b.instanceId === serviceInstanceId && owners[callerId]!.includes(b.owner))
        .map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) };
  };
  const complete = ['prism-control', 'prism-worker', 'prism-studio', 'prism-ingestion'].map(selected);
  const run = (services: any[]) => materializePipelineGeneration({ authorRoot: path.join(root, 'config'), packageRoot: code,
    output, services, publisher: path.join(root, 'NONEXISTENT-MUST-NOT-EXECUTE') });
  for (const composition of [complete, [selected('prism-agent-bridge')]]) {
    for (let index = 0; index < composition.length; index++) {
      for (let owner = 0; owner < composition[index]!.bindings.length; owner++) {
        const changed = structuredClone(composition);
        changed[index]!.bindings[owner]!.profileId = 'foreign-profile';
        await assert.rejects(() => run(changed), /PIPELINE_RELEASE_BINDING_MISMATCH/);
        assert.equal(fs.existsSync(output), false);
      }
      if (['prism-control', 'prism-worker'].includes(composition[index]!.callerId)) {
        const missingWorker = structuredClone(composition);
        missingWorker[index]!.bindings = missingWorker[index]!.bindings.filter((b: any) => b.owner !== 'worker-core');
        await assert.rejects(() => run(missingWorker), /WORKER_CORE_VERSIONED_SELECTION_REQUIRED/);
        assert.equal(fs.existsSync(output), false);
      }
      const foreign = structuredClone(composition);
      foreign[index]!.serviceInstanceId = 'foreign-service';
      for (const binding of foreign[index]!.bindings) binding.instanceId = 'foreign-service';
      await assert.rejects(() => run(foreign), /PIPELINE_RELEASE_BINDING_MISMATCH/);
      const missing = structuredClone(composition); missing[index]!.bindings.shift();
      await assert.rejects(() => run(missing), /SWARM_CONFIG_SELECTION_OWNERS_INVALID/);
      const duplicate = structuredClone(composition); duplicate[index]!.bindings.push(duplicate[index]!.bindings[0]);
      await assert.rejects(() => run(duplicate), /SWARM_CONFIG_SELECTION_OWNERS_INVALID/);
    }
    // Historical Prism v3 callers lack the required WorkerCore binding. They
    // must fail at that original rule, not hide it behind source denial.
    // The standalone bridge consumes no WorkerCore and retains source denial.
    const denial = composition.length === 1 ? /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/ : /WORKER_CORE_VERSIONED_SELECTION_REQUIRED/;
    await assert.rejects(() => run(composition.map(service => ({ ...service, bindings: [...service.bindings].reverse() }))),
      denial);
    await assert.rejects(() => run(composition), denial);
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.readdirSync(root).some(name => name.startsWith('.pipeline-stage-')), false);
  }
});

function novaCandidate(name:string, rootHash:string, inputHash:string){
 const value=read(path.join(base,'same-entry-agent-role-binding-01/outputs/nova',name));
 value.binding.rootVersion='pipeline-entry.v10';value.binding.rootRawSha256=rootHash;value.binding.inputGenerationSha256=inputHash;return value;
}
function novaRegistryTree(root:string) {
 const plugins=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-plugin-schemas.json')).packages;
 const packages=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-package-sources.json')).packages;
 const registryRoot=path.join(root,'local-registry-fixture');fs.mkdirSync(registryRoot);
 for(const [packageId,source]of Object.entries(plugins) as [string,any][]) {
  if(source.family==='nova-module')fs.cpSync(path.join(root,packages[packageId].generationRoot),path.join(registryRoot,packageId),{recursive:true});
 }
 // Real original discover/build, no activation/import. This local test allowlist
 // is NOT an installed deployment identity or source authorization receipt.
 return buildRegistry(discoverPackages({installationRoots:[registryRoot],trustPolicy:{trustedBuiltinRoots:[registryRoot],
  allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'local-capture-registry-control'}}));
}
test('ALL8 Nova selected captured sources match real original registry entries without stage-instance authority',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);const registry=novaRegistryTree(root);
 const names=fs.readdirSync(path.join(base,'same-entry-agent-role-binding-01/outputs/nova'));
 for(const name of names) {
  const value=novaCandidate(name,replacements[0]!.sha256,f.capture.inputGenerationSha256);
  const inspected=inspectPipelineV10NovaRegistryIdentity(Buffer.from(JSON.stringify(value)),registry,f.capture);
  assert.equal(inspected.registrationSurface,value.binding.kind);assert.equal(inspected.registrationId,value.binding.registrationId);
  assert.equal(inspected.selectedInstanceId,value.binding.instanceId);assert.equal(inspected.registrySourceCoherent,true);
  for(const key of ['installedSourceAuthorizationVerified','stageInstanceAuthorizationVerified','callerAuthorizationVerified','originalRunAuthorizationVerified','originalAuthorizationVerified','activationAllowed'] as const)assert.equal(inspected[key],false);
 }
 assert.equal(names.length,8);
});
test('registry/source join rejects missing, changed, foreign package/provenance and opposite surfaces then restores positive',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);const registry=novaRegistryTree(root);
 const value=novaCandidate('kubeclaw.architecture-validator-architecture.json',replacements[0]!.sha256,f.capture.inputGenerationSha256);
 const raw=Buffer.from(JSON.stringify(value)),type='kubeclaw.validate.architecture',entry=registry.stages.get(type)!;
 const changedEntry=(changed:any)=>({...registry,stages:new Map([...registry.stages].map(([key,row])=>[key,key===type?changed:row]))});
 const run=(candidate:any)=>inspectPipelineV10NovaRegistryIdentity(raw,candidate,f.capture);
 assert.throws(()=>run({...registry,stages:new Map()}),/REGISTRY_REGISTRATION_MISSING/);
 for(const changed of [
  {...entry,registration:{...entry.registration,export:'foreign'}},
  {...entry,provenance:{...entry.provenance,surface:'adapter'}},
  {...entry,provenance:{...entry.provenance,registrationId:'foreign'}},
  {...entry,package:{...entry.package}},
 ])assert.throws(()=>run(changedEntry(changed)),/REGISTRY_/);
 const pkg=entry.package;
 const altered={...pkg,provenance:{...pkg.provenance,package:{...pkg.provenance.package,contentDigest:'sha256:'+'0'.repeat(64)}}};
 const mismatched=changedEntry({...entry,package:altered,provenance:{...entry.provenance,package:altered.provenance}});
 assert.throws(()=>run({...mismatched,packages:new Map([...registry.packages].map(([id,p])=>[id,id===value.binding.packageId?altered:p]))}),/REGISTRY_PACKAGE_IDENTITY/);
 assert.equal(run(registry).activationAllowed,false);
 const adapter=novaCandidate('kubeclaw.runtime-dispatch-openclaw.json',replacements[0]!.sha256,f.capture.inputGenerationSha256);
 const adapterRaw=Buffer.from(JSON.stringify(adapter));
 assert.throws(()=>inspectPipelineV10NovaRegistryIdentity(adapterRaw,{...registry,adapters:new Map()},f.capture),/REGISTRY_REGISTRATION_MISSING/);
 assert.equal(inspectPipelineV10NovaRegistryIdentity(adapterRaw,registry,f.capture).stageType,null);
});
test('Nova stage and adapter all-profile processing reaches original registry validators without activation',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);const registry=novaRegistryTree(root);
 const names=fs.readdirSync(path.join(base,'same-entry-agent-role-binding-01/outputs/nova'));
 for(const name of names){
  const value=novaCandidate(name,replacements[0]!.sha256,f.capture.inputGenerationSha256),raw=Buffer.from(JSON.stringify(value));
  const run=(candidate:any)=>inspectPipelineV10NovaRegistryIdentity(raw,candidate,f.capture);
  assert.throws(()=>run({...registry,schemas:new Map()}),/REGISTRY_SCHEMA_NOT_COMPILED/);
  const validated:unknown[]=[];
  const schemas=new Map([...registry.schemas].map(([key,validator])=>[key,{...validator,validate:(configuration:unknown)=>{
   validated.push(structuredClone(configuration));validator.validate(configuration);
  }}]));
  const result=run({...registry,schemas});
  const owner=JSON.parse(f.capture.read(`config/${value.binding.ownerPath}`).toString());
  const expected=Object.values(owner.profiles).map((profile:any)=>Object.hasOwn(profile.processing,value.binding.registrationId)
   ?profile.processing[value.binding.registrationId]:profile.processing);
  assert.deepEqual(validated,expected,name);
  assert.ok(validated.length>0,name);
  let calls=0;
  const rejectingSchemas=new Map([...registry.schemas].map(([key,validator])=>[key,{...validator,validate:(configuration:unknown)=>{
   validator.validate(configuration);if(++calls===expected.length)throw new Error('ORIGINAL_FINAL_PROFILE_REJECTED');
  }}]));
  assert.throws(()=>run({...registry,schemas:rejectingSchemas}),/ORIGINAL_FINAL_PROFILE_REJECTED/);
  assert.equal(calls,expected.length);
  for(const key of ['installedSourceAuthorizationVerified','stageInstanceAuthorizationVerified','callerAuthorizationVerified','originalRunAuthorizationVerified','activationAllowed']as const)
   assert.equal(result[key],false);
  assert.equal(run(registry).registrySourceCoherent,true);
 }
 assert.equal(names.length,8);
});
test('actual compiler membership has explicit uncovered stage owners and no registry-to-original-instance ABI',async t=>{
 const root=tree(t),registry=novaRegistryTree(root);
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');
 const taskRoot=fs.mkdtempSync(path.join(os.tmpdir(),'registry-membership-gap-'));t.after(()=>fs.rmSync(taskRoot,{recursive:true,force:true}));
 const fixture=await projectSourceFixture(taskRoot,{review:true,clean:false});t.after(()=>fixture.close());
 const task:any=structuredClone(fixture.project);for(const module of task.modules)module.review={agent:'architect'};task.final.review={agent:'architect'};
 const actual=compileProject(task).definition;
 const observed=actual.stages.map(stage=>({stageId:stage.id,stageType:stage.type,selectedRegistryHasOwner:registry.stages.has(stage.type)}));
 const missing=[...new Set(observed.filter(row=>!row.selectedRegistryHasOwner).map(row=>row.stageType))];
 assert.ok(missing.includes('kubeclaw.decision.review'));
 assert.ok(missing.includes('kubeclaw.test.quality-evaluation'));
 for(const stage of actual.stages) {
  const entry=registry.stages.get(stage.type);if(!entry)continue;
  assert.equal(Object.hasOwn(entry,'instanceId'),false);assert.equal(Object.hasOwn(entry.provenance,'instanceId'),false);
 }
 t.diagnostic(JSON.stringify({scope:'actual compiler-source observation,NOT instance or installed-authority acceptance',observed,missing}));
});
test('ALL8 Nova selected tuple/owner/schema/manifest/package/config joins use SAME retained448 inputs, not grants',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const names=fs.readdirSync(path.join(base,'same-entry-agent-role-binding-01/outputs/nova')).filter(n=>n.endsWith('.json'));assert.equal(names.length,8);
 for(const name of names){const value=novaCandidate(name,replacements[0]!.sha256,f.capture.inputGenerationSha256);
  const result=inspectPipelineV10NovaSourceIdentity(Buffer.from(JSON.stringify(value)),f.capture);
  assert.equal(result.selectedConfigurationVerified,true);assert.equal(result.profileDigestVerified,false);
  assert.equal(result.originalAuthorizationVerified,false);assert.equal(result.activationAllowed,false);
 }
});
test('Nova wrong selected tuple/raw original identities and schema-valid diagnostic substitution reject, restored succeeds',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const original=novaCandidate('kubeclaw.project-summary-summary.json',replacements[0]!.sha256,f.capture.inputGenerationSha256);
 const run=(value:any)=>inspectPipelineV10NovaSourceIdentity(Buffer.from(JSON.stringify(value)),f.capture);
 const mutations:[(value:any)=>void,RegExp][]=[
  [v=>{v.binding.profileId='missing-original-profile';},/EXACT_NOVA_TUPLE/],
  [v=>{v.binding.ownerRawSha256='0'.repeat(64);},/OWNER_RAW_IDENTITY/],
  [v=>{v.configuration.agentRole='other-diagnostic-role';},/SELECTED_CONFIGURATION/],
  [v=>{v.binding.ownerSchemaSha256='0'.repeat(64);},/OWNER_SCHEMA_IDENTITY/],
  [v=>{v.binding.manifestSha256='0'.repeat(64);},/MANIFEST_IDENTITY/],
  [v=>{v.binding.sourcePackageDigest='sha256:'+'0'.repeat(64);},/PACKAGE_CONTENT_IDENTITY/],
  [v=>{v.binding.runtimeDispatchOwnerRawSha256='0'.repeat(64);},/RUNTIME_DISPATCH_OWNER/]
 ];
 for(const [mutate,error]of mutations){const value=structuredClone(original);mutate(value);assert.throws(()=>run(value),error);assert.equal(run(original).activationAllowed,false);}
});

function providerCandidates(f:ReturnType<typeof capture>){
 const root=JSON.parse(f.capture.read('config/pipeline.config.json').toString()),plugins=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-plugin-schemas.json')).packages;
 const packages=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-package-sources.json')).packages;
 const schemas=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-receiver-schemas.json')).provider.schema.oneOf;
 const originals=fs.readdirSync(path.join(base,'same-entry-agent-role-binding-01/outputs/inherited')).map(name=>read(path.join(base,'same-entry-agent-role-binding-01/outputs/inherited',name))).filter(v=>v.schemaVersion==='provider-configuration.v2');
 return root.pluginSelections.filter((t:any)=>t.kind==='test-provider').map((t:any)=>{
  const source=plugins[t.packageId],declaration=source.manifest.testProviders.find((r:any)=>`${t.packageId}:${r.id}`===t.registrationId);
  const arm=schemas.find((a:any)=>a.properties.contractId.const===declaration.contractId),value=structuredClone(originals.find(v=>v.contractId===declaration.contractId)??originals[0]);
  value.contractId=declaration.contractId;if(t.packageId.endsWith('size-budget')||t.packageId.endsWith('coverage-budget'))value.values={};
  const binding=value.selectedPolicy.binding;
  for(const key of Object.keys(binding))if(!Object.hasOwn(arm.properties.selectedPolicy.properties.binding.properties,key))delete binding[key];
  for(const [key,schema]of Object.entries(arm.properties.selectedPolicy.properties.binding.properties)as[string,any][])if(schema.const!==undefined)binding[key]=schema.const;
  for(const [key,value]of Object.entries(t))if(Object.hasOwn(arm.properties.selectedPolicy.properties.binding.properties,key))binding[key]=value;
  const ownerRaw=f.capture.read(`config/${source.ownerPath}`),owner=JSON.parse(ownerRaw.toString()),profile=owner.profiles[t.profileId];
  const selected=t.packageId==='kubeclaw.security-providers'?profile.registrations[declaration.id]:profile;
  value.selectedPolicy.processing=selected.processing;value.selectedPolicy.declarations=selected.declarations;
  binding.rootDigest='sha256:'+createHash('sha256').update(f.capture.read('config/pipeline.config.json')).digest('hex');binding.ownerDigest='sha256:'+createHash('sha256').update(ownerRaw).digest('hex');
  binding.ownerSchemaDigest='sha256:'+createHash('sha256').update(f.capture.read('schemas/'+source.provenance.schemaPath.split('/schemas/')[1])).digest('hex');
  binding.packageVersion=source.manifest.packageVersion;binding.packageContentDigest=packages[t.packageId].contentDigest;
  const task='sha256:'+createHash('sha256').update(f.capture.read(path.posix.dirname(source.manifestPath)+'/'+declaration.configSchema)).digest('hex');
  const quality=['kubeclaw.size-budget','kubeclaw.coverage-budget'].includes(t.packageId);
  value.taskSchemaDigest=quality?QUALITY_TASK_SCHEMA_DIGEST:task;binding.taskSchemaDigest=value.taskSchemaDigest;
  if(quality)binding.profileDigest=remotePlanDigest(selected);
  if(binding.runtimeRole!==undefined){const engine=root.bindings.find((b:any)=>b.role==='buster'&&b.owner==='buster-engine'&&b.instanceId===t.serviceInstanceId);binding.runtimeRole='buster';binding.componentInstanceId=engine.instanceId;binding.componentProfileId=engine.profileId;binding.componentOwnerDigest='sha256:'+createHash('sha256').update(f.capture.read('config/components/buster-engine.config.json')).digest('hex');}
  return value;
 });
}
function serviceCandidate(f:ReturnType<typeof capture>,family:'gateway'|'launcher',name:string){
 const value=read(path.join(base,'same-entry-agent-role-binding-01/outputs',family==='gateway'?'gateway':'prism',name));
 value.rootVersion='pipeline-entry.v10';value.rootRawSha256=replacements[0]!.sha256;value.inputGenerationSha256=f.capture.inputGenerationSha256;return value;
}
test('ALL14 Test-Provider exact selected processing/declarations/raw schemas/packages/task identities from SAME448 capture',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const values=providerCandidates(f);assert.equal(values.length,14);
 for(const value of values){const r=inspectPipelineV10SelectedSourceIdentity('provider',Buffer.from(JSON.stringify(value)),f.capture);assert.equal(r.selectedConfigurationVerified,true);assert.equal(r.profileDigestVerified,['kubeclaw.size-budget@1','kubeclaw.coverage-budget@1'].includes(value.contractId));assert.equal(r.c3AuthorizationVerified,false);assert.equal(r.originalAuthorizationVerified,false);assert.equal(r.activationAllowed,false);}
});
test('Gateway selected role projections and BOTH distinct launcher receiver views join exact same original author',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);
 for(const name of ['local-A.service-policy.json','nova-current.service-policy.json','prism-current.service-policy.json'])assert.equal(inspectPipelineV10SelectedSourceIdentity('gateway',Buffer.from(JSON.stringify(serviceCandidate(f,'gateway',name))),f.capture).activationAllowed,false);
 for(const name of ['prism-agent-bridge.policy.json','control-agent-jobs.policy.json'])assert.equal(inspectPipelineV10SelectedSourceIdentity('launcher',Buffer.from(JSON.stringify(serviceCandidate(f,'launcher',name))),f.capture).activationAllowed,false);
});
test('provider/source and service projection mutations reject; restored originals remain nonauthorizing',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const provider=providerCandidates(f).find((v:any)=>v.contractId==='kubeclaw.axe@1');
 const run=(family:'provider'|'gateway'|'launcher',v:any)=>inspectPipelineV10SelectedSourceIdentity(family,Buffer.from(JSON.stringify(v)),f.capture);
 for(const [mutate,error]of [
  [(v:any)=>{v.selectedPolicy.binding.ownerDigest='sha256:'+'0'.repeat(64);},/OWNER_RAW_IDENTITY/],
  [(v:any)=>{v.selectedPolicy.binding.taskSchemaDigest='sha256:'+'0'.repeat(64);},/TASK_SCHEMA_IDENTITY/],
  [(v:any)=>{v.selectedPolicy.binding.packageContentDigest='sha256:'+'0'.repeat(64);},/PACKAGE_CONTENT_IDENTITY/],
  [(v:any)=>{v.selectedPolicy.processing.timeoutMs++;},/SELECTED_CONFIGURATION/]
 ]as const){const v=structuredClone(provider);mutate(v);assert.throws(()=>run('provider',v),error);assert.equal(run('provider',provider).activationAllowed,false);}
 const gateway=serviceCandidate(f,'gateway','nova-current.service-policy.json'),badGateway=structuredClone(gateway);badGateway.policy.managedOpenClaw.agents.defaults.contextPruning.ttl='123m';assert.throws(()=>run('gateway',badGateway),/SELECTED_CONFIGURATION/);assert.equal(run('gateway',gateway).activationAllowed,false);
 const launcher=serviceCandidate(f,'launcher','prism-agent-bridge.policy.json'),badLauncher=structuredClone(launcher);badLauncher.policy.claimLifetimeMs++;assert.throws(()=>run('launcher',badLauncher),/SELECTED_CONFIGURATION/);assert.equal(run('launcher',launcher).activationAllowed,false);
});

function infrastructureCandidate(f:ReturnType<typeof capture>, family:'controller'|'recovery') {
 const root=JSON.parse(f.capture.read('config/pipeline.config.json').toString());
 const selection=family==='controller'?root.deploymentSelections.find((v:any)=>v.consumer==='namespace-controller'):root.infrastructureSelections.find((v:any)=>v.role==='postgresql-recovery');
 const owner=JSON.parse(f.capture.read(selection.ownerPath).toString());
 return {selection,profile:owner.profiles[selection.profileId]};
}
test('original controller/recovery selected business profiles join SAME448 capture without inventing transport wrappers',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);
 for(const family of ['controller','recovery']as const){
  const {selection,profile}=infrastructureCandidate(f,family),raw=Buffer.from(JSON.stringify(profile));
  const result=inspectPipelineV10InfrastructureSourceIdentity(family,selection,raw,f.capture);
  assert.equal(result.selectedConfigurationVerified,true);assert.equal(result.activationAllowed,false);
  assert.equal(result.profileDigestVerified,false);assert.equal(result.originalAuthorizationVerified,false);assert.equal(result.c3AuthorizationVerified,false);
  assert.equal(result.rootRawSha256,replacements[0]!.sha256);assert.equal(result.inputGenerationSha256,f.capture.inputGenerationSha256);
  assert.equal(result.outputRawSha256,createHash('sha256').update(raw).digest('hex'));
  assert.equal(Object.hasOwn(result,'receipt'),false);assert.equal(Object.hasOwn(result,'caller'),false);
 }
});
test('controller/recovery reject wrong/union scopes and substituted business profile, restore nonauthorizing positives',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);
 for(const family of ['controller','recovery']as const){
  const {selection,profile}=infrastructureCandidate(f,family),raw=Buffer.from(JSON.stringify(profile));
  const run=(s:any,p=raw)=>inspectPipelineV10InfrastructureSourceIdentity(family,s,p,f.capture);
  assert.throws(()=>run({...selection,scope:'controller+recovery'}),/INFRA_SELECTION/);
  assert.throws(()=>run({...selection,profileId:'missing-original-profile'}),/EXACT_INFRA_TUPLE/);
  const changed=structuredClone(profile);changed.settings.__foreignSetting=true;
  assert.throws(()=>run(selection,Buffer.from(JSON.stringify(changed))),/SELECTED_CONFIGURATION/);
  assert.throws(()=>run(selection,Buffer.from('{'+'"settings":{},"settings":{}}')),/JSON/);
  assert.throws(()=>run(selection,Buffer.from(JSON.stringify({policy:profile,authentication:'public-unsealed'}))),/SELECTED_CONFIGURATION/);
  assert.equal(run(selection).activationAllowed,false);
 }
 const gateway=JSON.parse(f.capture.read('config/pipeline.config.json').toString()).deploymentSelections.find((s:any)=>s.consumer==='openclaw-gateway');
 assert.throws(()=>inspectPipelineV10InfrastructureSourceIdentity('controller',gateway,Buffer.from('{}'),f.capture),/INFRA_SELECTION/);
});
test('controller inspection verifies exact original component peer even with valid retained raw roster',t=>{
 const root=tree(t),document=JSON.parse(rootBytes.toString());
 const selection=document.deploymentSelections.find((s:any)=>s.consumer==='namespace-controller');selection.busterComponentInstanceId='foreign-service';
 const bytes=Buffer.from(JSON.stringify(document));fs.writeFileSync(path.join(root,'config/pipeline.config.json'),bytes);
 const f=capture(root,[row('config/pipeline.config.json',bytes),replacements[1]!]);t.after(f.capture.close);
 const profile=JSON.parse(f.capture.read('charts/kubeclaw/values.yaml').toString()).profiles[selection.profileId];
 assert.throws(()=>inspectPipelineV10InfrastructureSourceIdentity('controller',selection,Buffer.from(JSON.stringify(profile)),f.capture),/EXACT_PEER_REQUIRED/);
});

function networkCandidate(f:ReturnType<typeof capture>){
 const root=JSON.parse(f.capture.read('config/pipeline.config.json').toString());
 const selection=root.pluginSelections.find((s:any)=>s.packageId==='kubeclaw.network-http');
 const owner=JSON.parse(f.capture.read('config/plugins/kubeclaw.network-http.config.json').toString());
 return {selection,configuration:owner.profiles[selection.profileId].processing};
}
test('network HTTP plain adapter processing joins exact selected owner/manifest/config/package from SAME448 capture',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const {selection,configuration}=networkCandidate(f);
 const raw=Buffer.from(JSON.stringify(configuration)),r=inspectPipelineV10NetworkAdapterSourceIdentity(selection,raw,f.capture);
 assert.equal(r.family,'network-adapter');assert.equal(r.selectedConfigurationVerified,true);assert.equal(r.activationAllowed,false);
 assert.equal(r.profileDigestVerified,false);assert.equal(r.originalAuthorizationVerified,false);assert.equal(r.c3AuthorizationVerified,false);
 assert.equal(r.rootRawSha256,replacements[0]!.sha256);assert.equal(r.inputGenerationSha256,f.capture.inputGenerationSha256);
 assert.equal(r.outputRawSha256,createHash('sha256').update(raw).digest('hex'));
 const packages=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-package-sources.json'));
 assert.equal(r.sourcePackageDigest,packages.packages['kubeclaw.network-http'].contentDigest);
 assert.equal(Object.hasOwn(r,'receipt'),false);assert.equal(Object.hasOwn(r,'caller'),false);
});
test('network adapter uses real original registry configuration consumer for all profiles without activation',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const {selection,configuration}=networkCandidate(f);
 const sources=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-package-sources.json')).packages;
 const registryRoot=path.join(root,'network-registry');fs.mkdirSync(registryRoot);
 fs.cpSync(path.join(root,sources[selection.packageId].generationRoot),path.join(registryRoot,selection.packageId),{recursive:true});
 const registry=buildRegistry(discoverPackages({installationRoots:[registryRoot],trustPolicy:{trustedBuiltinRoots:[registryRoot],
  allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'local-network-source-control'}}));
 const raw=Buffer.from(JSON.stringify(configuration));
 const run=(candidate:any=registry)=>inspectPipelineV10NetworkAdapterSourceIdentity(selection,raw,f.capture,candidate);
 const entry=registry.adapters.get(selection.registrationId)!;
 const replace=(changed:any)=>({...registry,adapters:new Map([[selection.registrationId,changed]])});
 assert.equal(inspectPipelineV10NetworkAdapterSourceIdentity(selection,raw,f.capture).registrySourceCoherent,false);
 assert.throws(()=>run({...registry,adapters:new Map()}),/ADAPTER_REGISTRY_PACKAGE/);
 assert.throws(()=>run({...registry,apiVersion:'foreign'}),/ADAPTER_REGISTRY_API_VERSION/);
 assert.throws(()=>run(replace({...entry,registration:{...entry.registration,export:'foreign'}})),/ADAPTER_REGISTRY_PROVENANCE/);
 assert.throws(()=>run(replace({...entry,provenance:{...entry.provenance,surface:'test_provider'}})),/ADAPTER_REGISTRY_PROVENANCE/);
 assert.throws(()=>run(replace({...entry,package:{...entry.package}})),/ADAPTER_REGISTRY_PACKAGE/);
 const pkg={...entry.package,provenance:{...entry.package.provenance,package:{...entry.package.provenance.package,contentDigest:'sha256:'+'0'.repeat(64)}}};
 assert.throws(()=>run({...replace({...entry,package:pkg,provenance:{...entry.provenance,package:pkg.provenance}}),
  packages:new Map([[selection.packageId,pkg]])}),/ADAPTER_REGISTRY_SOURCE/);
 assert.throws(()=>run({...registry,schemas:new Map()}),/REGISTRY_SCHEMA_NOT_COMPILED/);
 // Observe the real retained validator, including the unselected original
 // profile, while preserving its validation and all source assertions.
 const validated:any[]=[];
 const schemas=new Map([...registry.schemas].map(([key,validator])=>[key,{...validator,validate:(value:unknown)=>{
  validated.push(structuredClone(value));validator.validate(value);
 }}]));
 const result=run({...registry,schemas});
 const owner=JSON.parse(f.capture.read('config/plugins/kubeclaw.network-http.config.json').toString());
 assert.deepEqual(validated,Object.values(owner.profiles).map((profile:any)=>profile.processing));
 assert.ok(validated.length>1);assert.equal(result.registrySourceCoherent,true);
 for(const key of ['installedSourceAuthorizationVerified','callerAuthorizationVerified','originalAuthorizationVerified','activationAllowed']as const)
  assert.equal(result[key],false);
 assert.equal(run().registrySourceCoherent,true);
});
test('network adapter rejects provider/composite/foreign tuples, default omission, wrappers and config substitutions; restores plain config',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const {selection,configuration}=networkCandidate(f);
 const run=(s:any,c=configuration)=>inspectPipelineV10NetworkAdapterSourceIdentity(s,Buffer.from(JSON.stringify(c)),f.capture);
 assert.throws(()=>run({...selection,kind:'test-provider'}),/ADAPTER_FAMILY/);
 assert.throws(()=>run({...selection,scope:'provider+nova'}),/ADAPTER_SELECTION/);
 assert.throws(()=>run({...selection,serviceInstanceId:'foreign-service'}),/EXACT_ADAPTER_TUPLE/);
 const changed=structuredClone(configuration);changed.timeoutMs++;
 assert.throws(()=>run(selection,changed),/SELECTED_CONFIGURATION/);
 const omitted=structuredClone(configuration);delete omitted.allowedMethods;
 assert.throws(()=>run(selection,omitted),/SELECTED_CONFIGURATION/);
 assert.throws(()=>run(selection,{schemaVersion:'provider-configuration.v2',configuration}),/SELECTED_CONFIGURATION/);
 assert.throws(()=>inspectPipelineV10NetworkAdapterSourceIdentity(selection,Buffer.from('{"timeoutMs":1,"timeoutMs":2}'),f.capture),/JSON/);
 assert.equal(run(selection).activationAllowed,false);
});
test('changed actual network package bytes reject before config-validator cache admission; restored capture succeeds',t=>{
 const root=tree(t),f=capture(root,replacements),candidate=networkCandidate(f);f.capture.close();
 const filename=path.join(root,'source-current/skills/common/plugins/network-http/src/adapter.ts');
 const before=fs.readFileSync(filename);fs.appendFileSync(filename,'\nthrow new Error("MUST-NOT-IMPORT-GENERATION-CODE");\n');
 assert.throws(()=>capture(root,replacements),/INPUT_|MEMBER_|IDENTITY|DIGEST|CHANGED/);
 fs.writeFileSync(filename,before);const restored=capture(root,replacements);t.after(restored.capture.close);
 assert.equal(inspectPipelineV10NetworkAdapterSourceIdentity(candidate.selection,Buffer.from(JSON.stringify(candidate.configuration)),restored.capture).activationAllowed,false);
});

const coreMembers=['platform','projectCompiler','runtimeLocks']as const;
function coreCandidate(f:ReturnType<typeof capture>){
 const selection=JSON.parse(f.capture.read('config/pipeline.config.json').toString()).novaCoreSelection;
 const owner=JSON.parse(f.capture.read('config/nova/core.config.json').toString());
 return {selection,settings:owner.profiles[selection.profileId].settings};
}
test('ALL4 Core profiles preserve separate platform/compiler/lock raw projections SAME448, no path resolution or effects',t=>{
 const root=tree(t),owner=read(path.join(root,'config/nova/core.config.json'));
 assert.equal(Object.keys(owner.profiles).length,4);
 for(const profileId of Object.keys(owner.profiles)){
  const document=JSON.parse(rootBytes.toString());document.novaCoreSelection.profileId=profileId;
  const bytes=Buffer.from(JSON.stringify(document));fs.writeFileSync(path.join(root,'config/pipeline.config.json'),bytes);
  const f=capture(root,[row('config/pipeline.config.json',bytes),replacements[1]!]);
  try{const {selection,settings}=coreCandidate(f);
   for(const member of coreMembers){const raw=Buffer.from(JSON.stringify(settings[member]));
    const r=inspectPipelineV10CoreSourceIdentity(member,selection,raw,f.capture);
    assert.equal(r.family,'nova-core');assert.equal(r.member,member);assert.equal(r.selectedConfigurationVerified,true);
    for(const key of ['profileDigestVerified','originalAuthorizationVerified','c3AuthorizationVerified','activationAllowed','canonicalAuthorPathVerified']as const)assert.equal(r[key],false);
    assert.equal(r.outputRawSha256,createHash('sha256').update(raw).digest('hex'));assert.equal(r.rootRawSha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(r.inputGenerationSha256,f.capture.inputGenerationSha256);assert.equal(Object.hasOwn(r,'receipt'),false);
   }
   assert.ok(settings.platform.installationRoots.some((p:string)=>p.startsWith('../')));
  }finally{f.capture.close();}
 }
});
test('Core rejects foreign/composite selection, member confusion, inferred/defaulted leaves and wrappers; restores exact projections',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const {selection,settings}=coreCandidate(f);
 const run=(member:typeof coreMembers[number],tuple:any,value:any)=>inspectPipelineV10CoreSourceIdentity(member,tuple,Buffer.from(JSON.stringify(value)),f.capture);
 assert.throws(()=>run('platform',{...selection,scope:'nova-core+provisioning'},settings.platform),/CORE_SELECTION/);
 assert.throws(()=>run('platform',{...selection,role:'secret-provisioning'},settings.platform),/CORE_SCOPE/);
 assert.throws(()=>run('platform',{...selection,instanceId:'foreign-core'},settings.platform),/EXACT_CORE_TUPLE/);
 assert.throws(()=>run('platform',{...selection,profileId:'local-B-lock'},settings.platform),/EXACT_CORE_TUPLE/);
 assert.throws(()=>inspectPipelineV10CoreSourceIdentity('effectLockTtlMs'as any,selection,Buffer.from('1'),f.capture),/CORE_MEMBER/);
 assert.throws(()=>run('runtimeLocks',selection,settings.platform),/SELECTED_CONFIGURATION/);
 for(const member of coreMembers){
  const value=structuredClone(settings[member]);
  if(member==='platform')value.storageRoot='/foreign-state';
  else if(member==='projectCompiler')value.executionGroups.source.timeoutMs++;
  else value.journalAppendLockTimeoutMs++;
  assert.throws(()=>run(member,selection,value),/SELECTED_CONFIGURATION/);
  assert.throws(()=>run(member,selection,{settings:settings[member],authentication:'public-unsealed'}),/SELECTED_CONFIGURATION/);
  const missing=structuredClone(settings[member]);delete missing[Object.keys(missing)[0]!];
  assert.throws(()=>run(member,selection,missing),/SELECTED_CONFIGURATION/);
  assert.equal(run(member,selection,settings[member]).activationAllowed,false);
 }
});
test('Core rejects missing selected profile even when root/input identity is internally consistent',t=>{
 const root=tree(t),document=JSON.parse(rootBytes.toString());document.novaCoreSelection.profileId='missing-profile';
 const bytes=Buffer.from(JSON.stringify(document));fs.writeFileSync(path.join(root,'config/pipeline.config.json'),bytes);
 const f=capture(root,[row('config/pipeline.config.json',bytes),replacements[1]!]);t.after(f.capture.close);
 assert.throws(()=>inspectPipelineV10CoreSourceIdentity('platform',document.novaCoreSelection,Buffer.from('{}'),f.capture),/core:PROFILE_REQUIRED/);
});

test('selected Core Platform raw values reuse original schema/path mapper for ALL4profiles with explicit AUTHOR directory',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const raw=f.capture.read('config/nova/core.config.json'),owner=JSON.parse(raw.toString());
 const author=path.join(root,'original-author','config','nova');fs.mkdirSync(author,{recursive:true});
 for(const [id,profile]of Object.entries(owner.profiles)as[string,any][]){
  // Current preparation requires an explicit runtime-policy locator; captured historical bytes remain unchanged.
  // This effect-free path control does not load or authorize that separate policy.
  const value={...structuredClone(profile.settings.platform),corePolicySelection:{file:'runtime-policy.json',profile:'standard'}},before=structuredClone(value);
  const file=path.join(author,id+'.json');fs.writeFileSync(file,JSON.stringify(value));
  const prepared=resolvePlatformConfigValue(value,fs.realpathSync(author));
  assert.deepEqual(prepared,loadPlatformConfig(file));assert.deepEqual(value,before);assert.equal(Object.isFrozen(value),false);
  assert.deepEqual(prepared.installationRoots,value.installationRoots.map((v:string)=>path.resolve(author,v)));
  assert.equal(prepared.corePolicySelection.file,path.resolve(author,'runtime-policy.json'));
  assert.equal(fs.existsSync(prepared.corePolicySelection.file),false); // Preparation performs no policy I/O.
  assert.equal(prepared.storageRoot,path.resolve(author,value.storageRoot));assert.equal(Object.isFrozen(prepared.grants),true);
  assert.equal(Object.hasOwn(prepared,'activationAllowed'),false); // Preparation is not an admission/receipt object.
 }
 assert.deepEqual(f.capture.read('config/nova/core.config.json'),raw);f.capture.assertCurrent();
});
test('legacy realpath AUTHOR base remains distinct from symlink delivery directory; pure path mapping creates no directories',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);const {settings}=coreCandidate(f);
 const value={...structuredClone(settings.platform),corePolicySelection:{file:'runtime-policy.json',profile:'standard'}};value.storageRoot='../state';value.isolation={cgroupRoot:'../cgroup'};
 const author=path.join(root,'original-author','config','nova');fs.mkdirSync(author,{recursive:true});
 const file=path.join(author,'platform.json');fs.writeFileSync(file,JSON.stringify(value));
 const delivery=path.join(root,'delivered');fs.mkdirSync(delivery);const link=path.join(delivery,'platform.json');fs.symlinkSync(file,link);
 const loaded=loadPlatformConfig(link),prepared=resolvePlatformConfigValue(value,fs.realpathSync(author));
 assert.deepEqual(loaded,prepared);assert.equal(prepared.isolation?.cgroupRoot,path.resolve(author,'../cgroup'));
 assert.notDeepEqual(prepared.installationRoots,resolvePlatformConfigValue(value,delivery).installationRoots);
 const nonexistent=path.join(root,'not-created','author');resolvePlatformConfigValue(value,nonexistent);assert.equal(fs.existsSync(path.dirname(nonexistent)),false);
 assert.equal(fs.existsSync(path.resolve(author,'../state')),false);assert.equal(fs.existsSync(path.resolve(author,'../cgroup')),false);
});
test('pure Platform preparation rejects implicit/noncanonical base and missing source policies, restored original succeeds',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);const {settings}=coreCandidate(f),value={...structuredClone(settings.platform),corePolicySelection:{file:'runtime-policy.json',profile:'standard'}};
 for(const base of ['', '.', 'relative/author',root+'/../other',root+'/'])assert.throws(()=>resolvePlatformConfigValue(value,base),/PLATFORM_AUTHOR_DIRECTORY_INVALID/);
 assert.throws(()=>resolvePlatformConfigValue(value,undefined as any),/PLATFORM_AUTHOR_DIRECTORY_INVALID/);
 const missingSelection=structuredClone(value);delete (missingSelection as any).corePolicySelection;
 assert.throws(()=>resolvePlatformConfigValue(missingSelection,root),/PLATFORM_CONFIG_INVALID/);
 const missing=structuredClone(value);delete missing.effectLockTtlMs;
 assert.throws(()=>resolvePlatformConfigValue(missing,root),/PLATFORM_CONFIG_INVALID/);
 const invalid=structuredClone(value);invalid.shutdownTimeoutMs=-1;
 const file=path.join(root,'invalid-platform.json');fs.writeFileSync(file,JSON.stringify(invalid));
 assert.throws(()=>loadPlatformConfig(file),error=>error instanceof Error&&error.message.startsWith('PLATFORM_CONFIG_INVALID:'+fs.realpathSync(file)+':'));
 assert.equal(resolvePlatformConfigValue(value,root).schemaVersion,'pipeline-platform.v2');assert.equal(Object.isFrozen(value),false);
});

test('Core source closure reports exact captured raw subset and explicit7missing sources, never canonical/source authority',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const r=inspectPipelineV10CoreSourceClosure(f.capture);
 assert.equal(r.declaredMemberCount,449);assert.equal(r.observed.length,3);assert.equal(r.missing.length,7);
 assert.deepEqual(r.observed.map(x=>x.relativePath),[
  'source-current/skills/common/plugin-runtime/foundation/config/platform.schema.json',
  'source-current/skills/nova/core/execution/engine-runtime.ts','source-current/skills/nova/project/compiler.ts']);
 for(const name of ['state/journal.ts','state/file-mutex.ts','state/json-value.ts','execution/run-mutation.ts','effects/locks.ts'])assert.ok(r.missing.includes('source-current/skills/nova/core/'+name));
 assert.ok(r.missing.includes('source-current/skills/common/plugin-runtime/foundation/config/platform.ts'));
 for(const x of r.observed)assert.equal(x.sha256,createHash('sha256').update(f.capture.read(x.relativePath)).digest('hex'));
 assert.equal(r.localDependencies.length,7);assert.equal(r.sourceClosureVerified,false);assert.equal(r.canonicalAuthorPathVerified,false);assert.equal(r.originalAuthorizationVerified,false);assert.equal(r.activationAllowed,false);
 const {selection,settings}=coreCandidate(f);const result=inspectPipelineV10CoreSourceIdentity('platform',selection,Buffer.from(JSON.stringify(settings.platform)),f.capture);
 assert.deepEqual(result.sourceInspection,r);assert.equal(result.activationAllowed,false);assert.equal(Object.isFrozen(r.missing),true);
});
test('partial real capture and locally appended Platform source cannot silently relabel original448 source closure',t=>{
 const root=tree(t),f=capture(root,replacements),members=f.composition.members;f.capture.close();
 const partial=capturePipelineInputSet(root,members.filter(m=>!m.relativePath.endsWith('platform.schema.json')));t.after(partial.close);
 assert.throws(()=>inspectPipelineV10CoreSourceClosure(partial),/CORE_SOURCE_ROSTER/);
 const relative='source-current/skills/common/plugin-runtime/foundation/config/platform.ts';
 const bytes=fs.readFileSync(path.join(repository,'skills/common/plugin-runtime/foundation/config/platform.ts'));
 fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),bytes);
 const appended=capturePipelineInputSet(root,[...members,row(relative,bytes)]);t.after(appended.close);
 assert.throws(()=>inspectPipelineV10CoreSourceClosure(appended),/CORE_SOURCE_ROSTER/);
 // Extra on-disk bytes are NOT imported/repaired into the explicit admitted set.
 const restored=capture(root,replacements);t.after(restored.capture.close);
 assert.equal(inspectPipelineV10CoreSourceClosure(restored.capture).missing.includes(relative),true);
});
test('source closure does not turn changed admitted source bytes into a missing-source diagnostic, restored succeeds',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const file=path.join(root,'source-current/skills/nova/project/compiler.ts'),before=fs.readFileSync(file);fs.appendFileSync(file,'\n//changed-source\n');
 assert.throws(()=>inspectPipelineV10CoreSourceClosure(f.capture),/PIPELINE_INPUT_CHANGED/);f.capture.close();
 fs.writeFileSync(file,before);const restored=capture(root,replacements);t.after(restored.capture.close);
 assert.equal(inspectPipelineV10CoreSourceClosure(restored.capture).observed.length,3);assert.equal(inspectPipelineV10CoreSourceClosure(restored.capture).activationAllowed,false);
});

function sourceHelperTask(){
 const module={id:'api',blueprint:{modulePath:'modules/api',serveDockerfile:null,apiSpecFile:null},ownedPaths:['api.ts'],task:'Deliver api',dependsOn:[],requirements:[{id:'api-exists',statement:'api exists'}],test:{requiredChecks:[]}};
 const project={id:'source',repositoryRoot:'/source/repository',baseRevision:'a'.repeat(40),architecture:{ref:'architecture',requiredFiles:['architecture.md'],review:{agent:'architect',approval:{target:'operators',issuerId:'operator:test',timeoutMinutes:15}}},final:{integrationRequirements:[],test:{requiredChecks:[]}}};
 return {project,ordered:[module]};
}
test('WFINAL02 actual Source helper consumes captured explicit source timeout only and preserves original legacy graph',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const {settings}=coreCandidate(f),groups=settings.projectCompiler.executionGroups;
 const {project,ordered}=sourceHelperTask(),legacy=sourceStages(project,ordered),same=sourceStagesWithExecutionGroups(project,ordered,groups);
 assert.deepEqual(same,legacy);assert.deepEqual(same.stages.map(s=>s.id),['source-preflight','architecture-review','architecture-approval','blueprint-sync']);
 const selected=structuredClone(groups);selected.source.timeoutMs=240000;selected.cumulative.timeoutMs=1700000;selected.demo.timeoutMs=90000;
 const before=structuredClone(selected),changed=sourceStagesWithExecutionGroups(project,ordered,selected);
 assert.deepEqual(selected,before);assert.ok(changed.stages.every(s=>s.execution.timeoutMs===240000));
 const restored={...changed,stages:changed.stages.map(s=>({...s,execution:{...s.execution,timeoutMs:120000}}))};assert.deepEqual(restored,legacy);
 assert.deepEqual(sourceStages(project,ordered),legacy); // Existing compiler/recovery imports keep legacy policy.
 assert.equal(resolveCompilerExecutionGroups(selected).cumulative.timeoutMs,1700000);assert.equal(resolveCompilerExecutionGroups(selected).demo.timeoutMs,90000);
});
test('WFINAL02 rejects missing/foreign/inferred/unsafe helper policies before Source task parsing, restored selected groups succeed',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const original=coreCandidate(f).settings.projectCompiler.executionGroups;
 const bad=[undefined,{}, {timeoutMs:120000}, {...original,execution:{timeoutMs:120000}}];
 for(const group of ['source','cumulative','demo']){
  const missing=structuredClone(original);delete missing[group];bad.push(missing);
  for(const timeoutMs of [0,-1,1.5,'120000',2147483648,Number.NaN])bad.push({...original,[group]:{timeoutMs}});
 }
 for(const value of bad)assert.throws(()=>sourceStagesWithExecutionGroups(null as any,[],value),/PROJECT_EXECUTION_GROUPS_INVALID/);
 const {project,ordered}=sourceHelperTask();assert.ok(sourceStagesWithExecutionGroups(project,ordered,original).stages.every(s=>s.execution.timeoutMs===120000));
 const received=resolveCompilerExecutionGroups(original);assert.equal(Object.isFrozen(received.source),true);assert.equal(Object.isFrozen(original),false);
});
test('WFINAL02 separates cumulative/demo changes from Source helper and does not change historical identity encoding',()=>{
 const {project,ordered}=sourceHelperTask(),groups={source:{timeoutMs:120000},cumulative:{timeoutMs:1},demo:{timeoutMs:2147483647}};
 assert.deepEqual(sourceStagesWithExecutionGroups(project,ordered,groups,undefined,'legacy'),sourceStages(project,ordered,undefined,'legacy'));
 const changed=structuredClone(groups);changed.cumulative.timeoutMs=1800000;changed.demo.timeoutMs=60000;
 assert.deepEqual(sourceStagesWithExecutionGroups(project,ordered,changed),sourceStagesWithExecutionGroups(project,ordered,groups));
});

// Graph-shape fixture ONLY: never executed or presented as an installed/native
// provider receipt. Original resolved plan supplies the contract-valid envelope.
function demoGraphCandidate(original:any){
 const plan=structuredClone(original),template=plan.nodes[0];
 template.provider.packageId='kubeclaw.demo-auth-smoke';template.provider.contractId='kubeclaw.demo-auth-smoke@1';template.configuration.values.protocol='json-session.v1';
 const auth=template.id;
 for(const [id,packageId]of [['image','kubeclaw.container-build'],['manifest','kubeclaw.kubernetes-lint'],['deployment','kubeclaw.kubernetes-fixture'],['exposure','kubeclaw.tailscale-exposure']]){
  const node=structuredClone(template);node.id=id;node.executionId='execution:'+id;node.provider.packageId=packageId;node.configuration.values={retentionMode:'await-readiness'};
  node.testIdentity=stableTestIdentity({project:plan.project,moduleId:plan.scope.moduleId,gateId:plan.scope.gateId,suiteInstanceId:node.suiteInstanceId,nodeId:id,variation:node.variation});plan.nodes.push(node);
 }
 const link=(from:string,to:string,input:string,schemaId:string)=>({schemaVersion:'typed-link.v1',kind:'value',from:{nodeId:from,output:input},to:{nodeId:to,input},schemaId});
 plan.links=[link('deployment',auth,'deployment','kubeclaw.kubernetes-deployment-fixture@1'),link('deployment',auth,'credentials','kubeclaw.generated-demo-credentials@1'),link('exposure',auth,'exposure','kubeclaw.public-endpoint-fixture@1'),link('deployment','exposure','deployment','kubeclaw.kubernetes-deployment-fixture@1'),link('image','deployment','image','kubeclaw.container-image@1'),{schemaVersion:'typed-link.v1',kind:'artifact',from:{nodeId:'manifest',output:'checked-manifest'},to:{nodeId:'deployment',input:'checked-manifest'},mediaType:'application/vnd.kubeclaw.checked-kubernetes-yaml'}];
 const {planDigest,...unsigned}=plan;plan.planDigest=resolvedTestPlanDigest(unsigned);
 return {plan,demo:{authNodeId:auth,protocol:'json-session.v1',operatorTarget:'operators',retentionSeconds:604800}};
}
test('WFINAL02 Cumulative and Demo actual builders consume ONLY their explicit groups, historical graphs unchanged',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'helper-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const project={...fixture.project,final:{...fixture.project.final,review:{agent:'architect'}}};
 const groups={source:{timeoutMs:120000},cumulative:{timeoutMs:1800000},demo:{timeoutMs:120000}};
 const legacy=cumulativeStages(project,project.modules,'implement-ui');assert.deepEqual(cumulativeStagesWithExecutionGroups(project,project.modules,'implement-ui',groups),legacy);
 const selected=structuredClone(groups);selected.source.timeoutMs=90000;selected.cumulative.timeoutMs=600000;selected.demo.timeoutMs=240000;
 const changed=cumulativeStagesWithExecutionGroups(project,project.modules,'implement-ui',selected);
 assert.ok(changed.every(s=>s.execution.timeoutMs===600000));assert.deepEqual(changed.map(s=>({...s,execution:{...s.execution,timeoutMs:1800000}})),legacy);
 const graph=demoGraphCandidate(project.final.test.providerPlan.plan),oldDemo=demoStages(graph.demo,graph.plan);
 assert.deepEqual(demoStagesWithExecutionGroups(graph.demo,graph.plan,groups),oldDemo);
 const changedDemo=demoStagesWithExecutionGroups(graph.demo,graph.plan,selected);assert.deepEqual(changedDemo.map(s=>s.id),['demo-candidate','demo-delivery','demo-ready']);
 assert.ok(changedDemo.every(s=>s.execution.timeoutMs===240000));assert.deepEqual(changedDemo.map(s=>({...s,execution:{...s.execution,timeoutMs:120000}})),oldDemo);
 assert.deepEqual(cumulativeStages(project,project.modules,'implement-ui'),legacy);assert.deepEqual(demoStages(graph.demo,graph.plan),oldDemo);
 const badGraph=structuredClone(graph.plan);badGraph.nodes.find((n:any)=>n.id===graph.demo.authNodeId).mode='advisory';const {planDigest,...unsigned}=badGraph;badGraph.planDigest=resolvedTestPlanDigest(unsigned);
 assert.throws(()=>demoStagesWithExecutionGroups(graph.demo,badGraph,selected),/PROJECT_DEMO_BLOCKING_AUTH_REQUIRED/);
});
test('WFINAL02 Cumulative and Demo require all explicit groups before graph validation, even absent Demo branch',()=>{
 const groups={source:{timeoutMs:120000},cumulative:{timeoutMs:1800000},demo:{timeoutMs:120000}};
 for(const invalid of [undefined,{}, {cumulative:{timeoutMs:1800000}}, {...groups,demo:{timeoutMs:0}}]){
  assert.throws(()=>cumulativeStagesWithExecutionGroups(null as any,[],'x',invalid),/PROJECT_EXECUTION_GROUPS_INVALID/);
  assert.throws(()=>demoStagesWithExecutionGroups(undefined,undefined,invalid),/PROJECT_EXECUTION_GROUPS_INVALID/);
 }
 assert.deepEqual(demoStagesWithExecutionGroups(undefined,undefined,groups),[]);assert.deepEqual(demoStages(undefined,undefined),[]);
});

test('complete selected compiler policy matches EXACT approved schema and original derived execution for ALL4Core profiles',async t=>{
 const sourceSchema=fs.readFileSync(path.join(base,'runtime/batch-11-project-compiler/owned-compiler.schema.json'));
 assert.deepEqual(fs.readFileSync(path.join(repository,'skills/nova/project/compiler-policy.schema.json')),sourceSchema);
 const {pathToFileURL}=await import('node:url');const original=await import(pathToFileURL(path.join(base,'runtime/batch-11-project-compiler/projection-contract.mjs')).href);
 const f=capture(tree(t),replacements);t.after(f.capture.close);const owner=JSON.parse(f.capture.read('config/nova/core.config.json').toString());
 for(const profile of Object.values(owner.profiles)as any[]){
  const policy=profile.settings.projectCompiler,before=structuredClone(policy),result=resolveProjectCompilerPolicy(policy,true);
  assert.deepEqual(result.moduleExecution,original.projectCompilerExecution({schemaVersion:'project-compiler-policy-author.v1',projectCompiler:policy},true));
  assert.deepEqual(result.executionGroups,policy.executionGroups);assert.deepEqual(policy,before);assert.equal(Object.isFrozen(policy),false);
  assert.equal(Object.isFrozen(result.moduleExecution.repairBudget.categories),true);assert.equal(result.originalAuthorizationVerified,false);assert.equal(result.activationAllowed,false);
 }
});
test('compiler full policy rejects mixed review branch instead of silently inferring/unioning unused budgets',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const enabled=coreCandidate(f).settings.projectCompiler;
 const disabled=structuredClone(enabled);disabled.reviewRepair={mode:'disabled'};
 const without=resolveProjectCompilerPolicy(disabled,false);
 assert.deepEqual(without.moduleExecution.repairBudget.categories,{lint:2,test:2});assert.equal(without.moduleExecution.maxRemediationCycles,5);assert.equal(without.moduleExecution.maxAttempts,7);
 assert.throws(()=>resolveProjectCompilerPolicy(enabled,false),/REVIEW_BRANCH_MISMATCH/);assert.throws(()=>resolveProjectCompilerPolicy(disabled,true),/REVIEW_BRANCH_MISMATCH/);
 assert.throws(()=>resolveProjectCompilerPolicy({...disabled,reviewRepair:{mode:'disabled',maximumOrders:2}},false),/POLICY_INVALID/);
 assert.throws(()=>resolveProjectCompilerPolicy(enabled,undefined as any),/REVIEW_BRANCH_REQUIRED/);assert.equal(resolveProjectCompilerPolicy(enabled,true).moduleExecution.maxAttempts,9);
});
test('full compiler policy rejects old authors/missing groups/unsafe values, derives safe bounds and keeps module/helpers distinct',t=>{
 const f=capture(tree(t),replacements);t.after(f.capture.close);const policy=coreCandidate(f).settings.projectCompiler;
 const mutations=[(p:any)=>{p.maxConcurrency=2;},(p:any)=>{p.execution.maxAttempts=9;},(p:any)=>{p.execution.maxRemediationCycles=7;},(p:any)=>{p.repairBudget.categories.review=2;},(p:any)=>{p.repairBudget.maximumOrchestratorOrders=2;},(p:any)=>{p.execution.maxTechnicalRetries=101;},(p:any)=>{p.execution.timeoutMs=2147483648;},(p:any)=>{delete p.executionGroups.demo;},(p:any)=>{p.reviewRepair.maximumOrders=-1;}];
 for(const mutate of mutations){const bad=structuredClone(policy);mutate(bad);assert.throws(()=>resolveProjectCompilerPolicy(bad,true),/POLICY_INVALID/);assert.equal(resolveProjectCompilerPolicy(policy,true).activationAllowed,false);}
 const max=structuredClone(policy);max.repairBudget.categories={lint:100,test:100};max.reviewRepair.maximumOrders=100;max.repairBudget.maximumOrchestratorOrders=1;max.execution={maxTechnicalRetries:100,timeoutMs:2147483647};max.executionGroups={source:{timeoutMs:1},cumulative:{timeoutMs:2},demo:{timeoutMs:3}};
 const result=resolveProjectCompilerPolicy(max,true);assert.equal(result.moduleExecution.maxRemediationCycles,301);assert.equal(result.moduleExecution.maxAttempts,402);assert.equal(result.moduleExecution.timeoutMs,2147483647);assert.equal(result.executionGroups.source.timeoutMs,1);assert.equal(result.executionGroups.cumulative.timeoutMs,2);assert.equal(result.executionGroups.demo.timeoutMs,3);
});

function moduleContext(project:any,definition:any,previousGate:string):ModuleContext{
 return {projectId:project.id,runId:project.runId,repository:project.repositoryRoot,workspaces:project.workspaceRoot,baseline:project.baseRevision,previousGate,
 sourceBinding:definition.stages.find((s:any)=>s.id==='blueprint-sync').input.sourceBinding,reportArtifactEncoding:'kubeclaw-json.utf16.v1',reviewSemanticMode:'legacy'};
}
test('actual policy module builder preserves original task/source/coverage/repair categories across review branches and changes ONLY execution',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'module-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const f=capture(tree(t),replacements);t.after(f.capture.close);const selected=coreCandidate(f).settings.projectCompiler;
 for(const review of [false,true]){
  const project:any=structuredClone(fixture.project);for(const module of project.modules){if(review)module.review={agent:'architect'};else delete module.review;}
  const original=compileProject(project);assert.equal(original.definition.maxConcurrency,1);let previous='blueprint-sync';
  for(const module of project.modules){
   const context=moduleContext(project,original.definition,previous),policy=structuredClone(selected);if(!review)policy.reviewRepair={mode:'disabled'};
   const ids=new Set(['implement-','lint-','review-','test-'].map(p=>p+module.id)),old=original.definition.stages.filter(s=>ids.has(s.id)),before=structuredClone(module);
   const same=moduleStagesWithCompilerPolicy(module,context,policy);assert.deepEqual(same.stages,old);assert.equal(same.originalAuthorizationVerified,false);assert.equal(same.activationAllowed,false);
   const alternate=structuredClone(policy);alternate.repairBudget={categories:{lint:1,test:3},maximumOrchestratorOrders:0};alternate.execution={maxTechnicalRetries:2,timeoutMs:300000};if(review)alternate.reviewRepair.maximumOrders=4;
   const changed=moduleStagesWithCompilerPolicy(module,context,alternate);assert.ok(changed.stages.every(s=>s.execution.timeoutMs===300000));assert.ok(changed.stages.every(s=>s.execution.maxAttempts===(review?11:7)));
   const restored=changed.stages.map((s,i)=>({...s,execution:old[i]!.execution}));assert.deepEqual(restored,old);assert.deepEqual(module,before);
   assert.deepEqual(changed.stages[0]!.execution.repairBudget?.categories,review?{lint:1,review:4,test:3}:{lint:1,test:3});
   for(const stage of changed.stages.slice(1))assert.equal(Object.hasOwn(stage.execution,'repairBudget'),false);
   assert.deepEqual(compileProject(project),original);previous='test-'+module.id;
  }
 }
});
test('mixed-review module builder rejects wrong policy branch, old task author and foreign run plan without profile fallback',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'module-policy-mixed-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const project:any=structuredClone(fixture.project);project.modules[0]!.review={agent:'architect'};delete project.modules[1]!.review;
 const original=compileProject(project),f=capture(tree(t),replacements);t.after(f.capture.close);const enabled=coreCandidate(f).settings.projectCompiler,disabled=structuredClone(enabled);disabled.reviewRepair={mode:'disabled'};
 const first=project.modules[0]!,second=project.modules[1]!,firstContext=moduleContext(project,original.definition,'blueprint-sync'),secondContext=moduleContext(project,original.definition,'test-'+first.id);
 assert.throws(()=>moduleStagesWithCompilerPolicy(first,firstContext,disabled),/REVIEW_BRANCH_MISMATCH/);assert.throws(()=>moduleStagesWithCompilerPolicy(second,secondContext,enabled),/REVIEW_BRANCH_MISMATCH/);
 assert.throws(()=>moduleStagesWithCompilerPolicy({...first,execution:{timeoutMs:1800000}},firstContext,enabled),/PROJECT_OBJECT_INVALID:module/);
 assert.throws(()=>moduleStagesWithCompilerPolicy(first,{...firstContext,runId:'foreign-run'},enabled),/PROJECT_PLAN_SCOPE_MISMATCH/);
 assert.throws(()=>moduleStagesWithCompilerPolicy(first,firstContext,undefined),/POLICY_INVALID/);
 assert.equal(moduleStagesWithCompilerPolicy(first,firstContext,enabled).activationAllowed,false);assert.equal(moduleStagesWithCompilerPolicy(second,secondContext,disabled).activationAllowed,false);
 assert.deepEqual(compileProject(project),original);
});

test('whole-project explicit policy candidate reuses real original graph across uniform review branches/codecs and changes only execution',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const f=capture(tree(t),replacements);t.after(f.capture.close);const selected=coreCandidate(f).settings.projectCompiler;
 for(const review of [false,true])for(const legacy of [false,true]){
  const project:any=structuredClone(fixture.project);for(const module of project.modules){if(review)module.review={agent:'architect'};else delete module.review;}
  const policy=structuredClone(selected);if(!review)policy.reviewRepair={mode:'disabled'};
  const source=legacy?'legacy':'kubeclaw-json.utf16.v1',report=source,original=compileProject(project,source,report);
  const before=structuredClone(project),policyBefore=structuredClone(policy),candidate=compileProjectWithCompilerPolicyCandidate(project,policy,source,report);
  const {originalAuthorizationVerified,activationAllowed,membershipCandidate,...compiled}=candidate;assert.deepEqual(compiled,original);assert.equal(originalAuthorizationVerified,false);assert.equal(activationAllowed,false);assert.equal(candidate.definition.maxConcurrency,1);assert.ok(membershipCandidate);
  const alternate=structuredClone(policy);alternate.execution.timeoutMs=300000;alternate.executionGroups={source:{timeoutMs:240000},cumulative:{timeoutMs:600000},demo:{timeoutMs:90000}};
  const changed=compileProjectWithCompilerPolicyCandidate(project,alternate,source,report);
  for(const stage of changed.definition.stages){const timeout=stage.id.startsWith('final-')||stage.id==='project-summary'?600000:['source-preflight','architecture-review','architecture-approval','blueprint-sync'].includes(stage.id)?240000:300000;assert.equal(stage.execution.timeoutMs,timeout);}
  assert.deepEqual({...changed.definition,stages:changed.definition.stages.map((s,i)=>({...s,execution:original.definition.stages[i]!.execution}))},original.definition);
  assert.deepEqual(project,before);assert.deepEqual(policy,policyBefore);assert.deepEqual(compileProject(project,source,report),original);
 }
});
test('whole-project candidate retains dependency/ownership/task/plan checks and never defaults missing policy or unused helper groups',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-policy-checks-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const f=capture(tree(t),replacements);t.after(f.capture.close);const policy=structuredClone(coreCandidate(f).settings.projectCompiler);policy.reviewRepair={mode:'disabled'};
 const original=compileProject(fixture.project);
 const cases:[(p:any)=>void,RegExp][]=[
  [p=>{p.modules[0].dependsOn=['ui'];},/PROJECT_DEPENDENCY_CYCLE/],
  [p=>{p.modules[1].dependsOn=['foreign'];},/PROJECT_DEPENDENCY_UNKNOWN/],
  [p=>{p.modules[1].ownedPaths=p.modules[0].ownedPaths;},/PROJECT_OWNERSHIP_OVERLAP/],
  [p=>{p.modules[0].execution={timeoutMs:1800000};},/PROJECT_OBJECT_INVALID:module/],
  [p=>{p.workspaceRoot=p.repositoryRoot;},/PROJECT_WORKSPACES_INSIDE_REPOSITORY/]
 ];
 for(const [mutate,error]of cases){const bad:any=structuredClone(fixture.project);mutate(bad);assert.throws(()=>compileProjectWithCompilerPolicyCandidate(bad,policy),error);assert.throws(()=>compileProject(bad),error);}
 assert.throws(()=>compileProjectWithCompilerPolicyCandidate(fixture.project,undefined),/POLICY_INVALID/);
 const missing=structuredClone(policy);delete missing.executionGroups.demo;assert.throws(()=>compileProjectWithCompilerPolicyCandidate(fixture.project,missing),/POLICY_INVALID/);
 assert.deepEqual(compileProject(fixture.project),original);assert.equal(compileProjectWithCompilerPolicyCandidate(fixture.project,policy).activationAllowed,false);
});
test('mixed review project remains historical-supported but explicit single-policy candidate rejects both incompatible modes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-policy-mixed-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const project:any=structuredClone(fixture.project);project.modules[0].review={agent:'architect'};delete project.modules[1].review;
 const before=structuredClone(project),old=compileProject(project),f=capture(tree(t),replacements);t.after(f.capture.close);const enabled=coreCandidate(f).settings.projectCompiler,disabled=structuredClone(enabled);disabled.reviewRepair={mode:'disabled'};
 assert.throws(()=>compileProjectWithCompilerPolicyCandidate(project,enabled),/REVIEW_BRANCH_MISMATCH/);assert.throws(()=>compileProjectWithCompilerPolicyCandidate(project,disabled),/REVIEW_BRANCH_MISMATCH/);
 assert.throws(()=>compileProjectWithCompilerPolicyCandidate(project,{api:enabled,ui:disabled}),/POLICY_INVALID/);
 assert.deepEqual(project,before);assert.deepEqual(compileProject(project),old);
});

test('captured Core project candidate consumes ONLY exact selected policy from SAME448 across ALL4profiles/codecs',async t=>{
 const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'captured-project-'));t.after(()=>fs.rmSync(fixtureRoot,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(fixtureRoot,{review:true,clean:false});t.after(()=>fixture.close());
 const task:any=structuredClone(fixture.project);for(const module of task.modules)module.review={agent:'architect'};
 const root=tree(t),owner=read(path.join(root,'config/nova/core.config.json')),before=structuredClone(task);
 for(const profileId of Object.keys(owner.profiles)){
  const document=JSON.parse(rootBytes.toString());document.novaCoreSelection.profileId=profileId;
  const bytes=Buffer.from(JSON.stringify(document));fs.writeFileSync(path.join(root,'config/pipeline.config.json'),bytes);
  const f=capture(root,[row('config/pipeline.config.json',bytes),replacements[1]!]);
  try{for(const encoding of ['legacy','kubeclaw-json.utf16.v1']as const){
   const candidate=inspectCapturedCoreProjectCandidate(task,f.capture,encoding,encoding);
   const expected=compileProjectWithCompilerPolicyCandidate(task,owner.profiles[profileId].settings.projectCompiler,encoding,encoding);
   assert.deepEqual(candidate.definition,expected.definition);assert.equal(candidate.runId,task.runId);assert.deepEqual(candidate.selectedCore.selection,document.novaCoreSelection);assert.deepEqual(candidate.selectedCore.settings,owner.profiles[profileId].settings);
   assert.equal(candidate.coreInspection.rootRawSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(candidate.coreInspection.inputGenerationSha256,f.capture.inputGenerationSha256);
   assert.equal(candidate.coreInspection.sourceInspection.declaredMemberCount,449);assert.equal(candidate.coreInspection.sourceInspection.missing.length,7);
   for(const key of ['originalAuthorizationVerified','activationAllowed','sourceClosureVerified','profileDigestVerified','canonicalAuthorPathVerified','taskAuthorizationVerified','originalRunAuthorizationVerified','callerAuthorizationVerified','c3AuthorizationVerified']as const)assert.equal(candidate[key],false);
  }}finally{f.capture.close();}
 }
 assert.deepEqual(task,before);
});
test('captured Core project never accepts task policy overrides or bypasses mixed-review contract gap; original compiler unchanged',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'captured-project-denials-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const f=capture(tree(t),replacements);t.after(f.capture.close);const task:any=structuredClone(fixture.project);for(const module of task.modules)module.review={agent:'architect'};
 const original=compileProject(task);assert.equal(inspectCapturedCoreProjectCandidate(task,f.capture).activationAllowed,false);
 assert.throws(()=>inspectCapturedCoreProjectCandidate({...task,projectCompiler:coreCandidate(f).settings.projectCompiler},f.capture),/PROJECT_OBJECT_INVALID:project/);
 delete task.modules[1].review;const mixed=compileProject(task);assert.throws(()=>inspectCapturedCoreProjectCandidate(task,f.capture),/REVIEW_BRANCH_MISMATCH/);assert.deepEqual(compileProject(task),mixed);
 task.modules[1].review={agent:'architect'};assert.deepEqual(compileProject(task),original);assert.equal(inspectCapturedCoreProjectCandidate(task,f.capture).activationAllowed,false);
});
test('captured project candidate rejects changed physical Core owner despite equal policy, restore succeeds',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'captured-project-change-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const task:any=structuredClone(fixture.project);for(const module of task.modules)module.review={agent:'architect'};
 const generation=tree(t),f=capture(generation,replacements),file=path.join(generation,'config/nova/core.config.json'),before=fs.readFileSync(file);
 fs.appendFileSync(file,' ');assert.throws(()=>inspectCapturedCoreProjectCandidate(task,f.capture),/PIPELINE_INPUT_CHANGED/);f.capture.close();
 fs.writeFileSync(file,before);const restored=capture(generation,replacements);t.after(restored.capture.close);
 assert.equal(inspectCapturedCoreProjectCandidate(task,restored.capture).activationAllowed,false);
});

test('Core settings snapshot retains all three selected raw members deeply immutable, no path resolution or activation',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'core-settings-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const task:any=structuredClone(fixture.project);for(const module of task.modules)module.review={agent:'architect'};
 const f=capture(tree(t),replacements);t.after(f.capture.close);const ownerRaw=f.capture.read('config/nova/core.config.json'),{selection,settings}=coreCandidate(f);
 const result=inspectCapturedCoreProjectCandidate(task,f.capture);assert.deepEqual(result.selectedCore,{selection,settings});
 assert.ok(result.selectedCore.settings.platform.installationRoots.some((p:string)=>p.startsWith('../')));
 for(const inspection of [result.platformInspection,result.runtimeLocksInspection])for(const key of ['rootRawSha256','inputGenerationSha256','ownerRawSha256','ownerSchemaRawSha256']as const)assert.equal(inspection[key],result.coreInspection[key]);
 for(const member of [result.selectedCore,result.selectedCore.selection,result.selectedCore.settings.platform,result.selectedCore.settings.platform.installationRoots,result.selectedCore.settings.platform.grants,result.selectedCore.settings.projectCompiler.executionGroups.source,result.selectedCore.settings.runtimeLocks])assert.equal(Object.isFrozen(member),true);
 assert.throws(()=>{result.selectedCore.settings.platform.installationRoots.push('foreign');},TypeError);
 assert.throws(()=>{result.selectedCore.settings.runtimeLocks.runMutationLockTtlMs=1;},TypeError);
 assert.throws(()=>{result.selectedCore.selection.profileId='local-B-lock';},TypeError);
 assert.deepEqual(f.capture.read('config/nova/core.config.json'),ownerRaw);f.capture.assertCurrent();
 assert.equal(Object.hasOwn(result.selectedCore,'schemaVersion'),false);assert.equal(Object.hasOwn(result.selectedCore,'receipt'),false);assert.equal(result.originalRunAuthorizationVerified,false);assert.equal(result.activationAllowed,false);
});
test('physical Core mutation DURING multi-member inspection aborts complete snapshot instead of mixing values, restore succeeds',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'core-settings-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {projectSourceFixture}=await import('./project-source-fixture.mjs');const fixture=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>fixture.close());
 const task:any=structuredClone(fixture.project);for(const module of task.modules)module.review={agent:'architect'};
 const generation=tree(t),f=capture(generation,replacements),file=path.join(generation,'config/nova/core.config.json'),before=fs.readFileSync(file);let changed=false;
 // Negative fault injection delegates EVERY byte read to the genuine capture;
 // it changes the actual named file mid-inspection, never fabricates authority.
 const racing={...f.capture,read:(name:string)=>{const bytes=f.capture.read(name);if(!changed&&name==='schemas/nova-core-owner.schema.json'){changed=true;fs.appendFileSync(file,' ');}return bytes;}};
 assert.throws(()=>inspectCapturedCoreProjectCandidate(task,racing),/PIPELINE_INPUT_CHANGED/);assert.equal(changed,true);f.capture.close();
 fs.writeFileSync(file,before);const restored=capture(generation,replacements);t.after(restored.capture.close);
 assert.deepEqual(inspectCapturedCoreProjectCandidate(task,restored.capture).selectedCore.settings,coreCandidate(restored).settings);
 assert.equal(inspectCapturedCoreProjectCandidate(task,restored.capture).activationAllowed,false);
});

test('Quality same-file-set policies reach real registry resolver frozen; old v1 task digest/profile substitutions reject',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const sourceRoot=path.join(root,'source-current/skills/buster/plugins');
 const registry=buildRegistry(discoverPackages({installationRoots:[sourceRoot],trustPolicy:{trustedBuiltinRoots:[sourceRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'quality-original-generation'}}));
 for(const value of providerCandidates(f).filter((v:any)=>['kubeclaw.size-budget@1','kubeclaw.coverage-budget@1'].includes(v.contractId))){
  const run=(v:any)=>inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(v)),registry,f.capture);
  const result=run(value);assert.equal(result.activationAllowed,false);assert.equal(result.registrySourceCoherent,true);
  assert.equal(result.profileDigestVerified,true);assert.equal(result.configuration.schemaVersion,'provider-configuration.v2');assert.ok(Object.isFrozen((result.configuration as any).selectedPolicy.processing));
  for(const key of ['profileDigest','packageContentDigest','taskSchemaDigest']){
   const bad=structuredClone(value);bad.selectedPolicy.binding[key]='sha256:'+'0'.repeat(64);assert.throws(()=>run(bad));
  }
  const taskOverride=structuredClone(value);taskOverride.values={combine:true};assert.throws(()=>run(taskOverride));
  const entry=registry.testProviderContracts.get(value.contractId)!;
  const altered={...registry,testProviderContracts:new Map(registry.testProviderContracts)};
  altered.testProviderContracts.set(value.contractId,{...entry,provenance:{...entry.provenance,registrationId:'wrong-original'}});
  assert.throws(()=>inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(value)),altered,f.capture),/QUALITY_REGISTRY_PROVENANCE/);
  assert.deepEqual(run(value).configuration,result.configuration);
 }
});

test('Quality rejects invalid unselected original profiles without accepting a partial author',t=>{
 for(const packageId of ['kubeclaw.coverage-budget','kubeclaw.size-budget']){
  const root=tree(t),source=read(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-plugin-schemas.json')).packages[packageId];
  const name=`config/${source.ownerPath}`,file=path.join(root,name),original=fs.readFileSync(file),owner=JSON.parse(original.toString());
  // Preserve selected A, break only a distinct unselected B profile.
  assert.ok(owner.profiles.B);owner.profiles.B.declarations.evidenceDefaults.onError=[];
  const changed=Buffer.from(JSON.stringify(owner));fs.writeFileSync(file,changed);
  const members=compose(replacements).members.map(m=>m.relativePath===name?row(name,changed):m);
  const input=capturePipelineInputSet(root,members);t.after(input.close);
  // Deliberately re-described local source unit, NOT an approved composition or grant.
  const value=providerCandidates({capture:input} as any).find((v:any)=>v.selectedPolicy.binding.packageId===packageId);
  value.selectedPolicy.binding.ownerDigest='sha256:'+createHash('sha256').update(changed).digest('hex');
  const sourceRoot=path.join(root,'source-current/skills/buster/plugins');
  const registry=buildRegistry(discoverPackages({installationRoots:[sourceRoot],trustPolicy:{trustedBuiltinRoots:[sourceRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'quality-negative-unit'}}));
  assert.throws(()=>inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(value)),registry,input),/evidenceDefaults\/onError must contain at least 1/);
  input.close();fs.writeFileSync(file,original);
  const restored=capture(root,replacements);restored.capture.assertCurrent();restored.capture.close();
 }
});

// Full physical generation -> original registry -> actual Nova plan; still no
// installed caller/issuer/native admission. Never use task values as policies.
test('Quality complete physical A/B generation reaches Nova plan and retained A without current B refill',t=>{
 const root=tree(t),file=path.join(root,'config/pipeline.config.json');
 const suitesPath=path.join(repository,'contracts/pipeline-test-gate/v1/suites');
 const suites=fs.readdirSync(suitesPath).filter(n=>n.endsWith('.json')).map(n=>read(path.join(suitesPath,n)));
 const limits={cpuMillis:900000,memoryBytes:4294967296,logBytes:16777216,artifactBytes:268435456,artifactFiles:256,processes:64};
 // The complete captured generation does not contain the task's unchanged
 // direct-command/JUnit helper packages. Supply genuine package fixtures in a
 // distinct registry root; do not pretend these are captured generation bytes.
 const helpers=path.join(root,'task-helper-packages');fs.mkdirSync(helpers);
 for(const name of ['direct-command','junit-report-adapter'])fs.cpSync(path.join(repository,'skills/buster/plugins',name),path.join(helpers,name),{recursive:true});
 const retained=new Map<string,unknown>();
 for(const profileId of ['A','B']){
  const document=JSON.parse(rootBytes.toString());
  for(const selection of document.pluginSelections)if(['kubeclaw.size-budget','kubeclaw.coverage-budget'].includes(selection.packageId))selection.profileId=profileId;
  const bytes=Buffer.from(JSON.stringify(document,null,2)+'\n');fs.writeFileSync(file,bytes);
  const f=capture(root,[row('config/pipeline.config.json',bytes),replacements[1]!]);
  try{
   const sourceRoot=path.join(root,'source-current/skills/buster/plugins');
   const registry=buildRegistry(discoverPackages({installationRoots:[sourceRoot,helpers],trustPolicy:{trustedBuiltinRoots:[sourceRoot,helpers],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'quality-physical-generation-plan'}}));
   const qualityTuples=document.pluginSelections.filter((tuple:any)=>['kubeclaw.size-budget','kubeclaw.coverage-budget'].includes(tuple.packageId));
   const services=[...new Set(qualityTuples.map((tuple:any)=>tuple.serviceInstanceId))] as string[];
   assert.equal(services.length,1);
   const selected=inspectPipelineV10QualityServiceSelection(services[0]!,registry,f.capture);
   assert.equal(selected.activationAllowed,false);assert.equal(selected.selectedProviderPolicies.size,2);
   assert.equal(Object.hasOwn(selected.selectedProviderPolicies,'set'),false);
   assert.throws(()=>inspectPipelineV10QualityServiceSelection('wrong-service',registry,f.capture),/QUALITY_SERVICE_SELECTIONS/);
   for(const [contractId,policy] of selected.selectedProviderPolicies){assert.ok(Object.isFrozen(policy.processing));assert.equal(policy.binding.profileId,profileId);}
   selected.selectedProviderPolicies.forEach((policy,key,map)=>{assert.equal(map,selected.selectedProviderPolicies);assert.equal(map.get(key),policy);assert.equal(Object.hasOwn(map,'clear'),false);});
   for(const value of providerCandidates(f).filter((v:any)=>['kubeclaw.size-budget@1','kubeclaw.coverage-budget@1'].includes(v.contractId))){
    const inspected=inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(value)),registry,f.capture);
    assert.equal(inspected.activationAllowed,false);
    const configuration=inspected.configuration;
    assert.equal(configuration.schemaVersion,'provider-configuration.v2');
    if(configuration.schemaVersion!=='provider-configuration.v2')throw new Error('QUALITY_V2_REQUIRED');
    const coverage=value.contractId==='kubeclaw.coverage-budget@1';
    const declaration=read(path.join(repository,'contracts/pipeline-test-gate/v1/examples',coverage?'unit-suite-with-coverage.json':'size-budget-tar.json'));
    const taskNode=coverage?declaration.suites.unit.add.coverage:declaration.suites['size-budget'].add['web-assets'];taskNode.config={};taskNode.mode='blocking';
    const resolve=()=>resolveTestPlan({planId:'plan:physical-quality',runId:'run:physical-quality',project:'quality',scope:{moduleId:'module',gateId:null},createdAt:'2026-10-16T18:00:00Z',declaration,suiteTemplates:suites,registry,facts:{changedPaths:[],moduleType:null,pipelineStage:null},selectedProviderPolicies:selected.selectedProviderPolicies,policy:{defaultTimeoutMs:30000,maximumTimeoutMs:900000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:3,maximumMatrixSize:16,maximumNodes:100,defaultConcurrencyLimit:4,maximumConcurrencyLimits:{unit:8,'size-budget':8}}});
    const plan=resolve(),node=plan.nodes.find(n=>n.provider.contractId===value.contractId)!;
    assert.deepEqual(node.configuration,configuration);assert.deepEqual(node.evidence,configuration.selectedPolicy.declarations.evidenceDefaults);
    assert.equal(configuration.selectedPolicy.binding.profileId,profileId);
    if(profileId==='A')retained.set(value.contractId,JSON.parse(JSON.stringify(plan)));
    else{
     const original=retained.get(value.contractId) as typeof plan;validatePipelineTestGateContract('resolvedTestPlan',original);
     const old=original.nodes.find(n=>n.provider.contractId===value.contractId)!;
     assert.notDeepEqual(old.configuration,node.configuration);
     assert.equal((old.configuration as typeof configuration).selectedPolicy.binding.profileId,'A');
    }
    const [key,selectedValue]=Object.entries(configuration.selectedPolicy.processing)[0]!;taskNode.config={[key]:selectedValue};
    assert.throws(resolve,/TEST_PLAN_CONFIGURATION_INVALID/);
    assert.throws(()=>inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(value)),{...registry,apiVersion:'wrong'} as any,f.capture),/QUALITY_REGISTRY_API_VERSION/);
    const entry=registry.testProviderContracts.get(value.contractId)!;
    const changed={...entry,provenance:{...entry.provenance,schemaVersion:'registration-provenance.v1'}};
    assert.throws(()=>inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(value)),{...registry,testProviderContracts:new Map([...registry.testProviderContracts].map(([id,e])=>[id,id===value.contractId?changed:e]))} as any,f.capture),/QUALITY_REGISTRY_PROVENANCE/);
   }
  }finally{f.capture.close();}
 }
 assert.equal(retained.size,2);
});


test('Quality complete service receiving rejects missing, duplicate and split-service tuples before returning policies',t=>{
 for(const change of ['missing','duplicate','split']){
  const root=tree(t),file=path.join(root,'config/pipeline.config.json'),document=JSON.parse(rootBytes.toString());
  const index=document.pluginSelections.findIndex((tuple:any)=>tuple.packageId==='kubeclaw.size-budget');
  const service=document.pluginSelections[index].serviceInstanceId;
  if(change==='missing')document.pluginSelections.splice(index,1);
  if(change==='duplicate')document.pluginSelections.push(structuredClone(document.pluginSelections[index]));
  if(change==='split')document.pluginSelections[index].serviceInstanceId='foreign-service';
  const bytes=Buffer.from(JSON.stringify(document));fs.writeFileSync(file,bytes);
  const f=capture(root,[row('config/pipeline.config.json',bytes),replacements[1]!]);t.after(f.capture.close);
  // This malformed local raw capture has no admitted root/issuer authority.
  assert.throws(()=>inspectPipelineV10QualityServiceSelection(service,{} as any,f.capture),/QUALITY_SERVICE_SELECTIONS/);
 }
});

test('Quality service map requires both real registry packages and exact retained C3 reference bytes; no partial map escapes',t=>{
 const root=tree(t),f=capture(root,replacements);t.after(f.capture.close);
 const sourceRoot=path.join(root,'source-current/skills/buster/plugins');
 const registry=buildRegistry(discoverPackages({installationRoots:[sourceRoot],trustPolicy:{trustedBuiltinRoots:[sourceRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'quality-service-receiving'}}));
 const document=JSON.parse(rootBytes.toString()),service=document.pluginSelections.find((tuple:any)=>tuple.packageId==='kubeclaw.size-budget').serviceInstanceId;
 const complete=inspectPipelineV10QualityServiceSelection(service,registry,f.capture);
 const withoutCoverage={...registry,testProviderContracts:new Map([...registry.testProviderContracts].filter(([id])=>id!=='kubeclaw.coverage-budget@1'))};
 assert.throws(()=>inspectPipelineV10QualityServiceSelection(service,withoutCoverage,f.capture),/QUALITY_REGISTRY_MANIFEST/);
 const relative='schemas/provider03/c3-registry-peer-reference-contract.json',file=path.join(root,relative),before=fs.readFileSync(file);
 for(const policy of complete.selectedProviderPolicies.values())assert.equal(policy.binding.c3ReferenceContractDigest,'sha256:'+createHash('sha256').update(before).digest('hex'));
 let changed=false;
 const racing={...f.capture,read:(name:string)=>{const bytes=f.capture.read(name);if(!changed&&name===relative){changed=true;fs.appendFileSync(file,' ');}return bytes;}};
 assert.throws(()=>inspectPipelineV10QualityServiceSelection(service,registry,racing),/PIPELINE_INPUT_CHANGED/);assert.equal(changed,true);
 // Already returned original snapshots stay immutable but acquire NO grant.
 assert.equal(complete.activationAllowed,false);assert.equal(complete.selectedProviderPolicies.size,2);
 f.capture.close();fs.writeFileSync(file,before);const restored=capture(root,replacements);t.after(restored.capture.close);
 assert.deepEqual([...inspectPipelineV10QualityServiceSelection(service,registry,restored.capture).selectedProviderPolicies],[...complete.selectedProviderPolicies]);
});

test('Buster runtime v2 derives its service policy from original complete input selection, never current B', t => {
  const directory = tree(t), retained = capture(directory, replacements); t.after(retained.capture.close);
  const root = JSON.parse(rootBytes.toString()), binding = root.bindings.find((b: any) => b.owner === 'buster-engine' && b.instanceId === 'fixture.service.buster-runtime');
  const selection = { role: 'buster', callerId: 'buster-runtime', serviceInstanceId: binding.instanceId };
  const owner = JSON.parse(retained.capture.read('config/components/buster-engine.config.json').toString());
  const policy = owner.profiles[binding.profileId].settings.remotePlanService;
  const providers = owner.profiles[binding.profileId].settings.execution.capabilityProviders;
  const sources = Object.fromEntries(['directCommand', 'containerBuild', 'networkHttp', 'browserAxe',
    'browserLighthouse', 'browserVisual', 'browserPlaywright', 'securityScan'].map(field => [field,
      { ...structuredClone(providers[field]), ...(field.startsWith('browser') ? { allowedOrigins: structuredClone(providers.browserAccess.allowedOrigins) } : {}) }]));
  const chart = JSON.parse(retained.capture.read('charts/kubeclaw/values.yaml').toString());
  const deployment = root.deploymentSelections.find((d: any) => d.consumer === 'namespace-controller' && d.busterComponentInstanceId === binding.instanceId);
  const namespace = chart.profiles[deployment.profileId].readonlyBindings.releaseNamespace;
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v2', ...structuredClone(policy), ...sources,
    clusterBindings: { controllerNamespace: namespace } };
  const output = Buffer.from(JSON.stringify(runtime));
  const run = (value = output) => inspectPipelineV10BusterRuntimeSourceIdentity(selection, value, retained.capture);
  const result = run();
  // One captured caller tuple must own BOTH policy and deployment source joins.
  // Reading the captured generation may invoke an upstream reader; subsequent
  // mutation of the supplied tuple must not retarget the namespace selection.
  const movingSelection = { ...selection };
  const capturedCaller = inspectPipelineV10BusterRuntimeSourceIdentity(movingSelection, output, {
    inputGenerationSha256: retained.capture.inputGenerationSha256,
    assertCurrent: retained.capture.assertCurrent,
    read(name: string) {
      movingSelection.serviceInstanceId = 'foreign-service-after-capture';
      return retained.capture.read(name);
    },
  });
  assert.equal(movingSelection.serviceInstanceId, 'foreign-service-after-capture');
  assert.equal(capturedCaller.serviceInstanceId, binding.instanceId);
  assert.equal(capturedCaller.callerId, 'buster-runtime');
  assert.deepEqual(capturedCaller, result);
  assert.equal(Object.isFrozen(capturedCaller), true);
  for (const clusterBindings of [undefined, null, {}, { controllerNamespace: 'other-original' },
    { controllerNamespace: namespace, extra: true }]) {
    assert.throws(() => run(Buffer.from(JSON.stringify({ ...runtime, clusterBindings }))), /BUSTER_CLUSTER_NAMESPACE_SOURCE/);
  }
  const fromRoot = (changed: any) => inspectPipelineV10BusterRuntimeSourceIdentity(selection, output, {
    inputGenerationSha256: retained.capture.inputGenerationSha256, assertCurrent: retained.capture.assertCurrent,
    read(name: string) { return name === 'config/pipeline.config.json' ? Buffer.from(JSON.stringify(changed)) : retained.capture.read(name); },
  });
  const noDeployment = structuredClone(root);
  noDeployment.deploymentSelections = noDeployment.deploymentSelections.filter((d: any) => d !== undefined && d.consumer !== 'namespace-controller');
  assert.throws(() => fromRoot(noDeployment), /BUSTER_CLUSTER_DEPLOYMENT_REQUIRED/);
  const foreignDeployment = structuredClone(root);
  foreignDeployment.deploymentSelections.find((d: any) => d.consumer === 'namespace-controller').busterComponentInstanceId = 'other-service';
  assert.throws(() => fromRoot(foreignDeployment), /BUSTER_CLUSTER_DEPLOYMENT_REQUIRED/);
  const ambiguousDeployment = structuredClone(root);
  ambiguousDeployment.deploymentSelections.push({ ...structuredClone(deployment),
    deploymentInstanceId: 'second-deployment', serviceInstanceId: 'second-controller' });
  assert.throws(() => fromRoot(ambiguousDeployment), /BUSTER_CLUSTER_DEPLOYMENT_REQUIRED/);
  assert.deepEqual(result.policy, policy); assert.equal(result.profileId, binding.profileId);
  assert.equal(result.activationAllowed, false); assert.equal(result.originalAuthorizationVerified, false);
  assert.equal(result.inputGenerationSha256, retained.capture.inputGenerationSha256);
  const workerBinding = root.bindings.find((b: any) => b.owner === 'worker-core' && b.role === 'buster' && b.instanceId === selection.serviceInstanceId);
  const workerBytes = retained.capture.read('config/components/worker-core.config.json');
  assert.ok(result.worker);
  assert.equal(result.worker.profileId, workerBinding.profileId);
  assert.equal(result.worker.ownerRawSha256, createHash('sha256').update(workerBytes).digest('hex'));
  assert.deepEqual(result.worker.capture.settings, JSON.parse(workerBytes.toString()).profiles[workerBinding.profileId].settings);
  assert.equal(Object.isFrozen(result.worker.capture.settings.runtime.retain_logs), true);
  const preparationWorker = inspectPipelineV10BusterServiceSelection({ ...selection, callerId: 'buster-preparation' }, retained.capture).worker;
  assert.deepEqual(preparationWorker, result.worker, 'versioned preparation consumes the same selected WorkerCore policy');

  const selectedCluster = owner.profiles[binding.profileId].settings.clusterInvokers;
  assert.ok(result.clusterInvokers);
  assert.deepEqual(result.clusterInvokers, selectedCluster,
    'complete original cluster policy, not a namespace-only generated binding');
  const assertDeepFrozen = (value: unknown): void => {
    if (value && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) assertDeepFrozen(child);
    }
  };
  assertDeepFrozen(result.clusterInvokers);
  assert.deepEqual(validateBusterClusterInvokerSettings(result.clusterInvokers), selectedCluster,
    'complete original policy reaches native decoder without dropping secret-entry obligation');
  assert.equal(inspectPipelineV10BusterServiceSelection({ ...selection, callerId: 'buster-preparation' }, retained.capture).clusterInvokers, null,
    'preparation never gains runtime cluster authority');
  assert.equal(Object.hasOwn(runtime, 'clusterInvokers'), false,
    'owner policy is not a new v2 generated field');

  assert.equal(Object.isFrozen(result.policy.recordLimits), true);
  assert.equal(Object.isFrozen(result.providerPolicies.browserAxe?.allowedOrigins), true);
  // Exercise every original active public field, not just a representative cap.
  for (const [field, source] of Object.entries(sources)) {
    const absent: any = structuredClone(runtime); delete absent[field];
    assert.throws(() => run(Buffer.from(JSON.stringify(absent))), /BUSTER_PROVIDER_REQUIRED/);
    for (const key of Object.keys(source)) {
      const missing: any = structuredClone(runtime); delete missing[field][key];
      assert.throws(() => run(Buffer.from(JSON.stringify(missing))), /BUSTER_PROVIDER_POLICY/);
      const changed: any = structuredClone(runtime); changed[field][key] = null;
      assert.throws(() => run(Buffer.from(JSON.stringify(changed))), /BUSTER_PROVIDER_POLICY/);
    }
  }
  const extraNative: any = structuredClone(runtime);
  extraNative.directCommand.cgroupRoot = '/unverified-native';
  assert.equal(run(Buffer.from(JSON.stringify(extraNative))).activationAllowed, false,
    'extra native locator never becomes authorization');
  assert.throws(() => run(Buffer.from(JSON.stringify({ ...runtime, port: policy.port === 0 ? 1 : 0 }))), /SELECTED_SERVICE_POLICY_MISMATCH/);
  for (const name of Object.keys(policy)) {
    const absent: any = structuredClone(runtime); delete absent[name];
    assert.throws(() => run(Buffer.from(JSON.stringify(absent))), /SERVICE_POLICY_INVALID/);
  }
  assert.throws(() => inspectPipelineV10BusterServiceSelection({ ...selection, serviceInstanceId: 'not-original' }, retained.capture), /EXACT_BUSTER_TUPLE/);
  assert.throws(() => inspectPipelineV10BusterServiceSelection({ ...selection, callerId: 'prism-control' }, retained.capture), /BUSTER_SERVICE_SELECTION/);
  assert.throws(() => inspectPipelineV10BusterServiceSelection({ ...selection, profileId: binding.profileId }, retained.capture), /BUSTER_SERVICE_SELECTION/);
  assert.throws(() => inspectPipelineV10BusterRuntimeSourceIdentity({ ...selection, callerId: 'buster-preparation' }, output, retained.capture), /BUSTER_RUNTIME_CALLER/);
  // The selected v2 path must preserve the actual production receiver's
  // retired-author boundary, even when an extra value equals its owner.
  for (const [field, value] of Object.entries({
    kubernetesFixture: false, tailscaleExposure: false, kubernetesRuntimeSecurity: false,
    dependencyReadiness: owner.profiles[binding.profileId].settings.dependencyReadiness,
    maximumArchiveBytes: 1, maximumExtractedBytes: 1, maximumRequestBytes: 1,
    maximumActiveJobs: 1, maximumQueuedJobs: 1, maximumConcurrentAttempts: 1,
  })) {
    assert.throws(() => run(Buffer.from(JSON.stringify({ ...runtime, [field]: value }))),
      /SWARM_CONFIG_LEGACY_OVERRIDE/, `v2 cannot restore retired author ${field}`);
  }
  assert.deepEqual(run(), result, 'restored original output');
  const file = path.join(directory, 'config/components/buster-engine.config.json'), original = fs.readFileSync(file);
  fs.appendFileSync(file, ' '); assert.throws(() => run(), /INPUT_CHANGED/);
  retained.capture.close(); fs.writeFileSync(file, original);
  const restored = capture(directory, replacements); t.after(restored.capture.close);
  assert.deepEqual(inspectPipelineV10BusterRuntimeSourceIdentity(selection, output, restored.capture), result);
});

test('Buster selection validates unselected policies and exact same-instance Worker peer before service receiving', t => {
  const directory = tree(t), originalRoot = JSON.parse(rootBytes.toString());
  const binding = originalRoot.bindings.find((b: any) => b.owner === 'buster-engine' && b.instanceId === 'fixture.service.buster-runtime');
  const selection = { role: 'buster', callerId: 'buster-runtime', serviceInstanceId: binding.instanceId };
  const supplied = new Map<string, Buffer>();
  for (const [name, relative] of Object.entries(originalRoot.components)) supplied.set(`config/${relative}`, fs.readFileSync(path.join(directory, 'config', relative as string)));
  const inspect = (root: any, callerId = selection.callerId) => inspectPipelineV10BusterServiceSelection({ ...selection, callerId }, {
    inputGenerationSha256: 'a'.repeat(64), assertCurrent() {}, read(name: string) {
      if (name === 'config/pipeline.config.json') return Buffer.from(JSON.stringify(root));
      const value = supplied.get(name); assert.ok(value, name); return Buffer.from(value);
    },
  });
  const ownerPath = 'config/components/buster-engine.config.json', bytes = supplied.get(ownerPath)!;
  const owner = JSON.parse(bytes.toString());
  const unselected = Object.keys(owner.profiles).find(name => name !== binding.profileId)!;
  delete owner.profiles[unselected].settings.remotePlanService;
  supplied.set(ownerPath, Buffer.from(JSON.stringify(owner)));
  assert.throws(() => inspect(originalRoot), /OWNER_INVALID/);
  supplied.set(ownerPath, bytes);
  const selectedSettings = JSON.parse(bytes.toString()).profiles[binding.profileId].settings;
  for (const caller of ['buster-runtime', 'buster-preparation']) {
    const selected = inspect(originalRoot, caller);
    assert.deepEqual(selected.preparation, selectedSettings.preparation,
      'complete v10 preparation includes all seven explicitly authored policy leaves');
    assert.equal(Object.isFrozen(selected.preparation), true);
    assert.equal(Object.isFrozen(selected.preparation.resourcePolicy), true);
    assert.deepEqual(selected.admission, selectedSettings.admission);
    assert.deepEqual(selected.dependencyReadiness, selectedSettings.dependencyReadiness);
    assert.equal(Object.isFrozen(selected.admission), true);
    assert.equal(Object.isFrozen(selected.dependencyReadiness), true);
    assert.equal(selected.activationAllowed, false);
    const profile = preparationProfile(`sha256:${'a'.repeat(64)}`, 'v10');
    const issued = new Date('2026-10-20T00:00:00.000Z');
    const makeEnvelope = (settings: any, phase: any = { kind: 'stage' }) => preparationEnvelope(
      'a'.repeat(32), profile, settings, issued, 1003, phase, 'v10');
    const envelope = makeEnvelope(selected.preparation);
    assert.deepEqual(preparationOperationSettings(envelope), selected.preparation);
    const mismatched = structuredClone(envelope);
    mismatched.operation.inputSchemaId = 'buster-preparation-input.v1';
    assert.throws(() => preparationOperationSettings(mismatched), /OPERATION_VERSION_MISMATCH/);
    const wrongDigest = structuredClone(envelope);
    wrongDigest.operation.inputSchemaDigest = `sha256:${'b'.repeat(64)}`;
    assert.throws(() => preparationOperationSettings(wrongDigest), /OPERATION_VERSION_MISMATCH/);
    assert.equal(envelope.operation.contractId, 'kubeclaw.buster-preparation@2');
    assert.equal(envelope.operation.inputSchemaId, 'buster-preparation-input.v2');
    assert.deepEqual(envelope.operation.values.settings, selectedSettings.preparation);
    assert.equal(envelope.limits.logBytes, selected.preparation.attemptLogBytes);
    assert.equal(envelope.limits.evidenceBytes, selected.preparation.attemptEvidenceBytes);
    assert.equal(envelope.limits.evidenceFiles, selected.preparation.attemptEvidenceFiles);
    assert.equal(Date.parse(envelope.claim.expiresAt) - issued.getTime(),
      selected.preparation.timeoutMs + selected.preparation.completionPhaseAllowance * selected.preparation.cleanupTimeoutMs);
    const changed = { ...selected.preparation, attemptLogBytes: 2, attemptEvidenceBytes: 3,
      attemptEvidenceFiles: 2, completionPhaseAllowance: 9 };
    const altered = makeEnvelope(changed);
    assert.notEqual(altered.attemptSpecDigest, envelope.attemptSpecDigest);
    assert.equal(altered.limits.logBytes, 2);
    assert.equal(altered.limits.evidenceBytes, 3);
    assert.equal(altered.limits.evidenceFiles, 2);
    assert.equal(Date.parse(altered.claim.expiresAt) - issued.getTime(),
      changed.timeoutMs + 9 * changed.cleanupTimeoutMs);
    assert.throws(() => preparationEnvelope('a'.repeat(32), preparationProfile(`sha256:${'a'.repeat(64)}`),
      selected.preparation, issued, 1003, { kind: 'stage' }, 'v10'), /PROFILE_VERSION_MISMATCH/);
    assert.throws(() => makeEnvelope(selected.preparation, { kind: 'historical', descriptor: {} }), /V10_HISTORICAL_UNSUPPORTED/);
    for (const field of ['attemptLogBytes', 'attemptEvidenceBytes', 'attemptEvidenceFiles', 'completionPhaseAllowance',
      'storeLockWaitSeconds', 'tarDiagnosticCodeUnits', 'resultInputReserveMultiplier']) {
      const missing: any = { ...selected.preparation }; delete missing[field];
      assert.throws(() => makeEnvelope(missing), /BUSTER_PREPARATION_V10_INVALID/);
    }
    assert.deepEqual(makeEnvelope(selected.preparation), envelope, 'restored complete v2 wire');
  }
  // Schema-valid but impossible budgets in ANY retained profile must reject.
  // In particular v10's multiplier is authored, not legacy's literal four.
  for (const profileId of [binding.profileId, unselected]) {
    for (const field of ['maximumOutputBytes', 'maximumSourceBytes', 'closeTimeoutMs', 'resultInputReserveMultiplier', 'completionPhaseAllowance', 'attemptEvidenceBytes']) {
      const changed = JSON.parse(bytes.toString());
      const preparation = changed.profiles[profileId].settings.preparation;
      if (field === 'maximumOutputBytes') preparation[field] = preparation.maximumResultBytes;
      else if (field === 'maximumSourceBytes') preparation[field] = preparation.maximumRequestBytes;
      else if (field === 'closeTimeoutMs') preparation[field] = preparation.drainTimeoutMs;
      else if (field === 'completionPhaseAllowance') preparation[field] = 2_147_483_647;
      else if (field === 'attemptEvidenceBytes') preparation[field] = Number.MAX_SAFE_INTEGER + 1;
      else {
        preparation[field] = 8;
        preparation.maximumOutputBytes = preparation.maximumResultBytes + 4 * preparation.maximumInputBytes;
      }
      supplied.set(ownerPath, Buffer.from(JSON.stringify(changed)));
      assert.throws(() => inspect(originalRoot), /BUSTER_PREPARATION_V10_/, `${profileId}:${field}`);
      assert.throws(() => inspect(originalRoot, 'buster-preparation'), /BUSTER_PREPARATION_V10_/);
    }
  }
  supplied.set(ownerPath, bytes);
  assert.deepEqual(inspect(originalRoot).preparation, selectedSettings.preparation, 'restored complete preparation');
  const largerMultiplier = JSON.parse(bytes.toString());
  const largerPreparation = largerMultiplier.profiles[binding.profileId].settings.preparation;
  largerPreparation.resultInputReserveMultiplier = 8;
  supplied.set(ownerPath, Buffer.from(JSON.stringify(largerMultiplier)));
  assert.deepEqual(inspect(originalRoot).preparation, largerPreparation, 'supported original authored multiplier is preserved, not defaulted to four');
  for (const field of ['attemptEvidenceBytes', 'attemptEvidenceFiles', 'attemptLogBytes', 'completionPhaseAllowance',
    'storeLockWaitSeconds', 'tarDiagnosticCodeUnits', 'resultInputReserveMultiplier']) {
    const missing = JSON.parse(bytes.toString());
    delete missing.profiles[unselected].settings.preparation[field];
    supplied.set(ownerPath, Buffer.from(JSON.stringify(missing)));
    assert.throws(() => inspect(originalRoot), /OWNER_INVALID/, `required v10 preparation author ${field}`);
  }
  supplied.set(ownerPath, bytes);

  const noPeer = structuredClone(originalRoot);
  noPeer.bindings.find((b: any) => b.owner === 'worker-core' && b.instanceId === binding.instanceId).instanceId = 'different-original-worker';
  assert.throws(() => inspect(noPeer), /BUSTER_WORKER_PEER/);
  assert.throws(() => inspect(noPeer, 'buster-preparation'), /BUSTER_WORKER_PEER/);
  assert.deepEqual(inspect(originalRoot, 'buster-preparation').worker, inspect(originalRoot).worker);
  const escaped = structuredClone(originalRoot); escaped.components['buster-engine'] = '../current-B.json';
  assert.throws(() => inspect(escaped), /BUSTER_OWNER_PATH/);
  const workerPath = 'config/components/worker-core.config.json', workerBytes = supplied.get(workerPath)!;
  const workerOwner = JSON.parse(workerBytes.toString());
  workerOwner.profiles['unselected-native-invalid'] = structuredClone(Object.values(workerOwner.profiles)[0]);
  workerOwner.profiles['unselected-native-invalid'].settings.runtime.retain_logs['buster-provider'] = true;
  supplied.set(workerPath, Buffer.from(JSON.stringify(workerOwner)));
  assert.throws(() => inspect(originalRoot), /OWNER_INVALID:worker-core:NATIVE_POLICY/);
  workerOwner.profiles['unselected-native-invalid'].settings.runtime.retain_logs['buster-provider'] = false;
  workerOwner.profiles['unselected-native-invalid'].settings.runtime.journal_record_bytes = 32768;
  assert.throws(() => { supplied.set(workerPath, Buffer.from(JSON.stringify(workerOwner))); inspect(originalRoot); }, /OWNER_INVALID:worker-core:NATIVE_POLICY/);
  supplied.set(workerPath, workerBytes);
  assert.equal(inspect(originalRoot).activationAllowed, false);
});


test('Buster runtime v2 original network-only policy rejects inactive source branches without authorizing native extras', t => {
  const directory = tree(t), root = JSON.parse(rootBytes.toString());
  const binding = root.bindings.find((b: any) => b.owner === 'buster-engine' && b.instanceId === 'fixture.service.buster-runtime');
  binding.profileId = 'network-only';
  const bytes = Buffer.from(JSON.stringify(root));
  fs.writeFileSync(path.join(directory, 'config/pipeline.config.json'), bytes);
  const retained = capture(directory, [row('config/pipeline.config.json', bytes), replacements[1]!]); t.after(retained.capture.close);
  const selection = { role: 'buster', callerId: 'buster-runtime', serviceInstanceId: binding.instanceId };
  const owner = JSON.parse(retained.capture.read('config/components/buster-engine.config.json').toString());
  const settings = owner.profiles['network-only'].settings;
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v2', ...structuredClone(settings.remotePlanService),
    networkHttp: structuredClone(settings.execution.capabilityProviders.networkHttp) };
  const run = (value: any) => inspectPipelineV10BusterRuntimeSourceIdentity(selection, Buffer.from(JSON.stringify(value)), retained.capture);
  const original = run(runtime);
  assert.deepEqual(Object.keys(original.providerPolicies), ['networkHttp']);
  assert.deepEqual(original.clusterInvokers, settings.clusterInvokers,
    'complete selected policy remains required even when cluster capabilities are inactive');
  for (const field of ['directCommand', 'containerBuild', 'browserAxe', 'browserLighthouse', 'browserVisual', 'browserPlaywright', 'securityScan']) {
    assert.throws(() => run({ ...runtime, [field]: {} }), /BUSTER_INACTIVE_PROVIDER/);
    assert.throws(() => run({ ...runtime, [field]: null }), /BUSTER_INACTIVE_PROVIDER/);
  }
  // Even an otherwise valid binding from this same retained deployment is
  // forbidden when the selected original service has no cluster capability.
  const chart = JSON.parse(retained.capture.read('charts/kubeclaw/values.yaml').toString());
  const deployment = root.deploymentSelections.find((d: any) => d.consumer === 'namespace-controller'
    && d.busterComponentInstanceId === binding.instanceId);
  const namespace = chart.profiles[deployment.profileId].readonlyBindings.releaseNamespace;
  for (const clusterBindings of [null, {}, { controllerNamespace: namespace },
    { controllerNamespace: 'foreign-namespace' }, { controllerNamespace: namespace, extra: true }]) {
    assert.throws(() => run({ ...runtime, clusterBindings }), /BUSTER_INACTIVE_CLUSTER_SOURCE/);
  }
  assert.equal(Object.hasOwn(runtime, 'clusterBindings'), false);
  assert.deepEqual(run(runtime), original, 'restored original network-only projection');
  assert.equal(original.activationAllowed, false);
});


test('versioned generation producer binds every retained v10 input and all original owner profiles without activating legacy output', async t => {
 const { createPipelineV10GenerationReceipt } = await import('../../../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts');
 const root = tree(t), original = capture(root, replacements); t.after(original.capture.close);
 const receipt = createPipelineV10GenerationReceipt(original.capture);
 assert.equal(receipt.schemaVersion, 'pipeline-generation.v2');
 assert.equal(receipt.rootSchemaVersion, 'pipeline-entry.v10');
 assert.equal(receipt.inputGenerationSha256, original.capture.inputGenerationSha256);
 assert.equal(receipt.files.length, original.capture.members.length);
 const subset = capturePipelineInputSet(root, original.capture.members.filter(member => member.relativePath.startsWith('config/') || member.relativePath === 'schemas/pipeline-entry.schema.json'));
 try { assert.throws(() => createPipelineV10GenerationReceipt(subset), /GENERATION_INPUT_SET_REQUIRED/); } finally { subset.close(); }
 assert.deepEqual(receipt.files.map(file => file.path), original.capture.members.map(member => member.relativePath));
 assert.equal(receipt.profiles.filter(profile => profile.owner === 'buster-engine').length, 95);
 assert.equal(Object.isFrozen(receipt.profiles[0]), true);
 assert.deepEqual(createPipelineV10GenerationReceipt(original.capture), receipt);
 const schema = path.join(root, 'schemas/browser/axe.task.schema.json');
 const bytes = fs.readFileSync(schema); fs.appendFileSync(schema, ' ');
 assert.throws(() => createPipelineV10GenerationReceipt(original.capture), /INPUT_CHANGED/);
 original.capture.close(); fs.writeFileSync(schema, bytes);
 const restored = capture(root, replacements); t.after(restored.capture.close);
 assert.deepEqual(createPipelineV10GenerationReceipt(restored.capture), receipt);
 restored.capture.close();
 assert.throws(() => createPipelineV10GenerationReceipt(restored.capture), /CAPTURE_CLOSED/);
});


test('versioned v10 selection and full Buster owner bind original caller profiles without legacy admission', async t => {
 const { createPipelineV10ServiceSelection: select, createBusterV10SelectedOwnerProjection: project,
   readPipelineServiceSelection } = await import('../../../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts');
 const original = capture(tree(t), replacements); t.after(original.capture.close);
 const document = JSON.parse(original.capture.read('config/pipeline.config.json').toString());
 const serviceInstanceId = 'fixture.service.buster-runtime';
 const tuple: any = { role: 'buster', callerId: 'buster-preparation', serviceInstanceId,
   bindings: document.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === serviceInstanceId)
     .map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) };
 const pkg = ('sha256:' + 'a'.repeat(64)) as `sha256:${string}`;
 for (const callerId of ['buster-preparation', 'buster-runtime'] as const) {
  const request = { ...structuredClone(tuple), callerId }, receipt = select(original.capture, request, pkg);
  const owner = project(original.capture, receipt);
  assert.equal(receipt.schemaVersion, 'pipeline-service-selection.v2');
  assert.equal(owner.schemaVersion, 'buster-selected-owner-projection.v2');
  assert.deepEqual(owner.author, JSON.parse(original.capture.read('config/components/buster-engine.config.json').toString()));
  assert.equal(Object.keys(owner.author.profiles).length, 95);
  assert.deepEqual(owner.settings, owner.author.profiles[owner.binding.profileId].settings);
  assert.equal(owner.selectionDigest, receipt.digest);
  assert.equal(Object.isFrozen(owner.author.profiles), true);
  assert.equal(Object.isFrozen(owner.settings.preparation.resourcePolicy), true);
  assert.throws(() => readPipelineServiceSelection(receipt, callerId), /SERVICE_SELECTION_INVALID/);
  assert.deepEqual(select(original.capture, { ...request, bindings: [...request.bindings].reverse() }, pkg), receipt);
  assert.notEqual(select(original.capture, request, ('sha256:' + 'b'.repeat(64)) as any).digest, receipt.digest);
  request.bindings[0].profileId = 'caller-mutation';
  assert.notEqual(receipt.bindings[0]!.profileId, 'caller-mutation');
  for (const field of ['digest', 'generationDigest', 'packageReceiptDigest']) {
   const changed: any = structuredClone(receipt); changed[field] = 'sha256:' + '0'.repeat(64);
   assert.throws(() => project(original.capture, changed), /IDENTITY_MISMATCH/);
  }
  assert.throws(() => project(original.capture, { ...receipt, schemaVersion: 'pipeline-service-selection.v1' } as any), /IDENTITY_MISMATCH/);
  assert.throws(() => project(original.capture, { ...receipt, extra: true } as any), /IDENTITY_MISMATCH/);
  assert.deepEqual(project(original.capture, receipt), owner);
 }
 const valid = select(original.capture, tuple, pkg);
 assert.throws(() => select(original.capture, tuple, 'bad' as any), /PACKAGE_DIGEST_INVALID/);
 const wrong = structuredClone(tuple); wrong.bindings[0].profileId = 'foreign-profile';
 assert.throws(() => select(original.capture, wrong, pkg), /BINDING_MISMATCH/);
 const missingWorker = structuredClone(tuple); missingWorker.bindings = missingWorker.bindings.filter((b: any) => b.owner !== 'worker-core');
 assert.throws(() => select(original.capture, missingWorker, pkg), /WORKER_CORE_VERSIONED_SELECTION_REQUIRED/);
 const foreign = structuredClone(tuple); foreign.serviceInstanceId = 'foreign'; foreign.bindings.forEach((b: any) => b.instanceId = 'foreign');
 assert.throws(() => select(original.capture, foreign, pkg), /BINDING_MISMATCH/);
 original.capture.close();
 assert.throws(() => select(original.capture, tuple, pkg), /CAPTURE_CLOSED/);
 assert.throws(() => project(original.capture, valid), /CAPTURE_CLOSED/);
});


test('versioned v10 wire receivers require separate original tuple/package and preserve full owner without boot admission', async t => {
 const { createPipelineV10ServiceSelection: select, createBusterV10SelectedOwnerProjection: project,
   receivePipelineV10ServiceSelection: receive, receiveBusterV10SelectedOwnerProjection: receiveOwner,
   readPipelineServiceSelection: legacy } = await import('../../../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts');
 const root = tree(t), original = capture(root, replacements); t.after(original.capture.close);
 const document = JSON.parse(original.capture.read('config/pipeline.config.json').toString());
 const tuple = (callerId: 'buster-preparation' | 'buster-runtime', serviceInstanceId = 'fixture.service.buster-runtime'): any => ({
   role: 'buster', callerId, serviceInstanceId,
   bindings: document.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === serviceInstanceId)
     .map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) });
 const pkg = ('sha256:' + 'a'.repeat(64)) as `sha256:${string}`;
 const otherPkg = ('sha256:' + 'b'.repeat(64)) as `sha256:${string}`;
 for (const callerId of ['buster-preparation', 'buster-runtime'] as const) {
  const request = tuple(callerId), selected = select(original.capture, request, pkg), owner = project(original.capture, selected);
  const wire = JSON.parse(JSON.stringify(selected)), ownerWire = JSON.parse(JSON.stringify(owner));
  const run = (selection: unknown = wire, projection: unknown = ownerWire) => receiveOwner(projection, original.capture, selection, request, pkg);
  assert.deepEqual(receive(wire, original.capture, request, pkg), selected);
  assert.deepEqual(run(), owner);
  assert.equal(Object.keys(run().author.profiles).length, 95);
  assert.equal(Object.isFrozen(run().author.profiles), true);
  assert.equal(Object.isFrozen(receive(wire, original.capture, request, pkg).bindings), true);
  for (const foreign of [null, [], { ...wire, extra: true }, { ...wire, schemaVersion: 'pipeline-service-selection.v1' },
    { ...wire, digest: 'sha256:' + '0'.repeat(64) }, select(original.capture, request, otherPkg),
    select(original.capture, tuple(callerId === 'buster-runtime' ? 'buster-preparation' : 'buster-runtime'), pkg),
    select(original.capture, tuple(callerId, 'fixture.service.buster-security-runtime'), pkg)]) {
   assert.throws(() => run(foreign), /SERVICE_SELECTION_MISMATCH/);
   assert.deepEqual(run(), owner);
  }
  assert.throws(() => receive(wire, original.capture, request, otherPkg), /SERVICE_SELECTION_MISMATCH/);
  for (const mutate of [
   (v: any) => { v.schemaVersion = 'buster-selected-owner-projection.v1'; },
   (v: any) => { v.extra = true; },
   (v: any) => { v.selectionDigest = 'sha256:' + '0'.repeat(64); },
   (v: any) => { delete v.author.profiles[Object.keys(v.author.profiles).find(k => k !== v.binding.profileId)!]; },
   (v: any) => { v.settings.remotePlanService.port++; },
   (v: any) => { const k = Object.keys(v.author.profiles).find(k => k !== v.binding.profileId)!; v.author.profiles[k].settings.remotePlanService.port++; },
  ]) {
   const changed = structuredClone(ownerWire); mutate(changed);
   assert.throws(() => run(wire, changed), /SELECTED_OWNER_PROJECTION_MISMATCH/);
   assert.deepEqual(run(), owner);
  }
  wire.bindings[0].profileId = 'caller-mutation'; ownerWire.author.profiles = {};
  assert.deepEqual(receive(selected, original.capture, request, pkg), selected);
  assert.deepEqual(receiveOwner(owner, original.capture, selected, request, pkg), owner);
  assert.throws(() => legacy(selected, callerId), /SERVICE_SELECTION_INVALID/);
 }
 const request = tuple('buster-runtime'), selected = select(original.capture, request, pkg), owner = project(original.capture, selected);
 const file = path.join(root, 'schemas/pipeline-entry.schema.json'), bytes = fs.readFileSync(file);
 fs.appendFileSync(file, ' ');
 assert.throws(() => receive(selected, original.capture, request, pkg), /INPUT_CHANGED/);
 assert.throws(() => receiveOwner(owner, original.capture, selected, request, pkg), /INPUT_CHANGED/);
 original.capture.close(); fs.writeFileSync(file, bytes);
 const restored = capture(root, replacements); t.after(restored.capture.close);
 assert.deepEqual(receiveOwner(owner, restored.capture, selected, request, pkg), owner);
 restored.capture.close();
 assert.throws(() => receiveOwner(owner, restored.capture, selected, request, pkg), /CAPTURE_CLOSED/);
});

test('versioned v10 full release image binds original composition package and owner without boot admission', async t => {
 const { createPipelineV10ImageReceipt: create, receivePipelineV10ImageReceipt: receive } =
   await import('../../../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts');
 const root = tree(t), original = capture(root, replacements); t.after(original.capture.close);
 const document = JSON.parse(original.capture.read('config/pipeline.config.json').toString());
 const tuple = (callerId: string, instance = 'fixture.service.buster-runtime'): any => ({ role: 'buster', callerId,
   serviceInstanceId: instance, bindings: document.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === instance)
     .map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) });
 const services = [tuple('buster-preparation'), tuple('buster-runtime')];
 const pkg = ('sha256:' + 'a'.repeat(64)) as `sha256:${string}`;
 const otherPkg = ('sha256:' + 'b'.repeat(64)) as `sha256:${string}`;
 const image = create(original.capture, services, pkg), wire = JSON.parse(JSON.stringify(image));
 const run = (value: unknown = wire) => receive(value, original.capture, services, pkg);
 assert.equal(image.schemaVersion, 'pipeline-image-generation.v2');
 assert.deepEqual(Object.keys(image.selectionDigests).sort(), ['buster-preparation', 'buster-runtime']);
 assert.deepEqual(Object.keys(image.ownerProjectionDigests).sort(), ['buster-preparation', 'buster-runtime']);
 assert.equal(Object.isFrozen(run().selectionDigests), true);
 assert.equal(Object.isFrozen(run().ownerProjectionDigests), true);
 assert.deepEqual(create(original.capture, [...services].reverse(), pkg), image);
 for (const foreign of [null, [], { ...wire, extra: true }, { ...wire, schemaVersion: 'pipeline-image-generation.v1' },
   { ...wire, generationDigest: 'sha256:' + '0'.repeat(64) }, { ...wire, inputGenerationSha256: '0'.repeat(64) },
   { ...wire, selectionDigests: {} }, { ...wire, ownerProjectionDigests: {} }, { ...wire, digest: 'sha256:' + '0'.repeat(64) },
   create(original.capture, services, otherPkg), create(original.capture,
     [tuple('buster-preparation', 'fixture.service.buster-security-runtime'), tuple('buster-runtime', 'fixture.service.buster-security-runtime')], pkg)]) {
  assert.throws(() => run(foreign), /IMAGE_RECEIPT_MISMATCH/); assert.deepEqual(run(), image);
 }
 for (const bad of [[], [services[0]], [services[1]], [...services, services[0]]]) {
  assert.throws(() => create(original.capture, bad, pkg), /RELEASE_(?:COMPOSITION_REQUIRED|COMPOSITION_INVALID|CALLER_CLOSURE_REQUIRED)/);
 }
 assert.throws(() => create(original.capture, [services[0], tuple('buster-runtime', 'fixture.service.buster-security-runtime')], pkg), /HANDOFF_SELECTION_MISMATCH/);
 assert.throws(() => receive(image, original.capture, services, otherPkg), /IMAGE_RECEIPT_MISMATCH/);
 wire.selectionDigests = {}; wire.ownerProjectionDigests = {};
 assert.deepEqual(receive(image, original.capture, services, pkg), image);
 const file = path.join(root, 'schemas/pipeline-entry.schema.json'), bytes = fs.readFileSync(file);
 fs.appendFileSync(file, ' '); assert.throws(() => run(image), /INPUT_CHANGED/);
 original.capture.close(); fs.writeFileSync(file, bytes);
 const restored = capture(root, replacements); t.after(restored.capture.close);
 assert.deepEqual(receive(image, restored.capture, services, pkg), image);
 restored.capture.close(); assert.throws(() => receive(image, restored.capture, services, pkg), /CAPTURE_CLOSED/);
});
