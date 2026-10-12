import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import {createHmac} from 'node:crypto';
import {createControlServer} from '../../../../skills/prism/server/control-server.ts';
import {mintSession} from '../../../../skills/prism/control/session.ts';
import {controlPolicyFixture} from '../../../../skills/prism/tests/fixtures/control-policy.mts';
import type {Database} from '../../../../skills/prism/storage/index.ts';

// Actual HTTP handlers/listener/config/crypto. Explicit rejecting DB stub proves
// these boundary cases never reach SQL; it is not a transaction/database test.
test('independent public/auth/CSRF/raw signature/error and cross-request boundaries', async t => {
 let queries=0;
 const pool={query:async()=>{queries++;throw new Error('UNEXPECTED_DATABASE');}} as unknown as Database;
 const fixture=controlPolicyFixture(t,{port:23459});
 const server=await createControlServer(pool,{...fixture,PRISM_SESSION_SECRET:'session',PRISM_INGRESS_SECRET:'ingress',PRISM_DISPATCH_SECRET:'dispatch',PRISM_WORKER_SECRET:'worker',PRISM_INGESTION_SECRET:'ingestion'});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
 const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 async function check(path:string,init:RequestInit,status:number,error?:string){const r=await fetch(base+path,init);assert.equal(r.status,status);const data=await r.json() as {error?:string};if(error)assert.equal(data.error,error);return data;}
 await check('/health',{},200);
 await check('/unknown',{},422,'invalid session');
 const token=mintSession('review-user','session');const cookie=`prism_session=${token}; prism_csrf=csrf`;
 await check('/unknown',{headers:{cookie}},404,'not found');
 await check('/v1/projects',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'},422,'invalid CSRF token');
 await check('/v1/projects',{method:'POST',headers:{cookie,'x-prism-csrf':'csrf','content-type':'application/json'},body:'{'},400);
 await check('/v1/projects',{method:'POST',headers:{cookie,'x-prism-csrf':'csrf','content-type':'application/json'},body:'{}'},422,'externalId and name are required');
 await check('/v1/session',{method:'POST',headers:{'x-prism-ingress-secret':'ingress','tailscale-user-login':'review@example.test'}},201);
 const raw='{';const signature=createHmac('sha256','dispatch').update('key.'+raw).digest('hex');
 await check('/v1/dispatch',{method:'POST',headers:{'idempotency-key':'key','content-type':'application/json','x-kubeclaw-signature':'v1='+signature},body:raw},400);
 await check('/v1/dispatch',{method:'POST',headers:{'idempotency-key':'key','content-type':'application/json','x-kubeclaw-signature':'v1='+signature},body:' {'},422,'invalid dispatch signature');
 const concurrent=await Promise.all([fetch(base+'/unknown',{headers:{cookie}}),fetch(base+'/unknown'),fetch(base+'/health')]);assert.deepEqual(concurrent.map(r=>r.status),[404,422,200]);
 assert.equal(queries,0);
});
