import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {loadOpsMcpConfig} from '../src/config.mjs';
import {captureOpsMcpPolicy} from '../src/policy.mjs';
import {getHubbleFlows,queryWindow} from '../src/hubble.mjs';
const owner=()=>({schemaVersion:'ops-mcp-policy.v1',server:{host:'127.0.0.1',port:0,localOnly:true,defaultNamespace:'kubeclaw',argoNamespace:'argocd',namespaces:['kubeclaw'],allowedOrigins:[]},kubernetes:{timeoutMs:10000,maxBytes:8388608},hubble:{binary:'/usr/local/bin/hubble',server:'hubble-relay.cilium.svc.cluster.local:4245',timeout:12000,maxConcurrentQueries:2,defaultWindowMs:300000,maxWindowMs:900000,maxRawBytes:2097152,maxOutputBytes:196608,maxSummaryBytes:8192,maxStderrBytes:4096},presentation:{maxLogBytes:65536,eventPageSize:500},supervisor:{"controlSocketProbeTimeoutSeconds": 0.5, "controlStartupTimeoutSeconds": 20, "controlStartupPollSeconds": 0.2, "loginStatusTimeoutSeconds": 15, "loginRetryWaitSeconds": 5, "controlHealthPollSeconds": 2, "controlTerminationTimeoutSeconds": 10, "restartWaitSeconds": 10}});
const fixture=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-policy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,file:path.join(dir,'policy.json')};};
test('selected complete owner freezes A/B, rejects partial owners and duplicate legacy authors, keeps original loader',t=>{
 const {file}=fixture(t);const value=owner();fs.writeFileSync(file,JSON.stringify(value));const a=loadOpsMcpConfig({OPS_MCP_POLICY_FILE:file});value.presentation.maxLogBytes=100;fs.writeFileSync(file,JSON.stringify(value));const b=loadOpsMcpConfig({OPS_MCP_POLICY_FILE:file});fs.unlinkSync(file);
 assert.equal(a.presentation.maxLogBytes,65536);assert.equal(b.presentation.maxLogBytes,100);assert(Object.isFrozen(a.selectedPolicy.hubble));assert.throws(()=>loadOpsMcpConfig({OPS_MCP_POLICY_FILE:file}));
 for(const key of ['PORT','HOST','OPS_LOCAL_ONLY','OPS_DEFAULT_NAMESPACE','ARGOCD_NAMESPACE','OPS_ALLOWED_NAMESPACES','MCP_ALLOWED_ORIGINS','HUBBLE_BIN','HUBBLE_SERVER'])assert.throws(()=>loadOpsMcpConfig({OPS_MCP_POLICY_FILE:file,[key]:'same'}),/COMPETING_AUTHOR/);
 for(const section of ['server','kubernetes','hubble','presentation','supervisor'])for(const key of Object.keys(owner()[section])){const v=owner();delete v[section][key];assert.throws(()=>captureOpsMcpPolicy(v));}
 const invalid=owner();invalid.hubble.defaultWindowMs=invalid.hubble.maxWindowMs+1;assert.throws(()=>captureOpsMcpPolicy(invalid),/WINDOW_INVALID/);
 assert.equal(loadOpsMcpConfig({}).port,8080);
});
test('real server captures selected file before listening; missing owner never falls back',async t=>{
 const {file}=fixture(t);fs.writeFileSync(file,JSON.stringify(owner()));const env={...process.env};for(const k of ['PORT','HOST','OPS_LOCAL_ONLY','OPS_DEFAULT_NAMESPACE','ARGOCD_NAMESPACE','OPS_ALLOWED_NAMESPACES','MCP_ALLOWED_ORIGINS','HUBBLE_BIN','HUBBLE_SERVER'])delete env[k];
 const child=spawn(process.execPath,[new URL('../src/policy-server.mjs',import.meta.url).pathname],{env:{...env,OPS_MCP_POLICY_FILE:file,OPS_MCP_BEARER_TOKEN:'test-only-'+ 'x'.repeat(32)},stdio:['ignore','ignore','pipe']});t.after(()=>child.kill('SIGTERM'));
 const port=await new Promise((resolve,reject)=>{let error='';const timer=setTimeout(()=>reject(new Error('startup timeout '+error)),5000);child.once('exit',code=>{clearTimeout(timer);reject(new Error('startup '+code+' '+error));});child.stderr.on('data',data=>{error+=data;const m=/127\.0\.0\.1:(\d+)\/mcp/.exec(error);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});
 fs.unlinkSync(file);assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status,200);assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`)).status,401);
});
test('real Hubble child uses selected raw/summary limits and query windows',async t=>{
 const {dir}=fixture(t),binary=path.join(dir,'hubble');const event=JSON.stringify({flow:{time:'2026-10-16T00:00:00Z',source:{namespace:'kubeclaw'},Summary:'x'.repeat(100)}});
 fs.writeFileSync(binary,'#!/usr/bin/env node\nconsole.log('+JSON.stringify(event)+');',{mode:0o755});const a=owner();a.hubble.binary=binary;a.hubble.maxSummaryBytes=10;const b=structuredClone(a);b.hubble.maxSummaryBytes=20;
 const args={namespace:'kubeclaw',limit:10,startTime:'2026-10-16T00:00:00Z',endTime:'2026-10-16T00:01:00Z'};const summarize=({flow})=>({summary:flow.Summary});
 assert.equal((await getHubbleFlows(args,summarize,captureOpsMcpPolicy(a).hubble)).flows[0].summary.length,10);assert.equal((await getHubbleFlows(args,summarize,captureOpsMcpPolicy(b).hubble)).flows[0].summary.length,20);
 b.hubble.maxRawBytes=10;const limited=await getHubbleFlows(args,summarize,captureOpsMcpPolicy(b).hubble);assert(limited.rawBytesRead<=10);assert(limited.reasons.includes('raw_byte_limit'));
 const p=captureOpsMcpPolicy(a);assert.throws(()=>queryWindow(args,Date.now(),{...p.hubble,maxWindowMs:1000}));
});
