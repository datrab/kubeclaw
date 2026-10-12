/** Genuine discovered child provider: the only cluster access is context.invoke IPC. */
export function provider() {
  return { async execute(invocation, context) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const assert = (await import('node:assert/strict')).default;
    const config = invocation.configuration.values;
    const request = structuredClone(config.request);
    if (config.capability === 'kubernetes.fixture' || config.capability === 'kubernetes.runtime-security') {
      request.payload.manifestPath = path.join(context.workspaceRoot, invocation.workspace.repository, 'checked.yaml');
      assert.equal(fs.readFileSync(request.payload.manifestPath, 'utf8'), config.manifest);
    }
    const result = await context.invoke(config.capability, request);
    if (config.capability === 'kubernetes.runtime-security') assert.equal(result.scanner, 'kubernetes-runtime-security');
    else assert.equal(result.ok, true);
    assert.equal(result.namespace, config.request.payload.namespace ?? config.request.payload.namespaceName);
    if (config.capability === 'kubernetes.exposure') assert.equal(result.hostname, config.hostname);
    fs.writeFileSync(path.join(context.workspaceRoot, invocation.workspace.evidence, 'cluster-proof.json'), JSON.stringify({ pid: process.pid, result }));
    return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'actual cluster capability completed',
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
      evidenceFiles: [{ evidenceId: 'cluster-proof', type: 'log', file: 'cluster-proof.json', mediaType: 'application/json' }],
      reports: [], outputs: [], exitCode: 0, signal: null, providerDetails: null };
  }, async cleanup() {} };
}
