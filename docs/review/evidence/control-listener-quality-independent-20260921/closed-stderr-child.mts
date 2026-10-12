import fs from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createControlServer} from '../../../../skills/prism/server/control-server.ts';
import {mintSession} from '../../../../skills/prism/control/session.ts';
import type {Database} from '../../../../skills/prism/storage/index.ts';
process.on('uncaughtExceptionMonitor', error => fs.writeSync(1, String(error.stack) + '\n'));
const environment={SWARM_CONFIG:new URL('../../../../charts/kubeclaw/files/config/swarm.config.json',import.meta.url).pathname,
 PRISM_SESSION_SECRET:'session',PRISM_INGRESS_SECRET:'ingress',PRISM_DISPATCH_SECRET:'dispatch',PRISM_WORKER_SECRET:'worker',PRISM_INGESTION_SECRET:'ingestion'};
// Real HTTP/crypto/config. DB must never be reached in this boundary probe.
const pool={query:async()=>{throw new Error('UNEXPECTED_DATABASE');}} as unknown as Database;
const server=await createControlServer(pool,environment);server.listen(0,'127.0.0.1');await once(server,'listening');
const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
if (process.env.REVIEW_CLOSED_PIPE === '1') {
 void process.stderr;
 process.stdout.write('READY\n');
 await once(process.stdin, 'data'); process.stdin.pause();
} else {
 process.stderr.write("review logger stream initialized\n");
 server.prependOnceListener("request", () => fs.closeSync(2)); // Avoid descriptor reuse by connect.
}
const unauthenticated=await fetch(base+'/unknown');assert.equal(unauthenticated.status,422);assert.deepEqual(await unauthenticated.json(),{error:'invalid session'});
const cookie=`prism_session=${mintSession('review-user','session')}; prism_csrf=csrf`;
const malformed=await fetch(base+'/v1/projects',{method:'POST',headers:{cookie,'x-prism-csrf':'csrf','content-type':'application/json'},body:'{'});
assert.equal(malformed.status,400);const syntax=await malformed.json() as {error:string};assert.match(syntax.error,/JSON|property name/);
const health=await fetch(base+'/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
await new Promise(resolve=>setImmediate(resolve));
server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
process.stdout.write(JSON.stringify({closedStderr:true,statuses:[422,400,200],alive:true})+'\n');
