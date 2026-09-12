import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { fixture } from './fixtures/review-supervisor.mjs';

const repository = path.resolve(import.meta.dirname, '../..');

for (const [target, diagnosticFailure] of [['resources.jsonl', false], ['heartbeat.json', false], ['resources.jsonl', true]]) {
  test(`original supervisor handles ${target} write failure with diagnosticFailure=${diagnosticFailure}`, { timeout: 15000 }, async t => {
    const f = fixture(t); f.writePlatform();
    let requests = 0;
    const server = http.createServer((request, response) => {
      assert.equal(request.url, '/healthz');
      requests += 1;
      // This real filesystem change happens after the original status reader
      // and process launch, when the original heartbeat reaches its HTTP probe.
      fs.mkdirSync(path.join(f.root, target), { recursive: true });
      if (diagnosticFailure) fs.writeFileSync(path.join(f.root, 'diagnostics'), 'original diagnostic path conflict');
      response.writeHead(200).end('ok');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const file = name => path.join(f.root, name);
    const child = spawn(process.execPath, [path.join(repository, 'scripts/supervise-repository-review.mjs'),
      '--workdir', repository, '--platform', f.platform, '--graph', file('graph.json'),
      '--run-id', 'supervisor-status-regression', '--heartbeat', file('heartbeat.json'),
      '--resource-log', file('resources.jsonl'), '--diagnostic-dir', file('diagnostics'),
      '--log', file('pipeline.log'), '--lease', f.lease, '--max-recoveries', '0',
      '--gateway-url', `http://127.0.0.1:${server.address().port}`],
    { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const exited = once(child, 'exit');
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    });
    const [code, signal] = await exited;
    assert.equal(code, 1, stderr);
    assert.equal(signal, null, stderr);
    assert.equal(stdout, '');
    assert.match(stderr, /EISDIR/u);
    assert(requests > 0);
    assert.equal(fs.existsSync(f.lease), false);
    if (diagnosticFailure) {
      assert.match(stderr, /REVIEW_SUPERVISOR_DIAGNOSTIC_FAILED/u);
      assert.match(stderr, /EEXIST/u);
      assert.equal(fs.readFileSync(file('diagnostics'), 'utf8'), 'original diagnostic path conflict');
      return;
    }
    const diagnostic = JSON.parse(fs.readFileSync(file('diagnostics/attempt-1-exit.json'), 'utf8'));
    assert(diagnostic.exit.code !== null || diagnostic.exit.signal !== null, 'actual child exit was observed');
    assert.equal(diagnostic.heartbeatError.code, 'EISDIR');
  });
}
