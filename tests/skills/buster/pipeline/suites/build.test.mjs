import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import buildSuite from '../../../../../skills/buster/pipeline/suites/build.ts';
import { resolveRepoDir } from '../../../../../skills/buster/pipeline/suites/repo-paths.ts';
import {
  buildDockerfileBuildCleanupLabelArgs,
  buildPodmanPublishArgs,
  parsePodmanMappedHostPort,
} from '../../../../../skills/buster/pipeline/suites/build.ts';

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

test('buildSuite rejects shorthand Dockerfile FROM images before podman build', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'build-suite-dockerfile-test', String(process.pid));
  const dockerfilePath = path.join(fixtureDir, 'Dockerfile');

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(dockerfilePath, 'FROM node:20-slim\nCMD ["npm", "start"]\n');

  try {
    const verdict = await buildSuite({
      config: {
        serve: {
          type: 'server',
          image: 'docker.io/library/node:20-slim',
          dockerfile: path.relative(repoRoot, dockerfilePath),
          build_context: path.relative(repoRoot, fixtureDir),
        },
      },
      payload: {},
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.findings[0]?.rule, 'dockerfile-from-image');
    assert.match(verdict.findings[0]?.message || '', /FROM "node:20-slim".*fully qualified/);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('build suite publishes container ports on ephemeral localhost host ports', () => {
  assert.deepEqual(buildPodmanPublishArgs(8080), ['-p', '127.0.0.1::8080/tcp']);
});

test('build suite parses mapped host ports reported by podman', () => {
  assert.equal(parsePodmanMappedHostPort('127.0.0.1:43127\n', 8080), 43127);
  assert.equal(parsePodmanMappedHostPort('0.0.0.0:43128->8080/tcp\n', 8080), 43128);
});

test('build suite rejects invalid published container ports', () => {
  assert.throws(() => buildPodmanPublishArgs(0), /serve.port/);
  assert.throws(() => parsePodmanMappedHostPort('127.0.0.1:not-a-port', 8080), /mapped host port/);
});

test('configured Dockerfile images are not labeled as task cleanup resources', () => {
  const payload = {
    project: 'release-project',
    module_id: '01-nginx',
    attempt: 1,
    run_id: 'run-1',
  };

  assert.deepEqual(buildDockerfileBuildCleanupLabelArgs(true, payload), []);
  assert.deepEqual(
    buildDockerfileBuildCleanupLabelArgs(false, payload).slice(0, 1),
    ['--label'],
  );
});
