import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {createSerializedOutputRoleClassifier, deriveNativeOperationFacts} from '../docs-api-output-role-classification.mjs';
import {discoverScriptOutputRoleClassifications} from '../docs-api-output-discovery.mjs';
import {observerMaterializedSourceState, resolveObserverDocumentationImport} from '../docs-api-observer-materialized-source.mjs';
const repository=process.env.OBSERVER_TEST_REPOSITORY ?? path.resolve(import.meta.dirname,'../..');
const plugin='skills/common/plugins/openclaw-agent-observer';
const canonical='contracts/agent-observability/v1/src';
const generated=plugin+'/src/generated/agent-observability';
const authorityFiles = ["skills/common/plugins/openclaw-agent-observer/src/config.ts", "skills/common/plugins/openclaw-agent-observer/src/observer-support.ts", "skills/common/plugins/openclaw-agent-observer/src/hook-normalizers.ts", "skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts", "skills/common/plugins/openclaw-agent-observer/src/hook-values.ts", "skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts", "skills/common/plugins/openclaw-agent-observer/src/index.ts", "skills/common/plugins/openclaw-agent-observer/src/redis-writer-types.ts", "skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs", "skills/common/plugins/openclaw-agent-observer/scripts/build.mjs", "skills/common/plugins/openclaw-agent-observer/package.json", "skills/common/plugins/openclaw-agent-observer/.gitignore", "contracts/agent-observability/v1/src/complexity.ts", "contracts/agent-observability/v1/src/constants.ts", "contracts/agent-observability/v1/src/index.ts", "contracts/agent-observability/v1/src/mapping.ts", "contracts/agent-observability/v1/src/routing.ts", "contracts/agent-observability/v1/src/types.ts", "contracts/agent-observability/v1/src/validation.ts"];
function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'observer-doc-source-'));try{for(const file of authorityFiles){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repository,file),target);}run(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function copy(root){fs.mkdirSync(path.dirname(path.join(root,generated)),{recursive:true});fs.cpSync(path.join(root,canonical),path.join(root,generated),{recursive:true});}
test('same static classifier resolves maxEventBytes through canonical normalizer across absent/present/absent',()=>fixture(root=>{
 const source='scripts/observer-probe.ts';fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
 fs.writeFileSync(path.join(root,source),`import {resolveAgentObserverConfig} from '../${plugin}/src/config.ts';\nconsole.log(JSON.stringify(resolveAgentObserverConfig({enabled:true,maxEventBytes:4096,maxQueuePerStream:1,redisCommandTimeoutMs:1,streamMaxLen:1,deadLetterMaxLen:1,controlWriteMaxAttempts:1,controlWriteRetryBaseMs:1,controlWriteRetryMaxMs:1,hookPriority:1,hookTimeoutMs:1},{}).maxEventBytes));\n`);
 const classify=createSerializedOutputRoleClassifier(root,[source,plugin+'/src/config.ts',...authorityFiles]);
 const absent=classify(source);assert.equal(absent.length,1);// Existing scalar escape analysis rejects Number.isInteger(numberValue).
 // The complete expression proves traversal reached the real normalizer body,
 // not merely a fixed object root or an injected dependency list.
 assert.equal(absent[0].role,'unknown');assert.equal(absent[0].expression,fs.readFileSync(path.join(root,canonical,'routing.ts'),'utf8').match(/export function normalizeAgentObservabilityMaxEventBytes[\s\S]*?\n\}/u)[0]);assert(absent[0].dependencies.includes(canonical+'/routing.ts'));assert(!absent[0].dependencies.some(s=>s.startsWith(generated)));
 const facts=deriveNativeOperationFacts(root,plugin+'/src/config.ts',[{symbol:'resolveAgentObserverConfig'}]);assert(facts.some(f=>f.source===canonical+'/routing.ts'&&f.symbol==='normalizeAgentObservabilityMaxEventBytes'));
 copy(root);assert.deepEqual(classify(source),absent);fs.rmSync(path.join(root,generated),{recursive:true});assert.deepEqual(classify(source),absent);
 copy(root);fs.appendFileSync(path.join(root,generated,'routing.ts'),'\n// drift\n');assert.throws(()=>classify(source),/copy drift/);
}));
test('incomplete, extra, symlinked copies and authority drift fail closed',()=>{
 for(const change of [root=>fs.unlinkSync(path.join(root,generated,'types.ts')),root=>fs.writeFileSync(path.join(root,generated,'extra.ts'),'export {};'),root=>{fs.unlinkSync(path.join(root,generated,'routing.ts'));fs.symlinkSync(path.join(root,canonical,'routing.ts'),path.join(root,generated,'routing.ts'));},root=>fs.appendFileSync(path.join(root,plugin,'scripts/sync-contract.mjs'),'\n// drift'),root=>fs.appendFileSync(path.join(root,canonical,'routing.ts'),'\n// drift'),root=>fs.appendFileSync(path.join(root,plugin,'src/config.ts'),'\n// drift'),root=>fs.writeFileSync(path.join(root,canonical,'new-member.ts'),'export {};')])fixture(root=>{copy(root);change(root);assert.throws(()=>observerMaterializedSourceState(root),/DOCUMENTATION_MATERIALIZED_SOURCE_UNQUALIFIED/);});
 fixture(root=>{fs.mkdirSync(path.join(root,plugin,'src/generated'),{recursive:true});fs.symlinkSync(path.join(root,canonical),path.join(root,generated));assert.throws(()=>observerMaterializedSourceState(root),/redirected/);});
 fixture(root=>{fs.mkdirSync(path.join(root,plugin,'src'),{recursive:true});fs.symlinkSync(path.join(root,canonical),path.join(root,plugin,'src/generated'));assert.throws(()=>observerMaterializedSourceState(root),/redirected/);});
});
test('only exact static owned imports receive substitution',()=>fixture(root=>{
 assert.equal(resolveObserverDocumentationImport(root,plugin+'/src/config.ts','./generated/agent-observability/index.ts','import'),canonical+'/index.ts');
 assert.equal(resolveObserverDocumentationImport(root,plugin+'/src/config.ts','./generated/agent-observability/index.ts','dynamic-import'),null);
 assert.equal(resolveObserverDocumentationImport(root,'scripts/unrelated.ts','../'+generated+'/index.ts','import'),null);
}));

test('documentation graph canonicalizes supported copies and invalidates its cache before drift',()=>fixture(root=>{
 // Complete plugin source closure; no plugin implementation is executed.
 fs.cpSync(path.join(repository,plugin,'src'),path.join(root,plugin,'src'),{recursive:true,filter:source=>!source.includes('/generated/')});
 fs.writeFileSync(path.join(root,'package.json'),'{}');
 const absent=discoverScriptOutputRoleClassifications(root);
 copy(root);const present=discoverScriptOutputRoleClassifications(root);assert.deepEqual(present,absent);
 fs.rmSync(path.join(root,generated),{recursive:true});assert.deepEqual(discoverScriptOutputRoleClassifications(root),absent);
 copy(root);fs.appendFileSync(path.join(root,generated,'routing.ts'),'\n// drift');assert.throws(()=>discoverScriptOutputRoleClassifications(root),/copy drift/);
}));
