import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectFinalPreviewDeliveries,
  deliverFinalPreviews,
  formatPreviewCredentialCommandForDiscord,
  formatPreviewCredentialsForDiscord,
} from '../../../../../skills/nova/pipeline/services/preview-delivery.ts';

test('collectFinalPreviewDeliveries reads final-preview k8s verdict metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-delivery-'));
  const testsDir = path.join(root, '.swarm', 'modules', '01-app', 'tests');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, 'verdict-attempt-1.json'), JSON.stringify({
    suites: {
      k8s: {
        suite: 'k8s',
        status: 'PASS',
        metadata: {
          purpose: 'final-preview',
          preview_url: 'https://app.tailnet.ts.net',
          preview_exposure_phase: 'Ready',
          preview_exposure_hostname: 'app',
          preview_credentials_ref: 'secret/app-preview-login',
          preview_credentials_available: true,
          preview_credentials_command: "for k in 'username' 'password'; do printf '%s: ' \"$k\"; kubectl -n 'kubeclaw' get secret 'app-preview-login' -o \"go-template={{ index .data \\\"$k\\\" | base64decode }}\"; printf '\\n'; done",
          service_url: 'http://app.buster.svc.cluster.local:3000/health',
          test_namespace: 'buster-app-final',
          cleanup_policy: 'keep',
        },
      },
    },
  }, null, 2));

  const deliveries = collectFinalPreviewDeliveries({
    paths: { swarm_dir: path.join(root, '.swarm') },
  }, {
    modules: {
      '01': { title: 'App', dir: '01-app' },
    },
  });

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].module_id, '01');
  assert.equal(deliveries[0].preview_url, 'https://app.tailnet.ts.net');
  assert.equal(deliveries[0].credentials_ref, 'secret/app-preview-login');
  assert.equal(deliveries[0].credentials_available, true);
  assert.equal(deliveries[0].credentials_command.includes("kubectl -n 'kubeclaw' get secret 'app-preview-login'"), true);
  assert.equal(deliveries[0].credentials, null);
});

test('formatPreviewCredentialsForDiscord avoids password-key labels', () => {
  assert.equal(
    formatPreviewCredentialsForDiscord({ username: 'raven', password: 'correct-horse-bootstrap' }),
    'Login ID: raven\nAccess Code: correct-horse-bootstrap',
  );
});

test('formatPreviewCredentialCommandForDiscord wraps the helper as copy-paste shell', () => {
  assert.equal(
    formatPreviewCredentialCommandForDiscord("kubectl -n 'kubeclaw' get secret 'app-preview-login'"),
    "```bash\nkubectl -n 'kubeclaw' get secret 'app-preview-login'\n```",
  );
});

test('deliverFinalPreviews sends Discord URL, credential helper, and credential reference', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-discord-'));
  const testsDir = path.join(root, '.swarm', 'modules', '01-app', 'tests');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, 'k8s-verdict-attempt-1.json'), JSON.stringify({
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://app.tailnet.ts.net',
      preview_exposure_phase: 'Ready',
      preview_credentials_ref: 'secret/app-preview-login',
      preview_credentials_available: true,
      preview_credentials_command: "for k in 'username' 'password'; do printf '%s: ' \"$k\"; kubectl -n 'kubeclaw' get secret 'app-preview-login' -o \"go-template={{ index .data \\\"$k\\\" | base64decode }}\"; printf '\\n'; done",
      test_namespace: 'buster-app-final',
      cleanup_policy: 'keep',
    },
  }, null, 2));
  const calls = [];

  await deliverFinalPreviews({
    project: 'preview-project',
    _runId: 'run-preview-1',
    paths: { swarm_dir: path.join(root, '.swarm') },
  }, {
    modules: {
      '01': { title: 'App', dir: '01-app' },
    },
  }, {
    discord: async (_config, level, title, description, fields) => {
      calls.push({ level, title, description, fields });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'OK');
  assert.equal(calls[0].title, 'Final Preview Ready: preview-project');
  assert.equal(calls[0].fields.some((field) => field.name === 'Preview URL' && field.value === 'https://app.tailnet.ts.net'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Preview Login'), false);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential Command' && field.value.includes("kubectl -n 'kubeclaw' get secret 'app-preview-login'")), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential Ref' && field.value === 'secret/app-preview-login'), true);
});
