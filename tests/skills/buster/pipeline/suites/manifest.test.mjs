import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import manifestSuite from '../../../../../skills/buster/pipeline/suites/manifest.ts';
import { resolveRepoDir } from '../../../../../skills/buster/pipeline/suites/repo-paths.ts';

test('manifestSuite validates a Deployment after a Service in multi-document YAML', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'manifest-suite-test', String(process.pid));
  const manifestPath = path.join(fixtureDir, 'multi-doc.yaml');
  const manifestRel = path.relative(repoRoot, manifestPath);

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(manifestPath, `
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  selector:
    app: app
  ports:
    - port: 80
      targetPort: 3000
---
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
            - name: NODE_ENV
              value: production
          resources:
            limits:
              cpu: "1"
              memory: 256Mi
`);

  try {
    const verdict = await manifestSuite({
      config: {
        manifest: {
          deployment_yaml: manifestRel,
          required_env: ['NODE_ENV'],
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'PASS');
    assert.deepEqual(verdict.metadata.images, ['registry.example.com/app:test']);
    assert.equal(verdict.metadata.env_count, 1);
    assert.equal(verdict.metadata.workload_count, 1);
    assert.equal(verdict.findings.length, 0);
  } finally {
    fs.rmSync(path.join(repoRoot, '.swarm', 'manifest-suite-test', String(process.pid)), { recursive: true, force: true });
  }
});

test('manifestSuite reports explicit enforced mode without requiring max_issues threshold', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'manifest-suite-test', `${process.pid}-enforced`);
  const manifestPath = path.join(fixtureDir, 'enforced.yaml');
  const manifestRel = path.relative(repoRoot, manifestPath);

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(manifestPath, `
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
          resources:
            limits:
              cpu: "1"
              memory: 256Mi
`);

  try {
    const verdict = await manifestSuite({
      config: {
        manifest: {
          deployment_yaml: manifestRel,
          enforced: true,
          thresholds: {
            max_missing_env: 0,
          },
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'PASS');
    assert.equal(verdict.metadata.enforced, true);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('manifestSuite counts failed validation categories, not individual findings', async () => {
  const repoRoot = resolveRepoDir();
  const fixtureDir = path.join(repoRoot, '.swarm', 'manifest-suite-test', `${process.pid}-multi-finding`);
  const manifestPath = path.join(fixtureDir, 'missing-env.yaml');
  const manifestRel = path.relative(repoRoot, manifestPath);

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(manifestPath, `
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
          resources:
            limits:
              cpu: "1"
              memory: 256Mi
`);

  try {
    const verdict = await manifestSuite({
      config: {
        manifest: {
          deployment_yaml: manifestRel,
          required_env: ['NODE_ENV', 'API_TOKEN'],
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.checks_total, 6);
    assert.equal(verdict.checks_failed, 1);
    assert.equal(verdict.checks_passed, 5);
    assert.equal(verdict.findings.filter((finding) => finding.rule === 'required-env').length, 2);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
