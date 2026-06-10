import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import buildSuite from '../../../../../skills/buster/pipeline/suites/build.ts';
import { resolveRepoDir } from '../../../../../skills/buster/pipeline/suites/repo-paths.ts';

test('buildSuite rejects secretKeyRef satisfied by a differently named secret_yaml', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'build-suite-test', String(process.pid));
  const deploymentPath = path.join(fixtureDir, 'deployment.yaml');
  const secretPath = path.join(fixtureDir, 'secret.yaml');

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(deploymentPath, `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
          image: registry.example.com/app:test
          env:
            - name: TOKEN
              valueFrom:
                secretKeyRef:
                  name: prod-secret
                  key: TOKEN
`);
  fs.writeFileSync(secretPath, `
apiVersion: v1
kind: Secret
metadata:
  name: other-secret
data:
  TOKEN: c2VjcmV0
`);

  try {
    const verdict = await buildSuite({
      config: {
        serve: {
          type: 'server',
          image: 'docker.io/library/node:20-slim',
          deployment_yaml: path.relative(repoRoot, deploymentPath),
          secret_yaml: path.relative(repoRoot, secretPath),
        },
      },
      payload: {},
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.findings[0]?.rule, 'serve-secret-ref');
    assert.match(verdict.findings[0]?.message || '', /prod-secret\.TOKEN is not covered by serve\.secret_yaml other-secret/);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
