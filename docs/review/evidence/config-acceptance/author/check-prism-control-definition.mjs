import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mintSession, verifySession } from '../../../../../skills/prism/control/session.ts';
import { body } from '../../../../../skills/prism/server/control-http.ts';

const sources = [import.meta.filename, 'skills/prism/control/session.ts', 'skills/prism/server/control-http.ts', 'package-lock.json'];
const identity = {
  node: process.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {encoding:'utf8'}).trim(),
  sources: sources.map(path => ({path, sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),
};
const observations = [];
// Disposable local signing key; no deployed credential is read, logged or persisted.
const key = randomBytes(32).toString('hex');
const now = 1700000000000;
const token = mintSession('definition-control', key, now);
assert.equal(verifySession(token, key, now + 899999).expiresAt, now + 900000);
assert.deepEqual(verifySession(token, key, now).roles, ['editor']);
observations.push({id:'session-current-positive', result:'passed', expiresAfterMs:900000, roles:['editor']});
assert.throws(() => verifySession(token, key, now + 900000), /expired session/);
observations.push({id:'session-current-expiry-boundary', result:'passed', rejectedAtMs:900000});
assert.throws(() => verifySession(token, `${key}x`, now), /invalid session/);
observations.push({id:'session-current-wrong-signing-key', result:'passed'});

// A genuine loopback HTTP IncomingMessage reaches the unchanged exported parser.
// This is its current default, not a target config loader or complete control service.
const server = createServer(async (request, response) => {
  try { await body(request); response.writeHead(204); response.end(); }
  catch (error) { response.writeHead(400); response.end(String(error.message)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}/`;
  const post = (payload, type='application/json') => fetch(url, {method:'POST', headers:{'content-type':type}, body:payload});
  const exact = JSON.stringify('x'.repeat(1999998));
  assert.equal(Buffer.byteLength(exact), 2000000);
  assert.equal((await post(exact)).status, 204);
  observations.push({id:'body-current-exact-limit-positive', result:'passed', wireBytes:2000000});
  const over = await post(JSON.stringify('x'.repeat(1999999)));
  assert.equal(over.status, 400); assert.equal(await over.text(), 'request too large');
  observations.push({id:'body-current-over-limit-rejection', result:'passed', wireBytes:2000001});
  const wrong = await post('{}', 'text/plain');
  assert.equal(wrong.status, 400); assert.equal(await wrong.text(), 'application/json is required');
  observations.push({id:'body-current-media-type-rejection', result:'passed'});
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
console.log(JSON.stringify({identity, observations, limits:'Six current parser/session definition controls only; no profile migration, cookie projection, DB/replay, target schema, deployment or runtime binding acceptance.'}, null, 2));
