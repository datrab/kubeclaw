import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {discoverSdkSurface, generateSdkReference, checkSdkReference, schemaFacts, stageSdkReference} from '../../scripts/docs-sdk-reference.mjs';
import {markdownInlineLinks} from '../../scripts/lib/docs-markdown-anchors.mjs';
import {sdkSemantics,semanticSourceBindings} from '../../scripts/docs-sdk-semantics.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const revision='586f1f558a673c4df51c0afb9ea535c814b933b1';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fixture() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'docs-sdk-reference-'));
  const sdk='skills/common/plugin-runtime/sdk';const schema='skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json';
  const files={
    'package.json':'{"type":"module"}',
    [`${sdk}/package.json`]:JSON.stringify({name:'@fixture/sdk',private:true,exports:{'.':'./src/index.ts','./testing':'./src/testing/index.ts'}}),
    [`${sdk}/tsconfig.build.json`]:JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',target:'ESNext',strict:true,allowImportingTsExtensions:true,noEmit:true}}),
    [`${sdk}/src/index.ts`]:'export type Original = { readonly value?: string };\n',
    [`${sdk}/src/testing/index.ts`]:'export function check(value: never): never { throw new Error("fixture"); }\n',
    [`${sdk}/src/runtime.ts`]:'export {};\n',
    [schema]:JSON.stringify({$defs:{original:{type:'object',properties:{value:{type:'string',maxLength:4}},additionalProperties:false}}}),
    'scripts/generate-plugin-sdk-types.mjs':'// Documentation-only synthetic fixture, not product implementation.\n',
  };
  for(const[file,text]of Object.entries(files)){const full=path.join(directory,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,text);}
  fs.symlinkSync(path.join(root,'node_modules'),path.join(directory,'node_modules'),'dir');
  const bindings=Object.fromEntries(Object.keys(files).filter(x=>x!=='package.json').map(x=>[x,hash(path.join(directory,x))]));
  return {root:directory,revision,bindings,semantics:{Original:['Optional text selected by the fixture consumer; no runtime validator.','const value: Original = {};'],check:['Synthetic never helper rejects.','check(value);']},dispose:()=>fs.rmSync(directory,{recursive:true,force:true})};
}

test('compiler enumeration uses both real entrypoints and preserves public override, inherited and Pick members',()=>{
  const surface=discoverSdkSurface({root});
  assert.deepEqual(surface.entrypoints.map(x=>x.entrypoint),['.','./testing']);
  assert.equal(surface.exports.length,Object.keys(sdkSemantics).length);
  const invocation=surface.exports.find(x=>x.name==='CapabilityInvocation');
  assert.equal(invocation.source.source,'skills/common/plugin-runtime/sdk/src/runtime.ts');
  assert.ok(invocation.members.some(x=>x.path==='payload'&&x.readonly));
  const subject=surface.exports.find(x=>x.name==='ReviewSubject');
  assert.ok(subject.members.some(x=>x.path==='identityEncoding'&&x.optional&&x.inheritedOrResolved));
  const output=surface.exports.find(x=>x.name==='ReportAdapterOutput');
  assert.ok(output.members.some(x=>x.path==='durationMs'&&!x.optional&&x.source==='contracts/pipeline-test-gate/v1/src/types.ts'));
  const variants=surface.exports.find(x=>x.name==='AdapterInvocation').unionVariants;
  assert.equal(variants.length,2);
  assert.ok(variants.some(x=>x.members.some(y=>y.name==='confidential'&&y.signature==='true')&&x.members.some(y=>y.name==='lock'&&y.optional)));
  assert.ok(variants.some(x=>x.members.some(y=>y.name==='fence'&&!y.optional)));
  assert.ok(surface.supportTypes.every(x=>x.publicNamedExport===false));
});

test('all current annotations appear beside mechanical facts and outputs check byte-for-byte',()=>{
  const result=generateSdkReference({root,revision});
  for(const member of result.inventory.exports){assert.ok(result.generatedMarkdown.includes(`## ${member.name}\n`));assert.ok(result.generatedMarkdown.includes(sdkSemantics[member.name][0]));assert.ok(result.generatedMarkdown.includes(sdkSemantics[member.name][1]));}
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'docs-sdk-output-'));
  try{const inventoryPath=path.join(output,'inventory.json'),markdownPath=path.join(output,'exports.md');fs.writeFileSync(inventoryPath,JSON.stringify(result.inventory,null,2)+'\n');fs.writeFileSync(markdownPath,result.generatedMarkdown);const beforeInventory=fs.statSync(inventoryPath,{bigint:true}).mtimeNs;const beforeMarkdown=fs.statSync(markdownPath,{bigint:true}).mtimeNs;checkSdkReference({root,revision,inventoryPath,markdownPath});assert.equal(fs.statSync(inventoryPath,{bigint:true}).mtimeNs,beforeInventory);assert.equal(fs.statSync(markdownPath,{bigint:true}).mtimeNs,beforeMarkdown);fs.appendFileSync(markdownPath,'stale');assert.throws(()=>checkSdkReference({root,revision,inventoryPath,markdownPath}),/SDK_REFERENCE_OUTPUT_DRIFT/);}finally{fs.rmSync(output,{recursive:true,force:true});}
});

test('actual compiler-observed added, removed and renamed exports cannot inherit generic semantics',()=>{
  for(const [mutation,expected]of [
    ['export type Original = { readonly value?: string }; export const added = 1;','missing=.:added'],
    ['export {};','removed=Original'],
    ['export type Renamed = { readonly value?: string };','missing=.:Renamed;removed=Original'],
  ]){const f=fixture();try{fs.writeFileSync(path.join(f.root,'skills/common/plugin-runtime/sdk/src/index.ts'),mutation);assert.throws(()=>generateSdkReference(f),error=>error.message.startsWith('SDK_SEMANTIC_COVERAGE_DRIFT:')&&error.message.includes(expected));}finally{f.dispose();}}
});

test('a same-signature implementation edit and missing annotation fail with precise identity',()=>{
  const f=fixture();try{
    generateSdkReference(f);
    const missing={...f.semantics};delete missing.check;assert.throws(()=>generateSdkReference({...f,semantics:missing}),/missing=.\/testing:check/);
    fs.writeFileSync(path.join(f.root,'skills/common/plugin-runtime/sdk/src/testing/index.ts'),'export function check(value: never): never { throw new Error("changed semantics"); }\n');
    assert.throws(()=>generateSdkReference(f),/SDK_SEMANTIC_SOURCE_DRIFT:skills\/common\/plugin-runtime\/sdk\/src\/testing\/index.ts/);
  }finally{f.dispose();}
});

test('new internal source or unsupported compiler declaration cannot pass silently',()=>{
  const f=fixture();try{
    fs.writeFileSync(path.join(f.root,'skills/common/plugin-runtime/sdk/src/new.ts'),'export const internal = 1;');
    assert.throws(()=>generateSdkReference(f),/SDK_SEMANTIC_SOURCE_UNBOUND:.*new.ts/);
    fs.writeFileSync(path.join(f.root,'skills/common/plugin-runtime/sdk/src/index.ts'),'export class Original {}');
    assert.throws(()=>discoverSdkSurface(f),/SDK_DECLARATION_UNSUPPORTED:.:Original:ClassDeclaration/);
  }finally{f.dispose();}
});

test('recursive schema facts retain conditional and reference rules; unsupported keywords are explicit',()=>{
  const schema={$defs:{record:{type:'object',required:['mode'],properties:{mode:{enum:['a','b']},value:{$ref:'#/$defs/text'}},allOf:[{if:{properties:{mode:{const:'a'}}},then:{required:['value'],not:{properties:{extra:true},required:['extra']}}}]},text:{type:'string',minLength:1,maxLength:4,pattern:'^[a-z]+$'}}};
  const facts=schemaFacts(schema);
  assert.ok(facts.some(x=>x.pointer==='#/$defs/record/allOf/0/then/not'&&x.rule.required[0]==='extra'));
  assert.ok(facts.some(x=>x.pointer==='#/$defs/record/properties/value'&&x.rule.$ref==='#/$defs/text'));
  assert.throws(()=>schemaFacts({type:'object',unevaluatedProperties:false}),/SDK_SCHEMA_KEYWORD_UNSUPPORTED:#\/unevaluatedProperties/);
});

test('bound owning schema, product type generator and contextual consumer edits are detected',()=>{
  for(const source of ['skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json','scripts/generate-plugin-sdk-types.mjs','skills/nova/core/execution/context.ts']){
    assert.throws(()=>generateSdkReference({root,revision,bindings:{...semanticSourceBindings,[source]:'0'.repeat(64)}}),error=>error.message.startsWith(`SDK_SEMANTIC_SOURCE_DRIFT:${source}:`));
  }
});

test('qualified callback support and recursively owning schemas remain separate from 119 named exports',()=>{
  const result=generateSdkReference({root,revision});
  assert.equal(result.inventory.exports.length,119);
  assert.equal(result.inventory.schemaFacts.length,551);
  const support=result.inventory.supportTypes;
  for(const name of ['ProviderInvocationV1','ProviderResultV1','ReportCountsV1','ReportCaseV1','FindingV1','ResolvedInputV1','JsonValue'])assert.ok(support.some(x=>x.name===name&&!x.publicNamedExport));
  const generated=support.find(x=>x.name==='CapabilityInvocation');
  assert.equal(generated.source.source,'skills/common/plugin-runtime/sdk/src/generated/contracts.ts');
  assert.match(generated.signature,/\[k: string\]: any/);
  assert.ok(generated.members.some(x=>x.name==='payload'&&!x.readonly));
  const callbacks=result.inventory.callbackContracts;
  assert.deepEqual(callbacks.roots,['providerInvocation','providerResult','reportAdapterResult']);
  assert.equal(callbacks.definitions.length,27);
  for(const name of ['reportCounts','reportCase','finding','resolvedInput','jsonValue','executionLimits','providerDetails'])assert.ok(callbacks.definitions.includes(name));
  assert.ok(callbacks.schemaFacts.some(x=>x.pointer==='#/$defs/reportCase/properties/outcome'));
  assert.match(callbacks.validation.consumerSemantics,/listed plus omitted equal total/);
  assert.match(callbacks.validation.consumerSemantics,/unique case IDs/);
});

test('actual defining dependency helper, cleanup and report validator mutations cannot hide behind unchanged callers',()=>{
  const mutations=[
    ['skills/nova/core/effects/dependency-identity.ts', 'key: `adapter-dep:utf16-v1:${scope}:${sha256Text(portableJson(subject)).slice(7)}`', 'key: `adapter:${adapterId}:dependency:${capability}:${sha256Text(portableJson(subject)).slice(7)}`'],
    ['skills/nova/core/execution/adapter-invocation-phase.ts','if (this.#cleanupStarted) throw new Error', 'if (false) throw new Error'],
    ['contracts/pipeline-test-gate/v1/src/validation.ts','counts.passed + counts.failed + counts.errored + counts.skipped !== counts.total','counts.passed + counts.failed + counts.errored + counts.skipped === counts.total'],
  ];
  for(const [source,before,after]of mutations){const f=fixture();try{
    assert.ok(Object.hasOwn(semanticSourceBindings,source));
    const original=fs.readFileSync(path.join(root,source),'utf8');assert.ok(original.includes(before));
    const target=path.join(f.root,source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,original);f.bindings[source]=hash(target);
    const baseline=generateSdkReference(f);
    fs.writeFileSync(target,original.replace(before,after));
    assert.throws(()=>generateSdkReference(f),error=>error.message.startsWith(`SDK_SEMANTIC_SOURCE_DRIFT:${source}:`));
    assert.equal(baseline.inventory.exports.length,2); // The public fixture declarations were never changed.
  }finally{f.dispose();}}
});

test('pure local parser, native JSON and UTF measurements document their actual non-strict boundaries',async()=>{
  const values=await import('../../skills/common/plugin-runtime/sdk/src/values.ts');
  const review=await import('../../skills/common/plugin-runtime/sdk/src/review-subject.ts');
  const preflight=await import('../../skills/common/plugin-runtime/sdk/src/source-preflight.ts');
  const workspace=await import('../../skills/common/plugin-runtime/sdk/src/runtime-workspace.ts');
  const task=await import('../../skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts');
  const source={projectId:'p',repositoryRoot:'/repo',architectureRef:'main',paths:['a.md']};
  const inherited=Object.assign(Object.create({identityEncoding:values.PORTABLE_JSON_ENCODING}),source);
  assert.equal(Object.hasOwn(inherited,'identityEncoding'),false);
  assert.equal(review.reviewIdentityDigest({Z:1,a:2},inherited),values.sha256Text(values.portableJson({Z:1,a:2})));
  assert.equal(Object.hasOwn(review.parseReviewSource(inherited),'identityEncoding'),true);
  const unknown=Object.assign(Object.create({identityEncoding:'unknown'}),source);
  assert.equal(review.parseReviewSource(unknown).identityEncoding,'unknown');
  assert.equal(review.reviewIdentityDigest({x:1},unknown),values.sha256Text(values.canonicalJson({x:1})));
  assert.equal(preflight.parseSourceBinding(Object.assign(Object.create({identityEncoding:'unknown'}),{stageId:'preflight',inputDigest:values.sha256Text('{}')})).identityEncoding,'unknown');
  assert.throws(()=>review.reviewIdentityDigest({}, {identityEncoding:undefined}),/REVIEW_IDENTITY_ENCODING_INVALID/);
  assert.deepEqual(review.parseReviewSource({...source,paths:new Array(1)}).paths,[undefined]);
  for(const helper of [values.arrayValue,values.objectRecord]){const {proxy,revoke}=Proxy.revocable({},{});revoke();assert.throws(()=>helper(proxy),TypeError);}
  let gets=0,conversions=0;
  const payload={omitted:undefined,fn:()=>{},number:NaN,nested:{toJSON(){conversions++;return 'converted';}},get read(){gets++;return 7;}};
  const text=task.buildRuntimeAgentTask(payload,'result.json');const envelope=JSON.parse(text.slice(text.indexOf('\n{')+1));
  assert.deepEqual(envelope,{number:null,nested:'converted',read:7});assert.equal(gets,1);assert.equal(conversions,1);
  assert.equal(values.sha256Text('work\ud800'),values.sha256Text('work\ud801'));
  assert.equal(workspace.runtimeWorkspaceOwnerFile('work\ud800'),workspace.runtimeWorkspaceOwnerFile('work\ud801'));
  assert.throws(()=>review.parseReviewSource({...source,projectId:'😀'.repeat(2049)}),/REVIEW_SOURCE_INVALID/);
  assert.equal('😀'.repeat(512).length,1024);assert.equal([...('😀'.repeat(512))].length,512);
  assert.equal(values.redactStructuredValue('x'.repeat(65537)).length,65547);
  assert.throws(()=>task.buildRuntimeAgentTask({},'😀'.repeat(513)),/RUNTIME_RESULT_FILE_PATH_TOO_LONG/);
});

test('newly reachable unsupported KubeClaw support authority cannot be silently excluded',()=>{
  const f=fixture();try{
    const extra='skills/new-contract.ts';fs.mkdirSync(path.dirname(path.join(f.root,extra)),{recursive:true});fs.writeFileSync(path.join(f.root,extra),'export interface Selected { readonly secretRule: string }');
    fs.writeFileSync(path.join(f.root,'skills/common/plugin-runtime/sdk/src/index.ts'),"import type {Selected} from '../../../../new-contract.ts'; export type Original = { value: Selected };\n");
    assert.throws(()=>discoverSdkSurface(f),/SDK_SUPPORT_SOURCE_UNSUPPORTED:skills\/new-contract.ts:Selected/);
  }finally{f.dispose();}
});


test('generated redaction marker remains a literal, not a local Markdown destination',()=>{
  const unsafe='[truncated] (65547 output units)';
  assert.deepEqual(markdownInlineLinks(unsafe).map(link=>link.destination),['65547 output units']);
  const result=generateSdkReference({root,revision});
  const section=result.generatedMarkdown.split('## redactStructuredValue\n')[1].split('\n## ')[0];
  assert.ok(section.includes('65536-UTF-16-code-unit prefix, followed by `[truncated]` (65547 output units)'));
  assert.ok(!markdownInlineLinks(section).some(link=>link.destination.includes('65547')));
  // The actual parser must still discover the section's genuine pinned source links.
  assert.ok(markdownInlineLinks(section).some(link=>link.destination.includes('/blob/'+revision+'/')));
});





function stagingFixture(run) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'docs-sdk-staging-'));
  try {
    const product=path.join(base,'product');fs.mkdirSync(product);
    const sentinel=path.join(product,'sentinel');fs.writeFileSync(sentinel,'unchanged product');
    run({base,product,sentinel});
  } finally { fs.rmSync(base,{recursive:true,force:true}); }
}

for(const scenario of ['directory-link','output-link','dangling-output-link','root-link','nested-ancestor-link','unsafe-output','existing-output','existing-directory']) {
  test(`SDK staging custody rejects ${scenario} before rendering or mutation`,()=>stagingFixture(({base,product,sentinel})=>{
    let root=product;let output=path.join(base,'stage');
    if(scenario==='directory-link')fs.symlinkSync(product,output,'dir');
    if(['output-link','dangling-output-link','unsafe-output','existing-output','existing-directory'].includes(scenario)){
      fs.mkdirSync(output);
      const file=path.join(output,'sdk-exports.md');
      if(scenario==='output-link')fs.symlinkSync(sentinel,file);
      if(scenario==='dangling-output-link')fs.symlinkSync(path.join(product,'missing'),file);
      if(scenario==='unsafe-output')fs.mkdirSync(file);
      if(scenario==='existing-output')fs.writeFileSync(file,'prior stage');
    }
    if(scenario==='root-link'){root=path.join(base,'root-link');fs.symlinkSync(product,root,'dir');output=path.join(product,'child');}
    if(scenario==='nested-ancestor-link'){const link=path.join(base,'ancestor');fs.symlinkSync(product,link,'dir');output=path.join(link,'new','child');}
    const before=fs.readdirSync(product).sort();let rendered=0;
    assert.throws(()=>stageSdkReference({root,output,render:()=>{rendered++;throw new Error('RENDER_MUST_NOT_RUN');}}),error=>error.message!=='RENDER_MUST_NOT_RUN'&&(/SDK_REFERENCE_STAGE_/.test(error.message)||error.code==='EEXIST'));
    assert.equal(rendered,0);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged product');
    assert.deepEqual(fs.readdirSync(product).sort(),before);
    assert.ok(!fs.existsSync(path.join(output,'sdk-reference.json')));
    if(scenario==='existing-output')assert.equal(fs.readFileSync(path.join(output,'sdk-exports.md'),'utf8'),'prior stage');
    if(scenario==='dangling-output-link')assert.ok(fs.lstatSync(path.join(output,'sdk-exports.md')).isSymbolicLink());
  }));
}

test('SDK staging custody writes finite outputs to a safe fresh external stage',()=>stagingFixture(({base,product,sentinel})=>{
  const output=path.join(base,'fresh');let rendered=0;
  const result=stageSdkReference({root:product,output,render:()=>{rendered++;return {inventory:{exports:[]},generatedMarkdown:'# fixture\n'};}});
  assert.equal(rendered,1);assert.equal(result.stagePath,output);
  assert.equal(fs.readFileSync(path.join(output,'sdk-reference.json'),'utf8'),'{\n  "exports": []\n}\n');
  assert.equal(fs.readFileSync(path.join(output,'sdk-exports.md'),'utf8'),'# fixture\n');
  assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged product');
  assert.deepEqual(fs.readdirSync(product),['sentinel']);
  assert.throws(()=>stageSdkReference({root:product,output,render:()=>{throw new Error('RENDER_MUST_NOT_RUN');}}),/SDK_REFERENCE_STAGE_OUTPUT_EXISTS/);
}));
