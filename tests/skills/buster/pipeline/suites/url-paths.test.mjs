import assert from 'node:assert/strict';
import test from 'node:test';

import a11ySuite from '../../../../../skills/buster/pipeline/suites/a11y.ts';
import healthSuite from '../../../../../skills/buster/pipeline/suites/health.ts';
import securitySuite from '../../../../../skills/buster/pipeline/suites/security.ts';
import { buildLocalhostSuiteUrl } from '../../../../../skills/buster/pipeline/suites/url-paths.ts';

test('a11ySuite rejects authority-like paths before browser work', async () => {
  const verdict = await a11ySuite({
    config: { serve: { port: 4321 }, a11y: { path: '//example.test/' } },
    logSink: null,
  });

  assert.equal(verdict.status, 'ERROR');
  assert.match(verdict.error, /a11y\.path/);
});

test('healthSuite rejects escaped health and smoke paths before fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response('', { status: 200 });
  };

  try {
    const healthVerdict = await healthSuite({
      config: { serve: { port: 4321, health_path: '@example.test/' } },
      logSink: null,
    });
    const smokeVerdict = await healthSuite({
      config: { serve: { port: 4321, health_path: '/', smoke_paths: ['//example.test/'] } },
      logSink: null,
    });

    assert.equal(healthVerdict.status, 'ERROR');
    assert.match(healthVerdict.error, /serve\.health_path/);
    assert.equal(smokeVerdict.status, 'ERROR');
    assert.match(smokeVerdict.error, /serve\.smoke_paths/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('healthSuite validates smoke paths with HTTP checks only', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(String(url).endsWith('/content/branch-a.html') ? 'REAL_E2E_BRANCH_A_CONTENT' : 'ok', { status: 200 });
  };

  try {
    const verdict = await healthSuite({
      config: { serve: { port: 4321, health_path: '/', smoke_paths: ['/content/branch-a.html'], smoke_expected_text: { '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT' } } },
      logSink: null,
    });

    assert.equal(verdict.status, 'PASS');
    assert.deepEqual(urls, [
      'http://localhost:4321/',
      'http://localhost:4321/content/branch-a.html',
    ]);
    assert.deepEqual(verdict.metadata.smoke_paths, ['/content/branch-a.html']);
    assert.deepEqual(verdict.metadata.smoke_expected_text, { '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('healthSuite fails smoke checks when expected response text is missing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('wrong body', { status: 200 });

  try {
    const verdict = await healthSuite({
      config: { serve: { port: 4321, health_path: '/', smoke_paths: ['/content/branch-a.html'], smoke_expected_text: { '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT' } } },
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.findings.some((finding) => finding.rule === 'smoke-response-text'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('securitySuite rejects escaped paths before fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response('', { status: 200 });
  };

  try {
    const verdict = await securitySuite({
      config: { serve: { type: 'static', port: 4321 }, security: { paths: ['@example.test/'] } },
      logSink: null,
    });

    assert.equal(verdict.status, 'ERROR');
    assert.match(verdict.error, /security\.paths/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildLocalhostSuiteUrl allows at signs inside localhost paths', () => {
  assert.equal(
    buildLocalhostSuiteUrl(4321, '/users/@me', 'serve.smoke_paths[0]'),
    'http://localhost:4321/users/@me',
  );
  assert.equal(
    buildLocalhostSuiteUrl(4321, '/@vite/client', 'serve.smoke_paths[0]'),
    'http://localhost:4321/@vite/client',
  );
});

test('buildLocalhostSuiteUrl rejects ports before constructing the localhost base URL', () => {
  assert.throws(
    () => buildLocalhostSuiteUrl('@attacker.example', '/', 'serve.health_path'),
    /localhost suite port/,
  );
  assert.throws(
    () => buildLocalhostSuiteUrl('4321@attacker.example', '/', 'serve.health_path'),
    /localhost suite port/,
  );
  assert.throws(
    () => buildLocalhostSuiteUrl(65536, '/', 'serve.health_path'),
    /localhost suite port/,
  );
  assert.equal(buildLocalhostSuiteUrl('4321', '/', 'serve.health_path'), 'http://localhost:4321/');
});
