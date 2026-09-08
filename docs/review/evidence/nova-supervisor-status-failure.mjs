import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-supervisor-review-'));
try {
 const args=['scripts/supervise-repository-review.mjs','--workdir',process.cwd(),'--platform',path.join(root,'missing-platform.json'),'--graph',path.join(root,'graph.json'),'--run-id','review:status-failure','--heartbeat',path.join(root,'heartbeat.json'),'--resource-log',path.join(root,'resources.jsonl'),'--diagnostic-dir',path.join(root,'diagnostics'),'--log',path.join(root,'pipeline.log'),'--initial-mode','start','--max-recoveries','0'];
 const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});
 assert.equal(child.status,0,child.stderr);
 assert.equal(child.stdout,'');assert.equal(child.stderr,'');
 assert.equal(fs.existsSync(path.join(root,'pipeline.log')),false);
 console.log(JSON.stringify({probe:'original-supervisor-missing-platform',exit:child.status,stdoutEmpty:true,stderrEmpty:true,pipelineLogCreated:false}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
