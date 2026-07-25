import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectFinalPreviewDeliveries,
  deliverFinalPreviews,
  FinalPreviewDeliveryError,
  formatPreviewCredentialCommandForDiscord,
  formatPreviewCredentialsForDiscord,
} from '../../../../../skills/nova/pipeline/services/preview-delivery.ts';

function finalPreviewProgress({ outputFile = true } = {}) {
  return {
    gates: {
      'final-buster': {
        type: 'buster',
        title: 'Final Buster',
        ...(outputFile ? { output_file: 'buster-test/FINAL-BUSTER-RESULT.json' } : {}),
        test_config: {
          k8s: {
            purpose: 'final-preview',
            preview: { provider: 'tailscale-ingress' },
          },
        },
      },
    },
  };
}

function writePreviewResult(prefix, result) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const swarmDir = path.join(root, '.swarm');
  const outputFile = path.join(swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  return { root, swarmDir };
}

function previewRuntimeConfig(swarmDir) {
  return {
    project: 'preview-project',
    _runId: 'run-preview-1',
    paths: { swarm_dir: swarmDir },
  };
}

async function capturePreviewDelivery(swarmDir) {
  const calls = [];
  await deliverFinalPreviews(previewRuntimeConfig(swarmDir), finalPreviewProgress(), {
    discord: async (_config, level, title, description, fields) => {
      calls.push({ level, title, description, fields });
    },
  });
  return calls;
}

function rejectsPreviewDelivery(swarmDir, failureClass, discord) {
  return assert.rejects(
    () => deliverFinalPreviews(previewRuntimeConfig(swarmDir), finalPreviewProgress(), { discord }),
    (error) => error instanceof FinalPreviewDeliveryError && error.failure_class === failureClass,
  );
}

test('collectFinalPreviewDeliveries reads final-buster k8s verdict metadata', () => {
  const { swarmDir } = writePreviewResult('preview-delivery-', {
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
          preview_credentials: { username: 'raven', password: 'correct-horse-bootstrap' },
          service_url: 'http://app.buster.svc.cluster.local:3000/health',
          test_namespace: 'buster-app-final',
          cleanup_policy: 'keep',
        },
      },
    },
  });

  const deliveries = collectFinalPreviewDeliveries({
    paths: { swarm_dir: swarmDir },
  }, finalPreviewProgress());

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].gate_id, 'final-buster');
  assert.equal(deliveries[0].preview_url, 'https://app.tailnet.ts.net');
  assert.equal(deliveries[0].credentials_ref, 'secret/app-preview-login');
  assert.equal(deliveries[0].credentials_available, true);
  assert.equal(deliveries[0].credentials_command.includes("kubectl -n 'kubeclaw' get secret 'app-preview-login'"), true);
  assert.deepEqual(deliveries[0].credentials, { username: 'raven', password: 'correct-horse-bootstrap' });
  assert.equal(deliveries[0].credential_state, 'revealed');
});

test('collectFinalPreviewDeliveries reads canonical gate output_file', () => {
  const { swarmDir } = writePreviewResult('preview-output-file-', {
    suites: {
      k8s: {
        suite: 'k8s',
        status: 'PASS',
        metadata: {
          purpose: 'final-preview',
          preview_url: 'https://output-file.tailnet.ts.net',
          preview_credentials_available: false,
          cleanup_policy: 'keep',
        },
      },
    },
  });

  const deliveries = collectFinalPreviewDeliveries({
    paths: { swarm_dir: swarmDir },
  }, finalPreviewProgress());

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].preview_url, 'https://output-file.tailnet.ts.net');
  assert.equal(deliveries[0].credential_state, 'not_configured');
});

test('collectFinalPreviewDeliveries does not read noncanonical Buster tests log directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-tests-dir-'));
  const testsDir = path.join(root, '.swarm', 'logs', 'gates', 'final-buster', 'tests');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, 'k8s-verdict-attempt-1.json'), JSON.stringify({
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://tests-dir.tailnet.ts.net',
      preview_credentials_available: false,
      test_credentials: [],
      cleanup_policy: 'keep',
    },
  }, null, 2));

  const deliveries = collectFinalPreviewDeliveries({
    paths: { swarm_dir: path.join(root, '.swarm') },
  }, {
    gates: {
      'final-buster': {
        type: 'buster',
        title: 'Final Buster',
        test_config: {
          k8s: {
            purpose: 'final-preview',
            preview: { provider: 'tailscale-ingress' },
          },
        },
      },
    },
  });

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].preview_url, null);
  assert.equal(deliveries[0].unavailable_reason, 'final-buster output_file verdict was not recorded');
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
  const { swarmDir } = writePreviewResult('preview-discord-', {
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://app.tailnet.ts.net',
      preview_exposure_phase: 'Ready',
      preview_credentials_ref: 'secret/app-preview-login',
      preview_credentials_available: true,
      preview_credentials_command: "for k in 'username' 'password'; do printf '%s: ' \"$k\"; kubectl -n 'kubeclaw' get secret 'app-preview-login' -o \"go-template={{ index .data \\\"$k\\\" | base64decode }}\"; printf '\\n'; done",
      preview_credentials: { username: 'raven', password: 'correct-horse-bootstrap' },
      test_namespace: 'buster-app-final',
      cleanup_policy: 'keep',
    },
  });
  const calls = await capturePreviewDelivery(swarmDir);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'OK');
  assert.equal(calls[0].title, 'Final Preview Ready: preview-project');
  assert.equal(calls[0].fields.some((field) => field.name === 'Preview URL' && field.value === 'https://app.tailnet.ts.net'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential State' && field.value === 'Credentials revealed below'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Preview Login' && field.value === 'Login ID: raven\nAccess Code: correct-horse-bootstrap'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential Command' && field.value.includes("kubectl -n 'kubeclaw' get secret 'app-preview-login'")), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential Ref' && field.value === 'secret/app-preview-login'), true);
});

test('deliverFinalPreviews reads final-preview gate verdicts and reports no credentials configured', async () => {
  const { swarmDir } = writePreviewResult('preview-gate-discord-', {
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://final.tailnet.ts.net',
      preview_exposure_phase: 'Ready',
      test_namespace: 'buster-final',
      cleanup_policy: 'keep',
    },
  });
  const calls = await capturePreviewDelivery(swarmDir);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'OK');
  assert.equal(calls[0].fields.some((field) => field.name === 'Gate' && field.value === 'final-buster - Final Buster'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Preview URL' && field.value === 'https://final.tailnet.ts.net'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential State' && field.value === 'No credentials configured'), true);
});

test('deliverFinalPreviews reports credential command state', async () => {
  const { swarmDir } = writePreviewResult('preview-command-state-', {
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://final.tailnet.ts.net',
      preview_credentials_command: "kubectl -n 'kubeclaw' get secret 'app-preview-login'",
      test_namespace: 'buster-final',
      cleanup_policy: 'keep',
    },
  });
  const calls = await capturePreviewDelivery(swarmDir);

  assert.equal(calls[0].fields.some((field) => field.name === 'Credential State' && field.value === 'Credential command available'), true);
  assert.equal(calls[0].fields.some((field) => field.name === 'Credential Command' && field.value.includes("kubectl -n 'kubeclaw' get secret 'app-preview-login'")), true);
});

test('collectFinalPreviewDeliveries reports unavailable configured credentials', () => {
  const { swarmDir } = writePreviewResult('preview-unavailable-creds-', {
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://final.tailnet.ts.net',
      preview_credentials_ref: 'secret/app-preview-login',
      preview_credentials_available: false,
      test_namespace: 'buster-final',
      cleanup_policy: 'keep',
    },
  });

  const deliveries = collectFinalPreviewDeliveries({
    paths: { swarm_dir: swarmDir },
  }, finalPreviewProgress());

  assert.equal(deliveries[0].credential_state, 'configured_unavailable');
});

test('deliverFinalPreviews fails configured final-preview target without recorded URL', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-missing-discord-'));
  const calls = [];

  await assert.rejects(
    () => deliverFinalPreviews({
      project: 'preview-project',
      _runId: 'run-preview-1',
      paths: { swarm_dir: path.join(root, '.swarm') },
    }, {
      gates: {
        'final-buster': {
          type: 'buster',
          title: 'Final Buster',
          test_config: {
            k8s: {
              purpose: 'final-preview',
              preview: { provider: 'tailscale-ingress' },
            },
          },
        },
      },
    }, {
      discord: async (_config, level, title, description, fields) => {
        calls.push({ level, title, description, fields });
      },
    }),
    (error) => error instanceof FinalPreviewDeliveryError
      && error.failure_class === 'final_preview_url_missing',
  );

  assert.equal(calls.length, 0);
});

test('deliverFinalPreviews rejects final-buster k8s verdict without final-preview purpose', async () => {
  const { swarmDir } = writePreviewResult('preview-wrong-purpose-', {
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'pretest',
      preview_url: 'https://final.tailnet.ts.net',
      test_namespace: 'buster-final',
      cleanup_policy: 'keep',
    },
  });

  await rejectsPreviewDelivery(swarmDir, 'final_preview_verdict_not_final_preview', async () => {});
});

test('deliverFinalPreviews fails when final-buster Discord delivery fails', async () => {
  const { swarmDir } = writePreviewResult('preview-discord-failure-', {
    suite: 'k8s',
    status: 'PASS',
    metadata: {
      purpose: 'final-preview',
      preview_url: 'https://final.tailnet.ts.net',
      preview_exposure_phase: 'Ready',
      test_namespace: 'buster-final',
      cleanup_policy: 'keep',
    },
  });

  await rejectsPreviewDelivery(swarmDir, 'final_preview_delivery_failed', async () => {
    throw new Error('discord send failed');
  });
});
