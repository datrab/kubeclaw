import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
for (const [name, value] of Object.entries({ BUSTER_V2_MAX_ACTIVE_JOBS:'2', BUSTER_V2_MAX_QUEUED_JOBS:'8', BUSTER_V2_MAX_CONCURRENT_ATTEMPTS:'64' })) {
 const env = { ...process.env, SWARM_CONFIG:path.resolve('charts/kubeclaw/files/config/swarm.config.json'), [name]:value }; delete env.NODE_TEST_CONTEXT;
 const result = spawnSync(process.execPath, ['skills/buster/engine/remote-plan-cli.ts','--config','/unused-runtime.json'], {env,encoding:'utf8',timeout:15000});
 assert.equal(result.error,undefined); assert.equal(result.signal,null); assert.equal(result.status,1);
 assert.ok(result.stderr.includes('SWARM_CONFIG_LEGACY_OVERRIDE:'+name),result.stderr);
 assert.doesNotMatch(result.stderr,/EBADF|ENOENT|BUSTER_SERVICE_IDENTITY_REQUIRED/);
 console.log(JSON.stringify({name,value,exitCode:result.status,error:result.stderr.trim()}));
}
