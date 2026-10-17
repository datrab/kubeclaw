import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { publishedServiceConfig } from './fixtures/published-config.mjs';

test('original bridge refuses volatile admission and unavailable durable Control with authenticated central startup',async t=>{
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const f=await publishedServiceConfig(t,'prism-agent-bridge',{agentBridge:{port,controlUrl:'http://127.0.0.1:1',maximumRequestBytes:2000000,dispatchTimeoutMs:30000,controlRequestTimeoutMs:10000,pollIntervalMs:1000}});
 const engine=join(f.code,'skills/packages/prism-engine/server');
 const {loadAgentBridgeConfig}=await import(pathToFileURL(join(engine,'agent-bridge-config.ts')).href);
 const {startAgentBridge}=await import(pathToFileURL(join(engine,'agent-bridge.mjs')).href);
 const bridge=await startAgentBridge(loadAgentBridgeConfig(f.capture,{}));t.after(()=>bridge.close());
 const request=await fetch(`http://127.0.0.1:${port}/v1/design-set`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'project',preferences:{generationId:'forged',snapshotDigest:'sha256:forged',snapshot:{},request:{}}})});
 assert.equal(request.status,422);assert.match(await request.text(),/durable Control jobId is required/);
 const persisted=await fetch(`http://127.0.0.1:${port}/v1/revise`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:'01234567-1234-1234-1234-123456789abc'})});
 assert.equal(persisted.status,422,'there is no accepted ACK when persistence cannot be verified');
});
