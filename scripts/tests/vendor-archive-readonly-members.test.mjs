import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../vendor-external-helm-authorities.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function readChartFiles('),source.indexOf('function pullChart('));
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
function reader(spawn=spawnSync){return vm.runInNewContext(body+'\nreadChartFiles;', {assert,fs,path,sha256,spawnSync:spawn});}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vendor-member-controls-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'fixture'));const input=path.join(root,'fixture/values.yaml');const archive=path.join(root,'chart.tar');
 fs.writeFileSync(input,'first');assert.equal(spawnSync('tar',['-cf',archive,'-C',root,'fixture']).status,0);
 for(const text of ['middle','last']){fs.writeFileSync(input,text);assert.equal(spawnSync('tar',['-rf',archive,'-C',root,'fixture/values.yaml']).status,0);}
 fs.writeFileSync(path.join(root,'fixture/one.yaml'),'singleton');assert.equal(spawnSync('tar',['-rf',archive,'-C',root,'fixture/one.yaml']).status,0);
 const gz=archive+'.gz';fs.writeFileSync(gz,gzipSync(fs.readFileSync(archive)));return {root,archive:gz,chart:{archiveSha256:sha256(fs.readFileSync(gz))}};
}
test('real repeated regular members match original final extraction, singleton and cache',t=>{
 const f=fixture(t),destination=path.join(f.root,'extracted');fs.mkdirSync(destination);assert.equal(spawnSync('tar',['-xzf',f.archive,'-C',destination]).status,0);
 let reads=0;const files=reader((command,args,options)=>{if(args[0]==='-xOzf')reads++;return spawnSync(command,args,options);})('fixture',f.chart,f.archive);
 assert.equal(files.names.length,2);assert.equal(files.read('values.yaml').toString(),'last');assert.deepEqual(files.read('values.yaml'),fs.readFileSync(path.join(destination,'fixture/values.yaml')));assert.equal(reads,1);assert.equal(files.read('one.yaml').toString(),'singleton');assert.equal(reads,2);assert.throws(()=>files.read('missing.yaml'),/missing/);
});
test('digest and child failures do not mint cached member bytes',t=>{
 const f=fixture(t);assert.throws(()=>reader()('fixture',{archiveSha256:'0'.repeat(64)},f.archive),/digest/);
 assert.throws(()=>reader(()=>({status:1,stderr:'list failed'}))('fixture',f.chart,f.archive),/listing failed/);
 let reads=0;const files=reader((command,args,options)=>{if(args[0]==='-xOzf'){reads++;return {status:1,stdout:Buffer.from('partial')};}return spawnSync(command,args,options);})('fixture',f.chart,f.archive);
 for(let n=0;n<2;n++)assert.throws(()=>files.read('values.yaml'),/member read failed/);assert.equal(reads,2);
});
test('nonregular members and traversing paths are rejected, not materialized',t=>{
 const f=fixture(t);const real=spawnSync;
 for(const [argsPrefix,stdout,message] of [['-tvzf','lrwxrwxrwx owner/group link\n',/nonregular/],['-tzf','../fixture/values.yaml\n',/canonical/]])assert.throws(()=>reader((command,args,options)=>args[0]===argsPrefix?{status:0,stdout}:real(command,args,options))('fixture',f.chart,f.archive),message);
});
