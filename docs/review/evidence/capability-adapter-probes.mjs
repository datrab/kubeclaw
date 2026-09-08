import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { activate as network } from '../../../skills/common/plugins/network-http/src/adapter.ts';
import { activate as gitAdapter } from '../../../skills/common/plugins/git-workspace/src/adapter.ts';
// Original adapters, actual loopback HTTP and actual temporary Git repository.
// Controlled local peers are protocol fixtures, not a deployed service or remote proof.
const signal = new AbortController().signal;
const invocation = (capability,operation,id,payload,abort=signal)=>({confidential:true,signal:abort,request:{capability,operation,resource:{type:'git.repository',canonicalId:id},payload,idempotencyKey:'probe',attempt:{runId:'run:probe',stageId:'stage:probe',attemptId:'attempt:probe',attemptNumber:1}}});
let sent=0;
const server=http.createServer((req,res)=>{
 res.writeHead(200,{'content-type':'text/plain'}); res.flushHeaders();
 if(req.url==='/slow') { res.write('a'); const t=setTimeout(()=>res.end('b'),1000);res.on('close',()=>clearTimeout(t)); }
 else {let n=0; const timer=setInterval(()=>{n++;sent+=64;res.write('x'.repeat(64));if(n===8){clearInterval(timer);res.end();}},15);res.on('close',()=>clearInterval(timer));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
try {
 const adapter=network({config:{allowedOrigins:[origin],maxResponseBytes:128,timeoutMs:2000}});
 await assert.rejects(adapter.invoke(invocation('network.http','request',origin+'/large',{})),/NETWORK_RESPONSE_SIZE_EXCEEDED/);
 assert.equal(sent,512); console.log(JSON.stringify({probe:'http-budget',maximum:128,actualSentBeforeRejection:sent}));
 const timed=network({config:{allowedOrigins:[origin],timeoutMs:200,maxResponseBytes:128}});
 let timeout;try{await timed.invoke(invocation('network.http','request',origin+'/slow',{}));}catch(e){timeout=e;}
 assert(timeout);assert.notEqual(timeout.message,'NETWORK_TIMEOUT'); console.log(JSON.stringify({probe:'http-body-timeout',name:timeout.name,message:timeout.message}));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'capability-git-probe-'));
try {
 const repo=path.join(root,'repo'),workspaces=path.join(root,'workspaces');fs.mkdirSync(repo);fs.mkdirSync(workspaces);
 const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:repo,stdio:'pipe',encoding:'utf8'});
 git('init','-b','main');fs.writeFileSync(path.join(repo,'large.txt'),'x'.repeat(1024));git('add','large.txt');git('-c','user.name=Review','-c','user.email=review@example.test','commit','-m','fixture');
 const adapter=gitAdapter({config:{allowedRepositoryRoots:[repo],workspaceRoot:workspaces,gitExecutable:'/usr/bin/git',authorName:'Review',authorEmail:'review@example.test',maxExecutionMs:3000,maxOutputBytes:128,terminationGraceMs:25}});
 const outcome=await adapter.invoke(invocation('git.sync','sync_paths',repo,{ref:'main',paths:['large.txt']}));
 assert.deepEqual(outcome,{synced:[],missing:['large.txt']});console.log(JSON.stringify({probe:'git-existing-file-output-limit',outcome}));
 const controller=new AbortController();controller.abort();
 const cancelled=await adapter.invoke(invocation('git.sync','sync_paths',repo,{ref:'main',paths:['large.txt']},controller.signal));
 assert.deepEqual(cancelled,{synced:[],missing:['large.txt']});console.log(JSON.stringify({probe:'git-cancel-disposition',outcome:cancelled}));await adapter.shutdown();
}finally{fs.rmSync(root,{recursive:true,force:true});}
const { CommandRunner }=await import('../../../skills/common/plugins/command-runner/src/runner.ts');
const commandRunner=new CommandRunner({maxOutputBytes:1024,maxExecutionMs:200,terminationGraceMs:25});
const started=Date.now();
let commandResult,commandError;
try {commandResult=await commandRunner.run({executable:'/bin/sh',args:['-c','/bin/sleep 1.2 &'],cwd:os.tmpdir(),environment:{}},signal);}catch(e){commandError=e;}
const elapsed=Date.now()-started;
console.log(JSON.stringify({probe:'command-timing-diagnostic',elapsedMs:elapsed,error:commandError?.message}));
assert(elapsed>900);assert.equal(commandError?.message,'COMMAND_TIMEOUT');
console.log(JSON.stringify({probe:'command-exited-parent-open-child-pipes',maxExecutionMs:200,graceMs:25,elapsedMs:elapsed,error:commandError.message}));
await commandRunner.shutdown();
