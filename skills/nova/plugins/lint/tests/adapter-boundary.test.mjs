import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-lint-adapter-'));
const repositoryRoot = path.join(temporary, 'repository');
const policyRoot = path.join(temporary, 'policy');
const outsideRoot = path.join(temporary, 'outside');
fs.mkdirSync(repositoryRoot, { recursive: true });
fs.mkdirSync(policyRoot, { recursive: true });
fs.mkdirSync(outsideRoot, { recursive: true });

const { activate } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
const adapter = activate({
  registrationId: 'kubeclaw.lint:executor',
  packageIdentity: {
    id: 'kubeclaw.lint',
    version: '1.0.0',
    digest: `sha256:${'0'.repeat(64)}`,
  },
  config: {
    allowedRepositoryRoots: [repositoryRoot],
    allowedPolicyRoots: [policyRoot],
  },
});

const request = {
  requestId: 'effect:lint:test',
  idempotencyKey: 'lint:test',
  capability: 'lint.execute',
  operation: 'run_report',
  resource: { type: 'lint.project', canonicalId: 'test' },
  payload: {
    workingDirectory: outsideRoot,
    policyPath: path.join(policyRoot, 'policy.json'),
    policyProject: 'test',
    tier: 'pre-check',
  },
};

try {
  await adapter.ready();
  await assert.rejects(
    adapter.invoke({ request, signal: new AbortController().signal }),
    /LINT_WORKING_DIRECTORY_DENIED/,
  );

  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    adapter.invoke({
      request: {
        ...request,
        payload: { ...request.payload, workingDirectory: repositoryRoot },
      },
      signal: cancelled.signal,
    }),
    /ADAPTER_CANCELLED/,
  );

  await assert.rejects(
    adapter.invoke({
      request: { ...request, capability: 'command.execute' },
      signal: new AbortController().signal,
    }),
    /LINT_OPERATION_UNSUPPORTED/,
  );
} finally {
  await adapter.shutdown();
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'adapter-boundary' }));
