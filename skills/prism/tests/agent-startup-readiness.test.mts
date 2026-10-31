import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {AgentJobRunner} from '../server/agent-job-runner.mjs';
test('bridge leaves work unclaimed until Gateway readiness, then admits exactly once',async()=>{
 let ready=false,claims=0;
 const server=createServer((request,response)=>{claims++;response.setHeader('content-type','application/json');response.end(JSON.stringify({job:null}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();assert(address&&typeof address!=='string');
 const runner=new AgentJobRunner(`http://127.0.0.1:${address.port}`,async()=>ready);
 try{await runner.tick();await runner.tick();assert.equal(claims,0);ready=true;await runner.tick();assert.equal(claims,1);await runner.stop();await runner.tick();assert.equal(claims,1);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
