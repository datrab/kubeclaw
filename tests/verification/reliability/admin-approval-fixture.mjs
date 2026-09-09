import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';

export async function approvalFixture(root, rejected) {
  const messages = [];
  const server = http.createServer((request, response) => {
    const chunks = []; request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => { messages.push(JSON.parse(Buffer.concat(chunks))); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ id: `receipt:${messages.length}` })); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const repository = path.join(root, 'repository'); fs.mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  const secret = 'NOVA_ADMIN_REPAIR_TEST_TOKEN'; const previous = process.env[secret]; process.env[secret] = 'local-approval-test-only';
  // Freeze only the actual packages used by this graph, independent of unrelated concurrent package edits.
  const installation = path.join(root, 'installed'); fs.mkdirSync(installation);
  for (const source of ['tests/fixtures/admin-repair/source-plugin', 'tests/fixtures/plugin-system-v2/graph-plugin',
    'skills/nova/plugins/human-approval', ...['artifact-store', 'wait-store', 'operator-messaging', 'network-http', 'secret-resolver'].map(name => `skills/common/plugins/${name}`)]) {
    fs.cpSync(path.resolve(source), path.join(installation, path.basename(source)), { recursive: true, filter: file => path.basename(file) !== 'node_modules' });
  }
  fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const roots = [installation];
  const platform = { schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: { 'artifacts.write': 'kubeclaw.artifact-store:artifact-store', 'artifacts.read': 'kubeclaw.artifact-store:artifact-store',
      'signal.wait': 'kubeclaw.wait-store:waits', 'operator.request': 'kubeclaw.operator-messaging:operator',
      'network.http': 'kubeclaw.network-http:http', 'secrets.read': 'kubeclaw.secret-resolver:secrets' },
    grants: { 'test.admin-repair:source': { 'artifacts.write': { allowedNamespaces: ['test.admin-repair'] } },
      'kubeclaw.human-approval:architecture-approval': { 'artifacts.read': { allowedNamespaces: ['test.admin-repair'] },
        'operator.request': { allowedTargets: ['operators'] }, 'signal.wait': { allowedSignalTypes: ['approval.resolved'], allowedIssuerIds: ['operator:test'] } },
      'kubeclaw.operator-messaging:operator': { 'network.http': { allowedOrigins: [origin] }, 'secrets.read': { allowedNames: ['approval-token'] } } },
    adapters: { 'kubeclaw.artifact-store:artifact-store': { artifactRoot: path.join(root, 'artifacts') },
      'kubeclaw.wait-store:waits': { root: path.join(root, 'waits') },
      'kubeclaw.operator-messaging:operator': { deliveryRoot: path.join(root, 'deliveries'), targets: { operators: { endpoint: `${origin}/approval`, tokenSecret: 'approval-token' } } },
      'kubeclaw.network-http:http': { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'] },
      'kubeclaw.secret-resolver:secrets': { environment: { 'approval-token': secret } } },
    activeAdapters: [], observers: {}, storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 5000,
    orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [{ type: 'administrator', id: 'admin:test' }] };
  const execution = { maxAttempts: 10, maxRemediationCycles: 2, timeoutMs: 5000 };
  const source = (id, dependsOn) => ({ id, type: 'test.admin-repair.source', dependsOn, config: { repository, mode: id }, input: {}, execution });
  const definition = { schemaVersion: 'pipeline-definition.v2', id: 'test:admin-real-approval', maxConcurrency: 1, stages: [
    source('source', []), source('review', ['source']), source('sibling', ['source']),
    { id: 'approval', type: 'kubeclaw.decision.architecture-approval', dependsOn: ['review', 'sibling'], execution,
      config: { target: 'operators', issuerId: 'operator:test', timeoutMinutes: 5 },
      input: { summary: 'Approve this architecture.', namespace: 'test.admin-repair', artifactId: 'report:review' }, on: { request_fix: 'source' } },
    { id: 'gate', type: 'test.generic', dependsOn: ['approval', 'sibling'], config: {}, execution,
      input: { mode: rejected ? 'passed' : 'blocked_then_pass' }, on: { request_fix: 'source' } },
  ] };
  return { platform, definition, messages, repository, async close() {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env[secret]; else process.env[secret] = previous;
  } };
}
