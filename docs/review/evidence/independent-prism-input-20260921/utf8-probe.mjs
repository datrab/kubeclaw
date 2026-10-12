import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const load = p => import(pathToFileURL(path.resolve(p)).href);
const {loadWorkerConfig} = await load('skills/prism/server/worker-config.ts');
const {createWorkerServer} = await load('skills/prism/server/worker-service.ts');
const {nativePrismCommand} = await load('skills/prism/server/native-worker-execution.ts');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-input-'));
let server;
try {
  const authored = JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/swarm.config.json'));
  authored.operator.prism.worker.maximumInputBytes = 6;
  const file = path.join(temporary, 'swarm.json'); fs.writeFileSync(file, JSON.stringify(authored));
  const config = loadWorkerConfig({SWARM_CONFIG:file, WORKER_TRUST_SPIFFE_ENABLED:'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID:'spiffe://local/control'});
  // Mutating the authored file after startup must not alter the captured snapshot.
  authored.operator.prism.worker.maximumInputBytes = 2147483647; fs.writeFileSync(file, JSON.stringify(authored));
  let executed = 0;
  server = createWorkerServer({mode:'spiffe', trustedControlSpiffeId:config.trustedControlSpiffeId}, {ready:()=>true,execute:async()=>{executed++;throw Error('unexpected');}}, config.ingress);
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  async function request(chunks) {
    return new Promise((resolve,reject)=>{
      const request = http.request({host:'127.0.0.1',port:server.address().port,path:'/v1/attempts',method:'POST',headers:{'content-type':'application/json'}}, response=>{
        let data=''; response.on('data', chunk=>{data+=chunk});response.on('end',()=>resolve({status:response.statusCode,...JSON.parse(data)}));
      });request.on('error',reject); for(const chunk of chunks) request.write(chunk);request.end();
    });
  }
  const exact = await request(['€','€']);assert.equal(exact.status,422);assert.match(exact.error,/^WORKER_TRUST_/);
  const over = await request(['€','€','x']);assert.equal(over.status,422);assert.equal(over.error,'Prism attempt request is too large');assert.equal(executed,0);
  const command = nativePrismCommand({launcher:'/not-used',uid:1000,gid:1000,engineContentDigest:`sha256:${'a'.repeat(64)}`,browserPath:'/not-used',maximumInputBytes:config.ingress.maximumInputBytes},config);
  for(const [input,pattern] of [['€€',/SyntaxError/],['€€x',/Error: PRISM_NATIVE_INPUT_LIMIT\n/]]){
    const child=spawnSync(command.executable,command.arguments,{cwd:command.cwd,env:{...command.environment,KUBECLAW_NATIVE_SCOPE:'/parser-only'},input,encoding:'utf8',timeout:10000});
    assert.equal(child.error,undefined);assert.notEqual(child.status,0);assert.match(child.stderr,pattern);
  }
  console.log('PASS: chunked UTF-8 is measured in bytes at actual HTTP and child stdin; startup snapshot survives author-file mutation; execution never invoked. No native isolation claim.');
} finally {if(server) await server.shutdown(5000);fs.rmSync(temporary,{recursive:true,force:true});}
