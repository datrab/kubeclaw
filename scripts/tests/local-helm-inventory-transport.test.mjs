import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const local = fs.readFileSync(new URL('../generate-local-helm-authorities.mjs', import.meta.url),'utf8');
const config = fs.readFileSync(new URL('../docs-configuration-inventory.mjs', import.meta.url),'utf8');
const transport = local.slice(local.indexOf('const root = process.cwd();'), local.indexOf('const digest = '));
function consumer(response, only = false) {
 let acquisition;
 const context = { assert, path, process: {cwd:()=>'/fixture',execPath:'/node',argv: only ? ['--helm-values-only']:[]}, fs: {existsSync:()=>true,readFileSync:()=> '{}'}, spawnSync:(...args)=>{acquisition=args;return response;} };
 const result=vm.runInNewContext(transport+'\n({inventory,runtimeInventory});',context);
 return { result, acquisition };
}
const values={files:[]}, runtime={environment:[]};
for (const only of [false,true]) test(`exact fresh inventory envelope and inherited mode ${only}`,()=>{
 const name=only?'configuration-helm-values.json':'configuration-values.json';
 const {result,acquisition}=consumer({status:0,stdout:JSON.stringify([[name,values],['configuration-runtime-inputs.json',runtime]])},only);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{inventory:values,runtimeInventory:only?null:runtime});
 assert.equal(acquisition[0],'/node');assert.equal(acquisition[1].includes('--inventory-stdout'),true);
 assert.equal(acquisition[1].includes('--allow-semantic-gaps'),true);assert.equal(acquisition[1].includes('--allow-local-helm-authority-maintenance'),true);
 assert.equal(acquisition[1].includes('--out-dir'),false);assert.equal(acquisition[1].includes('--helm-values-only'),only);
 assert.equal(acquisition[2].maxBuffer,128*1024*1024);
});
for (const [name,response] of [
 ['child failure',{status:1,stdout:'[]',stderr:'failure'}],['signal',{status:null,signal:'SIGTERM',stdout:'[]'}],
 ['buffer overflow',{status:null,error:new Error('ENOBUFS')}],['malformed',{status:0,stdout:'[['}],
 ['missing',{status:0,stdout:'[]'}],['duplicate',{status:0,stdout:JSON.stringify([['configuration-values.json',values],['configuration-values.json',values]])}],
 ['invalid entry',{status:0,stdout:JSON.stringify([['configuration-values.json',null]])}],
]) test(`reject ${name} before registry derivation`,()=>assert.throws(()=>consumer(response)));
const stdoutBranch=config.slice(config.indexOf('if (inventoryStdout) {'),config.indexOf('const stale = [];'));
for (const failure of ['none','builder','stdout']) test(`stdout builds once and waits: ${failure}`,async()=>{
 const expected=[['configuration-values.json',{text:'x'.repeat(1024*1024)}]];let builds=0,emitted='',exited=false,callback;
 const context={inventoryStdout:true,JSON,Promise,buildConfigurationInventories:()=>{builds++;if(failure==='builder')throw Error('builder');return new Map(expected);},process:{stdout:{write:(text,cb)=>{emitted=text;callback=cb;return false;}},exit:()=>{exited=true;}}};
 const pending=vm.runInNewContext('(async()=>{'+stdoutBranch+'})()',context);
 assert.equal(builds,1);assert.equal(exited,false);
 if(failure==='builder'){await assert.rejects(pending,/builder/);assert.equal(emitted,'');return;}
 assert.deepEqual(JSON.parse(emitted),expected);callback(failure==='stdout'?Error('stdout'):null);
 if(failure==='stdout')await assert.rejects(pending,/stdout/);else await pending;
 assert.equal(exited,failure==='none');
});
const flags=config.slice(config.indexOf("const checkOnly = argv.includes('--check');"),config.indexOf('const allowSensitivityFixture'));
for(const conflict of ['--check','--out-dir'])test(`reject conflicting ${conflict} before special modes`,()=>assert.throws(()=>vm.runInNewContext(flags,{assert,argv:['--inventory-stdout',conflict,'--describe-discovery']}),/cannot be combined/));
