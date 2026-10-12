import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import ts from '../../../../node_modules/typescript/lib/typescript.js';
const root=process.cwd(), directory=fs.mkdtempSync(path.join(os.tmpdir(),'buster-original-differential-'));
const file='skills/buster/engine/test-gates/runner.ts';
const previous=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
const parsed=ts.createSourceFile(file,previous,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=['compareText','canonical','validateCounts','validateProviderDetails','validateEvidenceDeclarations','validateProviderReports','reportAdapterEntry'];
const functions=names.map(name=>{const node=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,name);return node.getText(parsed);});
const beginning=previous.indexOf('finalizeResult: async ({ evidence, specialistResult, signal }) => {');
assert.ok(beginning>0);
const from=beginning+'finalizeResult: async ({ evidence, specialistResult, signal }) => {'.length;
const to=previous.indexOf('\n      },\n    };',from);assert.ok(to>from);
const body=previous.slice(from,to).replaceAll('this.#options.registry','registry').replaceAll('this.#reportAdapterRuntime','reportAdapterRuntime');
const absolute=(source,location)=>source.replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,target)=>`from ${quote}${pathToFileURL(path.resolve(path.dirname(location),target)).href}${quote}`);
try {
 fs.symlinkSync(path.join(root,'node_modules'),path.join(directory,'node_modules'));
 const original=`import {E2E_RESULT_SCHEMA_ID,validateE2eProviderDetails,validatePipelineTestGateContract} from '@kubeclaw/pipeline-test-gate-contract';\nimport {finalizeDirectCommandReports} from '${pathToFileURL(path.join(root,'skills/buster/engine/test-gates/report-finalizer.ts')).href}';\nconst MAX_REPORT_RESULTS_BYTES=16*1024*1024;\n${functions.join('\n')}\nexport function validate(entry,result,maximumBytes){const encoded=JSON.stringify(result);if(Buffer.byteLength(encoded)>maximumBytes)throw new Error('TEST_PROVIDER_RESULT_LIMIT');validatePipelineTestGateContract('providerResult',result);validateCounts(result);validateProviderDetails(entry,result);validateEvidenceDeclarations(entry,result.evidenceFiles);validateProviderReports(entry,result);}\nexport async function finalize({node,providerResult,evidence,specialistResult,cleanupTimeoutMs},{registry,reportAdapterRuntime,signal}){${body}\n}\nexport {canonical};\n`;
 fs.writeFileSync(path.join(directory,'original.ts'),original);
 const fixturePath=path.join(root,'skills/buster/engine/test-gates/tests/specialist-boundary.test.ts');
 let fixture=fs.readFileSync(fixturePath,'utf8');fixture=fixture.slice(0,fixture.indexOf("test('"));
 fs.writeFileSync(path.join(directory,'fixture.ts'),absolute(fixture,fixturePath)+'\nexport {provider,input,report,entry,registry};\n');
 const old=await import(pathToFileURL(path.join(directory,'original.ts')));
 const f=await import(pathToFileURL(path.join(directory,'fixture.ts')));
 const current=await import(pathToFileURL(path.join(root,'skills/buster/engine/test-gates/provider-result-validation.ts')));
 const finalizerFile=path.join(root,'skills/buster/engine/test-gates/specialist-report-finalization.ts');
 const next=await import(pathToFileURL(finalizerFile));
 const canon=await import(pathToFileURL(path.join(root,'skills/buster/engine/test-gates/canonical-value.ts')));
 let validations=0,finalizations=0;
 const outcome=fn=>{try {fn();return {ok:true}}catch(e){return {ok:false,name:e.name,message:e.message}}};
 const cases=[['valid',()=>{}],['schema',r=>r.counts={}],['counts',r=>r.counts.total=7],['outcome',r=>r.counts={total:1,passed:0,failed:1,skipped:0}],['reserved',r=>r.evidenceFiles[0].evidenceId='runner-log'],['duplicate-id',r=>r.evidenceFiles.push({...r.evidenceFiles[0],file:'other.xml'})],['duplicate-file',r=>r.evidenceFiles.push({...r.evidenceFiles[0],evidenceId:'other'})],['evidence-type',r=>r.evidenceFiles[0].type='screenshot'],['duplicate-report',r=>r.reports.push({...r.reports[0]})],['missing-report-source',r=>r.reports[0].evidenceId='missing'],['report-format',r=>r.reports[0].format='unsupported'],['non-report-type',r=>r.evidenceFiles[0].type='log']];
 for(const [name,edit] of cases)for(const maximumBytes of [1,10000]){const result=f.provider();edit(result);const before=structuredClone(result);assert.deepEqual(outcome(()=>current.validateBusterProviderResult(f.entry,result,maximumBytes)),outcome(()=>old.validate(f.entry,result,maximumBytes)),name);assert.deepEqual(result,before,name);validations++;}
 for(const value of [null,true,0,'é',[{b:1,a:2}],{'é':1,Z:2,a:{z:1,a:2}}, {nested:[null,false,'a']}])assert.equal(canon.canonical(value),old.canonical(value));
 const run=async(fn,data,fail=false)=>{const calls=[];const signal=new AbortController().signal;const output=()=>f.report(data);let result;
  try {result={ok:true,value:await fn(data,{registry:f.registry,signal,reportAdapterRuntime:{adapt:async(entry,artifact,limits,passedSignal)=>{assert.equal(passedSignal,signal);calls.push({registration:entry.registration,artifact,limits});if(fail)throw new Error('CONTROLLED_ADAPTER_REJECTION');return output();}}})};}
  catch(e){result={ok:false,name:e.name,message:e.message}}return {result,calls};};
 const finalCases=[['valid',()=>{}],['missing-source',d=>d.evidence=[]],['no-provider',d=>d.providerResult=null],['empty-reports',d=>d.providerResult.reports=[]],['exit-code',d=>d.node.configuration.values.resultMode='exit-code'],['no-resolved-adapter',d=>d.node.reportAdapters=[]],['wrong-package',d=>d.node.reportAdapters[0].package.contentDigest='sha256:'+'b'.repeat(64)],['wrong-id',d=>d.node.reportAdapters[0].adapterId='unknown'],['wrong-version',d=>d.node.reportAdapters[0].contractVersion=999],['non-direct',d=>d.node.provider.contractId='other@1'],['tiny-source',d=>d.evidence[0].artifact.sizeBytes=0],['large-source',d=>d.evidence[0].artifact.sizeBytes=128*1024*1024],['short-deadline',d=>d.cleanupTimeoutMs=1],['long-deadline',d=>d.cleanupTimeoutMs=600000]];
 for(const [name,edit] of finalCases)for(const fail of [false,true]){const input=f.input();edit(input);const before=structuredClone(input);assert.deepEqual(await run(next.finalizeBusterReports,input,fail),await run(old.finalize,structuredClone(input),fail),name);assert.deepEqual(input,before,name);finalizations++;}
 const source=fs.readFileSync(finalizerFile,'utf8');const check='&& canonical(candidate.registration.package) === canonical(reference.package)';assert.equal(source.split(check).length,2);
 fs.writeFileSync(path.join(directory,'mutant.ts'),absolute(source.replace(check,''),finalizerFile));
 const mutant=await import(pathToFileURL(path.join(directory,'mutant.ts')));const wrong=f.input();wrong.node.reportAdapters[0].package.contentDigest='sha256:'+'b'.repeat(64);
 const originalResult=await run(next.finalizeBusterReports,wrong),mutatedResult=await run(mutant.finalizeBusterReports,wrong);
 assert.equal(originalResult.result.ok,false);assert.match(originalResult.result.message,/ADAPTER_MISSING/);assert.equal(originalResult.calls.length,0);assert.equal(mutatedResult.calls.length,1);assert.notDeepEqual(mutatedResult,originalResult);
 console.log(JSON.stringify({validations,finalizations,canonicalCases:7,packageIdentityRemovalMutant:'detected: adapter runs for wrong package only in mutant',boundary:'HEAD original bodies with explicit dependency binding, deterministic fake adapter; no native runtime proof'},null,2));
} finally {fs.rmSync(directory,{recursive:true,force:true});}
