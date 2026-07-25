import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import apiSuite from '../../../../../skills/buster/pipeline/suites/api.ts';
import { resolveRepoDir } from '../../../../../skills/buster/pipeline/suites/repo-paths.ts';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function runApiFixture({ name, spec, server = null, port = 1 }) {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'api-suite-test', String(process.pid), name);
  const specPath = path.join(fixtureDir, 'api.json');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const actualPort = server ? await listen(server) : port;
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  try {
    return await apiSuite({
      config: {
        serve: { port: actualPort },
        api: { spec_file: path.relative(repoRoot, specPath), thresholds: { max_failures: 0 } },
      },
      logSink: null,
    });
  } finally {
    if (server) await close(server);
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

test('apiSuite interpolates templated default headers from auth setup variables', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/auth') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: 'resolved-token' }));
      return;
    }

    if (req.url === '/protected') {
      const authorized = req.headers.authorization === 'Bearer resolved-token';
      res.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authorized }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const verdict = await runApiFixture({ name: 'default-header-auth', server, spec: {
    setup: { auth_endpoint: '/auth', token_path: 'token' },
    defaults: {
      headers: { Authorization: 'Bearer {{token}}' },
    },
    tests: [
      {
        name: 'protected endpoint',
        method: 'GET',
        path: '/protected',
        expect: {
          status: 200,
          body_contains: { authorized: true },
        },
      },
    ],
  } });
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.checks_failed, 0);
  assert.equal(verdict.findings.length, 0);
});

test('apiSuite reports missing template variables in default headers', async () => {
  const verdict = await runApiFixture({ name: 'missing-default-header-var', spec: {
    defaults: {
      headers: { Authorization: 'Bearer {{token}}' },
    },
    tests: [
      {
        name: 'protected endpoint',
        method: 'GET',
        path: '/protected',
        expect: { status: 200 },
      },
    ],
  } });
  assert.equal(verdict.status, 'FAIL');
  assert.equal(verdict.checks_failed, 1);
  assert.equal(verdict.findings[0]?.rule, 'api-template-variable');
  assert.match(verdict.findings[0]?.message || '', /Missing API template variable\(s\): token/);
});

test('apiSuite lets per-test headers override templated default headers before variable checks', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/public') {
      const authorized = req.headers.authorization === 'Bearer literal';
      res.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authorized }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const verdict = await runApiFixture({ name: 'override-default-header-var', server, spec: {
    defaults: {
      headers: { Authorization: 'Bearer {{token}}' },
    },
    tests: [
      {
        name: 'public override',
        method: 'GET',
        path: '/public',
        headers: { Authorization: 'Bearer literal' },
        expect: {
          status: 200,
          body_contains: { authorized: true },
        },
      },
    ],
  } });
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.checks_failed, 0);
  assert.equal(verdict.findings.length, 0);
});
