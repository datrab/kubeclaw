import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ESLint } from '../../../../node_modules/eslint/lib/api.js';
const root=process.cwd();
const file=path.join(root,'scripts/browser-archive-lock.mjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'browser-cleanup-review-'));
try {
 const current=await import(pathToFileURL(file));
 const previousFile=path.join(temp,'previous.mjs');
 fs.copyFileSync('docs/review/evidence/independent-browser-archives-20260921/corrected-source-snapshots/01-browser-archive-lock.mjs.snapshot',previousFile);
 const previous=await import(pathToFileURL(previousFile));
 const manifest=JSON.parse(fs.readFileSync('versions.json')); const pkg=JSON.parse(fs.readFileSync('package-lock.json'));
 const cases=[['valid',()=>{},true],['minimum',m=>m.browserArchives.amd64[0].size=1,true],['maximum',m=>m.browserArchives.amd64[0].size=1024**3,true],['overmaximum',m=>m.browserArchives.amd64[0].size=1024**3+1,false],['zero',m=>m.browserArchives.amd64[0].size=0,false],['fraction',m=>m.browserArchives.amd64[0].size=1.5,false],['hash',m=>m.browserArchives.amd64[0].sha256='z'.repeat(64),false],['extra',m=>m.browserArchives.amd64[0].extra=true,false],['url',m=>m.browserArchives.amd64[0].url='https://example.org/a.zip',false],['traversal',m=>m.browserArchives.amd64[0].executable='../bin/browser',false],['absolute',m=>m.browserArchives.amd64[0].executable='/bin/browser',false],['directory',m=>m.browserArchives.amd64[0].directory='../x',false],['order',m=>m.browserArchives.amd64.reverse(),false],['architecture',m=>delete m.browserArchives.arm64,false]];
 const outcome=(module,m)=>{try{return {ok:true,value:module.browserLock(m,pkg)}}catch(e){return {ok:false,name:e.name,message:e.message}}};
 for(const [name,edit,valid] of cases){const m=structuredClone(manifest);edit(m);const a=outcome(current,m);assert.equal(a.ok,valid,name);assert.deepEqual(a,outcome(previous,m),name);console.log('validator parity PASS',name);}
 const mutantFile=path.join(temp,'mutant.mjs');fs.writeFileSync(mutantFile,fs.readFileSync(file,'utf8').replace('entry.size > maximumArchiveBytes','entry.size > Number.MAX_SAFE_INTEGER'));const mutant=await import(pathToFileURL(mutantFile));const oversized=structuredClone(manifest);oversized.browserArchives.amd64[0].size=1024**3+1;assert.equal(outcome(current,oversized).ok,false);assert.equal(outcome(mutant,oversized).ok,true);console.log('validator upper-bound mutant DETECTED');
 const require=createRequire(pathToFileURL(file));assert.equal(require.resolve('../node_modules/playwright-core/lib/coreBundle.js'),require.resolve(path.join(root,'node_modules/playwright-core/lib/coreBundle.js')));assert.equal(typeof require('../node_modules/playwright-core/lib/coreBundle.js').utils.extractZip,'function');console.log('actual literal bundle resolution PASS');
 const eslint=new ESLint({overrideConfigFile:path.join(root,'charts/kubeclaw/files/config/eslint.config.mjs')});
 for(const module of ['scripts/browser-archive-lock.mjs','scripts/updates/runtime-inputs.mjs']){const config=await eslint.calculateConfigForFile(module);assert.equal(config.rules['discipline/no-direct-env-access'][0],0);for(const rule of ['complexity','discipline/no-env-default','discipline/no-dynamic-module-loading','discipline/no-fallback-chain'])assert.equal(config.rules[rule][0],2,rule);console.log('effective exact boundary PASS',module);}
 assert.equal((await eslint.calculateConfigForFile('scripts/unlisted-adapter.mjs')).rules['discipline/no-direct-env-access'][0],2);console.log('unlisted sibling stays restricted PASS');
 const gitRoot=path.join(temp,'git');fs.mkdirSync(gitRoot);const git=(...args)=>execFileSync('git',['-C',gitRoot,...args],{encoding:'utf8'}).trim();git('init','-q');fs.mkdirSync(path.join(gitRoot,'docker'));fs.writeFileSync(path.join(gitRoot,'docker/input'),'first');const commit=()=>{git('add','.');git('-c','user.name=Review','-c','user.email=review@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD')};const first=commit();fs.writeFileSync(path.join(gitRoot,'docker/input'),'second');const head=commit();
 const cli=path.join(root,'scripts/updates/runtime-inputs.mjs'); const oldCli=path.join(temp,'old-cli.mjs');fs.copyFileSync('docs/review/evidence/independent-browser-archives-20260921/corrected-source-snapshots/02-runtime-inputs.mjs.snapshot',oldCli);
 for(const [name,eventName,event,want] of [['manual','workflow_dispatch',{before:'bad'},true],['absent','push',{},true],['zero','push',{before:'0'.repeat(40)},true],['unchanged','push',{before:head},false],['changed','push',{before:first},true],['pull-request','pull_request',{before:head,pull_request:{base:{sha:first}}},true]]){fs.writeFileSync(path.join(temp,'event.json'),JSON.stringify(event));const outputs=[];for(const source of [cli,oldCli]){const out=path.join(temp,'output');fs.writeFileSync(out,'');execFileSync(process.execPath,[source],{cwd:gitRoot,env:{...process.env,GITHUB_EVENT_NAME:eventName,GITHUB_EVENT_PATH:path.join(temp,'event.json'),GITHUB_SHA:head,GITHUB_OUTPUT:out}});outputs.push(fs.readFileSync(out,'utf8'));}assert.equal(outputs[0],outputs[1],name);assert.equal(outputs[0],`image_inputs=${want}\ndeployment_inputs=${want}\n`,name);console.log('actual entrypoint parity PASS',name);}
} finally {fs.rmSync(temp,{recursive:true,force:true});}
