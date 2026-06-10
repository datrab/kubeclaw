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

test('apiSuite interpolates templated default headers from auth setup variables', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'api-suite-test', String(process.pid), 'default-header-auth');
  const specPath = path.join(fixtureDir, 'api.json');

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

  fs.mkdirSync(fixtureDir, { recursive: true });
  const port = await listen(server);
  fs.writeFileSync(specPath, JSON.stringify({
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
  }, null, 2));

  try {
    const verdict = await apiSuite({
      config: {
        serve: { port },
        api: {
          spec_file: path.relative(repoRoot, specPath),
          thresholds: { max_failures: 0 },
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'PASS');
    assert.equal(verdict.checks_failed, 0);
    assert.equal(verdict.findings.length, 0);
  } finally {
    await close(server);
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('apiSuite reports missing template variables in default headers', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'api-suite-test', String(process.pid), 'missing-default-header-var');
  const specPath = path.join(fixtureDir, 'api.json');

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(specPath, JSON.stringify({
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
  }, null, 2));

  try {
    const verdict = await apiSuite({
      config: {
        serve: { port: 1 },
        api: {
          spec_file: path.relative(repoRoot, specPath),
          thresholds: { max_failures: 0 },
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.checks_failed, 1);
    assert.equal(verdict.findings[0]?.rule, 'api-template-variable');
    assert.match(verdict.findings[0]?.message || '', /Missing API template variable\(s\): token/);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('apiSuite lets per-test headers override templated default headers before variable checks', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'api-suite-test', String(process.pid), 'override-default-header-var');
  const specPath = path.join(fixtureDir, 'api.json');

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

  fs.mkdirSync(fixtureDir, { recursive: true });
  const port = await listen(server);
  fs.writeFileSync(specPath, JSON.stringify({
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
  }, null, 2));

  try {
    const verdict = await apiSuite({
      config: {
        serve: { port },
        api: {
          spec_file: path.relative(repoRoot, specPath),
          thresholds: { max_failures: 0 },
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'PASS');
    assert.equal(verdict.checks_failed, 0);
    assert.equal(verdict.findings.length, 0);
  } finally {
    await close(server);
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
