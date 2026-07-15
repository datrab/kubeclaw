import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTailscalePreviewTarget,
} from '../../../../../skills/buster/pipeline/suites/tailscale-preview.ts';
import tailscalePreviewSuite from '../../../../../skills/buster/pipeline/suites/tailscale-preview.ts';

test('resolveTailscalePreviewTarget consumes passed k8s suite metadata explicitly', () => {
  const target = resolveTailscalePreviewTarget({
    config: {
      tailscale_preview: {
        source_suite: 'k8s',
        expected_text: 'EXPECTED',
        smoke_paths: ['/content/branch-a.html'],
        smoke_expected_text: { '/content/branch-a.html': 'BRANCH_A' },
      },
    },
    suiteResults: {
      k8s: {
        suite: 'k8s',
        status: 'PASS',
        critical: true,
        duration_ms: 1,
        checks_total: 1,
        checks_passed: 1,
        checks_failed: 0,
        findings: [],
        metadata: {
          preview_url: 'https://preview.tail.example.ts.net',
          service_url: 'http://app.test.svc.cluster.local/',
          preview_exposure_provider: 'tailscale-ingress',
          preview_expected_text: 'FROM-K8S',
        },
      },
    },
  });

  assert.deepEqual(target, {
    previewUrl: 'https://preview.tail.example.ts.net',
    contentUrl: 'http://app.test.svc.cluster.local/',
    expectedText: 'EXPECTED',
    sourceSuite: 'k8s',
    provider: 'tailscale-ingress',
    smokePaths: ['/content/branch-a.html'],
    smokeExpectedText: { '/content/branch-a.html': 'BRANCH_A' },
  });
});

test('resolveTailscalePreviewTarget requires k8s suite metadata for k8s source', () => {
  assert.throws(
    () => resolveTailscalePreviewTarget({
      config: { tailscale_preview: { source_suite: 'k8s' } },
      suiteResults: {},
    }),
    /requires the k8s suite to run first/,
  );
});

test('resolveTailscalePreviewTarget supports explicit preview URL source', () => {
  const target = resolveTailscalePreviewTarget({
    config: {
      tailscale_preview: {
        source_suite: 'explicit',
        preview_url: 'https://explicit.tail.example.ts.net',
        expected_text: 'EXPECTED',
      },
    },
  });

  assert.deepEqual(target, {
    previewUrl: 'https://explicit.tail.example.ts.net',
    contentUrl: 'https://explicit.tail.example.ts.net',
    expectedText: 'EXPECTED',
    sourceSuite: 'explicit',
    provider: null,
    smokePaths: [],
    smokeExpectedText: {},
  });
});

test('tailscale preview suite persists static surface production evidence', async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    fetchedUrls.push(String(url));
    const path = new URL(String(url)).pathname;
    if (path === '/content/branch-a.html') return new Response('REAL_E2E_BRANCH_A_CONTENT', { status: 200 });
    if (path === '/assets/branch-b.css') return new Response('#real-e2e-content-branch', { status: 200 });
    return new Response('REAL_E2E_NGINX_OK', { status: 200 });
  };
  try {
    const verdict = await tailscalePreviewSuite({
      config: {
        tailscale_preview: {
          source_suite: 'k8s',
          expected_text: 'REAL_E2E_NGINX_OK',
          smoke_paths: ['/content/branch-a.html', '/assets/branch-b.css'],
          smoke_expected_text: {
            '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT',
            '/assets/branch-b.css': '#real-e2e-content-branch',
          },
        },
      },
      suiteResults: {
        k8s: {
          suite: 'k8s',
          status: 'PASS',
          critical: true,
          duration_ms: 1,
          checks_total: 1,
          checks_passed: 1,
          checks_failed: 0,
          findings: [],
        metadata: {
            preview_url: 'https://preview.tail.example.ts.net/',
            service_url: 'http://app.test.svc.cluster.local/',
            preview_exposure_provider: 'tailscale-ingress',
            preview_expected_text: 'REAL_E2E_NGINX_OK',
          },
        },
      },
    });

    assert.equal(verdict.status, 'PASS');
    assert.equal(fetchedUrls.every((url) => url.startsWith('http://app.test.svc.cluster.local/')), true);
    assert.equal(verdict.metadata.preview_url, 'https://preview.tail.example.ts.net/');
    assert.equal(verdict.metadata.content_url, 'http://app.test.svc.cluster.local/');
    assert.deepEqual(verdict.metadata.static_surface_checks.map((check) => ({
      path: check.path,
      expected_text: check.expected_text,
      passed: check.passed,
    })), [
      { path: '/content/branch-a.html', expected_text: 'REAL_E2E_BRANCH_A_CONTENT', passed: true },
      { path: '/assets/branch-b.css', expected_text: '#real-e2e-content-branch', passed: true },
    ]);
    assert.equal(verdict.metadata.checks.some((check) => check.name === 'static-surface-checks' && check.passed), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
