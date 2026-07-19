#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inside = process.argv.includes('--inside');
const namespace = process.env.KUBECLAW_NAMESPACE || 'kubeclaw';
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

if (!inside) {
  const pod = execFileSync('kubectl', [
    'get', 'pod', '-n', namespace,
    '-l', 'app.kubernetes.io/instance=agent-buster',
    '-o', 'jsonpath={.items[0].metadata.name}',
  ], { encoding: 'utf8' }).trim();
  if (!pod) throw new Error('deployed Buster pod not found');
  const remoteScript = '/home/node/.openclaw/workspace/git-repo/tests/verification/live/buster-buildkit-production-smoke.mjs';
  execFileSync('kubectl', ['exec', '-n', namespace, pod, '-c', 'buster-pipeline', '--', 'node', remoteScript, '--inside'], { stdio: 'inherit' });
  process.exit(0);
}

const { listGatewaySubagents } = await import('../../../skills/buster/pipeline/integrations/gateway.ts');
const { default: k8sSuite } = await import('../../../skills/buster/pipeline/suites/k8s.ts');
const { cleanupRuntimeResources, CLEANUP_POLICY } = await import('../../../skills/buster/pipeline/services/resource-cleanup.ts');

const suffix = `${Date.now()}-${process.pid}`;
const runId = `live-buildkit-${suffix}`;
const moduleId = 'buildkit-production-smoke';
const fixtureDir = path.join(sourceRoot, '.swarm', 'live-buildkit', suffix);
const dockerfile = path.join(fixtureDir, 'Dockerfile');
const index = path.join(fixtureDir, 'index.html');
const manifest = path.join(fixtureDir, 'deployment.yaml');
const imageName = 'buster-buildkit-smoke';
const serviceName = 'buster-buildkit-smoke';
const payload = { project: 'kubeclaw', module_id: moduleId, attempt: 1, run_id: runId };

fs.mkdirSync(fixtureDir, { recursive: true });
fs.writeFileSync(index, `buildkit production smoke ${suffix}\n`);
fs.writeFileSync(dockerfile, `FROM docker.io/library/nginx:1.27-alpine\nCOPY index.html /usr/share/nginx/html/index.html\n`);
fs.writeFileSync(manifest, `apiVersion: apps/v1
kind: Deployment
metadata: { name: ${serviceName} }
spec:
  replicas: 1
  selector: { matchLabels: { app: ${serviceName} } }
  template:
    metadata: { labels: { app: ${serviceName} } }
    spec:
      containers:
        - name: app
          image: ${imageName}:candidate
          ports: [{ containerPort: 80 }]
---
apiVersion: v1
kind: Service
metadata: { name: ${serviceName} }
spec:
  selector: { app: ${serviceName} }
  ports: [{ port: 80, targetPort: 80 }]
`);

try {
  const gatewayResult = await listGatewaySubagents(15000, { maxRetries: 1, retryDelayMs: 0 });
  assert.ok(gatewayResult, 'colocated Buster gateway tool invocation must succeed');

  const verdict = await k8sSuite({
    payload,
    moduleId,
    repoRoot: sourceRoot,
    config: {
      k8s: {
        image_name: imageName,
        service_name: serviceName,
        dockerfile: path.relative(sourceRoot, dockerfile),
        build_context: path.relative(sourceRoot, fixtureDir),
        manifests: [path.relative(sourceRoot, manifest)],
        port: 80,
        health_path: '/',
        namespace_prefix: 'test',
        cleanup_policy: 'delete',
        ready_timeout_seconds: 180,
        build_timeout_seconds: 600,
        push_timeout_seconds: 300,
      },
    },
  });
  assert.equal(verdict.status, 'PASS', JSON.stringify(verdict.findings));
  assert.match(verdict.metadata?.deployed_image || '', /@sha256:[a-f0-9]{64}$/);
  console.log(JSON.stringify({ ok: true, gateway_tool: true, deployed_image: verdict.metadata.deployed_image, namespace: verdict.metadata.test_namespace }, null, 2));
} finally {
  await cleanupRuntimeResources('live-smoke', payload, { cleanupPolicy: CLEANUP_POLICY.TASK_SCOPED });
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
